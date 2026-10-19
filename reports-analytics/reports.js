// Reports & analytics — real API data with Chart.js when available,
// CSS chart fallbacks otherwise.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);

  const monthLabels = document.querySelectorAll('[data-month-label]');
  const refreshBtn = document.querySelector('[data-reports-refresh]');

  const spendingState = document.querySelector('[data-spending-state]');
  const spendingChartBox = document.querySelector('[data-spending-chart]');
  const spendingLegend = document.querySelector('[data-spending-legend]');
  const cashflowState = document.querySelector('[data-cashflow-state]');
  const cashflowChartBox = document.querySelector('[data-cashflow-chart]');
  const alertsEl = document.querySelector('[data-alerts]');
  const budgetStatusEl = document.querySelector('[data-budget-status]');
  const summarySection = document.querySelector('.report-summary');
  const summaryEls = {
    income: document.querySelector('[data-report-summary="income"]'),
    expenses: document.querySelector('[data-report-summary="expenses"]'),
    net: document.querySelector('[data-report-summary="net"]'),
    topCategory: document.querySelector('[data-report-summary="top-category"]'),
  };
  const summaryFootEls = {
    income: document.querySelector('[data-report-foot="income"]'),
    expenses: document.querySelector('[data-report-foot="expenses"]'),
    net: document.querySelector('[data-report-foot="net"]'),
    topCategory: document.querySelector('[data-report-foot="top-category"]'),
  };
  const spendingTotalEl = document.querySelector('[data-spending-total]');
  const spendingSummaryEl = document.querySelector('[data-spending-summary]');
  const cashflowSummaryEl = document.querySelector('[data-cashflow-summary]');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let spendingChartInstance = null;
  let cashflowChartInstance = null;
  let lastSpending = null; // cached payloads so theme changes can re-render
  let lastCashflow = null;

  const setSummaryValue = (key, value, { tone = '', foot } = {}) => {
    const valueEl = summaryEls[key];
    if (!valueEl) return;
    valueEl.textContent = value;
    valueEl.classList.toggle('pos', tone === 'pos');
    valueEl.classList.toggle('neg', tone === 'neg');
    const footEl = summaryFootEls[key];
    if (footEl && typeof foot === 'string') footEl.textContent = foot;
  };

  // Build the at-a-glance row from the two analytics payloads that have
  // already been fetched. Every value comes from the API; "—" is used when a
  // payload is unavailable rather than inventing a number.
  const renderSummary = () => {
    const cashflow = lastCashflow && lastCashflow.status === 200 && lastCashflow.data && lastCashflow.data.data
      ? lastCashflow.data.data
      : null;
    const current = cashflow ? cashflow.current_month || {} : null;
    if (current) {
      const net = typeof current.net === 'number'
        ? current.net
        : (current.income || 0) - (current.expenses || 0);
      setSummaryValue('income', money(current.income || 0), { foot: 'Income this month' });
      setSummaryValue('expenses', money(current.expenses || 0), { foot: 'Expenses this month' });
      setSummaryValue('net', (net > 0 ? '+' : '') + money(net), {
        tone: net < 0 ? 'neg' : 'pos',
        foot: 'Income minus expenses',
      });
    } else {
      setSummaryValue('income', '—', { foot: 'Unavailable' });
      setSummaryValue('expenses', '—', { foot: 'Unavailable' });
      setSummaryValue('net', '—', { tone: '', foot: 'Income minus expenses' });
    }

    const spending = lastSpending && lastSpending.status === 200 && lastSpending.data && lastSpending.data.data
      ? lastSpending.data.data
      : null;
    const items = spending ? (spending.breakdown || []).slice().sort((a, b) => b.total_spent - a.total_spent) : [];
    const total = items.reduce((sum, item) => sum + (item.total_spent || 0), 0);
    if (items.length) {
      const top = items[0];
      const share = total > 0 ? Math.round((top.total_spent / total) * 100) : 0;
      setSummaryValue('topCategory', top.category_name, {
        foot: `${money(top.total_spent)} · ${share}% of spending`,
      });
    } else {
      setSummaryValue('topCategory', '—', { foot: spending ? 'No spending recorded yet' : 'Unavailable' });
    }
  };

  const css = getComputedStyle(document.documentElement);
  const cssVar = (name, fallback) => (css.getPropertyValue(name) || fallback).trim() || fallback;

  const settings = window.SpendSenseSettings;
  const CHART_FALLBACKS = [
    '#059669', '#2563EB', '#D97706', '#7C3AED', '#DC2626',
    '#0891B2', '#DB2777', '#92400E', '#64748B', '#1E293B',
  ];
  // Categorical colours come from the --chart-N CSS tokens (light/dark aware).
  const chartColors = () =>
    settings && typeof settings.chartColors === 'function'
      ? settings.chartColors()
      : CHART_FALLBACKS.map((fallback, index) => cssVar(`--chart-${index + 1}`, fallback));

  // Stable per-category colour key + assignment (shared with the dashboard, so
  // a category keeps the same colour across pages and refreshes).
  const toneKey = (item) =>
    item && item.category_id != null
      ? `cat:${item.category_id}`
      : `name:${String((item && item.category_name) || '').toLowerCase()}`;
  const colorMapFor = (items) => {
    const tones =
      settings && typeof settings.categoryTones === 'function'
        ? settings.categoryTones(items.map(toneKey))
        : new Map();
    const colors = chartColors();
    return (item) => colors[(tones.get(toneKey(item)) || 0) % colors.length];
  };

  const monthName = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const shortMonthLabel = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short' });

  let monthResolved = false;

  const setMonthLabels = (month, year) => {
    if (!month || !year) return;
    monthResolved = true;
    monthLabels.forEach((el) => {
      el.textContent = monthName(month, year);
    });
  };

  const showChartState = (stateEl, chartBox, type, options) => {
    if (chartBox) chartBox.hidden = true;
    if (stateEl) {
      stateEl.hidden = false;
      UI.renderState(stateEl, type, options);
    }
  };

  const showChart = (stateEl, chartBox) => {
    if (stateEl) stateEl.hidden = true;
    if (chartBox) chartBox.hidden = false;
  };

  // ---------- CSS bar fallback (also used for the spending legend) ----------
  const buildBars = (items, colorFor) => {
    const max = items[0].total_spent || 1;
    const total = items.reduce((sum, item) => sum + item.total_spent, 0) || 1;
    const list = document.createElement('div');
    list.className = 'bar-list';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const meta = document.createElement('div');
      meta.className = 'bar-meta';
      const label = document.createElement('span');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = colorFor(item);
      label.append(dot, document.createTextNode(' ' + item.category_name));
      const value = document.createElement('strong');
      value.textContent = `${money(item.total_spent)} · ${Math.round((item.total_spent / total) * 100)}%`;
      meta.append(label, value);

      const track = document.createElement('div');
      track.className = 'progress';
      const fill = document.createElement('span');
      fill.style.background = colorFor(item);
      fill.style.width = Math.max(4, Math.round((item.total_spent / max) * 100)) + '%';
      track.appendChild(fill);

      row.append(meta, track);
      list.appendChild(row);
    });
    return list;
  };

  // ---------- Spending by category ----------
  const renderSpending = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      lastSpending = null;
      showChartState(spendingState, spendingChartBox, 'error', {
        message: 'Could not load spending data.',
        retry: loadAll,
      });
      return;
    }
    const payload = result.data.data;
    lastSpending = result;
    setMonthLabels(payload.month, payload.year);

    const items = (payload.breakdown || []).slice().sort((a, b) => b.total_spent - a.total_spent);
    if (!items.length) {
      showChartState(spendingState, spendingChartBox, 'empty', {
        message: 'No expenses recorded this month yet.',
        action: { href: '../expense-management/add-expense.html', label: 'Add an expense' },
      });
      return;
    }

    showChart(spendingState, spendingChartBox);
    const totalSpent = items.reduce((sum, item) => sum + (item.total_spent || 0), 0);
    if (spendingTotalEl) spendingTotalEl.textContent = money(totalSpent);
    if (spendingSummaryEl) {
      const details = items
        .map((item) => {
          const share = totalSpent > 0 ? Math.round((item.total_spent / totalSpent) * 100) : 0;
          return `${item.category_name}: ${money(item.total_spent)}, ${share} percent`;
        })
        .join('; ');
      spendingSummaryEl.textContent = `Spending by category${payload.month && payload.year ? ` for ${monthName(payload.month, payload.year)}` : ''}. Total ${money(totalSpent)}. ${details}.`;
    }

    // One stable colour per category, reused by the chart and the legend.
    const colorFor = colorMapFor(items);

    if (spendingLegend) {
      spendingLegend.replaceChildren();
      items.forEach((item) => {
        const entry = document.createElement('span');
        entry.className = 'legend-item';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = colorFor(item);
        entry.append(dot, document.createTextNode(`${item.category_name} · ${money(item.total_spent)}`));
        spendingLegend.appendChild(entry);
      });
    }

    const canvas = document.querySelector('#spendingChart');
    if (window.Chart && canvas) {
      if (spendingChartInstance) spendingChartInstance.destroy();
      const surface = cssVar('--surface', '#ffffff');
      spendingChartInstance = new window.Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: items.map((item) => item.category_name),
          datasets: [
            {
              data: items.map((item) => item.total_spent),
              backgroundColor: items.map((item) => colorFor(item)),
              borderColor: surface,
              borderWidth: 2,
              hoverBorderColor: surface,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion ? false : undefined,
          cutout: '62%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ` ${ctx.label}: ${money(ctx.parsed)}` },
            },
          },
        },
      });
    } else {
      // CSS fallback: render into the chart box (the canvas is replaced).
      const box = spendingChartBox ? spendingChartBox.querySelector('.chart-box') : null;
      if (box) box.replaceChildren(buildBars(items, colorFor));
    }
  };

  // ---------- Income vs expenses ----------
  const buildColumns = (previous, current, max) => {
    const chart = document.createElement('div');
    chart.className = 'columns-chart';
    [
      [previous, 'Last month'],
      [current, 'This month'],
    ].forEach(([month, label]) => {
      const col = document.createElement('div');
      col.className = 'col';

      const track = document.createElement('div');
      track.className = 'col-track';
      const incomeBar = document.createElement('div');
      incomeBar.className = 'col-bar';
      incomeBar.style.height = Math.max(2, Math.round(((month.income || 0) / max) * 100)) + '%';
      incomeBar.title = `Income ${money(month.income || 0)}`;
      const expenseBar = document.createElement('div');
      expenseBar.className = 'col-bar alt';
      expenseBar.style.height = Math.max(2, Math.round(((month.expenses || 0) / max) * 100)) + '%';
      expenseBar.title = `Expenses ${money(month.expenses || 0)}`;
      track.append(incomeBar, expenseBar);

      const value = document.createElement('div');
      value.className = 'col-value';
      value.textContent = money(month.net || 0);

      const labelEl = document.createElement('div');
      labelEl.className = 'col-label';
      labelEl.textContent = label;

      col.append(track, value, labelEl);
      chart.appendChild(col);
    });
    return chart;
  };

  const renderCashflow = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      lastCashflow = null;
      showChartState(cashflowState, cashflowChartBox, 'error', {
        message: 'Could not load cash flow data.',
        retry: loadAll,
      });
      return;
    }
    const payload = result.data.data;
    lastCashflow = result;
    const current = payload.current_month || {};
    const previous = payload.previous_month || {};
    showChart(cashflowState, cashflowChartBox);
    if (cashflowSummaryEl) {
      const currentLabel = current.month && current.year ? monthName(current.month, current.year) : 'This month';
      const previousLabel = previous.month && previous.year ? monthName(previous.month, previous.year) : 'Last month';
      cashflowSummaryEl.textContent =
        `Income versus expenses. ${previousLabel}: income ${money(previous.income || 0)}, expenses ${money(previous.expenses || 0)}. ` +
        `${currentLabel}: income ${money(current.income || 0)}, expenses ${money(current.expenses || 0)}.`;
    }

    const hasCashflow = ['income', 'expenses'].some(
      (key) => (current[key] || 0) > 0 || (previous[key] || 0) > 0
    );
    if (!hasCashflow) {
      showChartState(cashflowState, cashflowChartBox, 'empty', {
        message: 'No income or expenses recorded for this month or last month.',
        action: { href: '../expense-management/add-expense.html', label: 'Add an expense' },
      });
      return;
    }

    const canvas = document.querySelector('#cashflowChart');
    if (window.Chart && canvas) {
      if (cashflowChartInstance) cashflowChartInstance.destroy();
      const incomeColor = cssVar('--chart-income', '#059669');
      const expenseColor = cssVar('--chart-expense', '#6366F1');
      const tickColor = cssVar('--muted', '#6D786F');
      const gridColor = cssVar('--border', '#E3E9E1');
      cashflowChartInstance = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: [shortMonthLabel(previous.month, previous.year), shortMonthLabel(current.month, current.year)],
          datasets: [
            {
              label: 'Income',
              data: [previous.income || 0, current.income || 0],
              backgroundColor: incomeColor,
              borderRadius: 8,
              maxBarThickness: 46,
            },
            {
              label: 'Expenses',
              data: [previous.expenses || 0, current.expenses || 0],
              backgroundColor: expenseColor,
              borderRadius: 8,
              maxBarThickness: 46,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: prefersReducedMotion ? false : undefined,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: tickColor, callback: (value) => money(value) },
              grid: { color: gridColor },
            },
            x: { grid: { display: false }, ticks: { color: tickColor } },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}` },
            },
          },
        },
      });
    } else {
      // CSS fallback: render into the chart box (the canvas is replaced).
      const box = cashflowChartBox ? cashflowChartBox.querySelector('.chart-box') : null;
      if (box) {
        const max = Math.max(current.income || 0, current.expenses || 0, previous.income || 0, previous.expenses || 0, 1);
        box.replaceChildren(buildColumns(previous, current, max));
      }
    }
  };

  // ---------- Budget alerts ----------
  const renderAlerts = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(alertsEl, 'error', { message: 'Could not load budget alerts.', retry: loadAll });
      return;
    }
    const alerts = result.data.data.alerts || [];
    if (!alerts.length) {
      UI.renderState(alertsEl, 'empty', {
        message: 'No alerts this month — all budgets are on track.',
        action: { href: '../budget-planning/budget.html', label: 'Review budgets' },
      });
      return;
    }

    const list = document.createElement('div');
    list.className = 'notif-list';
    alerts.forEach((alert) => {
      const item = document.createElement('div');
      item.className = 'notif-item';

      const ico = document.createElement('span');
      ico.className = 'n-ico';
      ico.innerHTML =
        alert.alert_type === 'overspent'
          ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';

      const body = document.createElement('div');
      body.className = 'n-body';
      const title = document.createElement('div');
      title.className = 'n-title';
      const pill = document.createElement('span');
      pill.className = 'pill ' + (alert.alert_type === 'overspent' ? 'danger' : 'amber');
      pill.textContent = alert.alert_type === 'overspent' ? 'Over limit' : 'Near limit';
      title.append(document.createTextNode(alert.category_name + ' '), pill);

      const text = document.createElement('div');
      text.className = 'n-text';
      text.textContent = `${alert.message} · ${money(alert.spent_amount)} of ${money(alert.limit_amount)}`;

      body.append(title, text);
      item.append(ico, body);
      list.appendChild(item);
    });

    alertsEl.replaceChildren(list);
  };

  // ---------- Budget progress ----------
  const renderBudgetStatus = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(budgetStatusEl, 'error', { message: 'Could not load budget progress.', retry: loadAll });
      return;
    }
    const budgets = result.data.data.budgets || [];
    if (!budgets.length) {
      UI.renderState(budgetStatusEl, 'empty', {
        message: 'No budgets set for this month yet.',
        action: { href: '../budget-planning/budget.html', label: 'Set a budget' },
      });
      return;
    }

    const list = document.createElement('div');
    list.className = 'budget-list';
    budgets.forEach((budget) => {
      const percentage = Math.min(100, Math.max(0, budget.percentage_used || 0));
      const item = document.createElement('div');
      item.className = 'budget-item';

      const meta = document.createElement('div');
      meta.className = 'b-meta';
      const left = document.createElement('span');
      left.append(document.createTextNode(budget.category_name + ' '));
      const pill = document.createElement('span');
      if (budget.is_overspent) {
        pill.className = 'pill danger';
        pill.textContent = 'Over limit';
      } else if (percentage >= 80) {
        pill.className = 'pill amber';
        pill.textContent = 'Near limit';
      } else {
        pill.className = 'pill green';
        pill.textContent = 'On track';
      }
      left.appendChild(pill);
      const right = document.createElement('strong');
      right.textContent = `${money(budget.spent_amount)} of ${money(budget.limit_amount)}`;
      meta.append(left, right);

      const track = document.createElement('div');
      track.className = 'progress' + (budget.is_overspent ? ' danger' : percentage >= 80 ? ' warn' : '');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', `${budget.category_name} budget used`);
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(Math.round(percentage)));
      track.setAttribute('aria-valuetext', `${Math.round(percentage)}% used, ${money(budget.spent_amount)} of ${money(budget.limit_amount)}`);
      const fill = document.createElement('span');
      fill.style.width = Math.max(3, percentage) + '%';
      track.appendChild(fill);

      item.append(meta, track);
      list.appendChild(item);
    });
    budgetStatusEl.replaceChildren(list);
  };

  // ---------- Load everything ----------
  const setLoading = () => {
    monthResolved = false;
    if (summarySection) summarySection.setAttribute('aria-busy', 'true');
    setSummaryValue('income', '—', { foot: 'Loading…' });
    setSummaryValue('expenses', '—', { foot: 'Loading…' });
    setSummaryValue('net', '—', { tone: '', foot: 'Loading…' });
    setSummaryValue('topCategory', '—', { foot: 'Loading…' });
    showChartState(spendingState, spendingChartBox, 'loading', { message: 'Loading chart…' });
    showChartState(cashflowState, cashflowChartBox, 'loading', { message: 'Loading chart…' });
    UI.renderState(alertsEl, 'loading', { message: 'Loading alerts…' });
    UI.renderState(budgetStatusEl, 'loading', { message: 'Loading budgets…' });
  };

  async function loadAll() {
    setLoading();

    const [spending, cashflow, alerts, budgetStatus] = await Promise.allSettled([
      api.get('/analytics/spending-by-category'),
      api.get('/analytics/month-comparison'),
      api.get('/analytics/budget-alerts'),
      api.get('/analytics/budget-status'),
    ]);

    renderSpending(spending.status === 'fulfilled' ? spending.value : null);
    renderCashflow(cashflow.status === 'fulfilled' ? cashflow.value : null);
    renderAlerts(alerts.status === 'fulfilled' ? alerts.value : null);
    renderBudgetStatus(budgetStatus.status === 'fulfilled' ? budgetStatus.value : null);
    renderSummary();
    if (summarySection) summarySection.removeAttribute('aria-busy');

    if (!monthResolved) {
      monthLabels.forEach((el) => {
        if (el.textContent === 'Loading…') el.textContent = 'This month';
      });
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      const original = refreshBtn.textContent;
      refreshBtn.textContent = 'Refreshing…';
      await loadAll();
      refreshBtn.disabled = false;
      refreshBtn.textContent = original;
      UI.showToast('Reports refreshed', 'success');
    });
  }

  // Re-draw charts with the new tokens when the theme palette/mode changes.
  window.addEventListener('spendsense:theme-change', () => {
    if (lastSpending) renderSpending(lastSpending);
    if (lastCashflow) renderCashflow(lastCashflow);
    renderSummary();
  });

  loadAll();
});
