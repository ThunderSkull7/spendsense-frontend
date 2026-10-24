const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Test static code analysis and logic of reports.js
test('reports.js does not contain undefined spendingVal reference', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'reports-analytics', 'reports.js'), 'utf8');
  assert.doesNotMatch(content, /lastSpendingResult\s*=\s*spendingVal\s*;/);
  assert.match(content, /loadAll\s*\(\s*\)/);
});

test('reports.js executes independent tasks concurrently and handles errors per section', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'reports-analytics', 'reports.js'), 'utf8');
  // Check that independent tasks are launched concurrently
  assert.ok(content.includes('spendingTask'));
  assert.ok(content.includes('cashflowTask'));
  assert.ok(content.includes('alertsTask'));
  assert.ok(content.includes('budgetStatusTask'));
  assert.ok(content.includes('Promise.allSettled'));

  // Check that retry handlers call section-specific loadSection
  assert.ok(content.includes("loadSection('spending')"));
  assert.ok(content.includes("loadSection('cashflow')"));
  assert.ok(content.includes("loadSection('alerts')"));
  assert.ok(content.includes("loadSection('budgets')"));

  // Check refresh button storm prevention
  assert.ok(content.includes('isLoadingAll'));
  assert.ok(content.includes('refreshBtn.disabled = true'));
});

test('reports.js guards Chart instances and ensures canvas is preserved', () => {
  const content = fs.readFileSync(path.join(__dirname, '..', 'reports-analytics', 'reports.js'), 'utf8');
  // spendingChartInstance destroy before creation
  assert.ok(content.includes('spendingChartInstance.destroy()'));
  // cashflowChartInstance destroy before creation
  assert.ok(content.includes('cashflowChartInstance.destroy()'));
  // Theme change listener
  assert.ok(content.includes('spendsense:theme-change'));
});
