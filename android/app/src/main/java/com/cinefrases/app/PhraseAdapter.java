package com.cinefrases.app;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.format.DateUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Lista de frases (cartões). */
public class PhraseAdapter extends RecyclerView.Adapter<PhraseAdapter.Holder> {

    public interface Callbacks {
        void onCopy(Phrase p);
        void onFavorite(Phrase p);
        void onOpen(Phrase p);
        void onShare(Phrase p);
        void onDelete(Phrase p);
    }

    private final Callbacks callbacks;
    private final List<Phrase> items = new ArrayList<>();
    private final Set<String> highlight = new HashSet<>();

    public PhraseAdapter(Callbacks callbacks) {
        this.callbacks = callbacks;
        setHasStableIds(true);
    }

    public void submit(List<Phrase> list) {
        items.clear();
        items.addAll(list);
        notifyDataSetChanged();
    }

    /** Destaca rapidamente uma frase que acabou de chegar. */
    public void highlight(String id) {
        highlight.add(id);
    }

    @Override
    public long getItemId(int position) {
        return items.get(position).id.hashCode();
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_phrase, parent, false);
        return new Holder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder h, int position) {
        Phrase p = items.get(position);
        h.quote.setText("“" + p.text + "”");

        h.badge.setText(p.displaySource());
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(h.badge.getResources().getDisplayMetrics().density * 6);
        bg.setColor(sourceColor(p.source));
        h.badge.setBackground(bg);

        h.title.setText(p.title);
        h.title.setVisibility(p.title == null || p.title.isEmpty() ? View.GONE : View.VISIBLE);

        String time = p.formattedTime();
        h.time.setText(time.isEmpty() ? "" : "⏱ " + time);
        h.time.setVisibility(time.isEmpty() ? View.GONE : View.VISIBLE);

        h.date.setText(DateUtils.getRelativeTimeSpanString(p.createdAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS));

        h.favorite.setText(p.favorite ? "★" : "☆");
        h.favorite.setTextColor(p.favorite ? Color.parseColor("#FBBF24") : h.date.getCurrentTextColor());
        h.open.setVisibility(p.url == null || p.url.isEmpty() ? View.GONE : View.VISIBLE);

        h.card.setOnClickListener(v -> callbacks.onCopy(p));
        h.copy.setOnClickListener(v -> callbacks.onCopy(p));
        h.favorite.setOnClickListener(v -> callbacks.onFavorite(p));
        h.open.setOnClickListener(v -> callbacks.onOpen(p));
        h.share.setOnClickListener(v -> callbacks.onShare(p));
        h.delete.setOnClickListener(v -> callbacks.onDelete(p));

        if (highlight.remove(p.id)) {
            h.card.setScaleX(0.96f);
            h.card.setScaleY(0.96f);
            h.card.setAlpha(0.4f);
            h.card.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(450).start();
        }
    }

    static int sourceColor(String source) {
        if (source == null) return Color.parseColor("#555555");
        switch (source) {
            case "netflix": return Color.parseColor("#E50914");
            case "youtube": return Color.parseColor("#FF0033");
            case "disney": return Color.parseColor("#113CCF");
            case "max": return Color.parseColor("#5A2EE6");
            case "prime": return Color.parseColor("#00A8E1");
            case "globoplay": return Color.parseColor("#F06414");
            case "paramount": return Color.parseColor("#0064FF");
            case "crunchyroll": return Color.parseColor("#F47521");
            case "appletv": return Color.parseColor("#333333");
            default: return Color.parseColor("#555555");
        }
    }

    static class Holder extends RecyclerView.ViewHolder {
        final MaterialCardView card;
        final TextView quote, badge, title, time, date;
        final MaterialButton copy, favorite, open, share, delete;

        Holder(View v) {
            super(v);
            card = v.findViewById(R.id.card);
            quote = v.findViewById(R.id.quote);
            badge = v.findViewById(R.id.badge);
            title = v.findViewById(R.id.title);
            time = v.findViewById(R.id.time);
            date = v.findViewById(R.id.date);
            copy = v.findViewById(R.id.copyButton);
            favorite = v.findViewById(R.id.favoriteButton);
            open = v.findViewById(R.id.openButton);
            share = v.findViewById(R.id.shareButton);
            delete = v.findViewById(R.id.deleteButton);
        }
    }
}
