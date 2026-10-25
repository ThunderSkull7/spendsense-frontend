// Shared helpers for client-side transaction history search, date filters, and
// deterministic client-side sorting. Framework-free and safe for both the
// expense and income pages, without adding new runtime dependencies.
//
// Both history pages load the full paginated dataset before rendering, so the
// filters/sort below operate over a complete, already-fetched snapshot: they
// never claim to match records that were not loaded.
(function attachSpendSenseTransactions(global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // Node (unit tests / tooling).
    module.exports = factory();
    return;
  }
  // Browser pages.
  global.SpendSenseTransactions = factory();
})(typeof window !== 'undefined' ? window : this, function buildSpendSenseTransactions() {
  const readPath = (object, path) => {
    if (!object || typeof object !== 'object') return '';
    return path.split('.').reduce((value, key) => (value == null ? '' : value[key]), object);
  };

  const asText = (value) => (value == null ? '' : String(value)).trim().toLowerCase();

  // Date-only normalization avoids `new Date(...)` timezone shifts and keeps
  // boundary comparisons exact.
  const normalizeDate = (value) => {
    if (value == null) return '';
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return '';
    const [, year, month, day] = match;
    return [
      year.padStart(4, '0'),
      month.padStart(2, '0'),
      day.padStart(2, '0'),
    ].join('-');
  };

  const searchMatches = (item, term, fields) => {
    if (!term) return true;
    return fields.some((field) => asText(readPath(item, field)).includes(term));
  };

  const dateInRange = (item, filters, dateField) => {
    const date = normalizeDate(item && item[dateField]);
    if (!date) return true;
    if (filters.startDate && date < filters.startDate) return false;
    if (filters.endDate && date > filters.endDate) return false;
    return true;
  };

  const categoryMatches = (item, filters, categoryField) => {
    if (!filters.categoryId) return true;
    const rawCategory = item ? item[categoryField] : null;
    const categoryId = rawCategory != null ? String(rawCategory) : '';
    const categoryFromRelationship = item && item.category ? String(item.category.id || '') : '';
    return categoryId === String(filters.categoryId)
      || (categoryFromRelationship !== '' && categoryFromRelationship === String(filters.categoryId));
  };

  const filterTransactions = (items, filters = {}, options = {}) => {
    const source = Array.isArray(items) ? items : [];
    const term = asText(filters.search);
    const dateField = options.dateField || 'date';
    const categoryField = options.categoryField || 'category_id';
    const textFields = Array.isArray(options.searchFields)
      ? options.searchFields
      : ['description'];

    return source
      .filter((item) => searchMatches(item, term, textFields))
      .filter((item) => dateInRange(item, filters, dateField))
      .filter((item) => categoryMatches(item, filters, categoryField));
  };

  const sortTransactions = (items, sortKey = 'date-desc', dateField = 'date') => {
    const source = Array.isArray(items) ? items : [];
    const field = sortKey.startsWith('amount') ? 'amount' : 'date';
    const direction = sortKey.endsWith('-asc') ? 1 : -1;

    const amountOf = (item) => {
      const value = Number(item ? item.amount : NaN);
      return Number.isFinite(value) ? value : 0;
    };

    return source.slice().sort((left, right) => {
      if (field === 'date') {
        const leftDate = normalizeDate(left && left[dateField]);
        const rightDate = normalizeDate(right && right[dateField]);
        if (leftDate !== rightDate) {
          return leftDate < rightDate ? -direction : direction;
        }
      } else {
        const leftAmount = amountOf(left);
        const rightAmount = amountOf(right);
        if (leftAmount !== rightAmount) {
          return leftAmount < rightAmount ? -direction : direction;
        }
      }

      // Stable tie-break so equal dates or equal amounts do not reshuffle
      // between renders. IDs are unique per row in both pages.
      const leftId = Number(left && left.id);
      const rightId = Number(right && right.id);
      if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
        return leftId < rightId ? -1 : 1;
      }
      return 0;
    });
  };

  const emptyFilters = () => ({
    search: '',
    startDate: '',
    endDate: '',
    categoryId: '',
  });

  const hasActiveFilters = (filters = {}) => Boolean(
    (filters.search || '').trim()
    || filters.startDate
    || filters.endDate
    || (filters.categoryId != null && String(filters.categoryId) !== '' && String(filters.categoryId) !== '0')
  );

  return {
    normalizeDate,
    filterTransactions,
    sortTransactions,
    emptyFilters,
    hasActiveFilters,
  };
});
