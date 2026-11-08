// Browser tests for Recurring Bills & Bill Calendar
// Run with: node tools/run-tests.js --suite=browser
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
  let previewCalls = 0;
  let createCalls = 0;

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
      return res.end(JSON.stringify({
        data: [
          { id: 1, name: 'Housing', type: 'expense', is_default: true },
          { id: 2, name: 'Utilities', type: 'expense', is_default: true }
        ]
      }));
    }

    if (pathname === '/api/expenses') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { data: [], total: 0, current_page: 1, last_page: 1 } }));
    }

    if (pathname === '/api/recurring-expenses/preview') {
      previewCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          count: 12,
          start_date: '2026-11-01',
          end_date: '2027-10-01',
          total_expected: '1200.00'
        }
      }));
    }

    if (pathname === '/api/recurring-expenses/calendar') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          month: '2026-11',
          month_label: 'November 2026',
          first_weekday: 7, // Sunday
          days_in_month: 30,
          entries: [
            {
              id: 101,
              occurrence_date: '2026-11-15',
              expected_amount: '100.00',
              status: 'planned',
              display_status: 'upcoming',
              can_pay: true,
              can_skip: true,
              schedule: { id: 1, description: 'Broadband Internet', frequency: 'monthly', category: { id: 2, name: 'Utilities' } }
            }
          ],
          summary: {
            expected_total: '100.00',
            paid_total: '0.00',
            unpaid_total: '100.00',
            overdue_total: '0.00',
            entry_count: 1
          },
          upcoming: [
            {
              id: 101,
              occurrence_date: '2026-11-15',
              expected_amount: '100.00',
              status: 'planned',
              display_status: 'upcoming',
              schedule: { id: 1, description: 'Broadband Internet', frequency: 'monthly', category: { id: 2, name: 'Utilities' } }
            }
          ],
          overdue: []
        }
      }));
    }

    if (pathname === '/api/recurring-expenses' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          schedules: [
            {
              id: 1,
              description: 'Broadband Internet',
              amount: '100.00',
              frequency: 'monthly',
              status: 'active',
              category_id: 2,
              category: { id: 2, name: 'Utilities' },
              monthly_equivalent: '100.00',
              annual_equivalent: '1200.00',
              next_due_date: '2026-11-15',
              start_date: '2026-01-01'
            }
          ],
          summary: {
            active_count: 1,
            paused_count: 0,
            stopped_count: 0,
            monthly_equivalent_total: '100.00',
            annual_equivalent_total: '1200.00',
            unpaid_total: '100.00',
            overdue_total: '0.00'
          }
        }
      }));
    }

    if (pathname === '/api/recurring-expenses' && req.method === 'POST') {
      createCalls++;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          id: 2,
          description: 'New Bill',
          amount: '50.00',
          frequency: 'monthly',
          status: 'active'
        }
      }));
    }

    if (pathname === '/api/bill-reminders') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          reminders: [
            {
              id: 1,
              type: 'upcoming',
              title: 'Broadband Internet Due',
              due_date: '2026-11-15',
              expected_amount: '100.00',
              is_read: false
            }
          ],
          summary: {
            unread_count: 1
          }
        }
      }));
    }

    // Static assets
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
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (ext === '.html') {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/content="http:\/\/127\.0\.0\.1:8002"/g, `content="http://127.0.0.1:${server.address().port}"`);
      res.writeHead(200, { 'Content-Type': contentType });
      return res.end(content);
    }

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return {
    server,
    getStats: () => ({ previewCalls, createCalls })
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

test('browser runtime: standalone recurring transactions page, bill modal live preview, financial calendar interactions, expenses tab removal, and legacy redirects', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome not available in test environment');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server } = createMockServer(rootDir);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-rec-test-'));
  const cdpPort = 9222 + Math.floor(Math.random() * 500);

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-background-networking',
    `http://127.0.0.1:${serverPort}/recurring-transactions/recurring-transactions.html`
  ], { stdio: 'ignore' });

  const client = new ChromeClient(cdpPort);

  try {
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await new Promise(r => setTimeout(r, 150));
        await client.connect();
        connected = true;
        break;
      } catch {}
    }
    assert.ok(connected, 'Connected to Chrome via CDP');

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Console.enable');

    // Wait for DOM load and data population
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      const isPopulated = await client.evaluate(`!!document.querySelector('[data-stat-monthly-commitment]')?.textContent && !!document.querySelector('[data-recurring-rows] .cell-main')`);
      if (isPopulated) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // 1. Verify Standalone Recurring Transactions page
    const recVisible = await client.evaluate(`!document.getElementById('view-recurring-bills').hidden`);
    assert.strictEqual(recVisible, true, 'view-recurring-bills is visible on recurring-transactions.html');

    // Verify recurring summary stat cards populated
    const monthlyEst = await client.evaluate(`document.querySelector('[data-stat-monthly-commitment]').textContent`);
    assert.match(monthlyEst, /100\.00/, 'Monthly equivalent stat is rendered');

    // Verify schedule row rendered
    const schedDesc = await client.evaluate(`document.querySelector('[data-recurring-rows] .cell-main').textContent`);
    assert.strictEqual(schedDesc, 'Broadband Internet', 'Schedule description matches mock data');

    // 2. Open Add Recurring Bill modal
    await client.evaluate(`document.getElementById('open-add-recurring-btn').click()`);
    await new Promise(r => setTimeout(r, 200));

    const modalOpen = await client.evaluate(`!document.getElementById('recurring-modal').hidden`);
    assert.strictEqual(modalOpen, true, 'Recurring modal is visible');

    // Type into form and verify live preview triggers
    await client.evaluate(`
      document.getElementById('recurring-description').value = 'Gym Membership';
      document.getElementById('recurring-amount').value = '40.00';
      document.getElementById('recurring-start-date').value = '2026-11-01';
      document.getElementById('recurring-amount').dispatchEvent(new Event('input'));
    `);
    await new Promise(r => setTimeout(r, 450));

    const previewShown = await client.evaluate(`!document.getElementById('recurring-preview-box').hidden`);
    assert.strictEqual(previewShown, true, 'Live projection preview box is displayed');

    // Close modal via cancel
    await client.evaluate(`document.getElementById('cancel-recurring-modal-btn').click()`);
    const modalClosed = await client.evaluate(`document.getElementById('recurring-modal').hidden`);
    assert.strictEqual(modalClosed, true, 'Modal closes on cancel');

    // 3. Navigate to standalone Financial Calendar page
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/financial-calendar/financial-calendar.html` });
    await new Promise(r => setTimeout(r, 800));

    const calVisible = await client.evaluate(`!document.getElementById('view-bill-calendar').hidden`);
    assert.strictEqual(calVisible, true, 'view-bill-calendar is visible on financial-calendar.html');

    // Verify calendar header and grid
    const calHeading = await client.evaluate(`document.getElementById('calendar-month-heading').textContent`);
    assert.strictEqual(calHeading, 'November 2026', 'Calendar displays November 2026');

    // Verify calendar days rendered
    const dayCount = await client.evaluate(`document.querySelectorAll('[data-calendar-grid] .calendar-day').length`);
    assert.ok(dayCount >= 30, 'Calendar grid rendered 30+ day cells');

    // Verify day cell with entry has bill pill
    const billPill = await client.evaluate(`document.querySelector('.calendar-bill-pill strong').textContent`);
    assert.match(billPill, /100\.00/, 'Calendar day cell displays bill pill with amount');

    // Click on 2026-11-15 day cell to test selected day panel
    await client.evaluate(`document.querySelector('[data-calendar-date="2026-11-15"]').click()`);
    await new Promise(r => setTimeout(r, 200));

    const dayPanelTitle = await client.evaluate(`document.querySelector('[data-calendar-day-title]').textContent`);
    assert.match(dayPanelTitle, /15/, 'Day detail panel reflects selected day 15');

    const dayPanelItem = await client.evaluate(`document.querySelector('[data-calendar-day-list]').textContent`);
    assert.match(dayPanelItem, /Broadband Internet/, 'Day detail panel lists Broadband Internet');

    // 4. Test legacy redirect from expenses.html?tab=recurring
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/expense-management/expenses.html?tab=recurring` });
    await new Promise(r => setTimeout(r, 800));
    const redirectedRec = await client.evaluate(`window.location.href`);
    assert.match(redirectedRec, /recurring-transactions\.html/, 'Legacy ?tab=recurring redirects to standalone page');

    // 5. Test legacy redirect from expenses.html?tab=calendar
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/expense-management/expenses.html?tab=calendar` });
    await new Promise(r => setTimeout(r, 800));
    const redirectedCal = await client.evaluate(`window.location.href`);
    assert.match(redirectedCal, /financial-calendar\.html/, 'Legacy ?tab=calendar redirects to standalone page');

    // 6. Navigate directly to expenses.html and verify tab removals and header dropdown
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/expense-management/expenses.html` });
    await new Promise(r => setTimeout(r, 800));

    const expensesState = await client.evaluate(`({
      hasRecurringTab: document.getElementById('tab-recurring-bills') !== null,
      hasCalendarTab: document.getElementById('tab-bill-calendar') !== null,
      hasRecurringView: document.getElementById('view-recurring-bills') !== null,
      hasCalendarView: document.getElementById('view-bill-calendar') !== null,
      hasExpensesView: document.getElementById('view-all-expenses') !== null,
      hasSidebarAccount: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      hasSidebarFooter: document.querySelector('.sidebar-footer') !== null,
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim())
    })`);

    assert.equal(expensesState.hasRecurringTab, false, 'expenses.html must not contain recurring bills tab');
    assert.equal(expensesState.hasCalendarTab, false, 'expenses.html must not contain bill calendar tab');
    assert.equal(expensesState.hasRecurringView, false, 'expenses.html must not contain recurring bills view panel');
    assert.equal(expensesState.hasCalendarView, false, 'expenses.html must not contain bill calendar view panel');
    assert.equal(expensesState.hasExpensesView, true, 'expenses.html must retain view-all-expenses panel');
    assert.equal(expensesState.hasSidebarAccount, false, 'expenses.html must not contain sidebar Account heading');
    assert.equal(expensesState.hasSidebarFooter, false, 'expenses.html must not contain sidebar footer');
    assert.deepEqual(expensesState.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'expenses.html must have exact 4 sidebar groups');

    // 7. Verify the six future Batch 2 sidebar entries: visible, disabled, non-navigating, and styled
    const futureNavChecks = await client.evaluate(`({
      subscriptions: (() => {
        const el = document.querySelector('[data-nav="subscriptions"]');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          hasHref: el.hasAttribute('href'),
          isDisabled: el.classList.contains('is-disabled'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          role: el.getAttribute('role'),
          cursor: style.cursor,
          text: el.textContent.trim(),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
        };
      })(),
      netWorth: (() => {
        const el = document.querySelector('[data-nav="net-worth"]');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          hasHref: el.hasAttribute('href'),
          isDisabled: el.classList.contains('is-disabled'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          role: el.getAttribute('role'),
          cursor: style.cursor,
          text: el.textContent.trim(),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
        };
      })(),
      trends: (() => {
        const el = document.querySelector('[data-nav="insights-trends"]');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          hasHref: el.hasAttribute('href'),
          isDisabled: el.classList.contains('is-disabled'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          role: el.getAttribute('role'),
          cursor: style.cursor,
          text: el.textContent.trim(),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
        };
      })(),
      income: (() => {
        const el = document.querySelector('[data-nav="insights-income"]');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          hasHref: el.hasAttribute('href'),
          isDisabled: el.classList.contains('is-disabled'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          role: el.getAttribute('role'),
          cursor: style.cursor,
          text: el.textContent.trim(),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
        };
      })(),
      budgets: (() => {
        const el = document.querySelector('[data-nav="insights-budgets"]');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          hasHref: el.hasAttribute('href'),
          isDisabled: el.classList.contains('is-disabled'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          role: el.getAttribute('role'),
          cursor: style.cursor,
          text: el.textContent.trim(),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
        };
      })(),
      forecast: (() => {
        const el = document.querySelector('[data-nav="forecast"]');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        return {
          tagName: el.tagName,
          hasHref: el.hasAttribute('href'),
          isDisabled: el.classList.contains('is-disabled'),
          ariaDisabled: el.getAttribute('aria-disabled'),
          role: el.getAttribute('role'),
          cursor: style.cursor,
          text: el.textContent.trim(),
          visible: style.display !== 'none' && style.visibility !== 'hidden'
        };
      })()
    })`);

    for (const [key, item] of Object.entries(futureNavChecks)) {
      assert.ok(item, `${key} element must exist in DOM`);
      assert.equal(item.tagName, 'A', `${key} must be an active anchor element`);
      assert.equal(item.hasHref, true, `${key} must possess an href attribute`);
      assert.equal(item.isDisabled, false, `${key} must not have is-disabled class`);
      assert.equal(item.visible, true, `${key} must be visible in viewport`);
      assert.doesNotMatch(item.text, /Soon/, `${key} must not display Soon pill`);
    }

    // Verify clicking on subscriptions navigates to standalone subscriptions page
    await client.evaluate(`document.querySelector('[data-nav="subscriptions"]').click()`);
    await new Promise(r => setTimeout(r, 600));
    const navUrl = await client.evaluate(`window.location.href`);
    assert.match(navUrl, /subscriptions\/subscriptions\.html/, 'Clicking subscriptions navigates to subscriptions page');

    // Capture screenshot of the sidebar demonstrating the disabled items
    try {
      const clip = await client.evaluate(`(() => {
        const rect = document.querySelector('.sidebar').getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 2 };
      })()`);
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png', clip });
      const artifactDir = 'C:\\Users\\shaha\\.gemini\\antigravity\\brain\\02c120f8-2df8-4396-a7ef-9e5022e7c64f';
      if (fs.existsSync(artifactDir)) {
        fs.writeFileSync(path.join(artifactDir, 'batch1-disabled-nav-sidebar.png'), Buffer.from(screenshot.data, 'base64'));
      }
    } catch (e) {
      // screenshot capture is auxiliary
    }

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise(resolve => server.close(resolve));
  }
});
