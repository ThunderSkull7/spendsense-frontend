/*
 * Stage 5 frontend integration – expenses deep link.
 *
 * The Spending trends page links into the transaction search with the
 * category and the date range already filled in. This patch reads those
 * query parameters and applies them to the search form before the first
 * request, so a drill-down arrives with the filters already applied.
 *
 * Run from the frontend directory:  node tools/stage5-expense-deeplink.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'expense-management', 'expenses.js');
let source = fs.readFileSync(target, 'utf8');

const anchor = `  // Populate the category select (expense categories only; income has no
  // category in this schema and the server rejects the combination).`;

if (!source.includes(anchor)) {
  if (source.includes('applyDeepLinkParams')) {
    console.log('SKIP  deep link support already present');
    process.exit(0);
  }
  throw new Error('category populate anchor not found');
}

const insertion = `  // A drill-down from the Spending trends page arrives with the category and
  // the date range in the query string. Apply them before the first request.
  const applyDeepLinkParams = () => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category_id');
    const from = params.get('from');
    const to = params.get('to');
    if (!category && !from && !to) return;

    if (category && searchInputs.category) searchInputs.category.value = category;
    if (from && searchInputs.from) searchInputs.from.value = from;
    if (to && searchInputs.to) searchInputs.to.value = to;
    if (category && filterSelect) filterSelect.value = category;

    readSearchInputs();
  };

` + anchor;

source = source.replace(anchor, insertion);

// Call it right after the first load so the initial request already carries
// the drill-down filters.
const loadAnchor = `  loadTransactions(false);
  loadTrash();
});`;

if (!source.includes(loadAnchor)) {
  throw new Error('initial load anchor not found');
}

source = source.replace(
  loadAnchor,
  `  applyDeepLinkParams();
  loadTransactions(false);
  loadTrash();
});`
);

fs.writeFileSync(target, source, 'utf8');
console.log('expenses.js deep-link support added');
