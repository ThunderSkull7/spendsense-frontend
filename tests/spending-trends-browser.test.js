// Browser regression test for Standalone Spending Trends Page
// Run with: node --test tests/spending-trends-browser.test.js
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
  let trendsCalls = [];

  const mockTrendsData = {
    from: '2026-08-11',
    to: '2026-11-08',
    granularity: 'day',
    timezone: 'Asia/Kolkata',
    comparison_period: {
      from: '2026-05-14',
      to: '2026-08-10',
      label: 'Previous period of equal length'
    },
    summary: {
      expenses_amount: '45000.00',
      income_amount: '120000.00',
      net_amount: '75000.00',
      bucket_count: 90,
      average_expense_per_bucket: '500.00',
      largest_expense: '7500.00',
      anomaly_count: 1,
      has_data: true
    },
    comparison: {
      expenses: {
        current_amount: '45000.00',
        previous_amount: '40000.00',
        change_amount: '5000.00',
        change_percent: 12.5
      },
      income: {
        current_amount: '120000.00',
        previous_amount: '110000.00',
        change_amount: '10000.00',
        change_percent: 9.1
      },
      net: {
        current_amount: '75000.00',
        previous_amount: '70000.00',
        change_amount: '5000.00'
      }
    },
    buckets: [
      {
        key: '2026-11-06',
        start: '2026-11-06',
        end: '2026-11-06',
        expenses_amount: '600.00',
        income_amount: '0.00',
        net_amount: '-600.00',
        rolling_average_expense: '480.00',
        is_partial: false
      },
      {
        key: '2026-11-07',
        start: '2026-11-07',
        end: '2026-11-07',
        expenses_amount: '7500.00',
        income_amount: '0.00',
        net_amount: '-7500.00',
        rolling_average_expense: '1200.00',
        is_partial: false
      },
      {
        key: '2026-11-08',
        start: '2026-11-08',
        end: '2026-11-08',
        expenses_amount: '350.00',
        income_amount: '0.00',
        net_amount: '-350.00',
        rolling_average_expense: '1150.00',
        is_partial: false
      }
    ],
    categories: [
      {
        category_id: 1,
        category_name: 'Electronics',
        amount: '15000.00',
        previous_amount: '5000.00',
        change_amount: '10000.00',
        change_percent: 200.0,
        share_percent: 33.3,
        transaction_count: 2
      },
      {
        category_id: 2,
        category_name: 'Groceries',
        amount: '12000.00',
        previous_amount: '11000.00',
        change_amount: '1000.00',
        change_percent: 9.1,
        share_percent: 26.7,
        transaction_count: 18
      }
    ],
    anomalies: [
      {
        id: 101,
        amount: '7500.00',
        expense_date: '2026-11-07',
        description: 'New 4K Monitor',
        category_id: 1,
        category_name: 'Electronics'
      }
    ],
    largest_expenses: [
      {
        id: 101,
        amount: '7500.00',
        expense_date: '2026-11-07',
        description: 'New 4K Monitor',
        category_id: 1,
        category_name: 'Electronics'
      },
      {
        id: 102,
        amount: '3500.00',
        expense_date: '2026-10-15',
        description: 'Monthly Supermarket Haul',
        category_id: 2,
        category_name: 'Groceries'
      }
    ],
    anomaly_rule: {
      threshold_amount: '1500.00',
      average_expense: '500.00',
      minimum_transactions: 5,
      note: 'Large-expense review flags amounts above three times the average expense in the selected period when at least five expenses exist. It is not a fraud finding.'
    }
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

    if (pathname === '/api/analytics/spending-trends') {
      trendsCalls.push(parsedUrl.search);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: mockTrendsData
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

  return { server, getTrendsCalls: () => trendsCalls };
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

test('browser runtime: standalone spending trends page, charts, anomalies, categories, and comparisons', async () => {
  const chromePath = findChrome();
  if (!chromePath) {
    console.warn('Chrome binary not found; skipping Spending Trends browser test.');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getTrendsCalls } = createMockServer(rootDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-st-test-'));
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

    // 1. Navigate to spending-trends/spending-trends.html
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/spending-trends/spending-trends.html` });
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Verify page state
    const pageState = await client.evaluate(`({
      title: document.title,
      expensesStat: document.getElementById('stat-expenses-amount')?.textContent,
      comparisonChange: document.getElementById('stat-comparison-change')?.textContent,
      averageExpense: document.getElementById('stat-average-expense')?.textContent,
      anomalyCount: document.getElementById('stat-anomaly-count')?.textContent,
      categoryRowsCount: document.querySelectorAll('#trends-category-body tr').length,
      anomaliesRowsCount: document.querySelectorAll('#trends-anomalies-body tr').length,
      largestRowsCount: document.querySelectorAll('#trends-largest-body tr').length
    })`);

    assert.equal(pageState.title, 'Spending Trends | SpendSense', 'Page title must match');
    assert.match(pageState.expensesStat, /45,000|45000/, 'Total expenses must match');
    assert.match(pageState.comparisonChange, /\+?12\.5%/, 'Comparison percentage must match');
    assert.match(pageState.averageExpense, /500/, 'Average per bucket must match');
    assert.equal(pageState.anomalyCount, '1', 'One anomaly flagged');
    assert.equal(pageState.categoryRowsCount, 2, 'Two category rows rendered');
    assert.equal(pageState.anomaliesRowsCount, 1, 'One anomaly row rendered');
    assert.equal(pageState.largestRowsCount, 2, 'Two largest expense rows rendered');

    // 3. Switch Granularity to Weekly and Apply
    await client.evaluate(`
      document.getElementById('trends-granularity').value = 'week';
      document.getElementById('trends-filter-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 500));

    const calls = getTrendsCalls();
    assert.ok(calls.length >= 2, 'At least 2 trends API calls made');
    assert.match(calls[calls.length - 1], /granularity=week/, 'Weekly granularity sent in API query');

    // 4. Verify Sidebar Navigation & Disabled Status
    const sidebarCheck = await client.evaluate(`({
      hasAccountGroup: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim()),
      trendsIsActive: document.querySelector('[data-nav="insights-trends"]')?.classList.contains('active'),
      trendsIsDisabled: document.querySelector('[data-nav="insights-trends"]')?.classList.contains('is-disabled'),
      trendsHasSoonBadge: document.querySelector('[data-nav="insights-trends"] .nav-pill')?.textContent,
      incomeIsDisabled: document.querySelector('[data-nav="insights-income"]')?.classList.contains('is-disabled')
    })`);

    assert.equal(sidebarCheck.hasAccountGroup, false, 'No sidebar Account heading');
    assert.deepEqual(sidebarCheck.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'Exact 4 groups');
    assert.equal(sidebarCheck.trendsIsActive, true, 'Spending Trends sidebar link must be active');
    assert.equal(sidebarCheck.trendsIsDisabled, false, 'Spending Trends sidebar link must not be disabled');
    assert.equal(sidebarCheck.trendsHasSoonBadge, undefined, 'Spending Trends sidebar link must not retain Soon pill');
    assert.equal(sidebarCheck.incomeIsDisabled, false, 'Income Analysis sidebar link must not be disabled');

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});

