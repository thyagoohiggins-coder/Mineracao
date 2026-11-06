package com.estudosplus.app;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Cliente Server-Sent Events simples, com reconexão automática.
 * Recebe em tempo real as frases que a extensão envia ao servidor.
 */
public class SseClient {

    public interface Listener {
        /** Chamado na thread de rede. */
        void onEvent(String event, String data);

        /** Chamado na thread de rede quando a conexão abre ou cai. */
        void onConnectionChanged(boolean connected);
    }

    private final String url;
    private final Listener listener;
    private volatile boolean running;
    private volatile HttpURLConnection connection;
    private Thread thread;

    public SseClient(String url, Listener listener) {
        this.url = url;
        this.listener = listener;
    }

    public synchronized void start() {
        if (running) return;
        running = true;
        thread = new Thread(this::loop, "estudosplus-sse");
        thread.setDaemon(true);
        thread.start();
    }

    public synchronized void stop() {
        running = false;
        HttpURLConnection c = connection;
        if (c != null) c.disconnect();
        if (thread != null) thread.interrupt();
        thread = null;
    }

    private void loop() {
        long backoff = 1000;
        while (running) {
            try {
                connectOnce();
                backoff = 1000; // conexão encerrada normalmente: reconecta rápido
            } catch (IOException e) {
                // servidor fora do ar ou sem rede
            }
            if (!running) break;
            listener.onConnectionChanged(false);
            try {
                Thread.sleep(backoff);
            } catch (InterruptedException e) {
                break;
            }
            backoff = Math.min(backoff * 2, 30000);
        }
    }

    private void connectOnce() throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        connection = c;
        try {
            c.setConnectTimeout(8000);
            c.setReadTimeout(60000); // o servidor manda "ping" a cada 25s
            c.setRequestProperty("Accept", "text/event-stream");
            c.setRequestProperty("Cache-Control", "no-cache");
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            listener.onConnectionChanged(true);

            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String event = "message";
                StringBuilder data = new StringBuilder();
                String line;
                while (running && (line = r.readLine()) != null) {
                    if (line.isEmpty()) { // fim de um evento
                        if (data.length() > 0) listener.onEvent(event, data.toString());
                        event = "message";
                        data.setLength(0);
                    } else if (line.startsWith(":")) {
                        // comentário/ping
                    } else if (line.startsWith("event:")) {
                        event = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        if (data.length() > 0) data.append('\n');
                        data.append(line.substring(5).startsWith(" ") ? line.substring(6) : line.substring(5));
                    }
                }
            }
        } finally {
            connection = null;
            c.disconnect();
        }
    }
}
