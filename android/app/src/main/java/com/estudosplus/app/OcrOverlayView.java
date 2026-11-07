package com.estudosplus.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.ColorUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Mostra a imagem com as linhas de texto reconhecidas por cima.
 * Um dedo: toque ou arraste sobre as linhas para marcar/desmarcar. Dois dedos: zoom e mover.
 */
public class OcrOverlayView extends View {

    public interface Listener {
        void onSelectionChanged();
    }

    private Bitmap bitmap;
    private final List<RectF> boxes = new ArrayList<>(); // em pixels da imagem
    private boolean[] selected = new boolean[0];
    private Listener listener;

    private final Matrix matrix = new Matrix();
    private float baseScale = 1f;
    private boolean matrixReady = false;

    private final Paint bitmapPaint = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
    private final Paint fillOn = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokeOn = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fillOff = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokeOff = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF tmp = new RectF();
    private final float density;

    // Gestos
    private final ScaleGestureDetector scaler;
    private boolean painting = false;
    private boolean paintValue = true;
    private boolean[] snapshot;
    private boolean changedInGesture = false;
    private float lastFocusX, lastFocusY;

    public OcrOverlayView(Context context) {
        this(context, null);
    }

    public OcrOverlayView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        density = getResources().getDisplayMetrics().density;
        int primary = ContextCompat.getColor(context, R.color.primary);

        fillOn.setStyle(Paint.Style.FILL);
        fillOn.setColor(ColorUtils.setAlphaComponent(primary, 0x66));
        strokeOn.setStyle(Paint.Style.STROKE);
        strokeOn.setStrokeWidth(2.5f * density);
        strokeOn.setColor(primary);

        fillOff.setStyle(Paint.Style.FILL);
        fillOff.setColor(Color.argb(0x22, 0, 0, 0));
        strokeOff.setStyle(Paint.Style.STROKE);
        strokeOff.setStrokeWidth(1.5f * density);
        strokeOff.setColor(Color.argb(0xCC, 0xFF, 0xFF, 0xFF));
        strokeOff.setShadowLayer(2f * density, 0, 0, Color.argb(0x99, 0, 0, 0));
        setLayerType(LAYER_TYPE_SOFTWARE, null); // sombra das caixas

        scaler = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(@NonNull ScaleGestureDetector d) {
                float current = currentScale();
                float factor = d.getScaleFactor();
                float target = Math.max(1f, Math.min(6f, current * factor));
                factor = target / current;
                matrix.postScale(factor, factor, d.getFocusX(), d.getFocusY());
                clampPan();
                invalidate();
                return true;
            }
        });
    }

    public void setListener(Listener l) {
        listener = l;
    }

    /** Troca a imagem (limpa as caixas e o zoom). */
    public void setBitmap(@Nullable Bitmap b) {
        bitmap = b;
        boxes.clear();
        selected = new boolean[0];
        matrixReady = false;
        invalidate();
    }

    public void setLines(List<OcrText.Line> lines, boolean[] initial) {
        boxes.clear();
        for (OcrText.Line l : lines) boxes.add(new RectF(l.left, l.top, l.right, l.bottom));
        selected = initial != null && initial.length == boxes.size() ? initial.clone() : new boolean[boxes.size()];
        invalidate();
    }

    public boolean[] getSelection() {
        return selected.clone();
    }

    public int selectedCount() {
        int n = 0;
        for (boolean b : selected) if (b) n++;
        return n;
    }

    public void selectAll(boolean value) {
        for (int i = 0; i < selected.length; i++) selected[i] = value;
        invalidate();
        if (listener != null) listener.onSelectionChanged();
    }

    // ---------- Desenho ----------

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        matrixReady = false;
    }

    private void fitMatrix() {
        matrix.reset();
        if (bitmap == null || getWidth() == 0 || getHeight() == 0) return;
        float pad = 8 * density;
        float vw = getWidth() - 2 * pad, vh = getHeight() - 2 * pad;
        baseScale = Math.min(vw / bitmap.getWidth(), vh / bitmap.getHeight());
        float dx = pad + (vw - bitmap.getWidth() * baseScale) / 2f;
        float dy = pad + (vh - bitmap.getHeight() * baseScale) / 2f;
        matrix.setScale(baseScale, baseScale);
        matrix.postTranslate(dx, dy);
        matrixReady = true;
    }

    private float currentScale() {
        float[] v = new float[9];
        matrix.getValues(v);
        return v[Matrix.MSCALE_X] / baseScale;
    }

    /** Não deixa a imagem sair da tela ao mover com zoom. */
    private void clampPan() {
        if (bitmap == null) return;
        tmp.set(0, 0, bitmap.getWidth(), bitmap.getHeight());
        matrix.mapRect(tmp);
        float dx = 0, dy = 0;
        float w = getWidth(), h = getHeight();
        if (tmp.width() <= w) dx = (w - tmp.width()) / 2f - tmp.left;
        else if (tmp.left > 0) dx = -tmp.left;
        else if (tmp.right < w) dx = w - tmp.right;
        if (tmp.height() <= h) dy = (h - tmp.height()) / 2f - tmp.top;
        else if (tmp.top > 0) dy = -tmp.top;
        else if (tmp.bottom < h) dy = h - tmp.bottom;
        matrix.postTranslate(dx, dy);
    }

    @Override
    protected void onDraw(@NonNull Canvas canvas) {
        super.onDraw(canvas);
        if (bitmap == null) return;
        if (!matrixReady) fitMatrix();
        canvas.drawBitmap(bitmap, matrix, bitmapPaint);
        float r = 6 * density, inflate = 3 * density;
        for (int i = 0; i < boxes.size(); i++) {
            matrix.mapRect(tmp, boxes.get(i));
            tmp.inset(-inflate, -inflate);
            boolean on = selected[i];
            canvas.drawRoundRect(tmp, r, r, on ? fillOn : fillOff);
            canvas.drawRoundRect(tmp, r, r, on ? strokeOn : strokeOff);
        }
    }

    // ---------- Toque ----------

    private int hitTest(float x, float y) {
        float slop = 8 * density;
        int best = -1;
        float bestDist = Float.MAX_VALUE;
        for (int i = 0; i < boxes.size(); i++) {
            matrix.mapRect(tmp, boxes.get(i));
            tmp.inset(-slop, -slop);
            if (tmp.contains(x, y)) {
                float d = Math.abs(tmp.centerY() - y);
                if (d < bestDist) {
                    bestDist = d;
                    best = i;
                }
            }
        }
        return best;
    }

    private void paintAt(float x, float y) {
        int hit = hitTest(x, y);
        if (hit >= 0 && selected[hit] != paintValue) {
            selected[hit] = paintValue;
            changedInGesture = true;
            invalidate();
            if (listener != null) listener.onSelectionChanged();
        }
    }

    private void updateFocus(MotionEvent e, int skipIndex) {
        float sx = 0, sy = 0;
        int n = 0;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i == skipIndex) continue;
            sx += e.getX(i);
            sy += e.getY(i);
            n++;
        }
        if (n > 0) {
            lastFocusX = sx / n;
            lastFocusY = sy / n;
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (bitmap == null) return false;
        scaler.onTouchEvent(e);
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                getParent().requestDisallowInterceptTouchEvent(true);
                snapshot = selected.clone();
                changedInGesture = false;
                int hit = hitTest(e.getX(), e.getY());
                painting = hit >= 0;
                if (painting) {
                    paintValue = !selected[hit];
                    paintAt(e.getX(), e.getY());
                }
                updateFocus(e, -1);
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN:
                // Segundo dedo: é zoom/mover, então desfaz o que o primeiro dedo marcou
                if (painting && changedInGesture && snapshot != null && snapshot.length == selected.length) {
                    selected = snapshot.clone();
                    invalidate();
                    if (listener != null) listener.onSelectionChanged();
                }
                painting = false;
                updateFocus(e, -1);
                return true;
            case MotionEvent.ACTION_POINTER_UP:
                updateFocus(e, e.getActionIndex());
                return true;
            case MotionEvent.ACTION_MOVE:
                if (e.getPointerCount() == 1) {
                    if (painting) paintAt(e.getX(), e.getY());
                } else {
                    float px = lastFocusX, py = lastFocusY;
                    updateFocus(e, -1);
                    matrix.postTranslate(lastFocusX - px, lastFocusY - py);
                    clampPan();
                    invalidate();
                }
                return true;
            case MotionEvent.ACTION_UP:
                if (painting) performClick();
                painting = false;
                return true;
            case MotionEvent.ACTION_CANCEL:
                painting = false;
                return true;
            default:
                return true;
        }
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }
}
