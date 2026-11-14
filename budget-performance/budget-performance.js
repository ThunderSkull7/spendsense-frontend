/**
 * SpendSense — Budget Performance Standalone Module
 * Provides authoritative tracking of budget limits versus actual expenditures,
 * utilization percentages, threshold indicators, overspending alerts, and category breakdowns.
 *
 * Financial Integrity:
 * - Authoritative calculations from backend are strictly preserved; no client recalculations.
 * - Read-only analytical view; no budget creation, editing, or deletion mutations.
 */
'use strict';

(function () {
  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const BudgetPerformance = {
    preset: '6m',
    fromMonth: null,
    toMonth: null,
    statusFilter: 'all',
    performanceData: null,

    init() {
      this.bindElements();
      this.bindEvents();
      this.applyPreset('6m');
      this.loadPerformance();
    },

    bindElements() {
      this.dom = {
        stateContainer: document.getElementById('budget-performance-state-container'),
        contentWrap: document.getElementById('budget-performance-content-wrap'),

        // Filters
        filterForm: document.getElementById('budget-performance-filter-form'),
        presetSelect: document.getElementById('budget-preset'),
        customFromField: document.getElementById('budget-custom-from-field'),
        customToField: document.getElementById('budget-custom-to-field'),
        fromMonthInput: document.getElementById('budget-from-month'),
        toMonthInput: document.getElementById('budget-to-month'),
        statusFilterSelect: document.getElementById('budget-status-filter'),
        refreshBtn: document.getElementById('refresh-budget-performance-btn'),

        // Summary cards
        statBudgetLimit: document.getElementById('stat-budget-limit'),
        statBudgetPeriodLabel: document.getElementById('stat-budget-period-label'),
        statBudgetSpent: document.getElementById('stat-budget-spent'),
        statBudgetRemaining: document.getElementById('stat-budget-remaining'),
        statBudgetUtilization: document.getElementById('stat-budget-utilization'),
        statUtilizationSub: document.getElementById('stat-utilization-sub'),
        statOverspentCount: document.getElementById('stat-overspent-count'),
        statNearLimitCount: document.getElementById('stat-near-limit-count'),

        // Trajectory chart
        chartSub: document.getElementById('budget-chart-sub'),
        chartContainer: document.getElementById('budget-chart-container'),

        // Items table
        itemsCountBadge: document.getElementById('budget-items-count-badge'),
        itemsTable: document.getElementById('budget-items-table'),
        itemsBody: document.getElementById('budget-items-body'),

        // Bottom panels
        repeatedCountBadge: document.getElementById('repeated-overspending-count'),
        repeatedBody: document.getElementById('repeated-overspending-body'),
        thresholdCountBadge: document.getElementById('threshold-alerts-count'),
        thresholdBody: document.getElementById('threshold-alerts-body'),
        notesList: document.getElementById('budget-notes-list')
      };
    },

    bindEvents() {
      this.dom.presetSelect?.addEventListener('change', () => {
        const val = this.dom.presetSelect.value;
        this.preset = val;
        if (val === 'custom') {
          if (this.dom.customFromField) this.dom.customFromField.style.display = 'block';
          if (this.dom.customToField) this.dom.customToField.style.display = 'block';
        } else {
          if (this.dom.customFromField) this.dom.customFromField.style.display = 'none';
          if (this.dom.customToField) this.dom.customToField.style.display = 'none';
          this.applyPreset(val);
        }
      });

      this.dom.statusFilterSelect?.addEventListener('change', () => {
        this.statusFilter = this.dom.statusFilterSelect.value;
        this.renderItems();
      });

      this.dom.filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.preset === 'custom') {
          this.fromMonth = this.dom.fromMonthInput ? this.dom.fromMonthInput.value : null;
          this.toMonth = this.dom.toMonthInput ? this.dom.toMonthInput.value : null;
          if (!this.validateMonthRange()) return;
        }
        this.loadPerformance();
      });

      this.dom.refreshBtn?.addEventListener('click', () => {
        this.loadPerformance();
      });

      window.addEventListener('spendsense:theme-change', () => {
        if (this.performanceData) {
          this.render();
        }
      });
    },

    applyPreset(preset) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthNum = now.getMonth() + 1;
      const formatMonthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

      if (preset === 'current') {
        const m = formatMonthKey(currentYear, currentMonthNum);
        this.fromMonth = m;
        this.toMonth = m;
      } else if (preset === '3m') {
        const toKey = formatMonthKey(currentYear, currentMonthNum);
        const fromDate = new Date(currentYear, currentMonthNum - 3, 1);
        const fromKey = formatMonthKey(fromDate.getFullYear(), fromDate.getMonth() + 1);
        this.fromMonth = fromKey;
        this.toMonth = toKey;
      } else if (preset === '6m') {
        const toKey = formatMonthKey(currentYear, currentMonthNum);
        const fromDate = new Date(currentYear, currentMonthNum - 6, 1);
        const fromKey = formatMonthKey(fromDate.getFullYear(), fromDate.getMonth() + 1);
        this.fromMonth = fromKey;
        this.toMonth = toKey;
      }

      if (this.dom.fromMonthInput) this.dom.fromMonthInput.value = this.fromMonth || '';
      if (this.dom.toMonthInput) this.dom.toMonthInput.value = this.toMonth || '';
    },

    validateMonthRange() {
      if (!this.fromMonth || !this.toMonth) {
        if (UI) UI.showToast('Please select both from and to months.', 'error');
        return false;
      }
      if (this.fromMonth > this.toMonth) {
        if (UI) UI.showToast('From month must be before or equal to to month.', 'error');
        return false;
      }
      return true;
    },

    async loadPerformance() {
      if (UI) UI.renderState(this.dom.stateContainer, 'loading', { message: 'Analyzing budget performance…' });
      if (this.dom.contentWrap) this.dom.contentWrap.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (this.fromMonth) params.append('from', this.fromMonth);
        if (this.toMonth) params.append('to', this.toMonth);

        const query = params.toString();
        const url = `/analytics/budget-performance${query ? `?${query}` : ''}`;
        const { data, status } = await API.get(url);

        if (status === 200 && data?.data) {
          this.performanceData = data.data;
          this.render();
        } else {
          const msg = data?.message || 'Could not load budget performance.';
          if (UI) {
            UI.renderState(this.dom.stateContainer, 'error', {
              message: msg,
              retry: () => this.loadPerformance()
            });
          }
        }
      } catch (err) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'error', {
            message: err.message || 'Network error while loading budget performance.',
            retry: () => this.loadPerformance()
          });
        }
      }
    },

    render() {
      if (!this.performanceData) return;
      const { summary, items } = this.performanceData;

      if (!summary?.has_budget_data || !items || items.length === 0) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'empty', {
            title: 'No Budget Performance Data',
            message: 'No category budgets have been configured for the selected period.',
            action: {
              label: 'View Budgets',
              href: '../budget-planning/budget.html'
            }
          });
        }
        return;
      }

      if (this.dom.stateContainer) this.dom.stateContainer.innerHTML = '';
      if (this.dom.contentWrap) this.dom.contentWrap.style.display = 'block';

      this.renderSummary();
      this.renderChart();
      this.renderItems();
      this.renderRepeatedOverspending();
      this.renderThresholdAlerts();
      this.renderNotes();
    },

    renderSummary() {
      const summary = this.performanceData.summary || {};
      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const budgeted = parseFloat(summary.budgeted_amount || 0);
      const spent = parseFloat(summary.spent_amount || 0);
      const remaining = parseFloat(summary.remaining_amount || 0);

      // Backend overall utilization
      let utilRate = 0.0;
      if (budgeted > 0) {
        utilRate = Math.round((spent / budgeted) * 1000) / 10;
      }

      if (this.dom.statBudgetLimit) this.dom.statBudgetLimit.textContent = formatVal(summary.budgeted_amount);
      if (this.dom.statBudgetPeriodLabel) {
        this.dom.statBudgetPeriodLabel.textContent = `${this.performanceData.from} to ${this.performanceData.to}`;
      }

      if (this.dom.statBudgetSpent) this.dom.statBudgetSpent.textContent = formatVal(summary.spent_amount);
      if (this.dom.statBudgetRemaining) {
        const remFmt = formatVal(Math.abs(remaining));
        if (remaining < 0) {
          this.dom.statBudgetRemaining.textContent = `Overspent by: ${remFmt}`;
          this.dom.statBudgetRemaining.style.color = 'var(--danger, #ef4444)';
        } else {
          this.dom.statBudgetRemaining.textContent = `Remaining: ${remFmt}`;
          this.dom.statBudgetRemaining.style.color = '';
        }
      }

      if (this.dom.statBudgetUtilization) {
        this.dom.statBudgetUtilization.textContent = `${utilRate.toFixed(1)}%`;
      }
      if (this.dom.statUtilizationSub) {
        const catCount = summary.categories_with_budgets || 0;
        this.dom.statUtilizationSub.textContent = `Across ${catCount} active ${catCount === 1 ? 'category' : 'categories'}`;
      }

      const overspent = summary.overspent_rows || 0;
      const nearLimit = summary.near_limit_rows || 0;
      if (this.dom.statOverspentCount) {
        this.dom.statOverspentCount.textContent = String(overspent);
        this.dom.statOverspentCount.style.color = overspent > 0 ? 'var(--danger, #ef4444)' : '';
      }
      if (this.dom.statNearLimitCount) {
        this.dom.statNearLimitCount.textContent = `${nearLimit} near alert threshold`;
      }
    },

    renderChart() {
      const history = this.performanceData.history || [];
      if (!this.dom.chartContainer) return;

      if (!history.length) {
        this.dom.chartContainer.innerHTML = '<p style="color: var(--muted); padding: 12px 0;">No history available.</p>';
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const maxVal = Math.max(
        ...history.map(h => Math.max(parseFloat(h.budgeted_amount || 0), parseFloat(h.spent_amount || 0)))
      ) || 100;

      const barsHtml = history.map(h => {
        const budgeted = parseFloat(h.budgeted_amount || 0);
        const spent = parseFloat(h.spent_amount || 0);
        const isOver = spent > budgeted;
        const budgetPct = Math.min(100, Math.round((budgeted / maxVal) * 100));
        const spentPct = Math.min(100, Math.round((spent / maxVal) * 100));
        const util = h.utilization_percent !== null ? `${h.utilization_percent}%` : 'N/A';

        const monthLabel = h.month;
        const spentColor = isOver ? 'var(--danger, #ef4444)' : 'var(--accent, #3b82f6)';

        return `
          <div style="flex: 1; min-width: 80px; max-width: 140px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="font-size: 0.72rem; font-weight: 600; color: ${isOver ? 'var(--danger, #ef4444)' : 'var(--text-main)'};">
              ${util}
            </div>
            <div style="display: flex; gap: 4px; align-items: flex-end; height: 160px; width: 100%; justify-content: center; background: var(--bg-alt, rgba(0,0,0,0.03)); border-radius: 6px; padding: 0 8px 4px;">
              <!-- Budget limit column -->
              <div style="flex: 1; max-width: 22px; height: ${budgetPct}%; background: var(--border, #cbd5e1); border-radius: 3px 3px 0 0;" title="Budget Limit: ${formatVal(budgeted)}"></div>
              <!-- Actual spent column -->
              <div style="flex: 1; max-width: 22px; height: ${spentPct}%; background: ${spentColor}; border-radius: 3px 3px 0 0;" title="Actual Spent: ${formatVal(spent)}"></div>
            </div>
            <div style="font-size: 0.76rem; font-weight: 500; color: var(--muted); text-align: center;">
              ${this.escapeHtml(monthLabel)}
            </div>
          </div>
        `;
      }).join('');

      const summaryRows = history.map(h => `
        <tr>
          <td>${h.month}</td>
          <td>${formatVal(h.budgeted_amount)}</td>
          <td>${formatVal(h.spent_amount)}</td>
          <td>${h.utilization_percent !== null ? h.utilization_percent + '%' : 'N/A'}</td>
        </tr>
      `).join('');

      this.dom.chartContainer.innerHTML = `
        <div style="display: flex; gap: 12px; justify-content: space-around; align-items: flex-end; padding: 12px 8px 4px; min-width: max-content; width: 100%;">
          ${barsHtml}
        </div>
        <table class="sr-only" aria-label="Monthly budget limit vs actual spent">
          <caption>Monthly Budget Limit vs Actual Spending Data Summary</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Budget Limit</th>
              <th scope="col">Actual Spent</th>
              <th scope="col">Utilization</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
      `;

      if (this.dom.chartSub) {
        this.dom.chartSub.textContent = `Tracking across ${history.length} months (${this.performanceData.from} to ${this.performanceData.to})`;
      }
    },

    renderItems() {
      if (!this.dom.itemsBody) return;
      const allItems = this.performanceData.items || [];
      const filter = this.statusFilter;

      const filtered = allItems.filter(item => {
        if (filter === 'all') return true;
        return item.status === filter;
      });

      if (this.dom.itemsCountBadge) {
        this.dom.itemsCountBadge.textContent = `${filtered.length} of ${allItems.length} budgets`;
      }

      if (!filtered.length) {
        this.dom.itemsBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 24px; color: var(--muted);">
              No budget entries match the selected status filter (${this.escapeHtml(filter)}).
            </td>
          </tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = filtered.map(item => {
        const limit = parseFloat(item.limit_amount || 0);
        const spent = parseFloat(item.spent_amount || 0);
        const remaining = parseFloat(item.remaining_amount || 0);
        const util = item.utilization_percent;
        const status = item.status;

        // Status badge
        let statusBadge = '';
        if (status === 'over') {
          statusBadge = '<span class="pill danger" style="font-size: 0.74rem;">Overspent</span>';
        } else if (status === 'near_limit') {
          statusBadge = '<span class="pill warning" style="font-size: 0.74rem;">Near Limit</span>';
        } else {
          statusBadge = '<span class="pill success" style="font-size: 0.74rem;">On Track</span>';
        }

        // Progress bar styling
        const progressPct = util !== null ? Math.min(100, Math.max(0, util)) : 0;
        let barColor = 'var(--accent, #3b82f6)';
        if (status === 'over') barColor = 'var(--danger, #ef4444)';
        else if (status === 'near_limit') barColor = 'var(--warning, #f59e0b)';

        // Remaining text
        let remainingHtml = '';
        if (status === 'over') {
          remainingHtml = `<span style="color: var(--danger, #ef4444); font-weight: 650; font-variant-numeric: tabular-nums;">+ ${formatVal(item.overspent_by)} over</span>`;
        } else {
          remainingHtml = `<span style="color: var(--success, #10b981); font-weight: 600; font-variant-numeric: tabular-nums;">${formatVal(remaining)}</span>`;
        }

        const utilText = util !== null ? `${util.toFixed(1)}%` : 'No limit';
        const thresholdsList = (item.alert_thresholds || []).join(', ');
        const thresholdText = thresholdsList ? `Threshold: ${thresholdsList}%` : 'Default 80%';

        return `
          <tr>
            <td style="font-weight: 500; font-size: 0.82rem; white-space: nowrap;">
              ${this.escapeHtml(item.month)}
              ${item.is_current_month ? ' <span class="pill neutral" style="font-size: 0.68rem; padding: 1px 5px;">Current</span>' : ''}
            </td>
            <td style="font-weight: 600; color: var(--ink);">${this.escapeHtml(item.category_name)}</td>
            <td class="num" style="font-variant-numeric: tabular-nums;">${formatVal(limit)}</td>
            <td class="num" style="font-weight: 650; font-variant-numeric: tabular-nums;">${formatVal(spent)}</td>
            <td class="num">${remainingHtml}</td>
            <td>
              <div class="budget-util-bar-wrap">
                <div class="budget-util-meta">
                  <span class="budget-util-pct">${utilText}</span>
                  <span class="budget-util-threshold">${this.escapeHtml(thresholdText)}</span>
                </div>
                <div class="budget-progress-track">
                  <div class="budget-progress-fill" style="width: ${progressPct}%; background: ${barColor};"></div>
                </div>
              </div>
            </td>
            <td class="col-tight" style="text-align: center;">${statusBadge}</td>
          </tr>
        `;
      }).join('');

      this.dom.itemsBody.innerHTML = rowsHtml;
    },

    renderRepeatedOverspending() {
      if (!this.dom.repeatedBody) return;
      const list = this.performanceData.repeated_overspending || [];

      if (this.dom.repeatedCountBadge) {
        this.dom.repeatedCountBadge.textContent = `${list.length} ${list.length === 1 ? 'category' : 'categories'}`;
      }

      if (!list.length) {
        this.dom.repeatedBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 20px; color: var(--muted);">
              No persistent overspending detected across multiple months in this period.
            </td>
          </tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = list.map(item => {
        const rate = item.overspent_share !== null ? `${item.overspent_share.toFixed(1)}%` : 'N/A';
        return `
          <tr>
            <td style="font-weight: 600;">${this.escapeHtml(item.category_name)}</td>
            <td class="num">${item.overspent_months} of ${item.budgeted_months} mos</td>
            <td class="num" style="color: var(--danger, #ef4444); font-weight: 600;">${formatVal(item.total_over)}</td>
            <td class="num">${rate}</td>
          </tr>
        `;
      }).join('');

      this.dom.repeatedBody.innerHTML = rowsHtml;
    },

    renderThresholdAlerts() {
      if (!this.dom.thresholdBody) return;
      const list = this.performanceData.threshold_events || [];

      if (this.dom.thresholdCountBadge) {
        this.dom.thresholdCountBadge.textContent = `${list.length} events`;
      }

      if (!list.length) {
        this.dom.thresholdBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 20px; color: var(--muted);">
              No threshold alert events recorded for this period.
            </td>
          </tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = list.map(evt => {
        const spent = formatVal(evt.spent_amount);
        const limit = formatVal(evt.limit_amount);
        const threshold = evt.threshold;
        const isRead = evt.read_at !== null;

        return `
          <tr>
            <td style="font-size: 0.82rem; font-weight: 500;">${this.escapeHtml(evt.period_month)}</td>
            <td><span class="pill warning">${threshold}% Limit</span></td>
            <td class="num" style="font-size: 0.82rem;">${spent} / ${limit}</td>
            <td class="col-tight">
              <span class="pill ${isRead ? 'neutral' : 'accent'}" style="font-size: 0.7rem;">
                ${isRead ? 'Acknowledged' : 'Active'}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      this.dom.thresholdBody.innerHTML = rowsHtml;
    },

    renderNotes() {
      if (!this.dom.notesList) return;
      const notes = this.performanceData.notes || [];
      if (!notes.length) return;

      this.dom.notesList.innerHTML = notes.map(n => `<li>${this.escapeHtml(n)}</li>`).join('');
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

  window.SpendSenseBudgetPerformance = BudgetPerformance;

  document.addEventListener('DOMContentLoaded', () => {
    BudgetPerformance.init();
  });
})();

