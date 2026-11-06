// Estudos Plus — servidor de sincronização (sem dependências externas).
// - API REST para salvar/listar/editar/apagar frases
// - Server-Sent Events (SSE) para atualizar o app e a extensão em tempo real
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const MAX_BODY = 64 * 1024;
const MAX_TEXT = 2000;
const MAX_PHRASES_PER_ROOM = 5000;
const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

// ---------- Persistência ----------
let db = { rooms: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!db || typeof db.rooms !== 'object') db = { rooms: {} };
} catch { /* primeiro uso */ }

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
function saveNow() {
  clearTimeout(saveTimer);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

function room(code) {
  if (!db.rooms[code]) db.rooms[code] = { phrases: [] };
  return db.rooms[code];
}

// ---------- Tempo real (SSE) ----------
const listeners = new Map(); // code -> Set<res>
function broadcast(code, event, data) {
  const set = listeners.get(code);
  if (!set) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(msg);
}
setInterval(() => {
  for (const set of listeners.values()) for (const res of set) res.write(': ping\n\n');
}, 25000).unref();

// ---------- Helpers ----------
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Corpo muito grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function sanitizePhrase(input) {
  const text = str(input.text, MAX_TEXT).replace(/\s+/g, ' ');
  if (!text) return null;
  let url = str(input.url, 2000);
  if (url && !/^https?:\/\//i.test(url)) url = '';
  const id = typeof input.id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(input.id) ? input.id : crypto.randomUUID();
  const createdAt = num(input.createdAt) && input.createdAt <= Date.now() + 60000 ? input.createdAt : Date.now();
  return {
    id,
    text,
    source: str(input.source, 40) || 'outro',
    sourceName: str(input.sourceName, 60),
    title: str(input.title, 300),
    videoTime: num(input.videoTime),
    url,
    favorite: false,
    note: '',
    createdAt,
  };
}

// ---------- Rotas ----------
async function handle(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const { pathname } = new URL(req.url, 'http://x');

  if (pathname === '/api/health') return send(res, 200, { ok: true, name: 'cinefrases', time: Date.now() });

  const m = pathname.match(/^\/api\/rooms\/([^/]+)\/(phrases|stream)(?:\/([^/]+))?$/);
  if (!m) {
    if (pathname === '/') return send(res, 200, { name: 'cinefrases', ok: true, message: 'Servidor do Estudos Plus no ar. Use este endereço na extensão e no app Android.' });
    return send(res, 404, { error: 'Rota inexistente' });
  }

  const [, code, kind, id] = m;
  if (!CODE_RE.test(code)) return send(res, 400, { error: 'Código de sincronização inválido' });

  if (kind === 'stream' && req.method === 'GET' && !id) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    if (!listeners.has(code)) listeners.set(code, new Set());
    listeners.get(code).add(res);
    req.on('close', () => {
      const set = listeners.get(code);
      set.delete(res);
      if (!set.size) listeners.delete(code);
    });
    return;
  }
  if (kind !== 'phrases') return send(res, 404, { error: 'Rota inexistente' });

  const r = room(code);

  if (!id && req.method === 'GET') {
    return send(res, 200, { phrases: [...r.phrases].sort((a, b) => b.createdAt - a.createdAt) });
  }

  if (!id && req.method === 'POST') {
    const phrase = sanitizePhrase(await readJson(req));
    if (!phrase) return send(res, 400, { error: 'Campo "text" é obrigatório' });
    const existing = r.phrases.find((p) => p.id === phrase.id);
    if (existing) return send(res, 200, { phrase: existing, duplicate: true }); // reenvio idempotente
    r.phrases.push(phrase);
    if (r.phrases.length > MAX_PHRASES_PER_ROOM) r.phrases.splice(0, r.phrases.length - MAX_PHRASES_PER_ROOM);
    scheduleSave();
    broadcast(code, 'add', phrase);
    return send(res, 201, { phrase });
  }

  if (id) {
    const idx = r.phrases.findIndex((p) => p.id === id);
    if (idx === -1) return send(res, 404, { error: 'Frase não encontrada' });

    // POST também atualiza: HttpURLConnection (Java/Android) não suporta PATCH
    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = await readJson(req);
      const p = r.phrases[idx];
      if (typeof body.favorite === 'boolean') p.favorite = body.favorite;
      if (typeof body.note === 'string') p.note = body.note.slice(0, MAX_TEXT);
      if (typeof body.text === 'string' && body.text.trim()) p.text = str(body.text, MAX_TEXT);
      scheduleSave();
      broadcast(code, 'update', p);
      return send(res, 200, { phrase: p });
    }
    if (req.method === 'DELETE') {
      r.phrases.splice(idx, 1);
      scheduleSave();
      broadcast(code, 'delete', { id });
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 405, { error: 'Método não permitido' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => send(res, err.status || 500, { error: err.status ? err.message : 'Erro interno' }));
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`Estudos Plus rodando em http://localhost:${PORT}`));
  const shutdown = () => { try { saveNow(); } finally { process.exit(0); } };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { server, saveNow };
