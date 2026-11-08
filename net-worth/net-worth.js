/**
 * SpendSense — Net Worth Standalone Module
 * Manages assets, liabilities, append-only valuation snapshots, and historical trends.
 * Financial Integrity Rules:
 *  - Net Worth = Total Assets - Total Liabilities.
 *  - Liabilities are stored and entered as non-negative amounts; backend calculates subtraction.
 *  - Reuses liability records created through Debts & Loans; never creates duplicate liabilities.
 *  - Archived entries disappear from current totals while preserving append-only valuation records.
 *  - Values are user-entered estimates; no live bank APIs are simulated or claimed.
 */
'use strict';

(function () {
  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const ASSET_CATEGORIES = [
    { value: 'cash', label: 'Cash and savings' },
    { value: 'investment', label: 'Investments' },
    { value: 'other_asset', label: 'Other assets' }
  ];

  const LIABILITY_CATEGORIES = [
    { value: 'loan', label: 'Loan' },
    { value: 'other_liability', label: 'Other liabilities' }
  ];

  const NetWorth = {
    entries: [],
    summary: null,
    trendData: null,
    trendMonths: 12,
    editingId: null,
    valuationTarget: null,
    filters: {
      search: '',
      type: '',
      category: '',
      status: 'active'
    },

    init() {
      this.bindElements();
      this.bindEvents();
      this.loadInitialData();
    },

    bindElements() {
      this.dom = {
        stateContainer: document.getElementById('net-worth-state-container'),
        tablesWrap: document.getElementById('net-worth-tables-wrap'),
        assetsTableBody: document.getElementById('assets-table-body'),
        liabilitiesTableBody: document.getElementById('liabilities-table-body'),
        assetsCountBadge: document.getElementById('assets-count-badge'),
        assetsSubtotal: document.getElementById('assets-subtotal'),
        liabilitiesCountBadge: document.getElementById('liabilities-count-badge'),
        liabilitiesSubtotal: document.getElementById('liabilities-subtotal'),

        // Summary cards
        statNetWorth: document.getElementById('stat-net-worth'),
        statTotalAssets: document.getElementById('stat-total-assets'),
        statTotalLiabilities: document.getElementById('stat-total-liabilities'),
        statActiveCount: document.getElementById('stat-active-count'),
        statAssetsCount: document.getElementById('stat-assets-count'),
        statLiabilitiesCount: document.getElementById('stat-liabilities-count'),
        statAsOfDate: document.getElementById('stat-as-of-date'),

        // Category breakdown
        categoryCard: document.getElementById('category-breakdown-card'),
        categoryPillsWrap: document.getElementById('category-pills-wrap'),

        // Trend
        trendMonthsSelect: document.getElementById('trend-months-select'),
        trendStateContainer: document.getElementById('trend-state-container'),
        trendChartWrap: document.getElementById('trend-chart-wrap'),

        // Filters
        filterForm: document.getElementById('net-worth-filter-form'),
        searchFilter: document.getElementById('net-worth-search'),
        typeFilter: document.getElementById('net-worth-type-filter'),
        categoryFilter: document.getElementById('net-worth-category-filter'),
        statusFilter: document.getElementById('net-worth-status-filter'),
        clearFiltersBtn: document.getElementById('net-worth-clear-filters'),

        // Entry Modal
        entryModal: document.getElementById('net-worth-modal'),
        entryModalTitle: document.getElementById('modal-entry-title'),
        entryModalSub: document.getElementById('modal-entry-sub'),
        entryForm: document.getElementById('net-worth-form'),
        entryFormId: document.getElementById('entry-form-id'),
        entryTypeContainer: document.getElementById('entry-type-container'),
        entryTypeAsset: document.getElementById('entry-type-asset'),
        entryTypeLiability: document.getElementById('entry-type-liability'),
        entryName: document.getElementById('entry-name'),
        entryInstitution: document.getElementById('entry-institution'),
        entryCategory: document.getElementById('entry-category'),
        entryOpeningSection: document.getElementById('entry-opening-valuation-section'),
        entryValue: document.getElementById('entry-value'),
        entryValuationDate: document.getElementById('entry-valuation-date'),
        entryValuationNote: document.getElementById('entry-valuation-note'),
        entryNotes: document.getElementById('entry-notes'),
        entryFormError: document.getElementById('entry-form-error'),
        entrySubmitBtn: document.getElementById('entry-submit-btn'),

        // Valuation Modal
        valModal: document.getElementById('valuation-modal'),
        valForm: document.getElementById('valuation-form'),
        valEntryId: document.getElementById('valuation-entry-id'),
        valTargetName: document.getElementById('valuation-target-name'),
        valTargetTypeBadge: document.getElementById('valuation-target-type-badge'),
        valTargetLastVal: document.getElementById('valuation-target-last-val'),
        valAmount: document.getElementById('val-amount'),
        valDate: document.getElementById('val-date'),
        valNote: document.getElementById('val-note'),
        valFormError: document.getElementById('val-form-error'),

        // History Modal
        historyModal: document.getElementById('history-modal'),
        historyTableBody: document.getElementById('history-table-body'),
        historyModalTitle: document.getElementById('modal-history-title'),
        historyModalSub: document.getElementById('modal-history-sub'),

        // Actions
        openEntryModalBtns: document.querySelectorAll('[data-open-entry-modal]'),
        closeEntryModalBtns: document.querySelectorAll('[data-close-entry-modal]'),
        closeValModalBtns: document.querySelectorAll('[data-close-valuation-modal]'),
        closeHistoryModalBtns: document.querySelectorAll('[data-close-history-modal]'),
        refreshBtn: document.getElementById('refresh-net-worth-btn')
      };
    },

    bindEvents() {
      // Open / Close entry modal
      this.dom.openEntryModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.openEntryModal());
      });
      this.dom.closeEntryModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.closeEntryModal());
      });

      // Close valuation modal
      this.dom.closeValModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.closeValModal());
      });

      // Close history modal
      this.dom.closeHistoryModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.closeHistoryModal());
      });

      // Modal backdrops & Escape key
      [this.dom.entryModal, this.dom.valModal, this.dom.historyModal].forEach(modal => {
        modal?.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.closeEntryModal();
            this.closeValModal();
            this.closeHistoryModal();
          }
        });
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeEntryModal();
          this.closeValModal();
          this.closeHistoryModal();
        }
      });

      // Entry type radio toggle -> update category options
      const handleTypeChange = () => {
        const type = this.dom.entryTypeLiability.checked ? 'liability' : 'asset';
        this.populateCategoryOptions(type);
      };
      this.dom.entryTypeAsset?.addEventListener('change', handleTypeChange);
      this.dom.entryTypeLiability?.addEventListener('change', handleTypeChange);

      // Entry Form Submit
      this.dom.entryForm?.addEventListener('submit', (e) => this.handleEntryFormSubmit(e));

      // Valuation Form Submit
      this.dom.valForm?.addEventListener('submit', (e) => this.handleValuationFormSubmit(e));

      // Trend History Range Selector
      this.dom.trendMonthsSelect?.addEventListener('change', () => {
        this.trendMonths = parseInt(this.dom.trendMonthsSelect.value, 10) || 12;
        this.loadTrend();
      });

      // Filters
      let debounceTimer = null;
      this.dom.searchFilter?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filters.search = this.dom.searchFilter.value.trim();
          this.updateClearFilterVisibility();
          this.renderTables();
        }, 250);
      });

      this.dom.typeFilter?.addEventListener('change', () => {
        this.filters.type = this.dom.typeFilter.value;
        this.updateClearFilterVisibility();
        this.renderTables();
      });

      this.dom.categoryFilter?.addEventListener('change', () => {
        this.filters.category = this.dom.categoryFilter.value;
        this.updateClearFilterVisibility();
        this.renderTables();
      });

      this.dom.statusFilter?.addEventListener('change', () => {
        this.filters.status = this.dom.statusFilter.value;
        this.updateClearFilterVisibility();
        this.loadNetWorth();
      });

      this.dom.clearFiltersBtn?.addEventListener('click', () => {
        this.dom.searchFilter.value = '';
        this.dom.typeFilter.value = '';
        this.dom.categoryFilter.value = '';
        this.dom.statusFilter.value = 'active';
        this.filters = { search: '', type: '', category: '', status: 'active' };
        this.updateClearFilterVisibility();
        this.loadNetWorth();
      });

      this.dom.filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.renderTables();
      });

      // Refresh Button
      this.dom.refreshBtn?.addEventListener('click', () => {
        this.loadInitialData();
      });

      // Actions Delegation on Tables
      this.dom.tablesWrap?.addEventListener('click', (e) => this.handleTableAction(e));

      // Theme Change Event
      window.addEventListener('spendsense:theme-change', () => {
        if (this.trendData) this.renderTrend();
        if (this.summary) {
          this.renderSummary();
          this.renderCategoryBreakdown();
        }
      });
    },

    updateClearFilterVisibility() {
      const hasActive = Boolean(
        this.filters.search ||
        this.filters.type ||
        this.filters.category ||
        this.filters.status !== 'active'
      );
      if (this.dom.clearFiltersBtn) {
        this.dom.clearFiltersBtn.style.display = hasActive ? 'inline-block' : 'none';
      }
    },

    populateCategoryOptions(type, selectedCategory = null) {
      if (!this.dom.entryCategory) return;
      const categories = type === 'liability' ? LIABILITY_CATEGORIES : ASSET_CATEGORIES;
      this.dom.entryCategory.innerHTML = categories.map(cat => {
        const isSelected = selectedCategory && selectedCategory === cat.value ? 'selected' : '';
        return `<option value="${cat.value}" ${isSelected}>${cat.label}</option>`;
      }).join('');
    },

    async loadInitialData() {
      await Promise.all([
        this.loadNetWorth(),
        this.loadTrend()
      ]);
    },

    async loadNetWorth() {
      if (UI) UI.renderState(this.dom.stateContainer, 'loading', { message: 'Loading net worth records…' });
      this.dom.tablesWrap.style.display = 'none';

      try {
        const statusParam = this.filters.status || 'active';
        const { data, status } = await API.get(`/net-worth?status=${encodeURIComponent(statusParam)}`);

        if (status === 200 && data && data.success) {
          const payload = data.data || {};
          this.entries = payload.entries || [];
          this.summary = payload.summary || null;

          this.renderSummary();
          this.renderCategoryBreakdown();
          this.renderTables();
        } else {
          const msg = (data && data.message) || 'Could not load net worth entries.';
          if (UI) {
            UI.renderState(this.dom.stateContainer, 'error', {
              message: msg,
              retry: () => this.loadNetWorth()
            });
          }
        }
      } catch (err) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'error', {
            message: 'Network error loading net worth data. Please try again.',
            retry: () => this.loadNetWorth()
          });
        }
      }
    },

    renderSummary() {
      const s = this.summary;
      if (!s) return;

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Net Worth total
      if (this.dom.statNetWorth) {
        this.dom.statNetWorth.textContent = formatVal(s.net_worth);
        const nwVal = parseFloat(s.net_worth || '0');
        if (nwVal < 0) {
          this.dom.statNetWorth.style.color = 'var(--danger, #dc2626)';
        } else {
          this.dom.statNetWorth.style.color = 'var(--ink, #0f172a)';
        }
      }

      // Total Assets
      if (this.dom.statTotalAssets) {
        this.dom.statTotalAssets.textContent = formatVal(s.total_assets);
      }
      const activeAssets = this.entries.filter(e => e.type === 'asset' && e.status === 'active').length;
      if (this.dom.statAssetsCount) {
        this.dom.statAssetsCount.textContent = `${activeAssets} active ${activeAssets === 1 ? 'asset' : 'assets'}`;
      }

      // Total Liabilities
      if (this.dom.statTotalLiabilities) {
        this.dom.statTotalLiabilities.textContent = formatVal(s.total_liabilities);
      }
      const activeLiab = this.entries.filter(e => e.type === 'liability' && e.status === 'active').length;
      if (this.dom.statLiabilitiesCount) {
        this.dom.statLiabilitiesCount.textContent = `${activeLiab} active ${activeLiab === 1 ? 'liability' : 'liabilities'}`;
      }

      // Active count & As of date
      if (this.dom.statActiveCount) {
        this.dom.statActiveCount.textContent = s.active_entry_count ?? this.entries.length;
      }
      if (this.dom.statAsOfDate) {
        const asOfFormatted = s.as_of && UI ? UI.formatDate(s.as_of) : (s.as_of || 'Today');
        this.dom.statAsOfDate.textContent = `As of ${asOfFormatted}`;
      }
    },

    renderCategoryBreakdown() {
      const categories = this.summary?.category_totals || [];
      if (!categories.length) {
        this.dom.categoryCard.style.display = 'none';
        return;
      }

      this.dom.categoryCard.style.display = 'block';
      const pillsHtml = categories.map(cat => {
        const isLiability = cat.type === 'liability';
        const pillClass = isLiability ? 'danger' : 'success';
        const formattedTotal = UI ? UI.formatMoney(cat.total) : `₹${cat.total}`;
        return `
          <div class="pill ${pillClass}" style="padding: 6px 12px; font-size: 0.82rem; display: inline-flex; gap: 6px; align-items: center;">
            <span style="font-weight: 500;">${this.escapeHtml(cat.category_label)}:</span>
            <span style="font-weight: 700;">${formattedTotal}</span>
            <span style="opacity: 0.8; font-size: 0.72rem;">(${cat.entry_count})</span>
          </div>
        `;
      }).join('');

      this.dom.categoryPillsWrap.innerHTML = pillsHtml;
    },

    renderTables() {
      let filtered = [...this.entries];

      // Client filter: search
      if (this.filters.search) {
        const query = this.filters.search.toLowerCase();
        filtered = filtered.filter(item => {
          const name = (item.name || '').toLowerCase();
          const inst = (item.institution || '').toLowerCase();
          const notes = (item.notes || '').toLowerCase();
          const cat = (item.category_label || item.category || '').toLowerCase();
          return name.includes(query) || inst.includes(query) || notes.includes(query) || cat.includes(query);
        });
      }

      // Client filter: type
      if (this.filters.type) {
        filtered = filtered.filter(item => item.type === this.filters.type);
      }

      // Client filter: category
      if (this.filters.category) {
        filtered = filtered.filter(item => item.category === this.filters.category);
      }

      if (!filtered.length) {
        this.dom.tablesWrap.style.display = 'none';
        const hasFilters = Boolean(this.filters.search || this.filters.type || this.filters.category || this.filters.status !== 'active');
        const emptyMsg = hasFilters
          ? 'No net worth records match your active filters.'
          : 'No net worth records tracked yet. Add your first asset or liability to begin.';
        if (UI) UI.renderState(this.dom.stateContainer, 'empty', { message: emptyMsg });
        return;
      }

      this.dom.stateContainer.replaceChildren();
      this.dom.tablesWrap.style.display = 'block';

      const assets = filtered.filter(e => e.type === 'asset');
      const liabilities = filtered.filter(e => e.type === 'liability');

      this.renderAssetRows(assets);
      this.renderLiabilityRows(liabilities);
    },

    renderAssetRows(assets) {
      if (this.dom.assetsCountBadge) {
        this.dom.assetsCountBadge.textContent = `${assets.length} ${assets.length === 1 ? 'asset' : 'assets'}`;
      }

      const totalCents = assets.reduce((sum, a) => {
        if (a.status !== 'active' || !a.latest_value) return sum;
        return sum + Math.round(parseFloat(a.latest_value) * 100);
      }, 0);
      const subtotalFmt = UI ? UI.formatMoney(totalCents / 100) : `₹${(totalCents / 100).toFixed(2)}`;
      if (this.dom.assetsSubtotal) this.dom.assetsSubtotal.textContent = subtotalFmt;

      if (!assets.length) {
        this.dom.assetsTableBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--muted);">No asset entries found matching current criteria.</td></tr>
        `;
        return;
      }

      const rowsHtml = assets.map(item => this.buildEntryRowHtml(item)).join('');
      this.dom.assetsTableBody.innerHTML = rowsHtml;
    },

    renderLiabilityRows(liabilities) {
      if (this.dom.liabilitiesCountBadge) {
        this.dom.liabilitiesCountBadge.textContent = `${liabilities.length} ${liabilities.length === 1 ? 'liability' : 'liabilities'}`;
      }

      const totalCents = liabilities.reduce((sum, l) => {
        if (l.status !== 'active' || !l.latest_value) return sum;
        return sum + Math.round(parseFloat(l.latest_value) * 100);
      }, 0);
      const subtotalFmt = UI ? UI.formatMoney(totalCents / 100) : `₹${(totalCents / 100).toFixed(2)}`;
      if (this.dom.liabilitiesSubtotal) this.dom.liabilitiesSubtotal.textContent = subtotalFmt;

      if (!liabilities.length) {
        this.dom.liabilitiesTableBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--muted);">No liability entries found matching current criteria.</td></tr>
        `;
        return;
      }

      const rowsHtml = liabilities.map(item => this.buildEntryRowHtml(item)).join('');
      this.dom.liabilitiesTableBody.innerHTML = rowsHtml;
    },

    buildEntryRowHtml(item) {
      const nameEsc = this.escapeHtml(item.name);
      const instEsc = item.institution ? `<div style="font-size: 0.78rem; color: var(--muted);">${this.escapeHtml(item.institution)}</div>` : '';
      const catLabel = this.escapeHtml(item.category_label || item.category || '—');

      const isArchived = item.status === 'archived';
      const statusPill = isArchived
        ? `<span class="pill neutral" style="margin-left: 6px; font-size: 0.7rem;">Archived</span>`
        : '';

      const isLiability = item.type === 'liability';
      const valueFormatted = item.latest_value !== null
        ? (UI ? UI.formatMoney(item.latest_value) : `₹${item.latest_value}`)
        : '<span style="color: var(--muted);">Unvalued</span>';

      const valueColor = isLiability ? 'var(--danger, #dc2626)' : 'var(--ink, #0f172a)';

      const dateStr = item.latest_valuation_date
        ? (UI ? UI.formatDate(item.latest_valuation_date) : item.latest_valuation_date)
        : '—';

      const snapshotCount = item.valuation_count ?? 1;

      // Detect if from Debts & Loans
      const isFromDebts = isLiability && (
        item.category === 'loan' ||
        (item.notes && item.notes.startsWith('{') && item.notes.includes('"original_amount"'))
      );
      const debtsBadge = isFromDebts
        ? `<span class="pill primary" style="margin-left: 6px; font-size: 0.68rem;" title="Integrated with Debts & Loans">Debt &amp; Loan</span>`
        : '';

      // Actions
      let actionsHtml = '';
      if (!isArchived) {
        actionsHtml = `
          <button type="button" class="btn secondary sm" data-action="record-valuation" data-id="${item.id}">Update Value</button>
          <button type="button" class="btn ghost sm" data-action="history" data-id="${item.id}">History</button>
          <button type="button" class="btn ghost sm" data-action="edit" data-id="${item.id}">Edit</button>
          <button type="button" class="btn ghost sm" style="color: var(--danger, #dc2626);" data-action="archive" data-id="${item.id}">Archive</button>
        `;
      } else {
        actionsHtml = `
          <button type="button" class="btn ghost sm" data-action="history" data-id="${item.id}">History</button>
          <button type="button" class="btn secondary sm" data-action="restore" data-id="${item.id}">Restore</button>
        `;
      }

      return `
        <tr data-entry-id="${item.id}" ${isArchived ? 'style="opacity: 0.75;"' : ''}>
          <td data-label="Entry">
            <div style="font-weight: 600; color: var(--ink); display: flex; align-items: center; flex-wrap: wrap;">
              ${nameEsc}${statusPill}${debtsBadge}
            </div>
            ${instEsc}
          </td>
          <td data-label="Category" class="col-tight">${catLabel}</td>
          <td data-label="Value" class="num col-tight" style="font-weight: 600; color: ${valueColor};">${valueFormatted}</td>
          <td data-label="Valuation Date" class="col-tight">${dateStr}</td>
          <td data-label="Snapshots" class="col-tight text-center">
            <span class="pill neutral" style="font-size: 0.72rem;">${snapshotCount} ${snapshotCount === 1 ? 'snapshot' : 'snapshots'}</span>
          </td>
          <td data-label="Actions" class="actions-cell col-tight text-right">
            <div style="display: inline-flex; gap: 4px; justify-content: flex-end;">
              ${actionsHtml}
            </div>
          </td>
        </tr>
      `;
    },

    async loadTrend() {
      if (UI) UI.renderState(this.dom.trendStateContainer, 'loading', { message: 'Loading trend data…' });
      this.dom.trendChartWrap.style.display = 'none';

      try {
        const months = this.trendMonths || 12;
        const { data, status } = await API.get(`/net-worth/trend?months=${months}`);

        if (status === 200 && data && data.success) {
          this.trendData = data.data || {};
          this.renderTrend();
        } else {
          const msg = (data && data.message) || 'Could not load trend data.';
          if (UI) {
            UI.renderState(this.dom.trendStateContainer, 'error', {
              message: msg,
              retry: () => this.loadTrend()
            });
          }
        }
      } catch (e) {
        if (UI) {
          UI.renderState(this.dom.trendStateContainer, 'error', {
            message: 'Network error loading historical trend.',
            retry: () => this.loadTrend()
          });
        }
      }
    },

    renderTrend() {
      const points = this.trendData?.points || [];

      if (points.length < 2) {
        this.dom.trendChartWrap.style.display = 'none';
        if (UI) {
          UI.renderState(this.dom.trendStateContainer, 'empty', {
            message: 'A historical trend is available once valuation snapshots exist across at least two distinct months. Record snapshots regularly to view your trajectory.'
          });
        }
        return;
      }

      this.dom.trendStateContainer.replaceChildren();
      this.dom.trendChartWrap.style.display = 'block';

      // Build clean responsive SVG trend bar chart
      const maxVal = Math.max(
        ...points.map(p => Math.max(parseFloat(p.total_assets || 0), parseFloat(p.net_worth || 0), parseFloat(p.total_liabilities || 0)))
      ) || 1000;

      const minVal = Math.min(
        0,
        ...points.map(p => parseFloat(p.net_worth || 0))
      );

      const formatVal = (v) => UI ? UI.formatMoney(v) : `₹${v}`;

      const barsHtml = points.map(pt => {
        const assets = parseFloat(pt.total_assets || 0);
        const liab = parseFloat(pt.total_liabilities || 0);
        const nw = parseFloat(pt.net_worth || 0);

        const assetHeight = Math.max(4, Math.round((assets / maxVal) * 120));
        const liabHeight = Math.max(4, Math.round((liab / maxVal) * 120));

        const monthLabel = pt.month; // YYYY-MM

        return `
          <div style="flex: 1 1 0; min-width: 48px; max-width: 80px; display: flex; flex-direction: column; align-items: center; gap: 6px;" title="Month: ${pt.month}&#10;Net Worth: ${formatVal(pt.net_worth)}&#10;Assets: ${formatVal(pt.total_assets)}&#10;Liabilities: ${formatVal(pt.total_liabilities)}">
            <div style="font-size: 0.72rem; font-weight: 700; color: ${nw >= 0 ? 'var(--ink)' : 'var(--danger)'};">
              ${formatVal(pt.net_worth)}
            </div>
            <div style="display: flex; gap: 4px; align-items: flex-end; height: 130px; width: 100%; justify-content: center; border-bottom: 2px solid var(--border); padding-bottom: 2px;">
              <div style="width: 14px; height: ${assetHeight}px; background: var(--success, #16a34a); border-radius: 3px 3px 0 0;" title="Assets: ${formatVal(pt.total_assets)}"></div>
              <div style="width: 14px; height: ${liabHeight}px; background: var(--danger, #dc2626); border-radius: 3px 3px 0 0;" title="Liabilities: ${formatVal(pt.total_liabilities)}"></div>
            </div>
            <div style="font-size: 0.72rem; color: var(--muted); text-align: center; margin-top: 4px;">
              ${monthLabel}
            </div>
          </div>
        `;
      }).join('');

      const summaryRows = points.map(pt => `
        <tr>
          <td>${pt.month}</td>
          <td>${formatVal(pt.net_worth)}</td>
          <td>${formatVal(pt.total_assets)}</td>
          <td>${formatVal(pt.total_liabilities)}</td>
        </tr>
      `).join('');

      this.dom.trendChartWrap.innerHTML = `
        <div style="display: flex; gap: 12px; justify-content: space-between; align-items: flex-end; padding: 16px 8px 8px; overflow-x: auto;">
          ${barsHtml}
        </div>
        <table class="sr-only" aria-label="Net worth historical trend by month">
          <caption>Historical Net Worth, Total Assets, and Total Liabilities Summary</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Net Worth</th>
              <th scope="col">Total Assets</th>
              <th scope="col">Total Liabilities</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 12px; font-size: 0.78rem;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; background: var(--success, #16a34a); border-radius: 2px;"></span>
            <span>Total Assets</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; background: var(--danger, #dc2626); border-radius: 2px;"></span>
            <span>Total Liabilities</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700;">Top value:</span>
            <span>Net Worth (Assets − Liabilities)</span>
          </div>
        </div>
      `;
    },

    openEntryModal(entry = null) {
      this.clearEntryFormError();
      this.dom.entryForm?.reset();

      if (!entry) {
        // Create mode
        this.editingId = null;
        this.dom.entryFormId.value = '';
        this.dom.entryModalTitle.textContent = 'Add Net Worth Entry';
        this.dom.entryModalSub.textContent = 'Track a financial asset or liability';
        this.dom.entrySubmitBtn.textContent = 'Save Entry';

        this.dom.entryTypeContainer.style.display = 'block';
        this.dom.entryTypeAsset.checked = true;
        this.populateCategoryOptions('asset');

        this.dom.entryOpeningSection.style.display = 'block';
        this.dom.entryValue.setAttribute('required', 'required');
        this.dom.entryValuationDate.value = new Date().toISOString().split('T')[0];
        this.dom.entryValuationDate.max = new Date().toISOString().split('T')[0];
      } else {
        // Edit mode (Note: opening value is not editable via PUT, values are append-only snapshots)
        this.editingId = entry.id;
        this.dom.entryFormId.value = entry.id;
        this.dom.entryModalTitle.textContent = 'Edit Net Worth Entry';
        this.dom.entryModalSub.textContent = `Update tracker details for "${entry.name}"`;
        this.dom.entrySubmitBtn.textContent = 'Save Changes';

        this.dom.entryTypeContainer.style.display = 'none';
        if (entry.type === 'liability') {
          this.dom.entryTypeLiability.checked = true;
          this.populateCategoryOptions('liability', entry.category);
        } else {
          this.dom.entryTypeAsset.checked = true;
          this.populateCategoryOptions('asset', entry.category);
        }

        this.dom.entryName.value = entry.name || '';
        this.dom.entryInstitution.value = entry.institution || '';
        this.dom.entryCategory.value = entry.category || '';
        this.dom.entryNotes.value = entry.notes || '';

        // Hide opening valuation section during edit
        this.dom.entryOpeningSection.style.display = 'none';
        this.dom.entryValue.removeAttribute('required');
      }

      this.dom.entryModal.hidden = false;
      this.dom.entryName.focus();
    },

    closeEntryModal() {
      if (this.dom.entryModal) this.dom.entryModal.hidden = true;
      this.editingId = null;
      this.clearEntryFormError();
    },

    clearEntryFormError() {
      if (!this.dom.entryFormError) return;
      this.dom.entryFormError.textContent = '';
      this.dom.entryFormError.style.display = 'none';
    },

    showEntryFormError(msg) {
      if (!this.dom.entryFormError) return;
      this.dom.entryFormError.textContent = msg;
      this.dom.entryFormError.style.display = 'block';
    },

    async handleEntryFormSubmit(e) {
      e.preventDefault();
      this.clearEntryFormError();

      const name = this.dom.entryName.value.trim();
      if (!name) {
        this.showEntryFormError('Entry name is required.');
        return;
      }

      const type = this.editingId
        ? (this.entries.find(x => x.id === this.editingId)?.type || (this.dom.entryTypeLiability.checked ? 'liability' : 'asset'))
        : (this.dom.entryTypeLiability.checked ? 'liability' : 'asset');

      const category = this.dom.entryCategory.value;
      if (!category) {
        this.showEntryFormError('Please select a valid category.');
        return;
      }

      const institution = this.dom.entryInstitution.value.trim() || null;
      const notes = this.dom.entryNotes.value.trim() || null;

      if (!this.editingId) {
        // Create
        const rawVal = this.dom.entryValue.value;
        const val = parseFloat(rawVal);
        if (isNaN(val) || val < 0) {
          this.showEntryFormError('Please enter a valid non-negative valuation amount.');
          return;
        }

        const date = this.dom.entryValuationDate.value || new Date().toISOString().split('T')[0];
        const todayStr = new Date().toISOString().split('T')[0];
        if (date > todayStr) {
          this.showEntryFormError('Valuation date cannot be in the future.');
          return;
        }

        const payload = {
          name,
          type,
          category,
          institution,
          notes,
          value: Number(val).toFixed(2),
          valuation_date: date,
          valuation_note: this.dom.entryValuationNote.value.trim() || 'Opening valuation'
        };

        this.dom.entrySubmitBtn.disabled = true;
        this.dom.entrySubmitBtn.textContent = 'Saving…';

        try {
          const { data, status } = await API.post('/net-worth', payload);
          if (status === 201 && data && data.success) {
            if (UI) UI.showToast(`"${name}" created successfully.`, 'success');
            this.closeEntryModal();
            await this.loadInitialData();
          } else {
            const err = data?.message || (data?.errors && Object.values(data.errors).flat().join(' ')) || 'Could not save entry.';
            this.showEntryFormError(err);
          }
        } catch (err) {
          this.showEntryFormError('Network error saving entry. Please try again.');
        } finally {
          this.dom.entrySubmitBtn.disabled = false;
          this.dom.entrySubmitBtn.textContent = 'Save Entry';
        }
      } else {
        // Update metadata
        const payload = {
          name,
          type,
          category,
          institution,
          notes
        };

        this.dom.entrySubmitBtn.disabled = true;
        this.dom.entrySubmitBtn.textContent = 'Saving…';

        try {
          const { data, status } = await API.put(`/net-worth/${this.editingId}`, payload);
          if (status === 200 && data && data.success) {
            if (UI) UI.showToast(`"${name}" updated successfully.`, 'success');
            this.closeEntryModal();
            await this.loadNetWorth();
          } else {
            const err = data?.message || (data?.errors && Object.values(data.errors).flat().join(' ')) || 'Could not update entry.';
            this.showEntryFormError(err);
          }
        } catch (err) {
          this.showEntryFormError('Network error updating entry. Please try again.');
        } finally {
          this.dom.entrySubmitBtn.disabled = false;
          this.dom.entrySubmitBtn.textContent = 'Save Changes';
        }
      }
    },

    openValuationModal(entry) {
      this.clearValFormError();
      this.dom.valForm?.reset();

      this.valuationTarget = entry;
      this.dom.valEntryId.value = entry.id;
      this.dom.valTargetName.textContent = entry.name;

      const isLiab = entry.type === 'liability';
      this.dom.valTargetTypeBadge.textContent = isLiab ? 'Liability' : 'Asset';
      this.dom.valTargetTypeBadge.className = isLiab ? 'pill danger' : 'pill success';

      const lastFmt = entry.latest_value !== null
        ? (UI ? UI.formatMoney(entry.latest_value) : `₹${entry.latest_value}`)
        : 'Unvalued';
      this.dom.valTargetLastVal.textContent = lastFmt;

      this.dom.valAmount.value = entry.latest_value ? Number(entry.latest_value).toFixed(2) : '';
      const todayStr = new Date().toISOString().split('T')[0];
      this.dom.valDate.value = todayStr;
      this.dom.valDate.max = todayStr;

      this.dom.valModal.hidden = false;
      this.dom.valAmount.focus();
    },

    closeValModal() {
      if (this.dom.valModal) this.dom.valModal.hidden = true;
      this.valuationTarget = null;
      this.clearValFormError();
    },

    clearValFormError() {
      if (!this.dom.valFormError) return;
      this.dom.valFormError.textContent = '';
      this.dom.valFormError.style.display = 'none';
    },

    showValFormError(msg) {
      if (!this.dom.valFormError) return;
      this.dom.valFormError.textContent = msg;
      this.dom.valFormError.style.display = 'block';
    },

    async handleValuationFormSubmit(e) {
      e.preventDefault();
      this.clearValFormError();

      if (!this.valuationTarget) return;

      const rawVal = this.dom.valAmount.value;
      const val = parseFloat(rawVal);
      if (isNaN(val) || val < 0) {
        this.showValFormError('Please enter a valid non-negative valuation amount.');
        return;
      }

      const date = this.dom.valDate.value;
      if (!date) {
        this.showValFormError('Valuation date is required.');
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      if (date > todayStr) {
        this.showValFormError('Valuation date cannot be in the future.');
        return;
      }

      const payload = {
        value: Number(val).toFixed(2),
        valuation_date: date,
        note: this.dom.valNote.value.trim() || null
      };

      const submitBtn = document.getElementById('val-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Recording…';
      }

      try {
        const { data, status } = await API.post(`/net-worth/${this.valuationTarget.id}/valuations`, payload);
        if (status === 201 && data && data.success) {
          if (UI) UI.showToast(`Valuation recorded for "${this.valuationTarget.name}".`, 'success');
          this.closeValModal();
          await this.loadInitialData();
        } else {
          const err = data?.message || (data?.errors && Object.values(data.errors).flat().join(' ')) || 'Could not record valuation.';
          this.showValFormError(err);
        }
      } catch (err) {
        this.showValFormError('Network error recording valuation.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Record Valuation';
        }
      }
    },

    async openHistoryModal(entry) {
      this.dom.historyModalTitle.textContent = `Valuation History — ${entry.name}`;
      this.dom.historyModalSub.textContent = `${entry.category_label || entry.category} • ${entry.institution || 'Manual tracker'}`;
      this.dom.historyTableBody.innerHTML = `
        <tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--muted);">Loading history snapshots…</td></tr>
      `;
      this.dom.historyModal.hidden = false;

      try {
        const { data, status } = await API.get(`/net-worth/${entry.id}`);
        if (status === 200 && data && data.success) {
          const payload = data.data || {};
          const valuations = payload.valuations || [];

          if (!valuations.length) {
            this.dom.historyTableBody.innerHTML = `
              <tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--muted);">No valuation snapshots recorded yet.</td></tr>
            `;
            return;
          }

          const rowsHtml = valuations.map(val => {
            const dateStr = UI ? UI.formatDate(val.valuation_date) : val.valuation_date;
            const amtFmt = UI ? UI.formatMoney(val.value) : `₹${val.value}`;
            const noteStr = val.note ? this.escapeHtml(val.note) : '<span style="color: var(--muted);">—</span>';
            return `
              <tr>
                <td><strong>${dateStr}</strong></td>
                <td class="num" style="font-weight: 600;">${amtFmt}</td>
                <td>${noteStr}</td>
              </tr>
            `;
          }).join('');

          this.dom.historyTableBody.innerHTML = rowsHtml;
        } else {
          this.dom.historyTableBody.innerHTML = `
            <tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--danger);">Failed to load valuation snapshots.</td></tr>
          `;
        }
      } catch (e) {
        this.dom.historyTableBody.innerHTML = `
          <tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--danger);">Network error loading history.</td></tr>
        `;
      }
    },

    closeHistoryModal() {
      if (this.dom.historyModal) this.dom.historyModal.hidden = true;
    },

    handleTableAction(e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const entryId = parseInt(btn.dataset.id, 10);
      const entry = this.entries.find(x => x.id === entryId);
      if (!entry) return;

      if (action === 'record-valuation') {
        this.openValuationModal(entry);
      } else if (action === 'history') {
        this.openHistoryModal(entry);
      } else if (action === 'edit') {
        this.openEntryModal(entry);
      } else if (action === 'archive') {
        this.archiveEntry(entry);
      } else if (action === 'restore') {
        this.restoreEntry(entry);
      }
    },

    async archiveEntry(entry) {
      const confirmed = window.confirm(
        `Archive "${entry.name}"?\n\n` +
        `This entry will be excluded from your current net worth totals and historical trend, but its valuation history will remain preserved. You can restore it at any time.`
      );
      if (!confirmed) return;

      try {
        const { data, status } = await API.post(`/net-worth/${entry.id}/archive`);
        if (status === 200 && data?.success) {
          if (UI) UI.showToast(`"${entry.name}" archived.`, 'success');
          await this.loadInitialData();
        } else {
          const msg = data?.message || 'Could not archive entry.';
          if (UI) UI.showToast(msg, 'error');
        }
      } catch (e) {
        if (UI) UI.showToast('Network error archiving entry.', 'error');
      }
    },

    async restoreEntry(entry) {
      try {
        const { data, status } = await API.post(`/net-worth/${entry.id}/restore`);
        if (status === 200 && data?.success) {
          if (UI) UI.showToast(`"${entry.name}" restored to active net worth records.`, 'success');
          await this.loadInitialData();
        } else {
          const msg = data?.message || 'Could not restore entry.';
          if (UI) UI.showToast(msg, 'error');
        }
      } catch (e) {
        if (UI) UI.showToast('Network error restoring entry.', 'error');
      }
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  // Export globally for testability and lifecycle initialization
  window.SpendSenseNetWorth = NetWorth;

  document.addEventListener('DOMContentLoaded', () => {
    NetWorth.init();
  });
})();

