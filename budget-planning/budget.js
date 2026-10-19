// Budget management — API-backed (list with progress, create, delete).
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);

  const form = document.querySelector('.budget-form');
  const formMessage = document.querySelector('.budget-message');
  const listEl = document.querySelector('[data-budget-list]');
  const stateEl = document.querySelector('[data-budget-state]');
  const summaryEl = document.querySelector('[data-budget-summary]');
  const reloadBtn = document.querySelector('[data-budget-reload]');
  const monthInput = form ? form.querySelector('#month') : null;
  const categorySelect = form ? form.querySelector('#category') : null;
  const limitInput = form ? form.querySelector('#limit') : null;
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const cancelEditBtn = document.querySelector('[data-cancel-edit]');
  let editingBudgetId = null;

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
    editingBudgetId = null;
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    if (submitBtn) submitBtn.textContent = 'Save budget';
  };

  const enterEditMode = (budget) => {
    if (!form) return;
    editingBudgetId = budget.id;

    if (categorySelect) {
      const categoryValue = String(budget.category_id);
      if (!categorySelect.querySelector(`option[value="${categoryValue}"]`)) {
        const option = document.createElement('option');
        option.value = categoryValue;
        option.textContent = budget.category ? budget.category.name : `Category #${categoryValue}`;
        categorySelect.appendChild(option);
      }
      categorySelect.value = categoryValue;
    }
    if (limitInput) limitInput.value = budget.limit_amount;
    if (monthInput) monthInput.value = String(budget.month_year || '').slice(0, 7);
    if (submitBtn) submitBtn.textContent = 'Update budget';
    if (cancelEditBtn) cancelEditBtn.hidden = false;
    setMessage('Editing this budget — save to update it.');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const currentMonthValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  if (monthInput && !monthInput.value) monthInput.value = currentMonthValue();

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      if (monthInput) monthInput.value = currentMonthValue();
      exitEditMode();
      setMessage('');
    });
  }

  const formatMonthYear = (value) => {
    if (!value) return '';
    const [year, month] = String(value).split('-').map(Number);
    if (!year || !month) return String(value);
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  };

  // ---------- Category options ----------
  async function loadCategoryOptions() {
    if (!categorySelect) return;
    try {
      const { data, status } = await api.get('/categories');
      const categories =
        status === 200 && data && data.data ? data.data.filter((category) => category.type === 'expense') : [];
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
    } catch (e) {
      /* Keep the placeholder option; the form still validates category selection. */
      if (categorySelect) {
        const option = categorySelect.querySelector('option');
        if (option) option.textContent = 'Could not load categories';
      }
    }
  }

  // ---------- Create budget ----------
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const categoryId = parseInt(categorySelect.value, 10);
      const limit = parseFloat(limitInput.value);
      const monthYear = monthInput.value; // "YYYY-MM" (backend month_year contract)

      if (isNaN(limit) || limit <= 0) return setMessage('Please enter a valid limit.', 'error');
      if (isNaN(categoryId)) return setMessage('Please select a category.', 'error');
      if (!monthYear) return setMessage('Please pick a month.', 'error');

      setMessage(editingBudgetId ? 'Updating budget…' : 'Saving budget…');

      try {
        const payload = {
          category_id: categoryId,
          limit_amount: limit,
          month_year: monthYear,
        };

        const { data, status } = editingBudgetId
          ? await api.put(`/budgets/${editingBudgetId}`, payload)
          : await api.post('/budgets', payload);

        if (editingBudgetId ? status === 200 : status === 201) {
          setMessage(editingBudgetId ? 'Budget updated.' : data.message || 'Budget saved!', 'success');
          UI.showToast(editingBudgetId ? 'Budget updated' : 'Budget saved', 'success');
          form.reset();
          if (monthInput) monthInput.value = currentMonthValue();
          exitEditMode();
          loadBudgets();
        } else {
          setMessage(errorDetail(data, editingBudgetId ? 'Failed to update budget.' : 'Failed to save budget.'), 'error');
        }
      } catch (err) {
        setMessage('Error saving budget. ' + (err.message || ''), 'error');
      }
    });
  }

  // ---------- Budget list with progress ----------
  const showState = (type, options) => {
    if (listEl) listEl.hidden = true;
    if (stateEl) {
      stateEl.hidden = false;
      UI.renderState(stateEl, type, options);
    }
  };

  const showList = () => {
    if (stateEl) stateEl.hidden = true;
    if (listEl) listEl.hidden = false;
  };

  const budgetsById = new Map();

  const buildBudgetItem = (budget, progress) => {
    const item = document.createElement('div');
    item.className = 'budget-item';
    item.dataset.budgetId = budget.id;
    const categoryName = budget.category ? budget.category.name : budget.category_name || 'Budget';
    const periodLabel = budget.month_year || `${budget.month}/${budget.year}`;

    const meta = document.createElement('div');
    meta.className = 'b-meta';

    const left = document.createElement('span');
    left.append(document.createTextNode(categoryName));
    const month = document.createElement('span');
    month.className = 'month';
    month.textContent = '· ' + formatMonthYear(budget.month_year);
    left.appendChild(document.createTextNode(' '));
    left.appendChild(month);

    if (progress) {
      const pill = document.createElement('span');
      if (progress.is_overspent) {
        pill.className = 'pill danger';
        pill.textContent = 'Over limit';
      } else if ((progress.percentage_used || 0) >= 80) {
        pill.className = 'pill amber';
        pill.textContent = 'Near limit';
      } else {
        pill.className = 'pill green';
        pill.textContent = 'On track';
      }
      left.append(document.createTextNode(' '), pill);
    }

    const right = document.createElement('span');
    right.className = 'row';
    const value = document.createElement('strong');
    value.textContent = progress
      ? `${money(progress.spent_amount)} of ${money(progress.limit_amount)}`
      : money(budget.limit_amount);
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteBudget = '';
    deleteBtn.dataset.id = budget.id;
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete ${categoryName} budget for ${periodLabel}`);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editBudget = '';
    editBtn.dataset.id = budget.id;
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', `Edit ${categoryName} budget for ${periodLabel}`);
    right.append(value, editBtn, deleteBtn);

    meta.append(left, right);
    item.appendChild(meta);

    if (progress) {
      const percentage = Math.min(100, Math.max(0, progress.percentage_used || 0));
      const track = document.createElement('div');
      track.className = 'progress' + (progress.is_overspent ? ' danger' : percentage >= 80 ? ' warn' : '');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', `${categoryName} budget used`);
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(Math.round(percentage)));
      track.setAttribute('aria-valuetext', `${Math.round(percentage)}% used, ${money(progress.spent_amount)} of ${money(progress.limit_amount)}`);
      const fill = document.createElement('span');
      fill.style.width = Math.max(3, percentage) + '%';
      track.appendChild(fill);
      item.appendChild(track);
    }

    return item;
  };

  if (listEl) {
    listEl.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-budget]');
      if (editButton) {
        const budget = budgetsById.get(String(editButton.dataset.id));
        if (budget && form) {
          enterEditMode(budget);
        } else {
          UI.showToast('Could not load that budget for editing.', 'error');
        }
        return;
      }

      const button = event.target.closest('[data-delete-budget]');
      if (!button) return;

      if (!window.confirm('Delete this budget?')) return;

      button.disabled = true;
      try {
        const { data, status } = await api.delete(`/budgets/${button.dataset.id}`);
        if (status === 204) {
          const item = button.closest('.budget-item');
          if (item) item.remove();
          budgetsById.delete(String(button.dataset.id));
          UI.showToast('Budget deleted', 'success');
          if (!listEl.querySelector('.budget-item')) {
            showState('empty', {
              message: 'No budgets yet — set your first monthly limit.',
              action: { href: '#budget-form', label: 'Set a budget' },
            });
          }
        } else {
          button.disabled = false;
          UI.showToast((data && data.message) || 'Could not delete budget.', 'error');
        }
      } catch (err) {
        button.disabled = false;
        UI.showToast('Error deleting budget.', 'error');
      }
    });
  }

  async function loadBudgets() {
    showState('loading', { message: 'Loading budgets…' });

    const [budgetsResult, statusResult] = await Promise.allSettled([
      api.get('/budgets'),
      api.get('/analytics/budget-status'),
    ]);

    const budgetsResponse = budgetsResult.status === 'fulfilled' ? budgetsResult.value : null;
    if (!budgetsResponse || budgetsResponse.status !== 200 || !budgetsResponse.data || !budgetsResponse.data.data) {
      if (summaryEl) summaryEl.textContent = '';
      showState('error', { message: 'Could not load budgets.', retry: loadBudgets });
      return;
    }

    const paginator = budgetsResponse.data.data;
    const budgets = paginator.data || [];

    budgetsById.clear();
    budgets.forEach((budget) => budgetsById.set(String(budget.id), budget));

    // Progress for the current month joined by budget id.
    const progressMap = new Map();
    const statusResponse = statusResult.status === 'fulfilled' ? statusResult.value : null;
    if (statusResponse && statusResponse.status === 200 && statusResponse.data && statusResponse.data.data) {
      (statusResponse.data.data.budgets || []).forEach((entry) => {
        progressMap.set(String(entry.budget_id), entry);
      });
    }

    if (summaryEl) {
      summaryEl.textContent = budgets.length
        ? `${paginator.total || budgets.length} budget${budgets.length > 1 ? 's' : ''}`
        : '';
    }

    if (!budgets.length) {
      showState('empty', {
              message: 'No budgets yet — set your first monthly limit.',
              action: { href: '#budget-form', label: 'Set a budget' },
            });
      return;
    }

    const list = document.createElement('div');
    list.className = 'budget-list';
    budgets.forEach((budget) => list.appendChild(buildBudgetItem(budget, progressMap.get(String(budget.id)))));
    listEl.replaceChildren(list);
    showList();
  }

  if (reloadBtn) reloadBtn.addEventListener('click', loadBudgets);

  loadCategoryOptions();
  loadBudgets();
});
