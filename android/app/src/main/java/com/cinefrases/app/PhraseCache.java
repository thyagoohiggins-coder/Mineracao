package com.cinefrases.app;

import android.content.Context;

import org.json.JSONArray;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Cópia local das frases, para abrir o app sem internet. */
public final class PhraseCache {
    private PhraseCache() {}

    private static File file(Context c) {
        return new File(c.getFilesDir(), "phrases.json");
    }

    public static List<Phrase> load(Context c) {
        List<Phrase> out = new ArrayList<>();
        File f = file(c);
        if (!f.exists()) return out;
        try {
            JSONArray arr = new JSONArray(ApiClient.readAll(new FileInputStream(f)));
            for (int i = 0; i < arr.length(); i++) out.add(Phrase.fromJson(arr.getJSONObject(i)));
        } catch (Exception ignored) {
            // cache corrompido: ignora
        }
        return out;
    }

    public static void save(Context c, List<Phrase> phrases) {
        JSONArray arr = new JSONArray();
        for (Phrase p : phrases) arr.put(p.toJson());
        File tmp = new File(c.getFilesDir(), "phrases.json.tmp");
        try (FileOutputStream os = new FileOutputStream(tmp)) {
            os.write(arr.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(file(c));
    }

    public static void clear(Context c) {
        //noinspection ResultOfMethodCallIgnored
        file(c).delete();
    }
}
