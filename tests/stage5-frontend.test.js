// Stage 5 frontend contracts and helpers.
// Run with: node --test tests/stage5-frontend.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const S5 = require(path.join(ROOT, 'stage5', 'stage5-common.js'));

/* ── The shared helpers ───────────────────────────────────────────────── */

test('stage 5 month helpers convert a month range into inclusive UTC dates', () => {
  assert.equal(S5.monthStart('2026-02'), '2026-02-01');
  assert.equal(S5.monthEnd('2026-02'), '2026-02-28');
  // 2028 is a leap year.
  assert.equal(S5.monthEnd('2028-02'), '2028-02-29');
  assert.equal(S5.monthEnd('2026-12'), '2026-12-31');

  assert.deepEqual(S5.monthRangeToDates('2026-01', '2026-03'), {
    from: '2026-01-01',
    to: '2026-03-31',
  });
});

test('stage 5 addMonths crosses year boundaries without drifting', () => {
  assert.equal(S5.addMonths('2026-01', -1), '2025-12');
  assert.equal(S5.addMonths('2026-12', 1), '2027-01');
  assert.equal(S5.addMonths('2026-06', -6), '2025-12');
});

test('stage 5 reporting presets produce the documented date ranges', () => {
  const today = new Date(Date.UTC(2026, 9, 20)); // 20 October 2026

  assert.deepEqual(S5.presetRange('this-month', today), {
    from: '2026-10-01',
    to: '2026-10-20',
  });
  assert.deepEqual(S5.presetRange('last-month', today), {
    from: '2026-09-01',
    to: '2026-09-30',
  });
  assert.deepEqual(S5.presetRange('this-quarter', today), {
    from: '2026-10-01',
    to: '2026-12-31',
  });
  assert.deepEqual(S5.presetRange('last-quarter', today), {
    from: '2026-07-01',
    to: '2026-09-30',
  });
  assert.deepEqual(S5.presetRange('last-6-months', today), {
    from: '2026-05-01',
    to: '2026-10-20',
  });
  assert.deepEqual(S5.presetRange('year-to-date', today), {
    from: '2026-01-01',
    to: '2026-10-20',
  });
  assert.equal(S5.presetRange('custom', today), null);
});

test('the report query carries the period, the comparison and the sections', () => {
  const query = S5.buildReportQuery({
    from: '2026-10-01',
    to: '2026-10-31',
    compare: 'previous',
    sections: ['comparison', 'categories'],
  });
  assert.equal(query.get('from'), '2026-10-01');
  assert.equal(query.get('to'), '2026-10-31');
  assert.equal(query.get('compare'), 'previous');
  assert.equal(query.get('sections'), 'comparison,categories');

  // An empty section list means "let the server use its default".
  const withoutSections = S5.buildReportQuery({
    from: '2026-10-01',
    to: '2026-10-31',
    compare: 'none',
    sections: [],
  });
  assert.equal(withoutSections.get('sections'), null);
});

test('the transaction search query omits empty filters and keeps the sort', () => {
  const query = S5.buildSearchQuery({
    q: 'lunch',
    type: 'expense',
    from: '',
    to: '2026-10-31',
    min_amount: '',
    max_amount: '500',
    category_id: '3',
    sort: 'amount_desc',
    per_page: 25,
    page: 2,
  });

  assert.equal(query.get('q'), 'lunch');
  assert.equal(query.get('type'), 'expense');
  assert.equal(query.get('from'), null);
  assert.equal(query.get('to'), '2026-10-31');
  assert.equal(query.get('min_amount'), null);
  assert.equal(query.get('max_amount'), '500');
  assert.equal(query.get('category_id'), '3');
  assert.equal(query.get('sort'), 'amount_desc');
  assert.equal(query.get('per_page'), '25');
  assert.equal(query.get('page'), '2');
});

test('the default dashboard layout hides only the optional manual widgets', () => {
  const keys = ['summary', 'cash_flow', 'net_worth', 'subscription_renewals'];
  const layout = S5.defaultWidgetLayout(keys, ['net_worth', 'subscription_renewals']);

  assert.deepEqual(layout, [
    { key: 'summary', visible: true },
    { key: 'cash_flow', visible: true },
    { key: 'net_worth', visible: false },
    { key: 'subscription_renewals', visible: false },
  ]);
});

test('a saved dashboard layout keeps the server order and drops unknown keys', () => {
  const keys = ['summary', 'cash_flow', 'net_worth'];
  const layout = S5.normalizeWidgetLayout(
    [
      { key: 'net_worth', visible: true },
      { key: 'not_a_widget', visible: true },
      { key: 'summary', visible: false },
    ],
    keys,
    ['net_worth']
  );

  assert.deepEqual(layout, [
    { key: 'net_worth', visible: true },
    { key: 'summary', visible: false },
    // A widget the server did not send keeps its default visibility.
    { key: 'cash_flow', visible: true },
  ]);
});

test('moving a widget keeps the rest of the order and refuses to leave the list', () => {
  const layout = [
    { key: 'a', visible: true },
    { key: 'b', visible: true },
    { key: 'c', visible: true },
  ];

  assert.deepEqual(S5.moveWidget(layout, 'c', -1), [
    { key: 'a', visible: true },
    { key: 'c', visible: true },
    { key: 'b', visible: true },
  ]);
  assert.deepEqual(S5.moveWidget(layout, 'a', -1), layout);
  assert.deepEqual(S5.moveWidget(layout, 'c', 1), layout);
  assert.deepEqual(S5.visibleWidgetKeys(layout), ['a', 'b', 'c']);
  assert.deepEqual(S5.visibleWidgetKeys([{ key: 'a', visible: false }]), []);
});

/* ── Navigation ───────────────────────────────────────────────────────── */

const NAV_KEYS = [
  'dashboard',
  'expenses',
  'income',
  'budgets',
  'goals',
  'categories',
  'insights-overview',
  'insights-budgets',
  'insights-savings',
  'insights-commitments',
  'insights-quality',
  'reports',
  'subscriptions',
  'notifications',
  'settings',
  'support',
];

// The Spending insights and Income analysis pages were retired from the UI;
// their legacy URLs redirect instead of being linked anywhere.
const NAV_PAGES = [
  'dashboard/dashboard.html',
  'expense-management/expenses.html',
  'expense-management/add-expense.html',
  'income-management/income.html',
  'budget-planning/budget.html',
  'savings-goals/savings-goals.html',
  'categories-management/categories.html',
  'reports-analytics/reports.html',
  'financial-intelligence/subscriptions.html',
  'notifications/notifications.html',
  'settings/settings.html',
  'support/support.html',
  'insights/overview.html',
  'insights/budgets.html',
  'insights/savings.html',
  'insights/commitments.html',
  'insights/data-quality.html',
];

test('the Stage 5 navigation is present on every application page', () => {
  NAV_PAGES.forEach((page) => {
    assert.ok(exists(page), `${page} should exist`);
    const html = read(page);
    NAV_KEYS.forEach((key) => {
      assert.ok(
        html.includes(`data-nav="${key}"`),
        `${page} should link to the ${key} navigation entry`
      );
    });
  });
});

test('the retired analysis pages are redirected, not linked', () => {
  // The old URLs still resolve (bookmarks, search results), but they bounce
  // to the closest remaining page instead of rendering the retired views.
  const insightsRedirect = read('financial-intelligence/insights.html');
  const incomeRedirect = read('insights/income.html');
  assert.ok(insightsRedirect.includes('window.location.replace("../insights/overview.html")'));
  assert.ok(insightsRedirect.includes('http-equiv="refresh"'));
  assert.ok(incomeRedirect.includes('window.location.replace("../income-management/income.html")'));
  assert.ok(incomeRedirect.includes('http-equiv="refresh"'));

  // Nothing in the shell may link to either retired route.
  [...NAV_PAGES, 'dashboard/dashboard.js', 'insights/insights-pages.js', 'reports-analytics/reports.js'].forEach(
    (file) => {
      const source = read(file);
      assert.ok(!source.includes('financial-intelligence/insights.html'), `${file} must not link to the retired Spending insights page`);
      assert.ok(!source.includes('insights/income.html'), `${file} must not link to the retired Income analysis page`);
    }
  );
});

test('exactly one navigation entry is marked active on each page', () => {
  NAV_PAGES.forEach((page) => {
    const html = read(page);
    const active = html.match(/class="sidebar-link active"/g) || [];
    assert.equal(active.length, 1, `${page} should mark one navigation entry active`);
  });
});

/* ── The dashboard ────────────────────────────────────────────────────── */

test('the dashboard exposes every Stage 5 widget and the customize panel', () => {
  const html = read('dashboard/dashboard.html');
  const keys = [
    'summary',
    'cash_flow',
    'spending_categories',
    'budgets',
    'savings_goals',
    'upcoming_bills',
    'recent_transactions',
    'spending_insights',
    'subscription_renewals',
  ];
  keys.forEach((key) => {
    assert.ok(html.includes(`data-widget="${key}"`), `the ${key} widget should exist`);
  });

  assert.ok(html.includes('data-dashboard-customize'));
  assert.ok(html.includes('dashboard-customize-dialog'));
  assert.ok(html.includes('data-customize-apply'));
  assert.ok(html.includes('data-customize-reset'));
  assert.ok(html.includes('data-widget-list'));
});

test('the dashboard persists the layout through the preferences endpoints', () => {
  const source = read('dashboard/dashboard.js');
  assert.ok(source.includes("'/dashboard/preferences'"));
  assert.ok(source.includes("api.put('/dashboard/preferences'"));
  assert.ok(source.includes("api.delete('/dashboard/preferences'"));
  // The layout is applied by moving the real DOM nodes, not by re-rendering.
  assert.ok(source.includes('region.appendChild(node)'));
});

test('the dashboard loads each widget separately so one failure is isolated', () => {
  const source = read('dashboard/dashboard.js');
  assert.ok(source.includes('Promise.allSettled'));
  // The visible set drives which requests are made.
  assert.ok(source.includes('const wants = (key) => visible.includes(key);'));
});

test('the quick add dialog is keyboard reachable and sends an idempotency key', () => {
  const html = read('dashboard/dashboard.html');
  const source = read('dashboard/dashboard.js');

  assert.ok(html.includes('data-quick-add-trigger'));
  assert.ok(html.includes('id="quick-add-dialog"'));
  assert.ok(html.includes('data-quick-add-type-option="expense"'));
  assert.ok(html.includes('data-quick-add-type-option="income"'));
  assert.ok(html.includes('id="quick-add-category"'));
  assert.ok(html.includes('id="quick-add-source"'));

  assert.ok(source.includes("'Idempotency-Key'"));
  assert.ok(source.includes('api.newIdempotencyKey()'));
  // The key is created once per opening and reused for a retry.
  assert.ok(source.includes('let quickAddKey = null;'));
  assert.ok(source.includes('quickAddKey = api.newIdempotencyKey();'));
});

/* ── The reports centre ───────────────────────────────────────────────── */

test('the reports centre uses the reports API and offers every export', () => {
  const html = read('reports-analytics/reports.html');
  const source = read('reports-analytics/reports.js');

  assert.ok(source.includes("API.get(`/reports?"));
  assert.ok(source.includes("`${base}/api/reports/export?"));
  assert.ok(html.includes('data-export-csv'));
  assert.ok(html.includes('data-export-json'));
  assert.ok(html.includes('data-report-print'));
});

test('the reports centre offers the period presets and a comparison', () => {
  const html = read('reports-analytics/reports.html');
  ['this-month', 'last-month', 'last-6-months', 'year-to-date', 'custom'].forEach((preset) => {
    assert.ok(html.includes(`data-preset="${preset}"`), `the ${preset} preset should exist`);
  });
  assert.ok(html.includes('id="report-compare"'));
  assert.ok(html.includes('value="previous"'));
  assert.ok(html.includes('value="none"'));
});

test('the reports centre is graph-first with one income-versus-expenses trend', () => {
  const html = read('reports-analytics/reports.html');
  const source = read('reports-analytics/reports.js');

  // The retired section builder is gone; the page always renders the same
  // focused report.
  assert.ok(!html.includes('data-section="'), 'the section chooser should be removed');

  // A single trend chart (inline SVG), drawn from the shared report data,
  // with the monthly table kept as the accessible alternative.
  assert.ok(html.includes('data-report-chart'));
  assert.ok(source.includes('const trendChart'));
  assert.ok(source.includes("const svgNS = 'http://www.w3.org/2000/svg'"));
  assert.ok(source.includes('createElementNS(svgNS'));
  assert.ok(source.includes('--chart-income'));
  assert.ok(source.includes('--chart-expense'));
  assert.ok(html.includes('data-r="monthly-rows"'));
  assert.ok(html.includes('View monthly totals as a table'));

  // Concise summaries: KPI strip, comparison panel, category/source tables.
  assert.ok(html.includes('data-r="income"'));
  assert.ok(html.includes('data-r="expenses"'));
  assert.ok(html.includes('data-r="net"'));
  assert.ok(html.includes('data-r="expected"'));
  assert.ok(html.includes('data-comparison-wrap'));
  assert.ok(html.includes('data-r="categories"'));
  assert.ok(html.includes('data-r="source-rows"'));
  assert.ok(html.includes('data-r="review-rows"'));

  // The report requests only the sections it renders, so an export never
  // contains more sections than the page shows.
  assert.ok(source.includes("'monthly', 'categories', 'income_sources', 'upcoming_bills', 'expense_review'"));
});

test('the reports centre states that no balance is available', () => {
  const html = read('reports-analytics/reports.html');
  assert.ok(html.includes('No opening or ending bank balance is inferred'));
});

test('the reports centre has no third-party charting dependency', () => {
  const html = read('reports-analytics/reports.html');
  const source = read('reports-analytics/reports.js');
  assert.ok(!/cdn\.jsdelivr\.net/.test(html), 'the CDN script tag should be removed');
  assert.ok(!/chart\.umd\.min\.js/.test(html), 'the Chart.js script tag should be removed');
  assert.ok(!/new window\.Chart/.test(source), 'the chart constructor should not be used');
});

/* ── The insights pages ───────────────────────────────────────────────── */

const INSIGHT_PAGES = {
  'insights/overview.html': 'insights-overview',
  'insights/budgets.html': 'insights-budgets',
  'insights/savings.html': 'insights-savings',
  'insights/commitments.html': 'insights-commitments',
  'insights/data-quality.html': 'insights-quality',
};

test('the insights pages expose controls and the loading, empty and error states', () => {
  Object.keys(INSIGHT_PAGES).forEach((page) => {
    const html = read(page);
    assert.ok(html.includes('data-insights-form'), `${page} should have a period form`);
    assert.ok(html.includes('data-insights-page-state'), `${page} should have a page state`);
    assert.ok(html.includes('data-insights-content'), `${page} should have a content region`);
    assert.ok(html.includes('state loading'), `${page} should have a loading state`);
  });
});

test('the insights pages use the documented owner-scoped analytics endpoints', () => {
  const source = read('insights/insights-pages.js');
  // The shared API client already prefixes "/api".
  [
    '/reports?',
    '/analytics/budget-performance?',
    '/analytics/savings-progress?',
    '/analytics/commitments?',
    '/analytics/data-quality?',
  ].forEach((endpoint) => {
    assert.ok(source.includes(endpoint), `the ${endpoint} endpoint should be used`);
  });
});

test('the retired income-analysis endpoint is no longer called by the frontend', () => {
  const source = read('insights/insights-pages.js');
  assert.ok(!source.includes('/analytics/income-analysis'));
});

test('the insights pages state the actual versus expected separation', () => {
  // The pages that show actual ledger figures must say so explicitly.
  [
    'insights/overview.html',
    'insights/budgets.html',
    'insights/commitments.html',
  ].forEach((page) => {
    const html = read(page);
    assert.ok(/[Aa]ctual/.test(html), `${page} should make the actual figures explicit`);
  });

  // Savings is internal tracking, so it must say it is not income or expense.
  const savings = read('insights/savings.html');
  assert.ok(savings.includes('not income or expenses'));
  assert.ok(savings.includes('internal tracking entries'));

  // The data-quality review must say it never changes a record.
  const quality = read('insights/data-quality.html');
  assert.ok(quality.includes('never automatic changes'));
  assert.ok(quality.includes('Nothing here edits, merges or deletes a financial record'));
});

/* ── The transaction search ────────────────────────────────────────────── */

test('the expense list searches on the server with every documented filter', () => {
  const source = read('expense-management/expenses.js');
  assert.ok(source.includes('/transactions/search?'));
  assert.ok(source.includes('/transactions/export?'));
  [
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
  ].forEach((hook) => {
    assert.ok(source.includes(hook), `the ${hook} control should exist`);
  });
});

test('the transaction search distinguishes no results from no transactions', () => {
  const source = read('expense-management/expenses.js');
  assert.ok(source.includes('No transactions match your filters.'));
  assert.ok(source.includes('No expenses yet. Log your first expense to see it here.'));
});

test('the transaction search reads a drill-down from the query string', () => {
  const source = read('expense-management/expenses.js');
  assert.ok(source.includes('applyDeepLinkParams'));
  assert.ok(source.includes("params.get('category_id')"));
  assert.ok(source.includes("params.get('from')"));
  assert.ok(source.includes("params.get('to')"));
});

/* ── Accessibility and responsiveness ─────────────────────────────────── */

test('the new surfaces carry the shared accessible state markup', () => {
  const html = read('insights/insights.css');
  assert.ok(html.includes('@media (max-width: 720px)'), 'the stylesheet should be responsive');
  assert.ok(html.includes('@media (max-width: 480px)'));
  assert.ok(html.includes('@media print'), 'the print layout should be defined');
});

test('the new dialogs use the native dialog element with a labelled title', () => {
  const html = read('dashboard/dashboard.html');
  assert.ok(html.includes('class="ss-dialog"'));
  assert.ok(html.includes('aria-labelledby="dashboard-customize-title"'));
  assert.ok(html.includes('aria-labelledby="quick-add-title"'));
  assert.ok(html.includes('data-widget-list'));
});

test('the widget reorder controls are labelled for screen readers', () => {
  const source = read('dashboard/dashboard.js');
  assert.ok(source.includes('Move ${meta ? meta.label : widget.key} up'));
  assert.ok(source.includes('Move ${meta ? meta.label : widget.key} down'));
  assert.ok(source.includes('aria-pressed'));
});

test('the new pages do not leave debug output behind', () => {
  ['dashboard/dashboard.js', 'reports-analytics/reports.js', 'insights/insights-pages.js', 'expense-management/expenses.js'].forEach(
    (file) => {
      const source = read(file);
      assert.ok(!/console\.log\(/.test(source), `${file} should not log to the console`);
    }
  );
});

test('the new pages do not add a third-party script dependency', () => {
  ['dashboard/dashboard.html', 'reports-analytics/reports.html'].forEach((file) => {
    const html = read(file);
    const external = html.match(/<script[^>]+src="(https?:\/\/[^"]+)"/g) || [];
    external.forEach((tag) => {
      assert.fail(`${file} should not load a third-party script: ${tag}`);
    });
  });
});
