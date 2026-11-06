// Browser tests for Financial Goals, Debt Tracker & Financial Health
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
          { id: 2, name: 'Dining', type: 'expense', is_default: true }
        ]
      }));
    }

    if (pathname === '/api/budgets') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [] }));
    }

    if (pathname === '/api/analytics/budget-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { budgets: [] } }));
    }

    if (pathname === '/api/analytics/budget-alerts') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { alerts: [] } }));
    }

    if (pathname === '/api/analytics/cash-flow') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { total_income: '50000.00', total_expenses: '25000.00', net_cash_flow: '25000.00', month: 10, year: 2026 } }));
    }

    if (pathname === '/api/analytics/spending-by-category') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { categories: [] } }));
    }

    if (pathname === '/api/analytics/month-comparison') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: { current: {}, previous: {} } }));
    }

    if (pathname === '/api/savings-goals') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        data: {
          goals: [
            {
              id: 1,
              name: 'Emergency Fund',
              target_amount: '100000.00',
              saved_amount: '40000.00',
              remaining_amount: '60000.00',
              progress_percent: 40.0,
              progress_bar_percent: 40.0,
              status: 'active',
              target_date: '2027-01-01',
              monthly_contribution_estimate: '20000.00',
              notes: '3 months expenses',
              contribution_count: 2
            }
          ],
          summary: {
            active_count: 1,
            completed_count: 0,
            archived_count: 0,
            total_target: '100000.00',
            total_saved: '40000.00',
            total_remaining: '60000.00'
          }
        }
      }));
    }

    if (pathname === '/api/debts') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        data: {
          debts: [
            {
              id: 1,
              name: 'Education Loan',
              category: 'loan',
              lender: 'National Bank',
              original_principal: '500000.00',
              current_balance: '350000.00',
              repaid_amount: '150000.00',
              repayment_progress_percent: 30.0,
              interest_rate: 8.5,
              minimum_payment: '10000.00',
              status: 'active',
              payoff_estimate: {
                estimated_months_remaining: 35,
                projected_payoff_date: '2029-09-30'
              },
              repayments: []
            }
          ],
          summary: {
            active_count: 1,
            completed_count: 0,
            archived_count: 0,
            total_original: '500000.00',
            total_current_balance: '350000.00',
            total_repaid: '150000.00'
          }
        }
      }));
    }

    if (pathname === '/api/analytics/financial-health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        data: {
          period: {
            year: 2026,
            month: 10,
            label: 'October 2026',
            from: '2026-10-01',
            to: '2026-10-31'
          },
          indicators: {
            net_cash_flow: {
              income: '50000.00',
              expenses: '25000.00',
              net: '25000.00',
              status: 'positive'
            },
            savings_rate: {
              rate_percent: 50.0,
              status: 'positive',
              label: '50.0%'
            },
            budget_utilization: {
              total_limit: '30000.00',
              total_spent: '20000.00',
              utilization_percent: 66.7,
              over_budget_count: 0,
              status: 'on_track'
            },
            spending_change: {
              current_spend: '25000.00',
              prior_spend: '22000.00',
              change_percent: 13.6,
              direction: 'higher',
              label: '+13.6%'
            },
            recurring_commitments: {
              monthly_cost: '5000.00',
              ratio_to_income_percent: 10.0,
              active_schedules_count: 2
            },
            goals_progress: {
              active_goals_count: 1,
              total_target: '100000.00',
              total_saved: '40000.00',
              overall_progress_percent: 40.0
            }
          },
          observations: [
            {
              type: 'success',
              title: 'Healthy savings rate',
              description: 'You have saved 50.0% of your income during this period.',
              link: '../budget-planning/budget.html?tab=goals',
              link_text: 'View goals'
            }
          ],
          definitions: {
            net_cash_flow: 'Total recorded income minus expenses.',
            savings_rate: 'Net cash flow / income.',
            budget_utilization: 'Spent in budgeted categories / limits.',
            spending_change: 'Expenses vs prior month.',
            recurring_commitments: 'Monthly recurring bills / income.',
            goals_progress: 'Saved amount / goal targets.'
          }
        }
      }));
    }

    // Static files
    let filePath = path.join(rootDir, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
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

  return server;
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const WebSocket = globalThis.WebSocket;
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message || JSON.stringify(msg.error)));
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.callbacks.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Evaluation error: ' + expr);
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

test('browser runtime: planning sub-nav tabs, financial goals, and debt tracker in budget.html', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const server = createMockServer(rootDir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-goals-debt-test-'));
  const cdpPort = 9222 + Math.floor(Math.random() * 500);

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let cdp = null;

  try {
    await new Promise((r) => setTimeout(r, 1200));
    const pages = await fetchJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const page = pages.find((p) => p.type === 'page') || pages[0];
    cdp = new CDPClient(page.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Step 1: Navigate to budget.html
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/budget-planning/budget.html` });
    await new Promise((r) => setTimeout(r, 800));

    // Verify initial state: Monthly budgets active
    const initialTab = await cdp.eval(`document.querySelector('.sub-nav-tab.active')?.getAttribute('data-planning-tab')`);
    assert.equal(initialTab, 'budgets', 'Default tab should be budgets');

    // Step 2: Switch to Financial Goals tab
    await cdp.eval(`document.querySelector('[data-planning-tab="goals"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    const goalsVisible = await cdp.eval(`!document.getElementById('view-financial-goals')?.hidden`);
    assert.equal(goalsVisible, true, 'Financial goals panel should be visible');

    const activeGoalsCount = await cdp.eval(`document.getElementById('goals-stat-active')?.textContent`);
    assert.equal(activeGoalsCount, '1', 'Active goals count should be 1');

    const goalCardRendered = await cdp.eval(`document.querySelector('.goal-card')?.querySelector('.card-title')?.textContent`);
    assert.equal(goalCardRendered, 'Emergency Fund', 'Emergency Fund goal card should be rendered');

    // Step 3: Open Goal creation modal
    await cdp.eval(`document.getElementById('add-goal-btn')?.click()`);
    await new Promise((r) => setTimeout(r, 300));
    const goalModalVisible = await cdp.eval(`!document.getElementById('goal-modal')?.hidden`);
    assert.equal(goalModalVisible, true, 'Create goal modal should open');

    // Close modal
    await cdp.eval(`document.querySelector('[data-close-goal-modal]')?.click()`);
    await new Promise((r) => setTimeout(r, 200));

    // Step 4: Switch to Debt Tracker tab
    await cdp.eval(`document.querySelector('[data-planning-tab="debts"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    const debtsVisible = await cdp.eval(`!document.getElementById('view-debt-tracker')?.hidden`);
    assert.equal(debtsVisible, true, 'Debt tracker panel should be visible');

    const debtPrincipal = await cdp.eval(`document.getElementById('debts-stat-principal')?.textContent`);
    assert.match(debtPrincipal, /5,00,000/, 'Original principal should be ₹5,00,000');

    const debtCardTitle = await cdp.eval(`document.querySelector('.debt-card')?.querySelector('.card-title')?.textContent`);
    assert.equal(debtCardTitle, 'Education Loan', 'Education loan card should be rendered');

    // Step 5: Navigate to reports.html and test Financial Health tab
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/reports-analytics/reports.html` });
    await new Promise((r) => setTimeout(r, 800));

    await cdp.eval(`document.querySelector('[data-reports-tab="health"]')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    const healthVisible = await cdp.eval(`!document.getElementById('view-financial-health')?.hidden`);
    assert.equal(healthVisible, true, 'Financial health panel should be visible');

    const netCashFlowValue = await cdp.eval(`document.querySelector('#financial-health-container .stat-card .stat-value')?.textContent`);
    assert.match(netCashFlowValue, /25,000/, 'Net cash flow should display ₹25,000');

  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    server.close();
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch (e) {}
  }
});
