// Estudos Plus — servidor de sincronização na Cloudflare (Workers + Durable Objects).
// Mesma API do servidor Node (server/server.js): a extensão e o app só precisam do endereço.
import { DurableObject } from 'cloudflare:workers';

const MAX_BODY = 64 * 1024;
const MAX_TEXT = 2000;
const MAX_PHRASES_PER_ROOM = 5000;
const CODE_RE = /^[A-Za-z0-9_-]{4,64}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

function withCors(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

// ---------- Worker: roteia cada sala para o seu Durable Object ----------
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const { pathname } = new URL(request.url);

    if (pathname === '/' || pathname === '/api/health') {
      return withCors(json(200, { ok: true, name: 'cinefrases', time: Date.now(),
        message: 'Servidor do Estudos Plus no ar. Use este endereço na extensão e no app Android.' }));
    }

    const m = pathname.match(/^\/api\/rooms\/([^/]+)\/(phrases|stream)(?:\/[^/]+)?$/);
    if (!m) return withCors(json(404, { error: 'Rota inexistente' }));
    if (!CODE_RE.test(m[1])) return withCors(json(400, { error: 'Código de sincronização inválido' }));

    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return withCors(await room.fetch(request));
  },
};

// ---------- Utilidades ----------
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
    id, text,
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

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw Object.assign(new Error('Corpo muito grande'), { status: 413 });
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}

// ---------- Durable Object: uma "sala" por código ----------
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS phrases (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, data TEXT NOT NULL)');
    this.clients = new Set(); // writers das conexões SSE abertas
    this.pingTimer = null;
    this.encoder = new TextEncoder();
  }

  async fetch(request) {
    try {
      return await this.route(request);
    } catch (err) {
      return json(err.status || 500, { error: err.status ? err.message : 'Erro interno' });
    }
  }

  async route(request) {
    const parts = new URL(request.url).pathname.split('/'); // ['', 'api', 'rooms', code, kind, id?]
    const kind = parts[4];
    const id = parts[5] ? decodeURIComponent(parts[5]) : null;
    const method = request.method;

    if (kind === 'stream' && !id && method === 'GET') return this.openStream();
    if (kind !== 'phrases') return json(404, { error: 'Rota inexistente' });

    if (!id && method === 'GET') return json(200, { phrases: this.list() });

    if (!id && method === 'POST') {
      const phrase = sanitizePhrase(await readJson(request));
      if (!phrase) return json(400, { error: 'Campo "text" é obrigatório' });
      const existing = this.get(phrase.id);
      if (existing) return json(200, { phrase: existing, duplicate: true }); // reenvio idempotente
      this.save(phrase);
      this.trim();
      this.broadcast('add', phrase);
      return json(201, { phrase });
    }

    if (id) {
      const p = this.get(id);
      if (!p) return json(404, { error: 'Frase não encontrada' });

      // POST também atualiza: HttpURLConnection (Java/Android) não suporta PATCH
      if (method === 'PATCH' || method === 'POST') {
        const body = await readJson(request);
        if (typeof body.favorite === 'boolean') p.favorite = body.favorite;
        if (typeof body.note === 'string') p.note = body.note.slice(0, MAX_TEXT);
        if (typeof body.text === 'string' && body.text.trim()) p.text = str(body.text, MAX_TEXT);
        this.save(p);
        this.broadcast('update', p);
        return json(200, { phrase: p });
      }
      if (method === 'DELETE') {
        this.sql.exec('DELETE FROM phrases WHERE id = ?', id);
        this.broadcast('delete', { id });
        return json(200, { ok: true });
      }
    }
    return json(405, { error: 'Método não permitido' });
  }

  // ----- armazenamento (SQLite do Durable Object) -----
  list() {
    return this.sql.exec('SELECT data FROM phrases ORDER BY created_at DESC').toArray().map((r) => JSON.parse(r.data));
  }
  get(id) {
    const rows = this.sql.exec('SELECT data FROM phrases WHERE id = ?', id).toArray();
    return rows.length ? JSON.parse(rows[0].data) : null;
  }
  save(p) {
    this.sql.exec('INSERT OR REPLACE INTO phrases (id, created_at, data) VALUES (?, ?, ?)', p.id, p.createdAt, JSON.stringify(p));
  }
  trim() {
    this.sql.exec(
      'DELETE FROM phrases WHERE id IN (SELECT id FROM phrases ORDER BY created_at DESC LIMIT -1 OFFSET ?)',
      MAX_PHRASES_PER_ROOM,
    );
  }

  // ----- tempo real (Server-Sent Events) -----
  openStream() {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    this.clients.add(writer);
    this.write(writer, 'retry: 3000\n\n');
    if (!this.pingTimer) {
      // mantém a conexão viva (o app Android desiste após 60s sem dados)
      this.pingTimer = setInterval(() => {
        for (const w of this.clients) this.write(w, ': ping\n\n');
        if (!this.clients.size) { clearInterval(this.pingTimer); this.pingTimer = null; }
      }, 25000);
    }
    return new Response(readable, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  }

  write(writer, text) {
    writer.write(this.encoder.encode(text)).catch(() => {
      this.clients.delete(writer); // cliente desconectou
    });
  }

  broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const w of this.clients) this.write(w, msg);
  }
}
