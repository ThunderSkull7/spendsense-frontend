'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('All 8 visualization controllers listen to spendsense:theme-change', () => {
  const chartControllers = [
    { name: 'Dashboard', path: 'dashboard/dashboard.js' },
    { name: 'Spending Trends', path: 'spending-trends/spending-trends.js' },
    { name: 'Income Analysis', path: 'income-analysis/income-analysis.js' },
    { name: 'Budget Performance', path: 'budget-performance/budget-performance.js' },
    { name: 'Net Worth', path: 'net-worth/net-worth.js' },
    { name: 'Cash Flow Forecast', path: 'cash-flow-forecast/cash-flow-forecast.js' },
    { name: 'Financial Health', path: 'financial-health.js' },
    { name: 'Reports', path: 'reports-analytics/reports.js' }
  ];

  for (const ctrl of chartControllers) {
    const fullPath = path.join(root, ctrl.path);
    assert.ok(fs.existsSync(fullPath), `${ctrl.name} controller must exist at ${ctrl.path}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.ok(
      content.includes('spendsense:theme-change'),
      `${ctrl.name} (${ctrl.path}) must register a listener for spendsense:theme-change`
    );
  }
});

test('Visualization HTML pages declare accessible regions with descriptive labels', () => {
  const chartPages = [
    {
      name: 'Spending Trends',
      path: 'spending-trends/spending-trends.html',
      checks: ['trends-chart-container', 'role="region"', 'Spending Trajectory Chart']
    },
    {
      name: 'Income Analysis',
      path: 'income-analysis/income-analysis.html',
      checks: ['income-chart-container', 'role="region"', 'Realized vs Scheduled Monthly Income Chart']
    },
    {
      name: 'Budget Performance',
      path: 'budget-performance/budget-performance.html',
      checks: ['budget-chart-container', 'role="region"', 'Monthly Budget Trajectory Chart']
    },
    {
      name: 'Net Worth',
      path: 'net-worth/net-worth.html',
      checks: ['trend-container', 'role="region"', 'Net Worth Trend Chart']
    },
    {
      name: 'Cash Flow Forecast',
      path: 'cash-flow-forecast/cash-flow-forecast.html',
      checks: ['forecast-monthly-grid', 'role="region"', 'Monthly Cash Flow Forecast Projections']
    },
    {
      name: 'Reports',
      path: 'reports-analytics/reports.html',
      checks: ['spendingChart', 'role="img"', 'aria-label="Spending by category doughnut chart"']
    }
  ];

  for (const page of chartPages) {
    const fullPath = path.join(root, page.path);
    assert.ok(fs.existsSync(fullPath), `${page.name} page must exist`);
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const check of page.checks) {
      assert.ok(
        content.includes(check),
        `${page.name} must include "${check}" for accessible chart labeling`
      );
    }
  }
});

test('Dynamic chart renderers supply accessible sr-only tabular data summaries', () => {
  const chartControllers = [
    {
      name: 'Spending Trends',
      path: 'spending-trends/spending-trends.js',
      checks: ['<table class="sr-only"', 'Spending trajectory by interval', 'caption', 'scope="col"']
    },
    {
      name: 'Income Analysis',
      path: 'income-analysis/income-analysis.js',
      checks: ['<table class="sr-only"', 'Realized vs scheduled income by month', 'caption', 'scope="col"']
    },
    {
      name: 'Budget Performance',
      path: 'budget-performance/budget-performance.js',
      checks: ['<table class="sr-only"', 'Monthly budget limit vs actual spent', 'caption', 'scope="col"']
    },
    {
      name: 'Net Worth',
      path: 'net-worth/net-worth.js',
      checks: ['<table class="sr-only"', 'Net worth historical trend by month', 'caption', 'scope="col"']
    },
    {
      name: 'Cash Flow Forecast',
      path: 'cash-flow-forecast/cash-flow-forecast.js',
      checks: ['<table class="sr-only"', 'Monthly cash flow projections', 'caption', 'scope="col"']
    }
  ];

  for (const ctrl of chartControllers) {
    const fullPath = path.join(root, ctrl.path);
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const check of ctrl.checks) {
      assert.ok(
        content.includes(check),
        `${ctrl.name} controller must include "${check}" in its chart markup for screen reader accessibility`
      );
    }
  }
});

test('Non-color visual cues are maintained across charts', () => {
  // Income analysis: communicates realized vs scheduled via line/fill patterns, not color alone
  const incomeJs = fs.readFileSync(path.join(root, 'income-analysis/income-analysis.js'), 'utf8');
  assert.ok(
    incomeJs.includes('Solid bar = Realized deposits • Dashed outline = Scheduled expectations'),
    'Income analysis must clarify pattern distinction in copy'
  );

  // Net worth: distinct legend labels for assets vs liabilities and top net worth value
  const netWorthJs = fs.readFileSync(path.join(root, 'net-worth/net-worth.js'), 'utf8');
  assert.ok(
    netWorthJs.includes('Total Assets') && netWorthJs.includes('Total Liabilities'),
    'Net worth chart must provide descriptive text alongside visual bars'
  );

  // Spending trends: rolling average marker line distinction
  const trendsJs = fs.readFileSync(path.join(root, 'spending-trends/spending-trends.js'), 'utf8');
  assert.ok(
    trendsJs.includes('Rolling Avg') || trendsJs.includes('Rolling Average'),
    'Spending trends must clearly label rolling average marker'
  );
});

test('Financial semantic color independence is preserved in CSS', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

  // Semantic tokens exist
  assert.match(css, /--success:\s*#16A34A;/i);
  assert.match(css, /--warn:\s*#D97706;/i);
  assert.match(css, /--danger:\s*#DC2626;/i);

  // Dark mode semantic variables exist with enhanced contrast
  assert.match(css, /--success-600:\s*#4ADE80;/i);
  assert.match(css, /--warn-600:\s*#FBBF24;/i);
  assert.match(css, /--danger-600:\s*#F87171;/i);

  // Semantic pill classes use semantic variables rather than hardcoded colors
  assert.match(css, /\.pill\.status-paid,\s*\.pill\.success\s*\{\s*background:\s*var\(--success-100\)/);
  assert.match(css, /\.pill\.status-upcoming,\s*\.pill\.warning,\s*\.pill\.warn\s*\{\s*background:\s*var\(--warn-100\)/);
  assert.match(css, /\.pill\.status-overdue,\s*\.pill\.danger,\s*\.pill\.rose\s*\{\s*background:\s*var\(--danger-100\)/);
});

test('Canonical eight accent palettes and legacy alias normalizations are strictly preserved', () => {
  const themeJs = fs.readFileSync(path.join(root, 'theme.js'), 'utf8');
  const canonical = ['teal', 'blue', 'violet', 'plum', 'rose', 'orange', 'jade', 'indigo'];

  for (const pal of canonical) {
    assert.ok(
      themeJs.includes(`"${pal}"`) || themeJs.includes(`'${pal}'`),
      `theme.js must include canonical palette "${pal}"`
    );
  }

  // Legacy aliases must normalize to canonical palettes
  assert.match(themeJs, /if\s*\(p\s*===\s*["']emerald["']\)\s*return\s*["']jade["']/);
  assert.match(themeJs, /if\s*\(p\s*===\s*["']amber["']\)\s*return\s*["']orange["']/);
  assert.match(themeJs, /if\s*\(p\s*===\s*["']slate["']\)\s*return\s*["']plum["']/);
  assert.match(themeJs, /if\s*\(p\s*===\s*["']green["']\)\s*return\s*["']teal["']/);

  // Settings UI radio grid must offer exactly the eight canonical palettes
  const settingsHtml = fs.readFileSync(path.join(root, 'settings/settings.html'), 'utf8');
  for (const pal of canonical) {
    assert.ok(
      settingsHtml.includes(`data-palette="${pal}"`),
      `settings.html must offer canonical palette button for "${pal}"`
    );
  }
});

