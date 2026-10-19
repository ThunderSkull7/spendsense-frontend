// Dashboard — renders real API data with loading / empty / error states.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);
  const settings = window.SpendSenseSettings;

  // Stable category → colour mapping shared with the reports page.
  const toneKeyOf = (item) =>
    item && item.category_id != null
      ? `cat:${item.category_id}`
      : `name:${String((item && item.category_name) || '').toLowerCase()}`;
  const colorMapFor = (items) => {
    const tones =
      settings && typeof settings.categoryTones === 'function'
        ? settings.categoryTones(items.map(toneKeyOf))
        : new Map();
    const colors =
      settings && typeof settings.chartColors === 'function'
        ? settings.chartColors()
        : ['#10B981'];
    return (item) => colors[(tones.get(toneKeyOf(item)) || 0) % colors.length];
  };

  const refreshButton = document.querySelector('[data-refresh]');
  const statEls = {
    income: document.querySelector('[data-stat="income"]'),
    expenses: document.querySelector('[data-stat="expenses"]'),
    net: document.querySelector('[data-stat="net"]'),
    budget: document.querySelector('[data-stat="budget"]'),
  };
  const breakdownEl = document.querySelector('[data-breakdown]');
  const comparisonEl = document.querySelector('[data-comparison]');
  const budgetsEl = document.querySelector('[data-budgets]');
  const transactionsEl = document.querySelector('[data-transactions]');
  const monthLabels = document.querySelectorAll('[data-month-label]');

  const monthName = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const shortMonth = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short' });

  let monthResolved = false;

  const setMonthLabels = (month, year) => {
    monthResolved = true;
    monthLabels.forEach((el) => {
      el.textContent = monthName(month, year);
    });
  };

  const renderStat = (el, { value, foot = '', tone = '', delta = null, textValue = false }) => {
    if (!el) return;
    el.replaceChildren();
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value' + (tone ? ' ' + tone : '') + (textValue ? ' text-value' : '');
    valueEl.textContent = value;
    el.appendChild(valueEl);
    if (delta && delta.text) {
      const deltaEl = document.createElement('div');
      deltaEl.className = 'stat-delta ' + (delta.tone || 'neutral');
      deltaEl.textContent = delta.text;
      el.appendChild(deltaEl);
    } else {
      const footEl = document.createElement('div');
      footEl.className = 'stat-foot';
      footEl.textContent = foot;
      el.appendChild(footEl);
    }
  };

  const renderStatError = (el) => {
    if (!el) return;
    el.replaceChildren();
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = '—';
    const footEl = document.createElement('div');
    footEl.className = 'stat-foot';
    footEl.style.color = 'var(--danger)';
    footEl.textContent = 'Unavailable right now';
    el.append(valueEl, footEl);
  };

  const setLoading = () => {
    monthResolved = false;
    Object.values(statEls).forEach((el) => {
      if (el) el.innerHTML = '<div class="skeleton line" style="width: 58%"></div>';
    });
    UI.renderState(breakdownEl, 'loading', { message: 'Loading spending…' });
    UI.renderState(comparisonEl, 'loading', { message: 'Loading cash flow…' });
    UI.renderState(budgetsEl, 'loading', { message: 'Loading budgets…' });
    UI.renderState(transactionsEl, 'loading', { message: 'Loading transactions…' });
  };

  let lastBreakdownResult = null;

  const renderBreakdown = (result) => {
    lastBreakdownResult = result;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(breakdownEl, 'error', { message: 'Could not load spending breakdown.', retry: loadDashboard });
      return;
    }
    const payload = result.data.data;
    const items = (payload.breakdown || []).slice().sort((a, b) => b.total_spent - a.total_spent);
    if (payload.month && payload.year) setMonthLabels(payload.month, payload.year);

    if (!items.length) {
      UI.renderState(breakdownEl, 'empty', {
        message: 'No expenses recorded this month yet.',
        action: { href: '../expense-management/add-expense.html', label: 'Add an expense' },
      });
      return;
    }

    const max = items[0].total_spent || 1;
    const total = items.reduce((sum, item) => sum + item.total_spent, 0) || 1;
    const colorFor = colorMapFor(items);
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

    breakdownEl.replaceChildren(list);
  };

  // Inline category colours are resolved from the live theme tokens; redraw
  // them when the palette or mode changes so the dashboard never goes stale.
  window.addEventListener('spendsense:theme-change', () => {
    if (lastBreakdownResult) renderBreakdown(lastBreakdownResult);
  });

  const renderComparison = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(comparisonEl, 'error', { message: 'Could not load cash flow comparison.', retry: loadDashboard });
      return;
    }
    const payload = result.data.data;
    const current = payload.current_month || {};
    const previous = payload.previous_month || {};
    const change = payload.change_percentage || {};

    // The comparison endpoint has the previous month, so enrich the summary
    // cards with an honest month-over-month delta instead of a static caption.
    const trend = (percent, direction) => {
      if (typeof percent !== 'number' || !Number.isFinite(percent)) return null;
      const flat = Math.abs(percent) < 0.05;
      if (flat) return { text: 'Level with last month', tone: 'neutral' };
      const rising = percent > 0;
      const tone = direction === 'income' ? (rising ? 'pos' : 'neg') : (rising ? 'neg' : 'pos');
      return {
        text: `${rising ? '↑' : '↓'} ${Math.abs(percent).toFixed(1)}% vs last month`,
        tone,
      };
    };
    if (typeof current.income === 'number') {
      renderStat(statEls.income, {
        value: money(current.income),
        foot: 'Income this month',
        delta: previous.income > 0 ? trend(change.income, 'income') : null,
      });
    }
    if (typeof current.expenses === 'number') {
      renderStat(statEls.expenses, {
        value: money(current.expenses),
        foot: 'Spending this month',
        delta: previous.expenses > 0 ? trend(change.expenses, 'expense') : null,
      });
    }

    const max = Math.max(current.income || 0, current.expenses || 0, previous.income || 0, previous.expenses || 0, 1);

    comparisonEl.replaceChildren();

    if (previous.expenses > 0 && typeof change.expenses === 'number') {
      const delta = document.createElement('p');
      delta.className = 'delta-line';
      const rising = change.expenses > 0;
      const flat = Math.abs(change.expenses) < 0.05;
      const span = document.createElement('span');
      span.className = flat ? '' : rising ? 'up' : 'down';
      span.textContent = flat
        ? 'Spending is level with last month'
        : `Spending ${rising ? 'up' : 'down'} ${Math.abs(change.expenses).toFixed(1)}% vs last month`;
      delta.appendChild(span);
      comparisonEl.appendChild(delta);
    } else if (previous.expenses === 0 && current.expenses > 0) {
      const delta = document.createElement('p');
      delta.className = 'delta-line';
      delta.textContent = 'No spending was recorded last month to compare against.';
      comparisonEl.appendChild(delta);
    }

    const chart = document.createElement('div');
    chart.className = 'columns-chart';
    [
      [previous, 'Last month', shortMonth(previous.month, previous.year)],
      [current, 'This month', shortMonth(current.month, current.year)],
    ].forEach(([month, label, hint]) => {
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
      labelEl.textContent = hint || label;

      col.append(track, value, labelEl);
      chart.appendChild(col);
    });
    comparisonEl.appendChild(chart);

    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML =
      '<span class="legend-item"><span class="dot income"></span> Income</span>' +
      '<span class="legend-item"><span class="dot expense"></span> Expenses</span>';
    comparisonEl.appendChild(legend);
  };

  const renderBudgets = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      renderStatError(statEls.budget);
      UI.renderState(budgetsEl, 'error', { message: 'Could not load budget status.', retry: loadDashboard });
      return;
    }
    const payload = result.data.data;
    const budgets = payload.budgets || [];

    if (!budgets.length) {
      renderStat(statEls.budget, { value: '—', foot: 'No budgets set for this month' });
      UI.renderState(budgetsEl, 'empty', {
        message: 'No budgets for this month yet — set one from the Budgets page.',
        action: { href: '../budget-planning/budget.html', label: 'Set a budget' },
      });
      return;
    }

    const totalRemaining = budgets.reduce((sum, budget) => sum + budget.remaining_amount, 0);
    const overCount = budgets.filter((budget) => budget.is_overspent).length;
    renderStat(statEls.budget, {
      value: money(totalRemaining),
      tone: totalRemaining < 0 ? 'neg' : 'pos',
      foot: overCount
        ? `${overCount} budget${overCount > 1 ? 's' : ''} over limit`
        : `Across ${budgets.length} budget${budgets.length > 1 ? 's' : ''}`,
    });

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
    budgetsEl.replaceChildren(list);
  };

  const renderTransactions = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(transactionsEl, 'error', { message: 'Could not load recent transactions.', retry: loadDashboard });
      return;
    }
    const rows = result.data.data.data || [];
    if (!rows.length) {
      UI.renderState(transactionsEl, 'empty', {
        message: 'No expenses logged yet. Add your first expense to see it here.',
        action: { href: '../expense-management/add-expense.html', label: 'Add an expense' },
      });
      return;
    }

    const list = document.createElement('div');
    list.className = 'tx-list';
    rows.slice(0, 6).forEach((row) => {
      const wrap = document.createElement('a');
      wrap.className = 'tx-row';
      wrap.href = '../expense-management/expenses.html';
      const label = row.description || (row.category ? row.category.name : 'expense');
      wrap.setAttribute('aria-label', `View expenses. ${label}, ${money(row.amount)} on ${UI.formatDate(row.expense_date)}`);

      const ico = document.createElement('span');
      ico.className = 'tx-ico';
      ico.textContent = (row.category && row.category.name ? row.category.name : 'E').charAt(0).toUpperCase();

      const main = document.createElement('div');
      main.className = 'tx-main';
      const title = document.createElement('div');
      title.className = 'tx-title';
      title.textContent = row.description || (row.category ? row.category.name : 'Expense');
      const sub = document.createElement('div');
      sub.className = 'tx-sub';
      sub.textContent = UI.formatDate(row.expense_date) + (row.description && row.category ? ' · ' + row.category.name : '');
      main.append(title, sub);

      const amount = document.createElement('span');
      amount.className = 'tx-amt amount-neg';
      amount.textContent = '-' + money(row.amount);

      wrap.append(ico, main, amount);
      list.appendChild(wrap);
    });
    transactionsEl.replaceChildren(list);
  };

  async function loadDashboard() {
    setLoading();

    const [cashFlow, breakdown, comparison, budgetStatus, transactions] = await Promise.allSettled([
      api.get('/analytics/cash-flow'),
      api.get('/analytics/spending-by-category'),
      api.get('/analytics/month-comparison'),
      api.get('/analytics/budget-status'),
      api.get('/expenses'),
    ]);

    // --- Stat cards + month label from cash flow ---
    const cf = cashFlow.status === 'fulfilled' ? cashFlow.value : null;
    if (cf && cf.status === 200 && cf.data && cf.data.data) {
      const data = cf.data.data;
      setMonthLabels(data.month, data.year);
      renderStat(statEls.income, { value: money(data.total_income), foot: 'Total logged income this month' });
      renderStat(statEls.expenses, { value: money(data.total_expenses), foot: 'Total logged spending this month' });
      renderStat(statEls.net, {
        value: money(data.net_cash_flow),
        tone: data.net_cash_flow > 0 ? 'pos' : data.net_cash_flow < 0 ? 'neg' : '',
        foot: 'Income minus expenses',
      });
    } else {
      renderStatError(statEls.income);
      renderStatError(statEls.expenses);
      renderStatError(statEls.net);
    }

    renderBreakdown(breakdown.status === 'fulfilled' ? breakdown.value : null);
    renderComparison(comparison.status === 'fulfilled' ? comparison.value : null);
    renderBudgets(budgetStatus.status === 'fulfilled' ? budgetStatus.value : null);
    renderTransactions(transactions.status === 'fulfilled' ? transactions.value : null);

    if (!monthResolved) {
      monthLabels.forEach((el) => {
        if (el.textContent === 'Loading…') el.textContent = 'This month';
      });
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      const original = refreshButton.textContent;
      refreshButton.disabled = true;
      refreshButton.textContent = 'Refreshing…';
      await loadDashboard();
      refreshButton.disabled = false;
      refreshButton.textContent = original;
      UI.showToast('Dashboard refreshed', 'success');
    });
  }

  loadDashboard();
});
