'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'cash-flow-forecast', 'cash-flow-forecast.html');
const jsPath = path.join(root, 'cash-flow-forecast', 'cash-flow-forecast.js');

test('cash-flow-forecast.html structure and required DOM hooks', () => {
  assert.ok(fs.existsSync(htmlPath), 'cash-flow-forecast.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Title and meta
  assert.match(html, /<title>Cash Flow Forecast \| SpendSense<\/title>/);
  assert.match(html, /<meta name="api-base-url"/);

  // 4-group navigation hierarchy
  assert.match(html, /class="sidebar-group">Overview<\/p>/);
  assert.match(html, /class="sidebar-group">Money<\/p>/);
  assert.match(html, /class="sidebar-group">Insights<\/p>/);
  assert.match(html, /class="sidebar-group">Planning<\/p>/);
  assert.doesNotMatch(html, /<p class="sidebar-group">Account<\/p>/);

  // Sidebar link active on cash-flow-forecast.html
  assert.match(html, /class="sidebar-link active"[^>]*data-nav="forecast"/);
  assert.match(html, /<a[^>]*class="sidebar-link"[^>]*data-nav="insights-budgets"/);
  assert.doesNotMatch(html, /class="sidebar-link is-disabled"/);

  // Filter toolbar
  assert.match(html, /id="forecast-horizon"/);
  assert.match(html, /id="forecast-as-of-date"/);
  assert.match(html, /id="forecast-event-filter"/);

  // Financial integrity: Starting balance notice
  assert.match(html, /id="forecast-integrity-banner"/);
  assert.match(html, /Transparent Schedule-Based Projection/);
  assert.match(html, /does not maintain a verified liquid bank account balance/);

  // Overdue banner
  assert.match(html, /id="forecast-overdue-banner"/);

  // Summary stats
  assert.match(html, /id="stat-expected-income"/);
  assert.match(html, /id="stat-expected-expenses"/);
  assert.match(html, /id="stat-projected-net"/);
  assert.match(html, /id="stat-horizon-days"/);

  // Sections & tables
  assert.match(html, /id="forecast-monthly-grid"/);
  assert.match(html, /id="forecast-events-table"/);
  assert.match(html, /id="forecast-events-body"/);
  assert.match(html, /id="context-income-schedules"/);
  assert.match(html, /id="context-expense-schedules"/);
  assert.match(html, /id="context-subscriptions-cost"/);
  assert.match(html, /id="context-historical-income"/);
  assert.match(html, /id="context-historical-expenses"/);
});

test('cash-flow-forecast.js client contracts and financial integrity', () => {
  assert.ok(fs.existsSync(jsPath), 'cash-flow-forecast.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verified API endpoint
  assert.match(js, /\/analytics\/cash-flow-forecast/);
  assert.match(js, /API\.get\(/);

  // Prohibited: mutating financial ledgers from forecast view
  assert.doesNotMatch(js, /API\.post\(['"`]\/expenses/);
  assert.doesNotMatch(js, /API\.post\(['"`]\/incomes/);
  assert.doesNotMatch(js, /API\.delete/);

  // Global export
  assert.match(js, /window\.SpendSenseCashFlowForecast\s*=/);
});

