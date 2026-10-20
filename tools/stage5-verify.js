/*
 * Stage 5 frontend verification helper.
 *
 * Checks that every page carries the shared navigation, that the new Stage 5
 * surfaces exist, and that the pages do not reference removed third-party
 * scripts. Run from the frontend directory:
 *
 *   node tools/stage5-verify.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];

const check = (label, condition, detail = '') => {
  results.push({ label, ok: !!condition, detail });
};

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

/* ── Navigation consistency ───────────────────────────────────────────── */
// Every protected page should expose the same sidebar link set.
const navPages = [
  'dashboard/dashboard.html',
  'expense-management/expenses.html',
  'income-management/income.html',
  'budget-planning/budget.html',
  'recurring-expenses/recurring-expenses.html',
  'savings-goals/savings-goals.html',
  'categories-management/categories.html',
  'reports-analytics/reports.html',
  'financial-intelligence/insights.html',
  'financial-intelligence/forecast.html',
  'financial-intelligence/net-worth.html',
  'financial-intelligence/subscriptions.html',
  'notifications/notifications.html',
  'settings/settings.html',
  'support/support.html',
];

const navKeys = [
  'dashboard',
  'expenses',
  'income',
  'budgets',
  'bills',
  'goals',
  'categories',
  'reports',
  'insights',
  'forecast',
  'net-worth',
  'subscriptions',
  'notifications',
  'settings',
  'support',
];

navPages.forEach((page) => {
  if (!exists(page)) {
    check(`nav: ${page} exists`, false, 'file missing');
    return;
  }
  const html = read(page);
  const missing = navKeys.filter((key) => !html.includes(`data-nav="${key}"`));
  check(`nav: ${page}`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : '');
});

/* ── New Stage 5 surfaces ─────────────────────────────────────────────── */
const dashboard = read('dashboard/dashboard.html');
[
  'data-dashboard-customize',
  'data-widget="summary"',
  'data-widget="spending_categories"',
  'data-widget="cash_flow"',
  'data-widget="budgets"',
  'data-widget="recent_transactions"',
  'data-widget="savings_goals"',
  'data-widget="upcoming_bills"',
  'data-widget="spending_insights"',
  'data-widget="cash_flow_forecast"',
  'data-widget="net_worth"',
  'data-widget="subscription_renewals"',
  'dashboard-customize-dialog',
  'quick-add-dialog',
  'data-quick-add-submit',
].forEach((needle) => {
  check(`dashboard: ${needle}`, dashboard.includes(needle));
});

const reports = read('reports-analytics/reports.html');
[
  'id="report-compare"',
  'data-export-csv',
  'data-export-json',
  'data-report-print',
  'data-preset="this-month"',
  'data-preset="last-quarter"',
  'data-preset="custom"',
  'data-section="comparison"',
  'data-section="budgets"',
  'data-section="savings"',
  'data-section="net_worth"',
  'data-r="monthly-rows"',
  'data-r="category-rows"',
  'data-r="source-rows"',
  'data-r="upcoming-rows"',
  'data-r="budget-rows"',
  'data-r="savings-rows"',
].forEach((needle) => {
  check(`reports: ${needle}`, reports.includes(needle));
});

check(
  'reports: no Chart.js CDN',
  !/chart\.umd\.min\.js|cdn\.jsdelivr\.net\/npm\/chart\.js/.test(reports),
  'third-party chart dependency should be removed'
);

const expenses = read('expense-management/expenses.js');
[
  '/transactions/search',
  'data-search-q',
  'data-search-type',
  'data-search-from',
  'data-search-to',
  'data-search-min-amount',
  'data-search-max-amount',
  'data-search-category',
  'data-search-sort',
  'data-search-clear',
  'data-search-export',
  '/transactions/export',
].forEach((needle) => {
  check(`expenses search: ${needle}`, expenses.includes(needle));
});

/* ── New Insights pages ───────────────────────────────────────────────── */
const INSIGHT_PAGES = {
  'insights/overview.html': 'insights-overview',
  'insights/trends.html': 'insights-trends',
  'insights/income.html': 'insights-income',
  'insights/budgets.html': 'insights-budgets',
  'insights/savings.html': 'insights-savings',
  'insights/commitments.html': 'insights-commitments',
  'insights/data-quality.html': 'insights-quality',
};

Object.entries(INSIGHT_PAGES).forEach(([file, navKey]) => {
  check(`insights: ${file} exists`, exists(file));
  if (!exists(file)) return;
  const html = read(file);
  check(`insights: ${file} nav`, html.includes(`data-nav="${navKey}"`));
  check(`insights: ${file} loads shared script`, html.includes('insights-pages.js'));
  check(`insights: ${file} loads shared css`, html.includes('insights.css'));
  check(`insights: ${file} has page state`, html.includes('data-insights-page-state'));
  check(`insights: ${file} has content region`, html.includes('data-insights-content'));
  check(`insights: ${file} has no chart CDN`, !/cdn\.jsdelivr\.net/.test(html));
});

/* ── Quick add ────────────────────────────────────────────────────────── */
const quickAdd = read('dashboard/dashboard.html');
[
  'data-quick-add-trigger',
  'id="quick-add-dialog"',
  'data-quick-add-submit',
  'data-quick-add-type-option="expense"',
  'data-quick-add-type-option="income"',
  'id="quick-add-category"',
  'id="quick-add-source"',
].forEach((needle) => {
  check(`quick add: ${needle}`, quickAdd.includes(needle));
});

const dashboardJs = read('dashboard/dashboard.js');
[
  '/dashboard/preferences',
  "'Idempotency-Key'",
  'newIdempotencyKey',
  'spendsense:transaction-created',
].forEach((needle) => {
  check(`dashboard js: ${needle}`, dashboardJs.includes(needle));
});

/* ── No leftover debug output ──────────────────────────────────────────── */
const jsFiles = [
  'dashboard/dashboard.js',
  'reports-analytics/reports.js',
  'expense-management/expenses.js',
  'insights/insights-pages.js',
  'stage5/stage5-common.js',
];

jsFiles.forEach((file) => {
  const source = read(file);
  check(`${file}: no console.log`, !/console\.log\(/.test(source));
  check(`${file}: balanced braces`, (source.match(/\{/g) || []).length === (source.match(/\}/g) || []).length);
  check(`${file}: balanced parens`, (source.match(/\(/g) || []).length === (source.match(/\)/g) || []).length);

  // A closing bracket followed by a stray double quote makes
  // querySelector throw and breaks the whole page.
  const badSelectors = source.match(/querySelector(?:All)?\('[^']*\]"[^']*'/g) || [];
  check(`${file}: valid selectors`, badSelectors.length === 0, badSelectors.join(' '));
});

/* ── Report ───────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.ok);
results.forEach((r) => {
  if (!r.ok) console.log(`FAIL  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
});
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
