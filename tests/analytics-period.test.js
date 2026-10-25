const test = require('node:test');
const assert = require('node:assert/strict');
const period = require('../analytics-period.js');

test('normalizes reporting periods without accepting invalid boundaries', () => {
  assert.deepEqual(period.normalizePeriod({ month: 1, year: 2026 }), { month: 1, year: 2026 });
  assert.deepEqual(period.normalizePeriod({ month: 12, year: 2026 }), { month: 12, year: 2026 });
  assert.equal(period.normalizePeriod({ month: 0, year: 2026 }), null);
  assert.equal(period.normalizePeriod({ month: 13, year: 2026 }), null);
  assert.equal(period.normalizePeriod({ month: 3, year: 1899 }), null);
  assert.equal(period.normalizePeriod({ month: 'oct', year: '2026' }), null);
});

test('query appends the same calendar month/year boundary to analytics endpoints', () => {
  const query = period.query('/analytics/month-comparison', { month: 2, year: 2026 });
  assert.equal(query, '/analytics/month-comparison?month=2&year=2026');

  const samePeriod = period.query('/analytics/budget-status', { month: 11, year: 2025 });
  assert.equal(samePeriod, '/analytics/budget-status?month=11&year=2025');
});

test('labels defer to existing INR/en-IN formatting expectations', () => {
  assert.equal(period.label({ month: 10, year: 2026 }), 'October 2026');
  assert.equal(period.label({ month: 1, year: 2026 }), 'January 2026');
  assert.equal(period.label({ month: 3, year: 2025 }, { short: true }), 'Mar 2025');
});

test('all analytics endpoints share the same selected reporting period', () => {
  const selected = { month: 9, year: 2026 };
  const endpoints = [
    '/analytics/cash-flow',
    '/analytics/spending-by-category',
    '/analytics/month-comparison',
    '/analytics/budget-status',
    '/analytics/budget-alerts',
  ].map((endpoint) => period.query(endpoint, selected));

  assert.ok(endpoints.every((url) => url.endsWith('month=9&year=2026')));
});

test('dashboard and reports pages consume the shared period helper', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'dashboard.js'), 'utf8');
  const reports = fs.readFileSync(path.join(__dirname, '..', 'reports-analytics', 'reports.js'), 'utf8');

  for (const [name, content] of [['dashboard.js', dashboard], ['reports.js', reports]]) {
    assert.ok(content.includes('SpendSensePeriod'), `${name} should use the shared period helper`);
    assert.ok(content.includes('spendPeriodQuery('), `${name} should route analytics requests through the shared period query`);
    assert.doesNotMatch(content, /api\.get\(\s*['"]\/analytics\/(cash-flow|spending-by-category|month-comparison|budget-status|budget-alerts)['"]\s*\)/, `${name} should not call analytics endpoints without the shared period`);
  }
});
