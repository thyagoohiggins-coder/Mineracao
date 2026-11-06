'use strict';
const { before, after } = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cinefrases-')), 'db.json');
const { server } = require('../server.js');

let base;
before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => { server.closeAllConnections(); server.close(); });

require('./cases.js')(() => base);
