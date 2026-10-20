/*
 * Stage 5 frontend integration – dashboard dialogs.
 *
 * Appends the Customize dashboard dialog and the Quick add dialog to the
 * dashboard shell. Both use the native <dialog> element, so the browser
 * provides the focus trap, the inert background and the Escape key handling.
 *
 * Run from the frontend directory:  node tools/stage5-dashboard-dialogs.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'dashboard', 'dashboard.html');
let html = fs.readFileSync(target, 'utf8');

if (html.includes('id="dashboard-customize-dialog"')) {
  console.log('SKIP  dialogs already present');
  process.exit(0);
}

const dialogs = `
    <!-- Customize dashboard: show, hide and reorder the widgets. -->
    <dialog id="dashboard-customize-dialog" class="ss-dialog" aria-labelledby="dashboard-customize-title">
      <div class="ss-dialog-head">
        <h2 id="dashboard-customize-title">Customize dashboard</h2>
        <button class="btn ghost sm" type="button" data-customize-close>Close</button>
      </div>
      <div class="ss-dialog-body">
        <p class="ss-dialog-note">
          Show, hide and reorder the widgets on this dashboard. The layout is saved to your account only.
        </p>
        <ul class="widget-list" data-widget-list></ul>
        <p class="ss-message" data-customize-message role="status" aria-live="polite"></p>
      </div>
      <div class="ss-dialog-foot">
        <button class="btn primary sm" type="button" data-customize-apply>Save layout</button>
        <button class="btn secondary sm" type="button" data-customize-reset>Reset to defaults</button>
      </div>
    </dialog>

    <!-- Quick add: keyboard accessible transaction entry. -->
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
          Saving sends an idempotency key, so a retried submission cannot record the same transaction twice.
        </p>
        <p class="ss-message" data-quick-add-message role="status" aria-live="polite"></p>
      </form>
      <div class="ss-dialog-foot">
        <button class="btn primary sm" type="button" data-quick-add-submit>Save transaction</button>
        <button class="btn ghost sm" type="button" data-quick-add-close>Cancel</button>
      </div>
    </dialog>
`;

const anchor = '    <script src="../script.js"></script>';
if (!html.includes(anchor)) {
  throw new Error('script anchor not found');
}

html = html.replace(anchor, `${dialogs}\n${anchor}`);
fs.writeFileSync(target, html, 'utf8');
console.log('dashboard dialogs added');
