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

function createMockReportsServer(rootDir, endpointHandlers = {}) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname.startsWith('/api/')) {
      const endpoint = pathname.replace('/api', '');

      if (endpointHandlers[endpoint]) {
        return endpointHandlers[endpoint](req, res);
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      });

      if (endpoint === '/analytics/spending-by-category') {
        return res.end(JSON.stringify({
          status: 'success',
          data: {
            month: 10,
            year: 2026,
            breakdown: [
              { category_id: 1, category_name: 'Food & Dining', total_spent: 1200 },
              { category_id: 2, category_name: 'Groceries', total_spent: 800 }
            ]
          }
        }));
      }
      if (endpoint === '/analytics/month-comparison') {
        return res.end(JSON.stringify({
          status: 'success',
          data: {
            current_month: { month: 10, year: 2026, income: 5000, expenses: 2000, net: 3000 },
            previous_month: { month: 9, year: 2026, income: 4500, expenses: 2200, net: 2300 }
          }
        }));
      }
      if (endpoint === '/analytics/budget-alerts') {
        return res.end(JSON.stringify({
          status: 'success',
          data: {
            alerts: [
              { category_name: 'Food & Dining', alert_type: 'near_limit', spent_amount: 1200, limit_amount: 1500 }
            ]
          }
        }));
      }
      if (endpoint === '/analytics/budget-status') {
        return res.end(JSON.stringify({
          status: 'success',
          data: {
            budgets: [
              { category_id: 1, category_name: 'Food & Dining', spent_amount: 1200, limit_amount: 1500, remaining_amount: 300, percentage_used: 80, is_overspent: false }
            ]
          }
        }));
      }
      return res.end(JSON.stringify({ status: 'success', data: {} }));
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
    if (ext === '.css') {
      const css = fs.readFileSync(filePath, 'utf8').replace(/@import\s+url\([^)]+\);?/g, '');
      res.end(css);
    } else if (ext === '.html') {
      let html = fs.readFileSync(filePath, 'utf8');
      const origin = `http://127.0.0.1:${server.address().port}`;
      html = html.replace('http://127.0.0.1:8002', origin);
      res.end(html);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  });
  return server;
}

test('browser runtime: reports page reaches completed state without errors', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome binary not found');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const server = createMockReportsServer(rootDir);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-reports-test-'));

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + tmpDir
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  await new Promise((resolve, reject) => {
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = parseInt(match[1], 10);
        resolve();
      }
    });
  });

  try {
    const tabUrl = `http://127.0.0.1:${port}/reports-analytics/reports.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(tabUrl), { method: 'PUT' });
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

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

    const send = (method, params = {}) => new Promise(res => {
      const id = msgId++;
      callbacks.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    await send('Page.navigate', { url: tabUrl });
    await new Promise(r => setTimeout(r, 1000));

    // Wait until all sections finish loading
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      const check = await send('Runtime.evaluate', {
        expression: `(() => {
          const inc = document.querySelector('[data-stat-income]')?.textContent;
          const alerts = document.querySelector('[data-alerts]')?.textContent;
          const budgets = document.querySelector('[data-budget-status]')?.textContent;
          return inc !== '—' && !alerts?.includes('Loading alerts') && !budgets?.includes('Loading budgets');
        })()`,
        returnByValue: true
      });
      if (check.result?.result?.value === true) {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    const pageState = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          statIncome: document.querySelector('[data-stat-income]')?.textContent,
          statExpenses: document.querySelector('[data-stat-expenses]')?.textContent,
          spendingStateHidden: document.querySelector('[data-spending-state]')?.hidden,
          spendingChartHidden: document.querySelector('[data-spending-chart]')?.hidden,
          spendingLegendCount: document.querySelector('[data-spending-legend]')?.children?.length,
          cashflowStateHidden: document.querySelector('[data-cashflow-state]')?.hidden,
          cashflowChartHidden: document.querySelector('[data-cashflow-chart]')?.hidden,
          alertsText: document.querySelector('[data-alerts]')?.innerText,
          budgetStatusText: document.querySelector('[data-budget-status]')?.innerText,
          monthLabel: document.querySelector('[data-month-label]')?.textContent
        };
      })()`,
      returnByValue: true
    });

    const val = pageState.result?.result?.value;
    assert.deepEqual(jsExceptions, [], 'Expected zero uncaught JS exceptions');
    assert.ok(val.statIncome.includes('5,000'), 'Stat income should be rendered');
    assert.ok(val.statExpenses.includes('2,000'), 'Stat expenses should be rendered');
    assert.equal(val.spendingStateHidden, true, 'Spending loading state should be hidden');
    assert.equal(val.spendingChartHidden, false, 'Spending chart container should be visible');
    assert.ok(val.spendingLegendCount >= 2, 'Spending legend should have category entries');
    assert.equal(val.cashflowStateHidden, true, 'Cash flow loading state should be hidden');
    assert.equal(val.cashflowChartHidden, false, 'Cash flow chart container should be visible');
    assert.ok(val.alertsText.includes('Food & Dining'), 'Alerts should render category item');
    assert.ok(val.budgetStatusText.includes('Food & Dining'), 'Budget status should render category item');
    assert.ok(val.monthLabel.includes('October 2026'), 'Month label should be formatted');

    ws.close();
  } finally {
    chrome.kill();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});

test('browser runtime: failing section does not block other sections', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome binary not found');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  // spending fails with 500, but other sections succeed
  const server = createMockReportsServer(rootDir, {
    '/analytics/spending-by-category': (req, res) => {
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true'
      });
      res.end(JSON.stringify({ status: 'error', message: 'Internal Server Error' }));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-reports-fail-test-'));

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + tmpDir
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  await new Promise((resolve, reject) => {
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = parseInt(match[1], 10);
        resolve();
      }
    });
  });

  try {
    const tabUrl = `http://127.0.0.1:${port}/reports-analytics/reports.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(tabUrl), { method: 'PUT' });
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    const send = (method, params = {}) => new Promise(res => {
      const id = msgId++;
      callbacks.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    await send('Page.navigate', { url: tabUrl });
    await new Promise(r => setTimeout(r, 1000));

    // Wait until stat-income and other sections have rendered, and spending shows error
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      const check = await send('Runtime.evaluate', {
        expression: `(() => {
          const inc = document.querySelector('[data-stat-income]')?.textContent;
          const spending = document.querySelector('[data-spending-state]')?.textContent;
          const budgets = document.querySelector('[data-budget-status]')?.textContent;
          return inc !== '—' && !budgets?.includes('Loading budgets') && !spending?.includes('Loading chart');
        })()`,
        returnByValue: true
      });
      if (check.result?.result?.value === true) {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    const pageState = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          statIncome: document.querySelector('[data-stat-income]')?.textContent,
          spendingErrorText: document.querySelector('[data-spending-state]')?.innerText,
          cashflowChartHidden: document.querySelector('[data-cashflow-chart]')?.hidden,
          alertsText: document.querySelector('[data-alerts]')?.innerText,
          budgetStatusText: document.querySelector('[data-budget-status]')?.innerText,
        };
      })()`,
      returnByValue: true
    });

    const val = pageState.result?.result?.value;
    assert.ok(val.spendingErrorText.includes('Could not load spending data'), 'Spending section shows error message');
    assert.ok(val.spendingErrorText.includes('Try again'), 'Spending section shows retry button');
    // Other sections rendered successfully
    assert.ok(val.statIncome.includes('5,000'), 'Cash flow / top stat still rendered');
    assert.equal(val.cashflowChartHidden, false, 'Cash flow chart still rendered');
    assert.ok(val.alertsText.includes('Food & Dining'), 'Alerts still rendered');
    assert.ok(val.budgetStatusText.includes('Food & Dining'), 'Budget status still rendered');

    ws.close();
  } finally {
    chrome.kill();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});
