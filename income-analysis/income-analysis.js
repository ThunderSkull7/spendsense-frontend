/**
 * SpendSense — Income Analysis Standalone Module
 * Provides income trends, source comparison, payment frequency breakdown,
 * income variability, and separate scheduled expectation benchmarks.
 * Financial Integrity: Actual received income is strictly separated from expected income.
 */
'use strict';

(function () {
  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const IncomeAnalysis = {
    preset: '6m',
    fromMonth: null,
    toMonth: null,
    analysisData: null,

    init() {
      this.bindElements();
      this.bindEvents();
      this.applyPreset('6m');
      this.loadAnalysis();
    },

    bindElements() {
      this.dom = {
        stateContainer: document.getElementById('income-state-container'),
        contentWrap: document.getElementById('income-content-wrap'),

        // Filters
        filterForm: document.getElementById('income-filter-form'),
        presetSelect: document.getElementById('income-preset'),
        customFromField: document.getElementById('income-custom-from-field'),
        customToField: document.getElementById('income-custom-to-field'),
        fromMonthInput: document.getElementById('income-from-month'),
        toMonthInput: document.getElementById('income-to-month'),
        refreshBtn: document.getElementById('refresh-income-btn'),

        // Summary cards
        statActualIncome: document.getElementById('stat-actual-income'),
        statPeriodLabel: document.getElementById('stat-income-period-label'),
        statIncomeChange: document.getElementById('stat-income-change'),
        statIncomeChangeSub: document.getElementById('stat-income-change-sub'),
        statAverageMonthly: document.getElementById('stat-average-monthly'),
        statActiveMonthsCount: document.getElementById('stat-active-months-count'),
        statVariabilityAmount: document.getElementById('stat-variability-amount'),
        statVariabilitySub: document.getElementById('stat-variability-sub'),

        // Chart
        chartSub: document.getElementById('income-chart-sub'),
        chartContainer: document.getElementById('income-chart-container'),

        // Sources & Frequencies
        sourceCountBadge: document.getElementById('income-source-count-badge'),
        sourcesBody: document.getElementById('income-sources-body'),
        frequencyBody: document.getElementById('income-frequency-body')
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

      this.dom.filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (this.preset === 'custom') {
          this.fromMonth = this.dom.fromMonthInput.value;
          this.toMonth = this.dom.toMonthInput.value;
          if (!this.validateMonthRange()) return;
        }
        this.loadAnalysis();
      });

      this.dom.refreshBtn?.addEventListener('click', () => {
        this.loadAnalysis();
      });

      window.addEventListener('spendsense:theme-change', () => {
        if (this.analysisData) {
          this.renderSummary();
          this.renderMonthlyChart();
          this.renderSources();
          this.renderFrequencies();
        }
      });
    },

    applyPreset(preset) {
      const today = new Date();
      const formatYM = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      };

      this.toMonth = formatYM(today);

      if (preset === '6m') {
        const past = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        this.fromMonth = formatYM(past);
      } else if (preset === '12m') {
        const past = new Date(today.getFullYear(), today.getMonth() - 11, 1);
        this.fromMonth = formatYM(past);
      }

      if (this.dom.fromMonthInput) this.dom.fromMonthInput.value = this.fromMonth;
      if (this.dom.toMonthInput) this.dom.toMonthInput.value = this.toMonth;
    },

    validateMonthRange() {
      if (!this.fromMonth || !this.toMonth) {
        if (UI) UI.showToast('Please select both start and end months.', 'error');
        return false;
      }
      if (this.fromMonth > this.toMonth) {
        if (UI) UI.showToast('Start month must be on or before end month.', 'error');
        return false;
      }
      return true;
    },

    async loadAnalysis() {
      if (UI) UI.renderState(this.dom.stateContainer, 'loading', { message: 'Analyzing income records…' });
      this.dom.contentWrap.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (this.fromMonth) params.append('from', this.fromMonth);
        if (this.toMonth) params.append('to', this.toMonth);

        const { data, status } = await API.get(`/analytics/income-analysis?${params.toString()}`);

        if (status === 200 && data && data.success) {
          this.analysisData = data.data || {};
          const hasData = this.analysisData.summary?.has_income_data;

          if (!hasData) {
            this.dom.contentWrap.style.display = 'none';
            if (UI) {
              UI.renderState(this.dom.stateContainer, 'empty', {
                message: 'No income transactions recorded in the selected period. Add your income transactions to view sources, frequencies, and trend analysis.'
              });
            }
            return;
          }

          this.dom.stateContainer.replaceChildren();
          this.dom.contentWrap.style.display = 'block';

          this.renderSummary();
          this.renderMonthlyChart();
          this.renderSources();
          this.renderFrequencies();
        } else {
          const msg = data?.message || 'Could not load income analysis.';
          if (UI) {
            UI.renderState(this.dom.stateContainer, 'error', {
              message: msg,
              retry: () => this.loadAnalysis()
            });
          }
        }
      } catch (err) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'error', {
            message: 'Network error loading income analysis. Please try again.',
            retry: () => this.loadAnalysis()
          });
        }
      }
    },

    renderSummary() {
      const d = this.analysisData;
      const s = d.summary || {};

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      if (this.dom.statActualIncome) this.dom.statActualIncome.textContent = formatVal(s.actual_income_amount);
      if (this.dom.statPeriodLabel) this.dom.statPeriodLabel.textContent = `${d.from || ''} to ${d.to || ''} (${s.month_count || 0} months)`;

      if (this.dom.statIncomeChange) {
        if (s.change_percent !== null && s.change_percent !== undefined) {
          const sign = s.change_percent > 0 ? '+' : '';
          this.dom.statIncomeChange.textContent = `${sign}${s.change_percent}%`;
          this.dom.statIncomeChange.style.color = s.change_percent >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)';
        } else {
          this.dom.statIncomeChange.textContent = '—';
          this.dom.statIncomeChange.style.color = 'var(--ink)';
        }
      }

      if (this.dom.statIncomeChangeSub) {
        const deltaFmt = s.change_amount ? formatVal(Math.abs(parseFloat(s.change_amount))) : '₹0.00';
        const direction = parseFloat(s.change_amount || '0') >= 0 ? 'more' : 'less';
        this.dom.statIncomeChangeSub.textContent = `${deltaFmt} ${direction} vs prior period`;
      }

      if (this.dom.statAverageMonthly) this.dom.statAverageMonthly.textContent = formatVal(s.average_month_with_income);
      if (this.dom.statActiveMonthsCount) {
        this.dom.statActiveMonthsCount.textContent = `Across ${s.months_with_income || 0} active months`;
      }

      if (this.dom.statVariabilityAmount) this.dom.statVariabilityAmount.textContent = formatVal(s.variability_amount);
      if (this.dom.statVariabilitySub) {
        const pct = s.variability_percent !== null && s.variability_percent !== undefined ? `${s.variability_percent}%` : '0%';
        this.dom.statVariabilitySub.textContent = `${pct} standard deviation`;
      }
    },

    renderMonthlyChart() {
      const monthly = this.analysisData.monthly || [];
      if (!monthly.length) return;

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const maxVal = Math.max(
        ...monthly.map(m => Math.max(parseFloat(m.actual_amount || 0), parseFloat(m.scheduled_expected_amount || 0)))
      ) || 1000;

      const barsHtml = monthly.map(m => {
        const actual = parseFloat(m.actual_amount || 0);
        const expected = parseFloat(m.scheduled_expected_amount || 0);

        const actualHeight = Math.max(2, Math.round((actual / maxVal) * 150));
        const expectedHeight = Math.max(2, Math.round((expected / maxVal) * 150));

        return `
          <div style="flex: 1 1 0; min-width: 48px; max-width: 80px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;" title="Month: ${m.month}&#10;Actual Received: ${formatVal(m.actual_amount)}&#10;Scheduled Expected: ${formatVal(m.scheduled_expected_amount)}&#10;Unplanned Actual: ${formatVal(m.unplanned_actual_amount)}">
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--success, #16a34a); margin-bottom: 4px;">
              ${actual > 0 ? formatVal(m.actual_amount) : '—'}
            </div>
            <div style="height: 160px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 6px; border-bottom: 2px solid var(--border); padding-bottom: 2px;">
              <!-- Actual Received Bar -->
              <div style="width: 16px; height: ${actualHeight}px; background: var(--success, #16a34a); border-radius: 3px 3px 0 0;" title="Actual: ${formatVal(m.actual_amount)}"></div>
              <!-- Scheduled Expected Bar -->
              <div style="width: 16px; height: ${expectedHeight}px; background: transparent; border: 2px dashed var(--accent); border-bottom: none; border-radius: 3px 3px 0 0;" title="Expected: ${formatVal(m.scheduled_expected_amount)}"></div>
            </div>
            <div style="font-size: 0.72rem; color: var(--muted); margin-top: 6px; text-align: center;">
              ${m.month}
            </div>
          </div>
        `;
      }).join('');

      const summaryRows = monthly.map(m => `
        <tr>
          <td>${m.month}</td>
          <td>${formatVal(m.actual_amount)}</td>
          <td>${formatVal(m.scheduled_expected_amount)}</td>
        </tr>
      `).join('');

      this.dom.chartContainer.innerHTML = `
        <div style="display: flex; gap: 12px; justify-content: space-between; align-items: flex-end; padding: 20px 8px 8px; overflow-x: auto;">
          ${barsHtml}
        </div>
        <table class="sr-only" aria-label="Realized vs scheduled income by month">
          <caption>Realized vs Scheduled Monthly Income Data Summary</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Realized Deposits</th>
              <th scope="col">Scheduled Expected</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
      `;

      if (this.dom.chartSub) {
        this.dom.chartSub.textContent = `${monthly.length} months analyzed • Solid bar = Realized deposits • Dashed outline = Scheduled expectations`;
      }
    },

    renderSources() {
      const sources = this.analysisData.sources || [];
      if (this.dom.sourceCountBadge) {
        this.dom.sourceCountBadge.textContent = `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`;
      }

      if (!this.dom.sourcesBody) return;

      if (!sources.length) {
        this.dom.sourcesBody.innerHTML = `
          <tr><td colspan="5" class="income-empty-cell">No income sources recorded in this period.</td></tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = sources.map(src => {
        const srcName = this.escapeHtml(src.source || 'General Income');
        const actFmt = formatVal(src.actual_amount);
        const priorFmt = src.previous_amount !== null && src.previous_amount !== undefined ? formatVal(src.previous_amount) : '—';

        let changeBadge = '<span class="income-prior-val">—</span>';
        if (src.change_percent !== null && src.change_percent !== undefined) {
          const isUp = src.change_percent >= 0;
          const sign = isUp ? '+' : '';
          const pillClass = isUp ? 'success' : 'danger';
          changeBadge = `<span class="pill ${pillClass}" style="font-size: 0.74rem;">${sign}${src.change_percent}%</span>`;
        }

        return `
          <tr>
            <td><div class="income-source-name">${srcName}</div></td>
            <td class="num col-tight income-amount-val">${actFmt}</td>
            <td class="num col-tight income-prior-val">${priorFmt}</td>
            <td class="num col-tight">${changeBadge}</td>
            <td class="col-tight text-center" style="font-variant-numeric: tabular-nums;">${src.transaction_count}</td>
          </tr>
        `;
      }).join('');

      this.dom.sourcesBody.innerHTML = rowsHtml;
    },

    renderFrequencies() {
      const frequencies = this.analysisData.frequencies || [];
      if (!this.dom.frequencyBody) return;

      if (!frequencies.length) {
        this.dom.frequencyBody.innerHTML = `
          <tr><td colspan="3" class="income-empty-cell">No income frequency data recorded.</td></tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = frequencies.map(freq => {
        const rawFreq = (freq.frequency || 'other').toLowerCase();
        const label = this.escapeHtml(rawFreq.charAt(0).toUpperCase() + rawFreq.slice(1));
        const amtFmt = formatVal(freq.amount);

        let badgeModifier = 'monthly';
        if (rawFreq.includes('one') || rawFreq.includes('single')) badgeModifier = 'one-time';
        else if (rawFreq.includes('week')) badgeModifier = 'weekly';

        return `
          <tr>
            <td>
              <span class="income-freq-badge ${badgeModifier}">${label}</span>
            </td>
            <td class="num col-tight income-amount-val">${amtFmt}</td>
            <td class="col-tight text-center" style="font-variant-numeric: tabular-nums;">${freq.transaction_count}</td>
          </tr>
        `;
      }).join('');

      this.dom.frequencyBody.innerHTML = rowsHtml;
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

  window.SpendSenseIncomeAnalysis = IncomeAnalysis;

  document.addEventListener('DOMContentLoaded', () => {
    IncomeAnalysis.init();
  });
})();

