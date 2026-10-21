/*
 * Stage 5 frontend integration – dashboard shell.
 *
 * 1. Tags the existing dashboard blocks with data-widget keys so the widget
 *    preference system can show/hide and reorder them.
 * 2. Adds containers for the additional Stage 5 widgets.
 * 3. Adds the Customize dashboard and Quick add dialogs.
 *
 * Run from the frontend directory:  node tools/stage5-dashboard-shell.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'dashboard', 'dashboard.html');
let html = fs.readFileSync(target, 'utf8');

const replaceOnce = (needle, replacement, label) => {
  if (!html.includes(needle)) {
    throw new Error(`Anchor not found: ${label}`);
  }
  html = html.replace(needle, replacement);
};

// ── 1. Tag the existing blocks as widgets ────────────────────────────────
replaceOnce(
  '<section class="grid grid-4" aria-label="Monthly summary">',
  '<section class="grid grid-4" aria-label="Monthly summary" data-widget="summary">',
  'summary grid'
);

replaceOnce(
  '              <div class="card-body" data-breakdown>',
  '              <div class="card-body" data-breakdown>',
  'breakdown anchor'
);

const tagArticle = (titleText, key) => {
  const idx = html.indexOf(`<h2 class="card-title">${titleText}</h2>`);
  if (idx === -1) throw new Error(`Card title not found: ${titleText}`);
  // Walk back to the nearest <article class="card"> opening tag.
  const articleStart = html.lastIndexOf('<article class="card">', idx);
  if (articleStart === -1) throw new Error(`Article not found for: ${titleText}`);
  html =
    html.slice(0, articleStart) +
    `<article class="card" data-widget="${key}">` +
    html.slice(articleStart + '<article class="card">'.length);
};

tagArticle('Spending by category', 'spending_categories');
tagArticle('Cash flow', 'cash_flow');
tagArticle('Budget progress', 'budgets');
tagArticle('Recent transactions', 'recent_transactions');

// ── 2. Extra widget containers for the remaining Stage 5 widgets ────────
const extraWidgets = `
        <section class="grid grid-main-side section-gap" data-widget-region="extra">
          <div class="grid">
            <article class="card" data-widget="savings_goals">
              <div class="card-head">
                <div>
                  <h2 class="card-title">Savings goals</h2>
                  <p class="card-sub">Internal tracking, not an expense</p>
                </div>
                <a class="link small" href="../savings-goals/savings-goals.html">Manage</a>
              </div>
              <div class="card-body" data-widget-body="savings_goals">
                <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading goals…</p></div>
              </div>
            </article>

            <article class="card" data-widget="spending_insights">
              <div class="card-head">
                <div>
                  <h2 class="card-title">Spending insights</h2>
                  <p class="card-sub">Trend and review signals for the selected period</p>
                </div>
                <a class="link small" href="../insights/overview.html">Details</a>
              </div>
              <div class="card-body" data-widget-body="spending_insights">
                <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading insights…</p></div>
              </div>
            </article>
          </div>

          <div class="grid">
            <article class="card" data-widget="upcoming_bills">
              <div class="card-head">
                <div>
                  <h2 class="card-title">Upcoming bills</h2>
                  <p class="card-sub">Expected obligations, not paid expenses</p>
                </div>
                <a class="link small" href="../recurring-expenses/recurring-expenses.html">Manage</a>
              </div>
              <div class="card-body" data-widget-body="upcoming_bills">
                <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading bills…</p></div>
              </div>
            </article>

            <article class="card" data-widget="cash_flow_forecast">
              <div class="card-head">
                <div>
                  <h2 class="card-title">30-day forecast</h2>
                  <p class="card-sub">Schedule-based expectations only</p>
                </div>
                <a class="link small" href="../financial-intelligence/forecast.html">Details</a>
              </div>
              <div class="card-body" data-widget-body="cash_flow_forecast">
                <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading forecast…</p></div>
              </div>
            </article>

            <article class="card" data-widget="net_worth">
              <div class="card-head">
                <div>
                  <h2 class="card-title">Net worth</h2>
                  <p class="card-sub">Manual valuations, not available cash</p>
                </div>
                <a class="link small" href="../financial-intelligence/net-worth.html">Details</a>
              </div>
              <div class="card-body" data-widget-body="net_worth">
                <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading net worth…</p></div>
              </div>
            </article>

            <article class="card" data-widget="subscription_renewals">
              <div class="card-head">
                <div>
                  <h2 class="card-title">Subscription renewals</h2>
                  <p class="card-sub">Estimates, kept separate from spending</p>
                </div>
                <a class="link small" href="../financial-intelligence/subscriptions.html">Details</a>
              </div>
              <div class="card-body" data-widget-body="subscription_renewals">
                <div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading subscriptions…</p></div>
              </div>
            </article>
          </div>
        </section>
`;

replaceOnce(
  '        </section>\n      </main>\n    </div>',
  '        </section>\n' + extraWidgets + '      </main>\n    </div>',
  'extra widget region'
);

// ── 3. Dialogs ──────────────────────────────────────────────────────────
const dialogs = `
    <!-- Customize dashboard: show, hide and reorder widgets -->
    <dialog id="dashboard-customize-dialog" class="ss-dialog" aria-labelledby="dashboard-customize-title">
      <div class="ss-dialog-head">
        <h2 id="dashboard-customize-title">Customize dashboard</h2>
        <button class="btn ghost sm" type="button" data-customize-close>Close</button>
      </div>
      <div class="ss-dialog-body">
        <p class="ss-dialog-note">
          Show, hide and reorder the widgets on this dashboard. The order is saved to your account only.
        </p>
        <ul class="widget-list" data-widget-list></ul>
      </div>
      <div class="ss-dialog-foot">
        <button class="btn primary sm" type="button" data-customize-apply>Save layout</button>
        <button class="btn secondary sm" type="button" data-customize-reset>Reset to defaults</button>
      </div>
    </dialog>

    <!-- Quick add: keyboard accessible transaction entry -->
    <dialog id="quick-add-dialog" class="ss-dialog" aria-labelledby="quick-add-title">
      <div class="ss-dialog-head">
        <h2 id="quick-add-title">Quick add transaction</h2>
        <button class="btn ghost sm" type="button" data-quick-add-close>Close</button>
      </div>
      <form class="ss-dialog-body quick-add-form" data-quick-add-form novalidate>
        <div class="field">
          <label id="quick-add-type-label">Type</label>
          <div class="segmented" role="group" aria-labelledby="quick-add-type-label" data-quick-add-type>
            <button type="button" data-quick-add-type-option="expense" aria-pressed="true">Expense</button>
            <button type="button" data-quick-add-type-option="income" aria-pressed="false">Income</button>
          </div>
        </div>
        <div class="field">
          <label for="quick-add-amount">Amount</label>
          <input id="quick-add-amount" name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required />
        </div>
        <div class="field">
          <label for="quick-add-date">Date</label>
          <input id="quick-add-date" name="date" type="date" required />
        </div>
        <div class="field" data-quick-add-expense-only>
          <label for="quick-add-description">Description</label>
          <input id="quick-add-description" name="description" type="text" maxlength="255" placeholder="Optional note about this expense" />
        </div>
        <div class="field" data-quick-add-expense-only>
          <label for="quick-add-category">Category</label>
          <select id="quick-add-category" name="category_id" required>
            <option value="">Choose category</option>
          </select>
        </div>
        <div class="field" data-quick-add-income-only hidden>
          <label for="quick-add-source">Source</label>
          <input id="quick-add-source" name="source" type="text" maxlength="120" list="quick-add-source-options" required />
          <datalist id="quick-add-source-options">
            <option value="Salary"></option>
            <option value="Freelance"></option>
            <option value="Business"></option>
            <option value="Investments"></option>
            <option value="Rental"></option>
            <option value="Other"></option>
          </datalist>
        </div>
        <p class="ss-dialog-note">
          Saving uses an idempotency key, so a retried submission cannot create the same transaction twice.
        </p>
        <p class="ss-message" data-quick-add-message role="status" aria-live="polite"></p>
      </form>
      <div class="ss-dialog-foot">
        <button class="btn primary sm" type="button" data-quick-add-submit>Save transaction</button>
        <button class="btn ghost sm" type="button" data-quick-add-close>Cancel</button>
      </div>
    </dialog>
`;

replaceOnce(
  '    <script src="../script.js"></script>\n    <script src="dashboard.js"></script>',
  '    <script src="../script.js"></script>\n    <script src="dashboard.js"></script>\n' + dialogs,
  'dialogs'
);

fs.writeFileSync(target, html, 'utf8');
console.log('dashboard.html updated');
