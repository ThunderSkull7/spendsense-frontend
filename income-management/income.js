// Income management — API-backed (income.html form + history list + toolbar).
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

  const clearFormValidationErrors = () => {
    if (!form) return;
    form.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
      el.removeAttribute('aria-invalid');
    });
  };

  const exitEditMode = () => {
    editingIncomeId = null;
    if (cancelEditBtn) cancelEditBtn.hidden = true;
    if (submitBtn) submitBtn.textContent = 'Save income';
    clearFormValidationErrors();
  };

  const enterEditMode = (income) => {
    if (!form) return;
    editingIncomeId = income.id;
    clearFormValidationErrors();

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

  // Clear validation styling when inputs are interacted with
  if (form) {
    form.addEventListener('input', (event) => {
      if (event.target && event.target.hasAttribute('aria-invalid')) {
        event.target.removeAttribute('aria-invalid');
      }
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      if (!form) return;
      form.reset();
      if (dateInput) dateInput.valueAsDate = new Date();
      exitEditMode();
      setMessage('');
    });
  }

  // Helper to show loading state on submit button
  const setSubmitLoading = (isLoading, originalText) => {
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Saving…' : originalText;
    if (isLoading) submitBtn.classList.add('loading');
    else submitBtn.classList.remove('loading');
  };

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.submitting === 'true') return; // block double submits

      clearFormValidationErrors();

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

      let hasError = false;
      if (!source || source === 'Choose source') {
        if (sourceSelect) sourceSelect.setAttribute('aria-invalid', 'true');
        setMessage('Please select an income source.', 'error');
        hasError = true;
      }
      if (isNaN(amount) || amount <= 0) {
        if (amountInput) amountInput.setAttribute('aria-invalid', 'true');
        if (!hasError) setMessage('Please enter a valid amount greater than zero.', 'error');
        hasError = true;
      }
      if (!incomeDate) {
        if (dateInput) dateInput.setAttribute('aria-invalid', 'true');
        if (!hasError) setMessage('Please pick a date.', 'error');
        hasError = true;
      }

      if (hasError) return;

      const originalBtnText = submitBtn ? submitBtn.textContent : 'Save income';
      setSubmitLoading(true, originalBtnText);
      setMessage(editingIncomeId ? 'Updating income…' : 'Saving income…');
      form.dataset.submitting = 'true';

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
        setSubmitLoading(false, originalBtnText);
      }
    });
  }

  // ---------- Income history list & toolbar ----------
  const rowsBody = document.querySelector('[data-income-rows]');
  if (!rowsBody) return;

  const table = document.querySelector('[data-income-table]');
  const tableWrap = document.querySelector('[data-income-table-wrap]');
  const stateEl = document.querySelector('[data-income-state]');
  const summaryEl = document.querySelector('[data-income-summary]');
  const loadMoreBtn = document.querySelector('[data-income-load-more]');
  const statusBanner = document.querySelector('[data-income-status]');

  // Toolbar elements
  const searchInput = document.querySelector('[data-income-search]');
  const fromDateInput = document.querySelector('[data-income-from-date]');
  const toDateInput = document.querySelector('[data-income-to-date]');
  const resetFiltersBtn = document.querySelector('[data-income-reset-filters]');
  const sortDateBtn = document.querySelector('[data-sort="date"]');
  const sortAmountBtn = document.querySelector('[data-sort="amount"]');
  const csvImportInput = document.querySelector('[data-csv-import]');
  const csvExportBtn = document.querySelector('[data-csv-export]');

  let nextPage = 1;
  let lastPage = 1;
  let total = 0;
  let loaded = 0;
  const incomeById = new Map();
  let allIncomes = [];

  // Active filter and sort state
  const filters = {
    search: '',
    from: '',
    to: '',
  };

  const sortState = {
    field: 'date',
    dir: 'desc', // 'desc' | 'asc' | 'none'
  };

  const showStatusBanner = (message, type = 'info', autoHideMs = 5000) => {
    if (!statusBanner) return;
    statusBanner.hidden = false;
    statusBanner.className = `income-status-banner ${type}`;
    statusBanner.textContent = message;
    if (autoHideMs > 0) {
      setTimeout(() => {
        statusBanner.hidden = true;
      }, autoHideMs);
    }
  };

  const hasActiveFilters = () => {
    return Boolean(filters.search.trim() || filters.from || filters.to);
  };

  const updateResetButtonVisibility = () => {
    if (resetFiltersBtn) {
      resetFiltersBtn.hidden = !hasActiveFilters();
    }
  };

  const updateSortIndicators = () => {
    if (sortDateBtn) {
      const indicator = sortDateBtn.querySelector('.sort-indicator');
      if (indicator) {
        indicator.textContent = sortState.field === 'date'
          ? (sortState.dir === 'desc' ? '↓' : '↑')
          : '↕';
      }
    }
    if (sortAmountBtn) {
      const indicator = sortAmountBtn.querySelector('.sort-indicator');
      if (indicator) {
        indicator.textContent = sortState.field === 'amount'
          ? (sortState.dir === 'desc' ? '↓' : '↑')
          : '↕';
      }
    }
  };

  const setLoadMore = (visible) => {
    if (!loadMoreBtn) return;
    loadMoreBtn.hidden = !visible;
    const footer = loadMoreBtn.closest('.card-footer');
    if (footer) footer.hidden = !visible;
  };

  const showState = (type, options = {}) => {
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

  // Build row matching Section 4.2:
  // Date, Source & Notes grouped, Frequency, Amount (right-aligned), Actions
  const buildRow = (item) => {
    const row = document.createElement('tr');
    row.dataset.incomeId = item.id;

    // Date
    const dateCell = document.createElement('td');
    dateCell.className = 'col-date';
    dateCell.dataset.label = 'Date';
    dateCell.textContent = UI.formatDate(item.income_date);

    // Source & Notes grouped in one readable cell with accessible disclosure
    const sourceCell = document.createElement('td');
    sourceCell.className = 'col-source cell-wrap';
    sourceCell.dataset.label = 'Source';

    const sourceMain = document.createElement('div');
    sourceMain.className = 'cell-main';
    sourceMain.textContent = item.source || 'Income';
    sourceCell.appendChild(sourceMain);

    if (item.notes) {
      const notesContainer = document.createElement('div');
      notesContainer.className = 'notes-container';

      const notesEl = document.createElement('div');
      notesEl.className = 'cell-sub cell-notes';
      notesEl.id = `notes-text-${item.id}`;
      notesEl.textContent = item.notes;

      // Accessible disclosure button (keyboard + touch + screen reader)
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'notes-expand-btn';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-controls', `notes-text-${item.id}`);
      toggleBtn.setAttribute('aria-label', `Show complete note for ${item.source || 'income'}`);
      toggleBtn.textContent = 'More';

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
        toggleBtn.textContent = isExpanded ? 'More' : 'Less';
        toggleBtn.setAttribute(
          'aria-label',
          isExpanded
            ? `Show complete note for ${item.source || 'income'}`
            : `Hide complete note for ${item.source || 'income'}`
        );
        notesEl.classList.toggle('is-expanded', !isExpanded);
      });

      notesContainer.append(notesEl, toggleBtn);
      sourceCell.appendChild(notesContainer);
    }

    // Frequency column (4.2 required columns)
    const freqCell = document.createElement('td');
    freqCell.className = 'col-frequency';
    freqCell.dataset.label = 'Frequency';
    const freqPill = document.createElement('span');
    freqPill.className = 'pill neutral';
    freqPill.textContent = item.frequency
      ? FREQUENCY_LABELS[item.frequency] || String(item.frequency)
      : FREQUENCY_LABELS[DEFAULT_FREQUENCY];
    freqCell.appendChild(freqPill);

    // Amount column (right-aligned)
    const amountCell = document.createElement('td');
    amountCell.className = 'num amount-pos col-amount';
    amountCell.dataset.label = 'Amount';
    amountCell.textContent = '+' + money(item.amount);

    // Actions column
    const actionsCell = document.createElement('td');
    actionsCell.className = 'col-actions actions-cell';
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

  const getFilteredAndSortedIncomes = () => {
    let result = allIncomes.slice();

    // 1. Filter: Search
    if (filters.search.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter((item) => {
        const sourceMatch = (item.source || '').toLowerCase().includes(query);
        const notesMatch = (item.notes || '').toLowerCase().includes(query);
        const freqLabel = (FREQUENCY_LABELS[item.frequency] || '').toLowerCase();
        const freqMatch = freqLabel.includes(query);
        return sourceMatch || notesMatch || freqMatch;
      });
    }

    // 2. Filter: From date
    if (filters.from) {
      result = result.filter((item) => {
        const itemDate = String(item.income_date || '').slice(0, 10);
        return itemDate >= filters.from;
      });
    }

    // 3. Filter: To date
    if (filters.to) {
      result = result.filter((item) => {
        const itemDate = String(item.income_date || '').slice(0, 10);
        return itemDate <= filters.to;
      });
    }

    // 4. Sort
    if (sortState.field === 'date') {
      result.sort((a, b) => {
        const dateA = new Date(a.income_date || 0).getTime();
        const dateB = new Date(b.income_date || 0).getTime();
        return sortState.dir === 'asc' ? dateA - dateB : dateB - dateA;
      });
    } else if (sortState.field === 'amount') {
      result.sort((a, b) => {
        const amtA = Number(a.amount) || 0;
        const amtB = Number(b.amount) || 0;
        return sortState.dir === 'asc' ? amtA - amtB : amtB - amtA;
      });
    }

    return result;
  };

  const renderCurrentList = () => {
    updateResetButtonVisibility();
    updateSortIndicators();

    if (!allIncomes.length) {
      if (summaryEl) summaryEl.textContent = '';
      showState('empty', { message: 'No income logged yet. Add your first entry.' });
      setLoadMore(false);
      return;
    }

    const filtered = getFilteredAndSortedIncomes();

    if (!filtered.length) {
      if (summaryEl) summaryEl.textContent = `0 of ${allIncomes.length} entries match filters`;
      showState('empty', {
        message: 'No income entries match your search or date filters.',
        retry: resetFilters,
      });
      // Style retry button as "Clear filters"
      const retryBtn = stateEl.querySelector('button');
      if (retryBtn) retryBtn.textContent = 'Clear filters';
      setLoadMore(false);
      return;
    }

    rowsBody.replaceChildren();
    filtered.forEach((item) => {
      rowsBody.appendChild(buildRow(item));
    });

    showTable();

    if (summaryEl) {
      if (hasActiveFilters()) {
        summaryEl.textContent = `Showing ${filtered.length} of ${allIncomes.length} entries (filtered)`;
      } else {
        summaryEl.textContent = total ? `Showing ${loaded} of ${total} entries` : `Showing ${loaded} entries`;
      }
    }

    // Load more is available only if no active filter is restricting view and more pages exist
    setLoadMore(!hasActiveFilters() && nextPage < lastPage);
  };

  function resetFilters() {
    filters.search = '';
    filters.from = '';
    filters.to = '';
    if (searchInput) searchInput.value = '';
    if (fromDateInput) fromDateInput.value = '';
    if (toDateInput) toDateInput.value = '';
    renderCurrentList();
  }

  // --- Filter toolbar event listeners ---
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      filters.search = searchInput.value;
      renderCurrentList();
      clearTimeout(debounceTimer);
    });
  }

  if (fromDateInput) {
    fromDateInput.addEventListener('change', () => {
      filters.from = fromDateInput.value;
      renderCurrentList();
    });
  }

  if (toDateInput) {
    toDateInput.addEventListener('change', () => {
      filters.to = toDateInput.value;
      renderCurrentList();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', resetFilters);
  }

  // --- Sort event listeners ---
  if (sortDateBtn) {
    sortDateBtn.addEventListener('click', () => {
      if (sortState.field === 'date') {
        sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
      } else {
        sortState.field = 'date';
        sortState.dir = 'desc';
      }
      renderCurrentList();
    });
  }

  if (sortAmountBtn) {
    sortAmountBtn.addEventListener('click', () => {
      if (sortState.field === 'amount') {
        sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
      } else {
        sortState.field = 'amount';
        sortState.dir = 'desc';
      }
      renderCurrentList();
    });
  }

  // --- CSV Export ---
  if (csvExportBtn) {
    csvExportBtn.addEventListener('click', () => {
      const itemsToExport = getFilteredAndSortedIncomes();
      if (!itemsToExport.length) {
        UI.showToast('No income records available to export.', 'error');
        return;
      }

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = ['Date', 'Source', 'Frequency', 'Amount', 'Notes'];
      const rows = itemsToExport.map((item) => [
        item.income_date ? String(item.income_date).slice(0, 10) : '',
        escapeCsv(item.source),
        escapeCsv(item.frequency || DEFAULT_FREQUENCY),
        Number(item.amount).toFixed(2),
        escapeCsv(item.notes || ''),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `spendsense-income-${today}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      UI.showToast(`Exported ${itemsToExport.length} entries to CSV.`, 'success');
    });
  }

  // --- CSV Import ---
  if (csvImportInput) {
    csvImportInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      csvImportInput.value = ''; // Reset input to allow re-importing same file

      showStatusBanner('Reading CSV file…', 'info', 0);

      const reader = new FileReader();
      reader.onerror = () => {
        showStatusBanner('CSV import failed: Could not read file.', 'error', 6000);
      };

      reader.onload = async (e) => {
        const text = e.target.result;
        if (!text || typeof text !== 'string') {
          showStatusBanner('CSV import failed: File is empty.', 'error', 6000);
          return;
        }

        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          showStatusBanner('CSV import failed: CSV must contain a header row and at least one data row.', 'error', 6000);
          return;
        }

        // Parse header
        const parseRow = (line) => {
          const re = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
          const result = [];
          let match;
          while ((match = re.exec(line)) !== null) {
            if (match.index === re.lastIndex) re.lastIndex++;
            result.push(match[1] !== undefined ? match[1].replace(/""/g, '"').trim() : (match[2] || '').trim());
          }
          return result;
        };

        const headerLine = lines[0];
        const headers = parseRow(headerLine).map((h) => h.toLowerCase());

        const dateIdx = headers.findIndex((h) => h.includes('date'));
        const sourceIdx = headers.findIndex((h) => h.includes('source') || h.includes('category') || h.includes('desc'));
        const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('value'));
        const freqIdx = headers.findIndex((h) => h.includes('freq'));
        const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('comment'));

        if (amountIdx === -1 || (sourceIdx === -1 && dateIdx === -1)) {
          showStatusBanner('CSV import failed: Required columns (Date, Source, Amount) not detected.', 'error', 7000);
          return;
        }

        const dataRows = lines.slice(1);
        let importedCount = 0;
        let failedCount = 0;

        showStatusBanner(`Importing 0 of ${dataRows.length} entries…`, 'info', 0);

        for (let i = 0; i < dataRows.length; i++) {
          const cells = parseRow(dataRows[i]);
          if (!cells || cells.length === 0 || cells.every((c) => !c)) continue;

          const amountVal = parseFloat(cells[amountIdx]);
          const sourceVal = sourceIdx !== -1 && cells[sourceIdx] ? cells[sourceIdx] : 'Other';
          let dateVal = dateIdx !== -1 && cells[dateIdx] ? cells[dateIdx] : new Date().toISOString().slice(0, 10);
          // Normalize date if needed (YYYY-MM-DD)
          if (dateVal.includes('/')) {
            const parts = dateVal.split('/');
            if (parts.length === 3) {
              dateVal = parts[2].length === 4 ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : dateVal;
            }
          }
          const freqVal = freqIdx !== -1 && cells[freqIdx] ? cells[freqIdx].toLowerCase() : DEFAULT_FREQUENCY;
          const notesVal = notesIdx !== -1 && cells[notesIdx] ? cells[notesIdx] : null;

          if (isNaN(amountVal) || amountVal <= 0) {
            failedCount++;
            continue;
          }

          try {
            showStatusBanner(`Importing entry ${i + 1} of ${dataRows.length}…`, 'info', 0);
            const { status } = await api.post('/incomes', {
              source: sourceVal,
              amount: amountVal,
              income_date: dateVal.slice(0, 10),
              frequency: FREQUENCY_LABELS[freqVal] ? freqVal : DEFAULT_FREQUENCY,
              notes: notesVal,
            });

            if (status === 201) {
              importedCount++;
            } else {
              failedCount++;
            }
          } catch (err) {
            failedCount++;
          }
        }

        if (importedCount > 0) {
          showStatusBanner(
            `Successfully imported ${importedCount} income ${importedCount === 1 ? 'entry' : 'entries'}${failedCount ? ` (${failedCount} skipped/failed)` : ''}.`,
            'success',
            6000
          );
          UI.showToast(`Imported ${importedCount} income entries`, 'success');
          loadIncomes(false);
        } else {
          showStatusBanner(`CSV import failed: Could not import any entries (${failedCount} invalid).`, 'error', 7000);
        }
      };

      reader.readAsText(file);
    });
  }

  // --- Table Event Delegation: Edit & Delete ---
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
          incomeById.delete(id);
          allIncomes = allIncomes.filter((item) => String(item.id) !== id);
          loaded = Math.max(0, loaded - 1);
          total = Math.max(0, total - 1);
          renderCurrentList();
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
      allIncomes = [];
      incomeById.clear();
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

      items.forEach((item) => {
        incomeById.set(String(item.id), item);
      });

      if (!append) {
        allIncomes = items.slice();
      } else {
        allIncomes = allIncomes.concat(items);
      }
      loaded = allIncomes.length;

      renderCurrentList();

      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.classList.remove('loading');
        loadMoreBtn.textContent = 'Load more';
      }
    } catch (err) {
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.classList.remove('loading');
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
      loadMoreBtn.classList.add('loading');
      loadMoreBtn.textContent = 'Loading…';
      loadIncomes(true);
    });
  }

  loadIncomes(false);
});
