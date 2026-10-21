/*
 * Stage 5 frontend integration – Insights page generator.
 *
 * Creates the dedicated Insights pages that sit on top of the Stage 5
 * analytics endpoints. Every page shares the same shell, the same
 * navigation and the same loading / empty / error conventions as the
 * existing Stage 4 pages, so no page is a duplicate of another.
 *
 *   A1  overview        (period + comparison summary, links to every view)
 *   A5  budgets         (budget performance)
 *   A6  savings         (savings goal progress)
 *   A9  commitments     (recurring commitments, linked bills counted once)
 *   A10 data-quality    (data quality review)
 *
 * The spending-trends and income-analysis pages were retired: insights/
 * trends.html redirects to the overview and insights/income.html redirects
 * to the Income page, so this generator no longer creates them.
 *
 * A6 (cash-flow forecast), A7 (net worth) and A8 (subscriptions) keep using
 * the existing Stage 4 pages under frontend/financial-intelligence/ so the
 * calculations are not duplicated.
 *
 * Run from the frontend directory:  node tools/stage5-insights-pages.js
 */
const fs = require('fs');
const path = require('path');
const { buildNav } = require('./stage5-nav-data');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'insights');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SHELL = (page) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <meta name="api-base-url" content="http://127.0.0.1:8002" />
    <title>${page.title} | SpendSense</title>
    <script src="../theme.js"></script>
    <link rel="stylesheet" href="../styles.css" />
    <link rel="stylesheet" href="../financial-intelligence/financial-intelligence.css" />
    <link rel="stylesheet" href="insights.css" />
  </head>
  <body class="app-body" data-requires-auth data-login-href="../authentication/login.html" data-insights-page="${page.key}">
    <aside class="sidebar" data-sidebar>
      <a class="sidebar-brand" href="../dashboard/dashboard.html">
        <span class="brand-mark">S</span>
        <span>SpendSense</span>
      </a>
      <nav class="sidebar-nav" aria-label="Main navigation">
${buildNav(page.navKey)}
      </nav>
      <div class="sidebar-footer">
        <div class="user-chip">
          <span class="user-avatar" data-user-avatar>S</span>
          <span class="user-meta"><strong data-user-name>Account</strong><small data-user-email>Signed-in session</small></span>
        </div>
        <button class="btn ghost sm block" type="button" data-logout>Log out</button>
      </div>
    </aside>
    <div class="sidebar-overlay" data-sidebar-overlay></div>

    <div class="main">
      <header class="topbar">
        <button class="icon-btn topbar-toggle" type="button" data-sidebar-toggle aria-label="Toggle navigation" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg></button>
        <div class="topbar-titles">
          <h1 class="topbar-title">${page.title}</h1>
          <span class="topbar-sub">${page.subtitle}</span>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" type="button" data-theme-toggle aria-label="Toggle dark mode"><svg viewBox="0 0 24 24"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
          <button class="btn secondary sm" type="button" data-insights-refresh>Refresh</button>
          ${page.topbarExtra || ''}
        </div>
      </header>

      <main class="content intel-page">
        ${page.note || ''}

        ${page.controls || ''}

        <div data-insights-page-state aria-live="polite">
          <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading ${page.title.toLowerCase()}…</p></div>
        </div>

        <div data-insights-content class="intel-page" hidden>
${page.content}
        </div>
      </main>
    </div>

    <script src="../stage5/stage5-common.js"></script>
    <script src="../script.js"></script>
    <script src="../financial-intelligence/intelligence-common.js"></script>
    <script src="insights-pages.js"></script>
  </body>
</html>
`;

const MONTH_CONTROLS = (idPrefix) => `
        <form class="intel-controls" data-insights-form novalidate>
          <div class="field">
            <label for="${idPrefix}-from">From month</label>
            <input id="${idPrefix}-from" name="from" type="month" required />
          </div>
          <div class="field">
            <label for="${idPrefix}-to">To month</label>
            <input id="${idPrefix}-to" name="to" type="month" required />
          </div>
          <button class="btn primary" type="submit">Apply period</button>
          <span class="controls-spacer"></span>
          <div class="intel-message" data-insights-message role="status" aria-live="polite"></div>
          <p class="control-note">Up to 24 inclusive UTC calendar months. Months are date-only; the browser's local timezone does not shift a report day.</p>
        </form>
`;

const NOTE = (text) => `
        <div class="intel-note" role="note">
          <span class="note-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8v.01"/></svg></span>
          <div>${text}</div>
        </div>
`;

/* ── A1 – Insights overview ────────────────────────────────────────────── */
const overview = {
  key: 'overview',
  navKey: 'insights-overview',
  title: 'Insights overview',
  subtitle: 'One place for every Stage 5 analysis',
  note: NOTE(
    '<strong>Everything here is calculated from your own records.</strong> Actual ledger totals are separated from expected recurring obligations and subscription estimates. Savings contributions are internal tracking entries, not income or expenses.'
  ),
  controls: `
        <form class="intel-controls" data-insights-form novalidate>
          <div class="field">
            <label for="overview-from">From month</label>
            <input id="overview-from" name="from" type="month" required />
          </div>
          <div class="field">
            <label for="overview-to">To month</label>
            <input id="overview-to" name="to" type="month" required />
          </div>
          <div class="field" style="flex-basis: 200px">
            <label for="overview-compare">Comparison</label>
            <select id="overview-compare" name="compare">
              <option value="previous">Previous period</option>
              <option value="none">No comparison</option>
            </select>
          </div>
          <button class="btn primary" type="submit">Apply period</button>
          <span class="controls-spacer"></span>
          <div class="intel-message" data-insights-message role="status" aria-live="polite"></div>
          <p class="control-note">The comparison period is the immediately preceding interval of the same length.</p>
        </form>
`,
  content: `
          <section class="intel-summary" aria-label="Period summary">
            <article class="card intel-kpi"><span class="kpi-label">Income</span><strong class="kpi-value pos" data-o="income">—</strong><span class="kpi-note" data-o="income-note">Actual income in the period</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Expenses</span><strong class="kpi-value" data-o="expenses">—</strong><span class="kpi-note" data-o="expenses-note">Actual expenses in the period</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Net cash flow</span><strong class="kpi-value" data-o="net">—</strong><span class="kpi-note" data-o="net-note">Income minus expenses</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Expected obligations</span><strong class="kpi-value text-value" data-o="expected">—</strong><span class="kpi-note" data-o="expected-note">Next 30 days, not actual spending</span></article>
          </section>

          <section class="intel-grid">
            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Comparison</h2>
                  <p class="card-sub sub" data-o="comparison-label">Current period against the previous one</p>
                </div>
              </div>
              <div class="card-body">
                <div class="comparison-grid" data-o="comparison"></div>
                <div class="callout" data-o="comparison-note" style="margin-top: 12px"></div>
              </div>
            </article>

            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Top spending categories</h2>
                  <p class="card-sub sub">Actual expenses in the selected period</p>
                </div>
                <a class="link small" href="trends.html">Category analysis</a>
              </div>
              <div class="card-body">
                <div class="viz-list" data-o="categories" role="img" aria-label="Spending by category bars"></div>
                <div class="empty-inline" data-o="categories-empty" hidden>No expenses were recorded in this period.</div>
              </div>
            </article>
          </section>

          <section class="card">
            <div class="card-head intel-card-head">
              <div>
                <h2 class="card-title">Where to go next</h2>
                <p class="card-sub sub">Each view explains its own method and states clearly what it cannot show</p>
              </div>
            </div>
            <div class="card-body">
              <ul class="note-list" data-o="links"></ul>
            </div>
          </section>
`,
};

/* ── A5 – Budget performance ──────────────────────────────────────────── */
const budgets = {
  key: 'budgets',
  navKey: 'insights-budgets',
  title: 'Budget performance',
  subtitle: 'Whole calendar months, without double counting',
  note: NOTE(
    '<strong>Actual spending is compared with each budget.</strong> A month is judged only against the categories that had a budget in that same calendar month, so unbudgeted spending never inflates a budget figure.'
  ),
  controls: MONTH_CONTROLS('budgets'),
  content: `
          <section class="intel-summary" aria-label="Budget summary">
            <article class="card intel-kpi"><span class="kpi-label">Budgeted</span><strong class="kpi-value" data-b="budgeted">—</strong><span class="kpi-note" data-b="budgeted-note">Across the selected months</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Spent</span><strong class="kpi-value" data-b="spent">—</strong><span class="kpi-note" data-b="spent-note">Budgeted categories only</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Remaining</span><strong class="kpi-value" data-b="remaining">—</strong><span class="kpi-note" data-b="remaining-note">Budgeted minus spent</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Repeated overspending</span><strong class="kpi-value" data-b="repeat">—</strong><span class="kpi-note" data-b="repeat-note">Categories over limit in two or more months</span></article>
          </section>

          <section class="card">
            <div class="card-head intel-card-head">
              <div>
                <h2 class="card-title">Budget rows</h2>
                <p class="card-sub sub" data-b="period-label">Loading…</p>
              </div>
              <a class="link small" href="../budget-planning/budget.html">Manage budgets</a>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="table compact">
                  <caption class="sr-only">Budget limit, spend and utilisation per month</caption>
                  <thead><tr><th scope="col">Month</th><th scope="col">Category</th><th scope="col" class="num">Limit</th><th scope="col" class="num">Spent</th><th scope="col" class="num">Remaining</th><th scope="col" class="num">Used %</th><th scope="col">Status</th></tr></thead>
                  <tbody data-b="rows"></tbody>
                </table>
              </div>
              <div class="empty-inline" data-b="empty" hidden>No budgets are set for the selected months.</div>
            </div>
          </section>

          <section class="intel-grid">
            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Month-by-month</h2>
                  <p class="card-sub sub">Totals per calendar month</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Budget totals per calendar month</caption>
                    <thead><tr><th scope="col">Month</th><th scope="col" class="num">Budgeted</th><th scope="col" class="num">Spent</th><th scope="col" class="num">Remaining</th><th scope="col" class="num">Used %</th><th scope="col" class="num">Overspent rows</th></tr></thead>
                    <tbody data-b="history-rows"></tbody>
                  </table>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Threshold crossings</h2>
                  <p class="card-sub sub">Persisted budget alerts, kept as a separate history</p>
                </div>
                <a class="link small" href="../notifications/notifications.html">Notifications</a>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Persisted budget threshold alerts</caption>
                    <thead><tr><th scope="col">Month</th><th scope="col" class="num">Threshold</th><th scope="col" class="num">Spent</th><th scope="col" class="num">Limit</th><th scope="col">Read</th></tr></thead>
                    <tbody data-b="alert-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-b="alert-empty" hidden>No threshold crossings were recorded in the selected months.</div>
              </div>
            </article>
          </section>
`,
};

/* ── A6 – Savings goal progress ───────────────────────────────────────── */
const savings = {
  key: 'savings',
  navKey: 'insights-savings',
  title: 'Savings goal progress',
  subtitle: 'Progress, contributions and completion estimates',
  note: NOTE(
    '<strong>Savings contributions are internal tracking entries.</strong> They are not income or expenses and are never added to cash‑flow totals. Archived goals stay visible for history but are excluded from active totals.'
  ),
  controls: MONTH_CONTROLS('savings'),
  content: `
          <section class="intel-summary" aria-label="Savings summary">
            <article class="card intel-kpi"><span class="kpi-label">Saved (active goals)</span><strong class="kpi-value pos" data-s="saved">—</strong><span class="kpi-note" data-s="saved-note">Net of corrections</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Target (active goals)</span><strong class="kpi-value" data-s="target">—</strong><span class="kpi-note" data-s="target-note">Across active goals</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Contributions in period</span><strong class="kpi-value" data-s="period">—</strong><span class="kpi-note" data-s="period-note">Net contributions recorded</span></article>
            <article class="card intel-kpi"><span class="kpi-label">On track</span><strong class="kpi-value" data-s="ontrack">—</strong><span class="kpi-note" data-s="ontrack-note">Estimated from recent net contributions</span></article>
          </section>

          <section class="card">
            <div class="card-head intel-card-head">
              <div>
                <h2 class="card-title">Goals</h2>
                <p class="card-sub sub" data-s="period-label">Loading…</p>
              </div>
              <a class="link small" href="../savings-goals/savings-goals.html">Manage goals</a>
            </div>
            <div class="card-body">
              <div class="goal-grid" data-s="goals"></div>
              <div class="empty-inline" data-s="goals-empty" hidden>No savings goals have been created yet.</div>
            </div>
          </section>

          <section class="card">
            <div class="card-head intel-card-head">
              <div>
                <h2 class="card-title">Contributions over time</h2>
                <p class="card-sub sub">Net contributions per calendar month</p>
              </div>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="table compact">
                  <caption class="sr-only">Savings contributions, corrections and running balance per month</caption>
                  <thead><tr><th scope="col">Month</th><th scope="col" class="num">Contributions</th><th scope="col" class="num">Corrections</th><th scope="col" class="num">Net</th><th scope="col" class="num">Cumulative saved</th></tr></thead>
                  <tbody data-s="history-rows"></tbody>
                </table>
              </div>
              <div class="empty-inline" data-s="history-empty" hidden>No contributions were recorded in the selected months.</div>
            </div>
          </section>
`,
};

/* ── A9 – Recurring commitments ───────────────────────────────────────── */
const commitments = {
  key: 'commitments',
  navKey: 'insights-commitments',
  title: 'Recurring commitments',
  subtitle: 'Bills and subscriptions, counted once',
  note: NOTE(
    '<strong>Expected obligations and subscription estimates are not actual expenses.</strong> A linked subscription is represented by its bill schedule, so its monthly cost appears in the bill schedule total and is excluded from the standalone subscription total; the same obligation is never counted twice.'
  ),
  controls: `
        <form class="intel-controls" data-insights-form novalidate>
          <div class="field">
            <label for="commitments-from">From month</label>
            <input id="commitments-from" name="from" type="month" required />
          </div>
          <div class="field">
            <label for="commitments-to">To month</label>
            <input id="commitments-to" name="to" type="month" required />
          </div>
          <div class="field">
            <label for="commitments-as-of">As of</label>
            <input id="commitments-as-of" name="as_of" type="date" required />
          </div>
          <button class="btn primary" type="submit">Apply period</button>
          <span class="controls-spacer"></span>
          <div class="intel-message" data-insights-message role="status" aria-live="polite"></div>
          <p class="control-note">Up to 24 inclusive UTC calendar months. Expected obligations are never counted as paid expenses.</p>
        </form>
`,
  content: `
          <section class="intel-summary" aria-label="Commitment summary">
            <article class="card intel-kpi"><span class="kpi-label">Combined monthly</span><strong class="kpi-value" data-c="monthly">—</strong><span class="kpi-note" data-c="monthly-note">Bills plus standalone subscriptions</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Combined annual</span><strong class="kpi-value" data-c="annual">—</strong><span class="kpi-note" data-c="annual-note">Annualised estimate</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Active schedules</span><strong class="kpi-value" data-c="schedules">—</strong><span class="kpi-note" data-c="schedules-note">Recurring bill schedules</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Upcoming 60 days</span><strong class="kpi-value" data-c="upcoming">—</strong><span class="kpi-note" data-c="upcoming-note">Expected obligations</span></article>
          </section>

          <section class="card">
            <div class="card-head intel-card-head">
              <div>
                <h2 class="card-title">Combined commitment breakdown</h2>
                <p class="card-sub sub" data-c="period-label">Loading…</p>
              </div>
              <a class="link small" href="../recurring-expenses/recurring-expenses.html">Manage bills</a>
            </div>
            <div class="card-body">
              <div class="metric-strip" data-c="breakdown"></div>
              <p class="action-note" data-c="breakdown-note"></p>
            </div>
          </section>

          <section class="intel-grid main-side">
            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Upcoming obligations</h2>
                  <p class="card-sub sub">Bills and standalone subscriptions in the next 60 days</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Expected obligations in the next 60 days</caption>
                    <thead><tr><th scope="col">Date</th><th scope="col">Source</th><th scope="col">Name</th><th scope="col" class="num">Amount</th><th scope="col">Status</th></tr></thead>
                    <tbody data-c="upcoming-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-c="upcoming-empty" hidden>No expected obligations fall inside this window.</div>
              </div>
            </article>

            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Bill schedules</h2>
                  <p class="card-sub sub">Active schedules with their normalised monthly cost</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Recurring bill schedules and their normalised cost</caption>
                    <thead><tr><th scope="col">Description</th><th scope="col">Frequency</th><th scope="col" class="num">Amount</th><th scope="col" class="num">Monthly</th><th scope="col">Linked</th><th scope="col">Status</th></tr></thead>
                    <tbody data-c="schedule-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-c="schedule-empty" hidden>No recurring bill schedules yet.</div>
              </div>
            </article>
          </section>

          <section class="card">
            <div class="card-head intel-card-head">
              <div>
                <h2 class="card-title">Commitment history</h2>
                <p class="card-sub sub">A planning estimate built from the current schedule definitions</p>
              </div>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="table compact">
                  <caption class="sr-only">Estimated combined monthly commitment per month</caption>
                  <thead><tr><th scope="col">Month</th><th scope="col" class="num">Bill schedules</th><th scope="col" class="num">Standalone subscriptions</th><th scope="col" class="num">Combined</th></tr></thead>
                  <tbody data-c="history-rows"></tbody>
                </table>
              </div>
              <p class="action-note" data-c="history-note"></p>
            </div>
          </section>
`,
};

/* ── A10 – Data quality ───────────────────────────────────────────────── */
const quality = {
  key: 'quality',
  navKey: 'insights-quality',
  title: 'Data quality review',
  subtitle: 'Signals to review — never automatic changes',
  note: NOTE(
    '<strong>Review signals only.</strong> Nothing here edits, merges or deletes a financial record, and no transaction is labelled fraudulent. Duplicate candidates may be legitimate repeated purchases.'
  ),
  controls: MONTH_CONTROLS('quality'),
  content: `
          <section class="intel-summary" aria-label="Data quality summary">
            <article class="card intel-kpi"><span class="kpi-label">Duplicate candidates</span><strong class="kpi-value" data-q="duplicates">—</strong><span class="kpi-note" data-q="duplicates-note">Groups with the same date, amount and description</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Missing descriptions</span><strong class="kpi-value" data-q="missing">—</strong><span class="kpi-note" data-q="missing-note">Expenses without a description</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Unusually large</span><strong class="kpi-value" data-q="large">—</strong><span class="kpi-note" data-q="large-note">Above three times the period average</span></article>
            <article class="card intel-kpi"><span class="kpi-label">Schedule issues</span><strong class="kpi-value" data-q="schedules">—</strong><span class="kpi-note" data-q="schedules-note">Active schedules past their end date</span></article>
          </section>

          <section class="intel-grid">
            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Duplicate candidates</h2>
                  <p class="card-sub sub">Same date, amount and normalised description</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Expense rows that share a date, amount and description</caption>
                    <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="num">Amount</th><th scope="col" class="num">Rows</th><th scope="col" class="num">Total</th></tr></thead>
                    <tbody data-q="duplicate-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-q="duplicate-empty" hidden>No duplicate candidates were found in the selected period.</div>
              </div>
            </article>

            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Missing descriptions</h2>
                  <p class="card-sub sub">Expenses recorded without a description</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Expenses without a description</caption>
                    <thead><tr><th scope="col">Date</th><th scope="col" class="num">Amount</th><th scope="col">Category</th></tr></thead>
                    <tbody data-q="missing-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-q="missing-empty" hidden>Every expense in this period has a description.</div>
              </div>
            </article>
          </section>

          <section class="intel-grid">
            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Unusually large expenses</h2>
                  <p class="card-sub sub" data-q="threshold-label">Loading…</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Expenses above the documented threshold</caption>
                    <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="num">Amount</th></tr></thead>
                    <tbody data-q="large-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-q="large-empty" hidden>No expense crossed the documented threshold.</div>
              </div>
            </article>

            <article class="card">
              <div class="card-head intel-card-head">
                <div>
                  <h2 class="card-title">Schedule and tracker issues</h2>
                  <p class="card-sub sub">Active schedules that need a decision</p>
                </div>
              </div>
              <div class="card-body">
                <div class="table-wrap">
                  <table class="table compact">
                    <caption class="sr-only">Schedule and subscription status issues</caption>
                    <thead><tr><th scope="col">Item</th><th scope="col">Reason</th><th scope="col">Status</th></tr></thead>
                    <tbody data-q="schedule-rows"></tbody>
                  </table>
                </div>
                <div class="empty-inline" data-q="schedule-empty" hidden>No schedule or tracker issues were found.</div>
                <p class="action-note" data-q="category-note"></p>
                <p class="action-note" data-q="import-note"></p>
              </div>
            </article>
          </section>
`,
};

/* The Income analysis and Spending trends pages were retired; the income
   page redirects to the Income page and trends redirects to this overview.
   Their blocks and entries were removed so a regeneration cannot recreate
   retired routes. */
const PAGES = [overview, budgets, savings, commitments, quality];

// The file name is not always the page key: the data-quality page uses a
// readable "data-quality" file name.
const FILE_NAMES = { quality: 'data-quality' };

PAGES.forEach((page) => {
  const fileName = FILE_NAMES[page.key] || page.key;
  const file = path.join(OUT_DIR, `${fileName}.html`);
  fs.writeFileSync(file, SHELL(page), 'utf8');
  console.log(`wrote insights/${fileName}.html`);
});
