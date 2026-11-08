/**
 * SpendSense — Spending Trends Standalone Module
 * Provides daily, weekly, and monthly spending trajectories, rolling averages,
 * period-over-period comparisons, anomaly detection, and category shifts.
 */
'use strict';

(function () {
  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const SpendingTrends = {
    granularity: 'day',
    preset: '90d',
    fromDate: null,
    toDate: null,
    trendsData: null,

    init() {
      this.bindElements();
      this.bindEvents();
      this.applyPreset('90d');
      this.loadTrends();
    },

    bindElements() {
      this.dom = {
        stateContainer: document.getElementById('trends-state-container'),
        contentWrap: document.getElementById('trends-content-wrap'),

        // Filters
        filterForm: document.getElementById('trends-filter-form'),
        granularitySelect: document.getElementById('trends-granularity'),
        presetSelect: document.getElementById('trends-preset'),
        customFromField: document.getElementById('trends-custom-from-field'),
        customToField: document.getElementById('trends-custom-to-field'),
        fromDateInput: document.getElementById('trends-from-date'),
        toDateInput: document.getElementById('trends-to-date'),
        refreshBtn: document.getElementById('refresh-trends-btn'),

        // Summary cards
        statExpenses: document.getElementById('stat-expenses-amount'),
        statPeriodLabel: document.getElementById('stat-period-label'),
        statComparisonChange: document.getElementById('stat-comparison-change'),
        statComparisonSub: document.getElementById('stat-comparison-sub'),
        statAverageExpense: document.getElementById('stat-average-expense'),
        statBucketCount: document.getElementById('stat-bucket-count'),
        statAnomalyCount: document.getElementById('stat-anomaly-count'),

        // Chart
        chartSub: document.getElementById('trends-chart-sub'),
        chartContainer: document.getElementById('trends-chart-container'),

        // Categories
        categoryBody: document.getElementById('trends-category-body'),

        // Anomalies & Largest
        anomalyBadge: document.getElementById('trends-anomaly-badge'),
        anomaliesBody: document.getElementById('trends-anomalies-body'),
        largestBody: document.getElementById('trends-largest-body')
      };
    },

    bindEvents() {
      this.dom.presetSelect?.addEventListener('change', () => {
        const val = this.dom.presetSelect.value;
        this.preset = val;
        if (val === 'custom') {
          this.dom.customFromField.style.display = 'block';
          this.dom.customToField.style.display = 'block';
        } else {
          this.dom.customFromField.style.display = 'none';
          this.dom.customToField.style.display = 'none';
          this.applyPreset(val);
        }
      });

      this.dom.granularitySelect?.addEventListener('change', () => {
        this.granularity = this.dom.granularitySelect.value;
        // Daily is capped at 120 days by backend validation
        if (this.granularity === 'day' && this.preset === 'custom') {
          this.validateDateRange();
        }
      });

      this.dom.filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.granularity = this.dom.granularitySelect ? this.dom.granularitySelect.value : 'day';
        if (this.preset === 'custom') {
          this.fromDate = this.dom.fromDateInput.value;
          this.toDate = this.dom.toDateInput.value;
          if (!this.validateDateRange()) return;
        }
        this.loadTrends();
      });

      this.dom.refreshBtn?.addEventListener('click', () => {
        this.loadTrends();
      });

      // Synchronize visualization dynamically with theme changes
      window.addEventListener('spendsense:theme-change', () => {
        if (this.trendsData) {
          this.renderChart();
          this.renderCategories();
          this.renderAnomalies();
          this.renderTopExpenses();
        }
      });
    },

    applyPreset(preset) {
      const today = new Date();
      const formatYMD = (d) => d.toISOString().split('T')[0];

      this.toDate = formatYMD(today);

      if (preset === '30d') {
        const past = new Date();
        past.setDate(past.getDate() - 29);
        this.fromDate = formatYMD(past);
      } else if (preset === '90d') {
        const past = new Date();
        past.setDate(past.getDate() - 89);
        this.fromDate = formatYMD(past);
      } else if (preset === '120d') {
        const past = new Date();
        past.setDate(past.getDate() - 119);
        this.fromDate = formatYMD(past);
      }

      if (this.dom.fromDateInput) this.dom.fromDateInput.value = this.fromDate;
      if (this.dom.toDateInput) this.dom.toDateInput.value = this.toDate;
    },

    validateDateRange() {
      if (!this.fromDate || !this.toDate) {
        if (UI) UI.showToast('Please select both start and end dates.', 'error');
        return false;
      }
      const d1 = new Date(this.fromDate);
      const d2 = new Date(this.toDate);
      if (d1 > d2) {
        if (UI) UI.showToast('Start date must be before or equal to end date.', 'error');
        return false;
      }
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
      if (this.granularity === 'day' && diffDays > 120) {
        if (UI) UI.showToast('Daily trends cover at most 120 days at a time.', 'error');
        return false;
      }
      if (diffDays > 730) {
        if (UI) UI.showToast('Trend range covers at most two years at a time.', 'error');
        return false;
      }
      return true;
    },

    async loadTrends() {
      if (UI) UI.renderState(this.dom.stateContainer, 'loading', { message: 'Analyzing spending trends…' });
      this.dom.contentWrap.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (this.fromDate) params.append('from', this.fromDate);
        if (this.toDate) params.append('to', this.toDate);
        if (this.granularity) params.append('granularity', this.granularity);

        const { data, status } = await API.get(`/analytics/spending-trends?${params.toString()}`);

        if (status === 200 && data && data.success) {
          this.trendsData = data.data || {};
          const hasData = this.trendsData.summary?.has_data;

          if (!hasData) {
            this.dom.contentWrap.style.display = 'none';
            if (UI) {
              UI.renderState(this.dom.stateContainer, 'empty', {
                message: 'No expenses or income recorded in the selected period. Adjust your date filters or add new transactions to see spending trends.'
              });
            }
            return;
          }

          this.dom.stateContainer.replaceChildren();
          this.dom.contentWrap.style.display = 'block';

          this.renderSummary();
          this.renderChart();
          this.renderCategories();
          this.renderAnomalies();
          this.renderLargest();
        } else {
          const msg = data?.message || 'Could not load spending trends.';
          if (UI) {
            UI.renderState(this.dom.stateContainer, 'error', {
              message: msg,
              retry: () => this.loadTrends()
            });
          }
        }
      } catch (err) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'error', {
            message: 'Network error loading spending trends. Please try again.',
            retry: () => this.loadTrends()
          });
        }
      }
    },

    renderSummary() {
      const d = this.trendsData;
      const s = d.summary || {};
      const comp = d.comparison?.expenses || {};

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      if (this.dom.statExpenses) this.dom.statExpenses.textContent = formatVal(s.expenses_amount);

      const fromFmt = d.from && UI ? UI.formatDate(d.from) : (d.from || '');
      const toFmt = d.to && UI ? UI.formatDate(d.to) : (d.to || '');
      if (this.dom.statPeriodLabel) this.dom.statPeriodLabel.textContent = `${fromFmt} – ${toFmt}`;

      if (this.dom.statComparisonChange) {
        if (comp.change_percent !== null && comp.change_percent !== undefined) {
          const sign = comp.change_percent > 0 ? '+' : '';
          this.dom.statComparisonChange.textContent = `${sign}${comp.change_percent}%`;
          this.dom.statComparisonChange.style.color = comp.change_percent > 0 ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)';
        } else {
          this.dom.statComparisonChange.textContent = '—';
          this.dom.statComparisonChange.style.color = 'var(--ink)';
        }
      }

      if (this.dom.statComparisonSub) {
        const deltaFmt = comp.change_amount ? formatVal(Math.abs(parseFloat(comp.change_amount))) : '₹0.00';
        const direction = parseFloat(comp.change_amount || '0') >= 0 ? 'more' : 'less';
        this.dom.statComparisonSub.textContent = `${deltaFmt} ${direction} vs prior period`;
      }

      if (this.dom.statAverageExpense) this.dom.statAverageExpense.textContent = formatVal(s.average_expense_per_bucket);
      if (this.dom.statBucketCount) {
        const gName = d.granularity === 'day' ? 'days' : (d.granularity === 'week' ? 'weeks' : 'months');
        this.dom.statBucketCount.textContent = `${s.bucket_count || 0} ${gName}`;
      }

      if (this.dom.statAnomalyCount) this.dom.statAnomalyCount.textContent = s.anomaly_count ?? 0;
    },

    renderChart() {
      const buckets = this.trendsData.buckets || [];
      if (!buckets.length) return;

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const maxExpense = Math.max(
        ...buckets.map(b => Math.max(parseFloat(b.expenses_amount || 0), parseFloat(b.rolling_average_expense || 0)))
      ) || 100;

      const barsHtml = buckets.map(b => {
        const exp = parseFloat(b.expenses_amount || 0);
        const roll = parseFloat(b.rolling_average_expense || 0);

        const expHeight = Math.max(2, Math.round((exp / maxExpense) * 160));
        const rollHeight = Math.max(2, Math.round((roll / maxExpense) * 160));

        let label = b.key;
        if (this.trendsData.granularity === 'day' && b.key.length >= 10) {
          label = b.key.slice(5); // MM-DD
        }

        return `
          <div style="flex: 1 1 0; min-width: 28px; max-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative;" title="Bucket: ${b.start} to ${b.end}&#10;Expenses: ${formatVal(b.expenses_amount)}&#10;Rolling Avg: ${formatVal(b.rolling_average_expense)}">
            <div style="height: 180px; width: 100%; display: flex; align-items: flex-end; justify-content: center; position: relative; border-bottom: 2px solid var(--border);">
              <!-- Rolling Average Indicator Line Marker -->
              <div style="position: absolute; bottom: ${rollHeight}px; left: 0; right: 0; height: 3px; background: var(--warning, #f59e0b); border-radius: 2px; z-index: 2;" title="Rolling Avg: ${formatVal(b.rolling_average_expense)}"></div>
              <!-- Expense Bar -->
              <div style="width: 14px; height: ${expHeight}px; background: var(--accent); border-radius: 3px 3px 0 0; z-index: 1;" title="Expense: ${formatVal(b.expenses_amount)}"></div>
            </div>
            <div style="font-size: 0.68rem; color: var(--muted); margin-top: 6px; white-space: nowrap; text-align: center; overflow: hidden; text-overflow: ellipsis; max-width: 48px;">
              ${label}
            </div>
          </div>
        `;
      }).join('');

      const summaryRows = buckets.map(b => `
        <tr>
          <td>${b.key}</td>
          <td>${formatVal(b.expenses_amount)}</td>
          <td>${formatVal(b.rolling_average_expense)}</td>
        </tr>
      `).join('');

      this.dom.chartContainer.innerHTML = `
        <div style="display: flex; gap: 4px; justify-content: space-between; align-items: flex-end; padding: 20px 8px 8px; min-width: max-content; width: 100%;">
          ${barsHtml}
        </div>
        <table class="sr-only" aria-label="Spending trajectory by interval">
          <caption>Spending Trajectory Data Summary</caption>
          <thead>
            <tr><th scope="col">Interval</th><th scope="col">Expenses</th><th scope="col">Rolling Average</th></tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
      `;

      if (this.dom.chartSub) {
        this.dom.chartSub.textContent = `${this.trendsData.granularity.toUpperCase()} view • ${buckets.length} intervals • Rolling average baseline`;
      }
    },

    renderCategories() {
      const categories = this.trendsData.categories || [];
      if (!this.dom.categoryBody) return;

      if (!categories.length) {
        this.dom.categoryBody.innerHTML = `
          <tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--muted);">No category expenditures recorded in this period.</td></tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = categories.map(cat => {
        const nameEsc = this.escapeHtml(cat.category_name);
        const currFmt = formatVal(cat.amount);
        const priorFmt = formatVal(cat.previous_amount);

        let changeBadge = '<span style="color: var(--muted);">—</span>';
        if (cat.change_percent !== null && cat.change_percent !== undefined) {
          const isUp = cat.change_percent > 0;
          const sign = isUp ? '+' : '';
          const pillClass = isUp ? 'danger' : 'success';
          changeBadge = `<span class="pill ${pillClass}" style="font-size: 0.72rem;">${sign}${cat.change_percent}%</span>`;
        }

        const share = cat.share_percent ? `${cat.share_percent}%` : '0%';

        return `
          <tr>
            <td><strong>${nameEsc}</strong></td>
            <td class="num col-tight" style="font-weight: 600;">${currFmt}</td>
            <td class="num col-tight" style="color: var(--muted);">${priorFmt}</td>
            <td class="num col-tight">${changeBadge}</td>
            <td class="num col-tight" style="font-weight: 500;">${share}</td>
            <td class="col-tight text-center">${cat.transaction_count}</td>
          </tr>
        `;
      }).join('');

      this.dom.categoryBody.innerHTML = rowsHtml;
    },

    renderAnomalies() {
      const anomalies = this.trendsData.anomalies || [];
      if (this.dom.anomalyBadge) {
        this.dom.anomalyBadge.textContent = `${anomalies.length} flagged`;
      }

      if (!this.dom.anomaliesBody) return;

      if (!anomalies.length) {
        this.dom.anomaliesBody.innerHTML = `
          <tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--muted);">No transactions exceeded the review threshold in this period.</td></tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = anomalies.map(row => {
        const dateStr = UI ? UI.formatDate(row.expense_date) : row.expense_date;
        const descEsc = this.escapeHtml(row.description || 'Expense');
        const catEsc = this.escapeHtml(row.category_name || 'Uncategorized');
        const amtFmt = formatVal(row.amount);

        return `
          <tr>
            <td>
              <div style="font-weight: 600;">${descEsc}</div>
              <div style="font-size: 0.75rem; color: var(--muted);">${dateStr}</div>
            </td>
            <td class="col-tight"><span class="pill neutral" style="font-size: 0.72rem;">${catEsc}</span></td>
            <td class="num col-tight" style="font-weight: 700; color: var(--danger, #dc2626);">${amtFmt}</td>
          </tr>
        `;
      }).join('');

      this.dom.anomaliesBody.innerHTML = rowsHtml;
    },

    renderLargest() {
      const largest = this.trendsData.largest_expenses || [];
      if (!this.dom.largestBody) return;

      if (!largest.length) {
        this.dom.largestBody.innerHTML = `
          <tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--muted);">No transactions recorded in this period.</td></tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = largest.map(row => {
        const dateStr = UI ? UI.formatDate(row.expense_date) : row.expense_date;
        const descEsc = this.escapeHtml(row.description || 'Expense');
        const catEsc = this.escapeHtml(row.category_name || 'Uncategorized');
        const amtFmt = formatVal(row.amount);

        return `
          <tr>
            <td>
              <div style="font-weight: 600;">${descEsc}</div>
              <div style="font-size: 0.75rem; color: var(--muted);">${dateStr}</div>
            </td>
            <td class="col-tight"><span class="pill neutral" style="font-size: 0.72rem;">${catEsc}</span></td>
            <td class="num col-tight" style="font-weight: 700;">${amtFmt}</td>
          </tr>
        `;
      }).join('');

      this.dom.largestBody.innerHTML = rowsHtml;
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

  window.SpendSenseSpendingTrends = SpendingTrends;

  document.addEventListener('DOMContentLoaded', () => {
    SpendingTrends.init();
  });
})();
