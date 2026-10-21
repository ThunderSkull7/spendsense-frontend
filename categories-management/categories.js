// Categories management — API-backed (list, create, delete).
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;

  const form = document.querySelector('.category-form');
  const nameInput = document.querySelector('#categoryName');
  const messageDiv = document.querySelector('[data-category-message]');
  const listEl = document.querySelector('[data-category-list]');
  const stateEl = document.querySelector('[data-category-state]');
  const summaryEl = document.querySelector('[data-category-summary]');
  const typeButtons = document.querySelectorAll('[data-category-choice]');
  const quickNames = document.querySelectorAll('[data-quick-name]');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const cancelEditBtn = document.querySelector('[data-cancel-edit]');
  let editingCategoryId = null;
  const categoriesById = new Map();

  const setMessage = (text, type) => {
    if (!messageDiv) return;
    messageDiv.textContent = text || '';
    messageDiv.classList.remove('error', 'success');
    if (type) messageDiv.classList.add(type);
  };

  // --- Category type selector (expense / income) ---
  let selectedType = 'expense';
  const setType = (type) => {
    selectedType = type === 'income' ? 'income' : 'expense';
    typeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.categoryChoice === selectedType);
    });
  };
  typeButtons.forEach((button) => {
    button.addEventListener('click', () => setType(button.dataset.categoryChoice));
  });

  // First human-readable detail from a JSON error payload.
  const errorDetail = (data, fallback) => {
    if (data && data.errors) {
      const first = Object.values(data.errors)[0];
      if (Array.isArray(first) && first.length) return first[0];
    }
    return (data && data.message) || fallback;
  };

  const exitEditMode = () => {
    editingCategoryId = null;
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    if (submitBtn) submitBtn.textContent = 'Add category';
  };

  const enterEditMode = (category) => {
    if (!form) return;
    editingCategoryId = category.id;
    if (nameInput) nameInput.value = category.name || '';
    setType(category.type);
    if (submitBtn) submitBtn.textContent = 'Update category';
    if (cancelEditBtn) cancelEditBtn.hidden = false;
    setMessage('Editing this category — save to update it.');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      setType('expense');
      exitEditMode();
      setMessage('');
    });
  }

  // --- Quick-name chips fill the input (and hint the type) ---
  const incomeNames = new Set(['Salary', 'Freelance']);
  quickNames.forEach((chip) => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.quickName;
      if (nameInput) nameInput.value = name;
      setType(incomeNames.has(name) ? 'income' : 'expense');
      nameInput && nameInput.focus();
    });
  });

  // --- Handle "Other" category logic ---
  const handleOtherCategory = () => {
    if (nameInput && nameInput.placeholder === 'Enter your category name') {
      nameInput.setAttribute('required', '');
      nameInput.setAttribute('pattern', '[^\\s].*'); // Prevent only whitespace
    } else {
      nameInput?.removeAttribute('required');
      nameInput?.removeAttribute('pattern');
    }
  };

  // --- Create category ---
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = nameInput ? nameInput.value.trim() : '';
      
      // Special validation for "Other" category
      if (nameInput && nameInput.placeholder === 'Enter your category name') {
        if (!name) {
          return setMessage('Please enter a custom category name.', 'error');
        }
        // Additional check for whitespace-only names
        if (/^\s*$/.test(name)) {
          return setMessage('Category name cannot be only whitespace.', 'error');
        }
        // Check for duplicate category names (the API will also handle this)
      } else if (!name) {
        return setMessage('Please enter a category name.', 'error');
      }

      setMessage(editingCategoryId ? 'Updating category…' : 'Saving category…');

      try {
        const payload = { name, type: selectedType };

        const { data, status } = editingCategoryId
          ? await api.put(`/categories/${editingCategoryId}`, payload)
          : await api.post('/categories', payload);

        if (editingCategoryId ? status === 200 : status === 201) {
          setMessage(editingCategoryId ? 'Category updated.' : data.message || 'Category added!', 'success');
          UI.showToast(editingCategoryId ? 'Category updated' : 'Category added', 'success');
          if (nameInput) {
            nameInput.value = '';
            nameInput.placeholder = 'e.g. Groceries';
            nameInput.focus();
          }
          exitEditMode();
          loadCategories();
        } else {
          setMessage(errorDetail(data, editingCategoryId ? 'Failed to update category.' : 'Failed to add category.'), 'error');
        }
      } catch (err) {
        setMessage('Error saving category. ' + (err.message || ''), 'error');
      }
    });
  }

  // Update Other category handling on input changes
  if (nameInput) {
    nameInput.addEventListener('input', handleOtherCategory);
    nameInput.addEventListener('blur', handleOtherCategory);
  }

  // --- List rendering ---
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

  const buildTile = (category) => {
    const tile = document.createElement('div');
    tile.className = 'category-tile';
    tile.dataset.categoryId = category.id;

    const icon = document.createElement('span');
    icon.className = 'c-ico' + (category.type === 'income' ? ' income' : '');
    icon.textContent = (category.name || '?').charAt(0).toUpperCase();

    const main = document.createElement('div');
    main.className = 'c-main';
    const name = document.createElement('div');
    name.className = 'c-name';
    name.textContent = category.name;
    const meta = document.createElement('div');
    meta.className = 'c-meta';
    const pill = document.createElement('span');
    pill.className = 'pill ' + (category.type === 'income' ? 'teal' : 'green');
    pill.textContent = category.type === 'income' ? 'Income' : 'Expense';
    meta.appendChild(pill);
    main.append(name, meta);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-btn danger';
    deleteBtn.dataset.deleteCategory = '';
    deleteBtn.dataset.id = category.id;
    deleteBtn.title = 'Delete category';
    deleteBtn.textContent = 'Delete';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-btn secondary';
    editBtn.dataset.editCategory = '';
    editBtn.dataset.id = category.id;
    editBtn.title = 'Edit category';
    editBtn.textContent = 'Edit';

    actions.append(editBtn, deleteBtn);
    tile.append(icon, main, actions);
    return tile;
  };

  const updateSummary = (categories) => {
    if (!summaryEl) return;
    const expenseCount = categories.filter((c) => c.type === 'expense').length;
    const incomeCount = categories.filter((c) => c.type === 'income').length;
    summaryEl.textContent = `${categories.length} categories · ${expenseCount} expense · ${incomeCount} income`;
  };

  if (listEl) {
    listEl.addEventListener('click', async (event) => {
      const editButton = event.target.closest('[data-edit-category]');
      if (editButton) {
        const category = categoriesById.get(String(editButton.dataset.id));
        if (category && form) {
          enterEditMode(category);
        } else {
          UI.showToast('Could not load that category for editing.', 'error');
        }
        return;
      }

      const button = event.target.closest('[data-delete-category]');
      if (!button) return;

      if (!window.confirm('Delete this category? Categories used by expenses or budgets cannot be deleted.')) return;

      button.disabled = true;
      try {
        const { data, status } = await api.delete(`/categories/${button.dataset.id}`);
        if (status === 204) {
          const tile = button.closest('.category-tile');
          if (tile) tile.remove();
          UI.showToast('Category deleted', 'success');
          loadCategories();
        } else {
          button.disabled = false;
          UI.showToast((data && data.message) || 'Could not delete category.', 'error');
        }
      } catch (err) {
        button.disabled = false;
        UI.showToast('Error deleting category.', 'error');
      }
    });
  }

  async function loadCategories() {
    showState('loading', { message: 'Loading categories…' });
    try {
      const { data, status } = await api.get('/categories');
      if (status !== 200 || !data || !data.data) {
        if (summaryEl) summaryEl.textContent = '';
        showState('error', {
          message: (data && data.message) || 'Could not load categories.',
          retry: loadCategories,
        });
        return;
      }

      const categories = data.data;
      updateSummary(categories);

      categoriesById.clear();
      categories.forEach((category) => categoriesById.set(String(category.id), category));

      if (!categories.length) {
        showState('empty', { message: 'No categories yet — add your first one.' });
        return;
      }

      listEl.replaceChildren();
      categories.forEach((category) => listEl.appendChild(buildTile(category)));
      showList();
    } catch (err) {
      if (summaryEl) summaryEl.textContent = '';
      showState('error', {
        message: 'Could not reach the API. ' + (err.message || ''),
        retry: loadCategories,
      });
    }
  }

  loadCategories();
});
