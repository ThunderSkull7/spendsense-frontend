// Browser regression test for Standalone Income Analysis Page
// Run with: node --test tests/income-analysis-browser.test.js
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
  let incomeCalls = [];

  const mockIncomeData = {
    from: '2026-06',
    to: '2026-11',
    timezone: 'Asia/Kolkata',
    comparison_period: {
      from: '2025-12',
      to: '2026-05',
      label: 'Previous 6 calendar months'
    },
    summary: {
      actual_income_amount: '360000.00',
      previous_income_amount: '330000.00',
      change_amount: '30000.00',
      change_percent: 9.1,
      scheduled_expected_amount: '300000.00',
      scheduled_received_amount: '300000.00',
      planned_unreceived_amount: '0.00',
      unplanned_actual_amount: '60000.00',
      source_count: 2,
      months_with_income: 6,
      month_count: 6,
      average_month_with_income: '60000.00',
      variability_amount: '5000.00',
      variability_percent: 8.3,
      has_income_data: true
    },
    monthly: [
      {
        month: '2026-06',
        actual_amount: '60000.00',
        scheduled_expected_amount: '50000.00',
        scheduled_received_amount: '50000.00',
        planned_unreceived_amount: '0.00',
        unplanned_actual_amount: '10000.00',
        has_income: true
      },
      {
        month: '2026-07',
        actual_amount: '60000.00',
        scheduled_expected_amount: '50000.00',
        scheduled_received_amount: '50000.00',
        planned_unreceived_amount: '0.00',
        unplanned_actual_amount: '10000.00',
        has_income: true
      },
      {
        month: '2026-08',
        actual_amount: '60000.00',
        scheduled_expected_amount: '50000.00',
        scheduled_received_amount: '50000.00',
        planned_unreceived_amount: '0.00',
        unplanned_actual_amount: '10000.00',
        has_income: true
      },
      {
        month: '2026-09',
        actual_amount: '60000.00',
        scheduled_expected_amount: '50000.00',
        scheduled_received_amount: '50000.00',
        planned_unreceived_amount: '0.00',
        unplanned_actual_amount: '10000.00',
        has_income: true
      },
      {
        month: '2026-10',
        actual_amount: '60000.00',
        scheduled_expected_amount: '50000.00',
        scheduled_received_amount: '50000.00',
        planned_unreceived_amount: '0.00',
        unplanned_actual_amount: '10000.00',
        has_income: true
      },
      {
        month: '2026-11',
        actual_amount: '60000.00',
        scheduled_expected_amount: '50000.00',
        scheduled_received_amount: '50000.00',
        planned_unreceived_amount: '0.00',
        unplanned_actual_amount: '10000.00',
        has_income: true
      }
    ],
    sources: [
      {
        source: 'Primary Employer',
        actual_amount: '300000.00',
        previous_amount: '300000.00',
        change_amount: '0.00',
        change_percent: 0.0,
        transaction_count: 6
      },
      {
        source: 'Consulting Contract',
        actual_amount: '60000.00',
        previous_amount: '30000.00',
        change_amount: '30000.00',
        change_percent: 100.0,
        transaction_count: 3
      }
    ],
    frequencies: [
      {
        frequency: 'monthly',
        transaction_count: 6,
        amount: '300000.00'
      },
      {
        frequency: 'one-time',
        transaction_count: 3,
        amount: '60000.00'
      }
    ],
    notes: [
      'Scheduled expected income comes only from already-materialised recurring-income occurrences.',
      'Expected amounts are never added to actual income totals.'
    ]
  };

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // Mock API
    if (pathname === '/api/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { user: { id: 1, name: 'Test User', email: 'user@example.com' } } }));
    }

    if (pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=test-csrf; Path=/' });
      return res.end();
    }

    if (pathname === '/api/analytics/income-analysis') {
      incomeCalls.push(parsedUrl.search);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: mockIncomeData
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

  return { server, getIncomeCalls: () => incomeCalls };
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

test('browser runtime: standalone income analysis page, charts, sources, frequencies, and separation', async () => {
  const chromePath = findChrome();
  if (!chromePath) {
    console.warn('Chrome binary not found; skipping Income Analysis browser test.');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getIncomeCalls } = createMockServer(rootDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-ia-test-'));
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

    // 1. Navigate to income-analysis/income-analysis.html
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/income-analysis/income-analysis.html` });
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Verify page state
    const pageState = await client.evaluate(`({
      title: document.title,
      actualIncome: document.getElementById('stat-actual-income')?.textContent,
      incomeChange: document.getElementById('stat-income-change')?.textContent,
      monthlyAverage: document.getElementById('stat-average-monthly')?.textContent,
      variability: document.getElementById('stat-variability-amount')?.textContent,
      sourceRowsCount: document.querySelectorAll('#income-sources-body tr').length,
      frequencyRowsCount: document.querySelectorAll('#income-frequency-body tr').length,
      hasGuidanceBanner: document.body.textContent.includes('Actual vs. Expected Income Separation')
    })`);

    assert.equal(pageState.title, 'Income Analysis | SpendSense', 'Page title must match');
    assert.match(pageState.actualIncome, /3,60,000|360,000|360000/, 'Actual income must match');
    assert.match(pageState.incomeChange, /\+?9\.1%/, 'Income change percent must match');
    assert.match(pageState.monthlyAverage, /60,000|60000/, 'Monthly average must match');
    assert.match(pageState.variability, /5,000|5000/, 'Variability must match');
    assert.equal(pageState.sourceRowsCount, 2, 'Two income sources rendered');
    assert.equal(pageState.frequencyRowsCount, 2, 'Two frequencies rendered');
    assert.equal(pageState.hasGuidanceBanner, true, 'Integrity guidance banner must be visible');

    // 3. Switch Horizon to 12 Months and Apply
    await client.evaluate(`
      document.getElementById('income-preset').value = '12m';
      document.getElementById('income-preset').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('income-filter-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 500));

    const calls = getIncomeCalls();
    assert.ok(calls.length >= 2, 'At least 2 income analysis API calls made');

    // 4. Verify Sidebar Navigation & Disabled Status
    const sidebarCheck = await client.evaluate(`({
      hasAccountGroup: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim()),
      incomeIsActive: document.querySelector('[data-nav="insights-income"]')?.classList.contains('active'),
      incomeIsDisabled: document.querySelector('[data-nav="insights-income"]')?.classList.contains('is-disabled'),
      incomeHasSoonBadge: document.querySelector('[data-nav="insights-income"] .nav-pill')?.textContent,
      trendsIsDisabled: document.querySelector('[data-nav="insights-trends"]')?.classList.contains('is-disabled')
    })`);

    assert.equal(sidebarCheck.hasAccountGroup, false, 'No sidebar Account heading');
    assert.deepEqual(sidebarCheck.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'Exact 4 groups');
    assert.equal(sidebarCheck.incomeIsActive, true, 'Income Analysis sidebar link must be active');
    assert.equal(sidebarCheck.incomeIsDisabled, false, 'Income Analysis sidebar link must not be disabled');
    assert.equal(sidebarCheck.incomeHasSoonBadge, undefined, 'Income Analysis sidebar link must not retain Soon pill');
    assert.equal(sidebarCheck.trendsIsDisabled, false, 'Spending Trends sidebar link must not be disabled');

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});

