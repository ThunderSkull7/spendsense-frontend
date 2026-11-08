// Browser regression test for Standalone Cash Flow Forecast Page
// Run with: node --test tests/cash-flow-forecast-browser.test.js
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
  let forecastCalls = [];

  const mockForecastData = {
    as_of: '2026-11-08',
    horizon_days: 30,
    window: {
      start: '2026-11-08',
      end: '2026-12-07',
      calendar_days: 30,
      timezone: 'UTC',
      boundary: 'Inclusive UTC calendar days beginning with as_of.'
    },
    starting_balance: null,
    starting_balance_status: 'unavailable',
    starting_balance_reason: 'SpendSense does not store a verified cash-account balance. Net worth valuations and savings goals are not treated as available cash.',
    expected_income: '80000.00',
    expected_expenses: '35000.00',
    projected_net_cash_flow: '45000.00',
    ending_balance: null,
    ending_balance_reason: 'An ending balance would require a trustworthy starting balance. Only projected net cash flow is shown.',
    negative_cash_flow_dates: [],
    negative_cash_flow_status: 'not_calculable',
    negative_cash_flow_reason: 'The date cash becomes negative cannot be calculated without a verified opening balance.',
    monthly_projection: [
      {
        month: '2026-11',
        label: 'November 2026',
        expected_income: '80000.00',
        expected_expenses: '25000.00',
        projected_net_cash_flow: '55000.00',
        is_partial: true
      },
      {
        month: '2026-12',
        label: 'December 2026',
        expected_income: '0.00',
        expected_expenses: '10000.00',
        projected_net_cash_flow: '-10000.00',
        is_partial: true
      }
    ],
    upcoming_bills: [
      {
        type: 'expense',
        date: '2026-11-15',
        name: 'Internet Fiber',
        amount: '2000.00',
        source: 'recurring_expense',
        schedule_id: 1,
        category: { id: 1, name: 'Utilities' },
        certainty: 'expected'
      }
    ],
    events: [
      {
        type: 'income',
        date: '2026-11-10',
        name: 'Salary',
        amount: '80000.00',
        source: 'recurring_income',
        schedule_id: 1,
        category: null,
        certainty: 'expected'
      },
      {
        type: 'expense',
        date: '2026-11-15',
        name: 'Internet Fiber',
        amount: '2000.00',
        source: 'recurring_expense',
        schedule_id: 1,
        category: { id: 1, name: 'Utilities' },
        certainty: 'expected'
      },
      {
        type: 'expense',
        date: '2026-11-20',
        name: 'Apartment Rent',
        amount: '23000.00',
        source: 'recurring_expense',
        schedule_id: 2,
        category: { id: 2, name: 'Housing' },
        certainty: 'expected'
      },
      {
        type: 'expense',
        date: '2026-12-01',
        name: 'Gym Membership',
        amount: '10000.00',
        source: 'recurring_expense',
        schedule_id: 3,
        category: { id: 3, name: 'Fitness' },
        certainty: 'expected'
      }
    ],
    event_count: 4,
    events_truncated: false,
    expected_income_count: 1,
    expected_expense_count: 3,
    overdue_commitments: {
      count: 1,
      total: '1500.00',
      included_in_forecast: false,
      note: 'Planned bills dated before the forecast window are shown for awareness but are not re-dated or added to future totals.'
    },
    schedule_context: {
      recurring_income: { active: 1, paused: 0, stopped: 0 },
      recurring_expense: { active: 3, paused: 0, stopped: 0 }
    },
    subscriptions: {
      active_count: 2,
      estimated_monthly_cost: '999.00',
      note: 'Subscription cost is a separate planning summary and is not added to the expected expense total above.'
    },
    historical_actuals: {
      from: '2026-08-01',
      to: '2026-10-31',
      months: 3,
      average_monthly_income: '75000.00',
      average_monthly_expenses: '40000.00',
      note: 'Recent completed UTC calendar months. Shown as context only; these averages are not projected into the future.'
    },
    notes: [
      'Forecast amounts are expected recurring occurrences, not completed income or expenses.',
      'Paid, skipped and cancelled occurrences are excluded; paused and stopped schedules are excluded by query.'
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

    if (pathname === '/api/analytics/cash-flow-forecast') {
      forecastCalls.push(parsedUrl.search);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: mockForecastData
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
    getForecastCalls: () => forecastCalls
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

test('browser runtime: standalone cash flow forecast page, horizons, integrity notice, overdue callout', async () => {
  const chromePath = findChrome();
  if (!chromePath) {
    console.warn('Chrome binary not found; skipping Cash Flow Forecast browser test.');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getForecastCalls } = createMockServer(rootDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-cff-test-'));
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

    // 1. Navigate to cash-flow-forecast.html
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/cash-flow-forecast/cash-flow-forecast.html` });
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      const isPopulated = await client.evaluate(`Boolean(document.getElementById('stat-expected-income')?.textContent?.includes('80,000')) && document.querySelectorAll('#forecast-events-body tr').length > 0`);
      if (isPopulated) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // 2. Verify page title, summary metrics, integrity banner & overdue callout
    const pageState = await client.evaluate(`({
      title: document.title,
      expectedIncome: document.getElementById('stat-expected-income')?.textContent,
      expectedExpenses: document.getElementById('stat-expected-expenses')?.textContent,
      projectedNet: document.getElementById('stat-projected-net')?.textContent,
      horizonDays: document.getElementById('stat-horizon-days')?.textContent,
      monthlyCardsCount: document.querySelectorAll('#forecast-monthly-grid .card').length,
      eventsRowsCount: document.querySelectorAll('#forecast-events-body tr').length,
      hasIntegrityBanner: document.getElementById('forecast-integrity-banner')?.style.display !== 'none',
      overdueText: document.getElementById('forecast-overdue-text')?.textContent
    })`);

    assert.equal(pageState.title, 'Cash Flow Forecast | SpendSense', 'Page title must match');
    assert.match(pageState.expectedIncome, /80,000|80000/, 'Projected income must match');
    assert.match(pageState.expectedExpenses, /35,000|35000/, 'Projected expenses must match');
    assert.match(pageState.projectedNet, /45,000|45000/, 'Projected net cash flow must match');
    assert.equal(pageState.horizonDays, '30 Days', 'Horizon days must match');
    assert.equal(pageState.monthlyCardsCount, 2, 'Two monthly projection cards rendered');
    assert.equal(pageState.eventsRowsCount, 4, 'Four planned events rendered');
    assert.equal(pageState.hasIntegrityBanner, true, 'Integrity starting balance banner must be visible');
    assert.match(pageState.overdueText, /1 overdue planned commitment/i, 'Overdue callout must be populated');

    // 3. Test Event Filter: filter by 'income'
    await client.evaluate(`
      document.getElementById('forecast-event-filter').value = 'income';
      document.getElementById('forecast-event-filter').dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 300));

    const incomeEventsCount = await client.evaluate(`document.querySelectorAll('#forecast-events-body tr').length`);
    assert.equal(incomeEventsCount, 1, 'Filtering by income must show only 1 event');

    // 4. Test Event Filter: filter by 'expense'
    await client.evaluate(`
      document.getElementById('forecast-event-filter').value = 'expense';
      document.getElementById('forecast-event-filter').dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 300));

    const expenseEventsCount = await client.evaluate(`document.querySelectorAll('#forecast-events-body tr').length`);
    assert.equal(expenseEventsCount, 3, 'Filtering by expense must show 3 events');

    // 5. Test Filter Form Submission with 60 Days horizon
    await client.evaluate(`
      document.getElementById('forecast-horizon').value = '60';
      document.getElementById('forecast-filter-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 500));

    const calls = getForecastCalls();
    assert.ok(calls.length >= 2, 'At least 2 cash flow forecast API calls made');
    assert.ok(calls.some(c => c.includes('horizon=60')), 'Horizon 60 query parameter sent');

    // 6. Verify Sidebar Navigation & Disabled Status
    const sidebarCheck = await client.evaluate(`({
      hasAccountGroup: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim()),
      forecastIsActive: document.querySelector('[data-nav="forecast"]')?.classList.contains('active'),
      forecastIsDisabled: document.querySelector('[data-nav="forecast"]')?.classList.contains('is-disabled'),
      forecastHasSoonBadge: document.querySelector('[data-nav="forecast"] .nav-pill')?.textContent,
      budgetsIsDisabled: document.querySelector('[data-nav="insights-budgets"]')?.classList.contains('is-disabled')
    })`);

    assert.equal(sidebarCheck.hasAccountGroup, false, 'No sidebar Account heading');
    assert.deepEqual(sidebarCheck.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'Exact 4 groups');
    assert.equal(sidebarCheck.forecastIsActive, true, 'Cash Flow Forecast sidebar link must be active');
    assert.equal(sidebarCheck.forecastIsDisabled, false, 'Cash Flow Forecast sidebar link must not be disabled');
    assert.equal(sidebarCheck.forecastHasSoonBadge, undefined, 'Cash Flow Forecast sidebar link must not retain Soon pill');
    assert.equal(sidebarCheck.budgetsIsDisabled, false, 'Budget Performance sidebar link must not be disabled');

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});
