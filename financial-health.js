/**
 * SpendSense — Financial Health Component (HEALTH-01)
 * Computes evidence-based financial health indicators, actionable observations,
 * and transparent formula breakdowns using validated application metrics.
 */
(function (window, document) {
  'use strict';

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '₹0.00';
    var num = parseFloat(amount);
    if (isNaN(num)) return '₹' + amount;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function unwrap(res) {
    if (!res) return null;
    var body = res.data !== undefined ? res.data : res;
    if (body && typeof body === 'object' && body.data !== undefined) return body.data;
    return body;
  }

  function SpendSenseFinancialHealth() {
    this.api = window.api || (typeof window.SpendSenseAPI === 'function' ? new window.SpendSenseAPI() : window.SpendSenseAPI) || null;
    this.data = null;
    this.currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  SpendSenseFinancialHealth.prototype.init = function () {
    var self = this;
    this.bindEvents();

    // Sync with existing period controls if present
    var monthSelect = document.querySelector('[data-period-month]');
    var yearSelect = document.querySelector('[data-period-year]');
    if (monthSelect && yearSelect) {
      var m = String(monthSelect.value).padStart(2, '0');
      var y = yearSelect.value;
      this.currentMonth = y + '-' + m;
    }

    this.loadHealth();
  };

  SpendSenseFinancialHealth.prototype.loadHealth = async function (monthKey) {
    var self = this;
    if (monthKey) this.currentMonth = monthKey;

    var container = document.getElementById('financial-health-container');
    if (!container) return;

    container.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Evaluating financial health indicators…</p></div>';

    try {
      if (!this.api && window.SpendSenseAPI) {
        this.api = window.SpendSenseAPI;
      }
      var res = await this.api.get('/analytics/financial-health?month=' + encodeURIComponent(this.currentMonth));
      var payload = unwrap(res);

      if (payload) {
        self.data = payload;
        self.render();
      } else {
        container.innerHTML = '<div class="notice error">No health data returned.</div>';
      }
    } catch (err) {
      container.innerHTML = '<div class="notice error">Failed to load financial health indicators. Please try again.</div>';
    }
  };

  SpendSenseFinancialHealth.prototype.render = function () {
    var container = document.getElementById('financial-health-container');
    if (!container || !this.data) return;

    var ind = this.data.indicators || {};
    var period = this.data.period || {};
    var observations = this.data.observations || [];
    var defs = this.data.definitions || {};

    // 1. Net Cash Flow
    var ncf = ind.net_cash_flow || {};
    var ncfTone = ncf.status === 'positive' ? 'pos' : (ncf.status === 'negative' ? 'neg' : '');
    var ncfBadge = ncf.status === 'positive' ? '<span class="badge badge-success">Surplus</span>' : (ncf.status === 'negative' ? '<span class="badge badge-danger">Deficit</span>' : '<span class="badge badge-teal">Balanced</span>');

    // 2. Savings Rate
    var sr = ind.savings_rate || {};
    var srVal = sr.label || 'Not available';
    var srTone = sr.status === 'positive' ? 'pos' : (sr.status === 'negative' ? 'neg' : '');

    // 3. Budget Utilization
    var bu = ind.budget_utilization || {};
    var buVal = bu.utilization_percent !== null && bu.utilization_percent !== undefined ? bu.utilization_percent + '%' : 'No budgets set';
    var buBadge = bu.status === 'exceeded' ? '<span class="badge badge-danger">Exceeded</span>' : (bu.status === 'warning' ? '<span class="badge badge-amber">Near limit</span>' : (bu.status === 'on_track' ? '<span class="badge badge-teal">On track</span>' : ''));

    // 4. Spending Change
    var sc = ind.spending_change || {};
    var scVal = sc.label || 'No prior data';
    var scTone = sc.direction === 'higher' ? 'neg' : (sc.direction === 'lower' ? 'pos' : '');

    // 5. Commitments
    var rc = ind.recurring_commitments || {};
    var rcVal = rc.monthly_cost ? formatCurrency(rc.monthly_cost) + '/mo' : '₹0.00';
    var rcRatio = rc.ratio_to_income_percent !== null && rc.ratio_to_income_percent !== undefined ? rc.ratio_to_income_percent + '% of income' : 'Income not recorded';

    // 6. Goals Progress
    var gp = ind.goals_progress || {};
    var gpVal = gp.overall_progress_percent !== null && gp.overall_progress_percent !== undefined ? gp.overall_progress_percent + '% overall' : (gp.active_goals_count > 0 ? '0% saved' : 'No active goals');

    var html = '<div class="health-dashboard-wrap">' +
      '<div class="card-head" style="margin-bottom: 20px;">' +
        '<div>' +
          '<h2 class="card-title">Financial Health Dashboard</h2>' +
          '<p class="card-sub">Evidence-based indicators evaluated for <strong>' + escapeHtml(period.label || this.currentMonth) + '</strong></p>' +
        '</div>' +
        '<div style="font-size: 0.85rem; color: var(--muted);">' +
          '<span>Period: ' + escapeHtml(period.from || '') + ' to ' + escapeHtml(period.to || '') + '</span>' +
        '</div>' +
      '</div>' +

      '<!-- 6 Indicator Cards Grid -->' +
      '<div class="grid grid-3" style="gap: 16px; margin-bottom: 24px;">' +
        // Card 1: Net Cash Flow
        '<article class="card stat-card">' +
          '<div class="stat-top">' +
            '<span class="stat-label">Net cash flow</span>' +
            ncfBadge +
          '</div>' +
          '<div class="stat-value ' + ncfTone + '">' + formatCurrency(ncf.net) + '</div>' +
          '<div class="stat-foot">' + formatCurrency(ncf.income) + ' income — ' + formatCurrency(ncf.expenses) + ' spend</div>' +
        '</article>' +

        // Card 2: Savings Rate
        '<article class="card stat-card">' +
          '<div class="stat-top">' +
            '<span class="stat-label">Savings rate</span>' +
            '<span class="stat-icon tone-teal"><svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>' +
          '</div>' +
          '<div class="stat-value ' + srTone + '">' + escapeHtml(srVal) + '</div>' +
          '<div class="stat-foot">Cash flow as % of recorded income</div>' +
        '</article>' +

        // Card 3: Budget Utilization
        '<article class="card stat-card">' +
          '<div class="stat-top">' +
            '<span class="stat-label">Budget utilization</span>' +
            buBadge +
          '</div>' +
          '<div class="stat-value">' + escapeHtml(buVal) + '</div>' +
          '<div class="stat-foot">' + formatCurrency(bu.total_spent) + ' spent of ' + formatCurrency(bu.total_limit) + ' budgeted</div>' +
        '</article>' +

        // Card 4: Spending Change
        '<article class="card stat-card">' +
          '<div class="stat-top">' +
            '<span class="stat-label">Spending change</span>' +
            '<span class="stat-icon tone-amber"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></span>' +
          '</div>' +
          '<div class="stat-value ' + scTone + '">' + escapeHtml(scVal) + '</div>' +
          '<div class="stat-foot">Compared to previous month (' + formatCurrency(sc.prior_spend) + ')</div>' +
        '</article>' +

        // Card 5: Recurring Commitments
        '<article class="card stat-card">' +
          '<div class="stat-top">' +
            '<span class="stat-label">Recurring commitments</span>' +
            '<span class="stat-icon tone-blue"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></span>' +
          '</div>' +
          '<div class="stat-value">' + escapeHtml(rcVal) + '</div>' +
          '<div class="stat-foot">' + escapeHtml(rcRatio) + ' (' + (rc.active_schedules_count ?? 0) + ' bills)</div>' +
        '</article>' +

        // Card 6: Goals Progress
        '<article class="card stat-card">' +
          '<div class="stat-top">' +
            '<span class="stat-label">Financial goals</span>' +
            '<span class="stat-icon tone-teal"><svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></span>' +
          '</div>' +
          '<div class="stat-value">' + escapeHtml(gpVal) + '</div>' +
          '<div class="stat-foot">' + formatCurrency(gp.total_saved) + ' saved of ' + formatCurrency(gp.total_target) + ' target</div>' +
        '</article>' +
      '</div>';

    // 2. Observations & Actionable Recommendations
    html += '<section class="card" style="margin-bottom: 24px;">' +
      '<div class="card-head">' +
        '<div>' +
          '<h3 class="card-title">Observations &amp; Recommendations</h3>' +
          '<p class="card-sub">Actionable insights directly linked to your financial activity</p>' +
        '</div>' +
      '</div>' +
      '<div class="card-body">';

    if (observations.length === 0) {
      html += '<p class="text-muted" style="padding: 12px 0;">All monitored indicators are within healthy parameters for this month.</p>';
    } else {
      html += '<div style="display: flex; flex-direction: column; gap: 12px;">';
      observations.forEach(function (obs) {
        var borderLeftColor = obs.type === 'danger' ? 'var(--danger, #ef4444)' : (obs.type === 'warning' ? 'var(--warn, #f59e0b)' : 'var(--teal)');
        var badgeTone = obs.type === 'danger' ? 'badge-danger' : (obs.type === 'warning' ? 'badge-amber' : 'badge-teal');

        html += '<div style="border-left: 4px solid ' + borderLeftColor + '; background: var(--surface-2, #f9fafb); border-radius: 4px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
          '<div>' +
            '<div style="font-weight: 600; color: var(--ink); margin-bottom: 2px;">' + escapeHtml(obs.title) + '</div>' +
            '<div style="font-size: 0.88rem; color: var(--muted);">' + escapeHtml(obs.description) + '</div>' +
          '</div>' +
          (obs.link ? '<div><a href="' + escapeHtml(obs.link) + '" class="btn secondary sm">' + escapeHtml(obs.link_text || 'View details') + ' →</a></div>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div></section>';

    // 3. Indicator Definitions & Mathematical Guardrails
    html += '<section class="card">' +
      '<div class="card-head">' +
        '<div>' +
          '<h3 class="card-title">Transparent Formula Definitions</h3>' +
          '<p class="card-sub">Every indicator is derived from validated user records without hidden or arbitrary credit scoring.</p>' +
        '</div>' +
      '</div>' +
      '<div class="card-body" style="font-size: 0.88rem; color: var(--muted); display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">' +
        '<div><strong>Net Cash Flow:</strong> ' + escapeHtml(defs.net_cash_flow || 'Income minus expenses.') + '</div>' +
        '<div><strong>Savings Rate:</strong> ' + escapeHtml(defs.savings_rate || 'Net cash flow / income. Division-by-zero protected.') + '</div>' +
        '<div><strong>Budget Utilization:</strong> ' + escapeHtml(defs.budget_utilization || 'Spending in budgeted categories / budget limits.') + '</div>' +
        '<div><strong>Spending Change:</strong> ' + escapeHtml(defs.spending_change || 'Percent difference vs previous month expenses.') + '</div>' +
        '<div><strong>Recurring Commitments:</strong> ' + escapeHtml(defs.recurring_commitments || 'Normalized recurring bills / income.') + '</div>' +
        '<div><strong>Goals Progress:</strong> ' + escapeHtml(defs.goals_progress || 'Active savings / active goal targets.') + '</div>' +
      '</div>' +
    '</section>' +
    '</div>';

    container.innerHTML = html;
  };

  SpendSenseFinancialHealth.prototype.bindEvents = function () {
    var self = this;

    // Listen to custom period change events
    window.addEventListener('analytics-period-change', function (e) {
      if (e.detail && e.detail.month && e.detail.year) {
        var m = String(e.detail.month).padStart(2, '0');
        self.loadHealth(e.detail.year + '-' + m);
      }
    });

    var monthSelect = document.querySelector('[data-period-month]');
    var yearSelect = document.querySelector('[data-period-year]');

    var onPeriodChange = function () {
      if (monthSelect && yearSelect) {
        var m = String(monthSelect.value).padStart(2, '0');
        var y = yearSelect.value;
        self.loadHealth(y + '-' + m);
      }
    };

    if (monthSelect) monthSelect.addEventListener('change', onPeriodChange);
    if (yearSelect) yearSelect.addEventListener('change', onPeriodChange);

    // Theme synchronization
    window.addEventListener('spendsense:theme-change', function () {
      if (self.data) {
        self.render();
      }
    });
  };

  if (typeof window !== 'undefined') {
    window.SpendSenseFinancialHealth = SpendSenseFinancialHealth;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SpendSenseFinancialHealth: SpendSenseFinancialHealth,
      formatCurrency: formatCurrency
    };
  }
})(typeof window !== 'undefined' ? window : global, typeof document !== 'undefined' ? document : {});
