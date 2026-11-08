// Browser regression test for Standalone Budget Performance Page
// Run with: node --test tests/budget-performance-browser.test.js
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
  let budgetCalls = [];

  const mockBudgetData = {
    from: '2026-06',
    to: '2026-11',
    timezone: 'UTC',
    summary: {
      latest_month: '2026-11',
      latest: {
        month: '2026-11',
        budgeted_amount: '50000.00',
        spent_amount: '42000.00',
        remaining_amount: '8000.00',
        utilization_percent: 84.0,
        budget_count: 3,
        overspent_count: 1
      },
      budgeted_amount: '300000.00',
      spent_amount: '260000.00',
      remaining_amount: '40000.00',
      budget_rows: 18,
      overspent_rows: 2,
      near_limit_rows: 4,
      categories_with_budgets: 3,
      has_budget_data: true,
      thresholds_seen: [80, 90, 100]
    },
    items: [
      {
        budget_id: 1,
        month: '2026-11',
        category_id: 1,
        category_name: 'Groceries',
        limit_amount: '20000.00',
        spent_amount: '22000.00',
        remaining_amount: '-2000.00',
        utilization_percent: 110.0,
        status: 'over',
        overspent_by: '2000.00',
        alert_thresholds: [80, 90],
        is_current_month: true
      },
      {
        budget_id: 2,
        month: '2026-11',
        category_id: 2,
        category_name: 'Dining & Takeout',
        limit_amount: '15000.00',
        spent_amount: '13500.00',
        remaining_amount: '1500.00',
        utilization_percent: 90.0,
        status: 'near_limit',
        overspent_by: '0.00',
        alert_thresholds: [85],
        is_current_month: true
      },
      {
        budget_id: 3,
        month: '2026-11',
        category_id: 3,
        category_name: 'Utilities',
        limit_amount: '15000.00',
        spent_amount: '6500.00',
        remaining_amount: '8500.00',
        utilization_percent: 43.3,
        status: 'on_track',
        overspent_by: '0.00',
        alert_thresholds: [],
        is_current_month: true
      }
    ],
    history: [
      {
        month: '2026-06',
        budgeted_amount: '50000.00',
        spent_amount: '45000.00',
        remaining_amount: '5000.00',
        utilization_percent: 90.0,
        budget_count: 3,
        overspent_count: 0
      },
      {
        month: '2026-11',
        budgeted_amount: '50000.00',
        spent_amount: '42000.00',
        remaining_amount: '8000.00',
        utilization_percent: 84.0,
        budget_count: 3,
        overspent_count: 1
      }
    ],
    repeated_overspending: [
      {
        category_id: 1,
        category_name: 'Groceries',
        overspent_months: 3,
        budgeted_months: 6,
        total_over: '6000.00',
        months: ['2026-08', '2026-09', '2026-11'],
        overspent_share: 50.0
      }
    ],
    threshold_events: [
      {
        id: 1,
        budget_id: 1,
        threshold: 90,
        period_month: '2026-11',
        spent_amount: '18500.00',
        limit_amount: '20000.00',
        read_at: null
      }
    ],
    notes: [
      'Only expenses in categories that have a budget for the same calendar month are included in that month\'s budget totals.',
      'Budget performance is strictly an analytical view; budgets cannot be created, modified, or deleted from this page.'
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

    if (pathname === '/api/analytics/budget-performance') {
      budgetCalls.push(parsedUrl.search);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: mockBudgetData
      }));
    }

    // Static files
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
    getBudgetCalls: () => budgetCalls
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
    const page = pages.find((p) => p.type === 'page') || pages[0];
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
    return res.result ? res.result.value : null;
  }
}

test('browser runtime: standalone budget performance page, trajectory, category table, overspending patterns', async () => {
  const chromePath = findChrome();
  if (!chromePath) {
    console.warn('Chrome binary not found; skipping Budget Performance browser test.');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getBudgetCalls } = createMockServer(rootDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-bp-test-'));
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

    // 1. Navigate to budget-performance.html
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/budget-performance/budget-performance.html` });
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Verify page title and summary metrics
    const pageState = await client.evaluate(`({
      title: document.title,
      limitAmount: document.getElementById('stat-budget-limit')?.textContent,
      spentAmount: document.getElementById('stat-budget-spent')?.textContent,
      overspentCount: document.getElementById('stat-overspent-count')?.textContent,
      rowsCount: document.querySelectorAll('#budget-items-body tr').length,
      repeatedCount: document.querySelectorAll('#repeated-overspending-body tr').length,
      thresholdCount: document.querySelectorAll('#threshold-alerts-body tr').length
    })`);

    assert.equal(pageState.title, 'Budget Performance | SpendSense', 'Page title must match');
    assert.match(pageState.limitAmount, /3,00,000|300,000|300000/, 'Budget limit must match');
    assert.match(pageState.spentAmount, /2,60,000|260,000|260000/, 'Budget spent must match');
    assert.equal(pageState.overspentCount, '2', 'Overspent rows count must match');
    assert.equal(pageState.rowsCount, 3, 'Three budget categories rendered');
    assert.equal(pageState.repeatedCount, 1, 'One repeated overspending pattern rendered');
    assert.equal(pageState.thresholdCount, 1, 'One threshold alert rendered');

    // 3. Test Status Filter: filter by 'over'
    await client.evaluate(`
      document.getElementById('budget-status-filter').value = 'over';
      document.getElementById('budget-status-filter').dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 300));

    const filteredRowsCount = await client.evaluate(`document.querySelectorAll('#budget-items-body tr').length`);
    assert.equal(filteredRowsCount, 1, 'Filtering by "over" must show only the 1 overspent category');

    // 4. Test Filter Form Submission
    await client.evaluate(`
      document.getElementById('budget-performance-filter-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 500));

    const calls = getBudgetCalls();
    assert.ok(calls.length >= 2, 'At least 2 budget performance API calls made');

    // 5. Verify Sidebar Navigation & Disabled Status
    const sidebarCheck = await client.evaluate(`({
      hasAccountGroup: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim()),
      budgetsIsActive: document.querySelector('[data-nav="insights-budgets"]')?.classList.contains('active'),
      budgetsIsDisabled: document.querySelector('[data-nav="insights-budgets"]')?.classList.contains('is-disabled'),
      budgetsHasSoonBadge: document.querySelector('[data-nav="insights-budgets"] .nav-pill')?.textContent,
      forecastIsDisabled: document.querySelector('[data-nav="forecast"]')?.classList.contains('is-disabled')
    })`);

    assert.equal(sidebarCheck.hasAccountGroup, false, 'No sidebar Account heading');
    assert.deepEqual(sidebarCheck.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'Exact 4 groups');
    assert.equal(sidebarCheck.budgetsIsActive, true, 'Budget Performance sidebar link must be active');
    assert.equal(sidebarCheck.budgetsIsDisabled, false, 'Budget Performance sidebar link must not be disabled');
    assert.equal(sidebarCheck.budgetsHasSoonBadge, undefined, 'Budget Performance sidebar link must not retain Soon pill');
    assert.equal(sidebarCheck.forecastIsDisabled, false, 'Cash Flow Forecast sidebar link must not be disabled');

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});
