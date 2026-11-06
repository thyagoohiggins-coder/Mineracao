'use strict';
// Sobe o Worker localmente (wrangler dev, com Durable Objects simulados) e roda os mesmos testes do servidor Node.
// Para testar o Worker já publicado: CINEFRASES_URL=https://cinefrases.SEU-USUARIO.workers.dev npm test
const { before, after } = require('node:test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 8787 + (process.pid % 1000);
let base = process.env.CINEFRASES_URL ? process.env.CINEFRASES_URL.replace(/\/+$/, '') : `http://127.0.0.1:${PORT}`;
let proc;

before(async () => {
  if (process.env.CINEFRASES_URL) return;
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'cinefrases-wrangler-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev', '--ip', '127.0.0.1', '--port', String(PORT), '--persist-to', state],
    { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  proc.kill();
  throw new Error(`wrangler dev não subiu:\n${log}`);
});

after(() => { if (proc) proc.kill(); });

require('../../server/test/cases.js')(() => base);
