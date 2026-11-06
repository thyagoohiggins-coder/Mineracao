// CineFrases — content script
// Lê a legenda que está na tela do player, guarda as últimas falas e copia/sincroniza com Alt+C ou pelo botão.
(() => {
  'use strict';
  if (window.__cineFrases) return;
  window.__cineFrases = true;

  // ---------- Seletores de legenda por serviço ----------
  const SITES = [
    { id: 'youtube', name: 'YouTube', host: /(^|\.)youtube\.com$/, lines: ['.ytp-caption-window-container .caption-visual-line'], cues: ['.ytp-caption-segment'],
      title: () => text(document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, h1.title')) || document.title.replace(/ - YouTube$/, '') },
    { id: 'netflix', name: 'Netflix', host: /(^|\.)netflix\.com$/, cues: ['.player-timedtext-text-container', '.player-timedtext'],
      title: () => text(document.querySelector('[data-uia="video-title"]'), ' · ') },
    { id: 'disney', name: 'Disney+', host: /(^|\.)disneyplus\.com$/, cues: ['.dss-subtitle-renderer-cue-window', '.hive-subtitle-renderer-cue-window', '.dss-subtitle-renderer-line', '.hive-subtitle-renderer-line', '[class*="subtitle-renderer"] [class*="cue"]'],
      title: () => text(document.querySelector('.title-field, [data-testid="title-field"], .title-bug-area .title-field')) },
    { id: 'max', name: 'Max', host: /(^|\.)(max|hbomax)\.com$/, cues: ['[data-testid="CueBoxContainer"]', '[data-testid="caption_renderer_overlay"]', '[class*="CaptionWindow"]', '[class*="TextCue"]'],
      title: () => text(document.querySelector('[data-testid="player-ux-asset-title"], [class*="AssetTitle"]')) },
    { id: 'prime', name: 'Prime Video', host: /(^|\.)(primevideo\.com|amazon\.[a-z.]+)$/, cues: ['.atvwebplayersdk-captions-text'],
      title: () => text(document.querySelector('.atvwebplayersdk-title-text')) },
    { id: 'globoplay', name: 'Globoplay', host: /(^|\.)globo\.com$/, cues: ['.vjs-text-track-display div > div', '[class*="subtitle"] span'] },
    { id: 'paramount', name: 'Paramount+', host: /(^|\.)paramountplus\.com$/, cues: ['.vjs-text-track-display div > div', '[class*="caption"] span'] },
    { id: 'crunchyroll', name: 'Crunchyroll', host: /(^|\.)crunchyroll\.com$/, cues: ['[class*="subtitle"]', '.vjs-text-track-display div > div'] },
    { id: 'appletv', name: 'Apple TV+', host: /(^|\.)apple\.com$/, cues: ['[class*="subtitles"] [class*="cue"]', 'amp-video-player-internal [class*="caption"]'] },
  ];
  const site = SITES.find((s) => s.host.test(location.hostname)) || { id: 'outro', name: location.hostname, cues: [] };

  // ---------- Utilidades ----------
  function text(el, sep = ' ') {
    if (!el) return '';
    return (el.innerText || el.textContent || '').split('\n').map((l) => l.trim()).filter(Boolean).join(sep);
  }
  const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0';

  function uniqueTopLevel(els) {
    return els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  }

  function readBySelectors(selectors) {
    for (const sel of selectors || []) {
      let els;
      try { els = [...document.querySelectorAll(sel)]; } catch { continue; }
      els = uniqueTopLevel(els.filter(visible));
      const t = clean(els.map((e) => text(e)).filter(Boolean).join(' '));
      if (t) return t;
    }
    return '';
  }

  function readTextTracks() {
    for (const v of document.querySelectorAll('video')) {
      for (const track of v.textTracks || []) {
        if (track.mode === 'disabled' || !track.activeCues) continue;
        const t = clean([...track.activeCues].map((c) => c.text || '').join(' '));
        if (t) return t;
      }
    }
    return '';
  }

  function currentSubtitle() {
    return readBySelectors(site.lines) || readBySelectors(site.cues) || readTextTracks();
  }

  function mainVideo() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = v; }
    }
    return best;
  }

  function videoTitle() {
    let t = '';
    try { t = site.title ? site.title() : ''; } catch { /* seletor mudou */ }
    t = clean(t || document.title || '');
    return t.toLowerCase() === site.name.toLowerCase() ? '' : t;
  }

  function shareUrl(seconds) {
    if (site.id === 'youtube') {
      const id = new URLSearchParams(location.search).get('v');
      if (id) return `https://www.youtube.com/watch?v=${id}${seconds != null ? `&t=${Math.floor(seconds)}s` : ''}`;
    }
    try { return window.top.location.href; } catch { return location.href; }
  }

  const fmtTime = (s) => {
    if (s == null) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
  };

  // ---------- Histórico das últimas falas ----------
  const HISTORY_MAX = 15;
  const history = []; // { text, videoTime, at }
  let current = '';

  function tick() {
    const t = currentSubtitle();
    if (t === current) return;
    current = t;
    if (t) {
      const v = mainVideo();
      const last = history[history.length - 1];
      if (!last || last.text !== t) {
        history.push({ text: t, videoTime: v ? v.currentTime : null, at: Date.now() });
        if (history.length > HISTORY_MAX) history.shift();
      }
    }
    ui.update();
  }
  setInterval(tick, 250);

  // ---------- Copiar + sincronizar ----------
  async function writeClipboard(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* sem foco/gesto */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      (document.fullscreenElement || document.body).appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  function makeId() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function copyPhrase(entry) {
    entry = entry || (current ? { text: current, videoTime: mainVideo()?.currentTime ?? null } : history[history.length - 1]);
    if (!entry || !entry.text) { ui.toast('Nenhuma legenda na tela. Ative as legendas do player.', 'warn'); return; }

    const copied = await writeClipboard(entry.text);
    const phrase = {
      id: makeId(),
      text: entry.text,
      source: site.id,
      sourceName: site.name,
      title: videoTitle(),
      videoTime: entry.videoTime != null ? Math.round(entry.videoTime) : null,
      url: shareUrl(entry.videoTime),
      createdAt: Date.now(),
    };

    let res = null;
    try { res = await chrome.runtime.sendMessage({ type: 'phrase', phrase }); } catch { /* extensão recarregada */ }

    const sync = !res ? 'extensão desconectada — recarregue a página'
      : res.synced ? 'enviada para o app'
      : res.reason === 'no-code' ? 'configure a extensão (ícone do CineFrases)'
      : 'sem conexão — será enviada depois';
    ui.toast(`${copied ? 'Copiado' : 'Salvo'} ✓ ${sync}`, res && res.synced ? 'ok' : 'warn', entry.text);
  }

  // ---------- Interface (Shadow DOM para não conflitar com o site) ----------
  const ui = (() => {
    const host = document.createElement('div');
    host.id = 'cinefrases-root';
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        .wrap { position: fixed; right: 24px; bottom: 96px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
        .bar { display: flex; gap: 6px; opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s; pointer-events: auto; }
        .bar.show, .bar:hover { opacity: 1; transform: none; }
        button { all: unset; cursor: pointer; background: rgba(20,20,28,.88); color: #fff; border: 1px solid rgba(255,255,255,.18);
          border-radius: 999px; padding: 9px 14px; font-size: 14px; font-weight: 600; backdrop-filter: blur(8px); display: inline-flex; gap: 6px; align-items: center; }
        button:hover { background: #e50914; border-color: #e50914; }
        button.ghost { padding: 9px 11px; }
        .hint { font-weight: 400; opacity: .6; font-size: 12px; }
        .panel { pointer-events: auto; width: min(440px, 80vw); max-height: 50vh; overflow: auto; background: rgba(16,16,22,.95); color: #fff;
          border: 1px solid rgba(255,255,255,.15); border-radius: 14px; padding: 8px; display: none; backdrop-filter: blur(10px); }
        .panel.open { display: block; }
        .panel h4 { margin: 4px 8px 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; opacity: .6; font-weight: 600; }
        .item { display: flex; gap: 10px; padding: 9px 10px; border-radius: 9px; cursor: pointer; font-size: 14px; line-height: 1.35; }
        .item:hover { background: rgba(255,255,255,.09); }
        .item .t { flex: 1; }
        .item .time { opacity: .5; font-size: 12px; font-variant-numeric: tabular-nums; padding-top: 2px; }
        .empty { padding: 12px; opacity: .6; font-size: 13px; }
        .toast { pointer-events: none; max-width: min(460px, 80vw); background: rgba(16,16,22,.95); color: #fff; border-left: 4px solid #22c55e;
          border-radius: 10px; padding: 10px 14px; font-size: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.4); opacity: 0; transform: translateY(8px); transition: .25s; }
        .toast.warn { border-left-color: #f59e0b; }
        .toast.show { opacity: 1; transform: none; }
        .toast q { display: block; margin-top: 4px; opacity: .75; font-style: italic; font-size: 13px; quotes: "“" "”"; }
      </style>
      <div class="wrap">
        <div class="toast"></div>
        <div class="panel"><h4>Últimas falas — clique para copiar</h4><div class="list"></div></div>
        <div class="bar">
          <button class="copy" title="Copiar a frase da tela (Alt+C)">❝ Copiar frase <span class="hint">Alt+C</span></button>
          <button class="ghost hist" title="Últimas falas (Alt+X)">⟲</button>
        </div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const bar = $('.bar'), panel = $('.panel'), list = $('.list'), toastEl = $('.toast');
    let enabled = true, showBtn = true, hideTimer, toastTimer;

    // Impede que o clique pause o vídeo ou dispare atalhos do player
    for (const ev of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
      bar.addEventListener(ev, (e) => e.stopPropagation());
      panel.addEventListener(ev, (e) => e.stopPropagation());
    }
    $('.copy').addEventListener('click', () => copyPhrase());
    $('.hist').addEventListener('click', () => togglePanel());

    const wrap = $('.wrap');
    function attach() {
      const parent = document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
      if (host.parentNode !== parent) parent.appendChild(host);
      // posiciona no canto inferior direito do vídeo (acima dos controles do player)
      const v = mainVideo();
      const r = v && v.getBoundingClientRect();
      if (r && r.width > 200 && r.height > 120) {
        wrap.style.right = `${Math.max(12, innerWidth - Math.min(r.right, innerWidth) + 20)}px`;
        wrap.style.bottom = `${Math.max(12, innerHeight - Math.min(r.bottom, innerHeight) + 70)}px`;
      } else {
        wrap.style.right = '24px';
        wrap.style.bottom = '96px';
      }
    }
    document.addEventListener('fullscreenchange', attach);
    document.addEventListener('webkitfullscreenchange', attach);

    function hasPlayer() { return !!mainVideo(); }

    function showBar() {
      if (!enabled || !showBtn || !hasPlayer()) return;
      attach();
      bar.classList.add('show');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => bar.classList.remove('show'), 2500);
    }
    document.addEventListener('mousemove', showBar, { passive: true });

    function renderPanel() {
      list.textContent = '';
      if (!history.length) {
        const d = document.createElement('div');
        d.className = 'empty';
        d.textContent = 'Nenhuma fala capturada ainda. Ative as legendas do vídeo.';
        list.appendChild(d);
        return;
      }
      for (const h of [...history].reverse()) {
        const row = document.createElement('div');
        row.className = 'item';
        const t = document.createElement('span'); t.className = 't'; t.textContent = h.text;
        const tm = document.createElement('span'); tm.className = 'time'; tm.textContent = fmtTime(h.videoTime);
        row.append(t, tm);
        row.addEventListener('click', () => { copyPhrase(h); panel.classList.remove('open'); });
        list.appendChild(row);
      }
    }
    function togglePanel(force) {
      attach();
      const open = force ?? !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      if (open) renderPanel();
    }

    function toast(msg, kind = 'ok', quote) {
      attach();
      toastEl.className = `toast ${kind}`;
      toastEl.textContent = msg;
      if (quote) { const q = document.createElement('q'); q.textContent = quote.length > 140 ? quote.slice(0, 140) + '…' : quote; toastEl.appendChild(q); }
      requestAnimationFrame(() => toastEl.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }

    chrome.storage.local.get({ enabled: true, showButton: true }, (c) => { enabled = c.enabled; showBtn = c.showButton; });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.enabled) enabled = ch.enabled.newValue;
      if (ch.showButton) showBtn = ch.showButton.newValue;
    });

    return {
      toast, togglePanel,
      get enabled() { return enabled; },
      update() { if (panel.classList.contains('open')) renderPanel(); },
    };
  })();

  // ---------- Atalhos ----------
  window.addEventListener('keydown', (e) => {
    if (!ui.enabled || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.code === 'KeyC') { e.preventDefault(); e.stopPropagation(); copyPhrase(); }
    else if (e.code === 'KeyX') { e.preventDefault(); e.stopPropagation(); ui.togglePanel(); }
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui.togglePanel(false); }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'copy-now' && (current || history.length) && mainVideo()) copyPhrase();
  });

})();
