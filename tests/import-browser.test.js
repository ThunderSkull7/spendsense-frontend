// Browser regression tests for the CSV Import Workflow.
// Run with: node --test tests/import-browser.test.js
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
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
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

function createMockServer(rootDir) {
  let previewCalls = 0;
  let importCalls = 0;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Mock API endpoints
    if (pathname === '/api/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { user: { id: 1, name: 'Test User', email: 'test@example.com' } } }));
    }

    if (pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=test-csrf-token; Path=/' });
      return res.end();
    }

    if (pathname === '/api/categories') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 10, name: 'Groceries', type: 'expense' }] }));
    }

    if (pathname === '/api/expenses') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { data: [], total: 0, current_page: 1, last_page: 1 } }));
    }

    if (pathname === '/api/import/preview') {
      previewCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          headers: ['date', 'amount', 'description', 'category', 'type'],
          preview_rows: [
            { row: 2, date: '2026-03-01', type: 'expense', amount: '45.00', description: 'Fresh Apples', category: 'Groceries', status: 'valid' },
            { row: 3, date: '2026-03-02', type: 'income', amount: '800.00', description: 'Freelance Design', category: null, status: 'valid' },
          ],
          valid: [
            { original_row: 2, date: '2026-03-01', type: 'expense', amount: '45.00', description: 'Fresh Apples', category_id: 10, category_name: 'Groceries' },
            { original_row: 3, date: '2026-03-02', type: 'income', amount: '800.00', source: 'Freelance Design' }
          ],
          errors: [],
          duplicates: [],
          duplicate_policy: 'skip',
          summary: {
            total_rows: 2,
            valid_rows: 2,
            error_rows: 0,
            duplicate_rows: 0,
            expense_count: 1,
            income_count: 1
          }
        }
      }));
    }

    if (pathname === '/api/import') {
      importCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          imported: 2,
          skipped: 0,
          total_valid: 2,
          duplicates_skipped: 0,
          errors: []
        }
      }));
    }

    // Static asset serving
    let filePath = path.normalize(path.join(rootDir, pathname.replace(/^[/\\]+/, '')));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    if (ext === '.html') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const html = fs.readFileSync(filePath, 'utf8').replace(/http:\/\/127\.0\.0\.1:8002/g, origin);
      res.end(html);
    } else if (ext === '.css') {
      const css = fs.readFileSync(filePath, 'utf8').replace(/@import\s+url\([^)]+\);?/g, '');
      res.end(css);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return { server, getStats: () => ({ previewCalls, importCalls }) };
}

test('browser runtime: CSV import modal opens from expenses page, previews rows, and confirms import', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    if (process.env.CI) assert.fail('Chrome executable required in CI');
    t.skip('Chrome not available');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getStats } = createMockServer(rootDir);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-import-test-'));

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + tmpDir
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = parseInt(match[1], 10);
        clearTimeout(timeout);
        resolve(cdpPort);
      }
    });
  });

  try {
    const pageUrl = `http://127.0.0.1:${port}/expense-management/expenses.html`;
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(pageUrl), { method: 'PUT' });
    const tab = await tabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    const send = (method, params = {}) => {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 600));

    const evalJs = async (expr) => {
      const res = await send('Runtime.evaluate', {
        expression: `(() => { try { ${expr} } catch(e) { return 'ERROR: ' + e.message; } })()`,
        returnByValue: true
      });
      return res.result && res.result.result ? res.result.result.value : null;
    };

    // 1. Verify Import CSV button exists
    const hasImportBtn = await evalJs(`
      const btn = document.querySelector('[data-import-csv]');
      return btn !== null;
    `);
    assert.equal(hasImportBtn, true, 'expenses.html must display [data-import-csv] button');

    // 2. Click Import CSV button to open modal
    await evalJs(`
      const btn = document.querySelector('[data-import-csv]');
      btn.click();
    `);
    await new Promise(r => setTimeout(r, 200));

    // 3. Verify modal is visible with correct ARIA attributes
    const modalState = await evalJs(`
      const modal = document.querySelector('#import-modal');
      return {
        exists: modal !== null,
        hidden: modal ? modal.hidden : true,
        role: modal ? modal.getAttribute('role') : null,
        ariaModal: modal ? modal.getAttribute('aria-modal') : null,
      };
    `);
    assert.equal(modalState.exists, true, 'Modal element was injected into DOM');
    assert.equal(modalState.hidden, false, 'Modal is visible');
    assert.equal(modalState.role, 'dialog', 'Modal has role="dialog"');
    assert.equal(modalState.ariaModal, 'true', 'Modal has aria-modal="true"');

    // 4. Simulate file drop/selection and trigger analyze
    await evalJs(`
      const file = new File(["date,amount,description,category,type\\n2026-03-01,45.00,Fresh Apples,Groceries,expense\\n"], "sample.csv", { type: "text/csv" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('[data-import-file-input]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 100));

    // Verify analyze button enabled
    const analyzeState = await evalJs(`
      const btn = document.querySelector('[data-import-analyze]');
      return {
        disabled: btn.disabled,
        fileName: document.querySelector('[data-import-filename]').textContent
      };
    `);
    assert.equal(analyzeState.disabled, false, 'Analyze button is enabled after selecting valid file');
    assert.equal(analyzeState.fileName, 'sample.csv', 'Selected file name displayed');

    // 5. Click Analyze & Preview
    await evalJs(`
      document.querySelector('[data-import-analyze]').click();
    `);
    await new Promise(r => setTimeout(r, 300));

    // 6. Verify preview stage rendered correctly
    const previewState = await evalJs(`
      const totalPill = document.querySelector('[data-summary-total]').textContent;
      const validPill = document.querySelector('[data-summary-valid]').textContent;
      const rows = document.querySelectorAll('[data-import-preview-rows] tr').length;
      const confirmLabel = document.querySelector('[data-import-confirm-label]').textContent;
      return { totalPill, validPill, rows, confirmLabel };
    `);
    assert.equal(previewState.totalPill, 'Total: 2');
    assert.equal(previewState.validPill, '2 Valid');
    assert.equal(previewState.rows, 2, '2 preview rows rendered in table');
    assert.match(previewState.confirmLabel, /Confirm Import \(2 records\)/);

    // 7. Click Confirm Import
    await evalJs(`
      document.querySelector('[data-import-confirm]').click();
    `);
    await new Promise(r => setTimeout(r, 300));

    // 8. Verify completion stage
    const completeState = await evalJs(`
      const imported = document.querySelector('[data-result-imported]').textContent;
      const completeStage = document.querySelector('[data-import-stage="complete"]');
      return { imported, isVisible: !completeStage.hidden };
    `);
    assert.equal(completeState.isVisible, true, 'Completion stage is visible');
    assert.equal(completeState.imported, '2', '2 transactions reported imported');

    // 9. Press Escape to close modal and verify modal hides
    await evalJs(`
      document.querySelector('#import-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    `);
    await new Promise(r => setTimeout(r, 100));

    const closedState = await evalJs(`
      return document.querySelector('#import-modal').hidden;
    `);
    assert.equal(closedState, true, 'Modal closed on Escape key');

    ws.close();
  } finally {
    try {
      chrome.kill('SIGKILL');
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
});
