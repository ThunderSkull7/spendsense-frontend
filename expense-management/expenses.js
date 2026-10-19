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
    const suggestionsWrap = addForm.querySelector('[data-suggestion-chips]');
    const suggestionMessage = addForm.querySelector('[data-suggestion-message]');
    const editId = new URLSearchParams(window.location.search).get('edit');

    // Sentinel value for the "Other (add new)…" option; never sent to the API.
    const CUSTOM_CATEGORY = '__other__';
    let editingExpenseId = null;
    let allCategories = [];       // both types, used for duplicate detection
    let lastCategoryValue = '';   // last real selection, restored when cancelling
    let creatingCategory = false; // blocks duplicate category creation

    if (dateInput && !dateInput.value) dateInput.valueAsDate = new Date();

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

    const setSuggestionMessage = (text, type) => {
      if (!suggestionMessage) return;
      suggestionMessage.textContent = text || '';
      suggestionMessage.classList.remove('error', 'success');
      if (type) suggestionMessage.classList.add(type);
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

    // Comparison-only normalisation: case, whitespace, diacritics, ampersands,
    // and common punctuation should not create near-duplicate categories.
    // It never renames a category; the original name is still sent to the API.
    const normalizeName = (value) =>
      String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLowerCase();

    const findExistingCategory = (name) => {
      const normalized = normalizeName(name);
      return allCategories.find((category) => normalizeName(category.name) === normalized) || null;
    };

    const selectCategory = (category) => {
      if (!categorySelect) return;
      const value = String(category.id);
      if (!categorySelect.querySelector(`option[value="${value}"]`)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = category.name;
        const otherOption = categorySelect.querySelector(`option[value="${CUSTOM_CATEGORY}"]`);
        categorySelect.insertBefore(option, otherOption || null);
      }
      categorySelect.value = value;
      lastCategoryValue = value;
      setCustomMode(false);
    };

    // Repopulates the category select from allCategories, keeping the current
    // selection when it still exists. "Other" is a creation shortcut, not a
    // stored category: the typed name is saved as a real category first.
    const refreshCategorySelect = () => {
      if (!categorySelect) return;
      const current = categorySelect.value;
      categorySelect.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose category';
      categorySelect.appendChild(placeholder);
      allCategories
        .filter((category) => category.type === 'expense')
        .forEach((category) => {
          const option = document.createElement('option');
          option.value = String(category.id);
          option.textContent = category.name;
          categorySelect.appendChild(option);
        });
      const otherOption = document.createElement('option');
      otherOption.value = CUSTOM_CATEGORY;
      otherOption.textContent = 'Other (add new)…';
      categorySelect.appendChild(otherOption);

      if (current === CUSTOM_CATEGORY) {
        categorySelect.value = CUSTOM_CATEGORY; // keep the creation flow open
      } else {
        if (current && categorySelect.querySelector(`option[value="${current}"]`)) {
          categorySelect.value = current;
        }
        lastCategoryValue = categorySelect.value;
      }
    };

    // Curated quick-pick suggestions for everyday expenses. Aliases let a
    // suggestion reuse an equivalent category the user already has instead of
    // creating a near-duplicate. Nothing is created until a chip is clicked.
    const SUGGESTED_EXPENSE_CATEGORIES = [
      { name: 'Food & dining', aliases: ['food', 'dining', 'food and dining'] },
      { name: 'Groceries', aliases: ['grocery'] },
      { name: 'Rent' },
      { name: 'Utilities', aliases: ['utility', 'bills', 'utility bills'] },
      { name: 'Electricity', aliases: ['electric', 'electric bill', 'power'] },
      { name: 'Internet & mobile', aliases: ['internet', 'mobile', 'phone', 'broadband'] },
      { name: 'Transport', aliases: ['transportation', 'commute'] },
      { name: 'Fuel', aliases: ['petrol', 'diesel', 'gas'] },
      { name: 'Public transport', aliases: ['transit', 'bus', 'metro', 'train'] },
      { name: 'Shopping' },
      { name: 'Healthcare', aliases: ['health', 'medical'] },
      { name: 'Medicines', aliases: ['medicine', 'pharmacy', 'medication'] },
      { name: 'Education', aliases: ['school', 'tuition', 'college'] },
      { name: 'Entertainment', aliases: ['movies', 'fun'] },
      { name: 'Subscriptions', aliases: ['subscription', 'streaming', 'ott'] },
      { name: 'Personal care', aliases: ['salon', 'grooming', 'personal-care'] },
      { name: 'Clothing', aliases: ['clothes', 'apparel'] },
      { name: 'Travel', aliases: ['vacation', 'holiday', 'trip'] },
      { name: 'Insurance' },
      { name: 'Household expenses', aliases: ['household', 'home', 'home expenses'] },
      { name: 'Gifts & donations', aliases: ['gifts', 'donations', 'gift', 'donation'] },
      { name: 'Savings & investments', aliases: ['savings', 'investments', 'investment'] },
      { name: 'Taxi & ride-hailing', aliases: ['taxi', 'cab', 'ride hailing', 'ride-hailing', 'uber', 'ola'] },
      { name: 'Vehicle maintenance', aliases: ['car maintenance', 'bike service', 'vehicle service', 'car service'] },
      { name: 'Fees & charges', aliases: ['fees', 'charges', 'bank fees', 'bank charges'] },
    ];

    const findSuggestionMatch = (suggestion) => {
      const names = new Set(
        [suggestion.name, ...(suggestion.aliases || [])].map((name) => normalizeName(name))
      );
      const matches = allCategories.filter((category) => names.has(normalizeName(category.name)));
      // Prefer a usable expense category if the server ever returns the same
      // name under both types; income matches are surfaced as blocked chips.
      return matches.find((category) => category.type !== 'income') || matches[0] || null;
    };

    const renderSuggestions = () => {
      if (!suggestionsWrap) return;
      suggestionsWrap.replaceChildren();
      SUGGESTED_EXPENSE_CATEGORIES.forEach((suggestion) => {
        const match = findSuggestionMatch(suggestion);
        const isIncomeMatch = !!match && match.type !== 'expense';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className =
          'chip suggestion-chip ' + (match ? 'exists' : 'is-new') + (isIncomeMatch ? ' blocked' : '');
        chip.dataset.suggestion = suggestion.name;

        const mark = document.createElement('span');
        mark.className = 'chip-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = !match ? '+' : isIncomeMatch ? '!' : '✓';

        const label = document.createElement('span');
        label.textContent = isIncomeMatch
          ? `${match.name} · income`
          : match
            ? match.name
            : suggestion.name;

        chip.append(mark, label);
        if (match) {
          chip.title =
            match.type === 'expense'
              ? `Select “${match.name}” (already in your categories)`
              : `“${match.name}” already exists as an income category`;
          chip.setAttribute(
            'aria-label',
            match.type === 'expense'
              ? `${match.name} — already exists, select category`
              : `${match.name} — exists as an income category and cannot be selected`
          );
        } else {
          chip.title = `Create “${suggestion.name}” and select it`;
          chip.setAttribute('aria-label', `${suggestion.name} — create and select new category`);
        }
        suggestionsWrap.appendChild(chip);
      });
    };

    // Creates an expense category through the existing category API and
    // selects it. Resolves with { error } or { error: null, category, created }.
    const createCategoryByName = async (name) => {
      if (creatingCategory) return { error: null, category: null, created: false };
      const trimmed = String(name || '').trim();
      if (!trimmed) return { error: 'Please enter a category name.' };

      // Reuse an existing category instead of creating a duplicate.
      const existing = findExistingCategory(trimmed);
      if (existing) {
        if (existing.type === 'expense') {
          selectCategory(existing);
          return { error: null, category: existing, created: false };
        }
        return { error: `A category named "${existing.name}" already exists under income categories.` };
      }

      creatingCategory = true;
      if (createCategoryBtn) createCategoryBtn.disabled = true;

      try {
        const { data, status } = await api.post('/categories', { name: trimmed, type: 'expense' });
        if (status === 201 && data && data.data) {
          const created = data.data;
          allCategories.push(created);
          selectCategory(created);
          renderSuggestions();
          return { error: null, category: created, created: true };
        }
        if (status === 401) return { error: 'Your session may have expired. Please sign in again.' };
        if (status === 422) {
          // The name was taken elsewhere: refresh the list and select the real
          // record instead of retrying blindly.
          const refreshed = await fetchCategories();
          if (refreshed.length) {
            allCategories = refreshed;
            refreshCategorySelect();
            renderSuggestions();
            const retry = findExistingCategory(trimmed);
            if (retry && retry.type === 'expense') {
              selectCategory(retry);
              return { error: null, category: retry, created: false };
            }
          }
        }
        return { error: errorDetail(data, 'Could not create that category. Please try again.') };
      } catch (err) {
        return { error: 'Could not reach the API to create that category.' };
      } finally {
        creatingCategory = false;
        if (createCategoryBtn) createCategoryBtn.disabled = false;
        if (suggestionsWrap) {
          suggestionsWrap.querySelectorAll('.suggestion-chip').forEach((chip) => {
            chip.disabled = false;
          });
        }
      }
    };

    const createCustomCategory = async () => {
      if (!customInput) return 'Please enter a category name.';
      const name = customInput.value.trim();
      if (!name) return 'Please enter a category name.';
      setCustomMessage('Creating category…');
      const result = await createCategoryByName(name);
      if (result.error) return result.error;
      if (result.created) {
        setMessage(`Category "${result.category.name}" added and selected.`, 'success');
        UI.showToast('Category added', 'success');
      } else if (result.category) {
        setMessage(`"${result.category.name}" already exists — it is now selected.`, 'success');
      }
      return null;
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
      refreshCategorySelect();
      renderSuggestions();

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
        setSuggestionMessage('');
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

    if (suggestionsWrap) {
      suggestionsWrap.addEventListener('click', async (event) => {
        const chip = event.target.closest('[data-suggestion]');
        if (!chip || chip.disabled || creatingCategory) return;
        const suggestion = SUGGESTED_EXPENSE_CATEGORIES.find(
          (item) => item.name === chip.dataset.suggestion
        );
        if (!suggestion) return;

        // Existing expense category: select it, never create a duplicate.
        const match = findSuggestionMatch(suggestion);
        if (match) {
          if (match.type === 'expense') {
            selectCategory(match);
            setSuggestionMessage(`"${match.name}" selected.`, 'success');
          } else {
            setSuggestionMessage(
              `"${match.name}" already exists as an income category — it can't be used for expenses.`,
              'error'
            );
          }
          return;
        }

        chip.disabled = true;
        setSuggestionMessage('Creating category…');
        const result = await createCategoryByName(suggestion.name);
        if (result.error) {
          setSuggestionMessage(result.error, 'error');
          chip.disabled = false;
          return;
        }
        if (result.created) {
          setSuggestionMessage(`Category "${result.category.name}" added and selected.`, 'success');
          UI.showToast('Category added', 'success');
        } else if (result.category) {
          setSuggestionMessage(`"${result.category.name}" selected.`, 'success');
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
          if (dateInput) dateInput.valueAsDate = new Date();
          if (categorySelect) lastCategoryValue = categorySelect.value;
          setSuggestionMessage('');
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
    showState('empty', {
      message: 'No expenses yet. Log your first expense to see it here.',
      action: { href: 'add-expense.html', label: 'Add an expense' },
    });

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
      `Delete expense: ${item.description || (item.category ? item.category.name : 'expense')} on ${UI.formatDate(item.expense_date)}`
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
      `Edit expense: ${item.description || (item.category ? item.category.name : 'expense')} on ${UI.formatDate(item.expense_date)}`
    );
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
