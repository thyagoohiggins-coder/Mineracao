package com.estudosplus.app;

import org.json.JSONException;
import org.json.JSONObject;

/** Uma frase copiada pela extensão. */
public class Phrase {
    public String id;
    public String text;
    public String source;
    public String sourceName;
    public String title;
    public Double videoTime; // segundos, pode ser nulo
    public String url;
    public boolean favorite;
    public String note;
    public long createdAt;

    public static Phrase fromJson(JSONObject o) {
        Phrase p = new Phrase();
        p.id = o.optString("id");
        p.text = o.optString("text");
        p.source = o.optString("source", "outro");
        p.sourceName = o.optString("sourceName", "");
        p.title = o.optString("title", "");
        p.videoTime = o.isNull("videoTime") || !o.has("videoTime") ? null : o.optDouble("videoTime");
        p.url = o.optString("url", "");
        p.favorite = o.optBoolean("favorite", false);
        p.note = o.optString("note", "");
        p.createdAt = o.optLong("createdAt", System.currentTimeMillis());
        return p;
    }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("id", id);
            o.put("text", text);
            o.put("source", source);
            o.put("sourceName", sourceName);
            o.put("title", title);
            o.put("videoTime", videoTime == null ? JSONObject.NULL : videoTime);
            o.put("url", url);
            o.put("favorite", favorite);
            o.put("note", note);
            o.put("createdAt", createdAt);
        } catch (JSONException ignored) {
        }
        return o;
    }

    /** Nome do serviço para exibir (ex.: "Netflix"). */
    public String displaySource() {
        if (sourceName != null && !sourceName.isEmpty()) return sourceName;
        return source == null ? "" : source;
    }

    /** Tempo do vídeo formatado (ex.: 1:02:05 ou 12:30). */
    public String formattedTime() {
        if (videoTime == null) return "";
        long s = (long) Math.floor(videoTime);
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(java.util.Locale.ROOT, "%d:%02d:%02d", h, m, sec)
                     : String.format(java.util.Locale.ROOT, "%d:%02d", m, sec);
    }
}
