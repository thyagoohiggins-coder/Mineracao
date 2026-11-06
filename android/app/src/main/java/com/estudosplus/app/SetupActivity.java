package com.estudosplus.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.TextView;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.textfield.TextInputEditText;

/** Tela de conexão: endereço do servidor + código de sincronização (o mesmo da extensão). */
public class SetupActivity extends AppCompatActivity {
    private TextInputEditText codeInput;
    private View connectButton;
    private View progress;
    private TextView errorText;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_setup);

        codeInput = findViewById(R.id.codeInput);
        connectButton = findViewById(R.id.connectButton);
        progress = findViewById(R.id.progress);
        errorText = findViewById(R.id.errorText);

        codeInput.setText(Prefs.syncCode(this));

        connectButton.setOnClickListener(v -> connect());
        codeInput.setOnEditorActionListener((v, actionId, event) -> { connect(); return true; });

        int[] steps = {R.id.step1, R.id.step2, R.id.step3};
        int[] texts = {R.string.setup_step1, R.string.setup_step2, R.string.setup_step3};
        for (int i = 0; i < steps.length; i++) {
            View step = findViewById(steps[i]);
            ((TextView) step.findViewById(R.id.stepNumber)).setText(String.valueOf(i + 1));
            ((TextView) step.findViewById(R.id.stepText)).setText(texts[i]);
        }
    }

    private void connect() {
        String code = text(codeInput);
        errorText.setVisibility(View.GONE);

        if (!ApiClient.isValidCode(code)) {
            showError(getString(R.string.error_code_invalid));
            return;
        }

        setBusy(true);
        new Thread(() -> {
            boolean ok = new ApiClient(Prefs.serverUrl(), code).ping();
            main.post(() -> {
                setBusy(false);
                if (ok) {
                    finishSetup(code);
                } else {
                    new MaterialAlertDialogBuilder(this)
                            .setTitle(R.string.server_unreachable_title)
                            .setMessage(R.string.server_unreachable_msg)
                            .setPositiveButton(R.string.save_anyway, (d, w) -> finishSetup(code))
                            .setNegativeButton(R.string.cancel, null)
                            .show();
                }
            });
        }).start();
    }

    private void finishSetup(String code) {
        if (!code.equals(Prefs.syncCode(this))) PhraseCache.clear(this);
        Prefs.saveCode(this, code);
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
}
