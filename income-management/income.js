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

  if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      if (dateInput) dateInput.valueAsDate = new Date();
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
          if (dateInput) dateInput.valueAsDate = new Date();
          exitEditMode();
          loadIncomes(false);
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

  let nextPage = 1;
  let lastPage = 1;
  let total = 0;
  let loaded = 0;
  const incomeById = new Map();

  const updateSummary = () => {
    if (summaryEl) summaryEl.textContent = total ? `Showing ${loaded} of ${total} entries` : '';
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

    // The frequency is stored with the entry; show it under the source.
    const sourceSub = document.createElement('div');
    sourceSub.className = 'cell-sub';
    sourceSub.textContent = item.frequency
      ? FREQUENCY_LABELS[item.frequency] || String(item.frequency)
      : FREQUENCY_LABELS[DEFAULT_FREQUENCY];
    sourceCell.appendChild(sourceSub);
    if (item.notes) sourceMain.title = item.notes;

    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-pos col-tight';
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = '+' + money(item.amount);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-tight actions-cell';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteIncome = '';
    deleteBtn.dataset.id = item.id;
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete income from ${item.source || 'income'} on ${UI.formatDate(item.income_date)}`);
    actions.appendChild(deleteBtn);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editIncome = '';
    editBtn.dataset.id = item.id;
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', `Edit income from ${item.source || 'income'} on ${UI.formatDate(item.income_date)}`);
    actions.appendChild(editBtn);
    actionsCell.appendChild(actions);

    row.append(dateCell, sourceCell, amountCell, actionsCell);
    return row;
  };

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
          const row = button.closest('tr');
          if (row) row.remove();
          incomeById.delete(String(button.dataset.id));
          loaded = Math.max(0, loaded - 1);
          total = Math.max(0, total - 1);
          updateSummary();
          if (!rowsBody.querySelector('tr')) {
            showState('empty', {
              message: 'No income logged yet. Add your first entry.',
              action: { href: '#add-income', label: 'Add income' },
            });
          }
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

  async function loadIncomes(append = false) {
    if (!append) {
      nextPage = 1;
      lastPage = 1;
      total = 0;
      loaded = 0;
      setLoadMore(false);
      showState('loading', { message: 'Loading income…' });
    }

    try {
      const { data, status } = await api.get(`/incomes?page=${nextPage}`);

      if (status !== 200 || !data || !data.data) {
        if (!append && summaryEl) summaryEl.textContent = '';
        showState('error', {
          message: (data && data.message) || 'Could not load income entries.',
          retry: () => loadIncomes(false),
        });
        return;
      }

      const paginator = data.data;
      const items = paginator.data || [];
      total = paginator.total || items.length;
      lastPage = paginator.last_page || 1;

      if (!append && !items.length) {
        updateSummary();
        showState('empty', {
          message: 'No income logged yet. Add your first entry.',
          action: { href: '#add-income', label: 'Add income' },
        });
        return;
      }

      if (!append) {
        rowsBody.replaceChildren();
        incomeById.clear();
      }
      items.forEach((item) => {
        incomeById.set(String(item.id), item);
        rowsBody.appendChild(buildRow(item));
      });
      loaded += items.length;

      showTable();
      updateSummary();

      setLoadMore(nextPage < lastPage);
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load more';
      }
    } catch (err) {
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = 'Load more';
      }
      if (!append && summaryEl) summaryEl.textContent = '';
      showState('error', {
        message: 'Could not reach the API. ' + (err.message || ''),
        retry: () => loadIncomes(false),
      });
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      if (nextPage >= lastPage) return;
      nextPage += 1;
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading…';
      loadIncomes(true);
    });
  }

  loadIncomes(false);
});
