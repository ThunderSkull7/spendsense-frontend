const test = require('node:test');
const assert = require('node:assert/strict');
const transactions = require('../transactions-client.js');

test('filters by search case-insensitively and safely handles empty values', () => {
  const items = [
    { id: 1, description: 'Grocery at Coles', category: { name: 'Food' } },
    { id: 2, description: 'Fuel', category: { name: 'Transport' } },
    { id: 3, description: '', category: null },
  ];

  const matches = transactions.filterTransactions(
    items,
    { search: 'grocery' },
    { searchFields: ['description', 'category.name'] }
  );
  assert.deepEqual(matches.map((item) => item.id), [1]);

  const categoryMatch = transactions.filterTransactions(
    items,
    { search: 'transport' },
    { searchFields: ['description', 'category.name'] }
  );
  assert.deepEqual(categoryMatch.map((item) => item.id), [2]);

  const noTerm = transactions.filterTransactions(
    items,
    {},
    { searchFields: ['description', 'category.name'] }
  );
  assert.equal(noTerm.length, 3);
});

test('date range filters are boundary-inclusive without timezone drift', () => {
  const items = [
    { id: 1, date: '2026-03-01' },
    { id: 2, date: '2026-03-15' },
    { id: 3, date: '2026-03-31' },
    { id: 4, date: '2026-04-02' },
  ];

  const range = transactions.filterTransactions(
    items,
    { startDate: '2026-03-01', endDate: '2026-03-31' },
    { dateField: 'date' }
  );
  assert.deepEqual(range.map((item) => item.id), [1, 2, 3]);

  const onlyFrom = transactions.filterTransactions(
    items,
    { startDate: '2026-03-15' },
    { dateField: 'date' }
  );
  assert.deepEqual(onlyFrom.map((item) => item.id), [2, 3, 4]);

  const onlyTo = transactions.filterTransactions(
    items,
    { endDate: '2026-03-15' },
    { dateField: 'date' }
  );
  assert.deepEqual(onlyTo.map((item) => item.id), [1, 2]);
});

test('sorting is deterministic for equal keys and preserves source order', () => {
  const items = [
    { id: 3, date: '2026-01-02', amount: 10 },
    { id: 1, date: '2026-01-02', amount: 20 },
    { id: 2, date: '2026-01-01', amount: 30 },
  ];

  const dateDesc = transactions.sortTransactions(items, 'date-desc', 'date');
  assert.deepEqual(dateDesc.map((item) => item.id), [1, 3, 2]);

  const dateAsc = transactions.sortTransactions(items, 'date-asc', 'date');
  assert.deepEqual(dateAsc.map((item) => item.id), [2, 1, 3]);

  const amountAsc = transactions.sortTransactions(items, 'amount-asc', 'date');
  assert.deepEqual(amountAsc.map((item) => item.id), [3, 1, 2]);

  const amountDesc = transactions.sortTransactions(items, 'amount-desc', 'date');
  assert.deepEqual(amountDesc.map((item) => item.id), [2, 1, 3]);

  // The original array is never mutated by sorting.
  assert.equal(items[0].id, 3);
});

test('missing and invalid sort values do not throw or hide rows', () => {
  const items = [
    { id: 2, date: '2026-01-02', amount: '' },
    { id: 1, date: '', amount: 15 },
    { id: 3, date: '2026-02-01', amount: null },
  ];

  const dateAsc = transactions.sortTransactions(items, 'date-asc', 'date');
  assert.deepEqual(dateAsc.map((item) => item.id), [1, 2, 3]);

  const amountAsc = transactions.sortTransactions(items, 'amount-asc', 'date');
  assert.deepEqual(amountAsc, transactions.sortTransactions(amountAsc, 'amount-asc', 'date'));
});

test('combined filters compose rather than overwrite each other', () => {
  const items = [
    { id: 1, description: 'Groceries', category: { name: 'Food' }, amount: 20, date: '2026-03-01' },
    { id: 2, description: 'Gym', category: { name: 'Health' }, amount: 80, date: '2026-03-05' },
    { id: 3, description: 'Fuel', category: { name: 'Transport' }, amount: 80, date: '2026-04-01' },
  ];

  const filtered = transactions.filterTransactions(
    items,
    { search: '80', categoryId: '' },
    { searchFields: ['description', 'category.name'], dateField: 'date' }
  );
  assert.equal(filtered.length, 0, 'term matches text fields only, not amounts');

  const combined = transactions.filterTransactions(
    items,
    { search: 'fuel', startDate: '2026-03-01', endDate: '2026-04-30' },
    { searchFields: ['description', 'category.name'], dateField: 'date' }
  );
  assert.deepEqual(combined.map((item) => item.id), [3]);
});

test('active filter detection distinguishes filters from empty controls', () => {
  assert.equal(transactions.hasActiveFilters(transactions.emptyFilters()), false);
  assert.equal(transactions.hasActiveFilters({ search: '  ' }), false);
  assert.equal(transactions.hasActiveFilters({ startDate: '2026-01-01' }), true);
  assert.equal(transactions.hasActiveFilters({ categoryId: 0 }), false);
  assert.equal(transactions.hasActiveFilters({ categoryId: '3' }), true);
});
