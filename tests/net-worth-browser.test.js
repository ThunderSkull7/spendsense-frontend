// Browser regression test for Standalone Net Worth Page
// Run with: node --test tests/net-worth-browser.test.js
'use strict';

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
  let postCalls = [];
  let putCalls = [];
  let valCalls = [];
  let archiveCalls = [];
  let restoreCalls = [];

  const mockEntries = [
    {
      id: 1,
      name: 'Fixed Deposit',
      type: 'asset',
      category: 'cash',
      category_label: 'Cash and savings',
      institution: 'HDFC Bank',
      notes: 'Term deposit',
      status: 'active',
      latest_value: '200000.00',
      latest_valuation_date: '2026-11-01',
      valuation_count: 2,
      archived_at: null
    },
    {
      id: 2,
      name: 'Index Fund',
      type: 'asset',
      category: 'investment',
      category_label: 'Investments',
      institution: 'Zerodha',
      notes: 'Nifty 50 ETF',
      status: 'active',
      latest_value: '150000.00',
      latest_valuation_date: '2026-11-01',
      valuation_count: 1,
      archived_at: null
    },
    {
      id: 3,
      name: 'Home Loan',
      type: 'liability',
      category: 'loan',
      category_label: 'Loan',
      institution: 'SBI',
      notes: '{"original_amount":"1500000"}',
      status: 'active',
      latest_value: '1200000.00',
      latest_valuation_date: '2026-11-01',
      valuation_count: 3,
      archived_at: null
    }
  ];

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Mock API endpoints
    if (pathname === '/api/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { user: { id: 1, name: 'Test User', email: 'user@example.com' } } }));
    }

    if (pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=test-csrf; Path=/' });
      return res.end();
    }

    if (pathname === '/api/net-worth' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          entries: mockEntries,
          summary: {
            total_assets: '350000.00',
            total_liabilities: '1200000.00',
            net_worth: '-850000.00',
            active_entry_count: 3,
            unvalued_entry_count: 0,
            has_valuation: true,
            category_totals: [
              { type: 'liability', category: 'loan', category_label: 'Loan', total: '1200000.00', entry_count: 1 },
              { type: 'asset', category: 'cash', category_label: 'Cash and savings', total: '200000.00', entry_count: 1 },
              { type: 'asset', category: 'investment', category_label: 'Investments', total: '150000.00', entry_count: 1 }
            ],
            as_of: '2026-11-08'
          },
          filters: { status: 'active' },
          as_of: '2026-11-08'
        }
      }));
    }

    if (pathname === '/api/net-worth/trend' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          points: [
            {
              month: '2026-10',
              as_of: '2026-10-31',
              total_assets: '320000.00',
              total_liabilities: '1220000.00',
              net_worth: '-900000.00',
              valued_entries: 3,
              is_current_month: false
            },
            {
              month: '2026-11',
              as_of: '2026-11-08',
              total_assets: '350000.00',
              total_liabilities: '1200000.00',
              net_worth: '-850000.00',
              valued_entries: 3,
              is_current_month: true
            }
          ],
          months: 12,
          as_of: '2026-11-08',
          sufficient_history: true,
          active_entry_count: 3
        }
      }));
    }

    if (pathname === '/api/net-worth' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body || '{}');
      postCalls.push(parsed);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          id: 99,
          ...parsed,
          latest_value: parsed.value,
          valuation_count: 1,
          status: 'active'
        }
      }));
    }

    if (pathname.match(/^\/api\/net-worth\/\d+\/valuations$/) && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body || '{}');
      valCalls.push(parsed);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          id: 1,
          valuations: [
            { id: 999, value: parsed.value, valuation_date: parsed.valuation_date, note: parsed.note }
          ]
        }
      }));
    }

    if (pathname.match(/^\/api\/net-worth\/\d+\/archive$/) && req.method === 'POST') {
      archiveCalls.push(pathname);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: { id: 1, status: 'archived' }
      }));
    }

    if (pathname.match(/^\/api\/net-worth\/\d+$/) && req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body || '{}');
      const id = parseInt(pathname.split('/').pop(), 10);
      putCalls.push({ id, ...parsed });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          id,
          name: parsed.name,
          category: parsed.category,
          institution: parsed.institution,
          notes: parsed.notes,
          status: 'active'
        }
      }));
    }

    if (pathname.match(/^\/api\/net-worth\/\d+\/restore$/) && req.method === 'POST') {
      restoreCalls.push(pathname);
      const id = parseInt(pathname.split('/')[3], 10);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: { id, status: 'active' }
      }));
    }

    if (pathname.match(/^\/api\/net-worth\/\d+$/) && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          id: 1,
          name: 'Fixed Deposit',
          type: 'asset',
          category: 'cash',
          valuations: [
            { id: 101, value: '200000.00', valuation_date: '2026-11-01', note: 'November snapshot' },
            { id: 100, value: '180000.00', valuation_date: '2026-10-01', note: 'Opening deposit' }
          ]
        }
      }));
    }

    // Static assets
    let filePath = path.join(rootDir, pathname.replace(/^\//, ''));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      if (ext === '.html') {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/content="http:\/\/127\.0\.0\.1:8002"/g, `content="http://127.0.0.1:${server.address().port}"`);
        res.writeHead(200, { 'Content-Type': contentType });
        return res.end(content);
      }
      res.writeHead(200, { 'Content-Type': contentType });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found: ' + pathname);
  });

  return {
    server,
    getPostCalls: () => postCalls,
    getPutCalls: () => putCalls,
    getValCalls: () => valCalls,
    getArchiveCalls: () => archiveCalls,
    getRestoreCalls: () => restoreCalls
  };
}

class ChromeClient {
  constructor(port) {
    this.port = port;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    const listRes = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    const pages = await listRes.json();
    const page = pages.find(p => p.type === 'page') || pages[0];
    const wsUrl = page.webSocketDebuggerUrl;

    const WebSocket = globalThis.WebSocket || require('ws');
    this.ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result.value;
  }
}

test('browser runtime: standalone net worth page, calculations, modals, valuations, and trend', async () => {
  const chromePath = findChrome();
  if (!chromePath) {
    console.warn('Chrome binary not found; skipping Net Worth browser test.');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getPostCalls, getPutCalls, getValCalls, getArchiveCalls, getRestoreCalls } = createMockServer(rootDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-nw-test-'));
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ]);

  let cdpPort = null;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !cdpPort) {
    try {
      const devtoolsPortPath = path.join(userDataDir, 'DevToolsActivePort');
      if (fs.existsSync(devtoolsPortPath)) {
        const lines = fs.readFileSync(devtoolsPortPath, 'utf8').trim().split('\n');
        cdpPort = parseInt(lines[0].trim(), 10);
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }

  assert.ok(cdpPort, 'Chrome CDP must start');
  const client = new ChromeClient(cdpPort);
  await client.connect();

  try {
    await client.send('Page.enable');
    await client.send('DOM.enable');

    // 1. Navigate to net-worth/net-worth.html
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/net-worth/net-worth.html` });
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Verify page title and summary stats hydration
    const pageState = await client.evaluate(`({
      title: document.title,
      netWorthStat: document.getElementById('stat-net-worth')?.textContent,
      assetsStat: document.getElementById('stat-total-assets')?.textContent,
      liabilitiesStat: document.getElementById('stat-total-liabilities')?.textContent,
      assetRowsCount: document.querySelectorAll('#assets-table-body tr').length,
      liabilityRowsCount: document.querySelectorAll('#liabilities-table-body tr').length,
      hasDebtsBadge: document.querySelector('#liabilities-table-body tr')?.innerHTML.includes('Debt &amp; Loan')
    })`);

    assert.equal(pageState.title, 'Net Worth | SpendSense', 'Page title must match');
    assert.match(pageState.netWorthStat, /8,50,000|850,000|850000/, 'Net worth summary must match');
    assert.match(pageState.assetsStat, /3,50,000|350,000|350000/, 'Total assets must match');
    assert.match(pageState.liabilitiesStat, /12,00,000|1,200,000|1200000/, 'Total liabilities must match');
    assert.equal(pageState.assetRowsCount, 2, 'Must display 2 assets');
    assert.equal(pageState.liabilityRowsCount, 1, 'Must display 1 liability');
    assert.equal(pageState.hasDebtsBadge, true, 'Debts & Loans integration badge must be visible on integrated liability');

    // 3. Test opening the Add Asset modal
    await client.evaluate(`document.querySelector('[data-open-entry-modal]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const modalState = await client.evaluate(`({
      modalHidden: document.getElementById('net-worth-modal').hidden,
      modalTitle: document.getElementById('modal-entry-title').textContent,
      isAsset: document.getElementById('entry-type-asset').checked,
      isOpeningVisible: document.getElementById('entry-opening-valuation-section').style.display !== 'none'
    })`);

    assert.equal(modalState.modalHidden, false, 'Modal should be visible');
    assert.equal(modalState.modalTitle, 'Add Net Worth Entry', 'Title should be Add Net Worth Entry');
    assert.equal(modalState.isAsset, true, 'Defaults to Asset type');
    assert.equal(modalState.isOpeningVisible, true, 'Opening valuation section visible on create');

    // 4. Test Asset Creation Form Submission
    await client.evaluate(`
      document.getElementById('entry-name').value = 'Emergency Cash';
      document.getElementById('entry-institution').value = 'ICICI Bank';
      document.getElementById('entry-category').value = 'cash';
      document.getElementById('entry-value').value = '75000.00';
      document.getElementById('net-worth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 600));

    const postCalls = getPostCalls();
    assert.equal(postCalls.length, 1, 'One POST call must have been made to /api/net-worth');
    assert.equal(postCalls[0].name, 'Emergency Cash');
    assert.equal(postCalls[0].institution, 'ICICI Bank');
    assert.equal(postCalls[0].type, 'asset');
    assert.equal(postCalls[0].category, 'cash');
    assert.equal(postCalls[0].value, '75000.00');

    // 5. Test Valuation Snapshot Modal
    await client.evaluate(`
      document.querySelector('button[data-action="record-valuation"][data-id="1"]').click();
    `);
    await new Promise((r) => setTimeout(r, 200));

    const valModalState = await client.evaluate(`({
      modalHidden: document.getElementById('valuation-modal').hidden,
      targetName: document.getElementById('valuation-target-name').textContent,
      lastVal: document.getElementById('valuation-target-last-val').textContent
    })`);

    assert.equal(valModalState.modalHidden, false, 'Valuation modal must open');
    assert.equal(valModalState.targetName, 'Fixed Deposit', 'Target name matches entry');

    await client.evaluate(`
      document.getElementById('val-amount').value = '210000.00';
      document.getElementById('val-date').value = '2026-11-08';
      document.getElementById('val-note').value = 'Quarterly interest credited';
      document.getElementById('valuation-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 600));

    const valCalls = getValCalls();
    assert.equal(valCalls.length, 1, 'One POST call must have been made to /valuations');
    assert.equal(valCalls[0].value, '210000.00');
    assert.equal(valCalls[0].valuation_date, '2026-11-08');
    assert.equal(valCalls[0].note, 'Quarterly interest credited');

    // 6. Test Archive Entry
    // Mock window.confirm to return true
    await client.evaluate(`
      window.confirm = () => true;
      document.querySelector('button[data-action="archive"][data-id="1"]').click();
    `);
    await new Promise((r) => setTimeout(r, 500));

    const archiveCalls = getArchiveCalls();
    assert.equal(archiveCalls.length, 1, 'Archive POST call must have been made');
    assert.match(archiveCalls[0], /\/api\/net-worth\/1\/archive/);

    // 7. Test Metadata Edit (PUT /api/net-worth/{id})
    await client.evaluate(`
      document.querySelector('button[data-action="edit"][data-id="1"]').click();
    `);
    await new Promise((r) => setTimeout(r, 200));

    const editModalState = await client.evaluate(`({
      modalHidden: document.getElementById('net-worth-modal').hidden,
      modalTitle: document.getElementById('modal-entry-title')?.textContent,
      openingValuationHidden: document.getElementById('entry-opening-valuation-section')?.style.display
    })`);

    assert.equal(editModalState.modalHidden, false, 'Entry modal must open for edit');
    assert.equal(editModalState.modalTitle, 'Edit Net Worth Entry', 'Title reflects edit mode');
    assert.equal(editModalState.openingValuationHidden, 'none', 'Opening valuation section hidden during edit');

    await client.evaluate(`
      document.getElementById('entry-name').value = 'Fixed Deposit Premium';
      document.getElementById('entry-institution').value = 'HDFC Bank';
      document.getElementById('net-worth-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 600));

    const putCalls = getPutCalls();
    assert.equal(putCalls.length, 1, 'One PUT call must have been made to /api/net-worth/1');
    assert.equal(putCalls[0].id, 1, 'PUT call targeted entry ID 1');
    assert.equal(putCalls[0].name, 'Fixed Deposit Premium', 'Updated name submitted');
    assert.equal(putCalls[0].institution, 'HDFC Bank', 'Updated institution submitted');

    // 8. Test Restore Entry (POST /api/net-worth/{id}/restore)
    await client.evaluate(`
      window.SpendSenseNetWorth.restoreEntry({ id: 1, name: 'Fixed Deposit' });
    `);
    await new Promise((r) => setTimeout(r, 500));

    const restoreCalls = getRestoreCalls();
    assert.equal(restoreCalls.length, 1, 'One POST call must have been made to /restore');
    assert.match(restoreCalls[0], /\/api\/net-worth\/1\/restore/);

    // 9. Verify Sidebar Navigation on net-worth.html
    const sidebarCheck = await client.evaluate(`({
      hasAccountGroup: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim()),
      nwIsActive: document.querySelector('[data-nav="net-worth"]')?.classList.contains('active'),
      nwIsDisabled: document.querySelector('[data-nav="net-worth"]')?.classList.contains('is-disabled'),
      nwHasSoonBadge: document.querySelector('[data-nav="net-worth"] .nav-pill')?.textContent,
      subIsDisabled: document.querySelector('[data-nav="subscriptions"]')?.classList.contains('is-disabled')
    })`);

    assert.equal(sidebarCheck.hasAccountGroup, false, 'No sidebar Account heading');
    assert.deepEqual(sidebarCheck.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'Exact 4 groups');
    assert.equal(sidebarCheck.nwIsActive, true, 'Net Worth sidebar link must be active on net-worth page');
    assert.equal(sidebarCheck.nwIsDisabled, false, 'Net Worth sidebar link must not be disabled');
    assert.equal(sidebarCheck.nwHasSoonBadge, undefined, 'Net Worth sidebar link must not retain Soon pill');
    assert.equal(sidebarCheck.subIsDisabled, false, 'Subscriptions sidebar link must not be disabled');

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});
