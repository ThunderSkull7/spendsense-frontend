// Regression tests for the bills/calendar page helpers and frontend contract.
// Run with: node --test tests/recurring-expenses.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BILLS_JS = path.join(__dirname, '..', 'recurring-expenses', 'recurring-expenses.js');
const BILLS_HTML = path.join(__dirname, '..', 'recurring-expenses', 'recurring-expenses.html');
const BILLS_CSS = path.join(__dirname, '..', 'recurring-expenses', 'recurring-expenses.css');
const NOTIFICATIONS_JS = path.join(__dirname, '..', 'notifications', 'notifications.js');
const NOTIFICATIONS_HTML = path.join(__dirname, '..', 'notifications', 'notifications.html');

function loadHelpers() {
  const context = {
    console,
    URLSearchParams,
    document: {
      addEventListener() {},
      querySelector() { return null; },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(BILLS_JS, 'utf8'), context, {
    filename: 'recurring-expenses.js',
  });
  return context.SpendSenseBills;
}

test('frequency and bill status labels are human readable', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.frequencyLabel('biweekly'), 'Biweekly');
  assert.equal(helpers.frequencyLabel('half-yearly'), 'Half-yearly');
  assert.equal(helpers.statusLabel('planned'), 'Planned');
  assert.equal(helpers.statusLabel('overdue'), 'Overdue');
  assert.equal(helpers.statusLabel('cancelled'), 'Cancelled');
});

test('status tones distinguish overdue, due, paid and cancelled bills', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.statusTone('overdue'), 'danger');
  assert.equal(helpers.statusTone('due'), 'amber');
  assert.equal(helpers.statusTone('upcoming'), 'blue');
  assert.equal(helpers.statusTone('paid'), 'green');
  assert.equal(helpers.statusTone('skipped'), 'neutral');
  assert.equal(helpers.statusTone('cancelled'), 'neutral');
  assert.equal(helpers.statusTone('unknown'), 'neutral');
});

test('month labels and navigation work across year boundaries', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.monthLabel('2026-10'), 'October 2026');
  assert.equal(helpers.monthLabel('2027-01'), 'January 2027');
  assert.equal(helpers.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(helpers.shiftMonth('2027-01', -1), '2026-12');
  assert.equal(helpers.shiftMonth('2026-03', -3), '2025-12');
  assert.equal(helpers.shiftMonth('not-a-month', 1), 'not-a-month');
  assert.equal(helpers.validMonth('2026-02'), true);
  assert.equal(helpers.validMonth('2026-13'), false);
});

test('calendar cells start on Monday and attach bills to the correct dates', () => {
  const helpers = loadHelpers();
  const entries = [
    { id: 1, occurrence_date: '2026-10-01' },
    { id: 2, occurrence_date: '2026-10-31' },
  ];
  const cells = helpers.buildMonthCells('2026-10', entries);

  assert.equal(cells.length, 35);
  assert.equal(cells[0].outside, true);
  assert.equal(cells[3].date, '2026-10-01');
  assert.equal(cells[3].day, 1);
  assert.equal(cells[3].entries.length, 1);
  assert.equal(cells[33].date, '2026-10-31');
  assert.equal(cells[33].entries[0].id, 2);
  assert.equal(cells[34].outside, true);
});

test('calendar cells handle a leap February and a month starting on Sunday', () => {
  const helpers = loadHelpers();
  const leap = helpers.buildMonthCells('2028-02', [
    { id: 9, occurrence_date: '2028-02-29' },
  ]);

  assert.equal(leap.length, 35);
  assert.equal(leap[1].date, '2028-02-01');
  assert.equal(leap[29].date, '2028-02-29');
  assert.equal(leap[29].entries[0].id, 9);
  assert.equal(leap.filter((cell) => cell.outside).length, 6);

  const sundayStart = helpers.buildMonthCells('2026-02', []);
  assert.equal(sundayStart[6].date, '2026-02-01');
  assert.equal(sundayStart.filter((cell) => cell.outside).length, 7);
});

test('entries are grouped by date without losing duplicate-day bills', () => {
  const helpers = loadHelpers();
  const grouped = helpers.groupEntriesByDate([
    { id: 1, occurrence_date: '2026-10-15' },
    { id: 2, occurrence_date: '2026-10-15' },
    { id: 3, occurrence_date: '2026-10-16' },
    { id: 4 },
  ]);

  assert.equal(Object.keys(grouped).length, 2);
  assert.equal(grouped['2026-10-15'].length, 2);
  assert.equal(grouped['2026-10-16'][0].id, 3);
});

test('calendar query keeps month, status and category filters and omits blanks', () => {
  const helpers = loadHelpers();
  assert.equal(
    helpers.buildCalendarQuery({ month: '2026-10', status: 'overdue', categoryId: '4' }),
    '?month=2026-10&status=overdue&category_id=4'
  );
  assert.equal(helpers.buildCalendarQuery({ month: '2026-10' }), '?month=2026-10');
  assert.equal(helpers.buildCalendarQuery({}), '');
});

test('bills page contains accessible form, filter and calendar controls', () => {
  const html = fs.readFileSync(BILLS_HTML, 'utf8');
  const css = fs.readFileSync(BILLS_CSS, 'utf8');

  for (const required of [
    'id="bill-description"',
    'id="bill-amount"',
    'id="bill-category"',
    'id="bill-frequency"',
    'id="bill-start"',
    'id="bill-end"',
    'id="bill-reminder-days"',
    'data-status-filter',
    'data-category-filter',
    'data-calendar-grid',
    'data-calendar-list',
    'data-selected-bill',
    'data-overdue-list',
    'data-upcoming-list',
    'aria-live="polite"',
    'aria-label="Previous month"',
    'aria-label="Next month"',
  ]) {
    assert.ok(html.includes(required), `missing ${required}`);
  }

  assert.ok(css.includes('@media (max-width: 900px)'));
  assert.ok(css.includes('.calendar-mobile-list'));
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('bills and notification scripts reference the intended owner-scoped APIs', () => {
  const bills = fs.readFileSync(BILLS_JS, 'utf8');
  const notifications = fs.readFileSync(NOTIFICATIONS_JS, 'utf8');
  const notificationsHtml = fs.readFileSync(NOTIFICATIONS_HTML, 'utf8');

  for (const endpoint of [
    "API.get('/recurring-expenses')",
    "API.get(`/recurring-expenses/calendar${query}`)",
    "API.get(`/recurring-expenses/${scheduleId}`)",
    "API.post('/recurring-expenses/preview'",
    "API.post('/recurring-expenses', payload",
    "API.put(`/recurring-expenses/${state.editingId}`",
    "/occurrences/${entry.id}/pay",
    "/occurrences/${entry.id}/skip",
    "/occurrences/${entry.id}/unpaid",
    "Idempotency-Key",
  ]) {
    assert.ok(bills.includes(endpoint), `bills script missing ${endpoint}`);
  }

  for (const endpoint of [
    "API.get(`\/api\/notifications?",
    "API.post(`\/api\/notifications\/",
    "API.post('/api\/notifications\/read-all",
  ]) {
    assert.ok(notifications.includes(endpoint), `notification script missing ${endpoint}`);
  }

  assert.ok(notificationsHtml.includes('data-notification-list'));
  assert.ok(notificationsHtml.includes('Mark all read'));
  assert.ok(notificationsHtml.includes('Filter notifications'));
});
