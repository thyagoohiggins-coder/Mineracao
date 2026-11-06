package com.estudosplus.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.MenuItem;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.PopupMenu;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.chip.Chip;
import com.google.android.material.chip.ChipGroup;
import com.google.android.material.snackbar.Snackbar;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Lista de frases sincronizada em tempo real com a extensão. */
public class MainActivity extends AppCompatActivity implements SseClient.Listener, PhraseAdapter.Callbacks {
    private static final String FILTER_ALL = "__all";
    private static final String FILTER_FAV = "__fav";

    private ApiClient api;
    private SseClient sse;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private final List<Phrase> all = new ArrayList<>();
    private PhraseAdapter adapter;
    private String query = "";
    private String filter = FILTER_ALL;
    private String chipsKey = null;

    private View statusDot;
    private TextView statusText, countText;
    private View emptyView;
    private TextView emptyTitle, emptyBody;
    private RecyclerView recycler;
    private SwipeRefreshLayout swipe;
    private ChipGroup chips;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!Prefs.isConfigured(this)) {
            startActivity(new Intent(this, SetupActivity.class));
            finish();
            return;
        }
        setContentView(R.layout.activity_main);
        api = new ApiClient(Prefs.serverUrl(), Prefs.syncCode(this));

        ((TextView) findViewById(R.id.codeText)).setText(getString(R.string.code_label, Prefs.syncCode(this)));
        View menuButton = findViewById(R.id.menuButton);
        menuButton.setOnClickListener(v -> {
            PopupMenu menu = new PopupMenu(this, v);
            menu.getMenuInflater().inflate(R.menu.main_menu, menu.getMenu());
            menu.setOnMenuItemClickListener(this::onMenuItem);
            menu.show();
        });

        statusDot = findViewById(R.id.statusDot);
        statusText = findViewById(R.id.statusText);
        countText = findViewById(R.id.countText);
        emptyView = findViewById(R.id.emptyView);
        emptyTitle = findViewById(R.id.emptyTitle);
        emptyBody = findViewById(R.id.emptyBody);
        chips = findViewById(R.id.filterChips);
        swipe = findViewById(R.id.swipe);
        recycler = findViewById(R.id.recycler);

        adapter = new PhraseAdapter(this);
        recycler.setLayoutManager(new LinearLayoutManager(this));
        recycler.setAdapter(adapter);

        swipe.setOnRefreshListener(this::reload);

        EditText search = findViewById(R.id.searchInput);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                query = s.toString().trim().toLowerCase(Locale.ROOT);
                render();
            }
        });

        all.addAll(PhraseCache.load(this));
        setConnected(false);
        render();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (api == null) return;
        sse = new SseClient(api.streamUrl(), this);
        sse.start();
        swipe.setRefreshing(true);
        reload();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (sse != null) sse.stop();
        sse = null;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        io.shutdownNow();
    }

    // ---------- Dados ----------

    private void reload() {
        io.execute(() -> {
            try {
                List<Phrase> list = api.list();
                main.post(() -> {
                    all.clear();
                    all.addAll(list);
                    swipe.setRefreshing(false);
                    changed();
                });
            } catch (Exception e) {
                main.post(() -> {
                    swipe.setRefreshing(false);
                    setConnected(false);
                });
            }
        });
    }

    /** Persiste no cache e redesenha. */
    private void changed() {
        PhraseCache.save(this, new ArrayList<>(all));
        render();
    }

    private int indexOf(String id) {
        for (int i = 0; i < all.size(); i++) if (all.get(i).id.equals(id)) return i;
        return -1;
    }

    private void insertSorted(Phrase p) {
        int i = 0;
        while (i < all.size() && all.get(i).createdAt > p.createdAt) i++;
        all.add(i, p);
    }

    // ---------- Tempo real (chamado na thread de rede) ----------

    @Override
    public void onEvent(String event, String data) {
        final JSONObject json;
        try {
            json = new JSONObject(data);
        } catch (Exception e) {
            return;
        }
        main.post(() -> {
            if (isFinishing()) return;
            switch (event) {
                case "add": {
                    Phrase p = Phrase.fromJson(json);
                    if (indexOf(p.id) == -1) {
                        insertSorted(p);
                        adapter.highlight(p.id);
                        changed();
                        recycler.scrollToPosition(0);
                    }
                    break;
                }
                case "update": {
                    Phrase p = Phrase.fromJson(json);
                    int i = indexOf(p.id);
                    if (i >= 0) {
                        all.set(i, p);
                        changed();
                    }
                    break;
                }
                case "delete": {
                    int i = indexOf(json.optString("id"));
                    if (i >= 0) {
                        all.remove(i);
                        changed();
                    }
                    break;
                }
                default:
                    break;
            }
        });
    }

    @Override
    public void onConnectionChanged(boolean connected) {
        main.post(() -> {
            if (isFinishing()) return;
            setConnected(connected);
            if (connected) reload(); // recupera o que chegou enquanto estava offline
        });
    }

    private void setConnected(boolean connected) {
        statusDot.setBackgroundResource(connected ? R.drawable.dot_online : R.drawable.dot_offline);
        statusText.setText(connected ? R.string.status_online : R.string.status_offline);
    }

    // ---------- Tela ----------

    private List<Phrase> visible() {
        List<Phrase> out = new ArrayList<>();
        for (Phrase p : all) {
            if (FILTER_FAV.equals(filter) && !p.favorite) continue;
            if (!FILTER_ALL.equals(filter) && !FILTER_FAV.equals(filter) && !filter.equals(p.source)) continue;
            if (!query.isEmpty()) {
                String hay = (p.text + " " + p.title + " " + p.displaySource()).toLowerCase(Locale.ROOT);
                if (!hay.contains(query)) continue;
            }
            out.add(p);
        }
        return out;
    }

    private void render() {
        renderChips();
        List<Phrase> list = visible();
        adapter.submit(list);
        boolean none = all.isEmpty();
        emptyView.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
        emptyTitle.setVisibility(none ? View.VISIBLE : View.GONE);
        emptyBody.setText(none ? R.string.empty_body : R.string.no_results);
        countText.setVisibility(none ? View.GONE : View.VISIBLE);
        countText.setText(getResources().getQuantityString(R.plurals.phrase_count, list.size(), list.size()));
    }

    private void renderChips() {
        Map<String, String> sources = new LinkedHashMap<>();
        for (Phrase p : all) if (!sources.containsKey(p.source)) sources.put(p.source, p.displaySource());
        if (!FILTER_ALL.equals(filter) && !FILTER_FAV.equals(filter) && !sources.containsKey(filter)) filter = FILTER_ALL;

        String key = sources.keySet().toString();
        if (!key.equals(chipsKey)) {
            chipsKey = key;
            chips.removeAllViews();
            addChip(FILTER_ALL, getString(R.string.filter_all));
            addChip(FILTER_FAV, getString(R.string.filter_favorites));
            for (Map.Entry<String, String> e : sources.entrySet()) addChip(e.getKey(), e.getValue());
        }
        for (int i = 0; i < chips.getChildCount(); i++) {
            Chip c = (Chip) chips.getChildAt(i);
            c.setChecked(filter.equals(c.getTag()));
        }
    }

    private void addChip(String tag, String label) {
        Chip c = (Chip) getLayoutInflater().inflate(R.layout.item_chip, chips, false);
        c.setText(label);
        c.setTag(tag);
        c.setOnClickListener(v -> {
            filter = tag;
            render();
        });
        chips.addView(c);
    }

    // ---------- Ações nos cartões ----------

    @Override
    public void onCopy(Phrase p) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Estudos Plus", p.text));
        // A partir do Android 13 o próprio sistema mostra um aviso de cópia
        if (Build.VERSION.SDK_INT < 33) Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onFavorite(Phrase p) {
        boolean newValue = !p.favorite;
        p.favorite = newValue;
        changed();
        io.execute(() -> {
            try {
                api.setFavorite(p.id, newValue);
            } catch (Exception e) {
                main.post(() -> {
                    p.favorite = !newValue;
                    changed();
                    Toast.makeText(this, R.string.error_offline_action, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    @Override
    public void onOpen(Phrase p) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(p.url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.error_open, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onShare(Phrase p) {
        share(formatForShare(p));
    }

    @Override
    public void onDelete(Phrase p) {
        int index = indexOf(p.id);
        if (index < 0) return;
        all.remove(index);
        changed();
        io.execute(() -> {
            try {
                api.delete(p.id);
                main.post(() -> Snackbar.make(recycler, R.string.deleted, Snackbar.LENGTH_LONG)
                        .setAction(R.string.undo, v -> restore(p))
                        .show());
            } catch (Exception e) {
                main.post(() -> {
                    if (indexOf(p.id) == -1) insertSorted(p);
                    changed();
                    Toast.makeText(this, R.string.error_offline_action, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void restore(Phrase p) {
        if (indexOf(p.id) == -1) insertSorted(p);
        changed();
        io.execute(() -> {
            try {
                api.add(p);
                if (p.favorite) api.setFavorite(p.id, true);
            } catch (Exception e) {
                main.post(() -> Toast.makeText(this, R.string.error_offline_action, Toast.LENGTH_SHORT).show());
            }
        });
    }

    private static String formatForShare(Phrase p) {
        StringBuilder sb = new StringBuilder("“").append(p.text).append("”");
        List<String> parts = new ArrayList<>();
        if (p.title != null && !p.title.isEmpty()) parts.add(p.title);
        if (!p.displaySource().isEmpty()) parts.add(p.displaySource());
        if (!p.formattedTime().isEmpty()) parts.add(p.formattedTime());
        if (!parts.isEmpty()) sb.append("\n— ").append(String.join(" · ", parts));
        return sb.toString();
    }

    private void share(String text) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(send, getString(R.string.share)));
    }

    // ---------- Menu ----------

    private boolean onMenuItem(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_refresh) {
            swipe.setRefreshing(true);
            reload();
            return true;
        }
        if (id == R.id.action_export) {
            List<Phrase> list = visible();
            if (list.isEmpty()) {
                Toast.makeText(this, R.string.nothing_to_export, Toast.LENGTH_SHORT).show();
                return true;
            }
            StringBuilder sb = new StringBuilder();
            for (Iterator<Phrase> it = list.iterator(); it.hasNext(); ) {
                sb.append(formatForShare(it.next()));
                if (it.hasNext()) sb.append("\n\n");
            }
            share(sb.toString());
            return true;
        }
        if (id == R.id.action_change_code) {
            startActivity(new Intent(this, SetupActivity.class));
            return true;
        }
        if (id == R.id.action_about) {
            new MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.app_name)
                    .setMessage(getString(R.string.about_msg, BuildConfig.VERSION_NAME))
                    .setPositiveButton(android.R.string.ok, null)
                    .show();
            return true;
        }
        return false;
    }
}
