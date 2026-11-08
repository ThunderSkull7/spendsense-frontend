/**
 * SpendSense — Cash Flow Forecast Standalone Module
 * Provides schedule-based cash flow projection from active recurring income
 * and planned bill commitments.
 *
 * Financial Integrity:
 * - Transparent separation of actual historical transactions from future estimates.
 * - Starting bank balance is unavailable and never fabricated.
 * - Projects Net Cash Flow rather than hypothetical ending balances.
 * - Strictly read-only analytical view; no mutations or ledger updates.
 */
'use strict';

(function () {
  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const CashFlowForecast = {
    horizon: 30,
    asOfDate: null,
    eventFilter: 'all',
    forecastData: null,

    init() {
      this.bindElements();
      this.bindEvents();
      this.setDefaultAsOfDate();
      this.loadForecast();
    },

    bindElements() {
      this.dom = {
        stateContainer: document.getElementById('forecast-state-container'),
        contentWrap: document.getElementById('forecast-content-wrap'),

        // Filters
        filterForm: document.getElementById('forecast-filter-form'),
        horizonSelect: document.getElementById('forecast-horizon'),
        asOfDateInput: document.getElementById('forecast-as-of-date'),
        eventFilterSelect: document.getElementById('forecast-event-filter'),
        refreshBtn: document.getElementById('refresh-forecast-btn'),

        // Banners
        integrityBanner: document.getElementById('forecast-integrity-banner'),
        overdueBanner: document.getElementById('forecast-overdue-banner'),
        overdueText: document.getElementById('forecast-overdue-text'),

        // Summary stats
        statExpectedIncome: document.getElementById('stat-expected-income'),
        statIncomeCount: document.getElementById('stat-income-count'),
        statExpectedExpenses: document.getElementById('stat-expected-expenses'),
        statExpenseCount: document.getElementById('stat-expense-count'),
        statProjectedNet: document.getElementById('stat-projected-net'),
        statNetSentiment: document.getElementById('stat-net-sentiment'),
        statHorizonDays: document.getElementById('stat-horizon-days'),
        statWindowDates: document.getElementById('stat-window-dates'),

        // Monthly grid
        monthlySub: document.getElementById('forecast-monthly-sub'),
        monthlyGrid: document.getElementById('forecast-monthly-grid'),

        // Events table
        eventsCountBadge: document.getElementById('forecast-events-count-badge'),
        eventsTable: document.getElementById('forecast-events-table'),
        eventsBody: document.getElementById('forecast-events-body'),

        // Context panels
        contextIncomeSchedules: document.getElementById('context-income-schedules'),
        contextExpenseSchedules: document.getElementById('context-expense-schedules'),
        contextSubscriptionsCost: document.getElementById('context-subscriptions-cost'),
        contextSubscriptionsCount: document.getElementById('context-subscriptions-count'),
        contextHistoricalIncome: document.getElementById('context-historical-income'),
        contextHistoricalExpenses: document.getElementById('context-historical-expenses'),
        contextHistoricalRange: document.getElementById('context-historical-range'),
        notesList: document.getElementById('forecast-notes-list')
      };
    },

    bindEvents() {
      this.dom.horizonSelect?.addEventListener('change', () => {
        this.horizon = parseInt(this.dom.horizonSelect.value, 10) || 30;
      });

      this.dom.eventFilterSelect?.addEventListener('change', () => {
        this.eventFilter = this.dom.eventFilterSelect.value;
        this.renderEvents();
      });

      this.dom.filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.horizon = parseInt(this.dom.horizonSelect ? this.dom.horizonSelect.value : 30, 10) || 30;
        this.asOfDate = this.dom.asOfDateInput ? this.dom.asOfDateInput.value : null;
        this.loadForecast();
      });

      this.dom.refreshBtn?.addEventListener('click', () => {
        this.loadForecast();
      });

      window.addEventListener('spendsense:theme-change', () => {
        if (this.forecastData) {
          this.render();
        }
      });
    },

    setDefaultAsOfDate() {
      const today = new Date().toISOString().split('T')[0];
      this.asOfDate = today;
      if (this.dom.asOfDateInput) {
        this.dom.asOfDateInput.value = today;
      }
    },

    async loadForecast() {
      if (UI) UI.renderState(this.dom.stateContainer, 'loading', { message: 'Generating cash flow forecast…' });
      if (this.dom.contentWrap) this.dom.contentWrap.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (this.horizon) params.append('horizon', String(this.horizon));
        if (this.asOfDate) params.append('as_of', this.asOfDate);

        const query = params.toString();
        const url = `/analytics/cash-flow-forecast${query ? `?${query}` : ''}`;
        const { data, status } = await API.get(url);

        if (status === 200 && data?.data) {
          this.forecastData = data.data;
          this.render();
        } else {
          const msg = data?.message || 'Could not generate cash flow forecast.';
          if (UI) {
            UI.renderState(this.dom.stateContainer, 'error', {
              message: msg,
              retry: () => this.loadForecast()
            });
          }
        }
      } catch (err) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'error', {
            message: err.message || 'Network error while generating cash flow forecast.',
            retry: () => this.loadForecast()
          });
        }
      }
    },

    render() {
      if (!this.forecastData) return;
      const { events, event_count } = this.forecastData;

      if ((!events || events.length === 0) && event_count === 0) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'empty', {
            title: 'No Planned Cash Flow Events',
            message: 'There are no active recurring income or expense occurrences scheduled within this forecast horizon.',
            action: {
              label: 'Manage Recurring Transactions',
              href: '../recurring-transactions/recurring-transactions.html'
            }
          });
        }
        return;
      }

      if (this.dom.stateContainer) this.dom.stateContainer.innerHTML = '';
      if (this.dom.contentWrap) this.dom.contentWrap.style.display = 'block';

      this.renderOverdueNotice();
      this.renderSummary();
      this.renderMonthlyProjections();
      this.renderEvents();
      this.renderScheduleContext();
      this.renderNotes();
    },

    renderOverdueNotice() {
      const overdue = this.forecastData.overdue_commitments;
      if (!this.dom.overdueBanner) return;

      if (overdue && overdue.count > 0) {
        const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;
        if (this.dom.overdueText) {
          this.dom.overdueText.textContent = `${overdue.count} overdue planned commitment(s) totaling ${formatVal(overdue.total)} dated before the forecast window.`;
        }
        this.dom.overdueBanner.style.display = 'block';
      } else {
        this.dom.overdueBanner.style.display = 'none';
      }
    },

    renderSummary() {
      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;
      const d = this.forecastData;

      const expectedIn = parseFloat(d.expected_income || 0);
      const expectedOut = parseFloat(d.expected_expenses || 0);
      const net = parseFloat(d.projected_net_cash_flow || 0);

      if (this.dom.statExpectedIncome) this.dom.statExpectedIncome.textContent = formatVal(d.expected_income);
      if (this.dom.statIncomeCount) {
        this.dom.statIncomeCount.textContent = `${d.expected_income_count || 0} planned income occurrences`;
      }

      if (this.dom.statExpectedExpenses) this.dom.statExpectedExpenses.textContent = formatVal(d.expected_expenses);
      if (this.dom.statExpenseCount) {
        this.dom.statExpenseCount.textContent = `${d.expected_expense_count || 0} planned bill occurrences`;
      }

      if (this.dom.statProjectedNet) {
        this.dom.statProjectedNet.textContent = formatVal(d.projected_net_cash_flow);
        if (net >= 0) {
          this.dom.statProjectedNet.style.color = 'var(--success, #10b981)';
        } else {
          this.dom.statProjectedNet.style.color = 'var(--danger, #ef4444)';
        }
      }

      if (this.dom.statNetSentiment) {
        if (net > 0) {
          this.dom.statNetSentiment.textContent = 'Projected net surplus';
        } else if (net < 0) {
          this.dom.statNetSentiment.textContent = 'Projected net outflow deficit';
        } else {
          this.dom.statNetSentiment.textContent = 'Even cash flow balance';
        }
      }

      if (this.dom.statHorizonDays) {
        this.dom.statHorizonDays.textContent = `${d.horizon_days} Days`;
      }
      if (this.dom.statWindowDates) {
        const w = d.window || {};
        this.dom.statWindowDates.textContent = `${w.start || ''} to ${w.end || ''}`;
      }
    },

    renderMonthlyProjections() {
      if (!this.dom.monthlyGrid) return;
      const projections = this.forecastData.monthly_projection || [];
      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      if (!projections.length) {
        this.dom.monthlyGrid.innerHTML = '<p style="color: var(--muted); grid-column: 1 / -1;">No monthly projection rows.</p>';
        return;
      }

      const cardsHtml = projections.map(row => {
        const net = parseFloat(row.projected_net_cash_flow || 0);
        const inAmt = parseFloat(row.expected_income || 0);
        const outAmt = parseFloat(row.expected_expenses || 0);
        const totalVol = inAmt + outAmt;
        const inPct = totalVol > 0 ? Math.round((inAmt / totalVol) * 100) : 50;
        const outPct = totalVol > 0 ? (100 - inPct) : 50;

        const netColor = net >= 0 ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';

        return `
          <div class="card" style="padding: 16px; background: var(--bg-alt, var(--surface)); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <strong style="font-size: 0.95rem;">${this.escapeHtml(row.label)}</strong>
              ${row.is_partial ? '<span class="pill neutral" style="font-size: 0.68rem;">Partial Month</span>' : ''}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.82rem; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted);">Expected Inflow:</span>
                <span style="font-weight: 600; color: var(--success, #10b981);">${formatVal(row.expected_income)}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted);">Expected Outflow:</span>
                <span style="font-weight: 600; color: var(--danger, #ef4444);">${formatVal(row.expected_expenses)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 6px; border-top: 1px dashed var(--border);">
                <span style="font-weight: 600;">Net Flow:</span>
                <span style="font-weight: 700; color: ${netColor};">${formatVal(row.projected_net_cash_flow)}</span>
              </div>
            </div>
            <!-- Inflow vs Outflow bar -->
            <div style="height: 6px; display: flex; border-radius: 3px; overflow: hidden; background: var(--border);">
              <div style="width: ${inPct}%; background: var(--success, #10b981);" title="Inflow: ${inPct}%"></div>
              <div style="width: ${outPct}%; background: var(--danger, #ef4444);" title="Outflow: ${outPct}%"></div>
            </div>
          </div>
        `;
      }).join('');

      const summaryRows = projections.map(row => `
        <tr>
          <td>${row.label}</td>
          <td>${formatVal(row.expected_income)}</td>
          <td>${formatVal(row.expected_expenses)}</td>
          <td>${formatVal(row.projected_net_cash_flow)}</td>
        </tr>
      `).join('');

      this.dom.monthlyGrid.innerHTML = `
        ${cardsHtml}
        <table class="sr-only" aria-label="Monthly cash flow projections">
          <caption>Monthly Cash Flow Projections Data Summary</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Expected Inflow</th>
              <th scope="col">Expected Outflow</th>
              <th scope="col">Projected Net Flow</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows}
          </tbody>
        </table>
      `;
    },

    renderEvents() {
      if (!this.dom.eventsBody) return;
      const allEvents = this.forecastData.events || [];
      const filter = this.eventFilter;

      const filtered = allEvents.filter(ev => {
        if (filter === 'all') return true;
        return ev.type === filter;
      });

      if (this.dom.eventsCountBadge) {
        this.dom.eventsCountBadge.textContent = `${filtered.length} of ${allEvents.length} events`;
      }

      if (!filtered.length) {
        this.dom.eventsBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 24px; color: var(--muted);">
              No scheduled events match the current filter (${this.escapeHtml(filter)}).
            </td>
          </tr>
        `;
        return;
      }

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;

      const rowsHtml = filtered.map(ev => {
        const isIncome = ev.type === 'income';
        const typeBadge = isIncome
          ? '<span class="pill success" style="font-size: 0.72rem;">Inflow</span>'
          : '<span class="pill danger" style="font-size: 0.72rem;">Outflow</span>';

        const categoryName = ev.category?.name || 'Recurring';
        const amountColor = isIncome ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';
        const amountPrefix = isIncome ? '+ ' : '- ';

        return `
          <tr>
            <td data-label="Date" style="white-space: nowrap; font-size: 0.82rem; font-weight: 500;">${this.escapeHtml(ev.date)}</td>
            <td data-label="Type" class="col-tight">${typeBadge}</td>
            <td data-label="Commitment" style="font-weight: 600;">${this.escapeHtml(ev.name)}</td>
            <td data-label="Category"><span class="pill neutral" style="font-size: 0.72rem;">${this.escapeHtml(categoryName)}</span></td>
            <td data-label="Expected" class="num" style="font-weight: 700; color: ${amountColor};">${amountPrefix}${formatVal(ev.amount)}</td>
            <td data-label="Certainty" class="col-tight">
              <span class="pill neutral" style="font-size: 0.7rem; text-transform: capitalize;">
                ${this.escapeHtml(ev.certainty || 'expected')}
              </span>
            </td>
          </tr>
        `;
      }).join('');

      this.dom.eventsBody.innerHTML = rowsHtml;
    },

    renderScheduleContext() {
      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${v}`;
      const d = this.forecastData;

      // Schedule context
      const sc = d.schedule_context || {};
      const incActive = sc.recurring_income?.active ?? 0;
      const expActive = sc.recurring_expense?.active ?? 0;

      if (this.dom.contextIncomeSchedules) {
        this.dom.contextIncomeSchedules.textContent = `${incActive} active`;
      }
      if (this.dom.contextExpenseSchedules) {
        this.dom.contextExpenseSchedules.textContent = `${expActive} active`;
      }

      // Subscriptions
      const sub = d.subscriptions || {};
      if (this.dom.contextSubscriptionsCost) {
        this.dom.contextSubscriptionsCost.textContent = `${formatVal(sub.estimated_monthly_cost || 0)} /mo`;
      }
      if (this.dom.contextSubscriptionsCount) {
        this.dom.contextSubscriptionsCount.textContent = `${sub.active_count || 0} active subscriptions`;
      }

      // Historical actuals
      const hist = d.historical_actuals || {};
      if (this.dom.contextHistoricalIncome) {
        this.dom.contextHistoricalIncome.textContent = formatVal(hist.average_monthly_income || 0);
      }
      if (this.dom.contextHistoricalExpenses) {
        this.dom.contextHistoricalExpenses.textContent = formatVal(hist.average_monthly_expenses || 0);
      }
      if (this.dom.contextHistoricalRange) {
        this.dom.contextHistoricalRange.textContent = `Completed window: ${hist.from || ''} to ${hist.to || ''} (${hist.months || 3} months)`;
      }
    },

    renderNotes() {
      if (!this.dom.notesList) return;
      const notes = this.forecastData.notes || [];
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

  window.SpendSenseCashFlowForecast = CashFlowForecast;

  document.addEventListener('DOMContentLoaded', () => {
    CashFlowForecast.init();
  });
})();

