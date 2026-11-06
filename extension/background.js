// CineFrases — service worker
// Recebe as frases do content script, envia ao servidor e mantém uma fila offline.
'use strict';
importScripts('config.js');

const DEFAULTS = { serverUrl: CINEFRASES_SERVER, syncCode: '' };
const RECENT_MAX = 50;

async function getConfig() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  return { serverUrl: (c.serverUrl || DEFAULTS.serverUrl).replace(/\/+$/, ''), syncCode: (c.syncCode || '').trim() };
}

async function postPhrase(cfg, phrase) {
  const res = await fetch(`${cfg.serverUrl}/api/rooms/${encodeURIComponent(cfg.syncCode)}/phrases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(phrase),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function addRecent(phrase, synced) {
  const { recent = [] } = await chrome.storage.local.get('recent');
  recent.unshift({ ...phrase, synced });
  await chrome.storage.local.set({ recent: recent.slice(0, RECENT_MAX) });
}

async function markSynced(ids) {
  const { recent = [] } = await chrome.storage.local.get('recent');
  const set = new Set(ids);
  await chrome.storage.local.set({ recent: recent.map((p) => (set.has(p.id) ? { ...p, synced: true } : p)) });
}

async function enqueue(phrase) {
  const { queue = [] } = await chrome.storage.local.get('queue');
  queue.push(phrase);
  await chrome.storage.local.set({ queue });
  updateBadge(queue.length);
}

function updateBadge(n) {
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
}

let flushing = false;
async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const cfg = await getConfig();
    let { queue = [] } = await chrome.storage.local.get('queue');
    if (!cfg.syncCode || cfg.serverUrl.includes(CINEFRASES_PLACEHOLDER) || !queue.length) return updateBadge(queue.length);
    const sent = [];
    for (const p of queue) {
      try { await postPhrase(cfg, p); sent.push(p.id); } catch { break; } // servidor fora do ar: tenta depois
    }
    // relê a fila (pode ter recebido itens novos durante o envio)
    ({ queue = [] } = await chrome.storage.local.get('queue'));
    queue = queue.filter((p) => !sent.includes(p.id));
    await chrome.storage.local.set({ queue });
    if (sent.length) await markSynced(sent);
    updateBadge(queue.length);
  } finally {
    flushing = false;
  }
}

async function savePhrase(phrase) {
  const cfg = await getConfig();
  if (!cfg.syncCode || cfg.serverUrl.includes(CINEFRASES_PLACEHOLDER)) {
    await addRecent(phrase, false);
    await enqueue(phrase);
    return { ok: true, synced: false, reason: 'no-code' };
  }
  try {
    await postPhrase(cfg, phrase);
    await addRecent(phrase, true);
    flushQueue(); // aproveita que está online
    return { ok: true, synced: true };
  } catch {
    await addRecent(phrase, false);
    await enqueue(phrase);
    return { ok: true, synced: false, reason: 'offline' };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'phrase') {
    savePhrase(msg.phrase).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true; // resposta assíncrona
  }
  if (msg?.type === 'flush') {
    flushQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'copy-phrase') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'copy-now' }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.syncCode || changes.serverUrl)) flushQueue();
});

chrome.alarms.create('flush', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'flush') flushQueue(); });
chrome.runtime.onStartup.addListener(flushQueue);
chrome.runtime.onInstalled.addListener(flushQueue);
