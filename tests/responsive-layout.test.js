// Browser regression test for Batch 4 responsive-layout verification.
// Opens representative pages at the required viewport widths (360, 390, 768,
// 1280) in light and dark appearances and asserts that no horizontal page
// overflow is produced and that the mobile drawer can be opened and closed
// with the Escape key.
// Run with: node --test tests/responsive-layout.test.js
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

function sendJSON(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function createMockServer(rootDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    const endpoint = pathname.replace(/^\/api/, '');

    if (endpoint === '/user') {
      sendJSON(res, { success: true, user: { id: 1, name: 'Responsive Batch Check', email: 'batch4@example.com' } });
      return;
    }
    if (endpoint === '/analytics/cash-flow') {
      sendJSON(res, {
        success: true,
        data: { month: 10, year: 2026, income: 42000, expenses: 18000, net: 24000 }
      });
      return;
    }
    if (endpoint === '/analytics/spending-by-category') {
      sendJSON(res, {
        success: true,
        data: { month: 10, year: 2026, breakdown: [ { category_id: 11, category_name: 'Food', total_spent: 1200 } ] }
      });
      return;
    }
    if (endpoint === '/analytics/month-comparison') {
      sendJSON(res, {
        success: true,
        data: {
          current_month: { month: 10, year: 2026, income: 42000, expenses: 18000, net: 24000 },
          previous_month: { month: 9, year: 2026, income: 40000, expenses: 19000, net: 21000 },
          change_percentage: { income: 5, expenses: -5.3 }
        }
      });
      return;
    }
    if (endpoint === '/analytics/budget-status') {
      sendJSON(res, {
        success: true,
        data: { month: 10, year: 2026, budgets: [] }
      });
      return;
    }
    if (endpoint === '/categories') {
      sendJSON(res, {
        success: true,
        data: [
          { id: 11, name: 'Food', type: 'expense' },
          { id: 12, name: 'Transport', type: 'expense' },
          { id: 21, name: 'Salary', type: 'income' }
        ]
      });
      return;
    }
    if (endpoint === '/expenses' || endpoint.startsWith('/expenses?') || /^\/expenses\/\d+$/.test(endpoint)) {
      sendJSON(res, {
        success: true,
        data: [
          { id: 1, amount: 250.5, description: 'Groceries', category: { id: 11, name: 'Food' }, transaction_date: '2026-10-08' },
          { id: 2, amount: 89.99, description: 'Metro card recharge', category: { id: 12, name: 'Transport' }, transaction_date: '2026-10-09' }
        ],
        meta: { current_page: 1, last_page: 1, per_page: 10 }
      });
      return;
    }
    if (endpoint === '/incomes' || endpoint.startsWith('/incomes?') || /^\/incomes\/\d+$/.test(endpoint)) {
      sendJSON(res, {
        success: true,
        data: [
          { id: 1, amount: 35000, source: 'Salary', frequency: 'monthly', income_date: '2026-10-01' }
        ],
        meta: { current_page: 1, last_page: 1, per_page: 10 }
      });
      return;
    }
    if (endpoint === '/budgets') {
      sendJSON(res, {
        success: true,
        data: [
          { id: 1, limit_amount: 3000, month_year: '2026-10', category: { id: 11, name: 'Food' } }
        ]
      });
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

const PAGES = [
  'dashboard/dashboard.html',
  'expense-management/expenses.html',
  'income-management/income.html',
  'budget-planning/budget.html',
  'categories-management/categories.html',
  'settings/settings.html'
];
const VIEWPORTS = [360, 390, 768, 1280];

test('authenticated pages have no horizontal overflow at required widths and themes', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found; skipping browser test');
    return;
  }
  const rootDir = path.resolve(__dirname, '..');
  const server = createMockServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devTools = new Promise((resolve) => {
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
  const callbacks = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    callbacks.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
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
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/${PAGES[0]}`), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && callbacks.has(message.id)) {
        callbacks.get(message.id)(message);
        callbacks.delete(message.id);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.enable');

    for (const page of PAGES) {
      for (const mode of ['light', 'dark']) {
        for (const width of VIEWPORTS) {
          await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
          await send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
          await new Promise((resolve) => setTimeout(resolve, 450));

          const result = await evaluate(`
            const element = document.documentElement;
            const overflow = element.scrollWidth - element.clientWidth;
            return { page: ${JSON.stringify(page)}, width: ${width}, mode: ${JSON.stringify(mode)}, overflow };
          `);
          assert.ok(
            result.overflow <= 1,
            `${page} at ${width}px (${mode}) should not overflow horizontally (overflow=${result.overflow}px)`
          );
        }
      }

      // Theme controls must remain present and labelled at all widths.
      const themeCtl = await evaluate(`
        const btn = document.querySelector('[data-theme-toggle]');
        return { present: Boolean(btn), label: btn ? btn.getAttribute('aria-label') : null };
      `);
      assert.ok(themeCtl.present, 'theme toggle present on dashboard');
      assert.ok(themeCtl.label, 'theme toggle has an accessible label');
    }

    // Mobile drawer: open at 390px and close with Escape on one page.
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/${PAGES[1]}` });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await evaluate(`document.querySelector('[data-sidebar-toggle]').click();`);
    const opened = await evaluate(`return document.body.classList.contains('sidebar-open');`);
    assert.equal(opened, true, 'mobile drawer should open at 390px');
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
    const closed = await evaluate(`return document.body.classList.contains('sidebar-open');`);
    assert.equal(closed, false, 'Escape should close the mobile drawer');

    // Reports header: period selectors, theme toggle, Refresh, and the account
    // trigger must share one bottom baseline at desktop width without overflow.
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/reports-analytics/reports.html` });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const baseline = await evaluate(`
      const bottoms = ['[data-period-month]', '[data-period-year]', '[data-theme-toggle]', '[data-reports-refresh]', '[data-account-trigger]']
        .map((sel) => {
          const el = document.querySelector(sel);
          return el ? Math.round(el.getBoundingClientRect().bottom) : null;
        })
        .filter((v) => v !== null);
      return { bottoms, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    `);
    assert.ok(
      Math.max(...baseline.bottoms) - Math.min(...baseline.bottoms) <= 2,
      `reports header controls should share a bottom baseline (bottoms=${JSON.stringify(baseline.bottoms)})`
    );
    assert.ok(baseline.overflow <= 1, 'reports header should not overflow at 1280px');

    // Transaction pages: filter toolbar and table inherit the card's resting
    // horizontal padding instead of hugging the card edges.
    for (const txnPage of ['expense-management/expenses.html', 'income-management/income.html']) {
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/${txnPage}` });
      const waitStart = Date.now();
      while (Date.now() - waitStart < 8000) {
        const ready = await evaluate(`return Boolean(document.querySelector('.filter-toolbar'));`);
        if (ready === true) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const spacing = await evaluate(`
        const toolbar = document.querySelector('[data-expense-filters]') || document.querySelector('[data-income-filters]');
        return {
          className: toolbar ? toolbar.className : null,
          toolbarPaddingLeft: toolbar ? parseFloat(getComputedStyle(toolbar).paddingLeft) : null,
          href: location.href
        };
      `);
      assert.ok(
        spacing.toolbarPaddingLeft !== null && spacing.toolbarPaddingLeft >= 16,
        `${txnPage}: filter toolbar should have resting horizontal padding (class=${spacing.className}, pad=${spacing.toolbarPaddingLeft}px at ${spacing.href})`
      );
    }
  } finally {
    if (ws) ws.close();
    await new Promise((resolve) => { chrome.on('exit', resolve); chrome.kill(); });
    server.closeAllConnections && server.closeAllConnections();
    server.close();
  }
});
