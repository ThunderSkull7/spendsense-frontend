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

  // Shared: expense-type categories for selects and filters.
  async function fetchExpenseCategories() {
    try {
      const { data, status } = await api.get('/categories');
      if (status !== 200 || !data || !data.data) return [];
      return data.data.filter((category) => category.type === 'expense');
    } catch (e) {
      return [];
    }
  }

  // ---------- Add / edit expense form (add-expense.html) ----------
  const addForm = document.querySelector('.expense-form');
  if (addForm) {
    const amountInput = addForm.querySelector('#amount');
    const categorySelect = addForm.querySelector('#category');
    const descInput = addForm.querySelector('#description');
    const dateInput = addForm.querySelector('#date');
    const submitBtn = addForm.querySelector('button[type="submit"]');
    const editId = new URLSearchParams(window.location.search).get('edit');
    let editingExpenseId = null;

    if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();

    // First human-readable detail from a JSON error payload.
    const errorDetail = (data, fallback) => {
      if (data && data.errors) {
        const first = Object.values(data.errors)[0];
        if (Array.isArray(first) && first.length) return first[0];
      }
      return (data && data.message) || fallback;
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
      }
      if (submitBtn) submitBtn.textContent = 'Update expense';
      const topbarTitle = document.querySelector('.topbar-title');
      const topbarSub = document.querySelector('.topbar-sub');
      if (topbarTitle) topbarTitle.textContent = 'Edit expense';
      if (topbarSub) topbarSub.textContent = 'Update an existing expense';
      document.title = 'Edit expense | SpendSense';
      setMessage('Editing this expense — save to update it.');
    };

    fetchExpenseCategories().then(async (categories) => {
      if (categorySelect) {
        categorySelect.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = categories.length ? 'Choose category' : 'No expense categories available';
        categorySelect.appendChild(placeholder);
        categories.forEach((category) => {
          const option = document.createElement('option');
          option.value = String(category.id);
          option.textContent = category.name;
          categorySelect.appendChild(option);
        });
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

    addForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const amount = parseFloat(amountInput.value);
      const categoryId = parseInt(categorySelect.value, 10);
      const description = descInput && descInput.value.trim() ? descInput.value.trim() : null;
      const expenseDate = dateInput.value; // YYYY-MM-DD (backend expense_date)

      if (isNaN(amount) || amount <= 0) return setMessage('Please enter a valid amount.', 'error');
      if (isNaN(categoryId)) return setMessage('Please select a category.', 'error');
      if (!expenseDate) return setMessage('Please pick a date.', 'error');

      setMessage(editingExpenseId ? 'Updating expense…' : 'Logging expense…');

      try {
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
          if (dateInput) dateInput.valueAsDate = new Date();
        } else {
          setMessage(errorDetail(data, editingExpenseId ? 'Failed to update expense.' : 'Failed to log expense.'), 'error');
        }
      } catch (err) {
        setMessage('Error saving expense. ' + (err.message || ''), 'error');
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

  let nextPage = 1;
  let lastPage = 1;
  let total = 0;
  let loaded = 0;

  const updateSummary = () => {
    if (summaryEl) summaryEl.textContent = total ? `Showing ${loaded} of ${total} expenses` : '';
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
    showState('empty', { message: 'No expenses yet. Log your first expense to see it here.' });

  const buildRow = (item) => {
    const row = document.createElement('tr');
    row.dataset.category = item.category_id != null ? String(item.category_id) : '';
    row.dataset.expenseId = item.id;

    const dateCell = document.createElement('td');
    dateCell.textContent = UI.formatDate(item.expense_date);

    const descCell = document.createElement('td');
    const descMain = document.createElement('div');
    descMain.className = 'cell-main';
    descMain.textContent = item.description || (item.category ? item.category.name : 'Expense');
    descCell.appendChild(descMain);

    const catCell = document.createElement('td');
    catCell.className = 'hide-sm';
    const pill = document.createElement('span');
    pill.className = 'pill neutral';
    pill.textContent = item.category ? item.category.name : '—';
    catCell.appendChild(pill);

    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-neg';
    amountCell.textContent = '-' + money(item.amount);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteExpense = '';
    deleteBtn.dataset.id = item.id;
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editExpense = '';
    editBtn.dataset.id = item.id;
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);
    actionsCell.appendChild(actions);

    row.append(dateCell, descCell, catCell, amountCell, actionsCell);
    return row;
  };

  const renderRows = (items, append) => {
    if (!append) rowsBody.replaceChildren();
    items.forEach((item) => rowsBody.appendChild(buildRow(item)));
    loaded += items.length;
  };

  const applyFilter = () => {
    if (!filterSelect) return;
    const selected = filterSelect.value;
    rowsBody.querySelectorAll('tr').forEach((row) => {
      row.hidden = selected !== '' && row.dataset.category !== selected;
    });
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
  });

  if (filterSelect) filterSelect.addEventListener('change', applyFilter);

  if (table) {
    table.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-expense]');
      if (editButton) {
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
          const row = button.closest('tr');
          if (row) row.remove();
          loaded = Math.max(0, loaded - 1);
          total = Math.max(0, total - 1);
          updateSummary();
          if (!rowsBody.querySelector('tr')) showEmpty();
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

  async function loadExpenses(append = false) {
    if (!append) {
      nextPage = 1;
      lastPage = 1;
      total = 0;
      loaded = 0;
      setLoadMore(false);
      showState('loading', { message: 'Loading expenses…' });
    }

    try {
      const { data, status } = await api.get(`/expenses?page=${nextPage}`);

      if (status !== 200 || !data || !data.data) {
        if (!append && summaryEl) summaryEl.textContent = '';
        showState('error', {
          message: (data && data.message) || 'Could not load expenses.',
          retry: () => loadExpenses(false),
        });
        return;
      }

      const paginator = data.data;
      const items = paginator.data || [];
      total = paginator.total || items.length;
      lastPage = paginator.last_page || 1;

      if (!append && !items.length) {
        updateSummary();
        showEmpty();
        return;
      }

      renderRows(items, append);
      applyFilter();
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
        retry: () => loadExpenses(false),
      });
    }
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      if (nextPage >= lastPage) return;
      nextPage += 1;
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading…';
      loadExpenses(true);
    });
  }

  loadExpenses(false);
});
