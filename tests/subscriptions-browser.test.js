// Browser regression test for Standalone Subscriptions Page
// Run with: node --test tests/subscriptions-browser.test.js
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

  const mockSubscriptions = [
    {
      id: 1,
      name: 'Cloud Storage',
      provider: 'Google One',
      amount: '130.00',
      frequency: 'monthly',
      frequency_label: 'Monthly',
      next_renewal_date: '2026-11-20',
      is_overdue: false,
      category: { id: 2, name: 'Utilities' },
      status: 'active',
      effective_status: 'active',
      schedule_status: null,
      counts_toward_totals: true,
      is_linked: false,
      monthly_cost: '130.00',
      annual_cost: '1560.00',
      notes: '200 GB Storage plan',
      recurring_expense_id: null,
      schedule: null
    },
    {
      id: 2,
      name: 'Home Fiber',
      provider: 'ACT Fibernet',
      amount: '999.00',
      frequency: 'monthly',
      frequency_label: 'Monthly',
      next_renewal_date: '2026-11-28',
      is_overdue: false,
      category: { id: 2, name: 'Utilities' },
      status: 'active',
      effective_status: 'active',
      schedule_status: 'active',
      counts_toward_totals: true,
      is_linked: true,
      monthly_cost: '999.00',
      annual_cost: '11988.00',
      notes: '300 Mbps unlimited',
      recurring_expense_id: 10,
      schedule: {
        id: 10,
        description: 'Broadband Bill',
        status: 'active',
        frequency: 'monthly',
        amount: '999.00',
        next_due_date: '2026-11-28'
      }
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

    if (pathname === '/api/categories') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        data: [
          { id: 1, name: 'Housing', type: 'expense' },
          { id: 2, name: 'Utilities', type: 'expense' },
          { id: 3, name: 'Entertainment', type: 'expense' }
        ]
      }));
    }

    if (pathname === '/api/recurring-expenses') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          schedules: [
            { id: 10, description: 'Broadband Bill', amount: '999.00', frequency: 'monthly' },
            { id: 11, description: 'Gym Membership', amount: '1500.00', frequency: 'monthly' }
          ]
        }
      }));
    }

    if (pathname === '/api/subscriptions' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          subscriptions: mockSubscriptions,
          summary: {
            total_count: 2,
            active_count: 2,
            paused_count: 0,
            cancelled_count: 0,
            linked_count: 1,
            standalone_count: 1,
            estimated_monthly_cost: '1129.00',
            estimated_annual_cost: '13548.00',
            due_within_30_days_count: 2,
            due_within_30_days_amount: '1129.00',
            overdue_count: 0,
            as_of: '2026-11-08'
          },
          upcoming_renewals: [
            {
              id: 1,
              name: 'Cloud Storage',
              provider: 'Google One',
              amount: '130.00',
              monthly_cost: '130.00',
              next_renewal_date: '2026-11-20',
              days_until_renewal: 12,
              effective_status: 'active'
            },
            {
              id: 2,
              name: 'Home Fiber',
              provider: 'ACT Fibernet',
              amount: '999.00',
              monthly_cost: '999.00',
              next_renewal_date: '2026-11-28',
              days_until_renewal: 20,
              effective_status: 'active'
            }
          ],
          upcoming_window_days: 60
        }
      }));
    }

    if (pathname === '/api/subscriptions' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body || '{}');
      postCalls.push(parsed);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: {
          id: 99,
          name: parsed.name,
          provider: parsed.provider,
          amount: parsed.amount || '0.00',
          frequency: parsed.frequency || 'monthly',
          status: parsed.status || 'active',
          is_linked: Boolean(parsed.recurring_expense_id)
        }
      }));
    }

    if (pathname.startsWith('/api/subscriptions/') && req.method === 'PUT') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body || '{}');
      putCalls.push({ id: pathname.split('/').pop(), body: parsed });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        data: { id: 1, ...parsed }
      }));
    }

    // Static file serving
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

  return { server, getPostCalls: () => postCalls, getPutCalls: () => putCalls };
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

test('browser runtime: standalone subscriptions page, listing, modals, linkage, and status transitions', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome not available');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, getPostCalls, getPutCalls } = createMockServer(rootDir);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-sub-test-'));
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

    // 1. Navigate to subscriptions/subscriptions.html
    await client.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/subscriptions/subscriptions.html` });
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      const isPopulated = await client.evaluate(`document.getElementById('stat-active-count')?.textContent === '2'`);
      if (isPopulated) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // 2. Verify page title and summary stats hydration
    const pageState = await client.evaluate(`({
      title: document.title,
      activeStat: document.getElementById('stat-active-count')?.textContent,
      monthlyStat: document.getElementById('stat-monthly-cost')?.textContent,
      subCounts: document.getElementById('stat-counts-sub')?.textContent,
      rowsCount: document.querySelectorAll('#subscriptions-table-body tr').length,
      upcomingCount: document.querySelectorAll('#upcoming-renewals-body tr').length
    })`);

    assert.equal(pageState.title, 'Subscriptions | SpendSense', 'Page title must match');
    assert.equal(pageState.activeStat, '2', 'Active count must be 2');
    assert.match(pageState.monthlyStat, /1,129|1129/, 'Monthly estimate must be hydrated');
    assert.equal(pageState.rowsCount, 2, 'Must display 2 subscriptions in table');
    assert.equal(pageState.upcomingCount, 2, 'Must display 2 upcoming renewals');

    // 3. Test opening the Create modal
    await client.evaluate(`document.querySelector('[data-open-subscription-modal]').click()`);
    await new Promise((r) => setTimeout(r, 200));

    const modalState = await client.evaluate(`({
      modalHidden: document.getElementById('subscription-modal').hidden,
      modalTitle: document.getElementById('modal-subscription-title').textContent,
      isStandalone: document.getElementById('sub-type-standalone').checked,
      isLinked: document.getElementById('sub-type-linked').checked,
      linkedDisplay: document.getElementById('sub-linked-section').style.display,
      standaloneDisplay: document.getElementById('sub-standalone-fields').style.display
    })`);

    assert.equal(modalState.modalHidden, false, 'Modal should be visible');
    assert.equal(modalState.modalTitle, 'Add Subscription', 'Title should be Add Subscription');
    assert.equal(modalState.isStandalone, true, 'Defaults to standalone');
    assert.equal(modalState.linkedDisplay, 'none', 'Linked section hidden by default');

    // 4. Test Standalone creation form submission
    await client.evaluate(`
      document.getElementById('sub-name').value = 'Spotify Family';
      document.getElementById('sub-provider').value = 'Spotify AB';
      document.getElementById('sub-amount').value = '299.00';
      document.getElementById('sub-frequency').value = 'monthly';
      document.getElementById('sub-renewal-date').value = '2026-12-10';
      document.getElementById('subscription-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 600));

    const postCalls = getPostCalls();
    assert.equal(postCalls.length, 1, 'One POST call must have been made');
    assert.equal(postCalls[0].name, 'Spotify Family');
    assert.equal(postCalls[0].provider, 'Spotify AB');
    assert.equal(postCalls[0].amount, '299.00');
    assert.equal(postCalls[0].frequency, 'monthly');
    assert.equal(postCalls[0].next_renewal_date, '2026-12-10');
    assert.equal(postCalls[0].recurring_expense_id, undefined, 'Standalone must not send recurring_expense_id');

    // 5. Test Linked mode toggle and selection
    await client.evaluate(`document.querySelector('[data-open-subscription-modal]').click()`);
    await new Promise((r) => setTimeout(r, 200));
    await client.evaluate(`
      document.getElementById('sub-type-linked').click();
    `);
    await new Promise((r) => setTimeout(r, 200));

    const linkedState = await client.evaluate(`({
      linkedDisplay: document.getElementById('sub-linked-section').style.display,
      standaloneDisplay: document.getElementById('sub-standalone-fields').style.display,
      schedulesCount: document.getElementById('sub-recurring-expense-id').options.length
    })`);

    assert.equal(linkedState.linkedDisplay, 'block', 'Linked section must be visible');
    assert.equal(linkedState.standaloneDisplay, 'none', 'Standalone fields must be hidden');
    assert.ok(linkedState.schedulesCount >= 2, 'Recurring bill options must be populated');

    // 6. Test Linked creation form submission
    await client.evaluate(`
      document.getElementById('sub-name').value = 'Broadband Plan';
      document.getElementById('sub-provider').value = 'ACT';
      document.getElementById('sub-recurring-expense-id').value = '11';
      document.getElementById('subscription-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await new Promise((r) => setTimeout(r, 600));

    const postCallsAfter = getPostCalls();
    assert.equal(postCallsAfter.length, 2, 'Two POST calls must have been made');
    assert.equal(postCallsAfter[1].name, 'Broadband Plan');
    assert.equal(postCallsAfter[1].recurring_expense_id, 11, 'Must submit recurring_expense_id');
    assert.equal(postCallsAfter[1].amount, undefined, 'Linked must NOT send amount');
    assert.equal(postCallsAfter[1].frequency, undefined, 'Linked must NOT send frequency');
    assert.equal(postCallsAfter[1].next_renewal_date, undefined, 'Linked must NOT send renewal date');

    // 7. Test Status update (Pause)
    await client.evaluate(`
      document.querySelector('button[data-action="toggle-status"][data-id="1"]').click();
    `);
    await new Promise((r) => setTimeout(r, 500));

    const putCalls = getPutCalls();
    assert.ok(putCalls.length >= 1, 'PUT call must have been made for status update');
    assert.equal(putCalls[0].body.status, 'paused', 'Status should be updated to paused');

    // 8. Verify Sidebar navigation on subscriptions.html
    const sidebarCheck = await client.evaluate(`({
      hasAccountGroup: document.querySelector('.sidebar-nav')?.textContent.includes('Account'),
      groups: Array.from(document.querySelectorAll('.sidebar-group')).map(g => g.textContent.trim()),
      subIsActive: document.querySelector('[data-nav="subscriptions"]')?.classList.contains('active'),
      subIsDisabled: document.querySelector('[data-nav="subscriptions"]')?.classList.contains('is-disabled'),
      subHasSoonBadge: document.querySelector('[data-nav="subscriptions"] .nav-pill')?.textContent
    })`);

    assert.equal(sidebarCheck.hasAccountGroup, false, 'No sidebar Account heading');
    assert.deepEqual(sidebarCheck.groups, ['Overview', 'Money', 'Insights', 'Planning'], 'Exact 4 groups');
    assert.equal(sidebarCheck.subIsActive, true, 'Subscriptions sidebar link must be active on subscriptions page');
    assert.equal(sidebarCheck.subIsDisabled, false, 'Subscriptions sidebar link must not be disabled');
    assert.equal(sidebarCheck.subHasSoonBadge, undefined, 'Subscriptions sidebar link must not retain Soon pill');

  } finally {
    try { if (client.ws) client.ws.close(); } catch {}
    try { chromeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(resolve));
  }
});
