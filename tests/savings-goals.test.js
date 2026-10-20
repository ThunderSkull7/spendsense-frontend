// Regression tests for savings goals, configurable budget alerts and the
// notification/UI contracts. Run with: node --test tests/savings-goals.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GOALS_JS = path.join(__dirname, '..', 'savings-goals', 'savings-goals.js');
const GOALS_HTML = path.join(__dirname, '..', 'savings-goals', 'savings-goals.html');
const GOALS_CSS = path.join(__dirname, '..', 'savings-goals', 'savings-goals.css');
const BUDGET_JS = path.join(__dirname, '..', 'budget-planning', 'budget.js');
const BUDGET_HTML = path.join(__dirname, '..', 'budget-planning', 'budget.html');
const NOTIFICATIONS_JS = path.join(__dirname, '..', 'notifications', 'notifications.js');
const NOTIFICATIONS_HTML = path.join(__dirname, '..', 'notifications', 'notifications.html');

function loadScript(file, contextExtras = {}) {
  const context = {
    console,
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    ...contextExtras,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: path.basename(file) });
  return context;
}

test('goal progress helpers round safely and cap the visual bar', () => {
  const { SpendSenseGoals } = loadScript(GOALS_JS);
  assert.equal(SpendSenseGoals.progressPercent(50, 200), 25);
  assert.equal(SpendSenseGoals.progressPercent(1, 3), 33.33);
  assert.equal(SpendSenseGoals.progressPercent(250, 200), 125);
  assert.equal(SpendSenseGoals.progressBarPercent(250, 200), 100);
  assert.equal(SpendSenseGoals.progressPercent(10, 0), 0);
});

test('goal status and ledger labels are human readable', () => {
  const { SpendSenseGoals } = loadScript(GOALS_JS);
  assert.equal(SpendSenseGoals.goalStatusLabel('active'), 'Active');
  assert.equal(SpendSenseGoals.goalStatusLabel('completed'), 'Completed');
  assert.equal(SpendSenseGoals.goalStatusLabel('archived'), 'Archived');
  assert.equal(SpendSenseGoals.goalStatusTone('completed'), 'green');
  assert.equal(SpendSenseGoals.entryLabel('contribution'), 'Contribution');
  assert.equal(SpendSenseGoals.entryLabel('correction'), 'Correction');
  assert.equal(SpendSenseGoals.isArchived({ status: 'archived' }), true);
});

test('budget threshold helpers validate, sort and identify the highest crossing', () => {
  const { SpendSenseBudgetAlerts } = loadScript(BUDGET_JS);
  assert.deepEqual([...SpendSenseBudgetAlerts.parseThresholds('80, 50, 100')], [50, 80, 100]);
  assert.deepEqual([...SpendSenseBudgetAlerts.parseThresholds([75, 25])], [25, 75]);
  assert.deepEqual([...SpendSenseBudgetAlerts.parseThresholds('')], [50, 80, 100]);
  assert.equal(SpendSenseBudgetAlerts.parseThresholds('0, 50'), null);
  assert.equal(SpendSenseBudgetAlerts.parseThresholds('50, 50'), null);
  assert.equal(SpendSenseBudgetAlerts.parseThresholds('50, 60, 70, 80, 90, 100'), null);
  assert.equal(SpendSenseBudgetAlerts.highestCrossedThreshold(85, [50, 80, 100]), 80);
  assert.equal(SpendSenseBudgetAlerts.highestCrossedThreshold(120, [50, 80, 100]), 100);
  assert.equal(SpendSenseBudgetAlerts.highestCrossedThreshold(40, [50, 80, 100]), null);
  assert.equal(SpendSenseBudgetAlerts.alertTone(100, 100), 'danger');
  assert.equal(SpendSenseBudgetAlerts.alertTone(80, 85), 'amber');
  assert.equal(SpendSenseBudgetAlerts.alertTone(50, 55), 'blue');
  assert.equal(SpendSenseBudgetAlerts.formatThresholdList([50, 80, 100]), '50%, 80%, 100%');
});

test('savings goal page exposes forms, filters, history and accessible controls', () => {
  const html = fs.readFileSync(GOALS_HTML, 'utf8');
  const css = fs.readFileSync(GOALS_CSS, 'utf8');

  for (const required of [
    'data-nav="goals"',
    'data-goals-list',
    'data-goals-state',
    'data-goal-filter="all"',
    'data-goal-filter="archived"',
    'data-goal-summary-active',
    'data-goal-summary-saved',
    'id="goal-name"',
    'id="goal-target"',
    'id="goal-date"',
    'id="goal-description"',
    'id="goal-notes"',
    'data-goal-message',
    'aria-live="polite"',
    'Manual progress tracking',
  ]) {
    assert.ok(html.includes(required), `goals page missing ${required}`);
  }

  assert.ok(css.includes('@media (max-width: 900px)'));
  assert.ok(css.includes('@media (max-width: 560px)'));
  assert.ok(css.includes('goal-history'));
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('savings goal script uses owner-scoped APIs and idempotent contributions', () => {
  const script = fs.readFileSync(GOALS_JS, 'utf8');

  for (const required of [
    "API.get('/savings-goals')",
    "API.post('/savings-goals'",
    "`/savings-goals/${state.editingId}`",
    "`/savings-goals/${goal.id}/archive`",
    "`/savings-goals/${goal.id}/restore`",
    "`/savings-goals/${goalId}/contributions`",
    "`/savings-goals/${goalId}/corrections`",
    "Idempotency-Key",
    "Could not load savings goals.",
    "This records money you set aside. It does not create an expense or income transaction.",
    "goal-entry-message",
    "progressbar",
  ]) {
    assert.ok(script.includes(required), `goals script missing ${required}`);
  }

  assert.ok(!script.includes('/expenses'), 'savings goals must not create expenses');
  assert.ok(!script.includes('/incomes'), 'savings goals must not create incomes');
});

test('budget page exposes configurable thresholds and uses the alert helpers', () => {
  const html = fs.readFileSync(BUDGET_HTML, 'utf8');
  const script = fs.readFileSync(BUDGET_JS, 'utf8');

  assert.ok(html.includes('id="alert-thresholds"'));
  assert.ok(html.includes('name="alert_thresholds"'));
  assert.ok(html.includes('50, 80, 100'));
  assert.ok(html.includes('unique percentages'));
  assert.ok(script.includes('alert_thresholds: thresholds'));
  assert.ok(script.includes('budget-alert-line'));
  assert.ok(script.includes('highestThreshold') && script.includes('% alert'));
  assert.ok(script.includes('Enter 1–5 unique alert thresholds'));
});

test('unified notification center renders bill reminders and budget alerts', () => {
  const html = fs.readFileSync(NOTIFICATIONS_HTML, 'utf8');
  const script = fs.readFileSync(NOTIFICATIONS_JS, 'utf8');

  assert.ok(html.includes('Notifications'));
  assert.ok(html.includes('data-notification-list'));
  assert.ok(html.includes('data-notification-list'));
  assert.ok(html.includes('Filter notifications'));
  assert.ok(html.includes('Mark all read'));

  for (const endpoint of [
    "API.get(`/api/notifications?",
    "API.post(`/api/notifications/",
    "API.post('/api/notifications/read-all",
  ]) {
    assert.ok(script.includes(endpoint), `notification script missing ${endpoint}`);
  }

  assert.ok(script.includes('notification-item'));
  assert.ok(script.includes('notification-type'));
  assert.ok(script.includes('Could not load notifications.'));
  assert.ok(script.includes('notificationIcon'));
});
