/*
 * Stage 5 frontend integration – remove declarations that the new
 * server-side list section now owns, so the file has one definition of each
 * helper.
 *
 * Run from the frontend directory:  node tools/stage5-expense-dedupe.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'expense-management', 'expenses.js');
let source = fs.readFileSync(target, 'utf8');

// Each entry removes a complete top-level declaration block by matching the
// exact source text that was written before the Stage 5 list section.
const removals = [
  [
    `  const updateSummary = () => {
    if (summaryEl) summaryEl.textContent = total ? \`Showing \${loaded} of \${total} expenses\` : '';
  };

`,
    'old updateSummary',
  ],
  [
    `  const setLoadMore = (visible) => {
    if (!loadMoreBtn) return;
    loadMoreBtn.hidden = !visible;
    const footer = loadMoreBtn.closest('.card-footer');
    if (footer) footer.hidden = !visible;
  };

`,
    'old setLoadMore',
  ],
  [
    `  const showState = (type, options) => {
    if (tableWrap) tableWrap.hidden = true;
    if (stateEl) {
      stateEl.hidden = false;
      UI.renderState(stateEl, type, options);
    }
  };

`,
    'old showState',
  ],
  [
    `  const showTable = () => {
    if (stateEl) stateEl.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
  };

`,
    'old showTable',
  ],
  [
    `  const showEmpty = () =>
    showState('empty', {
      message: 'No expenses yet. Log your first expense to see it here.',
      action: { href: 'add-expense.html', label: 'Add an expense' },
    });

`,
    'old showEmpty',
  ],
  [
    `  const renderRows = (items, append) => {
    if (!append) rowsBody.replaceChildren();
    items.forEach((item) => rowsBody.appendChild(buildRow(item)));
    loaded += items.length;
  };

`,
    'old renderRows',
  ],
  [
    `  const applyFilter = () => {
    if (!filterSelect) return;
    const selected = filterSelect.value;
    rowsBody.querySelectorAll('tr').forEach((row) => {
      row.hidden = selected !== '' && row.dataset.category !== selected;
    });
  };

`,
    'old applyFilter',
  ],
  [
    `  let nextPage = 1;
  let lastPage = 1;`,
    `  let lastPage = 1;`,
    'old nextPage',
  ],
];

removals.forEach(([needle, replacement, label]) => {
  if (!source.includes(needle)) {
    console.log(`SKIP  ${label} (not found)`);
    return;
  }
  source = source.replace(needle, replacement);
  console.log(`OK    ${label}`);
});

fs.writeFileSync(target, source, 'utf8');
console.log('expenses.js deduplicated');
