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

function setStatus(kind, label) {
  $('status').className = `pill ${kind}`;
  $('status').querySelector('b').textContent = label;
}

function fmtTime(s) {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + `:${String(sec).padStart(2, '0')}`;
}

// ---------- Código ----------
async function loadCode() {
  let { syncCode } = await chrome.storage.sync.get('syncCode');
  if (!syncCode) {
    syncCode = randomCode();
    await chrome.storage.sync.set({ syncCode });
  }
  code = syncCode;
  $('code').textContent = code;
}

function editMode(on) {
  $('codeView').hidden = on;
  $('codeEdit').hidden = !on;
  $('codeError').hidden = true;
  if (on) { $('codeInput').value = code; $('codeInput').select(); $('codeInput').focus(); }
}

// ---------- Diagnóstico da aba ----------
async function checkTab() {
  const box = $('tab');
  const set = (kind, icon, title, detail) => {
    box.className = `tab ${kind}`;
    $('tabIcon').setAttribute('href', `#i-${icon}`);
    $('tabTitle').textContent = title;
    $('tabDetail').textContent = '';
    if (detail instanceof Node) $('tabDetail').appendChild(detail); else $('tabDetail').textContent = detail || '';
  };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) {
    set('', 'play', 'Abra um vídeo para começar', 'Netflix, Disney+, Max, Prime Video, YouTube e outros.');
    $('copyNow').hidden = true;
    return;
  }
  let st = null;
  try { st = await chrome.tabs.sendMessage(tab.id, { type: 'status' }); } catch { /* sem script na aba */ }
  if (!st) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });
      await new Promise((r) => setTimeout(r, 400));
      st = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    } catch { /* página protegida */ }
  }
  if (!st) {
    set('', 'play', 'Nenhum vídeo nesta aba', 'Dê play no vídeo e abra este menu de novo.');
    $('copyNow').hidden = true;
  } else if (st.subtitle) {
    const q = document.createElement('q');
    q.textContent = st.subtitle.length > 120 ? st.subtitle.slice(0, 120) + '…' : st.subtitle;
    set('ok', 'check', `Legenda detectada · ${st.site}`, q);
    $('copyNow').hidden = false;
  } else {
    set('warn', 'alert', `Vídeo encontrado · ${st.site}`, st.captured
      ? 'Nenhuma legenda na tela agora (aparece quando alguém fala).'
      : 'Ative as legendas (CC) no player para poder copiar as frases.');
    $('copyNow').hidden = !st.captured;
  }
}

// ---------- Lista ----------
function render(phrases) {
  const list = $('list');
  list.textContent = '';
  if (!phrases.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nenhuma frase ainda. Abra um vídeo com legenda e pressione Alt+C.';
    list.appendChild(li);
    return;
  }
  for (const p of phrases.slice(0, 20)) {
    const li = document.createElement('li');
    li.title = 'Clique para copiar';
    const t = document.createElement('span'); t.className = 't'; t.textContent = p.text;
    const m = document.createElement('span'); m.className = 'm';
    const meta = () => [p.sourceName || p.source, p.title, fmtTime(p.videoTime), p.synced === false ? 'envio pendente' : ''].filter(Boolean).join(' · ');
    m.textContent = meta();
    li.append(t, m);
    li.addEventListener('click', async () => {
      await navigator.clipboard.writeText(p.text);
      m.textContent = 'Copiada';
      setTimeout(() => { m.textContent = meta(); }, 1200);
    });
    list.appendChild(li);
  }
}

async function refresh() {
  const { recent = [], queue = [] } = await chrome.storage.local.get(['recent', 'queue']);
  $('pending').hidden = !queue.length;
  $('pending').textContent = `${queue.length} pendente${queue.length > 1 ? 's' : ''}`;
  try {
    const r = await fetch(`${api(code)}/phrases`);
    if (!r.ok) throw new Error();
    const { phrases } = await r.json();
    setStatus('ok', 'sincronizado');
    render([...queue.map((p) => ({ ...p, synced: false })), ...phrases]);
    listen();
  } catch {
    setStatus('err', 'sem conexão');
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
  es.onerror = () => setStatus('err', 'sem conexão');
  es.onopen = () => setStatus('ok', 'sincronizado');
}

async function init() {
  await loadCode();
  const local = await chrome.storage.local.get({ enabled: true, showButton: true });
  $('enabled').checked = local.enabled;
  $('showButton').checked = local.showButton;

  $('copyCode').onclick = async () => {
    await navigator.clipboard.writeText(code);
    const label = $('copyCode').querySelector('span');
    label.textContent = 'Copiado';
    setTimeout(() => (label.textContent = 'Copiar'), 1200);
  };
  $('editCode').onclick = (e) => { e.preventDefault(); editMode(true); };
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
  $('copyNow').onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.tabs.sendMessage(tab.id, { type: 'copy-now' }).catch(() => {});
    setTimeout(() => window.close(), 300);
  };
  $('enabled').onchange = (e) => chrome.storage.local.set({ enabled: e.target.checked });
  $('showButton').onchange = (e) => chrome.storage.local.set({ showButton: e.target.checked });

  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.recent || ch.queue)) refresh(); });
  refresh();
  checkTab();
}
init();
