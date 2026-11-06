package com.cinefrases.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Chamadas REST ao servidor do CineFrases. Bloqueante: use fora da thread de UI. */
public class ApiClient {
    private final String baseUrl;
    private final String code;

    public ApiClient(String serverUrl, String syncCode) {
        this.baseUrl = normalizeUrl(serverUrl);
        this.code = syncCode.trim();
    }

    public static String normalizeUrl(String url) {
        String u = url == null ? "" : url.trim();
        if (!u.isEmpty() && !u.matches("(?i)^https?://.*")) u = "http://" + u;
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        return u;
    }

    public static boolean isValidCode(String code) {
        return code != null && code.trim().matches("[A-Za-z0-9_-]{4,64}");
    }

    String roomUrl() {
        try {
            return baseUrl + "/api/rooms/" + URLEncoder.encode(code, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    public String streamUrl() {
        return roomUrl() + "/stream";
    }

    /** Verifica se o servidor responde. */
    public boolean ping() {
        try {
            JSONObject o = new JSONObject(request("GET", baseUrl + "/api/health", null));
            return o.optBoolean("ok");
        } catch (Exception e) {
            return false;
        }
    }

    public List<Phrase> list() throws IOException {
        try {
            JSONArray arr = new JSONObject(request("GET", roomUrl() + "/phrases", null)).getJSONArray("phrases");
            List<Phrase> out = new ArrayList<>(arr.length());
            for (int i = 0; i < arr.length(); i++) out.add(Phrase.fromJson(arr.getJSONObject(i)));
            return out;
        } catch (org.json.JSONException e) {
            throw new IOException("Resposta inválida do servidor", e);
        }
    }

    public void setFavorite(String id, boolean favorite) throws IOException {
        try {
            JSONObject body = new JSONObject().put("favorite", favorite);
            request("POST", roomUrl() + "/phrases/" + URLEncoder.encode(id, "UTF-8"), body.toString());
        } catch (org.json.JSONException e) {
            throw new IOException(e);
        }
    }

    public void delete(String id) throws IOException {
        request("DELETE", roomUrl() + "/phrases/" + URLEncoder.encode(id, "UTF-8"), null);
    }

    /** Usado para restaurar uma frase apagada ("Desfazer"). */
    public void add(Phrase p) throws IOException {
        request("POST", roomUrl() + "/phrases", p.toJson().toString());
    }

    private static String request(String method, String url, String body) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(8000);
            c.setReadTimeout(15000);
            c.setRequestMethod(method);
            c.setRequestProperty("Accept", "application/json");
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream os = c.getOutputStream()) {
                    os.write(bytes);
                }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String resp = in == null ? "" : readAll(in);
            if (status >= 400) throw new IOException("HTTP " + status + ": " + resp);
            return resp;
        } finally {
            c.disconnect();
        }
    }

    static String readAll(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        }
    }
}
