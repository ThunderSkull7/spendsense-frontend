'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'spending-trends', 'spending-trends.html');
const jsPath = path.join(root, 'spending-trends', 'spending-trends.js');

test('spending-trends.html structure and required DOM hooks', () => {
  assert.ok(fs.existsSync(htmlPath), 'spending-trends.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Title and meta
  assert.match(html, /<title>Spending Trends \| SpendSense<\/title>/);
  assert.match(html, /<meta name="api-base-url"/);

  // 4-group navigation hierarchy
  assert.match(html, /class="sidebar-group">Overview<\/p>/);
  assert.match(html, /class="sidebar-group">Money<\/p>/);
  assert.match(html, /class="sidebar-group">Insights<\/p>/);
  assert.match(html, /class="sidebar-group">Planning<\/p>/);
  assert.doesNotMatch(html, /<p class="sidebar-group">Account<\/p>/);

  // Sidebar link active on spending-trends.html
  assert.match(html, /class="sidebar-link active"[^>]*data-nav="insights-trends"/);
  assert.match(html, /<a[^>]*class="sidebar-link"[^>]*data-nav="insights-income"/);
  assert.doesNotMatch(html, /class="sidebar-link is-disabled"/);

  // Filter toolbar
  assert.match(html, /id="trends-granularity"/);
  assert.match(html, /id="trends-preset"/);
  assert.match(html, /id="trends-from-date"/);
  assert.match(html, /id="trends-to-date"/);

  // Summary stats
  assert.match(html, /id="stat-expenses-amount"/);
  assert.match(html, /id="stat-comparison-change"/);
  assert.match(html, /id="stat-average-expense"/);
  assert.match(html, /id="stat-anomaly-count"/);

  // Chart & sections
  assert.match(html, /id="trends-chart-container"/);
  assert.match(html, /id="trends-category-table"/);
  assert.match(html, /id="trends-category-body"/);
  assert.match(html, /id="trends-anomalies-body"/);
  assert.match(html, /id="trends-largest-body"/);
  assert.match(html, /Large-expense review flags amounts above three times|These are indicators for user review/);
});

test('spending-trends.js client contracts and financial integrity', () => {
  assert.ok(fs.existsSync(jsPath), 'spending-trends.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verified API endpoint
  assert.match(js, /API\.get\(`\/analytics\/spending-trends\?/);

  // Granularities supported
  assert.match(js, /granularity/);
  assert.match(js, /'day'/);
  assert.match(js, /'week'/);

  // Prohibited: mutating financial ledgers from analytics
  assert.doesNotMatch(js, /API\.post\(['"`]\/expenses/);
  assert.doesNotMatch(js, /API\.post\(['"`]\/incomes/);
  assert.doesNotMatch(js, /API\.delete/);

  // Global export
  assert.match(js, /window\.SpendSenseSpendingTrends\s*=/);
});
