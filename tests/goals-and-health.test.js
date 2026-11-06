'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('budget.html structure contains sub-nav tabs, goals panel, debt panel, and modals', () => {
  const html = read('budget-planning/budget.html');

  // Sub-navigation tabs
  assert.match(html, /data-planning-tab="budgets"/, 'Contains budgets tab');
  assert.match(html, /data-planning-tab="goals"/, 'Contains goals tab');
  assert.match(html, /data-planning-tab="debts"/, 'Contains debts tab');

  // Tabpanels
  assert.match(html, /id="view-monthly-budgets"/, 'Contains monthly budgets panel');
  assert.match(html, /id="view-financial-goals"/, 'Contains financial goals panel');
  assert.match(html, /id="view-debt-tracker"/, 'Contains debt tracker panel');

  // Goals elements
  assert.match(html, /id="goals-stat-active"/, 'Contains active goals stat');
  assert.match(html, /id="goals-stat-saved"/, 'Contains saved goals stat');
  assert.match(html, /id="goals-container"/, 'Contains goals container');
  assert.match(html, /id="goal-modal"/, 'Contains goal creation modal');
  assert.match(html, /id="goal-contribution-modal"/, 'Contains contribution modal');
  assert.match(html, /id="goal-history-modal"/, 'Contains contribution history modal');

  // Debt elements
  assert.match(html, /id="debts-stat-balance"/, 'Contains debt balance stat');
  assert.match(html, /id="debts-container"/, 'Contains debts container');
  assert.match(html, /id="debt-modal"/, 'Contains debt modal');
  assert.match(html, /id="debt-repayment-modal"/, 'Contains repayment modal');
  assert.match(html, /id="debt-history-modal"/, 'Contains repayment history modal');
  assert.match(html, /Accounting note:/, 'Contains financial accounting boundary note');

  // 14-page compliance (no data-nav="goals" or "debts" in sidebar)
  assert.doesNotMatch(html, /data-nav="goals"/, 'Must not add data-nav="goals" in sidebar');
  assert.doesNotMatch(html, /data-nav="debts"/, 'Must not add data-nav="debts" in sidebar');
});

test('goals-manager.js exports SpendSenseGoals and helper methods', () => {
  const { SpendSenseGoals, formatCurrency, formatDate } = require('../goals-manager.js');
  assert.equal(typeof SpendSenseGoals, 'function');
  assert.equal(formatCurrency(5000), '₹5,000.00');
  assert.equal(formatDate('2026-10-15'), '15 Oct 2026');
});

test('debts-manager.js exports SpendSenseDebts and formats currencies cleanly', () => {
  const { SpendSenseDebts, formatCurrency } = require('../debts-manager.js');
  assert.equal(typeof SpendSenseDebts, 'function');
  assert.equal(formatCurrency(250000), '₹2,50,000.00');
});

test('reports.html structure contains sub-nav tabs and financial health panel', () => {
  const html = read('reports-analytics/reports.html');

  assert.match(html, /data-reports-tab="reports"/, 'Contains reports tab');
  assert.match(html, /data-reports-tab="health"/, 'Contains financial health tab');
  assert.match(html, /id="view-reports-charts"/, 'Contains reports charts panel');
  assert.match(html, /id="view-financial-health"/, 'Contains financial health panel');
  assert.match(html, /id="financial-health-container"/, 'Contains health container');
});

test('financial-health.js exports SpendSenseFinancialHealth', () => {
  const { SpendSenseFinancialHealth } = require('../financial-health.js');
  assert.equal(typeof SpendSenseFinancialHealth, 'function');
});

test('dashboard.html contains financial goals summary card', () => {
  const html = read('dashboard/dashboard.html');
  assert.match(html, /data-goals-card/, 'Contains data-goals-card');
  assert.match(html, /data-goals-summary/, 'Contains data-goals-summary element');
});

