package com.estudosplus.app;

import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.format.DateUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.ColorUtils;
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
        h.quote.setText(p.text);

        // Etiqueta do serviço: texto na cor do serviço sobre fundo suave
        int color = sourceColor(p.source);
        h.badge.setText(p.displaySource());
        h.badge.setTextColor(color);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(h.badge.getResources().getDisplayMetrics().density * 6);
        bg.setColor(ColorUtils.setAlphaComponent(color, 0x26));
        h.badge.setBackground(bg);

        h.title.setText(p.title);
        h.title.setVisibility(p.title == null || p.title.isEmpty() ? View.GONE : View.VISIBLE);

        // Rodapé: minuto do vídeo · quando foi salva
        long now = System.currentTimeMillis();
        CharSequence when = DateUtils.getRelativeTimeSpanString(Math.min(p.createdAt, now), now, DateUtils.MINUTE_IN_MILLIS);
        String time = p.formattedTime();
        h.meta.setText(time.isEmpty() ? when : time + "  ·  " + when);

        int muted = ContextCompat.getColor(h.itemView.getContext(), R.color.on_surface_variant);
        int star = ContextCompat.getColor(h.itemView.getContext(), R.color.star);
        h.favorite.setIconResource(p.favorite ? R.drawable.ic_star : R.drawable.ic_star_border);
        h.favorite.setIconTint(ColorStateList.valueOf(p.favorite ? star : muted));
        h.favorite.setContentDescription(h.itemView.getContext().getString(p.favorite ? R.string.unfavorite : R.string.favorite));
        h.open.setVisibility(p.url == null || p.url.isEmpty() ? View.GONE : View.VISIBLE);

        h.card.setOnClickListener(v -> callbacks.onCopy(p));
        h.copy.setOnClickListener(v -> callbacks.onCopy(p));
        h.favorite.setOnClickListener(v -> callbacks.onFavorite(p));
        h.open.setOnClickListener(v -> callbacks.onOpen(p));
        h.share.setOnClickListener(v -> callbacks.onShare(p));
        h.delete.setOnClickListener(v -> callbacks.onDelete(p));

        if (highlight.remove(p.id)) {
            h.card.setAlpha(0f);
            h.card.setTranslationY(-24f);
            h.card.animate().alpha(1f).translationY(0f).setDuration(350).start();
        }
    }

    static int sourceColor(String source) {
        if (source == null) return Color.parseColor("#64748B");
        switch (source) {
            case "netflix": return Color.parseColor("#E50914");
            case "youtube": return Color.parseColor("#FF0033");
            case "disney": return Color.parseColor("#2563EB");
            case "max": return Color.parseColor("#7C3AED");
            case "prime": return Color.parseColor("#0EA5E9");
            case "globoplay": return Color.parseColor("#F97316");
            case "paramount": return Color.parseColor("#2563EB");
            case "crunchyroll": return Color.parseColor("#F47521");
            case "appletv": return Color.parseColor("#64748B");
            case "imagem": return Color.parseColor("#0D9488");
            default: return Color.parseColor("#64748B");
        }
    }

    static class Holder extends RecyclerView.ViewHolder {
        final MaterialCardView card;
        final TextView quote, badge, title, meta;
        final MaterialButton copy, favorite, open, share, delete;

        Holder(View v) {
            super(v);
            card = v.findViewById(R.id.card);
            quote = v.findViewById(R.id.quote);
            badge = v.findViewById(R.id.badge);
            title = v.findViewById(R.id.title);
            meta = v.findViewById(R.id.meta);
            copy = v.findViewById(R.id.copyButton);
            favorite = v.findViewById(R.id.favoriteButton);
            open = v.findViewById(R.id.openButton);
            share = v.findViewById(R.id.shareButton);
            delete = v.findViewById(R.id.deleteButton);
        }
    }
}
