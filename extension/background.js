// CineFrases — service worker
// Recebe as frases do content script, envia ao servidor e mantém uma fila offline.
'use strict';
importScripts('config.js');

const RECENT_MAX = 50;
const API = (code) => `${CINEFRASES_SERVER}/api/rooms/${encodeURIComponent(code)}`;

function randomCode() {
  const words = ['lua', 'sol', 'mar', 'cine', 'rio', 'neon', 'jazz', 'noir', 'pipoca', 'drama'];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint8Array(7));
  return `${words[a[0] % words.length]}-${[...a.slice(1)].map((b) => chars[b % chars.length]).join('')}`;
}

async function getCode() {
  const { syncCode } = await chrome.storage.sync.get('syncCode');
  if (syncCode) return syncCode;
  const code = randomCode(); // primeiro uso: cria o código automaticamente
  await chrome.storage.sync.set({ syncCode: code });
  return code;
}

async function postPhrase(code, phrase) {
  const res = await fetch(`${API(code)}/phrases`, {
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
    const code = await getCode();
    let { queue = [] } = await chrome.storage.local.get('queue');
    if (!queue.length) return updateBadge(0);
    const sent = [];
    for (const p of queue) {
      try { await postPhrase(code, p); sent.push(p.id); } catch { break; } // sem conexão: tenta depois
    }
    ({ queue = [] } = await chrome.storage.local.get('queue')); // pode ter chegado item novo
    queue = queue.filter((p) => !sent.includes(p.id));
    await chrome.storage.local.set({ queue });
    if (sent.length) await markSynced(sent);
    updateBadge(queue.length);
  } finally {
    flushing = false;
  }
}

async function savePhrase(phrase) {
  const code = await getCode();
  try {
    await postPhrase(code, phrase);
    await addRecent(phrase, true);
    flushQueue();
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
    return true;
  }
  if (msg?.type === 'flush') {
    flushQueue().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'copy-phrase') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'copy-now' }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.syncCode) flushQueue();
});

// Abas que já estavam abertas antes de instalar/atualizar a extensão também passam a funcionar
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] }).catch(() => {});
  }
}

chrome.alarms.create('flush', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'flush') flushQueue(); });
chrome.runtime.onStartup.addListener(flushQueue);
chrome.runtime.onInstalled.addListener(() => { getCode().then(flushQueue); injectIntoOpenTabs(); });
