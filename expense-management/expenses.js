// Expense management — API-backed (expenses.html list + add-expense.html form).
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);

  const messageDiv = document.querySelector('[data-expense-message]');
  const setMessage = (text, type) => {
    if (!messageDiv) return;
    messageDiv.textContent = text || '';
    messageDiv.classList.remove('error', 'success');
    if (type) messageDiv.classList.add(type);
  };

  // Shared: every category the API returns (income + expense).
  async function fetchCategories() {
    try {
      const { data, status } = await api.get('/categories');
      if (status !== 200 || !data || !data.data) return [];
      return data.data;
    } catch (e) {
      return [];
    }
  }

  // Expense-type categories for selects and filters.
  async function fetchExpenseCategories() {
    const categories = await fetchCategories();
    return categories.filter((category) => category.type === 'expense');
  }

  // ---------- Add / edit expense form (add-expense.html) ----------
  const addForm = document.querySelector('.expense-form');
  if (addForm) {
    const amountInput = addForm.querySelector('#amount');
    const categorySelect = addForm.querySelector('#category');
    const descInput = addForm.querySelector('#description');
    const dateInput = addForm.querySelector('#date');
    const submitBtn = addForm.querySelector('button[type="submit"]');
    const customField = addForm.querySelector('[data-custom-category]');
    const customInput = addForm.querySelector('#custom-category');
    const createCategoryBtn = addForm.querySelector('[data-create-category]');
    const cancelCategoryBtn = addForm.querySelector('[data-cancel-category]');
    const customMessage = addForm.querySelector('[data-custom-category-message]');
    const editId = new URLSearchParams(window.location.search).get('edit');

    // Sentinel value for the "Other (add new)…" option; never sent to the API.
    const CUSTOM_CATEGORY = '__other__';
    let editingExpenseId = null;
    let allCategories = [];       // both types, used for duplicate detection
    let lastCategoryValue = '';   // last real selection, restored when cancelling
    let creatingCategory = false; // blocks duplicate category creation

    const resetExpenseDate = () => {
      if (!dateInput) return;
      dateInput.value = (window.SpendSenseSettings && window.SpendSenseSettings.todayInputValue)
        ? window.SpendSenseSettings.todayInputValue()
        : new Date().toISOString().slice(0, 10);
    };

    if (dateInput && !dateInput.value) resetExpenseDate();

    // First human-readable detail from a JSON error payload.
    const errorDetail = (data, fallback) => {
      if (data && data.errors) {
        const first = Object.values(data.errors)[0];
        if (Array.isArray(first) && first.length) return first[0];
      }
      return (data && data.message) || fallback;
    };

    const setCustomMessage = (text, type) => {
      if (!customMessage) return;
      customMessage.textContent = text || '';
      customMessage.classList.remove('error', 'success');
      if (type) customMessage.classList.add(type);
    };

    // Explicit custom-category mode: only active while "Other (add new)…"
    // is selected; leaving the mode always clears any stale name/message.
    const setCustomMode = (active) => {
      if (!customField) return;
      customField.hidden = !active;
      if (customInput) {
        customInput.required = active;
        if (active) {
          customInput.setAttribute('pattern', '[^\\s].*');
        } else {
          customInput.removeAttribute('pattern');
        }
      }
      if (active) {
        if (customInput) customInput.focus();
      } else {
        if (customInput) customInput.value = '';
        setCustomMessage('');
      }
    };

    const findExistingCategory = (name) => {
      const normalized = name.trim().toLowerCase();
      return allCategories.find((category) => String(category.name).trim().toLowerCase() === normalized) || null;
    };

    const selectCategory = (category) => {
      if (!categorySelect) return;
      const value = String(category.id);
      if (!categorySelect.querySelector(`option[value="${value}"]`)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = category.name;
        categorySelect.appendChild(option);
      }
      categorySelect.value = value;
      lastCategoryValue = value;
      setCustomMode(false);
    };

    // Creates an expense category through the existing category API and
    // selects it. Resolves with a user-facing error string, or null on success.
    const createCustomCategory = async () => {
      if (!customInput) return 'Please enter a category name.';
      const name = customInput.value.trim();
      if (!name) return 'Please enter a category name.';
      if (creatingCategory) return null;

      // Reuse an existing category instead of creating a duplicate.
      const existing = findExistingCategory(name);
      if (existing) {
        if (existing.type === 'expense') {
          selectCategory(existing);
          setMessage(`"${existing.name}" already exists — it is now selected.`, 'success');
          return null;
        }
        return `A category named "${existing.name}" already exists under income categories.`;
      }

      creatingCategory = true;
      if (createCategoryBtn) createCategoryBtn.disabled = true;
      setCustomMessage('Creating category…');

      try {
        const { data, status } = await api.post('/categories', { name, type: 'expense' });
        if (status === 201 && data && data.data) {
          const created = data.data;
          allCategories.push(created);
          selectCategory(created);
          setMessage(`Category "${created.name}" added and selected.`, 'success');
          UI.showToast('Category added', 'success');
          return null;
        }
        if (status === 401) return 'Your session may have expired. Please sign in again.';
        return errorDetail(data, 'Could not create that category. Please try again.');
      } catch (err) {
        return 'Could not reach the API to create that category.';
      } finally {
        creatingCategory = false;
        if (createCategoryBtn) createCategoryBtn.disabled = false;
      }
    };

    const enterEditMode = (expense) => {
      editingExpenseId = expense.id;
      if (amountInput) amountInput.value = expense.amount;
      if (descInput) descInput.value = expense.description || '';
      if (dateInput) dateInput.value = String(expense.expense_date || '').slice(0, 10);
      if (categorySelect) {
        const categoryValue = String(expense.category_id);
        if (!categorySelect.querySelector(`option[value="${categoryValue}"]`)) {
          const option = document.createElement('option');
          option.value = categoryValue;
          option.textContent = expense.category ? expense.category.name : `Category #${categoryValue}`;
          categorySelect.appendChild(option);
        }
        categorySelect.value = categoryValue;
        lastCategoryValue = categoryValue;
      }
      if (submitBtn) submitBtn.textContent = 'Update expense';
      const topbarTitle = document.querySelector('.topbar-title');
      const topbarSub = document.querySelector('.topbar-sub');
      if (topbarTitle) topbarTitle.textContent = 'Edit expense';
      if (topbarSub) topbarSub.textContent = 'Update an existing expense';
      document.title = 'Edit expense | SpendSense';
      setMessage('Editing this expense — save to update it.');
    };

    fetchCategories().then(async (categories) => {
      allCategories = categories;
      const expenseCategories = categories.filter((category) => category.type === 'expense');
      if (categorySelect) {
        categorySelect.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose category';
        categorySelect.appendChild(placeholder);
        expenseCategories.forEach((category) => {
          const option = document.createElement('option');
          option.value = String(category.id);
          option.textContent = category.name;
          categorySelect.appendChild(option);
        });
        // "Other" is a creation shortcut, not a stored category: the typed
        // name is saved as a real category before the expense is posted.
        const otherOption = document.createElement('option');
        otherOption.value = CUSTOM_CATEGORY;
        otherOption.textContent = 'Other (add new)…';
        categorySelect.appendChild(otherOption);
        lastCategoryValue = categorySelect.value;
      }

      // Edit mode: ?edit=<id> loads the record into this form (verified show route).
      if (!editId) return;
      try {
        const { data, status } = await api.get(`/expenses/${encodeURIComponent(editId)}`);
        if (status === 200 && data && data.data) {
          enterEditMode(data.data);
        } else {
          setMessage(errorDetail(data, 'Could not load that expense for editing.'), 'error');
        }
      } catch (err) {
        setMessage('Could not reach the API to load that expense.', 'error');
      }
    });

    if (categorySelect) {
      categorySelect.addEventListener('change', () => {
        if (categorySelect.value === CUSTOM_CATEGORY) {
          setCustomMode(true);
        } else {
          lastCategoryValue = categorySelect.value;
          setCustomMode(false);
        }
      });
    }

    if (customInput) {
      customInput.addEventListener('input', () => setCustomMessage(''));
      customInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        // Enter creates the category instead of submitting the expense.
        event.preventDefault();
        if (createCategoryBtn) createCategoryBtn.click();
      });
    }

    if (createCategoryBtn) {
      createCategoryBtn.addEventListener('click', async () => {
        if (customInput) customInput.value = customInput.value.trim();
        const error = await createCustomCategory();
        if (error) {
          setCustomMessage(error, 'error');
          if (customInput) customInput.focus();
        }
      });
    }

    if (cancelCategoryBtn) {
      cancelCategoryBtn.addEventListener('click', () => {
        setCustomMode(false);
        if (categorySelect) categorySelect.value = lastCategoryValue;
        setMessage('');
      });
    }

    addForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (addForm.dataset.submitting === 'true') return; // block double submits
      addForm.dataset.submitting = 'true';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const amount = parseFloat(amountInput.value);
        const description = descInput && descInput.value.trim() ? descInput.value.trim() : null;
        const expenseDate = dateInput.value; // YYYY-MM-DD (backend expense_date)

        if (isNaN(amount) || amount <= 0) {
          setMessage('Please enter a valid amount.', 'error');
          return;
        }
        if (!expenseDate) {
          setMessage('Please pick a date.', 'error');
          return;
        }

        // A pending custom name is created (and selected) before the expense
        // is sent, so the API always receives a real integer category id.
        if (categorySelect && categorySelect.value === CUSTOM_CATEGORY) {
          if (customInput) customInput.value = customInput.value.trim();
          const error = await createCustomCategory();
          if (error) {
            setCustomMessage(error, 'error');
            if (customInput) customInput.focus();
            return;
          }
        }

        const categoryId = parseInt(categorySelect.value, 10);
        if (isNaN(categoryId)) {
          setMessage('Please select a category.', 'error');
          return;
        }

        setMessage(editingExpenseId ? 'Updating expense…' : 'Logging expense…');

        const payload = {
          amount,
          category_id: categoryId,
          expense_date: expenseDate,
          description,
        };

        const { data, status } = editingExpenseId
          ? await api.put(`/expenses/${editingExpenseId}`, payload)
          : await api.post('/expenses', payload);

        if (editingExpenseId ? status === 200 : status === 201) {
          setMessage(editingExpenseId ? 'Expense updated.' : data.message || 'Expense logged!', 'success');
          UI.showToast(editingExpenseId ? 'Expense updated' : 'Expense saved', 'success');
          if (editingExpenseId) {
            // Back to the list, which reloads from the API.
            setTimeout(() => {
              window.location.href = 'expenses.html';
            }, 900);
            return;
          }
          addForm.reset();
          resetExpenseDate();
          if (categorySelect) lastCategoryValue = categorySelect.value;
        } else {
          setMessage(errorDetail(data, editingExpenseId ? 'Failed to update expense.' : 'Failed to log expense.'), 'error');
        }
      } catch (err) {
        setMessage('Error saving expense. ' + (err.message || ''), 'error');
      } finally {
        addForm.dataset.submitting = 'false';
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ---------- Expense list (expenses.html) ----------
  const rowsBody = document.querySelector('[data-expense-rows]');
  if (!rowsBody) return;

  const table = document.querySelector('[data-expense-table]');
  const tableWrap = document.querySelector('[data-expense-table-wrap]');
  const stateEl = document.querySelector('[data-expense-state]');
  const summaryEl = document.querySelector('[data-list-summary]');
  const loadMoreBtn = document.querySelector('[data-load-more]');
  const filterSelect = document.querySelector('[data-category-filter]');
  const searchInput = document.querySelector('[data-expense-search]');
  const startDateInput = document.querySelector('[data-expense-from]');
  const endDateInput = document.querySelector('[data-expense-to]');
  const sortButtons = Array.from(document.querySelectorAll('[data-sort-field]'));
  const clearFiltersBtn = document.querySelector('[data-clear-filters]');
  const filterNote = document.querySelector('[data-filter-note]');

  const transactions = window.SpendSenseTransactions;
  const PAGE_SIZE = 15; // Matches the existing paginated API page size.
  const FILTER_STORAGE_KEY = 'spendsense.expenses.filters.v1';

  const state = {
    items: [],
    total: 0,
    visibleCount: PAGE_SIZE,
    sortKey: 'date-desc',
    filters: transactions ? transactions.emptyFilters() : { search: '', startDate: '', endDate: '', categoryId: '' },
    invalidRange: false,
  };

  const inferFilterNote = () => {
    if (!state.invalidRange) return '';
    return 'End date must be on or after start date. Date filtering is off until the range is valid.';
  };

  const setErrorNote = (message) => {
    if (!filterNote) return;
    filterNote.textContent = message || '';
    filterNote.hidden = !message;
  };

  // Preserve the active filters while navigating to edit pages, so returning
  // to the list restores the same view after saving or cancelling.
  const saveFilterState = () => {
    if (!window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        filters: state.filters,
        sortKey: state.sortKey,
      }));
    } catch (err) {
      // Storage being unavailable must not break filtering.
    }
  };

  const loadStoredFilterState = () => {
    if (!window.sessionStorage || !transactions) return;
    try {
      const raw = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        if (saved.filters && typeof saved.filters === 'object') {
          state.filters = {
            search: typeof saved.filters.search === 'string' ? saved.filters.search : '',
            startDate: typeof saved.filters.startDate === 'string' ? saved.filters.startDate : '',
            endDate: typeof saved.filters.endDate === 'string' ? saved.filters.endDate : '',
            categoryId: saved.filters.categoryId == null ? '' : String(saved.filters.categoryId),
          };
        }
        if (typeof saved.sortKey === 'string') state.sortKey = saved.sortKey;
      }
    } catch (err) {
      // Ignore malformed saved state and fall back to defaults.
    }
  };

  const readEffectiveFilters = () => {
    const filters = { ...state.filters };
    if (state.invalidRange) {
      // Never silently pretend an invalid date range filtered to a clean,
      // empty result: instead, leave date filtering off until the range is
      // corrected, and the page shows the reason in the persisted note.
      filters.startDate = '';
      filters.endDate = '';
    }
    return filters;
  };

  const computeRows = () => {
    if (!transactions) return [];
    const rows = transactions.filterTransactions(state.items, readEffectiveFilters(), {
      dateField: 'expense_date',
      categoryField: 'category_id',
      searchFields: ['description', 'category.name'],
    });
    return transactions.sortTransactions(rows, state.sortKey, 'expense_date');
  };

  const applyStateToControls = () => {
    if (searchInput) searchInput.value = state.filters.search;
    if (startDateInput) startDateInput.value = state.filters.startDate;
    if (endDateInput) endDateInput.value = state.filters.endDate;
    if (filterSelect) filterSelect.value = state.filters.categoryId;
    sortButtons.forEach((btn) => {
      const field = btn.dataset.sortField;
      const active = state.sortKey.startsWith(field);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      const descending = state.sortKey.endsWith('-desc');
      btn.setAttribute('aria-label', `Sort by ${field} ${descending ? 'newest first' : 'oldest first'}`);
      const labelNode = btn.querySelector('[data-sort-label]');
      if (labelNode) labelNode.textContent = `${field === 'date' ? 'Date' : 'Amount'} ${descending ? '↓' : '↑'}`;
    });
    state.invalidRange = Boolean(
      state.filters.startDate
      && state.filters.endDate
      && state.filters.endDate < state.filters.startDate
    );
    setErrorNote(inferFilterNote());
    if (clearFiltersBtn) clearFiltersBtn.hidden = !transactions.hasActiveFilters(state.filters);
  };

  const buildRow = (item) => {
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
    if (item.category && item.category.name) {
      const tone = window.SpendSenseSettings.getCategoryTone(item.category);
      pill.className = 'pill';
      pill.style.backgroundColor = tone.bgSubtle || (tone.color + '18');
      pill.style.color = tone.color;
      const dot = document.createElement('span');
      dot.className = 'dot ' + tone.toneName;
      dot.style.backgroundColor = tone.color;
      pill.append(dot, document.createTextNode(' ' + item.category.name));
      pill.title = item.category.name;
    } else {
      pill.className = 'pill neutral';
      pill.textContent = '—';
    }
    catCell.appendChild(pill);

    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-neg col-tight';
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = '-' + money(item.amount);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-tight actions-cell';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editExpense = '';
    editBtn.dataset.id = item.id;
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteExpense = '';
    deleteBtn.dataset.id = item.id;
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);
    actionsCell.appendChild(actions);

    row.append(dateCell, descCell, catCell, amountCell, actionsCell);
    return row;
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

  const emptyMessage = () => {
    if (!transactions.hasActiveFilters(readEffectiveFilters())) {
      return 'No expenses yet. Log your first expense to see it here.';
    }
    return 'No expenses match these filters. Try clearing a filter or widening the date range.';
  };

  const renderRows = (items) => {
    rowsBody.replaceChildren();
    items.forEach((item) => rowsBody.appendChild(buildRow(item)));
  };

  const updateSummary = (visibleCount, totalCount) => {
    if (!summaryEl) return;
    const filtersActive = transactions.hasActiveFilters(readEffectiveFilters());
    const noun = filtersActive ? 'matching expenses' : 'expenses';
    if (!totalCount) {
      summaryEl.textContent = '';
      return;
    }
    summaryEl.textContent = `Showing ${visibleCount} of ${totalCount} ${noun}`;
  };

  const render = () => {
    const sorted = computeRows();
    state.total = state.items.length;
    const visible = sorted.slice(0, state.visibleCount);
    if (visible.length) {
      renderRows(visible);
      showTable();
    } else {
      showState('empty', { message: emptyMessage() });
    }

    updateSummary(visible.length, sorted.length);
    if (loadMoreBtn) {
      loadMoreBtn.hidden = visible.length >= sorted.length;
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load more';
      const footer = loadMoreBtn.closest('.card-footer');
      if (footer) footer.hidden = !visible.length || visible.length >= sorted.length;
    }
  };

  const refreshFromControls = () => {
    if (searchInput) state.filters.search = searchInput.value;
    if (startDateInput) state.filters.startDate = startDateInput.value;
    if (endDateInput) state.filters.endDate = endDateInput.value;
    if (filterSelect) state.filters.categoryId = filterSelect.value;
    applyStateToControls();
    state.visibleCount = PAGE_SIZE;
    saveFilterState();
    render();
  };

  // Populate the category filter (expense categories only).
  fetchExpenseCategories().then((categories) => {
    if (!filterSelect) return;
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = String(category.id);
      option.textContent = category.name;
      filterSelect.appendChild(option);
    });

    const selected = state.filters.categoryId;
    if (selected && !filterSelect.querySelector(`option[value="${selected}"]`)) {
      state.filters.categoryId = '';
      if (filterNote) {
        setErrorNote('Category filter cleared — that category is no longer available.');
      }
    }
    applyStateToControls();
  });

  loadStoredFilterState();
  applyStateToControls();

  if (searchInput) searchInput.addEventListener('input', refreshFromControls);
  if (startDateInput) startDateInput.addEventListener('change', refreshFromControls);
  if (endDateInput) endDateInput.addEventListener('change', refreshFromControls);
  if (filterSelect) filterSelect.addEventListener('change', refreshFromControls);

  sortButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.sortField;
      const isSameField = state.sortKey.startsWith(field);
      state.sortKey = isSameField && state.sortKey.endsWith('-desc')
        ? `${field}-asc`
        : `${field}-desc`;
      applyStateToControls();
      saveFilterState();
      render();
    });
  });

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
      state.filters = transactions.emptyFilters();
      if (searchInput) searchInput.value = '';
      if (startDateInput) startDateInput.value = '';
      if (endDateInput) endDateInput.value = '';
      if (filterSelect) filterSelect.value = '';
      state.visibleCount = PAGE_SIZE;
      applyStateToControls();
      saveFilterState();
      render();
    });
  }

  if (table) {
    table.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-expense]');
      if (editButton) {
        saveFilterState();
        window.location.href = `add-expense.html?edit=${encodeURIComponent(editButton.dataset.id)}`;
        return;
      }

      const button = event.target.closest('[data-delete-expense]');
      if (!button) return;

      if (!window.confirm('Delete this expense? This cannot be undone.')) return;

      button.disabled = true;
      try {
        const { data, status } = await api.delete(`/expenses/${button.dataset.id}`);
        if (status === 204) {
          const id = String(button.dataset.id);
          state.items = state.items.filter((item) => String(item.id) !== id);
          saveFilterState();
          render();
          UI.showToast('Expense deleted', 'success');
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

  // Load the full expense dataset from the existing paginated API, so client
  // filters, search, and sorting never mislead the user about records that
  // have not been fetched yet.
  async function loadExpenses() {
    showState('loading', { message: 'Loading expenses…' });
    try {
      const firstPage = await api.get('/expenses?page=1');
      if (!firstPage || firstPage.status !== 200 || !firstPage.data || !firstPage.data.data) {
        throw new Error((firstPage.data && firstPage.data.message) || 'Could not load expenses.');
      }

      const paginator = firstPage.data.data;
      const firstItems = Array.isArray(paginator.data) ? paginator.data : [];
      const lastPage = paginator.last_page || 1;
      const pageRequests = [];
      for (let page = 2; page <= lastPage; page += 1) {
        pageRequests.push(api.get(`/expenses?page=${page}`));
      }
      const otherPages = await Promise.all(pageRequests);
      const missingPage = otherPages.find(
        (response) => !response || response.status !== 200 || !response.data || !response.data.data
      );
      if (missingPage) {
        throw new Error((missingPage.data && missingPage.data.message) || 'Could not load all expenses.');
      }

      state.items = otherPages.reduce(
        (accumulated, response) => accumulated.concat(response.data.data.data || []),
        firstItems
      );
      state.total = state.items.length;
      state.visibleCount = PAGE_SIZE;
      applyStateToControls();
      render();
    } catch (err) {
      showState('error', {
        message: err && err.message ? err.message : 'Could not reach the API to load expenses.',
        retry: () => loadExpenses(),
      });
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      state.visibleCount = Math.min(state.items.length, state.visibleCount + PAGE_SIZE);
      render();
    });
  }

  loadExpenses();
});
