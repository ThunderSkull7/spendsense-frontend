// Automated verification test: Reports Donut Dataset Sum Equals Legend Total in Both Light and Dark Themes
// Run with: node --test tests/donut-sum-assertion.test.js
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

const mockBreakdown = [
  { category_id: 1, category_name: 'Food & Dining', total_spent: 20000 },
  { category_id: 2, category_name: 'Groceries', total_spent: 15000 },
  { category_id: 3, category_name: 'Transport', total_spent: 8000 },
  { category_id: 4, category_name: 'Bills & Utilities', total_spent: 7000 },
  { category_id: 5, category_name: 'Education', total_spent: 6000 },
  { category_id: 6, category_name: 'Entertainment', total_spent: 5000 },
  { category_id: 7, category_name: 'Housing & Rent', total_spent: 9000 },
  { category_id: 8, category_name: 'Healthcare', total_spent: 4000 },
  { category_id: 9, category_name: 'Shopping', total_spent: 3000 },
  { category_id: 10, category_name: 'Other Expenses', total_spent: 3000 }
];

const rootDir = path.resolve(__dirname, '..');

test('Reports doughnut chart dataset sum equals legend total in both light and dark themes', async (t) => {
  const chromePath = findChrome();
  assert.ok(chromePath, 'Chrome binary must exist');

  const server = http.createServer((req, res) => {
    let pathname = req.url.split('?')[0];
    if (pathname === '/sanctum/csrf-cookie') {
      res.setHeader('Set-Cookie', 'XSRF-TOKEN=test; Path=/');
      res.writeHead(204);
      return res.end();
    }
    if (pathname === '/api/user') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { user: { id: 1 } } }));
    }
    if (pathname.startsWith('/api/analytics/spending-by-category')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        data: {
          month: 11,
          year: 2026,
          total_spent: 80000,
          breakdown: mockBreakdown
        }
      }));
    }
    if (pathname.startsWith('/api/analytics/month-comparison')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { current_month: { income: 95000, expenses: 80000, net: 15000 }, monthly_cashflow: [] } }));
    }
    if (pathname.startsWith('/api/analytics/budget-alerts') || pathname.startsWith('/api/analytics/budget-status')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [] }));
    }
    let filePath = path.join(rootDir, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end(); }
    let content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.html')) {
      content = content.split('http://127.0.0.1:8002').join(`http://127.0.0.1:${server.address().port}`);
    }
    res.writeHead(200);
    res.end(content);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-donut-test-'));
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

  const wsUrlRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
  const tabs = await wsUrlRes.json();
  const WebSocket = require(path.join(rootDir, '../spendsense-frontend-main/node_modules/ws'));
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve) => ws.on('open', resolve));

  let callId = 0;
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++callId;
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === id) {
        ws.off('message', handler);
        resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : null;
  };

  try {
    await send('Page.enable');
    await send('DOM.enable');

    for (const theme of ['light', 'dark']) {
      await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/reports-analytics/reports.html` });
      await new Promise((r) => setTimeout(r, 800));

      if (theme === 'dark') {
        await evaluate(`
          document.documentElement.dataset.mode = 'dark';
          document.documentElement.dataset.themeMode = 'dark';
          window.dispatchEvent(new CustomEvent('spendsense:theme-change', { detail: { mode: 'dark' } }));
        `);
        await new Promise((r) => setTimeout(r, 400));
      }

      const check = await evaluate(`(() => {
        const chart = window.Chart ? window.Chart.getChart('spendingChart') : null;
        const dataset = chart ? chart.data.datasets[0] : null;
        const datasetSum = dataset ? dataset.data.reduce((a, b) => a + b, 0) : 0;

        const legendItems = Array.from(document.querySelectorAll('[data-spending-legend] .legend-item'));
        const legendTotal = legendItems.reduce((acc, el) => {
          const metaText = el.querySelector('.legend-meta')?.textContent || '';
          const match = metaText.match(/₹?([0-9,]+(?:\.[0-9]+)?)/);
          if (match) {
            const raw = parseFloat(match[1].replace(/,/g, ''));
            return acc + (isNaN(raw) ? 0 : raw);
          }
          return acc;
        }, 0);

        return {
          theme: document.documentElement.dataset.mode || 'light',
          hasChart: Boolean(chart),
          datasetLength: dataset ? dataset.data.length : 0,
          datasetSum,
          legendCount: legendItems.length,
          legendTotal
        };
      })()`);

      assert.ok(check.hasChart, `${theme} theme: chart instance must exist`);
      assert.equal(check.datasetLength, 10, `${theme} theme: dataset length must match category count`);
      assert.equal(check.datasetSum, 80000, `${theme} theme: dataset sum must match total spent`);
      assert.equal(check.legendCount, 10, `${theme} theme: legend count must match category count`);
      assert.equal(check.legendTotal, check.datasetSum, `${theme} theme: legend total must exactly equal dataset sum`);
    }
  } finally {
    try { ws.close(); } catch {}
    try { chromeProc.kill(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});
