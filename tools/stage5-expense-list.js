/*
 * Stage 5 frontend integration – expense list section.
 *
 * Replaces the client-side list with the owner-scoped server-side search
 * endpoint (/api/transactions/search) so filtering, sorting and pagination
 * happen on the server. The trash view keeps using the existing
 * /expenses/trash endpoint.
 *
 * Run from the frontend directory:  node tools/stage5-expense-list.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'expense-management', 'expenses.js');
let source = fs.readFileSync(target, 'utf8');

const cut = source.indexOf('  // ── Advanced transaction search (server-side) ───────────────────────────');
if (cut === -1) {
  throw new Error('Search block anchor not found. Has expenses.js already been patched?');
}

const head = source.slice(0, cut);

/* ── 1. buildRow must understand both the legacy /expenses shape and the ──
      /api/transactions/search shape (flat category_name, transaction_date). */
const oldBuildRow = `  const buildRow = (item) => {
    const row = document.createElement('tr');
    row.dataset.category = item.category_id != null ? String(item.category_id) : '';
    row.dataset.expenseId = item.id;

    const dateCell = document.createElement('td');
    dateCell.className = 'col-tight';
    dateCell.dataset.label = 'Date';
    dateCell.textContent = UI.formatDate(item.expense_date);

    const descCell = document.createElement('td');
    descCell.className = 'cell-wrap';
    descCell.dataset.label = 'Description';
    const descMain = document.createElement('div');
    descMain.className = 'cell-main';
    descMain.textContent = item.description || (item.category ? item.category.name : 'Expense');
    descCell.appendChild(descMain);

    const catCell = document.createElement('td');
    catCell.className = 'col-tight';
    catCell.dataset.label = 'Category';
    const pill = document.createElement('span');
    pill.className = 'pill neutral';
    pill.textContent = item.category ? item.category.name : '—';
    if (item.category && item.category.name) pill.title = item.category.name;
    catCell.appendChild(pill);

    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-neg col-tight';
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = '-' + money(item.amount);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-tight actions-cell';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteExpense = '';
    deleteBtn.dataset.id = item.id;
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute(
      'aria-label',
      \`Delete expense: \${item.description || (item.category ? item.category.name : 'expense')} on \${UI.formatDate(item.expense_date)}\`
    );
    actions.appendChild(deleteBtn);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editExpense = '';
    editBtn.dataset.id = item.id;
    editBtn.textContent = 'Edit';
    editBtn.setAttribute(
      'aria-label',
      \`Edit expense: \${item.description || (item.category ? item.category.name : 'expense')} on \${UI.formatDate(item.expense_date)}\`
    );
    actions.appendChild(editBtn);
    actionsCell.appendChild(actions);

    row.append(dateCell, descCell, catCell, amountCell, actionsCell);
    return row;
  };`;

const newBuildRow = `  // A search result and a legacy /expenses row describe the same record in
  // slightly different shapes. Normalise both so one renderer covers them.
  const rowShape = (item) => {
    const isIncome = item.type === 'income';
    const categoryName = (item.category && item.category.name) || item.category_name || null;
    const date = item.transaction_date || item.expense_date || item.income_date || null;
    const label = isIncome
      ? item.source || item.description || 'Income'
      : item.description || categoryName || 'Expense';
    return { isIncome, categoryName, date, label, amount: item.amount };
  };

  const buildRow = (item) => {
    const { isIncome, categoryName, date, label } = rowShape(item);
    const row = document.createElement('tr');
    row.dataset.category = item.category_id != null ? String(item.category_id) : '';
    row.dataset.expenseId = item.id;
    row.dataset.type = isIncome ? 'income' : 'expense';

    const dateCell = document.createElement('td');
    dateCell.className = 'col-tight';
    dateCell.dataset.label = 'Date';
    dateCell.textContent = UI.formatDate(date);

    const descCell = document.createElement('td');
    descCell.className = 'cell-wrap';
    descCell.dataset.label = isIncome ? 'Source' : 'Description';
    const descMain = document.createElement('div');
    descMain.className = 'cell-main';
    descMain.textContent = label;
    descCell.appendChild(descMain);

    const catCell = document.createElement('td');
    catCell.className = 'col-tight';
    catCell.dataset.label = 'Category';
    const pill = document.createElement('span');
    pill.className = 'pill neutral';
    pill.textContent = isIncome ? 'Income' : categoryName || '—';
    if (categoryName) pill.title = categoryName;
    catCell.appendChild(pill);

    const amountCell = document.createElement('td');
    amountCell.className = 'num col-tight ' + (isIncome ? 'amount-pos' : 'amount-neg');
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = (isIncome ? '+' : '-') + money(item.amount);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-tight actions-cell';
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (isIncome) {
      const link = document.createElement('a');
      link.className = 'row-btn secondary';
      link.href = '../income-management/income.html';
      link.textContent = 'Manage';
      link.setAttribute('aria-label', \`Manage income: \${label} on \${UI.formatDate(date)}\`);
      actions.appendChild(link);
    } else {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'row-btn danger';
      deleteBtn.dataset.deleteExpense = '';
      deleteBtn.dataset.id = item.id;
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute(
        'aria-label',
        \`Delete expense: \${label} on \${UI.formatDate(date)}\`
      );
      actions.appendChild(deleteBtn);
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-btn secondary';
      editBtn.dataset.editExpense = '';
      editBtn.dataset.id = item.id;
      editBtn.textContent = 'Edit';
      editBtn.setAttribute(
        'aria-label',
        \`Edit expense: \${label} on \${UI.formatDate(date)}\`
      );
      actions.appendChild(editBtn);
    }

    actionsCell.appendChild(actions);
    row.append(dateCell, descCell, catCell, amountCell, actionsCell);
    return row;
  };`;

if (!head.includes(oldBuildRow)) {
  throw new Error('buildRow anchor not found');
}

const newHead = head.replace(oldBuildRow, newBuildRow);

/* ── 2. The list section itself ─────────────────────────────────────────── */
const listSection = `  // ── Advanced transaction search (server-side) ─────────────────────────
  // Filtering, sorting and pagination all happen on the server through the
  // owner-scoped /api/transactions/search endpoint. The page never guesses a
  // total: the paginator metadata is what the summary line reports.
  const searchState = {
    q: '',
    type: 'expense',
    from: '',
    to: '',
    min_amount: '',
    max_amount: '',
    category_id: '',
    sort: 'date_desc',
    per_page: 25,
    page: 1,
  };

  const searchMarkup = \`
    <div class="search-grid">
      <div class="field">
        <label for="expense-search-q">Search</label>
        <input id="expense-search-q" type="search" data-search-q placeholder="Description text" autocomplete="off" />
      </div>
      <div class="field">
        <label for="expense-search-type">Type</label>
        <select id="expense-search-type" data-search-type>
          <option value="expense">Expenses</option>
          <option value="income">Incomes</option>
          <option value="all">All transactions</option>
        </select>
      </div>
      <div class="field">
        <label for="expense-search-from">From</label>
        <input id="expense-search-from" type="date" data-search-from />
      </div>
      <div class="field">
        <label for="expense-search-to">To</label>
        <input id="expense-search-to" type="date" data-search-to />
      </div>
      <div class="field">
        <label for="expense-search-min">Min amount</label>
        <input id="expense-search-min" type="number" step="0.01" min="0" data-search-min-amount />
      </div>
      <div class="field">
        <label for="expense-search-max">Max amount</label>
        <input id="expense-search-max" type="number" step="0.01" min="0" data-search-max-amount />
      </div>
      <div class="field">
        <label for="expense-search-category">Category</label>
        <select id="expense-search-category" data-search-category>
          <option value="">All categories</option>
        </select>
      </div>
      <div class="field">
        <label for="expense-search-sort">Sort</label>
        <select id="expense-search-sort" data-search-sort>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="amount_desc">Largest amount</option>
          <option value="amount_asc">Smallest amount</option>
        </select>
      </div>
      <div class="field search-actions">
        <button class="btn primary sm" type="submit">Apply filters</button>
        <button class="btn secondary sm" type="button" data-search-clear>Clear all</button>
        <button class="btn ghost sm" type="button" data-search-export>Export CSV</button>
      </div>
    </div>
    <p class="control-note">
      Search runs on the server. Amounts are exact; the date range uses inclusive UTC calendar days.
    </p>
  \`;

  const searchForm = document.createElement('form');
  searchForm.className = 'search-panel';
  searchForm.setAttribute('role', 'search');
  searchForm.setAttribute('aria-label', 'Search transactions');
  searchForm.noValidate = true;
  searchForm.innerHTML = searchMarkup;

  // The search panel lives inside the list card, above the results table.
  if (tableWrap && tableWrap.parentElement) {
    tableWrap.parentElement.insertBefore(searchForm, tableWrap);
  }

  const searchInputs = {
    q: searchForm.querySelector('[data-search-q]'),
    type: searchForm.querySelector('[data-search-type]'),
    from: searchForm.querySelector('[data-search-from]'),
    to: searchForm.querySelector('[data-search-to]'),
    min: searchForm.querySelector('[data-search-min-amount]'),
    max: searchForm.querySelector('[data-search-max-amount]'),
    category: searchForm.querySelector('[data-search-category]'),
    sort: searchForm.querySelector('[data-search-sort]'),
    clear: searchForm.querySelector('[data-search-clear]'),
    export: searchForm.querySelector('[data-search-export]'),
  };

  const readSearchInputs = () => {
    searchState.q = searchInputs.q ? searchInputs.q.value.trim() : '';
    searchState.type = searchInputs.type ? searchInputs.type.value : 'expense';
    searchState.from = searchInputs.from ? searchInputs.from.value : '';
    searchState.to = searchInputs.to ? searchInputs.to.value : '';
    searchState.min_amount = searchInputs.min ? searchInputs.min.value : '';
    searchState.max_amount = searchInputs.max ? searchInputs.max.value : '';
    searchState.category_id = searchInputs.category ? searchInputs.category.value : '';
    searchState.sort = searchInputs.sort ? searchInputs.sort.value : 'date_desc';
  };

  const hasActiveFilters = () => Boolean(
    searchState.q ||
    searchState.from ||
    searchState.to ||
    searchState.min_amount ||
    searchState.max_amount ||
    searchState.category_id ||
    searchState.type !== 'expense'
  );

  // The card-head category filter drives the same server-side category filter.
  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      if (searchInputs.category) searchInputs.category.value = filterSelect.value;
      readSearchInputs();
      searchState.page = 1;
      loadTransactions(false);
    });
  }

  const buildSearchQuery = (includePage = true) => {
    const query = new URLSearchParams();
    if (searchState.q) query.set('q', searchState.q);
    if (searchState.type) query.set('type', searchState.type);
    if (searchState.from) query.set('from', searchState.from);
    if (searchState.to) query.set('to', searchState.to);
    if (searchState.min_amount) query.set('min_amount', searchState.min_amount);
    if (searchState.max_amount) query.set('max_amount', searchState.max_amount);
    if (searchState.category_id) query.set('category_id', searchState.category_id);
    if (searchState.sort) query.set('sort', searchState.sort);
    query.set('per_page', String(searchState.per_page));
    if (includePage) query.set('page', String(searchState.page));
    return query;
  };

  const exportSearchCsv = () => {
    const query = buildSearchQuery(false);
    query.delete('per_page');
    const meta = document.querySelector('meta[name="api-base-url"]');
    const base = meta ? meta.content : '';
    const link = document.createElement('a');
    link.href = \`\${base}/api/transactions/export?\${query.toString()}\`;
    link.rel = 'noopener';
    link.download = '';
    document.body.appendChild(link);
    link.click();
    link.remove();
    UI.showToast('CSV export started', 'info');
  };

  if (searchInputs.export) searchInputs.export.addEventListener('click', exportSearchCsv);

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    readSearchInputs();
    searchState.page = 1;
    loadTransactions(false);
  });

  if (searchInputs.clear) {
    searchInputs.clear.addEventListener('click', () => {
      if (searchInputs.q) searchInputs.q.value = '';
      if (searchInputs.type) searchInputs.type.value = 'expense';
      if (searchInputs.from) searchInputs.from.value = '';
      if (searchInputs.to) searchInputs.to.value = '';
      if (searchInputs.min) searchInputs.min.value = '';
      if (searchInputs.max) searchInputs.max.value = '';
      if (searchInputs.category) searchInputs.category.value = '';
      if (searchInputs.sort) searchInputs.sort.value = 'date_desc';
      if (filterSelect) filterSelect.value = '';
      readSearchInputs();
      searchState.page = 1;
      loadTransactions(false);
    });
  }

  if (searchInputs.sort) {
    searchInputs.sort.addEventListener('change', () => {
      readSearchInputs();
      searchState.page = 1;
      loadTransactions(false);
    });
  }

  if (searchInputs.category) {
    searchInputs.category.addEventListener('change', () => {
      if (filterSelect) filterSelect.value = searchInputs.category.value;
    });
  }

  // Populate the category select (expense categories only; income has no
  // category in this schema and the server rejects the combination).
  fetchExpenseCategories().then((categories) => {
    if (searchInputs.category) {
      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = String(category.id);
        option.textContent = category.name;
        searchInputs.category.appendChild(option);
      });
    }
    if (filterSelect) {
      categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = String(category.id);
        option.textContent = category.name;
        filterSelect.appendChild(option);
      });
    }
  });

  const showNoResults = () => {
    showState('empty', {
      message: hasActiveFilters()
        ? 'No transactions match your filters.'
        : 'No expenses yet. Log your first expense to see it here.',
      action: hasActiveFilters()
        ? undefined
        : { href: 'add-expense.html', label: 'Add an expense' },
    });
  };

  const updateSummary = () => {
    if (!summaryEl) return;
    if (!total) {
      summaryEl.textContent = '';
      return;
    }
    const filterNote = hasActiveFilters() ? ' matching your filters' : '';
    summaryEl.textContent = \`Showing \${loaded} of \${total} transactions\${filterNote}\`;
  };

  const setLoadMore = (visible) => {
    if (!loadMoreBtn) return;
    loadMoreBtn.hidden = !visible;
    const footer = loadMoreBtn.closest('.card-footer');
    if (footer) footer.hidden = !visible;
  };

  const showState = (type, options) => {
    if (tableWrap) tableWrap.hidden = true;
    if (stateEl) {
      stateEl.hidden = false;
      UI.renderState(stateEl, type, options);
    }
  };

  const showTable = () => {
    if (stateEl) stateEl.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
  };

  const showEmpty = () =>
    showState('empty', {
      message: 'No expenses yet. Log your first expense to see it here.',
      action: { href: 'add-expense.html', label: 'Add an expense' },
    });

  const renderRows = (items, append) => {
    if (!append) rowsBody.replaceChildren();
    items.forEach((item) => rowsBody.appendChild(buildRow(item)));
    loaded += items.length;
  };

  async function loadTransactions(append = false) {
    if (!append) {
      searchState.page = 1;
      total = 0;
      loaded = 0;
      setLoadMore(false);
      showState('loading', { message: 'Loading transactions…' });
    }

    const query = buildSearchQuery(true);

    try {
      const { data, status } = await api.get(\`/api/transactions/search?\${query.toString()}\`);

      if (status !== 200 || !data || !data.data) {
        if (append) {
          searchState.page -= 1;
          if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Load more';
          }
          UI.showToast((data && data.message) || 'Could not load more transactions.', 'error');
          return;
        }
        if (summaryEl) summaryEl.textContent = '';
        showState('error', {
          message: (data && data.message) || 'Could not load transactions.',
          retry: () => loadTransactions(false),
        });
        return;
      }

      const items = Array.isArray(data.data) ? data.data : [];
      const meta = data.meta || {};
      total = typeof meta.total === 'number' ? meta.total : items.length;
      lastPage = typeof meta.last_page === 'number' ? meta.last_page : 1;

      if (!append && !items.length) {
        updateSummary();
        showNoResults();
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = 'Load more';
        }
        return;
      }

      renderRows(items, append);
      showTable();
      updateSummary();

      setLoadMore(searchState.page < lastPage);
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load more';
      }
    } catch (err) {
      if (append) {
        searchState.page -= 1;
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = 'Load more';
        }
        UI.showToast('Could not load more transactions. ' + (err.message || ''), 'error');
        return;
      }
      if (summaryEl) summaryEl.textContent = '';
      showState('error', {
        message: 'Could not reach the API. ' + (err.message || ''),
        retry: () => loadTransactions(false),
      });
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      if (searchState.page >= lastPage) return;
      searchState.page += 1;
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading…';
      loadTransactions(true);
    });
  }

  if (table) {
    table.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-expense]');
      if (editButton) {
        window.location.href = \`add-expense.html?edit=\${encodeURIComponent(editButton.dataset.id)}\`;
        return;
      }

      const button = event.target.closest('[data-delete-expense]');
      if (!button) return;

      if (!window.confirm('Move this expense to Recently deleted? You can restore it later.')) return;

      button.disabled = true;
      try {
        const { data, status } = await api.delete(\`/expenses/\${button.dataset.id}\`);
        if (status === 204) {
          const row = button.closest('tr');
          if (row) row.remove();
          loaded = Math.max(0, loaded - 1);
          total = Math.max(0, total - 1);
          updateSummary();
          if (!rowsBody.querySelector('tr')) showNoResults();
          loadTrash();
          UI.showToast('Expense moved to Recently deleted', 'success');
        } else {
          button.disabled = false;
          UI.showToast((data && data.message) || 'Could not delete expense.', 'error');
        }
      } catch (err) {
        button.disabled = false;
        UI.showToast('Error deleting expense.', 'error');
      }
    });
  }

  async function loadTrash(append = false) {
    if (!trashCard || !trashRows) return;

    if (!append) {
      trashPage = 1;
      trashRows.replaceChildren();
    }

    try {
      const { data, status } = await api.get(\`/expenses/trash?page=\${trashPage}\`);
      const paginator = status === 200 && data && data.data ? data.data : null;
      const items = paginator ? paginator.data || [] : [];

      if (!append) trashRows.replaceChildren();
      items.forEach((item) => trashRows.appendChild(buildTrashRow(item)));

      if (!trashRows.querySelector('tr')) {
        trashCard.hidden = true;
        if (trashMoreBtn) trashMoreBtn.hidden = true;
        return;
      }

      trashCard.hidden = false;
      const lastTrashPage = paginator ? paginator.last_page || 1 : 1;
      if (trashMoreBtn) {
        trashMoreBtn.hidden = trashPage >= lastTrashPage;
        const footer = trashMoreBtn.closest('.card-footer');
        if (footer) footer.hidden = trashMoreBtn.hidden;
      }
    } catch (err) {
      if (append) {
        trashPage -= 1;
      } else {
        // The main expense list remains usable if the optional trash view fails.
        trashCard.hidden = true;
        if (trashMoreBtn) trashMoreBtn.hidden = true;
      }
    }
  }

  if (trashMoreBtn) {
    trashMoreBtn.addEventListener('click', () => {
      trashPage += 1;
      loadTrash(true);
    });
  }

  if (trashRows) {
    trashRows.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-restore-expense]');
      if (!button) return;

      button.disabled = true;
      try {
        const { data, status } = await api.post(\`/expenses/\${button.dataset.id}/restore\`);
        if (status === 200) {
          UI.showToast('Expense restored', 'success');
          await loadTrash();
          await loadTransactions(false);
        } else {
          button.disabled = false;
          UI.showToast((data && data.message) || 'Could not restore expense.', 'error');
        }
      } catch (err) {
        button.disabled = false;
        UI.showToast('Error restoring expense.', 'error');
      }
    });
  }

  loadTransactions(false);
  loadTrash();
});
`;

fs.writeFileSync(target, newHead + listSection, 'utf8');
console.log('expenses.js list section replaced');
