// Income management — API-backed (income.html form + history list).
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);

  // Frequency slugs stored by the API → human labels for the history list.
  const FREQUENCY_LABELS = {
    'one-time': 'One-time',
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    'half-yearly': 'Half-yearly',
    yearly: 'Yearly',
  };
  const DEFAULT_FREQUENCY = 'one-time';

  // ---------- Income form (create + edit) ----------
  const form = document.querySelector('.income-form');
  const formMessage = document.querySelector('.income-message');
  const dateInput = form ? form.querySelector('#date') : null;
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const cancelEditBtn = document.querySelector('[data-cancel-edit]');
  let editingIncomeId = null;

  const setMessage = (text, type) => {
    if (!formMessage) return;
    formMessage.textContent = text || '';
    formMessage.classList.remove('error', 'success');
    if (type) formMessage.classList.add(type);
  };

  // First human-readable detail from a JSON error payload.
  const errorDetail = (data, fallback) => {
    if (data && data.errors) {
      const first = Object.values(data.errors)[0];
      if (Array.isArray(first) && first.length) return first[0];
    }
    return (data && data.message) || fallback;
  };

  const exitEditMode = () => {
    editingIncomeId = null;
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    if (submitBtn) submitBtn.textContent = 'Save income';
  };

  const enterEditMode = (income) => {
    if (!form) return;
    editingIncomeId = income.id;

    const sourceSelect = form.querySelector('#source');
    const amountInput = form.querySelector('#amount');
    const frequencySelect = form.querySelector('#frequency');
    const notesInput = form.querySelector('#notes');

    if (sourceSelect) {
      const source = income.source != null ? String(income.source) : '';
      let option = Array.from(sourceSelect.options).find((item) => item.value === source || item.text === source);
      if (!option && source) {
        option = document.createElement('option');
        option.value = source;
        option.textContent = source;
        sourceSelect.appendChild(option);
      }
      sourceSelect.value = source;
    }
    if (amountInput) amountInput.value = income.amount;
    if (dateInput) dateInput.value = String(income.income_date || '').slice(0, 10);

    if (frequencySelect) {
      const frequency = income.frequency ? String(income.frequency) : DEFAULT_FREQUENCY;
      const option = Array.from(frequencySelect.options).find((item) => item.value === frequency);
      frequencySelect.value = option ? frequency : DEFAULT_FREQUENCY;
    }
    if (notesInput) notesInput.value = income.notes || '';

    if (submitBtn) submitBtn.textContent = 'Update income';
    if (cancelEditBtn) cancelEditBtn.hidden = false;
    setMessage('Editing this entry — save to update it.');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const resetDateInput = () => {
    if (!dateInput) return;
    dateInput.value = (window.SpendSenseSettings && window.SpendSenseSettings.todayInputValue)
      ? window.SpendSenseSettings.todayInputValue()
      : new Date().toISOString().slice(0, 10);
  };

  if (dateInput && !dateInput.value) resetDateInput();

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      resetDateInput();
      exitEditMode();
      setMessage('');
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.submitting === 'true') return; // block double submits

      const sourceSelect = form.querySelector('#source');
      const amountInput = form.querySelector('#amount');
      const frequencySelect = form.querySelector('#frequency');
      const notesInput = form.querySelector('#notes');

      const source = sourceSelect
        ? (sourceSelect.value || sourceSelect.options[sourceSelect.selectedIndex].text || '').trim()
        : '';
      const amount = parseFloat(amountInput.value);
      const incomeDate = dateInput.value; // YYYY-MM-DD (backend income_date)
      const frequency = frequencySelect ? frequencySelect.value || DEFAULT_FREQUENCY : DEFAULT_FREQUENCY;
      const notes = notesInput ? notesInput.value.trim() || null : null;

      if (!source || source === 'Choose source') return setMessage('Please select an income source.', 'error');
      if (isNaN(amount) || amount <= 0) return setMessage('Please enter a valid amount.', 'error');
      if (!incomeDate) return setMessage('Please pick a date.', 'error');

      setMessage(editingIncomeId ? 'Updating income…' : 'Saving income…');
      form.dataset.submitting = 'true';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = {
          source,
          amount,
          income_date: incomeDate,
          frequency,
          notes,
        };

        const { data, status } = editingIncomeId
          ? await api.put(`/incomes/${editingIncomeId}`, payload)
          : await api.post('/incomes', payload);

        if (editingIncomeId ? status === 200 : status === 201) {
          setMessage(editingIncomeId ? 'Income updated.' : data.message || 'Income saved!', 'success');
          UI.showToast(editingIncomeId ? 'Income updated' : 'Income saved', 'success');
          form.reset();
          resetDateInput();
          exitEditMode();
          loadIncomes();
        } else {
          setMessage(errorDetail(data, editingIncomeId ? 'Failed to update income.' : 'Failed to save income.'), 'error');
        }
      } catch (err) {
        setMessage('Error saving income. ' + (err.message || ''), 'error');
      } finally {
        form.dataset.submitting = 'false';
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ---------- Income history list ----------
  const rowsBody = document.querySelector('[data-income-rows]');
  if (!rowsBody) return;

  const table = document.querySelector('[data-income-table]');
  const tableWrap = document.querySelector('[data-income-table-wrap]');
  const stateEl = document.querySelector('[data-income-state]');
  const summaryEl = document.querySelector('[data-income-summary]');
  const loadMoreBtn = document.querySelector('[data-income-load-more]');
  const searchInput = document.querySelector('[data-income-search]');
  const startDateInput = document.querySelector('[data-income-from]');
  const endDateInput = document.querySelector('[data-income-to]');
  const sortButtons = Array.from(document.querySelectorAll('[data-sort-field]'));
  const clearFiltersBtn = document.querySelector('[data-clear-filters]');
  const filterNote = document.querySelector('[data-filter-note]');

  const transactions = window.SpendSenseTransactions;
  const PAGE_SIZE = 15; // Matches the existing paginated API page size.
  const FILTER_STORAGE_KEY = 'spendsense.income.filters.v1';

  const state = {
    items: [],
    total: 0,
    visibleCount: PAGE_SIZE,
    sortKey: 'date-desc',
    filters: transactions ? transactions.emptyFilters() : { search: '', startDate: '', endDate: '' },
    invalidRange: false,
  };
  const incomeById = new Map();

  const inferFilterNote = () => {
    if (!state.invalidRange) return '';
    return 'End date must be on or after start date. Date filtering is off until the range is valid.';
  };

  const setErrorNote = (message) => {
    if (!filterNote) return;
    filterNote.textContent = message || '';
    filterNote.hidden = !message;
  };

  // Keep the active filters while the user is editing, so returning to this
  // history preserves the same view.
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
      filters.startDate = '';
      filters.endDate = '';
    }
    return filters;
  };

  const computeRows = () => {
    if (!transactions) return [];
    const rows = transactions.filterTransactions(state.items, readEffectiveFilters(), {
      dateField: 'income_date',
      searchFields: ['source', 'notes'],
    });
    return transactions.sortTransactions(rows, state.sortKey, 'income_date');
  };

  const applyStateToControls = () => {
    if (searchInput) searchInput.value = state.filters.search;
    if (startDateInput) startDateInput.value = state.filters.startDate;
    if (endDateInput) endDateInput.value = state.filters.endDate;
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
      return 'No income logged yet. Add your first entry.';
    }
    return 'No income matches these filters. Try clearing a filter or widening the date range.';
  };

  const buildRow = (item) => {
    const row = document.createElement('tr');
    row.dataset.incomeId = item.id;

    const dateCell = document.createElement('td');
    dateCell.className = 'col-tight';
    dateCell.dataset.label = 'Date';
    dateCell.textContent = UI.formatDate(item.income_date);

    const sourceCell = document.createElement('td');
    sourceCell.className = 'cell-wrap';
    sourceCell.dataset.label = 'Source';
    const sourceMain = document.createElement('div');
    sourceMain.className = 'cell-main';
    sourceMain.textContent = item.source || 'Income';
    sourceCell.appendChild(sourceMain);

    if (item.notes) {
      const notesEl = document.createElement('div');
      notesEl.className = 'cell-sub';
      notesEl.textContent = item.notes;
      sourceCell.appendChild(notesEl);
      sourceMain.title = item.notes;
    }

    const freqCell = document.createElement('td');
    freqCell.className = 'col-tight';
    freqCell.dataset.label = 'Frequency';
    const isRecurring = item.frequency && item.frequency !== 'one-time';
    const freqPill = document.createElement('span');
    freqPill.className = 'pill ' + (isRecurring ? 'recurring' : 'onetime');
    const freqLabel = item.frequency ? (FREQUENCY_LABELS[item.frequency] || String(item.frequency)) : 'One-time';
    freqPill.textContent = (isRecurring ? '↻ ' : '') + freqLabel;
    freqCell.appendChild(freqPill);

    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-pos col-tight';
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = '+' + money(item.amount);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-tight actions-cell';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editIncome = '';
    editBtn.dataset.id = item.id;
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteIncome = '';
    deleteBtn.dataset.id = item.id;
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);
    actionsCell.appendChild(actions);

    row.append(dateCell, sourceCell, freqCell, amountCell, actionsCell);
    return row;
  };

  const renderRows = (items) => {
    rowsBody.replaceChildren();
    items.forEach((item) => rowsBody.appendChild(buildRow(item)));
  };

  const updateSummary = (visibleCount, totalCount) => {
    if (!summaryEl) return;
    const filtersActive = transactions.hasActiveFilters(readEffectiveFilters());
    const noun = filtersActive ? 'matching entries' : 'entries';
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
    applyStateToControls();
    state.visibleCount = PAGE_SIZE;
    saveFilterState();
    render();
  };

  loadStoredFilterState();
  applyStateToControls();

  if (searchInput) searchInput.addEventListener('input', refreshFromControls);
  if (startDateInput) startDateInput.addEventListener('change', refreshFromControls);
  if (endDateInput) endDateInput.addEventListener('change', refreshFromControls);

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
      state.visibleCount = PAGE_SIZE;
      applyStateToControls();
      saveFilterState();
      render();
    });
  }

  if (table) {
    table.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-income]');
      if (editButton) {
        const income = incomeById.get(String(editButton.dataset.id));
        if (income && form) {
          enterEditMode(income);
        } else {
          UI.showToast('Could not load that entry for editing.', 'error');
        }
        return;
      }

      const button = event.target.closest('[data-delete-income]');
      if (!button) return;

      if (!window.confirm('Delete this income entry? This cannot be undone.')) return;

      button.disabled = true;
      try {
        const { data, status } = await api.delete(`/incomes/${button.dataset.id}`);
        if (status === 204) {
          const id = String(button.dataset.id);
          state.items = state.items.filter((item) => String(item.id) !== id);
          incomeById.delete(id);
          saveFilterState();
          render();
          UI.showToast('Income deleted', 'success');
        } else {
          button.disabled = false;
          UI.showToast((data && data.message) || 'Could not delete income.', 'error');
        }
      } catch (err) {
        button.disabled = false;
        UI.showToast('Error deleting income.', 'error');
      }
    });
  }

  // Load the full income dataset from the existing paginated API so filters,
  // search, and sorting apply to a complete, consistent snapshot.
  async function loadIncomes() {
    showState('loading', { message: 'Loading income…' });
    try {
      const firstPage = await api.get('/incomes?page=1');
      if (!firstPage || firstPage.status !== 200 || !firstPage.data || !firstPage.data.data) {
        throw new Error((firstPage.data && firstPage.data.message) || 'Could not load income entries.');
      }

      const paginator = firstPage.data.data;
      const firstItems = Array.isArray(paginator.data) ? paginator.data : [];
      const lastPage = paginator.last_page || 1;
      const pageRequests = [];
      for (let page = 2; page <= lastPage; page += 1) {
        pageRequests.push(api.get(`/incomes?page=${page}`));
      }
      const otherPages = await Promise.all(pageRequests);
      const missingPage = otherPages.find(
        (response) => !response || response.status !== 200 || !response.data || !response.data.data
      );
      if (missingPage) {
        throw new Error((missingPage.data && missingPage.data.message) || 'Could not load all income entries.');
      }

      state.items = otherPages.reduce(
        (accumulated, response) => accumulated.concat(response.data.data.data || []),
        firstItems
      );
      incomeById.clear();
      state.items.forEach((item) => incomeById.set(String(item.id), item));
      state.total = state.items.length;
      state.visibleCount = PAGE_SIZE;
      applyStateToControls();
      render();
    } catch (err) {
      showState('error', {
        message: err && err.message ? err.message : 'Could not reach the API to load income entries.',
        retry: () => loadIncomes(),
      });
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      state.visibleCount = Math.min(state.items.length, state.visibleCount + PAGE_SIZE);
      render();
    });
  }

  loadIncomes();
});
