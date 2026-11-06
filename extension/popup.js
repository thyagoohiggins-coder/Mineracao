'use strict';
const $ = (id) => document.getElementById(id);
const DEFAULTS = { serverUrl: CINEFRASES_SERVER, syncCode: '' };
let es = null;

function randomCode() {
  const words = ['lua', 'sol', 'mar', 'cine', 'rio', 'neon', 'jazz', 'noir', 'pipoca', 'drama'];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint8Array(7));
  return `${words[a[0] % words.length]}-${[...a.slice(1)].map((b) => chars[b % chars.length]).join('')}`;
}

function setStatus(kind, label) {
  $('status').className = `status ${kind}`;
  $('status').querySelector('b').textContent = label;
}

async function config() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  return { serverUrl: (c.serverUrl || DEFAULTS.serverUrl).replace(/\/+$/, ''), syncCode: (c.syncCode || '').trim() };
}

function fmtTime(s) {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + `:${String(sec).padStart(2, '0')}`;
}

function render(phrases) {
  const list = $('list');
  list.textContent = '';
  if (!phrases.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nenhuma frase ainda. Abra um vídeo com legenda e aperte Alt+C.';
    list.appendChild(li);
    return;
  }
  for (const p of phrases.slice(0, 20)) {
    const li = document.createElement('li');
    li.title = 'Clique para copiar';
    const t = document.createElement('span'); t.className = 't'; t.textContent = p.text;
    const m = document.createElement('span'); m.className = 'm';
    m.textContent = [p.sourceName || p.source, p.title, fmtTime(p.videoTime), p.synced === false ? '⏳ pendente' : ''].filter(Boolean).join(' · ');
    li.append(t, m);
    li.addEventListener('click', async () => { await navigator.clipboard.writeText(p.text); m.textContent = 'Copiado ✓'; });
    list.appendChild(li);
  }
}

async function refresh() {
  const cfg = await config();
  const { recent = [], queue = [] } = await chrome.storage.local.get(['recent', 'queue']);
  $('pending').hidden = !queue.length;
  $('pending').textContent = `${queue.length} pendente${queue.length > 1 ? 's' : ''}`;

  if (cfg.serverUrl.includes(CINEFRASES_PLACEHOLDER)) {
    setStatus('warn', 'configure o servidor');
    document.querySelector('details').open = true;
    render(recent);
    return;
  }
  if (!cfg.syncCode) { setStatus('warn', 'sem código'); render(recent); return; }
  try {
    const r = await fetch(`${cfg.serverUrl}/api/rooms/${encodeURIComponent(cfg.syncCode)}/phrases`);
    if (!r.ok) throw new Error();
    const { phrases } = await r.json();
    setStatus('ok', 'sincronizado');
    render([...queue.map((p) => ({ ...p, synced: false })), ...phrases]);
    listen(cfg);
  } catch {
    setStatus('err', 'offline');
    render(recent);
  }
}

// Atualização em tempo real enquanto o popup está aberto (ex.: frase apagada no app)
function listen(cfg) {
  if (es) return;
  es = new EventSource(`${cfg.serverUrl}/api/rooms/${encodeURIComponent(cfg.syncCode)}/stream`);
  let t;
  const again = () => { clearTimeout(t); t = setTimeout(refresh, 150); };
  for (const ev of ['add', 'update', 'delete']) es.addEventListener(ev, again);
  es.onerror = () => setStatus('err', 'offline');
  es.onopen = () => setStatus('ok', 'sincronizado');
}

async function init() {
  const cfg = await config();
  const local = await chrome.storage.local.get({ enabled: true, showButton: true });
  $('code').value = cfg.syncCode;
  $('server').value = cfg.serverUrl;
  $('enabled').checked = local.enabled;
  $('showButton').checked = local.showButton;

  $('gen').onclick = () => { $('code').value = randomCode(); };
  $('save').onclick = async () => {
    const syncCode = $('code').value.trim();
    if (syncCode && !/^[A-Za-z0-9_-]{4,64}$/.test(syncCode)) { setStatus('err', 'código inválido'); return; }
    await chrome.storage.sync.set({ syncCode, serverUrl: ($('server').value.trim() || DEFAULTS.serverUrl).replace(/\/+$/, '') });
    if (es) { es.close(); es = null; }
    await chrome.runtime.sendMessage({ type: 'flush' }).catch(() => {});
    $('save').textContent = 'Salvo ✓';
    setTimeout(() => ($('save').textContent = 'Salvar'), 1200);
    refresh();
  };
  $('enabled').onchange = (e) => chrome.storage.local.set({ enabled: e.target.checked });
  $('showButton').onchange = (e) => chrome.storage.local.set({ showButton: e.target.checked });

  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.recent || ch.queue)) refresh(); });
  refresh();
}
init();
