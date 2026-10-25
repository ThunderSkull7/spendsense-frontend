const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].find((candidate) => fs.existsSync(candidate)) || null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function createMockServer(rootDir, handlers = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    const endpoint = pathname.replace(/^\/api/, '');
    if (handlers[endpoint]) {
      handlers[endpoint](req, res);
      return;
    }

    if (endpoint === '/analytics/spending-by-category') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          month: 10,
          year: 2026,
          breakdown: [
            { category_id: 1, category_name: 'Food & Dining', total_spent: 1200 },
            { category_id: 2, category_name: 'Groceries', total_spent: 800 }
          ]
        }
      }));
      return;
    }
    if (endpoint === '/analytics/month-comparison') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          current_month: { month: 10, year: 2026, income: 5000, expenses: 2000, net: 3000 },
          previous_month: { month: 9, year: 2026, income: 4500, expenses: 2200, net: 2300 },
          change_percentage: { income: 11.1, expenses: -9.1 }
        }
      }));
      return;
    }
    if (endpoint === '/analytics/budget-alerts') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: { alerts: [] }
      }));
      return;
    }
    if (endpoint === '/analytics/budget-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          month: 10,
          year: 2026,
          budgets: [
            {
              category_id: 1,
              category_name: 'Food & Dining',
              limit_amount: 1500,
              spent_amount: 1200,
              remaining_amount: 300,
              percentage_used: 80,
              is_overspent: false
            }
          ]
        }
      }));
      return;
    }

    const filePath = path.join(rootDir, pathname.slice(1));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.js') {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/127\.0\.0\.1:8002/g, `127.0.0.1:${req.socket.localPort}`);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] });
      res.end(content);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

test('reports analytics keep one reporting period and render accessible chart summaries', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found; skipping browser test');
    return;
  }
  const rootDir = path.resolve(__dirname, '..');
  const server = createMockServer(rootDir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devTools = new Promise(resolve => {
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = Number(match[1]);
        resolve();
      }
    });
  });
  let ws = null;
  let msgId = 1;
  let state = null;
  const callbacks = new Map();
  const consoleLogs = [];
  const send = (method, params = {}) => new Promise(resolve => {
    const id = msgId++;
    callbacks.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', {
      expression: `(() => { try { ${expression} } catch (error) { return { error: error.message }; } })()`,
      returnByValue: true
    });
    const value = response.result && response.result.result ? response.result.result.value : null;
    if (value && value.error) throw new Error(value.error);
    return value;
  };
  try {
    await devTools;
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/reports-analytics/reports.html`), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(JSON.stringify(message.params.args));
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleLogs.push(JSON.stringify(message.params.exceptionDetails));
      }
      if (message.method === 'Network.loadingFailed') {
        consoleLogs.push('LOAD_FAIL ' + JSON.stringify(message.params));
      }
      if (message.id && callbacks.has(message.id)) {
        callbacks.get(message.id)(message);
        callbacks.delete(message.id);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/reports-analytics/reports.html` });
    const waitStart = Date.now();
    while (Date.now() - waitStart < 8000) {
      const check = await send('Runtime.evaluate', {
        expression: `(() => {
          const inc = document.querySelector('[data-stat-income]')?.textContent;
          return inc && inc !== '—' && inc !== 'Loading…';
        })()`,
        returnByValue: true
      });
      if (check.result && check.result.result && check.result.result.value === true) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    await new Promise(resolve => setTimeout(resolve, 400));

    state = await evaluate(`
      return {
        statIncome: document.querySelector('[data-stat-income]').textContent.trim(),
        statExpenses: document.querySelector('[data-stat-expenses]').textContent.trim(),
        statNet: document.querySelector('[data-stat-net]').textContent.trim(),
        periodLabel: document.querySelector('[data-period-label]').textContent.trim(),
        spendingSummary: document.querySelector('[data-spending-summary]').textContent.trim(),
        cashflowSummary: document.querySelector('[data-cashflow-summary]').textContent.trim(),
      };
    `);

    assert.equal(state.statIncome, '₹5,000', 'income should be formatted as INR');
    assert.equal(state.statExpenses, '₹2,000', 'expenses should be formatted as INR');
    assert.equal(state.statNet, '+₹3,000', 'net cash flow should never be labelled as a bank balance');
    assert.equal(state.periodLabel, 'October 2026', 'reporting period should be explicit');
    assert.ok(state.spendingSummary.includes('Food & Dining'), 'spending summary should have exact category names');
    assert.ok(state.spendingSummary.includes('₹1,200'), 'spending summary should expose exact values');
    assert.ok(state.cashflowSummary.includes('net cash flow ₹3,000'), 'cash flow summary should avoid bank-balance wording');
  } catch (error) {
    console.log('state', JSON.stringify(state));
    console.log('console logs', consoleLogs);
    throw error;
  } finally {
    if (ws) ws.close();
    await new Promise(resolve => { chrome.on('exit', resolve); chrome.kill(); });
    server.closeAllConnections && server.closeAllConnections();
    server.close();
  }
});
