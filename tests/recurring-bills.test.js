/**
 * Tests for Recurring Bills & Bill Calendar Frontend Component
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

test('expenses.html structure contains sub-nav tabs, recurring bills view, and calendar view', () => {
  const html = fs.readFileSync(path.join(rootDir, 'expense-management/expenses.html'), 'utf8');

  // Verify Sub-Nav Tabs
  assert.match(html, /id="tab-all-expenses"/, 'Must contain All Expenses tab');
  assert.match(html, /id="tab-recurring-bills"/, 'Must contain Recurring Bills tab');
  assert.match(html, /id="tab-bill-calendar"/, 'Must contain Bill Calendar tab');

  // Verify Tab Panels
  assert.match(html, /id="view-all-expenses"/, 'Must contain view-all-expenses panel');
  assert.match(html, /id="view-recurring-bills"/, 'Must contain view-recurring-bills panel');
  assert.match(html, /id="view-bill-calendar"/, 'Must contain view-bill-calendar panel');

  // Verify Modals
  assert.match(html, /id="recurring-modal"/, 'Must contain add/edit recurring modal');
  assert.match(html, /id="pay-bill-modal"/, 'Must contain pay bill modal');
  assert.match(html, /id="occurrences-modal"/, 'Must contain occurrences modal');

  // Verify Script Tag
  assert.match(html, /<script src="\.\.\/recurring-bills\.js"><\/script>/, 'Must load recurring-bills.js');

  // Verify 14-page compliance (no data-nav="bills" or "goals")
  assert.doesNotMatch(html, /data-nav="bills"/, 'Must NOT contain data-nav="bills" in sidebar');
  assert.doesNotMatch(html, /data-nav="goals"/, 'Must NOT contain data-nav="goals" in sidebar');
});

test('recurring-bills.js exports SpendSenseRecurringBills component', () => {
  const code = fs.readFileSync(path.join(rootDir, 'recurring-bills.js'), 'utf8');

  assert.match(code, /window\.SpendSenseRecurringBills = SpendSenseRecurringBills/, 'Must export SpendSenseRecurringBills');
  assert.match(code, /switchTab/, 'Must implement switchTab');
  assert.match(code, /loadSchedules/, 'Must implement loadSchedules');
  assert.match(code, /loadCalendar/, 'Must implement loadCalendar');
  assert.match(code, /triggerPreview/, 'Must implement live triggerPreview');
  assert.match(code, /openPayModal/, 'Must implement openPayModal');
});

test('styles.css contains calendar and sub-navigation styling tokens', () => {
  const css = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');

  assert.match(css, /\.sub-nav-tabs/, 'Must style .sub-nav-tabs');
  assert.match(css, /\.sub-nav-tab\.active/, 'Must style active tab');
  assert.match(css, /\.calendar-grid/, 'Must style .calendar-grid');
  assert.match(css, /\.calendar-day/, 'Must style .calendar-day');
  assert.match(css, /\.calendar-bill-pill/, 'Must style .calendar-bill-pill');
  assert.match(css, /\.calendar-day-panel/, 'Must style .calendar-day-panel');
});

test('dashboard.html contains upcoming bills card and dashboard.js renders it', () => {
  const html = fs.readFileSync(path.join(rootDir, 'dashboard/dashboard.html'), 'utf8');
  const js = fs.readFileSync(path.join(rootDir, 'dashboard/dashboard.js'), 'utf8');

  assert.match(html, /data-upcoming-bills/, 'dashboard.html must contain data-upcoming-bills');
  assert.match(js, /renderUpcomingBills/, 'dashboard.js must implement renderUpcomingBills');
  assert.match(js, /\/recurring-expenses\/calendar/, 'dashboard.js must fetch /recurring-expenses/calendar');
});

test('notifications.js wires to /api/bill-reminders', () => {
  const notifJs = fs.readFileSync(path.join(rootDir, 'notifications/notifications.js'), 'utf8');

  assert.match(notifJs, /\/bill-reminders/, 'notifications.js must call /bill-reminders');
  assert.match(notifJs, /\/bill-reminders\/read-all/, 'notifications.js must support read-all');
});

