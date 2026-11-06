'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cinefrases-')), 'db.json');
const { server } = require('../server.js');

let base;
before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.closeAllConnections(); server.close(); });

const room = (code = 'teste-1234') => `${base}/api/rooms/${code}`;
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('health', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal((await r.json()).ok, true);
});

test('rejeita código inválido e texto vazio', async () => {
  assert.equal((await fetch(`${base}/api/rooms/a/phrases`)).status, 400);
  assert.equal((await post(`${room()}/phrases`, { text: '   ' })).status, 400);
});

test('adiciona, deduplica, favorita e apaga', async () => {
  const r1 = await post(`${room()}/phrases`, { id: 'abcdef123', text: '  Eu sou   seu pai ', source: 'disney', videoTime: 12.4, url: 'javascript:alert(1)' });
  assert.equal(r1.status, 201);
  const { phrase } = await r1.json();
  assert.equal(phrase.text, 'Eu sou seu pai');
  assert.equal(phrase.url, '');

  const r2 = await post(`${room()}/phrases`, { id: 'abcdef123', text: 'Eu sou seu pai' });
  assert.equal((await r2.json()).duplicate, true);

  const up = await post(`${room()}/phrases/abcdef123`, { favorite: true });
  assert.equal((await up.json()).phrase.favorite, true);

  const list = await (await fetch(`${room()}/phrases`)).json();
  assert.equal(list.phrases.length, 1);

  assert.equal((await fetch(`${room()}/phrases/abcdef123`, { method: 'DELETE' })).status, 200);
  assert.equal((await (await fetch(`${room()}/phrases`)).json()).phrases.length, 0);
});

test('SSE entrega a frase em tempo real e isola salas', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${room('sala-AAAA')}/stream`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  await post(`${room('sala-BBBB')}/phrases`, { text: 'outra sala' });
  await post(`${room('sala-AAAA')}/phrases`, { text: 'Hasta la vista, baby' });
  let buf = '';
  while (!buf.includes('event: add')) buf += new TextDecoder().decode((await reader.read()).value);
  while (!buf.includes('\n\n', buf.indexOf('event: add'))) buf += new TextDecoder().decode((await reader.read()).value);
  assert.match(buf, /Hasta la vista/);
  assert.doesNotMatch(buf, /outra sala/);
  ctrl.abort();
});
