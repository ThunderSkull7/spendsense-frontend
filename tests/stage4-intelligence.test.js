// Stage 4 frontend contracts and helpers. Run with:
// node --test tests/stage4-intelligence.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'financial-intelligence');
const COMMON = path.join(DIR, 'intelligence-common.js');
const CSS = path.join(DIR, 'financial-intelligence.css');
const PAGES = {
  insights: path.join(DIR, 'insights.html'),
  forecast: path.join(DIR, 'forecast.html'),
  netWorth: path.join(DIR, 'net-worth.html'),
  subscriptions: path.join(DIR, 'subscriptions.html'),
};
const SCRIPTS = {
  insights: path.join(DIR, 'insights.js'),
  forecast: path.join(DIR, 'forecast.js'),
  netWorth: path.join(DIR, 'net-worth.js'),
  subscriptions: path.join(DIR, 'subscriptions.js'),
};

function loadCommon() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(COMMON, 'utf8'), context, { filename: 'intelligence-common.js' });
  return context.SpendSenseIntelligence;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('stage 4 month helpers avoid timezone drift and validate inclusive ranges', () => {
  const H = loadCommon();
  assert.equal(H.monthLabel('2026-10'), 'October 2026');
  assert.equal(H.monthLabel('2025-01', { short: true }), 'Jan 2025');
  assert.equal(H.dateLabel('2026-10-05'), '05 Oct 2026');
  assert.equal(H.addMonths('2026-01', -1), '2025-12');
  assert.equal(H.addMonths('2025-12', 1), '2026-01');
  assert.equal(H.addMonths('2026-01', 13), '2027-02');
  assert.equal(H.rangeMonthCount('2025-11', '2026-10'), 12);
  assert.equal(H.rangeMonthCount('2026-01', '2026-12'), 12);
  assert.equal(H.dateRangeIsValid('2026-10', '2026-10'), true);
  assert.equal(H.dateRangeIsValid('2026-11', '2026-10'), false);
  assert.equal(H.dateRangeIsValid('2026-1', '2026-10'), false);
});

test('stage 4 percentage and display helpers clamp safely', () => {
  const H = loadCommon();
  assert.equal(H.percentage(25, 200), 12.5);
  assert.equal(H.percentage(1, 3), 33.3);
  assert.equal(H.percentage(1, 0), null);
  assert.equal(H.progressPercent(130), 100);
  assert.equal(H.progressPercent(-4), 0);
  assert.equal(H.progressPercent('not a number'), 0);
  assert.equal(H.formatPercent(12.345), '12.35%');
  assert.equal(H.formatPercent(null), '—');
  assert.equal(H.changeTone(1), 'pos');
  assert.equal(H.changeTone(-1), 'neg');
  assert.equal(H.changeTone(0), 'neutral');
  assert.equal(H.cleanMoney('09.90'), '9.90');
  assert.equal(H.cleanMoney(''), '');
  assert.equal(H.frequencyLabel('half-yearly'), 'Every six months');
  assert.equal(H.statusLabel('cancelled'), 'Cancelled');
  assert.equal(H.forecastBalanceLabel('not_calculable'), 'Not calculable');
});

test('stage 4 API error helper is bounded and does not return markup fields', () => {
  const H = loadCommon();
  assert.equal(H.errorMessage({ data: { errors: { from: ['Choose no more than 24 months.'] } } }), 'Choose no more than 24 months.');
  assert.equal(H.errorMessage({ data: { message: 'Safe API message' } }), 'Safe API message');
  assert.equal(H.errorMessage(null, 'Fallback'), 'Fallback');
  assert.ok(H.errorMessage({ data: { message: 'x'.repeat(400) } }).length <= 240);
});

test('all four Stage 4 pages expose controls, states and textual alternatives', () => {
  const required = {
    insights: [
      'data-nav="insights"', 'id="insights-from"', 'id="insights-to"',
      'data-insights-page-state', 'data-insights-form', 'data-insight-categories',
      'data-insight-category-rows', 'data-insight-month-rows', 'data-insight-anomaly-rows',
      'data-insight-budget-items', 'data-insight-recurring-summary', 'aria-live="polite"',
      'Actual ledger totals only', 'documented anomaly threshold',
    ],
    forecast: [
      'data-nav="forecast"', 'id="forecast-as-of"', 'data-horizon="30"',
      'data-horizon="60"', 'data-horizon="90"', 'data-forecast-page-state',
      'data-forecast-event-rows', 'data-forecast-month-rows', 'data-forecast-history',
      'data-forecast-balance-reason', 'aria-live="polite"', 'No transaction is created',
    ],
    netWorth: [
      'data-nav="net-worth"', 'id="net-worth-as-of"', 'data-net-worth-form',
      'id="net-worth-value"', 'data-net-worth-page-state', 'data-net-worth-trend',
      'data-net-worth-trend-rows', 'data-net-worth-list', 'aria-live="polite"',
      'User-entered estimates', 'spendable cash',
    ],
    subscriptions: [
      'data-nav="subscriptions"', 'data-subscription-form', 'data-subscription-filters',
      'data-subscription-page-state', 'data-subscription-upcoming-rows',
      'data-subscription-list', 'aria-live="polite"',
      'cannot cancel anything with a provider', 'never creates an expense',
    ],
  };

  for (const [name, values] of Object.entries(required)) {
    const html = read(PAGES[name]);
    for (const value of values) {
      assert.ok(html.includes(value), `${name} page missing ${value}`);
    }
  }
});

test('Stage 4 pages use accessible charts with table or summary alternatives', () => {
  const insights = read(PAGES.insights);
  const forecast = read(PAGES.forecast);
  const netWorth = read(PAGES.netWorth);

  assert.match(insights, /role="img" aria-label="[^"]+"/);
  assert.ok(insights.includes('<caption class="sr-only">'));
  assert.ok(insights.includes('View category data as a table'));
  assert.ok(insights.includes('View monthly totals as a table'));

  assert.match(forecast, /role="img" aria-label="[^"]+"/);
  assert.ok(forecast.includes('View monthly projection as a table'));
  assert.ok(forecast.includes('<caption class="sr-only">'));

  assert.match(netWorth, /role="img" aria-label="[^"]+"/);
  assert.ok(netWorth.includes('View trend values as a table'));
  assert.ok(netWorth.includes('<caption class="sr-only">'));
});

test('Stage 4 scripts use the documented read-only and owner-scoped endpoints', () => {
  const insights = read(SCRIPTS.insights);
  const forecast = read(SCRIPTS.forecast);
  const netWorth = read(SCRIPTS.netWorth);
  const subscriptions = read(SCRIPTS.subscriptions);

  assert.ok(insights.includes('/analytics/spending-insights?from='));
  assert.ok(insights.includes('encodeURIComponent(from)'));
  assert.ok(insights.includes('rangeMonthCount(from, to) > 24'));
  assert.ok(!insights.includes('API.post('), 'insights must not write');
  assert.ok(!insights.includes('API.put('), 'insights must not write');

  assert.ok(forecast.includes('/analytics/cash-flow-forecast?horizon='));
  assert.ok(forecast.includes('encodeURIComponent(horizon)'));
  assert.ok(forecast.includes('encodeURIComponent(dom.asOf.value)'));
  assert.ok(!forecast.includes('API.post('), 'forecast must not write');
  assert.ok(!forecast.includes('API.put('), 'forecast must not write');
  assert.ok(read(PAGES.forecast).includes('Starting from'));

  for (const endpoint of [
    "API.get(`/net-worth?${query.toString()}`)",
    "API.get(`/net-worth/trend?${query.toString()}`)",
    "API.post('/net-worth', body)",
    "API.put(`/net-worth/${editingId}`, body)",
    "API.post(`/net-worth/${entry.id}/valuations`",
    "API.post(`/net-worth/${entry.id}/${action}`",
  ]) {
    assert.ok(netWorth.includes(endpoint), `net-worth script missing ${endpoint}`);
  }
  assert.ok(!netWorth.includes('/expenses'), 'net worth must not create expenses');
  assert.ok(!netWorth.includes('/incomes'), 'net worth must not create incomes');

  for (const endpoint of [
    "API.get(`/subscriptions?${query.toString()}`)",
    "API.post('/subscriptions', body)",
    "API.put(`/subscriptions/${editing.id}`, body)",
    "API.put(`/subscriptions/${item.id}`, { status })",
    "API.get('/recurring-expenses')",
  ]) {
    assert.ok(subscriptions.includes(endpoint), `subscriptions script missing ${endpoint}`);
  }
  assert.ok(!subscriptions.includes('/expenses'), 'subscription tracker must not create expenses');
  assert.ok(!subscriptions.includes('/incomes'), 'subscription tracker must not create incomes');
  assert.ok(subscriptions.includes('did not cancel anything with the provider'));
});

test('Stage 4 navigation is present across the existing app pages', () => {
  const appPages = [
    'dashboard/dashboard.html',
    'expense-management/expenses.html',
    'income-management/income.html',
    'budget-planning/budget.html',
    'recurring-expenses/recurring-expenses.html',
    'savings-goals/savings-goals.html',
    'categories-management/categories.html',
    'reports-analytics/reports.html',
    'notifications/notifications.html',
    'settings/settings.html',
    'support/support.html',
  ];

  for (const relative of appPages) {
    const html = read(path.join(ROOT, relative));
    for (const nav of ['insights', 'forecast', 'net-worth', 'subscriptions']) {
      assert.ok(html.includes(`data-nav="${nav}"`), `${relative} missing ${nav} navigation`);
      assert.ok(html.includes(`../financial-intelligence/`), `${relative} missing Stage 4 links`);
    }
  }
});

test('Stage 4 CSS is responsive and respects reduced motion', () => {
  const css = read(CSS);
  assert.ok(css.includes('@media (max-width: 900px)'));
  assert.ok(css.includes('@media (max-width: 560px)'));
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('.viz-track'));
  assert.ok(css.includes('.trend-bars'));
  assert.ok(css.includes('.record-card'));
});
