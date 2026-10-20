// Regression tests for the recurring-income page helpers.
// Run with: node --test tests/recurring-income.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RECURRING_JS = path.join(__dirname, '..', 'income-management', 'recurring-income.js');

function loadHelpers() {
  const context = {
    console,
    document: {
      addEventListener() {},
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(RECURRING_JS, 'utf8'), context, {
    filename: 'recurring-income.js',
  });
  return context.SpendSenseRecurring;
}

test('frequency and status labels are human readable', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.frequencyLabel('biweekly'), 'Biweekly');
  assert.equal(helpers.frequencyLabel('half-yearly'), 'Half-yearly');
  assert.equal(helpers.scheduleStatusLabel('paused'), 'Paused');
  assert.equal(helpers.occurrenceStatusLabel('overdue'), 'Overdue');
});

test('status tones distinguish received, planned and cancelled states', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.statusTone('received'), 'green');
  assert.equal(helpers.statusTone('planned'), 'blue');
  assert.equal(helpers.statusTone('overdue'), 'amber');
  assert.equal(helpers.statusTone('cancelled'), 'neutral');
  assert.equal(helpers.statusTone('unknown'), 'neutral');
});

test('month defaults clamp month-end dates instead of rolling into the next month', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.addMonthsInput('2026-01-31', 1), '2026-02-28');
  assert.equal(helpers.addMonthsInput('2028-01-31', 1), '2028-02-29');
  assert.equal(helpers.addMonthsInput('2026-11-30', 3), '2027-02-28');
  assert.equal(helpers.addMonthsInput('2026-10-19', 3), '2027-01-19');
});

test('invalid date input does not produce a shifted calendar date', () => {
  const helpers = loadHelpers();
  assert.equal(helpers.addMonthsInput('', 3), '');
  assert.equal(helpers.addMonthsInput('2026-10', 3), '');
});

test('next-due copy distinguishes active, paused and stopped plans', () => {
  const helpers = loadHelpers();
  const format = (value) => `formatted:${value}`;
  assert.equal(
    helpers.scheduleNextLabel({ status: 'active', next_due_date: '2026-11-01' }, format),
    'Next due formatted:2026-11-01'
  );
  assert.equal(
    helpers.scheduleNextLabel({ status: 'paused', next_due_date: '2026-11-01' }, format),
    'Paused — next planned formatted:2026-11-01'
  );
  assert.equal(
    helpers.scheduleNextLabel({ status: 'paused', next_due_date: null }, format),
    'Paused — no upcoming dates'
  );
  assert.equal(
    helpers.scheduleNextLabel({ status: 'stopped', next_due_date: '2026-11-01' }, format),
    'Stopped — future dates cancelled'
  );
});
