'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'budget-performance', 'budget-performance.html');
const jsPath = path.join(root, 'budget-performance', 'budget-performance.js');

test('budget-performance.html structure and required DOM hooks', () => {
  assert.ok(fs.existsSync(htmlPath), 'budget-performance.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Title and meta
  assert.match(html, /<title>Budget Performance \| SpendSense<\/title>/);
  assert.match(html, /<meta name="api-base-url"/);

  // 4-group navigation hierarchy
  assert.match(html, /class="sidebar-group">Overview<\/p>/);
  assert.match(html, /class="sidebar-group">Money<\/p>/);
  assert.match(html, /class="sidebar-group">Insights<\/p>/);
  assert.match(html, /class="sidebar-group">Planning<\/p>/);
  assert.doesNotMatch(html, /<p class="sidebar-group">Account<\/p>/);

  // Sidebar link active on budget-performance.html
  assert.match(html, /class="sidebar-link active"[^>]*data-nav="insights-budgets"/);
  assert.match(html, /<a[^>]*class="sidebar-link"[^>]*data-nav="forecast"/);
  assert.doesNotMatch(html, /class="sidebar-link is-disabled"/);

  // Filter toolbar
  assert.match(html, /id="budget-preset"/);
  assert.match(html, /id="budget-from-month"/);
  assert.match(html, /id="budget-to-month"/);
  assert.match(html, /id="budget-status-filter"/);

  // Summary stats
  assert.match(html, /id="stat-budget-limit"/);
  assert.match(html, /id="stat-budget-spent"/);
  assert.match(html, /id="stat-budget-utilization"/);
  assert.match(html, /id="stat-overspent-count"/);

  // Chart, tables & panels
  assert.match(html, /id="budget-chart-container"/);
  assert.match(html, /id="budget-items-table"/);
  assert.match(html, /id="budget-items-body"/);
  assert.match(html, /id="repeated-overspending-body"/);
  assert.match(html, /id="threshold-alerts-body"/);

  // Financial integrity & authoritative notice
  assert.match(html, /Financial Integrity &amp; Authoritative Computation Rules/);
  assert.match(html, /Only expenses in categories that have a budget for the same calendar month are included/);
  assert.match(html, /Budget performance is strictly an analytical view/);
});

test('budget-performance.js client contracts and financial integrity', () => {
  assert.ok(fs.existsSync(jsPath), 'budget-performance.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verified API endpoint
  assert.match(js, /\/analytics\/budget-performance/);
  assert.match(js, /API\.get\(/);

  // Prohibited: mutating budgets or expenses from analytics view
  assert.doesNotMatch(js, /API\.post\(['"`]\/budgets/);
  assert.doesNotMatch(js, /API\.post\(['"`]\/expenses/);
  assert.doesNotMatch(js, /API\.delete/);

  // Global export
  assert.match(js, /window\.SpendSenseBudgetPerformance\s*=/);
});

