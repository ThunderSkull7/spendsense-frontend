// Browser regression tests for shared-default vs. private category handling.
// Run with: node --test tests/categories-browser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function createMockCategoryServer(rootDir) {
  let categories = [
    { id: 1, name: 'Food', type: 'expense', user_id: null, is_default: true },
    { id: 2, name: 'Salary', type: 'income', user_id: null, is_default: true },
    { id: 3, name: 'Groceries', type: 'expense', user_id: 7, is_default: false },
  ];
  const deleted = [];

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      });
      return res.end();
    }

    if (pathname.startsWith('/api/')) {
      const endpoint = pathname.replace('/api', '');
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      };

      if (endpoint === '/categories' && req.method === 'GET') {
        res.writeHead(200, headers);
        return res.end(JSON.stringify({ success: true, data: categories }));
      }

      const deleteMatch = endpoint.match(/^\/categories\/(\d+)$/);
      if (deleteMatch && req.method === 'DELETE') {
        const id = Number(deleteMatch[1]);
        deleted.push(id);
        categories = categories.filter((category) => category.id !== id);
        res.writeHead(204, headers);
        return res.end();
      }

      res.writeHead(404, headers);
      return res.end(JSON.stringify({ message: 'Not found' }));
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const relPath = pathname.replace(/^[/\\]+/, '');
    const filePath = path.normalize(path.join(rootDir, relPath));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    if (ext === '.html') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const html = fs.readFileSync(filePath, 'utf8').replace('http://127.0.0.1:8002', origin);
      res.end(html);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return { server, deleted };
}

test('browser runtime: defaults are locked and private categories remain editable', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome binary not found');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, deleted } = createMockCategoryServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-categories-test-'));

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + tmpDir
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome DevTools did not start')), 15000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        clearTimeout(timer);
        cdpPort = parseInt(match[1], 10);
        resolve();
      }
    });
  });

  try {
    const tabUrl = `http://127.0.0.1:${port}/categories-management/categories.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(tabUrl), { method: 'PUT' });
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });

    let msgId = 1;
    const callbacks = new Map();
    const jsExceptions = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        jsExceptions.push(msg.params);
      }
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    const send = (method, params = {}) => new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return result.result?.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: tabUrl });

    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      const count = await evaluate(`document.querySelectorAll('.category-tile').length`);
      if (count === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const initial = await evaluate(`(() => {
      const tiles = Array.from(document.querySelectorAll('.category-tile'));
      const defaults = tiles.filter((tile) => tile.dataset.categoryKind === 'default');
      const custom = tiles.filter((tile) => tile.dataset.categoryKind === 'custom');
      return {
        total: tiles.length,
        defaultCount: defaults.length,
        defaultActionCount: defaults.reduce((n, tile) => n + tile.querySelectorAll('.row-actions button').length, 0),
        defaultLocked: defaults.every((tile) => tile.querySelector('.row-note')?.textContent === 'Locked'),
        hasSharedLabel: defaults.every((tile) => tile.textContent.includes('Shared default')),
        customCount: custom.length,
        customEdit: custom[0]?.querySelector('[data-edit-category]')?.textContent,
        customDelete: custom[0]?.querySelector('[data-delete-category]')?.textContent,
        hasPrivateLabel: custom[0]?.textContent.includes('Private'),
        summary: document.querySelector('[data-category-summary]')?.textContent,
      };
    })()`);

    assert.deepEqual(jsExceptions, [], 'Expected zero uncaught JS exceptions');
    assert.equal(initial.total, 3);
    assert.equal(initial.defaultCount, 2);
    assert.equal(initial.defaultActionCount, 0, 'Shared defaults must not expose edit/delete buttons');
    assert.equal(initial.defaultLocked, true, 'Shared defaults should be visibly locked');
    assert.equal(initial.hasSharedLabel, true, 'Shared defaults should be labelled');
    assert.equal(initial.customCount, 1);
    assert.equal(initial.customEdit, 'Edit');
    assert.equal(initial.customDelete, 'Delete');
    assert.equal(initial.hasPrivateLabel, true, 'Private categories should be labelled');
    assert.match(initial.summary, /3 total .* 2 shared .* 1 private/);

    // The owner can open the edit form for a private category.
    await evaluate(`document.querySelector('[data-category-kind="custom"] [data-edit-category]').click()`);
    const editState = await evaluate(`({
      name: document.querySelector('#categoryName')?.value,
      submit: document.querySelector('.category-form button[type="submit"]')?.textContent,
      cancelHidden: document.querySelector('[data-cancel-edit]')?.hidden
    })`);
    assert.equal(editState.name, 'Groceries');
    assert.equal(editState.submit, 'Update category');
    assert.equal(editState.cancelHidden, false);

    await evaluate(`document.querySelector('[data-cancel-edit]').click()`);
    await evaluate(`window.confirm = () => true`);

    // Deleting the private category calls the API and refreshes the list.
    await evaluate(`document.querySelector('[data-category-kind="custom"] [data-delete-category]').click()`);
    const deleteStart = Date.now();
    let remaining = 3;
    while (Date.now() - deleteStart < 3000) {
      remaining = await evaluate(`document.querySelectorAll('.category-tile').length`);
      if (remaining === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.deepEqual(deleted, [3], 'Only the private category should be deleted');
    assert.equal(remaining, 2, 'The deleted private category should disappear');
    assert.deepEqual(jsExceptions, [], 'Expected zero uncaught JS exceptions after mutation');

    ws.close();
  } finally {
    chrome.kill();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});
