'use strict';
const $ = (id) => document.getElementById(id);
const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;
let es = null;
let code = '';

function randomCode() {
  const words = ['lua', 'sol', 'mar', 'cine', 'rio', 'neon', 'jazz', 'noir', 'pipoca', 'drama'];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint8Array(7));
  return `${words[a[0] % words.length]}-${[...a.slice(1)].map((b) => chars[b % chars.length]).join('')}`;
}
const api = (c) => `${CINEFRASES_SERVER}/api/rooms/${encodeURIComponent(c)}`;

function setStatus(ok) {
  $('status').className = `dot ${ok ? 'ok' : 'err'}`;
  $('status').title = ok ? 'Sincronizado com o app' : 'Sem conexão — as frases serão enviadas depois';
}

function fmtTime(s) {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + `:${String(sec).padStart(2, '0')}`;
}

// ---------- Código (tela "Conectar o app") ----------
async function loadCode() {
  let { syncCode } = await chrome.storage.sync.get('syncCode');
  if (!syncCode) {
    syncCode = randomCode();
    await chrome.storage.sync.set({ syncCode });
  }
  code = syncCode;
  $('code').textContent = code;
}

function showConnect(on) {
  $('home').hidden = on;
  $('connect').hidden = !on;
  editMode(false);
}

function editMode(on) {
  $('codeView').hidden = on;
  $('codeEdit').hidden = !on;
  $('codeError').hidden = true;
  if (on) { $('codeInput').value = code; $('codeInput').select(); $('codeInput').focus(); }
}

// ---------- Chave "Ativa em <site>" ----------
async function setupSiteToggle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) return;
  const host = EP_SITES.hostKey(new URL(tab.url).hostname);
  const { sitePrefs = {} } = await chrome.storage.local.get('sitePrefs');
  $('siteRow').hidden = false;
  $('siteHost').textContent = host;
  $('siteEnabled').checked = !EP_SITES.isBlocked(host, sitePrefs);
  $('siteEnabled').onchange = async (e) => {
    const { sitePrefs: prefs = {} } = await chrome.storage.local.get('sitePrefs');
    prefs[host] = e.target.checked;
    await chrome.storage.local.set({ sitePrefs: prefs });
  };
  // Garante o script na aba (ex.: aberta antes da instalação)
  chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['sites.js', 'content.js'] }).catch(() => {});
}

// ---------- Lista ----------
function render(phrases) {
  const list = $('list');
  list.textContent = '';
  if (!phrases.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nenhuma frase ainda.\nAbra um vídeo com legenda e pressione Alt+C.';
    li.style.whiteSpace = 'pre-line';
    list.appendChild(li);
    return;
  }
  for (const p of phrases.slice(0, 30)) {
    const li = document.createElement('li');
    li.title = 'Clique para copiar';
    const t = document.createElement('span'); t.className = 't'; t.textContent = p.text;
    const m = document.createElement('span'); m.className = 'm';
    const meta = () => [p.sourceName || p.source, p.title, fmtTime(p.videoTime), p.synced === false ? 'envio pendente' : ''].filter(Boolean).join(' · ');
    m.textContent = meta();
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Apagar frase';
    del.setAttribute('aria-label', 'Apagar frase');
    del.innerHTML = '<svg><use href="#i-trash"/></svg>';
    del.addEventListener('click', (e) => { e.stopPropagation(); removePhrase(p, li); });
    li.append(t, m, del);
    li.addEventListener('click', async () => {
      await navigator.clipboard.writeText(p.text);
      m.textContent = 'Copiada';
      m.classList.add('copied');
      setTimeout(() => { m.textContent = meta(); m.classList.remove('copied'); }, 1200);
    });
    list.appendChild(li);
  }
}

// ---------- Apagar (com Desfazer) ----------
let undoTimer;
function showUndo(p) {
  clearTimeout(undoTimer);
  $('undoMsg').textContent = 'Frase apagada';
  $('undoBtn').hidden = false;
  $('undoBar').hidden = false;
  $('undoBtn').onclick = () => { $('undoBar').hidden = true; restorePhrase(p); };
  undoTimer = setTimeout(() => ($('undoBar').hidden = true), 6000);
}

function showError(msg) {
  clearTimeout(undoTimer);
  $('undoMsg').textContent = msg;
  $('undoBtn').hidden = true;
  $('undoBar').hidden = false;
  undoTimer = setTimeout(() => { $('undoBar').hidden = true; $('undoMsg').textContent = 'Frase apagada'; $('undoBtn').hidden = false; }, 3000);
}

async function dropLocal(id) {
  const { recent = [], queue = [] } = await chrome.storage.local.get(['recent', 'queue']);
  const q = queue.filter((x) => x.id !== id);
  await chrome.storage.local.set({ recent: recent.filter((x) => x.id !== id), queue: q });
  chrome.action.setBadgeText({ text: q.length ? String(q.length) : '' });
}

async function removePhrase(p, li) {
  li.classList.add('removing');
  try {
    if (p.synced !== false) {
      const r = await fetch(`${api(code)}/phrases/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error();
    }
    await dropLocal(p.id); // dispara refresh() via storage.onChanged
    li.remove();
    showUndo(p);
  } catch {
    li.classList.remove('removing');
    showError('Sem conexão — não foi possível apagar');
  }
}

async function restorePhrase(p) {
  const { synced, ...phrase } = p;
  try {
    if (synced === false) throw new Error('local');
    const r = await fetch(`${api(code)}/phrases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(phrase),
    });
    if (!r.ok) throw new Error();
    if (p.favorite || p.note) {
      await fetch(`${api(code)}/phrases/${encodeURIComponent(p.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !!p.favorite, note: p.note || '' }),
      });
    }
    refresh();
  } catch {
    // Offline (ou era só local): volta para a fila e é enviada depois
    const { queue = [] } = await chrome.storage.local.get('queue');
    if (!queue.some((x) => x.id === p.id)) queue.unshift(phrase);
    await chrome.storage.local.set({ queue });
    chrome.action.setBadgeText({ text: String(queue.length) });
    chrome.runtime.sendMessage({ type: 'flush' }).catch(() => {});
  }
}

async function refresh() {
  const { recent = [], queue = [] } = await chrome.storage.local.get(['recent', 'queue']);
  $('pending').hidden = !queue.length;
  $('pending').textContent = `${queue.length} frase${queue.length > 1 ? 's' : ''} aguardando conexão`;
  try {
    const r = await fetch(`${api(code)}/phrases`);
    if (!r.ok) throw new Error();
    const { phrases } = await r.json();
    setStatus(true);
    render([...queue.map((p) => ({ ...p, synced: false })), ...phrases]);
    listen();
  } catch {
    setStatus(false);
    render(recent);
  }
}

// Tempo real enquanto o popup está aberto (ex.: frase apagada no app)
function listen() {
  if (es) return;
  es = new EventSource(`${api(code)}/stream`);
  let t;
  const again = () => { clearTimeout(t); t = setTimeout(refresh, 150); };
  for (const ev of ['add', 'update', 'delete']) es.addEventListener(ev, again);
  es.onerror = () => setStatus(false);
  es.onopen = () => setStatus(true);
}

async function init() {
  await loadCode();
  const local = await chrome.storage.local.get({ showButton: true });
  $('showButton').checked = local.showButton;
  $('showButton').onchange = (e) => chrome.storage.local.set({ showButton: e.target.checked });

  $('openConnect').onclick = () => showConnect(true);
  $('closeConnect').onclick = () => showConnect(false);
  $('copyCode').onclick = async () => {
    await navigator.clipboard.writeText(code);
    const label = $('copyCode').querySelector('span');
    label.textContent = 'Copiado';
    setTimeout(() => (label.textContent = 'Copiar'), 1200);
  };
  $('editCode').onclick = () => editMode(true);
  $('cancelEdit').onclick = () => editMode(false);
  $('genCode').onclick = () => { $('codeInput').value = randomCode(); };
  $('codeEdit').onsubmit = async (e) => {
    e.preventDefault();
    const next = $('codeInput').value.trim();
    if (!CODE_RE.test(next)) { $('codeError').hidden = false; return; }
    await chrome.storage.sync.set({ syncCode: next });
    code = next;
    $('code').textContent = code;
    editMode(false);
    if (es) { es.close(); es = null; }
    await chrome.runtime.sendMessage({ type: 'flush' }).catch(() => {});
    refresh();
  };

  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.recent || ch.queue)) refresh(); });
  refresh();
  setupSiteToggle();
}
init();
