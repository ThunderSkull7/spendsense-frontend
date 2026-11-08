/**
 * Tests for Recurring Bills & Bill Calendar Frontend Component
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

test('expenses.html has embedded recurring and calendar tabs removed per Batch 1', () => {
  const html = fs.readFileSync(path.join(rootDir, 'expense-management/expenses.html'), 'utf8');

  // Verify old sub-nav tabs removed
  assert.doesNotMatch(html, /id="tab-recurring-bills"/, 'Must not contain Recurring Bills tab');
  assert.doesNotMatch(html, /id="tab-bill-calendar"/, 'Must not contain Bill Calendar tab');
  assert.doesNotMatch(html, /id="view-recurring-bills"/, 'Must not contain view-recurring-bills panel');
  assert.doesNotMatch(html, /id="view-bill-calendar"/, 'Must not contain view-bill-calendar panel');

  // Verify Expense table remains
  assert.match(html, /id="view-all-expenses"/, 'Must contain view-all-expenses panel');
});

test('recurring-transactions.html contains standalone recurring bills view and modals', () => {
  const html = fs.readFileSync(path.join(rootDir, 'recurring-transactions/recurring-transactions.html'), 'utf8');

  // Verify Panels & Elements
  assert.match(html, /id="view-recurring-bills"/, 'Must contain view-recurring-bills panel');
  assert.match(html, /data-stat-monthly-commitment/, 'Must contain monthly commitment stat');
  assert.match(html, /data-stat-annual-commitment/, 'Must contain annual commitment stat');
  assert.match(html, /data-stat-active-commitments/, 'Must contain active schedules stat');
  assert.match(html, /data-stat-upcoming-bills/, 'Must contain due next 30 days stat');

  // Verify Modals
  assert.match(html, /id="recurring-modal"/, 'Must contain add/edit recurring modal');
  assert.match(html, /id="pay-bill-modal"/, 'Must contain pay bill modal');
  assert.match(html, /id="occurrences-modal"/, 'Must contain occurrences modal');

  // Verify Script Tag & Nav
  assert.match(html, /<script src="\.\.\/recurring-bills\.js"><\/script>/, 'Must load recurring-bills.js');
  assert.match(html, /data-nav="recurring"/, 'Must contain data-nav="recurring" in sidebar');
});

test('financial-calendar.html contains standalone calendar view and controls', () => {
  const html = fs.readFileSync(path.join(rootDir, 'financial-calendar/financial-calendar.html'), 'utf8');

  // Verify Calendar View & Controls
  assert.match(html, /id="view-bill-calendar"/, 'Must contain view-bill-calendar panel');
  assert.match(html, /id="calendar-month-heading"/, 'Must contain month heading');
  assert.match(html, /data-calendar-grid/, 'Must contain calendar grid');
  assert.match(html, /data-calendar-day-panel/, 'Must contain day panel');
  assert.match(html, /data-calendar-list-view/, 'Must contain calendar list view');

  // Verify Script Tag & Nav
  assert.match(html, /<script src="\.\.\/recurring-bills\.js"><\/script>/, 'Must load recurring-bills.js');
  assert.match(html, /data-nav="calendar"/, 'Must contain data-nav="calendar" in sidebar');
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
