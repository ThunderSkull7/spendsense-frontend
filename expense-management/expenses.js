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
    let pendingExpenseKey = null; // reused after a failed create with the same payload

    addForm.addEventListener('input', () => { pendingExpenseKey = null; });
    addForm.addEventListener('change', () => { pendingExpenseKey = null; });

    if (dateInput && !dateInput.value) dateInput.value = UI.todayInputValue();

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
      pendingExpenseKey = null;
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
          : await api.post('/expenses', payload, {
              'Idempotency-Key': (pendingExpenseKey ||= api.newIdempotencyKey()),
            });

        if (editingExpenseId ? status === 200 : status === 201) {
          pendingExpenseKey = null;
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
          if (dateInput) dateInput.value = UI.todayInputValue();
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
  const trashCard = document.querySelector('[data-expense-trash-card]');
  const trashRows = document.querySelector('[data-expense-trash-rows]');
  const trashMoreBtn = document.querySelector('[data-expense-trash-more]');
  const tableWrap = document.querySelector('[data-expense-table-wrap]');
  const stateEl = document.querySelector('[data-expense-state]');
  const summaryEl = document.querySelector('[data-list-summary]');
  const loadMoreBtn = document.querySelector('[data-load-more]');
  const filterSelect = document.querySelector('[data-category-filter]');

  let lastPage = 1;
  let total = 0;
  let loaded = 0;
  let trashPage = 1;
  // Monotonic request counter: only the newest search may paint the table.
  let searchRequestId = 0;

  // A search result and a legacy /expenses row describe the same record in
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
      link.setAttribute('aria-label', `Manage income: ${label} on ${UI.formatDate(date)}`);
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
        `Delete expense: ${label} on ${UI.formatDate(date)}`
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
        `Edit expense: ${label} on ${UI.formatDate(date)}`
      );
      actions.appendChild(editBtn);
    }

    actionsCell.appendChild(actions);
    row.append(dateCell, descCell, catCell, amountCell, actionsCell);
    return row;
  };

  const buildTrashRow = (item) => {
    const row = document.createElement('tr');
    row.dataset.expenseId = item.id;

    const deletedCell = document.createElement('td');
    deletedCell.className = 'col-tight';
    deletedCell.dataset.label = 'Deleted';
    deletedCell.textContent = UI.formatDate(item.deleted_at);

    const dateCell = document.createElement('td');
    dateCell.className = 'col-tight';
    dateCell.dataset.label = 'Date';
    dateCell.textContent = UI.formatDate(item.expense_date);

    const descCell = document.createElement('td');
    descCell.className = 'cell-wrap';
    descCell.dataset.label = 'Description';
    descCell.textContent = item.description || (item.category ? item.category.name : 'Expense');

    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-neg col-tight';
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = '-' + money(item.amount);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-tight actions-cell';
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'row-btn secondary';
    restoreBtn.dataset.restoreExpense = '';
    restoreBtn.dataset.id = item.id;
    restoreBtn.textContent = 'Restore';
    restoreBtn.setAttribute(
      'aria-label',
      `Restore expense: ${item.description || (item.category ? item.category.name : 'expense')} on ${UI.formatDate(item.expense_date)}`
    );
    actionsCell.appendChild(restoreBtn);

    row.append(deletedCell, dateCell, descCell, amountCell, actionsCell);
    return row;
  };

  // ── Advanced transaction search (server-side) ─────────────────────────
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

  const searchMarkup = `
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
        <button class="btn primary sm" type="submit" data-search-apply>Apply filters</button>
        <button class="btn secondary sm" type="button" data-search-clear>Clear all</button>
        <button class="btn ghost sm" type="button" data-search-export>Export CSV</button>
      </div>
    </div>
    <p class="control-note">
      Search runs on the server. Amounts are exact; the date range uses inclusive UTC calendar days.
    </p>
  `;

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
    link.href = `${base}/api/transactions/export?${query.toString()}`;
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

  // A drill-down from the Spending trends page arrives with the category and
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
    summaryEl.textContent = `Showing ${loaded} of ${total} transactions${filterNote}`;
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
    // A new request supersedes any request that is still in flight, so a
    // slower earlier response can never overwrite a newer result set.
    searchRequestId += 1;
    const requestId = searchRequestId;

    if (!append) {
      searchState.page = 1;
      total = 0;
      loaded = 0;
      setLoadMore(false);
      showState('loading', { message: 'Loading transactions…' });
    }

    const query = buildSearchQuery(true);

    try {
      const { data, status } = await api.get(`/transactions/search?${query.toString()}`);

      if (requestId !== searchRequestId) {
        // A newer search has already been issued; drop this stale response.
        return;
      }

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
        // Drop any rows from a previous result so a hidden table never keeps
        // stale records in the document.
        rowsBody.replaceChildren();
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
      if (requestId !== searchRequestId) {
        return;
      }
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
        window.location.href = `add-expense.html?edit=${encodeURIComponent(editButton.dataset.id)}`;
        return;
      }

      const button = event.target.closest('[data-delete-expense]');
      if (!button) return;

      if (!window.confirm('Move this expense to Recently deleted? You can restore it later.')) return;

      button.disabled = true;
      try {
        const { data, status } = await api.delete(`/expenses/${button.dataset.id}`);
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
      const { data, status } = await api.get(`/expenses/trash?page=${trashPage}`);
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
        const { data, status } = await api.post(`/expenses/${button.dataset.id}/restore`);
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

  applyDeepLinkParams();
  loadTransactions(false);
  loadTrash();
});
