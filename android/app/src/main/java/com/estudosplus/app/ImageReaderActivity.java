package com.estudosplus.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.os.BundleCompat;
import androidx.core.content.IntentCompat;
import androidx.exifinterface.media.ExifInterface;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.google.android.material.snackbar.Snackbar;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Leitor de imagens: lê o texto de um print, foto ou imagem compartilhada (OCR no próprio aparelho,
 * sem internet), detecta a legenda automaticamente e salva o trecho escolhido como frase.
 */
public class ImageReaderActivity extends AppCompatActivity implements OcrOverlayView.Listener {
    private static final int MAX_SIDE = 2560;
    private static final String STATE_URI = "uri";
    private static final String STATE_ROTATION = "rotation";
    private static final String STATE_TEXT = "text";
    private static final String STATE_CAMERA = "camera";

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextRecognizer recognizer;
    private ApiClient api;

    private OcrOverlayView overlay;
    private View pickerView, progress;
    private TextView statusText, hintText;
    private TextView phraseInput, titleInput;
    private MaterialSwitch splitSwitch;
    private MaterialButton addButton, rotateButton, selectAllButton, removeButton;

    private Uri imageUri;
    private int rotation = 0;          // rotação extra pedida pelo usuário (graus)
    private final List<OcrText.Line> lines = new ArrayList<>();
    private int generation = 0;        // descarta resultados de leituras antigas
    private boolean settingText = false;
    private boolean saving = false;
    private String restoredText;
    private Uri cameraUri;

    private final ActivityResultLauncher<PickVisualMediaRequest> pickImage =
            registerForActivityResult(new ActivityResultContracts.PickVisualMedia(), uri -> {
                if (uri != null) open(uri);
            });

    private final ActivityResultLauncher<Uri> takePicture =
            registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
                if (Boolean.TRUE.equals(ok) && cameraUri != null) open(cameraUri);
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Prefs.isConfigured(this)) {
            Toast.makeText(this, R.string.reader_need_code, Toast.LENGTH_LONG).show();
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.activity_image_reader);
        api = new ApiClient(Prefs.serverUrl(), Prefs.syncCode(this));
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

        findViewById(R.id.imageFrame).setClipToOutline(true);
        overlay = findViewById(R.id.overlay);
        overlay.setListener(this);
        pickerView = findViewById(R.id.pickerView);
        progress = findViewById(R.id.progress);
        statusText = findViewById(R.id.readerStatus);
        hintText = findViewById(R.id.hintText);
        phraseInput = findViewById(R.id.phraseInput);
        titleInput = findViewById(R.id.titleInput);
        splitSwitch = findViewById(R.id.splitSwitch);
        addButton = findViewById(R.id.addButton);
        rotateButton = findViewById(R.id.rotateButton);
        selectAllButton = findViewById(R.id.selectAllButton);
        removeButton = findViewById(R.id.removeButton);

        titleInput.setText(Prefs.readerTitle(this));
        findViewById(R.id.backButton).setOnClickListener(v -> finish());
        findViewById(R.id.galleryButton).setOnClickListener(v -> pickFromGallery());
        findViewById(R.id.cameraButton).setOnClickListener(v -> takePhoto());
        findViewById(R.id.otherImageButton).setOnClickListener(v -> pickFromGallery());
        findViewById(R.id.newPhotoButton).setOnClickListener(v -> takePhoto());
        removeButton.setOnClickListener(v -> removeImage());
        rotateButton.setOnClickListener(v -> {
            rotation = (rotation + 90) % 360;
            load();
        });
        selectAllButton.setOnClickListener(v -> overlay.selectAll(overlay.selectedCount() < lines.size()));
        addButton.setOnClickListener(v -> save());
        splitSwitch.setOnCheckedChangeListener((b, checked) -> updateAddButton());
        phraseInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                if (!settingText) restoredText = null;
                updateAddButton();
            }
        });

        Uri start;
        if (savedInstanceState != null) {
            start = BundleCompat.getParcelable(savedInstanceState, STATE_URI, Uri.class);
            rotation = savedInstanceState.getInt(STATE_ROTATION, 0);
            restoredText = savedInstanceState.getString(STATE_TEXT);
            // O Android pode fechar o app enquanto a câmera está aberta: guarda onde a foto vai ser salva
            cameraUri = BundleCompat.getParcelable(savedInstanceState, STATE_CAMERA, Uri.class);
        } else {
            start = incomingUri(getIntent());
        }
        if (start != null) {
            imageUri = start;
            load();
        } else {
            showPicker();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (imageUri != null) out.putParcelable(STATE_URI, imageUri);
        out.putInt(STATE_ROTATION, rotation);
        if (cameraUri != null) out.putParcelable(STATE_CAMERA, cameraUri);
        if (phraseInput != null) out.putString(STATE_TEXT, phraseInput.getText().toString());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
        if (recognizer != null) recognizer.close();
    }

    /** Imagem compartilhada por outro app (ex.: "Compartilhar print" → Estudos Plus). */
    @Nullable
    private static Uri incomingUri(Intent intent) {
        if (intent == null) return null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            return IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getData();
    }

    // ---------- Escolher imagem ----------

    private void pickFromGallery() {
        pickImage.launch(new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
                .build());
    }

    private void takePhoto() {
        try {
            File dir = new File(getCacheDir(), "images");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("sem pasta");
            String current = imageUri != null ? imageUri.getLastPathSegment() : null;
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) {
                if (!f.getName().equals(current)) //noinspection ResultOfMethodCallIgnored
                    f.delete();
            }
            File file = new File(dir, "camera-" + System.currentTimeMillis() + ".jpg");
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
            takePicture.launch(cameraUri);
        } catch (IOException | IllegalArgumentException | ActivityNotFoundException e) {
            Toast.makeText(this, R.string.reader_no_camera, Toast.LENGTH_SHORT).show();
        }
    }

    /** Descarta a foto atual e volta para a escolha de imagem. */
    private void removeImage() {
        generation++;
        imageUri = null;
        rotation = 0;
        restoredText = null;
        lines.clear();
        overlay.setLines(lines, null);
        setPhraseText("");
        showPicker();
        Snackbar.make(addButton, R.string.reader_removed, Snackbar.LENGTH_SHORT)
                .setAction(R.string.reader_new_photo, v -> takePhoto())
                .show();
    }

    private void open(Uri uri) {
        imageUri = uri;
        rotation = 0;
        restoredText = null;
        load();
    }

    private void showPicker() {
        pickerView.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
        overlay.setBitmap(null);
        statusText.setText(R.string.reader_status_empty);
        hintText.setVisibility(View.GONE);
        rotateButton.setEnabled(false);
        selectAllButton.setEnabled(false);
        removeButton.setEnabled(false);
        updateAddButton();
    }

    // ---------- Leitura (OCR) ----------

    /** Decodifica a imagem (respeitando a orientação da foto) e reconhece o texto. */
    private void load() {
        final Uri uri = imageUri;
        final int rot = rotation;
        final int gen = ++generation;
        pickerView.setVisibility(View.GONE);
        progress.setVisibility(View.VISIBLE);
        statusText.setText(R.string.reader_status_reading);
        rotateButton.setEnabled(false);
        selectAllButton.setEnabled(false);
        removeButton.setEnabled(true);
        io.execute(() -> {
            Bitmap b;
            try {
                b = decode(uri, rot);
            } catch (Exception | OutOfMemoryError e) {
                main.post(() -> {
                    if (gen != generation || isFinishing()) return;
                    Toast.makeText(this, R.string.reader_error_image, Toast.LENGTH_LONG).show();
                    imageUri = null;
                    showPicker();
                });
                return;
            }
            main.post(() -> {
                if (gen != generation || isFinishing()) return;
                lines.clear();
                overlay.setBitmap(b);
                recognize(b, gen);
            });
        });
    }

    private void recognize(Bitmap b, int gen) {
        recognizer.process(InputImage.fromBitmap(b, 0))
                .addOnSuccessListener(result -> {
                    if (gen != generation || isFinishing()) return;
                    try {
                        onRecognized(result, b, gen);
                    } catch (RuntimeException e) {
                        progress.setVisibility(View.GONE);
                        rotateButton.setEnabled(true);
                        statusText.setText(R.string.reader_status_failed);
                    }
                })
                .addOnFailureListener(e -> {
                    if (gen != generation || isFinishing()) return;
                    progress.setVisibility(View.GONE);
                    rotateButton.setEnabled(true);
                    statusText.setText(R.string.reader_status_failed);
                });
    }

    private void onRecognized(Text result, Bitmap b, int gen) {
        progress.setVisibility(View.GONE);
        rotateButton.setEnabled(true);
        lines.clear();
        int blockIndex = 0;
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect r = line.getBoundingBox();
                String t = line.getText();
                if (r == null || t == null || t.trim().isEmpty()) continue;
                lines.add(new OcrText.Line(t, blockIndex, r.left, r.top, r.right, r.bottom));
            }
            blockIndex++;
        }
        selectAllButton.setEnabled(!lines.isEmpty());
        if (lines.isEmpty()) {
            overlay.setLines(lines, null);
            statusText.setText(R.string.reader_status_none);
            hintText.setVisibility(View.VISIBLE);
            hintText.setText(R.string.reader_hint_none);
            setPhraseText(restoredText != null ? restoredText : "");
            return;
        }
        boolean[] guess = OcrText.guessSubtitles(lines, b.getWidth(), b.getHeight());
        overlay.setLines(lines, guess);
        hintText.setVisibility(View.VISIBLE);
        hintText.setText(overlay.selectedCount() > 0 ? R.string.reader_hint_auto : R.string.reader_hint);
        if (restoredText != null) {
            setPhraseText(restoredText);
            updateStatus();
        } else {
            onSelectionChanged();
            refine(b, guess, gen);
        }
    }

    /**
     * Segunda leitura só da legenda, recortada e ampliada. Em foto da TV ou print pequeno a letra fica
     * com poucos pixels e o OCR erra; ampliando o trecho a leitura fica bem mais precisa.
     */
    private void refine(Bitmap b, boolean[] sel, int gen) {
        float l = Float.MAX_VALUE, t = Float.MAX_VALUE, r = 0, bt = 0, hSum = 0;
        int n = 0;
        for (int i = 0; i < lines.size(); i++) {
            if (!sel[i]) continue;
            OcrText.Line x = lines.get(i);
            l = Math.min(l, x.left);
            t = Math.min(t, x.top);
            r = Math.max(r, x.right);
            bt = Math.max(bt, x.bottom);
            hSum += x.bottom - x.top;
            n++;
        }
        if (n == 0) return;
        float h = Math.max(1f, hSum / n);
        int left = (int) Math.max(0, l - h * 1.5f), top = (int) Math.max(0, t - h * 1.2f);
        int right = (int) Math.min(b.getWidth(), r + h * 1.5f), bottom = (int) Math.min(b.getHeight(), bt + h * 1.2f);
        int cw = right - left, ch = bottom - top;
        if (cw <= 0 || ch <= 0) return;
        float scale = Math.min(3f, 60f / h);
        scale = Math.min(scale, 4096f / Math.max(cw, ch));
        if (scale < 1.4f) return; // a letra já está grande o bastante

        final Bitmap crop;
        try {
            Matrix m = new Matrix();
            m.setScale(scale, scale);
            crop = Bitmap.createBitmap(b, left, top, cw, ch, m, true);
        } catch (RuntimeException | OutOfMemoryError e) {
            return;
        }
        final float s = scale, ox = left, oy = top;
        final float ul = l - h * 0.6f, ut = t - h * 0.6f, ur = r + h * 0.6f, ub = bt + h * 0.6f;
        final boolean[] before = sel.clone();
        progress.setVisibility(View.VISIBLE);
        statusText.setText(R.string.reader_status_refining);
        recognizer.process(InputImage.fromBitmap(crop, 0))
                .addOnSuccessListener(res -> {
                    if (gen != generation || isFinishing()) return;
                    progress.setVisibility(View.GONE);
                    // Se o usuário já mexeu na seleção, não troca nada
                    if (!java.util.Arrays.equals(before, overlay.getSelection())) {
                        updateStatus();
                        return;
                    }
                    List<OcrText.Line> refined = new ArrayList<>();
                    int bi = 0;
                    for (Text.TextBlock block : res.getTextBlocks()) {
                        for (Text.Line line : block.getLines()) {
                            Rect rr = line.getBoundingBox();
                            String tx = line.getText();
                            if (rr == null || tx == null || tx.trim().isEmpty()) continue;
                            OcrText.Line m = new OcrText.Line(tx, 100000 + bi,
                                    ox + rr.left / s, oy + rr.top / s, ox + rr.right / s, oy + rr.bottom / s);
                            float cx = (m.left + m.right) / 2f, cy = (m.top + m.bottom) / 2f;
                            if (cx >= ul && cx <= ur && cy >= ut && cy <= ub) refined.add(m);
                        }
                        bi++;
                    }
                    String oldText = OcrText.compose(lines, before);
                    boolean[] all = new boolean[refined.size()];
                    java.util.Arrays.fill(all, true);
                    String newText = OcrText.compose(refined, all);
                    if (refined.isEmpty() || newText.length() < oldText.length() * 0.6f) {
                        updateStatus();
                        return;
                    }
                    // Troca as linhas da legenda pelas lidas com zoom, no mesmo lugar da lista
                    List<OcrText.Line> merged = new ArrayList<>();
                    List<Boolean> mergedSel = new ArrayList<>();
                    boolean inserted = false;
                    for (int i = 0; i < lines.size(); i++) {
                        if (before[i]) {
                            if (!inserted) {
                                for (OcrText.Line x : refined) {
                                    merged.add(x);
                                    mergedSel.add(true);
                                }
                                inserted = true;
                            }
                            continue;
                        }
                        merged.add(lines.get(i));
                        mergedSel.add(false);
                    }
                    boolean[] newSel = new boolean[merged.size()];
                    for (int i = 0; i < newSel.length; i++) newSel[i] = mergedSel.get(i);
                    lines.clear();
                    lines.addAll(merged);
                    overlay.setLines(lines, newSel);
                    onSelectionChanged();
                })
                .addOnFailureListener(e -> {
                    if (gen != generation || isFinishing()) return;
                    progress.setVisibility(View.GONE);
                    updateStatus();
                });
    }

    @Override
    public void onSelectionChanged() {
        restoredText = null;
        setPhraseText(OcrText.compose(lines, overlay.getSelection()));
        updateStatus();
    }

    private void updateStatus() {
        statusText.setText(getResources().getQuantityString(R.plurals.reader_status_lines, lines.size(),
                lines.size(), overlay.selectedCount()));
    }

    private void setPhraseText(String text) {
        settingText = true;
        phraseInput.setText(text);
        settingText = false;
        updateAddButton();
    }

    private void updateAddButton() {
        if (phraseInput == null) return;
        String text = phraseInput.getText().toString();
        int blocks = OcrText.countBlocks(text);
        splitSwitch.setVisibility(blocks > 1 ? View.VISIBLE : View.GONE);
        int n = blocks > 1 && splitSwitch.isChecked() ? blocks : (blocks > 0 ? 1 : 0);
        addButton.setEnabled(n > 0 && !saving);
        addButton.setText(n > 1 ? getString(R.string.reader_add_many, n) : getString(R.string.reader_add));
    }

    // ---------- Salvar ----------

    private void save() {
        List<String> texts = OcrText.splitPhrases(phraseInput.getText().toString(),
                splitSwitch.getVisibility() == View.VISIBLE && splitSwitch.isChecked());
        if (texts.isEmpty()) return;
        String title = titleInput.getText().toString().trim();
        Prefs.saveReaderTitle(this, title);
        saving = true;
        updateAddButton();
        long now = System.currentTimeMillis();
        io.execute(() -> {
            int done = 0;
            try {
                for (int i = 0; i < texts.size(); i++) {
                    Phrase p = new Phrase();
                    p.id = "img" + UUID.randomUUID().toString().replace("-", "");
                    p.text = texts.get(i);
                    p.source = "imagem";
                    p.sourceName = getString(R.string.reader_source_name);
                    p.title = title;
                    p.videoTime = null;
                    p.url = "";
                    p.createdAt = now - i; // mantém a ordem de leitura na lista
                    api.add(p);
                    done++;
                }
                final int total = done;
                main.post(() -> {
                    if (isFinishing()) return;
                    // Continua no leitor: dá para salvar outras linhas, tirar nova foto ou ir para a lista
                    saving = false;
                    setResult(RESULT_OK);
                    if (!lines.isEmpty()) overlay.selectAll(false);
                    else setPhraseText("");
                    hintText.setVisibility(View.VISIBLE);
                    hintText.setText(R.string.reader_saved_hint);
                    Snackbar.make(addButton, getResources().getQuantityString(R.plurals.reader_added, total, total),
                                    Snackbar.LENGTH_LONG)
                            .setAction(R.string.reader_view_list, v -> openList())
                            .show();
                });
            } catch (Exception e) {
                final int partial = done;
                main.post(() -> {
                    if (isFinishing()) return;
                    saving = false;
                    updateAddButton();
                    String msg = partial > 0
                            ? getResources().getQuantityString(R.plurals.reader_added_partial, partial, partial)
                            : getString(R.string.error_offline_action);
                    Snackbar.make(addButton, msg, Snackbar.LENGTH_LONG).show();
                });
            }
        });
    }

    /** Vai para a lista de frases (também quando o leitor foi aberto pelo "Compartilhar" de outro app). */
    private void openList() {
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(i);
        finish();
    }

    // ---------- Imagem ----------

    /** Lê a imagem reduzida para no máximo MAX_SIDE px, já girada conforme o EXIF e a rotação pedida. */
    private Bitmap decode(Uri uri, int extraRotation) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IOException("sem acesso");
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("não é imagem");

        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap raw;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            raw = BitmapFactory.decodeStream(in, null, opts);
        }
        if (raw == null) throw new IOException("falha ao decodificar");

        int exifRotation = 0;
        boolean flipped = false;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in != null) {
                ExifInterface exif = new ExifInterface(in);
                exifRotation = exif.getRotationDegrees();
                flipped = exif.isFlipped();
            }
        } catch (Exception ignored) {
            // imagem sem EXIF (PNG, print): segue sem girar
        }

        Matrix m = new Matrix();
        float scale = Math.min(1f, (float) MAX_SIDE / Math.max(raw.getWidth(), raw.getHeight()));
        if (scale < 1f) m.postScale(scale, scale);
        if (flipped) m.postScale(-1, 1);
        int total = (exifRotation + extraRotation) % 360;
        if (total != 0) m.postRotate(total);
        if (m.isIdentity()) return raw;
        Bitmap out = Bitmap.createBitmap(raw, 0, 0, raw.getWidth(), raw.getHeight(), m, true);
        if (out != raw) raw.recycle();
        return out;
    }
}
