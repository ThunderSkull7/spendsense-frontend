'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'income-analysis', 'income-analysis.html');
const jsPath = path.join(root, 'income-analysis', 'income-analysis.js');

test('income-analysis.html structure and required DOM hooks', () => {
  assert.ok(fs.existsSync(htmlPath), 'income-analysis.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Title and meta
  assert.match(html, /<title>Income Analysis \| SpendSense<\/title>/);
  assert.match(html, /<meta name="api-base-url"/);

  // 4-group navigation hierarchy
  assert.match(html, /class="sidebar-group">Overview<\/p>/);
  assert.match(html, /class="sidebar-group">Money<\/p>/);
  assert.match(html, /class="sidebar-group">Insights<\/p>/);
  assert.match(html, /class="sidebar-group">Planning<\/p>/);
  assert.doesNotMatch(html, /<p class="sidebar-group">Account<\/p>/);

  // Sidebar link active on income-analysis.html
  assert.match(html, /class="sidebar-link active"[^>]*data-nav="insights-income"/);
  assert.match(html, /<a[^>]*class="sidebar-link"[^>]*data-nav="insights-trends"/);
  assert.doesNotMatch(html, /class="sidebar-link is-disabled"/);

  // Summary stats
  assert.match(html, /id="stat-actual-income"/);
  assert.match(html, /id="stat-income-change"/);
  assert.match(html, /id="stat-average-monthly"/);
  assert.match(html, /id="stat-variability-amount"/);

  // Guidance notice: Actual vs expected separation
  assert.match(html, /Actual vs\. Expected Income Separation/);
  assert.match(html, /never.*added to historical received income totals/i);

  // Filter toolbar
  assert.match(html, /id="income-preset"/);
  assert.match(html, /id="income-from-month"/);
  assert.match(html, /id="income-to-month"/);

  // Chart & sections
  assert.match(html, /id="income-chart-container"/);
  assert.match(html, /id="income-sources-table"/);
  assert.match(html, /id="income-sources-body"/);
  assert.match(html, /id="income-frequency-table"/);
  assert.match(html, /id="income-frequency-body"/);
});

test('income-analysis.js client contracts and financial integrity', () => {
  assert.ok(fs.existsSync(jsPath), 'income-analysis.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verified API endpoint
  assert.match(js, /API\.get\(`\/analytics\/income-analysis\?/);

  // Prohibited: mutating financial ledgers or adding expected to actual
  assert.doesNotMatch(js, /API\.post\(['"`]\/incomes/);
  assert.doesNotMatch(js, /API\.post\(['"`]\/expenses/);
  assert.doesNotMatch(js, /API\.delete/);

  // Global export
  assert.match(js, /window\.SpendSenseIncomeAnalysis\s*=/);
});
