'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('budget.html focuses on monthly budgets and has embedded goals/debt tabs removed per Batch 1', () => {
  const html = read('budget-planning/budget.html');

  // Verify monthly budgets panel remains
  assert.match(html, /id="view-monthly-budgets"/, 'Contains monthly budgets panel');

  // Verify old embedded tabs removed
  assert.doesNotMatch(html, /data-planning-tab="goals"/, 'Must not contain goals tab');
  assert.doesNotMatch(html, /data-planning-tab="debts"/, 'Must not contain debts tab');
  assert.doesNotMatch(html, /id="view-financial-goals"/, 'Must not contain financial goals panel');
  assert.doesNotMatch(html, /id="view-debt-tracker"/, 'Must not contain debt tracker panel');
});

test('savings-goals.html contains standalone financial goals panel, stats and modals', () => {
  const html = read('savings-goals/savings-goals.html');

  // Goals elements
  assert.match(html, /id="goals-stat-active"/, 'Contains active goals stat');
  assert.match(html, /id="goals-stat-saved"/, 'Contains saved goals stat');
  assert.match(html, /id="goals-container"/, 'Contains goals container');
  assert.match(html, /id="goal-modal"/, 'Contains goal creation modal');
  assert.match(html, /id="goal-contribution-modal"/, 'Contains contribution modal');
  assert.match(html, /id="goal-history-modal"/, 'Contains contribution history modal');

  // Target navigation
  assert.match(html, /data-nav="goals"/, 'Contains data-nav="goals" in sidebar');
});

test('debts-loans.html contains standalone debt tracker panel, stats and modals', () => {
  const html = read('debts-loans/debts-loans.html');

  // Debt elements
  assert.match(html, /id="debts-stat-balance"/, 'Contains debt balance stat');
  assert.match(html, /id="debts-container"/, 'Contains debts container');
  assert.match(html, /id="debt-modal"/, 'Contains debt modal');
  assert.match(html, /id="debt-repayment-modal"/, 'Contains repayment modal');
  assert.match(html, /id="debt-history-modal"/, 'Contains repayment history modal');
  assert.match(html, /Accounting note:/, 'Contains financial accounting boundary note');

  // Target navigation
  assert.match(html, /data-nav="debts"/, 'Contains data-nav="debts" in sidebar');
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

test('reports.html focuses on reports & analytics and has financial health tab removed per Batch 1', () => {
  const html = read('reports-analytics/reports.html');

  assert.match(html, /id="view-reports-charts"/, 'Contains reports charts panel');
  assert.doesNotMatch(html, /data-reports-tab="health"/, 'Must not contain financial health tab');
  assert.doesNotMatch(html, /id="view-financial-health"/, 'Must not contain financial health panel');
});

test('financial-health.html contains standalone financial health panel and container', () => {
  const html = read('financial-health/financial-health.html');

  assert.match(html, /id="view-financial-health"/, 'Contains financial health panel');
  assert.match(html, /id="financial-health-container"/, 'Contains health container');
  assert.match(html, /data-nav="health"/, 'Contains data-nav="health" in sidebar');
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
