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

  const statIncomeEl = document.querySelector('[data-stat-income]');
  const statIncomeFootEl = document.querySelector('[data-stat-income-foot]');
  const statExpensesEl = document.querySelector('[data-stat-expenses]');
  const statExpensesFootEl = document.querySelector('[data-stat-expenses-foot]');
  const statNetEl = document.querySelector('[data-stat-net]');
  const statNetFootEl = document.querySelector('[data-stat-net-foot]');

  const spendingState = document.querySelector('[data-spending-state]');
  const spendingChartBox = document.querySelector('[data-spending-chart]');
  const spendingLegend = document.querySelector('[data-spending-legend]');
  const cashflowState = document.querySelector('[data-cashflow-state]');
  const cashflowChartBox = document.querySelector('[data-cashflow-chart]');
  const alertsEl = document.querySelector('[data-alerts]');
  const budgetStatusEl = document.querySelector('[data-budget-status]');

  let spendingChartInstance = null;
  let cashflowChartInstance = null;

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

  // ---------- CSS bar fallback (also used for fallback when Chart.js unavailable) ----------
  const buildBars = (items) => {
    const max = items[0].total_spent || 1;
    const total = items.reduce((sum, item) => sum + item.total_spent, 0) || 1;
    const list = document.createElement('div');
    list.className = 'bar-list';
    items.forEach((item) => {
      const tone = window.SpendSenseSettings.getCategoryTone({ id: item.category_id, name: item.category_name });
      const row = document.createElement('div');
      row.className = 'bar-row';

      const meta = document.createElement('div');
      meta.className = 'bar-meta';
      const label = document.createElement('span');
      const dot = document.createElement('span');
      dot.className = 'dot ' + tone.toneName;
      dot.style.backgroundColor = tone.color;
      label.append(dot, document.createTextNode(' ' + item.category_name));
      const value = document.createElement('strong');
      const pct = Math.round((item.total_spent / total) * 100);
      value.textContent = `${money(item.total_spent)} · ${pct}%`;
      meta.append(label, value);

      const track = document.createElement('div');
      track.className = 'progress';
      const fill = document.createElement('span');
      fill.className = tone.toneName;
      fill.style.backgroundColor = tone.color;
      fill.style.width = Math.max(4, Math.round((item.total_spent / max) * 100)) + '%';
      track.appendChild(fill);

      row.append(meta, track);
      list.appendChild(row);
    });
    return list;
  };

  // ---------- Top Metrics Update ----------
  const updateTopMetrics = (cashflowData, spendingData) => {
    if (!cashflowData || !cashflowData.data || !cashflowData.data.data) return;
    const current = cashflowData.data.data.current_month || {};
    const previous = cashflowData.data.data.previous_month || {};

    const income = current.income || 0;
    const expenses = current.expenses || 0;
    const net = current.net != null ? current.net : income - expenses;

    if (statIncomeEl) {
      statIncomeEl.textContent = money(income);
      if (statIncomeFootEl) {
        const prevIncome = previous.income || 0;
        const diff = income - prevIncome;
        statIncomeFootEl.textContent = prevIncome > 0
          ? `${diff >= 0 ? '+' : ''}${money(diff)} vs last month`
          : 'Current month total';
      }
    }

    if (statExpensesEl) {
      statExpensesEl.textContent = money(expenses);
      if (statExpensesFootEl) {
        const prevExpenses = previous.expenses || 0;
        const diff = expenses - prevExpenses;
        statExpensesFootEl.textContent = prevExpenses > 0
          ? `${diff > 0 ? '+' : ''}${money(diff)} vs last month`
          : 'Current month total';
      }
    }

    if (statNetEl) {
      statNetEl.textContent = (net >= 0 ? '+' : '') + money(net);
      statNetEl.className = 'stat-value ' + (net >= 0 ? 'pos' : 'neg');
      if (statNetFootEl) {
        if (income > 0) {
          const savingsRate = Math.round((net / income) * 100);
          statNetFootEl.textContent = net >= 0
            ? `${savingsRate}% savings rate`
            : `${Math.abs(savingsRate)}% deficit rate`;
        } else if (income === 0 && expenses === 0) {
          statNetFootEl.textContent = 'No cash flow activity';
        } else {
          statNetFootEl.textContent = net >= 0 ? 'No expenses recorded' : 'Unfunded deficit';
        }
      }
    }
  };

  // ---------- Spending by category ----------
  const renderSpending = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      showChartState(spendingState, spendingChartBox, 'error', {
        message: 'Could not load spending data.',
        retry: loadAll,
      });
      return;
    }
    const payload = result.data.data;
    setMonthLabels(payload.month, payload.year);

    const items = (payload.breakdown || []).slice().sort((a, b) => b.total_spent - a.total_spent);
    if (!items.length) {
      showChartState(spendingState, spendingChartBox, 'empty', {
        message: 'No expenses recorded this month yet.',
      });
      return;
    }

    showChart(spendingState, spendingChartBox);

    const total = items.reduce((sum, item) => sum + item.total_spent, 0) || 1;
    const categoryColors = items.map((item) => {
      const tone = window.SpendSenseSettings.getCategoryTone({ id: item.category_id, name: item.category_name });
      return tone.color;
    });

    if (spendingLegend) {
      spendingLegend.replaceChildren();
      items.forEach((item, index) => {
        const entry = document.createElement('span');
        entry.className = 'legend-item';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.backgroundColor = categoryColors[index];
        const pct = Math.round((item.total_spent / total) * 100);
        entry.append(dot, document.createTextNode(`${item.category_name} · ${money(item.total_spent)} (${pct}%)`));
        spendingLegend.appendChild(entry);
      });
    }

    const canvas = document.querySelector('#spendingChart');
    if (window.Chart && canvas) {
      if (spendingChartInstance) spendingChartInstance.destroy();
      const isDark = document.documentElement.dataset.mode === 'dark';

      spendingChartInstance = new window.Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: items.map((item) => item.category_name),
          datasets: [
            {
              data: items.map((item) => item.total_spent),
              backgroundColor: categoryColors,
              borderColor: isDark ? '#151D2A' : '#FFFFFF',
              borderWidth: 2,
              hoverOffset: 8,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '64%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.95)',
              titleColor: '#FFFFFF',
              bodyColor: '#FFFFFF',
              padding: 10,
              boxPadding: 6,
              cornerRadius: 8,
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed;
                  const pct = Math.round((val / total) * 100);
                  return ` ${ctx.label}: ${money(val)} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    } else if (canvas) {
      const host = canvas.parentElement;
      if (host) host.replaceChildren(buildBars(items));
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
      showChartState(cashflowState, cashflowChartBox, 'error', {
        message: 'Could not load cash flow data.',
        retry: loadAll,
      });
      return;
    }
    const payload = result.data.data;
    const current = payload.current_month || {};
    const previous = payload.previous_month || {};
    showChart(cashflowState, cashflowChartBox);

    const canvas = document.querySelector('#cashflowChart');
    if (window.Chart && canvas) {
      if (cashflowChartInstance) cashflowChartInstance.destroy();
      const isDark = document.documentElement.dataset.mode === 'dark';
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      const textColor = isDark ? '#94A3B8' : '#64748B';

      cashflowChartInstance = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: [
            shortMonthLabel(previous.month, previous.year),
            shortMonthLabel(current.month, current.year),
          ],
          datasets: [
            {
              label: 'Income',
              data: [previous.income || 0, current.income || 0],
              backgroundColor: isDark ? '#22C55E' : '#16A34A',
              borderRadius: 6,
              maxBarThickness: 44,
            },
            {
              label: 'Expenses',
              data: [previous.expenses || 0, current.expenses || 0],
              backgroundColor: isDark ? '#F59E0B' : '#D97706',
              borderRadius: 6,
              maxBarThickness: 44,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                color: textColor,
                font: { size: 11 },
                callback: (value) => money(value),
              },
              grid: { color: gridColor },
            },
            x: {
              ticks: { color: textColor, font: { size: 12, weight: '600' } },
              grid: { display: false },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.95)',
              titleColor: '#FFFFFF',
              bodyColor: '#FFFFFF',
              padding: 10,
              boxPadding: 6,
              cornerRadius: 8,
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y)}`,
              },
            },
          },
        },
      });
    } else if (canvas) {
      const host = canvas.parentElement;
      if (host) {
        const max = Math.max(
          current.income || 0,
          current.expenses || 0,
          previous.income || 0,
          previous.expenses || 0,
          1
        );
        host.replaceChildren(buildColumns(previous, current, max));
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
      UI.renderState(alertsEl, 'empty', { message: 'No alerts this month — all budgets are safely on track.' });
      return;
    }

    const list = document.createElement('div');
    list.className = 'notif-list';
    alerts.forEach((alert) => {
      const item = document.createElement('div');
      item.className = 'notif-item';

      const isOver = alert.alert_type === 'overspent';
      const ico = document.createElement('span');
      ico.className = 'n-ico';
      ico.style.color = isOver ? 'var(--danger)' : 'var(--warn)';
      ico.style.backgroundColor = isOver ? 'var(--danger-100)' : 'var(--warn-100)';
      ico.style.borderColor = isOver ? 'var(--danger-100)' : 'var(--warn-100)';
      ico.innerHTML = isOver
        ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';

      const body = document.createElement('div');
      body.className = 'n-body';
      const title = document.createElement('div');
      title.className = 'n-title';
      const pill = document.createElement('span');
      pill.className = 'pill ' + (isOver ? 'danger' : 'amber');
      pill.textContent = isOver ? 'Over limit' : 'Near limit';
      title.append(document.createTextNode(alert.category_name + ' '), pill);

      const text = document.createElement('div');
      text.className = 'n-text';
      const diff = Math.abs(alert.spent_amount - alert.limit_amount);
      const diffText = isOver ? `${money(diff)} over budget` : `${money(diff)} remaining`;
      text.textContent = `${money(alert.spent_amount)} spent of ${money(alert.limit_amount)} limit · ${diffText}`;

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
      UI.renderState(budgetStatusEl, 'empty', { message: 'No budgets set for this month yet.' });
      return;
    }

    const list = document.createElement('div');
    list.className = 'budget-list';
    budgets.forEach((budget) => {
      const percentage = Math.min(100, Math.max(0, budget.percentage_used || 0));
      const tone = window.SpendSenseSettings.getCategoryTone({ id: budget.category_id, name: budget.category_name });
      const item = document.createElement('div');
      item.className = 'budget-item';

      const meta = document.createElement('div');
      meta.className = 'b-meta';
      const left = document.createElement('span');
      const dot = document.createElement('span');
      dot.className = 'dot ' + tone.toneName;
      dot.style.backgroundColor = tone.color;
      left.append(dot, document.createTextNode(' ' + budget.category_name + ' '));

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

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';
      const value = document.createElement('strong');
      value.textContent = `${money(budget.spent_amount)} of ${money(budget.limit_amount)}`;
      const rem = document.createElement('span');
      rem.className = 'b-remaining' + (budget.is_overspent ? ' over' : '');
      const diff = Math.abs(budget.remaining_amount);
      rem.textContent = budget.is_overspent ? `${money(diff)} over limit` : `${money(diff)} left`;
      right.append(value, rem);
      meta.append(left, right);

      const track = document.createElement('div');
      track.className = 'progress' + (budget.is_overspent ? ' danger' : percentage >= 80 ? ' warn' : '');
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

    const cashflowVal = cashflow.status === 'fulfilled' ? cashflow.value : null;
    const spendingVal = spending.status === 'fulfilled' ? spending.value : null;

    updateTopMetrics(cashflowVal, spendingVal);
    renderSpending(spendingVal);
    renderCashflow(cashflowVal);
    renderAlerts(alerts.status === 'fulfilled' ? alerts.value : null);
    renderBudgetStatus(budgetStatus.status === 'fulfilled' ? budgetStatus.value : null);

    if (!monthResolved) {
      monthLabels.forEach((el) => {
        if (el.textContent === 'Loading…') el.textContent = 'This month';
      });
    }
  }

  // Refresh charts when theme changes
  window.addEventListener('spendsense:theme-change', () => {
    const isDark = document.documentElement.dataset.mode === 'dark';
    if (spendingChartInstance) {
      if (spendingChartInstance.data.datasets[0]) {
        spendingChartInstance.data.datasets[0].borderColor = isDark ? '#151D2A' : '#FFFFFF';
      }
      if (spendingChartInstance.options.plugins && spendingChartInstance.options.plugins.tooltip) {
        spendingChartInstance.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.95)';
      }
      spendingChartInstance.update();
    }
    if (cashflowChartInstance) {
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      const textColor = isDark ? '#94A3B8' : '#64748B';
      if (cashflowChartInstance.data.datasets[0]) {
        cashflowChartInstance.data.datasets[0].backgroundColor = isDark ? '#22C55E' : '#16A34A';
      }
      if (cashflowChartInstance.data.datasets[1]) {
        cashflowChartInstance.data.datasets[1].backgroundColor = isDark ? '#F59E0B' : '#D97706';
      }
      if (cashflowChartInstance.options.scales) {
        if (cashflowChartInstance.options.scales.y) {
          cashflowChartInstance.options.scales.y.grid.color = gridColor;
          cashflowChartInstance.options.scales.y.ticks.color = textColor;
        }
        if (cashflowChartInstance.options.scales.x) {
          cashflowChartInstance.options.scales.x.ticks.color = textColor;
        }
      }
      if (cashflowChartInstance.options.plugins && cashflowChartInstance.options.plugins.tooltip) {
        cashflowChartInstance.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.95)';
      }
      cashflowChartInstance.update();
    }
  });

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

  loadAll();
});
