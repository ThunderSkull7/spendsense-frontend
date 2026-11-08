'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'subscriptions', 'subscriptions.html');
const jsPath = path.join(root, 'subscriptions', 'subscriptions.js');

test('subscriptions.html structure and required DOM hooks', () => {
  assert.ok(fs.existsSync(htmlPath), 'subscriptions.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Page title and meta
  assert.match(html, /<title>Subscriptions \| SpendSense<\/title>/);
  assert.match(html, /<meta name="api-base-url"/);

  // Shell and 4-group navigation hierarchy
  assert.match(html, /class="sidebar-group">Overview<\/p>/);
  assert.match(html, /class="sidebar-group">Money<\/p>/);
  assert.match(html, /class="sidebar-group">Insights<\/p>/);
  assert.match(html, /class="sidebar-group">Planning<\/p>/);
  assert.match(html, /data-nav="subscriptions"/);
  assert.match(html, /class="sidebar-link active"[^>]*data-nav="subscriptions"/);
  assert.doesNotMatch(html, /class="sidebar-link is-disabled"/);

  // Summary stats
  assert.match(html, /id="stat-active-count"/);
  assert.match(html, /id="stat-monthly-cost"/);
  assert.match(html, /id="stat-annual-cost"/);
  assert.match(html, /id="stat-due-soon-count"/);

  // Filter toolbar
  assert.match(html, /id="subscription-search"/);
  assert.match(html, /id="subscription-status-filter"/);
  assert.match(html, /id="subscription-link-filter"/);
  assert.match(html, /id="subscription-clear-filters"/);

  // Core containers
  assert.match(html, /id="view-subscriptions"/);
  assert.match(html, /id="subscriptions-state-container"/);
  assert.match(html, /id="subscriptions-table-wrap"/);
  assert.match(html, /id="subscriptions-table-body"/);
  assert.match(html, /id="upcoming-renewals-body"/);

  // Modal and form
  assert.match(html, /id="subscription-modal"/);
  assert.match(html, /id="subscription-form"/);
  assert.match(html, /id="sub-name"/);
  assert.match(html, /id="sub-provider"/);
  assert.match(html, /id="sub-amount"/);
  assert.match(html, /id="sub-frequency"/);
  assert.match(html, /id="sub-renewal-date"/);
  assert.match(html, /id="sub-recurring-expense-id"/);
  assert.match(html, /id="sub-category-id"/);
  assert.match(html, /id="sub-status"/);
  assert.match(html, /id="sub-notes"/);
  assert.match(html, /id="sub-form-error"/);
});

test('subscriptions.js client contracts and financial integrity', () => {
  assert.ok(fs.existsSync(jsPath), 'subscriptions.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verified API endpoints used
  assert.match(js, /API\.get\(`\/subscriptions/);
  assert.match(js, /API\.post\('\/subscriptions', payload\)/);
  assert.match(js, /API\.put\(`\/subscriptions\/\${/);
  assert.match(js, /API\.get\('\/categories'\)/);
  assert.match(js, /API\.get\('\/recurring-expenses'\)/);

  // Strictly prohibited: creating or modifying expenses table records
  assert.doesNotMatch(js, /API\.post\('\/expenses'/, 'Subscriptions must never create expense records');
  assert.doesNotMatch(js, /API\.post\('\/incomes'/, 'Subscriptions must never create income records');
  assert.doesNotMatch(js, /API\.delete\('\/subscriptions/, 'DELETE /subscriptions is unsupported');
  assert.doesNotMatch(js, /API\.(put|delete|patch)\(['"`]\/recurring-expenses/i, 'Linked recurring expense schedules must never be altered or deleted');

  // Payload shape distinction: linked vs standalone
  assert.match(js, /isLinked/, 'Must bifurcate linked vs standalone payloads');
  assert.match(js, /payload\.recurring_expense_id\s*=\s*Number\(/, 'Linked payload must supply recurring_expense_id');

  // Status transitions
  assert.match(js, /status:\s*targetStatus/, 'Must support status transitions');
  assert.match(js, /UI\.showToast/, 'Must surface user notifications on errors and successes');

  // Exports SpendSenseSubscriptions globally
  assert.match(js, /window\.SpendSenseSubscriptions\s*=/);
});

