'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'net-worth', 'net-worth.html');
const jsPath = path.join(root, 'net-worth', 'net-worth.js');

test('net-worth.html structure and required DOM hooks', () => {
  assert.ok(fs.existsSync(htmlPath), 'net-worth.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Page title and meta
  assert.match(html, /<title>Net Worth \| SpendSense<\/title>/);
  assert.match(html, /<meta name="api-base-url"/);

  // Shell and 4-group navigation hierarchy
  assert.match(html, /class="sidebar-group">Overview<\/p>/);
  assert.match(html, /class="sidebar-group">Money<\/p>/);
  assert.match(html, /class="sidebar-group">Insights<\/p>/);
  assert.match(html, /class="sidebar-group">Planning<\/p>/);
  assert.doesNotMatch(html, /<p class="sidebar-group">Account<\/p>/, 'Sidebar must not contain Account group');

  assert.match(html, /class="sidebar-link active"[^>]*data-nav="net-worth"/);
  assert.match(html, /<a[^>]*class="sidebar-link"[^>]*data-nav="subscriptions"/);
  assert.doesNotMatch(html, /class="sidebar-link is-disabled"/);

  // Core summary stat cards
  assert.match(html, /id="stat-net-worth"/);
  assert.match(html, /id="stat-total-assets"/);
  assert.match(html, /id="stat-total-liabilities"/);
  assert.match(html, /id="stat-active-count"/);

  // Guidance cards for Debts & Loans and Manual Estimates
  assert.match(html, /Debts &amp; Loans Integration/);
  assert.match(html, /Manual Valuations &amp; Bank Disclaimers/);

  // Historical trend section
  assert.match(html, /id="trend-container"/);
  assert.match(html, /id="trend-months-select"/);
  assert.match(html, /id="trend-chart-wrap"/);

  // Filter toolbar
  assert.match(html, /id="net-worth-search"/);
  assert.match(html, /id="net-worth-type-filter"/);
  assert.match(html, /id="net-worth-category-filter"/);
  assert.match(html, /id="net-worth-status-filter"/);
  assert.match(html, /id="net-worth-clear-filters"/);

  // Dual tables for Assets and Liabilities
  assert.match(html, /id="assets-table"/);
  assert.match(html, /id="assets-table-body"/);
  assert.match(html, /id="liabilities-table"/);
  assert.match(html, /id="liabilities-table-body"/);

  // Create / Edit modal
  assert.match(html, /id="net-worth-modal"/);
  assert.match(html, /id="entry-name"/);
  assert.match(html, /id="entry-category"/);
  assert.match(html, /id="entry-value"/);
  assert.match(html, /id="entry-valuation-date"/);

  // Valuation snapshot modal
  assert.match(html, /id="valuation-modal"/);
  assert.match(html, /id="val-amount"/);
  assert.match(html, /id="val-date"/);

  // History modal
  assert.match(html, /id="history-modal"/);
  assert.match(html, /id="history-table-body"/);
});

test('net-worth.js client contracts and financial integrity', () => {
  assert.ok(fs.existsSync(jsPath), 'net-worth.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verified API endpoints used
  assert.match(js, /API\.get\(`\/net-worth\?status=/);
  assert.match(js, /API\.get\(`\/net-worth\/trend\?months=/);
  assert.match(js, /API\.post\('\/net-worth', payload\)/);
  assert.match(js, /API\.post\(`\/net-worth\/\${this\.valuationTarget\.id}\/valuations`, payload\)/);
  assert.match(js, /API\.post\(`\/net-worth\/\${entry\.id}\/archive`\)/);
  assert.match(js, /API\.post\(`\/net-worth\/\${entry\.id}\/restore`\)/);
  assert.match(js, /API\.put\(`\/net-worth\/\${this\.editingId}`, payload\)/);
  assert.match(js, /API\.get\(`\/net-worth\/\${entry\.id}`\)/);

  // Prohibited: DELETE endpoints are completely absent from backend
  assert.doesNotMatch(js, /API\.delete\(/, 'Net Worth backend has no DELETE routes');

  // Prohibited: Writing to expense or income transaction tables
  assert.doesNotMatch(js, /API\.post\(['"`]\/expenses/, 'Net Worth must never write to expenses table');
  assert.doesNotMatch(js, /API\.post\(['"`]\/incomes/, 'Net Worth must never write to incomes table');

  // Proper category constants
  assert.match(js, /value:\s*'cash'/);
  assert.match(js, /value:\s*'investment'/);
  assert.match(js, /value:\s*'other_asset'/);
  assert.match(js, /value:\s*'loan'/);
  assert.match(js, /value:\s*'other_liability'/);

  // Global export
  assert.match(js, /window\.SpendSenseNetWorth\s*=/);
});

