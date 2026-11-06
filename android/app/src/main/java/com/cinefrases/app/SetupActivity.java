package com.cinefrases.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.textfield.TextInputEditText;

import java.security.SecureRandom;

/** Tela de conexão: endereço do servidor + código de sincronização (o mesmo da extensão). */
public class SetupActivity extends AppCompatActivity {
    private TextInputEditText serverInput;
    private TextInputEditText codeInput;
    private Button connectButton;
    private ProgressBar progress;
    private TextView errorText;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_setup);

        serverInput = findViewById(R.id.serverInput);
        codeInput = findViewById(R.id.codeInput);
        connectButton = findViewById(R.id.connectButton);
        progress = findViewById(R.id.progress);
        errorText = findViewById(R.id.errorText);

        serverInput.setText(Prefs.serverUrl(this));
        codeInput.setText(Prefs.syncCode(this));

        findViewById(R.id.generateButton).setOnClickListener(v -> codeInput.setText(randomCode()));
        connectButton.setOnClickListener(v -> connect());
    }

    private void connect() {
        String server = ApiClient.normalizeUrl(text(serverInput));
        String code = text(codeInput);
        errorText.setVisibility(View.GONE);

        if (server.isEmpty()) {
            showError(getString(R.string.error_server_empty));
            return;
        }
        if (!ApiClient.isValidCode(code)) {
            showError(getString(R.string.error_code_invalid));
            return;
        }

        setBusy(true);
        new Thread(() -> {
            boolean ok = new ApiClient(server, code).ping();
            main.post(() -> {
                setBusy(false);
                if (ok) {
                    finishSetup(server, code);
                } else {
                    new AlertDialog.Builder(this)
                            .setTitle(R.string.server_unreachable_title)
                            .setMessage(getString(R.string.server_unreachable_msg, server))
                            .setPositiveButton(R.string.save_anyway, (d, w) -> finishSetup(server, code))
                            .setNegativeButton(R.string.cancel, null)
                            .show();
                }
            });
        }).start();
    }

    private void finishSetup(String server, String code) {
        boolean changed = !code.equals(Prefs.syncCode(this)) || !server.equals(Prefs.serverUrl(this));
        if (changed) PhraseCache.clear(this);
        Prefs.save(this, server, code);
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }

    private void setBusy(boolean busy) {
        connectButton.setEnabled(!busy);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    }

    private void showError(String msg) {
        errorText.setText(msg);
        errorText.setVisibility(View.VISIBLE);
    }

    private static String text(TextInputEditText e) {
        return e.getText() == null ? "" : e.getText().toString().trim();
    }

    /** Mesmo formato do código gerado pela extensão (ex.: "lua-7K2Q9P"). */
    static String randomCode() {
        String[] words = {"lua", "sol", "mar", "cine", "rio", "neon", "jazz", "noir", "pipoca", "drama"};
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        SecureRandom r = new SecureRandom();
        StringBuilder sb = new StringBuilder(words[r.nextInt(words.length)]).append('-');
        for (int i = 0; i < 6; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }
}
