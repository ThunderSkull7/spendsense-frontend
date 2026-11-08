#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), root = path.resolve(__dirname, '..'), fail = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const pages = [
  'index.html',
  'dashboard/dashboard.html',
  'expense-management/expenses.html',
  'expense-management/add-expense.html',
  'income-management/income.html',
  'budget-planning/budget.html',
  'categories-management/categories.html',
  'recurring-transactions/recurring-transactions.html',
  'savings-goals/savings-goals.html',
  'debts-loans/debts-loans.html',
  'financial-health/financial-health.html',
  'financial-calendar/financial-calendar.html',
  'subscriptions/subscriptions.html',
  'net-worth/net-worth.html',
  'spending-trends/spending-trends.html',
  'income-analysis/income-analysis.html',
  'budget-performance/budget-performance.html',
  'cash-flow-forecast/cash-flow-forecast.html',
  'reports-analytics/reports.html',
  'notifications/notifications.html',
  'settings/settings.html',
  'support/support.html',
  'authentication/login.html',
  'authentication/signup.html',
  'authentication/forgot-password.html'
];

for (const p of pages) {
  if (!fs.existsSync(path.join(root, p))) fail.push('Missing page ' + p);
}

// Verify that sidebar Account heading and sidebar profile/logout are completely removed from authenticated pages
const authPages = pages.filter(p => !p.startsWith('authentication/') && p !== 'index.html');
for (const p of authPages) {
  if (!fs.existsSync(path.join(root, p))) continue;
  const h = read(p);
  if (h.includes('<p class="sidebar-group">Account</p>')) {
    fail.push(p + ' has unexpected sidebar Account group heading');
  }
  if (h.includes('class="sidebar-footer"')) {
    fail.push(p + ' has unexpected sidebar-footer');
  }
  // Verify 4 target sidebar groups exist
  if (!h.includes('<p class="sidebar-group">Overview</p>')) fail.push(p + ' missing Overview sidebar group');
  if (!h.includes('<p class="sidebar-group">Money</p>')) fail.push(p + ' missing Money sidebar group');
  if (!h.includes('<p class="sidebar-group">Insights</p>')) fail.push(p + ' missing Insights sidebar group');
  if (!h.includes('<p class="sidebar-group">Planning</p>')) fail.push(p + ' missing Planning sidebar group');

  // Verify that the 6 Batch 2 navigation items are active anchors pointing to their standalone pages
  const batch2Navs = [
    { nav: 'subscriptions', href: '../subscriptions/subscriptions.html' },
    { nav: 'net-worth', href: '../net-worth/net-worth.html' },
    { nav: 'insights-trends', href: '../spending-trends/spending-trends.html' },
    { nav: 'insights-income', href: '../income-analysis/income-analysis.html' },
    { nav: 'insights-budgets', href: '../budget-performance/budget-performance.html' },
    { nav: 'forecast', href: '../cash-flow-forecast/cash-flow-forecast.html' }
  ];
  for (const item of batch2Navs) {
    if (!h.includes(`data-nav="${item.nav}"`)) {
      fail.push(`${p} missing Batch 2 nav item "${item.nav}"`);
    }
    const anchorRegex = new RegExp(`<a[^>]*class="sidebar-link[^"]*"[^>]*href="${item.href.replace(/\./g, '\\.')}"[^>]*data-nav="${item.nav}"`);
    if (!anchorRegex.test(h)) {
      fail.push(`${p} item "${item.nav}" is not an active anchor pointing to "${item.href}"`);
    }
    if (h.includes(`is-disabled`) && h.includes(`data-nav="${item.nav}"`)) {
      const itemMatch = h.match(new RegExp(`<[^>]*data-nav="${item.nav}"[^>]*>`));
      if (itemMatch && itemMatch[0].includes('is-disabled')) {
        fail.push(`${p} item "${item.nav}" still has is-disabled class`);
      }
    }
    const linkMatch = h.match(new RegExp(`<a[^>]*data-nav="${item.nav}"[\\s\\S]*?<\\/a>`));
    if (linkMatch && linkMatch[0].includes('Soon')) {
      fail.push(`${p} item "${item.nav}" still contains Soon badge`);
    }
  }
}

// Verify old embedded tabs are removed from parent pages
const expH = read('expense-management/expenses.html');
if (expH.includes('id="tab-recurring-bills"')) fail.push('expenses.html still contains tab-recurring-bills');
if (expH.includes('id="tab-bill-calendar"')) fail.push('expenses.html still contains tab-bill-calendar');
if (expH.includes('id="view-recurring-bills"')) fail.push('expenses.html still contains view-recurring-bills');
if (expH.includes('id="view-bill-calendar"')) fail.push('expenses.html still contains view-bill-calendar');

const budH = read('budget-planning/budget.html');
if (budH.includes('data-planning-tab="goals"')) fail.push('budget.html still contains financial goals tab');
if (budH.includes('data-planning-tab="debts"')) fail.push('budget.html still contains debt tracker tab');
if (budH.includes('id="view-financial-goals"')) fail.push('budget.html still contains view-financial-goals');
if (budH.includes('id="view-debt-tracker"')) fail.push('budget.html still contains view-debt-tracker');

const repH = read('reports-analytics/reports.html');
if (repH.includes('data-reports-tab="health"')) fail.push('reports.html still contains financial health tab');
if (repH.includes('id="view-financial-health"')) fail.push('reports.html still contains view-financial-health');

// Verify 5 standalone relocated feature pages exist and contain core views
const recH = read('recurring-transactions/recurring-transactions.html');
if (!recH.includes('id="view-recurring-bills"')) fail.push('recurring-transactions.html missing view-recurring-bills');
if (!recH.includes('id="recurring-modal"')) fail.push('recurring-transactions.html missing recurring-modal');

const calH = read('financial-calendar/financial-calendar.html');
if (!calH.includes('id="view-bill-calendar"')) fail.push('financial-calendar.html missing view-bill-calendar');
if (!calH.includes('data-calendar-grid')) fail.push('financial-calendar.html missing data-calendar-grid');

const goalH = read('savings-goals/savings-goals.html');
if (!goalH.includes('id="view-financial-goals"')) fail.push('savings-goals.html missing view-financial-goals');
if (!goalH.includes('id="goal-modal"')) fail.push('savings-goals.html missing goal-modal');

const debtH = read('debts-loans/debts-loans.html');
if (!debtH.includes('id="view-debt-tracker"')) fail.push('debts-loans.html missing view-debt-tracker');
if (!debtH.includes('id="debt-modal"')) fail.push('debts-loans.html missing debt-modal');

const hlthH = read('financial-health/financial-health.html');
if (!hlthH.includes('id="financial-health-container"')) fail.push('financial-health.html missing financial-health-container');

// Subscriptions standalone checks
const subH = read('subscriptions/subscriptions.html');
if (!subH.includes('id="view-subscriptions"')) fail.push('subscriptions.html missing view-subscriptions');
if (!subH.includes('id="subscription-modal"')) fail.push('subscriptions.html missing subscription-modal');
if (!subH.includes('data-open-subscription-modal')) fail.push('subscriptions.html missing data-open-subscription-modal');

// Net Worth standalone checks
const nwH = read('net-worth/net-worth.html');
if (!nwH.includes('id="view-net-worth"')) fail.push('net-worth.html missing view-net-worth');
if (!nwH.includes('id="net-worth-modal"')) fail.push('net-worth.html missing net-worth-modal');
if (!nwH.includes('id="valuation-modal"')) fail.push('net-worth.html missing valuation-modal');
if (!nwH.includes('data-open-entry-modal')) fail.push('net-worth.html missing data-open-entry-modal');

// Spending Trends standalone checks
const stH = read('spending-trends/spending-trends.html');
if (!stH.includes('id="view-spending-trends"')) fail.push('spending-trends.html missing view-spending-trends');
if (!stH.includes('id="trends-chart-container"')) fail.push('spending-trends.html missing trends-chart-container');

// Income Analysis standalone checks
const iaH = read('income-analysis/income-analysis.html');
if (!iaH.includes('id="view-income-analysis"')) fail.push('income-analysis.html missing view-income-analysis');
if (!iaH.includes('id="income-chart-container"')) fail.push('income-analysis.html missing income-chart-container');

// Budget Performance standalone checks
const bpH = read('budget-performance/budget-performance.html');
if (!bpH.includes('id="view-budget-performance"')) fail.push('budget-performance.html missing view-budget-performance');
if (!bpH.includes('id="budget-chart-container"')) fail.push('budget-performance.html missing budget-chart-container');
if (!bpH.includes('id="budget-items-table"')) fail.push('budget-performance.html missing budget-items-table');

// Cash Flow Forecast standalone checks
const cffH = read('cash-flow-forecast/cash-flow-forecast.html');
if (!cffH.includes('id="view-cash-flow-forecast"')) fail.push('cash-flow-forecast.html missing view-cash-flow-forecast');
if (!cffH.includes('id="forecast-monthly-grid"')) fail.push('cash-flow-forecast.html missing forecast-monthly-grid');
if (!cffH.includes('id="forecast-events-table"')) fail.push('cash-flow-forecast.html missing forecast-events-table');

// Category CRUD checks
const h = read('categories-management/categories.html'), j = read('categories-management/categories.js');
if (!h.includes('class="category-form"')) fail.push('Category form missing');
if (!h.includes('data-category-choice="expense"') || !h.includes('data-category-choice="income"')) fail.push('Expense/Income selector missing');
if (!j.includes("api.post('/categories', payload)")) fail.push('Category create API missing');
if (!j.includes("api.put(`/categories/${editingCategoryId}`, payload)")) fail.push('Category update API missing');
if (!j.includes('category.is_default !== false')) fail.push('Category default/custom distinction missing');
if (!j.includes("Shared default categories cannot be edited")) fail.push('Category default edit protection missing');
if (!j.includes("Shared default categories cannot be deleted")) fail.push('Category default delete protection missing');
if (!h.includes('Shared defaults are managed by SpendSense')) fail.push('Category ownership guidance missing');

if (fail.length) {
  console.error(fail.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Site verification passed: 25 pages present, 4-group navigation hierarchy active, sidebar account controls removed, all 6 Batch 2 features integrated and navigation links fully active, 5 promoted features relocated, parent tabs cleaned up, category CRUD verified.');
}
