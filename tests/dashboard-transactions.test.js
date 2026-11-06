const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT_PATH = path.join(__dirname, '..', 'script.js');
const DASHBOARD_JS_PATH = path.join(__dirname, '..', 'dashboard', 'dashboard.js');
const DASHBOARD_HTML_PATH = path.join(__dirname, '..', 'dashboard', 'dashboard.html');

/**
 * Creates a mocked lightweight DOM and browser environment to test dashboard.js logic
 */
function createDashboardEnvironment({ expensesResponse, incomesResponse, apiOverrides = {} }) {
  const events = [];
  const elements = new Map();

  function makeElement(tag, attrs = {}) {
    const classesSet = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    const el = {
      tagName: tag.toUpperCase(),
      attributes: { ...attrs },
      dataset: {},
      style: {},
      children: [],
      classList: {
        _classes: classesSet,
        add(...cls) { cls.forEach((c) => classesSet.add(c)); },
        remove(...cls) { cls.forEach((c) => classesSet.delete(c)); },
        contains(c) { return classesSet.has(c); },
        toggle(c, force) {
          if (force === true) this.add(c);
          else if (force === false) this.remove(c);
          else if (this.contains(c)) this.remove(c);
          else this.add(c);
        },
      },
      get className() {
        return Array.from(classesSet).join(' ');
      },
      set className(val) {
        classesSet.clear();
        String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classesSet.add(c));
      },
      _textContent: undefined,
      get textContent() {
        if (this._textContent !== undefined) return this._textContent;
        return this.children.map((c) => c.textContent || '').join('');
      },
      set textContent(val) {
        this._textContent = String(val ?? '');
        this.children = [];
      },
      innerHTML: '',
      disabled: false,
      title: '',
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] || null; },
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(child) {
        if (child && typeof child === 'object') {
          this.children.push(child);
          child.parentElement = this;
        }
        return child;
      },
      append(...nodes) {
        nodes.forEach((n) => {
          if (typeof n === 'string') {
            this.appendChild(createTextNode(n));
          } else {
            this.appendChild(n);
          }
        });
      },
      replaceChildren(...nodes) {
        this.children = [];
        this.append(...nodes);
      },
      querySelector(sel) {
        return findInTree(this, sel);
      },
      querySelectorAll(sel) {
        return findAllInTree(this, sel);
      },
      closest(sel) {
        return this;
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return el;
  }

  function createTextNode(text) {
    return {
      nodeType: 3,
      textContent: String(text),
    };
  }

  function findInTree(root, sel) {
    const all = findAllInTree(root, sel);
    return all.length > 0 ? all[0] : null;
  }

  function findAllInTree(root, sel) {
    const matches = [];
    function walk(node) {
      if (!node || !node.children) return;
      for (const c of node.children) {
        if (matchesSelector(c, sel)) matches.push(c);
        walk(c);
      }
    }
    walk(root);
    return matches;
  }

  function matchesSelector(el, sel) {
    if (!el || !el.tagName) return false;
    if (sel.startsWith('.')) {
      const classes = sel.split('.').filter(Boolean);
      return classes.every((c) => el.classList && el.classList.contains(c));
    }
    if (sel.startsWith('[data-') && sel.endsWith(']')) {
      const attr = sel.slice(1, -1);
      return attr in el.dataset || attr in (el.attributes || {});
    }
    if (sel === 'div' && el.tagName === 'DIV') return true;
    if (sel === 'span' && el.tagName === 'SPAN') return true;
    return false;
  }

  const transactionsContainer = makeElement('div', { 'data-transactions': '' });
  const statIncome = makeElement('div', { 'data-stat': 'income' });
  const statExpenses = makeElement('div', { 'data-stat': 'expenses' });
  const statNet = makeElement('div', { 'data-stat': 'net' });
  const statBudget = makeElement('div', { 'data-stat': 'budget' });
  const breakdownEl = makeElement('div', { 'data-breakdown': '' });
  const comparisonEl = makeElement('div', { 'data-comparison': '' });
  const budgetsEl = makeElement('div', { 'data-budgets': '' });

  const queryMap = {
    '[data-transactions]': transactionsContainer,
    '[data-stat="income"]': statIncome,
    '[data-stat="expenses"]': statExpenses,
    '[data-stat="net"]': statNet,
    '[data-stat="budget"]': statBudget,
    '[data-breakdown]': breakdownEl,
    '[data-comparison]': comparisonEl,
    '[data-comparison-summary]': makeElement('p'),
    '[data-budgets]': budgetsEl,
    '[data-refresh]': makeElement('button'),
    'meta[name="api-base-url"]': null,
  };

  const documentStub = {
    cookie: '',
    createElement(tag) { return makeElement(tag); },
    createTextNode(text) { return createTextNode(text); },
    querySelector(sel) {
      if (sel in queryMap) return queryMap[sel];
      return makeElement('div');
    },
    querySelectorAll(sel) {
      return [];
    },
    addEventListener(evt, handler) {
      if (evt === 'DOMContentLoaded') {
        setTimeout(handler, 0);
      }
    },
  };

  const apiMock = {
    init() {},
    formatMoney(val) { return '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    formatDate(d) { return String(d || ''); },
    get(endpoint) {
      if (endpoint === '/expenses') {
        if (expensesResponse instanceof Error) return Promise.reject(expensesResponse);
        return Promise.resolve(expensesResponse);
      }
      if (endpoint === '/incomes') {
        if (incomesResponse instanceof Error) return Promise.reject(incomesResponse);
        return Promise.resolve(incomesResponse);
      }
      if (endpoint.includes('/cash-flow')) {
        return Promise.resolve({ status: 200, data: { success: true, data: { total_income: 5000, total_expenses: 2000, net_cash_flow: 3000, month: 10, year: 2026 } } });
      }
      if (endpoint.includes('/spending-by-category')) {
        return Promise.resolve({ status: 200, data: { success: true, data: { breakdown: [] } } });
      }
      if (endpoint.includes('/month-comparison')) {
        return Promise.resolve({ status: 200, data: { success: true, data: { current: {}, previous: {}, change: {} } } });
      }
      if (endpoint.includes('/budget-status')) {
        return Promise.resolve({ status: 200, data: { success: true, data: { budgets: [] } } });
      }
      if (apiOverrides[endpoint]) return Promise.resolve(apiOverrides[endpoint]);
      return Promise.resolve({ status: 200, data: { success: true, data: [] } });
    },
  };

  const uiMock = {
    formatMoney: apiMock.formatMoney,
    formatDate: (d) => String(d || ''),
    renderState(container, type, opts = {}) {
      const stateEl = makeElement('div', { class: 'state ' + type });
      const p = makeElement('p');
      p.textContent = opts.message || type;
      stateEl.appendChild(p);
      container.replaceChildren(stateEl);
      return stateEl;
    },
    showToast() {},
  };

  const settingsMock = {
    getCategoryTone(cat) {
      return { toneName: 'teal', color: '#0D9488', bgSubtle: 'rgba(13, 148, 136, 0.12)', borderSubtle: 'rgba(13, 148, 136, 0.28)' };
    },
  };

  const context = {
    document: documentStub,
    window: {
      SpendSenseAPI: apiMock,
      SpendSenseUI: uiMock,
      SpendSenseSettings: settingsMock,
      SpendSensePeriod: null,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
    },
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Math,
  };

  context.window.window = context.window;
  context.window.document = documentStub;

  vm.createContext(context);
  const code = fs.readFileSync(DASHBOARD_JS_PATH, 'utf8');
  vm.runInContext(code, context, { filename: 'dashboard.js' });

  return {
    transactionsContainer,
    document: documentStub,
    context,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 & 2. Combined expense and income records with newest-first sorting
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard renders combined expense and income transactions sorted newest-first', async () => {
  const expenses = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [
          { id: 101, amount: '45.00', description: 'Coffee beans', expense_date: '2026-10-12', category: { id: 1, name: 'Food' }, created_at: '2026-10-12T10:00:00Z' },
          { id: 102, amount: '120.00', description: 'Train pass', expense_date: '2026-10-10', category: { id: 2, name: 'Transport' }, created_at: '2026-10-10T08:00:00Z' },
        ],
      },
    },
  };

  const incomes = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [
          { id: 201, amount: '3500.00', source: 'Monthly Salary', income_date: '2026-10-15', frequency: 'monthly', created_at: '2026-10-15T09:00:00Z' },
          { id: 202, amount: '250.00', source: 'Freelance gig', income_date: '2026-10-11', frequency: 'one-time', created_at: '2026-10-11T14:00:00Z' },
        ],
      },
    },
  };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 4, 'All 4 transactions should be rendered');

  // Verify newest-first order:
  // 1. 2026-10-15 (Salary income)
  // 2. 2026-10-12 (Coffee expense)
  // 3. 2026-10-11 (Freelance income)
  // 4. 2026-10-10 (Train pass expense)
  assert.equal(rows[0].dataset.txType, 'income');
  assert.equal(rows[0].dataset.txId, '201');
  assert.equal(rows[1].dataset.txType, 'expense');
  assert.equal(rows[1].dataset.txId, '101');
  assert.equal(rows[2].dataset.txType, 'income');
  assert.equal(rows[2].dataset.txId, '202');
  assert.equal(rows[3].dataset.txType, 'expense');
  assert.equal(rows[3].dataset.txId, '102');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 & 4. Correct transaction-type labels and amount semantics
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard renders correct type indicators and signed amount semantics', async () => {
  const expenses = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [{ id: 1, amount: '50.00', description: 'Grocery', expense_date: '2026-10-10', category: { id: 1, name: 'Food' } }],
      },
    },
  };

  const incomes = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [{ id: 2, amount: '1000.00', source: 'Consulting', income_date: '2026-10-10' }],
      },
    },
  };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 2);

  // Check Expense row
  const expenseRow = rows.find((r) => r.dataset.txType === 'expense');
  assert.ok(expenseRow, 'Expense row must exist');
  const expenseAmt = expenseRow.querySelector('.tx-amt');
  assert.ok(expenseAmt.classList.contains('amount-neg'), 'Expense must use amount-neg class');
  assert.ok(expenseAmt.textContent.startsWith('-'), 'Expense must be signed negative');
  const expenseSub = expenseRow.querySelector('.tx-sub');
  assert.ok(expenseSub.textContent.includes('Expense'), 'Expense sub must state Expense type');

  // Check Income row
  const incomeRow = rows.find((r) => r.dataset.txType === 'income');
  assert.ok(incomeRow, 'Income row must exist');
  const incomeAmt = incomeRow.querySelector('.tx-amt');
  assert.ok(incomeAmt.classList.contains('amount-pos'), 'Income must use amount-pos class');
  assert.ok(incomeAmt.textContent.startsWith('+'), 'Income must be signed positive');
  const incomeSub = incomeRow.querySelector('.tx-sub');
  assert.ok(incomeSub.textContent.includes('Income'), 'Income sub must state Income type');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Expense-only data
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard handles expense-only data gracefully', async () => {
  const expenses = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [{ id: 1, amount: '25.00', description: 'Snacks', expense_date: '2026-10-10', category: { name: 'Food' } }],
      },
    },
  };

  const incomes = {
    status: 200,
    data: { success: true, data: { data: [] } },
  };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.txType, 'expense');
  assert.equal(rows[0].dataset.txId, '1');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Income-only data
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard handles income-only data gracefully', async () => {
  const expenses = {
    status: 200,
    data: { success: true, data: { data: [] } },
  };

  const incomes = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [{ id: 99, amount: '800.00', source: 'Dividends', income_date: '2026-10-05' }],
      },
    },
  };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.txType, 'income');
  assert.equal(rows[0].dataset.txId, '99');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Empty data across both datasets
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard displays empty state when both expense and income datasets are empty', async () => {
  const expenses = { status: 200, data: { success: true, data: { data: [] } } };
  const incomes = { status: 200, data: { success: true, data: { data: [] } } };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const stateEl = env.transactionsContainer.querySelector('.state.empty');
  assert.ok(stateEl, 'Must render empty state container');
  assert.ok(stateEl.textContent.includes('No transactions logged yet'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Expense API succeeds but Income API fails
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard handles income API failure with safe notice and displays expenses', async () => {
  const expenses = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [{ id: 1, amount: '50.00', description: 'Book', expense_date: '2026-10-09', category: { name: 'Education' } }],
      },
    },
  };

  const incomesError = new Error('500 Internal Server Error');

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomesError });
  await new Promise((r) => setTimeout(r, 50));

  const notice = env.transactionsContainer.querySelector('.tx-partial-notice');
  assert.ok(notice, 'Must display partial notice');
  assert.ok(notice.textContent.includes('income transactions'));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.txType, 'expense');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Income API succeeds but Expense API fails
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard handles expense API failure with safe notice and displays income', async () => {
  const expensesError = { status: 500, data: { success: false, message: 'Server error' } };

  const incomes = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [{ id: 5, amount: '1200.00', source: 'Bonus', income_date: '2026-10-07' }],
      },
    },
  };

  const env = createDashboardEnvironment({ expensesResponse: expensesError, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const notice = env.transactionsContainer.querySelector('.tx-partial-notice');
  assert.ok(notice, 'Must display partial notice');
  assert.ok(notice.textContent.includes('expense transactions'));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.txType, 'income');
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Both APIs fail
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard renders error state when both expense and income APIs fail', async () => {
  const expensesError = new Error('Network error');
  const incomesError = new Error('Network error');

  const env = createDashboardEnvironment({ expensesResponse: expensesError, incomesResponse: incomesError });
  await new Promise((r) => setTimeout(r, 50));

  const stateEl = env.transactionsContainer.querySelector('.state.error');
  assert.ok(stateEl, 'Must render error state container');
  assert.ok(stateEl.textContent.includes('Could not load recent transactions'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Deterministic tie-breaking for equal dates
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard breaks ties deterministically when dates are identical', async () => {
  const expenses = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [
          { id: 10, amount: '10.00', description: 'Expense Older ID', expense_date: '2026-10-10', created_at: '2026-10-10T10:00:00Z' },
          { id: 20, amount: '20.00', description: 'Expense Newer ID', expense_date: '2026-10-10', created_at: '2026-10-10T10:00:00Z' },
        ],
      },
    },
  };

  const incomes = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [
          { id: 30, amount: '30.00', source: 'Income Higher ID', income_date: '2026-10-10', created_at: '2026-10-10T10:00:00Z' },
        ],
      },
    },
  };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 3);
  // Numeric ID descending order tie-breaker: 30, then 20, then 10
  assert.equal(rows[0].dataset.txId, '30');
  assert.equal(rows[1].dataset.txId, '20');
  assert.equal(rows[2].dataset.txId, '10');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Malformed or missing optional fields
// ─────────────────────────────────────────────────────────────────────────────
test('dashboard tolerates malformed or missing optional fields without throwing', async () => {
  const expenses = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [
          { id: null, amount: null, description: null, category: null, expense_date: null },
          { id: 'abc', amount: 'not-a-number', description: '', category: 'invalid', expense_date: 'invalid-date' },
        ],
      },
    },
  };

  const incomes = {
    status: 200,
    data: {
      success: true,
      data: {
        data: [
          { id: undefined, amount: undefined, source: null, notes: null, income_date: null },
        ],
      },
    },
  };

  const env = createDashboardEnvironment({ expensesResponse: expenses, incomesResponse: incomes });
  await new Promise((r) => setTimeout(r, 50));

  const rows = env.transactionsContainer.querySelectorAll('.tx-row');
  assert.equal(rows.length, 3, 'All 3 rows should be rendered with safe fallbacks');
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Client-side downloadFile execution and session handling
// ─────────────────────────────────────────────────────────────────────────────
test('SpendSenseAPI downloadFile initiates authenticated blob download and handles 401', async () => {
  const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');
  let dispatched = [];
  let clickedDownload = null;

  const mockBlob = { size: 100 };
  const mockFetch = async (url, opts) => {
    if (url.includes('/unauthorized')) {
      return { status: 401, ok: false };
    }
    return {
      status: 200,
      ok: true,
      headers: {
        get(h) {
          if (h.toLowerCase() === 'content-disposition') {
            return 'attachment; filename="test-export-2026.csv"';
          }
          return null;
        },
      },
      blob: async () => mockBlob,
    };
  };

  class MockCustomEvent { constructor(type, detail) { this.type = type; this.detail = detail; } }

  const sandbox = {
    fetch: mockFetch,
    CustomEvent: MockCustomEvent,
    window: {
      location: { origin: 'http://localhost' },
      dispatchEvent(evt) { dispatched.push(evt.type); },
      URL: {
        createObjectURL() { return 'blob:http://localhost/1234'; },
        revokeObjectURL() {},
      },
      addEventListener() {},
      CustomEvent: MockCustomEvent,
    },
    document: {
      cookie: '',
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          href: '',
          download: '',
          click() { clickedDownload = this.download; },
          remove() {},
        };
      },
      body: {
        appendChild() {},
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox, { filename: 'script.js' });

  const api = sandbox.window.SpendSenseAPI;
  assert.ok(typeof api.downloadFile === 'function', 'SpendSenseAPI must expose downloadFile');

  // Test successful download
  const res = await api.downloadFile('/transactions/export');
  assert.equal(res.success, true);
  assert.equal(res.filename, 'test-export-2026.csv');
  assert.equal(clickedDownload, 'test-export-2026.csv');

  // Test 401 session expiration
  await assert.rejects(
    async () => { await api.downloadFile('/unauthorized'); },
    /Session expired/
  );
  assert.ok(dispatched.includes('spendsense:session-expired'), 'Must dispatch spendsense:session-expired on 401');
});
