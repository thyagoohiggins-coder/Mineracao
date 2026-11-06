'use strict';
// Casos de teste da API, usados tanto pelo servidor Node quanto pela versão Cloudflare.
const { test } = require('node:test');
const assert = require('node:assert');

module.exports = function registerCases(getBase) {
  const room = (code = `teste-${process.pid}`) => `${getBase()}/api/rooms/${code}`;
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  test('health', async () => {
    const r = await fetch(`${getBase()}/api/health`);
    assert.equal((await r.json()).ok, true);
  });

  test('rejeita código inválido e texto vazio', async () => {
    assert.equal((await fetch(`${getBase()}/api/rooms/a/phrases`)).status, 400);
    assert.equal((await post(`${room()}/phrases`, { text: '   ' })).status, 400);
  });

  test('CORS liberado para a extensão', async () => {
    const r = await fetch(`${room()}/phrases`, { method: 'OPTIONS' });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.equal((await fetch(`${room()}/phrases`)).headers.get('access-control-allow-origin'), '*');
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
    assert.equal(list.phrases[0].favorite, true);

    assert.equal((await fetch(`${room()}/phrases/abcdef123`, { method: 'DELETE' })).status, 200);
    assert.equal((await (await fetch(`${room()}/phrases`)).json()).phrases.length, 0);
  });

  test('lista em ordem do mais recente', async () => {
    const code = `ordem-${process.pid}`;
    await post(`${room(code)}/phrases`, { text: 'antiga', createdAt: 1000 });
    await post(`${room(code)}/phrases`, { text: 'nova', createdAt: 2000 });
    const { phrases } = await (await fetch(`${room(code)}/phrases`)).json();
    assert.deepEqual(phrases.map((p) => p.text), ['nova', 'antiga']);
  });

  test('SSE entrega a frase em tempo real e isola salas', async () => {
    const a = `sala-A${process.pid}`, b = `sala-B${process.pid}`;
    const ctrl = new AbortController();
    const res = await fetch(`${room(a)}/stream`, { signal: ctrl.signal });
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader();
    await reader.read(); // "retry:" inicial: conexão pronta
    await post(`${room(b)}/phrases`, { text: 'outra sala' });
    await post(`${room(a)}/phrases`, { text: 'Hasta la vista, baby' });
    let buf = '';
    const dec = new TextDecoder();
    while (!/event: add\ndata: .*\n\n/.test(buf)) buf += dec.decode((await reader.read()).value, { stream: true });
    assert.match(buf, /Hasta la vista/);
    assert.doesNotMatch(buf, /outra sala/);
    ctrl.abort();
  });
};
