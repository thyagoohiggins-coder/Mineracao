package com.estudosplus.app;

import java.util.ArrayList;
import java.util.List;

/** Lógica pura do leitor de imagens: limpeza do texto lido e detecção de legendas. Sem dependências do Android. */
public final class OcrText {
    private OcrText() {}

    /** Uma linha reconhecida na imagem, com a caixa em pixels da imagem. */
    public static final class Line {
        public final String text;
        public final int block;          // índice do bloco (parágrafo) a que a linha pertence
        public final float left, top, right, bottom;

        public Line(String text, int block, float left, float top, float right, float bottom) {
            this.text = text == null ? "" : text;
            this.block = block;
            this.left = left;
            this.top = top;
            this.right = right;
            this.bottom = bottom;
        }

        float centerX() { return (left + right) / 2f; }
        float centerY() { return (top + bottom) / 2f; }
    }

    /**
     * Marca as linhas que parecem legenda: centralizadas na horizontal e na parte de baixo da imagem
     * (onde Netflix, YouTube etc. desenham a legenda). Se nada parecer legenda e houver pouco texto,
     * marca tudo; se houver muito texto (um documento, um livro), não marca nada e deixa o usuário escolher.
     */
    public static boolean[] guessSubtitles(List<Line> lines, int imageWidth, int imageHeight) {
        boolean[] sel = new boolean[lines.size()];
        if (lines.isEmpty() || imageWidth <= 0 || imageHeight <= 0) return sel;
        boolean any = false;
        for (int i = 0; i < lines.size(); i++) {
            Line l = lines.get(i);
            boolean low = l.centerY() >= imageHeight * 0.55f;
            boolean centered = Math.abs(l.centerX() - imageWidth / 2f) <= imageWidth * 0.18f;
            boolean notTiny = (l.right - l.left) >= imageWidth * 0.08f;
            if (low && centered && notTiny && isMeaningful(l.text)) {
                sel[i] = true;
                any = true;
            }
        }
        if (!any && lines.size() <= 4) {
            for (int i = 0; i < sel.length; i++) sel[i] = isMeaningful(lines.get(i).text);
        }
        return sel;
    }

    /** Ignora ruído típico de print: relógio, porcentagem de bateria, um ou dois símbolos soltos. */
    static boolean isMeaningful(String text) {
        String t = text.trim();
        if (t.matches("[\\d:.,%\\s|/-]*")) return false; // 21:30, 100%, 1:02:05
        int letters = 0;
        for (int i = 0; i < t.length(); i++) if (Character.isLetter(t.charAt(i))) letters++;
        return letters >= 2;
    }

    /**
     * Junta as linhas escolhidas em texto. Linhas do mesmo bloco viram uma frase só; blocos diferentes
     * ficam separados por uma linha em branco (o usuário pode salvar cada bloco como uma frase).
     */
    public static String compose(List<Line> lines, boolean[] selected) {
        List<List<String>> groups = new ArrayList<>();
        int lastBlock = Integer.MIN_VALUE;
        for (int i = 0; i < lines.size(); i++) {
            if (i >= selected.length || !selected[i]) continue;
            Line l = lines.get(i);
            if (l.block != lastBlock || groups.isEmpty()) {
                groups.add(new ArrayList<>());
                lastBlock = l.block;
            }
            groups.get(groups.size() - 1).add(l.text);
        }
        StringBuilder sb = new StringBuilder();
        for (List<String> g : groups) {
            String phrase = joinLines(g);
            if (phrase.isEmpty()) continue;
            if (sb.length() > 0) sb.append("\n\n");
            sb.append(phrase);
        }
        return sb.toString();
    }

    /** Junta linhas quebradas: desfaz hifenização no fim da linha e limpa marcas de legenda. */
    public static String joinLines(List<String> lines) {
        StringBuilder sb = new StringBuilder();
        for (String raw : lines) {
            String line = cleanLine(raw);
            if (line.isEmpty()) continue;
            if (sb.length() == 0) {
                sb.append(line);
                continue;
            }
            char last = sb.charAt(sb.length() - 1);
            char prev = sb.length() >= 2 ? sb.charAt(sb.length() - 2) : ' ';
            boolean hyphenated = last == '-' && Character.isLetter(prev) && Character.isLowerCase(line.charAt(0));
            if (hyphenated) sb.setLength(sb.length() - 1); // "pala-" + "vra" → "palavra"
            else sb.append(' ');
            sb.append(line);
        }
        return sb.toString().replaceAll("\\s+", " ").trim();
    }

    /** Remove notas musicais, marcações de legenda e espaços sobrando; corrige confusões comuns do OCR. */
    static String cleanLine(String raw) {
        String s = raw == null ? "" : raw;
        s = s.replaceAll("[♪♫♬]", " ");
        s = s.replaceAll("</?[ibu]>", " ");                // <i>itálico</i> vindo de algumas legendas
        s = s.replaceAll("[“”„]", "\"").replaceAll("[‘’]", "'");
        s = s.replaceAll("(?<=\\p{L})\\|(?=\\p{L})", "l"); // pa|avra → palavra
        s = s.replaceAll("^\\|\\s", "I ");                 // "| don't" → "I don't"
        s = s.replaceAll("\\s+([,.!?;:])", "$1");           // "olá ," → "olá,"
        s = s.replaceAll("\\s+", " ").trim();
        return s;
    }

    /** Divide o texto do campo em frases: uma por bloco (separados por linha em branco). */
    public static List<String> splitPhrases(String text, boolean separate) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        if (!separate) {
            String one = text.replaceAll("\\s+", " ").trim();
            if (!one.isEmpty()) out.add(one);
            return out;
        }
        for (String part : text.split("\\n\\s*\\n")) {
            String p = part.replaceAll("\\s+", " ").trim();
            if (!p.isEmpty()) out.add(p);
        }
        return out;
    }

    /** Quantidade de blocos (frases) no texto. */
    public static int countBlocks(String text) {
        return splitPhrases(text, true).size();
    }
}
