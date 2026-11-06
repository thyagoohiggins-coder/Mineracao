// Estudos Plus — content script
// Detecta a legenda que está na tela do player, guarda as últimas falas e copia/sincroniza com Alt+C ou pelo botão.
(() => {
  'use strict';

  // Se a extensão foi recarregada, a instância antiga desta aba se desliga e esta assume.
  const INSTANCE = Math.random().toString(36).slice(2);
  // ('cinefrases:takeover' também desliga instâncias da versão antiga, de antes da troca de nome)
  for (const ev of ['estudosplus:takeover', 'cinefrases:takeover']) document.dispatchEvent(new CustomEvent(ev, { detail: INSTANCE }));
  const cleanups = [];
  document.addEventListener('estudosplus:takeover', function onTakeover(e) {
    if (e.detail === INSTANCE) return;
    document.removeEventListener('estudosplus:takeover', onTakeover);
    cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  });
  const alive = () => { try { return !!chrome.runtime.id; } catch { return false; } };

  // ---------- Seletores conhecidos por serviço (se falharem, há detecção genérica) ----------
  const SITES = [
    { id: 'youtube', name: 'YouTube', host: /(^|\.)youtube(-nocookie)?\.com$/, lines: ['.ytp-caption-window-container .caption-visual-line'], cues: ['.ytp-caption-segment'],
      title: () => text(q('ytd-watch-metadata h1, h1.ytd-watch-metadata, h1.title')) || document.title.replace(/ - YouTube$/, '') },
    { id: 'netflix', name: 'Netflix', host: /(^|\.)netflix\.com$/, cues: ['.player-timedtext-text-container', '.player-timedtext'],
      title: () => text(q('[data-uia="video-title"]'), ' · ') },
    { id: 'disney', name: 'Disney+', host: /(^|\.)disneyplus\.com$/, cues: ['.hive-subtitle-renderer-line', '.dss-subtitle-renderer-line', '.hive-subtitle-renderer-cue-window', '.dss-subtitle-renderer-cue-window', '[class*="subtitle-renderer"]'],
      title: () => text(q('.title-field, [data-testid="title-field"], .title-bug-area .title-field')) },
    { id: 'max', name: 'Max', host: /(^|\.)(max|hbomax)\.com$/, cues: ['[data-testid="CueBoxContainer"]', '[data-testid="caption_renderer_overlay"]', '[class*="CaptionWindow"]', '[class*="TextCue"]'],
      title: () => text(q('[data-testid="player-ux-asset-title"], [class*="AssetTitle"]')) },
    { id: 'prime', name: 'Prime Video', host: /(^|\.)(primevideo\.com|amazon\.[a-z.]+)$/, cues: ['.atvwebplayersdk-captions-text'],
      title: () => text(q('.atvwebplayersdk-title-text')) },
    { id: 'globoplay', name: 'Globoplay', host: /(^|\.)globo\.com$/, cues: ['.vjs-text-track-display div > div'] },
    { id: 'paramount', name: 'Paramount+', host: /(^|\.)paramountplus\.com$/, cues: ['.vjs-text-track-display div > div'] },
    { id: 'crunchyroll', name: 'Crunchyroll', host: /(^|\.)crunchyroll\.com$/, cues: ['.vjs-text-track-display div > div'] },
    { id: 'appletv', name: 'Apple TV+', host: /(^|\.)apple\.com$/, cues: [] },
  ];
  const site = SITES.find((s) => s.host.test(location.hostname)) || { id: 'outro', name: location.hostname.replace(/^www\./, ''), cues: [] };

  // Qualquer elemento de legenda/caption sobre o vídeo (plano B quando o site muda o HTML)
  const GENERIC = [
    '[class*="caption" i]', '[class*="subtitle" i]', '[class*="timedtext" i]', '[class*="cue" i]', '[class*="legenda" i]',
    '[id*="caption" i]', '[id*="subtitle" i]', '[data-testid*="caption" i]', '[data-testid*="subtitle" i]', '[data-testid*="cue" i]',
  ].join(',');
  const NOT_SUBTITLE = /(button|btn|menu|setting|toggle|icon|control|track-?select|picker|option|label|tooltip|badge)/i;

  // ---------- Utilidades ----------
  function text(el, sep = ' ') {
    if (!el) return '';
    return (el.innerText || el.textContent || '').split('\n').map((l) => l.trim()).filter(Boolean).join(sep);
  }
  const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Shadow DOM: muitos players (ex.: Disney+) colocam o vídeo e a legenda dentro dele
  const shadowOf = (el) => {
    try { if (chrome.dom && chrome.dom.openOrClosedShadowRoot) return chrome.dom.openOrClosedShadowRoot(el); } catch { /* ignore */ }
    return el.shadowRoot;
  };
  let roots = [document], rootsAt = 0;
  function allRoots() {
    if (Date.now() - rootsAt < 2000) return roots;
    rootsAt = Date.now();
    const out = [document];
    const walk = (root) => {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      for (let el = tw.nextNode(); el; el = tw.nextNode()) {
        if (el.id === 'estudosplus-root' || el.id === 'cinefrases-root') continue;
        const sr = shadowOf(el);
        if (sr) { out.push(sr); walk(sr); }
      }
    };
    try { walk(document.documentElement); } catch { /* ignore */ }
    roots = out;
    return roots;
  }
  function qsa(sel) {
    const out = [];
    for (const r of allRoots()) { try { out.push(...r.querySelectorAll(sel)); } catch { /* seletor inválido */ } }
    return out;
  }
  const q = (sel) => qsa(sel)[0] || null;

  function visible(el) {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }
  const uniqueTopLevel = (els) => els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  const byPosition = (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left;

  function mainVideo() {
    let best = null, area = 0;
    for (const v of qsa('video')) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; best = v; }
    }
    return area > 0 ? best : null;
  }

  // ---------- Leitura da legenda ----------
  function readBySelectors(selectors) {
    for (const sel of selectors || []) {
      const els = uniqueTopLevel(qsa(sel).filter(visible)).sort(byPosition);
      const t = clean(els.map((e) => text(e)).filter(Boolean).join(' '));
      if (t) return t;
    }
    return '';
  }

  function readTextTracks(video) {
    for (const v of video ? [video, ...qsa('video')] : qsa('video')) {
      for (const track of v.textTracks || []) {
        if (track.mode === 'disabled' || !track.cues) continue;
        let cues = track.activeCues ? [...track.activeCues] : [];
        if (!cues.length) { // calcula pelo tempo do vídeo, caso o navegador não tenha atualizado activeCues
          const now = v.currentTime;
          cues = [...track.cues].filter((c) => c.startTime <= now && now < c.endTime);
        }
        const t = clean(cues.map((c) => c.text || '').join(' '));
        if (t) return t;
      }
    }
    return '';
  }

  function readGeneric(video) {
    if (!video) return '';
    const vr = video.getBoundingClientRect();
    let els = qsa(GENERIC).filter((el) => {
      if (el.id === 'estudosplus-root' || /^(BUTTON|INPUT|SELECT|OPTION|LABEL|A|VIDEO|TRACK|svg)$/i.test(el.tagName)) return false;
      const cls = `${typeof el.className === 'string' ? el.className : ''} ${el.id} ${el.getAttribute('data-testid') || ''}`;
      if (NOT_SUBTITLE.test(cls)) return false;
      if (el.closest('button,[role="button"],[role="menu"],[role="menuitem"],[role="dialog"],[role="listbox"]')) return false;
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      if (!(r.left < vr.right && r.right > vr.left && r.top < vr.bottom && r.bottom > vr.top)) return false; // sobre o vídeo
      if (el.querySelector('button,input,select,a[href]')) return false;
      const t = text(el);
      return t && t.length <= 400;
    });
    els = uniqueTopLevel(els).sort(byPosition);
    return clean(els.map((e) => text(e)).join(' '));
  }

  function currentSubtitle() {
    const v = mainVideo();
    if (!v) return '';
    return readBySelectors(site.lines) || readBySelectors(site.cues) || readTextTracks(v) || readGeneric(v);
  }

  function videoTitle() {
    let t = '';
    try { t = site.title ? site.title() : ''; } catch { /* seletor mudou */ }
    t = clean(t || document.title || '');
    return t.toLowerCase() === site.name.toLowerCase() ? '' : t;
  }

  function shareUrl(seconds) {
    if (site.id === 'youtube') {
      const id = new URLSearchParams(location.search).get('v') || (location.pathname.match(/\/embed\/([\w-]+)/) || [])[1];
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

  // ---------- Ativa neste site? (redes sociais ficam desligadas por padrão) ----------
  const topHost = (() => {
    try { if (location.ancestorOrigins && location.ancestorOrigins.length) return new URL(location.ancestorOrigins[location.ancestorOrigins.length - 1]).hostname; } catch { /* ignore */ }
    try { return window.top.location.hostname; } catch { return location.hostname; }
  })();
  const SITES_CFG = globalThis.EP_SITES || { isBlocked: () => false };
  let blocked = SITES_CFG.isBlocked(topHost, {});
  try {
    chrome.storage.local.get({ sitePrefs: {} }, (c) => { blocked = SITES_CFG.isBlocked(topHost, c.sitePrefs); });
    chrome.storage.onChanged.addListener((ch) => { if (ch.sitePrefs) blocked = SITES_CFG.isBlocked(topHost, ch.sitePrefs.newValue); });
  } catch { /* extensão recarregada */ }

  // ---------- Histórico das últimas falas ----------
  const HISTORY_MAX = 20;
  const history = []; // { text, videoTime, at }
  let current = '';
  let hasVideo = false;     // há vídeo E a extensão está ativa neste site
  let videoPresent = false; // há vídeo (mesmo com a extensão desligada aqui)

  function tick() {
    if (!alive()) return;
    const v = mainVideo();
    videoPresent = !!v;
    hasVideo = !!v && !blocked;
    if (blocked) { current = ''; ui.hide(); return; }
    const t = v ? currentSubtitle() : '';
    if (t === current) return;
    current = t;
    if (t) {
      const last = history[history.length - 1];
      if (!last || last.text !== t) {
        history.push({ text: t, videoTime: v ? v.currentTime : null, at: Date.now() });
        if (history.length > HISTORY_MAX) history.shift();
      }
    }
    ui.update();
  }

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
    const v = mainVideo();
    if (!entry) {
      const live = currentSubtitle();
      const selected = clean(String(window.getSelection() || ''));
      if (live) entry = { text: live, videoTime: v ? v.currentTime : null };
      else if (selected) entry = { text: selected, videoTime: v ? v.currentTime : null };
      else if (history.length && Date.now() - history[history.length - 1].at < 15000) entry = history[history.length - 1];
    }
    if (!entry || !entry.text) {
      ui.toast('Nenhuma legenda na tela', 'warn', 'Ative as legendas (CC) do player e tente de novo.');
      return;
    }

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

    if (!res) ui.toast(copied ? 'Frase copiada' : 'Não foi possível copiar', 'warn', 'Recarregue a página para enviar ao Estudos Plus.');
    else if (res.synced) ui.toast(copied ? 'Salva no Estudos Plus e copiada' : 'Salva no Estudos Plus', 'ok', entry.text);
    else ui.toast(copied ? 'Frase copiada — envio pendente' : 'Envio pendente', 'warn', 'Sem conexão agora. Será enviada automaticamente.');
  }

  // ---------- Interface (Shadow DOM fechado para não conflitar com o site) ----------
  const ui = (() => {
    const host = document.createElement('div');
    host.id = 'estudosplus-root';
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const ICON = {
      quote: '<svg viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>',
      history: '<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
      alert: '<svg viewBox="0 0 24 24"><path d="M11 15h2v2h-2zm0-8h2v6h-2z"/></svg>',
    };
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
        svg { width: 16px; height: 16px; fill: currentColor; flex: 0 0 auto; }
        .wrap { position: fixed; right: 24px; bottom: 96px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
        .surface { background: rgba(17,19,26,.86); border: 1px solid rgba(255,255,255,.10); box-shadow: 0 12px 32px rgba(0,0,0,.40); backdrop-filter: blur(16px) saturate(150%); color: #f3f4f7; }
        .bar { display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px;
          opacity: 0; transform: translateY(6px); transition: opacity .18s ease, transform .18s ease; pointer-events: none; }
        .bar.show, .bar:hover { opacity: 1; transform: none; pointer-events: auto; }
        button { all: unset; cursor: pointer; color: inherit; border-radius: 8px; height: 32px; padding: 0 10px; font-size: 13px; font-weight: 600;
          display: inline-flex; gap: 8px; align-items: center; transition: background .15s; }
        button:hover { background: rgba(255,255,255,.10); }
        button:focus-visible { outline: 2px solid #818cf8; outline-offset: 1px; }
        .copy .ic { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #4f46e5; color: #fff; }
        .copy .ic svg { width: 14px; height: 14px; }
        kbd { font: 600 10.5px/1 ui-monospace, "SF Mono", Menlo, monospace; color: rgba(255,255,255,.55); border: 1px solid rgba(255,255,255,.18); border-radius: 5px; padding: 3px 5px; }
        .sep { width: 1px; height: 18px; background: rgba(255,255,255,.12); margin: 0 2px; }
        .hist { color: rgba(255,255,255,.75); padding: 0 8px; }
        .panel { pointer-events: auto; width: min(420px, 80vw); max-height: 46vh; overflow: auto; border-radius: 14px; padding: 6px; display: none; }
        .panel.open { display: block; }
        .panel header { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px 6px; font-size: 11px;
          text-transform: uppercase; letter-spacing: .07em; color: rgba(255,255,255,.5); font-weight: 600; }
        .item { display: flex; gap: 12px; align-items: baseline; padding: 9px 10px; border-radius: 9px; cursor: pointer; font-size: 14px; line-height: 1.45; }
        .item:hover { background: rgba(255,255,255,.07); }
        .item .t { flex: 1; }
        .item .time { color: rgba(255,255,255,.4); font-size: 12px; font-variant-numeric: tabular-nums; }
        .empty { padding: 14px 10px; color: rgba(255,255,255,.6); font-size: 13px; }
        .toast { display: flex; gap: 12px; align-items: flex-start; pointer-events: none; max-width: min(400px, 80vw); border-radius: 12px; padding: 11px 14px 11px 12px;
          opacity: 0; transform: translateY(8px); transition: .22s ease; }
        .toast.show { opacity: 1; transform: none; }
        .toast .ic { flex: 0 0 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #22c55e; color: #052e13; }
        .toast .ic svg { width: 14px; height: 14px; }
        .toast.warn .ic { background: #f59e0b; color: #2b1700; }
        .toast b { display: block; font-size: 13.5px; font-weight: 600; line-height: 22px; }
        .toast span.d { display: block; margin-top: 1px; color: rgba(255,255,255,.68); font-size: 13px; line-height: 1.4; }
        .brand { color: rgba(255,255,255,.45); font-weight: 600; }
      </style>
      <div class="wrap">
        <div class="toast surface" role="status"><div class="ic"></div><div><b></b><span class="d"></span></div></div>
        <div class="panel surface"><header><span>Últimas falas</span><span>clique para salvar</span></header><div class="list"></div></div>
        <div class="bar surface">
          <button class="copy" title="Salvar a frase da tela (Alt+C)"><span class="ic">${ICON.quote}</span>Salvar frase <kbd>Alt C</kbd></button>
          <span class="sep"></span>
          <button class="hist" title="Últimas falas (Alt+X)">${ICON.history}</button>
        </div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const wrap = $('.wrap'), bar = $('.bar'), panel = $('.panel'), list = $('.list'), toastEl = $('.toast');
    let enabled = true, showBtn = true, hideTimer, toastTimer;

    // Impede que o clique pause o vídeo ou dispare atalhos do player
    for (const ev of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
      bar.addEventListener(ev, (e) => e.stopPropagation());
      panel.addEventListener(ev, (e) => e.stopPropagation());
    }
    $('.copy').addEventListener('click', () => copyPhrase());
    $('.hist').addEventListener('click', () => togglePanel());

    function attach() {
      const parent = document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
      if (host.parentNode !== parent) parent.appendChild(host);
      const v = mainVideo();
      const r = v && v.getBoundingClientRect();
      if (r && r.width > 420 && r.height > 260) {
        // canto inferior direito do vídeo, acima dos controles do player — sem sair da tela
        wrap.style.right = `${Math.min(innerWidth - 200, Math.max(12, innerWidth - Math.min(r.right, innerWidth) + 20))}px`;
        wrap.style.bottom = `${Math.min(innerHeight * 0.45, Math.max(12, innerHeight - Math.min(r.bottom, innerHeight) + 80))}px`;
      } else {
        wrap.style.right = '24px';
        wrap.style.bottom = '96px';
      }
    }
    const onFs = () => attach();
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);

    function showBar() {
      if (!enabled || !showBtn || !hasVideo) return;
      if (site.id === 'outro' && !history.length) return; // site genérico: só com legenda detectada
      attach();
      bar.classList.add('show');
      host.dataset.bar = 'on';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { bar.classList.remove('show'); host.dataset.bar = 'off'; }, 2500);
    }
    document.addEventListener('mousemove', showBar, { passive: true });

    function renderPanel() {
      list.textContent = '';
      if (!history.length) {
        const d = document.createElement('div');
        d.className = 'empty';
        d.textContent = 'Nenhuma fala capturada ainda. Ative as legendas (CC) do vídeo.';
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

    function toast(title, kind = 'ok', detail = '') {
      attach();
      toastEl.className = `toast surface ${kind}`;
      $('.toast .ic').innerHTML = kind === 'ok' ? ICON.check : ICON.alert;
      $('.toast b').textContent = title;
      const d = detail.length > 160 ? detail.slice(0, 160) + '…' : detail;
      $('.toast .d').textContent = kind === 'ok' && detail ? `“${d}”` : d;
      requestAnimationFrame(() => toastEl.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
    }

    try {
      chrome.storage.local.get({ enabled: true, showButton: true }, (c) => { enabled = c.enabled; showBtn = c.showButton; });
      chrome.storage.onChanged.addListener((ch) => {
        if (ch.enabled) enabled = ch.enabled.newValue;
        if (ch.showButton) showBtn = ch.showButton.newValue;
      });
    } catch { /* extensão recarregada */ }

    cleanups.push(() => {
      host.remove();
      document.removeEventListener('mousemove', showBar);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    });

    function hide() {
      if (!host.parentNode) return;
      bar.classList.remove('show');
      panel.classList.remove('open');
      toastEl.classList.remove('show');
      host.dataset.bar = 'off';
    }

    return {
      toast, togglePanel, hide,
      get enabled() { return enabled; },
      update() { if (panel.classList.contains('open')) renderPanel(); },
    };
  })();

  const timer = setInterval(tick, 250);
  cleanups.push(() => clearInterval(timer));

  // ---------- Atalhos ----------
  const onKey = (e) => {
    if (!alive() || !ui.enabled || !hasVideo) return;
    if (e.key === 'Escape') { ui.togglePanel(false); return; }
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.code === 'KeyC') { e.preventDefault(); e.stopPropagation(); copyPhrase(); }
    else if (e.code === 'KeyX') { e.preventDefault(); e.stopPropagation(); ui.togglePanel(); }
  };
  window.addEventListener('keydown', onKey, true);
  cleanups.push(() => window.removeEventListener('keydown', onKey, true));

  // Mensagens do popup / atalho global. Só responde o frame que tem vídeo.
  const onMessage = (msg, _sender, sendResponse) => {
    if (!msg || !videoPresent) return false;
    if (blocked) {
      if (msg.type === 'status') sendResponse({ site: site.name, video: true, blocked: true });
      return false;
    }
    if (msg.type === 'copy-now') { copyPhrase(); return false; }
    if (msg.type === 'status') {
      sendResponse({ site: site.name, video: true, subtitle: currentSubtitle(), captured: history.length });
      return false;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(onMessage);
  cleanups.push(() => { try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* ignore */ } });
})();
