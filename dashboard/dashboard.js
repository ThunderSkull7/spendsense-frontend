/*
 * Dashboard.
 *
 * Renders real API data with loading / empty / error states, and adds the
 * Stage 5 per-user widget preferences: show, hide and reorder the widgets,
 * persisted through /api/dashboard/preferences.
 *
 * Every widget loads its own data with Promise.allSettled, so one failing
 * widget cannot break the page. The visible set is what the user saved, and
 * the server is the single source of truth for the layout.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);
  const settings = window.SpendSenseSettings;
  const S5 = window.SpendSenseStage5;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const setText = (node, value) => {
    if (!node) return;
    node.textContent = value === null || value === undefined ? '—' : String(value);
  };

  /* ── Widget registry ─────────────────────────────────────────────────── */
  // The key list mirrors the backend DashboardWidgets::KEYS.
  const WIDGETS = [
    { key: 'summary', label: 'Cash-flow summary' },
    { key: 'cash_flow', label: 'This month vs last month' },
    { key: 'spending_categories', label: 'Spending by category' },
    { key: 'budgets', label: 'Budget health' },
    { key: 'savings_goals', label: 'Savings goals' },
    { key: 'upcoming_bills', label: 'Upcoming bills' },
    { key: 'recent_transactions', label: 'Recent expenses' },
    { key: 'spending_insights', label: 'Spending insights' },
    { key: 'cash_flow_forecast', label: '30-day forecast' },
    { key: 'net_worth', label: 'Net worth' },
    { key: 'subscription_renewals', label: 'Subscription renewals' },
  ];

  const WIDGET_KEYS = WIDGETS.map((widget) => widget.key);

  // Net worth and subscriptions depend on optional manual records, so they
  // start hidden. This mirrors the backend default layout.
  const DEFAULT_HIDDEN = ['net_worth', 'subscription_renewals'];

  const defaultLayout = () => S5.defaultWidgetLayout(WIDGET_KEYS, DEFAULT_HIDDEN);

  /* ── Existing dashboard elements ─────────────────────────────────────── */
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
  const region = document.querySelector('[data-widget-region]');
  const refreshButton = document.querySelector('[data-refresh]');

  const monthName = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  let monthResolved = false;

  const setMonthLabels = (month, year) => {
    monthResolved = true;
    monthLabels.forEach((el2) => {
      el2.textContent = monthName(month, year);
    });
  };

  /* ── Rendering helpers (unchanged behaviour from Stage 1-4) ─────────── */
  const renderStat = (node, { value, foot = '', tone = '', delta = null }) => {
    if (!node) return;
    node.replaceChildren();
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value' + (tone ? ' ' + tone : '');
    valueEl.textContent = value;
    node.appendChild(valueEl);
    if (delta && delta.text) {
      const deltaEl = document.createElement('div');
      deltaEl.className = 'stat-delta ' + (delta.tone || 'neutral');
      deltaEl.textContent = delta.text;
      node.appendChild(deltaEl);
    } else {
      const footEl = document.createElement('div');
      footEl.className = 'stat-foot';
      footEl.textContent = foot;
      node.appendChild(footEl);
    }
  };

  const renderStatError = (node) => {
    if (!node) return;
    node.replaceChildren();
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = '—';
    const footEl = document.createElement('div');
    footEl.className = 'stat-foot';
    footEl.style.color = 'var(--danger)';
    footEl.textContent = 'Unavailable right now';
    node.append(valueEl, footEl);
  };

  const setLoading = () => {
    monthResolved = false;
    Object.values(statEls).forEach((node) => {
      if (node) node.innerHTML = '<div class="skeleton line" style="width: 58%"></div>';
    });
    UI.renderState(breakdownEl, 'loading', { message: 'Loading spending…' });
    UI.renderState(comparisonEl, 'loading', { message: 'Loading cash flow…' });
    UI.renderState(budgetsEl, 'loading', { message: 'Loading budgets…' });
    UI.renderState(transactionsEl, 'loading', { message: 'Loading transactions…' });
    document.querySelectorAll('[data-widget-body]').forEach((body) => {
      UI.renderState(body, 'loading', { message: 'Loading…' });
    });
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
    const colorFor = (item) => {
      const tones =
        settings && typeof settings.categoryTones === 'function'
          ? settings.categoryTones([
              item.category_id != null ? `cat:${item.category_id}` : `name:${String(item.category_name || '').toLowerCase()}`,
            ])
          : new Map();
      const colors =
        settings && typeof settings.chartColors === 'function' ? settings.chartColors() : ['#10B981'];
      const key =
        item.category_id != null ? `cat:${item.category_id}` : `name:${String(item.category_name || '').toLowerCase()}`;
      return colors[(tones.get(key) || 0) % colors.length];
    };

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

    const trend = (percentValue, direction) => {
      if (typeof percentValue !== 'number' || !Number.isFinite(percentValue)) return null;
      const flat = Math.abs(percentValue) < 0.05;
      if (flat) return { text: 'Level with last month', tone: 'neutral' };
      const rising = percentValue > 0;
      const tone = direction === 'income' ? (rising ? 'pos' : 'neg') : (rising ? 'neg' : 'pos');
      return {
        text: `${rising ? '↑' : '↓'} ${Math.abs(percentValue).toFixed(1)}% vs last month`,
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
      track.setAttribute(
        'aria-valuetext',
        `${Math.round(percentage)}% used, ${money(budget.spent_amount)} of ${money(budget.limit_amount)}`
      );
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
      wrap.setAttribute(
        'aria-label',
        `View expenses. ${label}, ${money(row.amount)} on ${UI.formatDate(row.expense_date)}`
      );

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

  /* ── Stage 5 widget bodies ───────────────────────────────────────────── */
  const widgetBody = (key) => document.querySelector(`[data-widget-body="${key}"]`);

  const renderSavingsWidget = (result) => {
    const body = widgetBody('savings_goals');
    if (!body) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(body, 'error', { message: 'Could not load savings goals.', retry: loadDashboard });
      return;
    }
    const goals = (result.data.data.goals || []).filter((goal) => goal.status !== 'archived');
    if (!goals.length) {
      UI.renderState(body, 'empty', {
        message: 'No savings goals yet.',
        action: { href: '../savings-goals/savings-goals.html', label: 'Create a goal' },
      });
      return;
    }
    const list = document.createElement('div');
    list.className = 'budget-list';
    goals.slice(0, 4).forEach((goal) => {
      const percentage = Math.min(100, Math.max(0, Number(goal.progress_percent) || 0));
      const item = document.createElement('div');
      item.className = 'budget-item';
      const meta = document.createElement('div');
      meta.className = 'b-meta';
      const left = document.createElement('span');
      left.append(document.createTextNode(goal.name + ' '));
      const right = document.createElement('strong');
      right.textContent = `${money(goal.saved_amount)} of ${money(goal.target_amount)}`;
      meta.append(left, right);
      const track = document.createElement('div');
      track.className = 'progress';
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-label', `${goal.name} saved`);
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(Math.round(percentage)));
      const fill = document.createElement('span');
      fill.style.width = Math.max(3, percentage) + '%';
      track.appendChild(fill);
      item.append(meta, track);
      list.appendChild(item);
    });
    body.replaceChildren(list);
  };

  const renderCommitmentsWidget = (result) => {
    const body = widgetBody('upcoming_bills');
    if (!body) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(body, 'error', { message: 'Could not load upcoming bills.', retry: loadDashboard });
      return;
    }
    const obligations = (result.data.data.upcoming_obligations || []).filter(
      (row) => row.source === 'bill'
    );
    if (!obligations.length) {
      UI.renderState(body, 'empty', {
        message: 'No upcoming expected bills in the next 60 days.',
        action: { href: '../recurring-expenses/recurring-expenses.html', label: 'Manage schedules' },
      });
      return;
    }
    const list = document.createElement('div');
    list.className = 'tx-list';
    obligations.slice(0, 6).forEach((row) => {
      const item = document.createElement('div');
      item.className = 'tx-row';
      const main = document.createElement('div');
      main.className = 'tx-main';
      main.appendChild(el('div', 'tx-title', row.name));
      main.appendChild(el('div', 'tx-sub', `${UI.formatDate(row.date)}${row.category_name ? ' · ' + row.category_name : ''}`));
      const amount = document.createElement('span');
      amount.className = 'tx-amt';
      amount.textContent = money(row.amount);
      item.append(main, amount);
      list.appendChild(item);
    });
    body.replaceChildren(list);
  };

  const renderInsightsWidget = (result) => {
    const body = widgetBody('spending_insights');
    if (!body) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(body, 'error', { message: 'Could not load spending insights.', retry: loadDashboard });
      return;
    }
    const data = result.data.data;
    const summary = data.summary || {};
    const strip = document.createElement('div');
    strip.className = 'metric-strip';
    strip.append(
      metricMini('Actual spending', money(summary.total_expenses)),
      metricMini('Net cash flow', money(summary.net_cash_flow)),
      metricMini('Largest expense', money(summary.largest_expense || 0))
    );
    const note = el('p', 'action-note', `Flagged for review: ${summary.anomaly_count || 0}. Review signals are descriptive, never a fraud finding.`);
    body.replaceChildren(strip, note);
  };

  const renderForecastWidget = (result) => {
    const body = widgetBody('cash_flow_forecast');
    if (!body) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(body, 'error', { message: 'Could not load the forecast.', retry: loadDashboard });
      return;
    }
    const data = result.data.data;
    const strip = document.createElement('div');
    strip.className = 'metric-strip';
    strip.append(
      metricMini('Expected income', money(data.expected_income)),
      metricMini('Expected expenses', money(data.expected_expenses)),
      metricMini('Projected net', money(data.projected_net_cash_flow))
    );
    const note = el(
      'p',
      'action-note',
      'Schedule-based expectations only. No cash balance is reported, and running a forecast never creates a transaction.'
    );
    body.replaceChildren(strip, note);
  };

  const renderNetWorthWidget = (result) => {
    const body = widgetBody('net_worth');
    if (!body) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(body, 'error', { message: 'Could not load net worth.', retry: loadDashboard });
      return;
    }
    const summary = (result.data.data.summary) || {};
    if (!summary.active_entry_count) {
      UI.renderState(body, 'empty', {
        message: 'No net worth entries yet.',
        action: { href: '../financial-intelligence/net-worth.html', label: 'Add an entry' },
      });
      return;
    }
    const strip = document.createElement('div');
    strip.className = 'metric-strip';
    strip.append(
      metricMini('Assets', money(summary.total_assets)),
      metricMini('Liabilities', money(summary.total_liabilities)),
      metricMini('Net worth', money(summary.net_worth))
    );
    const note = el('p', 'action-note', 'Manual dated valuations. Net worth is not a verified available-cash balance.');
    body.replaceChildren(strip, note);
  };

  const renderSubscriptionsWidget = (result) => {
    const body = widgetBody('subscription_renewals');
    if (!body) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(body, 'error', { message: 'Could not load subscriptions.', retry: loadDashboard });
      return;
    }
    const summary = (result.data.data.summary) || {};
    const strip = document.createElement('div');
    strip.className = 'metric-strip';
    strip.append(
      metricMini('Active trackers', summary.active_count || 0),
      metricMini('Linked to a bill', summary.linked_count || 0),
      metricMini('Monthly estimate', money(summary.estimated_monthly_cost))
    );
    const note = el(
      'p',
      'action-note',
      'Estimates only. A linked tracker is counted through its bill schedule, so it is never counted twice.'
    );
    body.replaceChildren(strip, note);
  };

  const metricMini = (label, value) => {
    const box = el('div', 'metric-mini');
    box.append(el('span', '', label), el('strong', '', value));
    return box;
  };

  /* ── Widget preference state ─────────────────────────────────────────── */
  let layout = defaultLayout();
  let layoutLoaded = false;

  const loadLayout = async () => {
    try {
      // The cache buster keeps a previously cached layout from being applied
      // after the user has just changed it.
      const result = await api.get(`/dashboard/preferences?_=${Date.now()}`);
      if (result && result.status === 200 && result.data && result.data.success !== false) {
        const widgets = result.data.data && result.data.data.widgets;
        if (Array.isArray(widgets) && widgets.length) {
          // The shared helper keeps the server order, drops unknown keys and
          // appends any widget the server did not send, so a newly added
          // widget is never silently dropped.
          layout = S5.normalizeWidgetLayout(widgets, WIDGET_KEYS, DEFAULT_HIDDEN);
        } else {
          layout = defaultLayout();
        }
      } else {
        layout = defaultLayout();
      }
    } catch (e) {
      layout = defaultLayout();
    }
    layoutLoaded = true;
  };

  const saveLayout = async (widgets) => {
    try {
      const result = await api.put('/dashboard/preferences', { widgets });
      return !!(result && result.status === 200);
    } catch (e) {
      return false;
    }
  };

  const resetLayout = async () => {
    try {
      const result = await api.delete('/dashboard/preferences');
      return !!(result && result.status === 200);
    } catch (e) {
      return false;
    }
  };

  /** Show, hide and reorder the widget elements to match the layout. */
  const applyLayout = () => {
    if (!region) return;
    layout.forEach((widget) => {
      const node = region.querySelector(`[data-widget="${widget.key}"]`);
      if (!node) return;
      node.hidden = !widget.visible;
      // Re-appending in layout order moves the element to the end, which is
      // exactly the required reordering behaviour.
      region.appendChild(node);
    });
  };

  const visibleKeys = () => S5.visibleWidgetKeys(layout);

  /* ── Customize dialog ────────────────────────────────────────────────── */
  const customizeDialog = document.querySelector('#dashboard-customize-dialog');
  const customizeTrigger = document.querySelector('[data-dashboard-customize]');
  const customizeList = customizeDialog ? customizeDialog.querySelector('[data-widget-list]') : null;
  const customizeMessage = customizeDialog
    ? customizeDialog.querySelector('[data-customize-message]')
    : null;

  const setCustomizeMessage = (text, type = '') => {
    if (!customizeMessage) return;
    customizeMessage.textContent = text || '';
    customizeMessage.classList.remove('error', 'success');
    if (type) customizeMessage.classList.add(type);
  };

  const buildCustomizeList = () => {
    if (!customizeList) return;
    customizeList.replaceChildren();

    layout.forEach((widget, index) => {
      const meta = WIDGETS.find((item) => item.key === widget.key);
      const item = el('li', 'widget-row');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = widget.visible;
      checkbox.dataset.widgetKey = widget.key;
      checkbox.id = `widget-toggle-${widget.key}`;
      checkbox.addEventListener('change', () => {
        const target = layout.find((entry) => entry.key === widget.key);
        if (target) target.visible = checkbox.checked;
        applyLayout();
      });

      const label = document.createElement('label');
      label.setAttribute('for', checkbox.id);
      label.textContent = meta ? meta.label : widget.key;

      const order = el('span', 'widget-order', String(index + 1));

      const move = el('span', 'widget-move');
      const up = document.createElement('button');
      up.type = 'button';
      up.textContent = '↑';
      up.setAttribute('aria-label', `Move ${meta ? meta.label : widget.key} up`);
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        layout = S5.moveWidget(layout, widget.key, -1);
        applyLayout();
        buildCustomizeList();
        // Keep the keyboard focus on the same control after the re-render.
        const next = customizeList.querySelector(`#widget-toggle-${CSS.escape(widget.key)}`);
        if (next) next.focus();
      });

      const down = document.createElement('button');
      down.type = 'button';
      down.textContent = '↓';
      down.setAttribute('aria-label', `Move ${meta ? meta.label : widget.key} down`);
      down.disabled = index === layout.length - 1;
      down.addEventListener('click', () => {
        layout = S5.moveWidget(layout, widget.key, 1);
        applyLayout();
        buildCustomizeList();
        const next = customizeList.querySelector(`#widget-toggle-${CSS.escape(widget.key)}`);
        if (next) next.focus();
      });

      move.append(up, down);
      item.append(checkbox, label, order, move);
      customizeList.appendChild(item);
    });
  };

  if (customizeTrigger && customizeDialog) {
    customizeTrigger.addEventListener('click', () => {
      setCustomizeMessage('');
      buildCustomizeList();
      customizeDialog.showModal();
    });

    const closeBtn = customizeDialog.querySelector('[data-customize-close]');
    if (closeBtn) closeBtn.addEventListener('click', () => customizeDialog.close());

    const applyBtn = customizeDialog.querySelector('[data-customize-apply]');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        applyBtn.disabled = true;
        setCustomizeMessage('Saving…');
        const saved = await saveLayout(layout);
        applyBtn.disabled = false;
        if (!saved) {
          setCustomizeMessage('The layout could not be saved. Nothing was changed on the server.', 'error');
          return;
        }
        setCustomizeMessage('Layout saved.', 'success');
        customizeDialog.close();
        UI.showToast('Dashboard layout saved', 'success');
      });
    }

    const resetBtn = customizeDialog.querySelector('[data-customize-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        resetBtn.disabled = true;
        setCustomizeMessage('Resetting…');
        const ok = await resetLayout();
        resetBtn.disabled = false;
        if (!ok) {
          setCustomizeMessage('The layout could not be reset.', 'error');
          return;
        }
        layout = defaultLayout();
        applyLayout();
        buildCustomizeList();
        setCustomizeMessage('Reset to the default layout.', 'success');
        customizeDialog.close();
        UI.showToast('Dashboard reset to defaults', 'success');
      });
    }
  }

  /* ── Quick add ───────────────────────────────────────────────────────── */
  const quickAddDialog = document.querySelector('#quick-add-dialog');
  const quickAddTrigger = document.querySelector('[data-quick-add-trigger]');
  const quickAddForm = quickAddDialog ? quickAddDialog.querySelector('[data-quick-add-form]') : null;
  const quickAddMessage = quickAddDialog
    ? quickAddDialog.querySelector('[data-quick-add-message]')
    : null;

  let quickAddType = 'expense';
  // The key is created once per dialog opening and reused for every retry of
  // that submission, so a retried request cannot create a second record.
  let quickAddKey = null;
  let quickAddSubmitting = false;

  const setQuickAddMessage = (text, type = '') => {
    if (!quickAddMessage) return;
    quickAddMessage.textContent = text || '';
    quickAddMessage.classList.remove('error', 'success');
    if (type) quickAddMessage.classList.add(type);
  };

  const setQuickAddType = (type) => {
    quickAddType = type;
    const group = quickAddDialog.querySelector('[data-quick-add-type]');
    if (group) {
      group.querySelectorAll('[data-quick-add-type-option]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.quickAddTypeOption === type));
      });
    }
    quickAddDialog.querySelectorAll('[data-quick-add-expense-only]').forEach((node) => {
      node.hidden = type !== 'expense';
    });
    quickAddDialog.querySelectorAll('[data-quick-add-income-only]').forEach((node) => {
      node.hidden = type !== 'income';
    });
  };

  const loadQuickAddCategories = async () => {
    const select = quickAddDialog.querySelector('#quick-add-category');
    if (!select || select.dataset.loaded === '1') return;
    try {
      const result = await api.get('/categories');
      if (result && result.status === 200 && result.data && result.data.data) {
        select.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose category';
        select.appendChild(placeholder);
        result.data.data
          .filter((category) => category.type === 'expense')
          .forEach((category) => {
            const option = document.createElement('option');
            option.value = String(category.id);
            option.textContent = category.name;
            select.appendChild(option);
          });
        select.dataset.loaded = '1';
      }
    } catch (e) {
      /* The category list is optional; the server still validates the id. */
    }
  };

  if (quickAddTrigger && quickAddDialog && quickAddForm) {
    quickAddTrigger.addEventListener('click', async () => {
      quickAddKey = api.newIdempotencyKey();
      setQuickAddMessage('');
      const date = quickAddDialog.querySelector('#quick-add-date');
      if (date && !date.value) date.value = UI.todayInputValue();
      setQuickAddType('expense');
      quickAddDialog.showModal();
      // The focus moves before the category list is loaded, so a keyboard
      // user can type straight away instead of waiting for the request.
      const amount = quickAddDialog.querySelector('#quick-add-amount');
      if (amount) amount.focus();
      await loadQuickAddCategories();
    });

    quickAddDialog.querySelectorAll('[data-quick-add-close]').forEach((button) => {
      button.addEventListener('click', () => quickAddDialog.close());
    });

    const typeGroup = quickAddDialog.querySelector('[data-quick-add-type]');
    if (typeGroup) {
      typeGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-quick-add-type-option]');
        if (!button) return;
        setQuickAddType(button.dataset.quickAddTypeOption);
      });
    }

    const submit = async () => {
      if (quickAddSubmitting) return;

      const amountInput = quickAddDialog.querySelector('#quick-add-amount');
      const dateInput = quickAddDialog.querySelector('#quick-add-date');
      const descriptionInput = quickAddDialog.querySelector('#quick-add-description');
      const categoryInput = quickAddDialog.querySelector('#quick-add-category');
      const sourceInput = quickAddDialog.querySelector('#quick-add-source');

      const amount = parseFloat(amountInput ? amountInput.value : '');
      const date = dateInput ? dateInput.value : '';

      if (!Number.isFinite(amount) || amount <= 0) {
        setQuickAddMessage('Enter an amount greater than zero.', 'error');
        if (amountInput) amountInput.focus();
        return;
      }
      if (!date) {
        setQuickAddMessage('Choose a date.', 'error');
        if (dateInput) dateInput.focus();
        return;
      }

      let payload;
      let endpoint;
      if (quickAddType === 'expense') {
        const categoryId = parseInt(categoryInput ? categoryInput.value : '', 10);
        if (!Number.isInteger(categoryId)) {
          setQuickAddMessage('Choose a category for this expense.', 'error');
          if (categoryInput) categoryInput.focus();
          return;
        }
        endpoint = '/expenses';
        payload = {
          amount,
          category_id: categoryId,
          expense_date: date,
          description: descriptionInput && descriptionInput.value.trim() ? descriptionInput.value.trim() : null,
        };
      } else {
        const source = sourceInput ? sourceInput.value.trim() : '';
        if (!source) {
          setQuickAddMessage('Enter the source of this income.', 'error');
          if (sourceInput) sourceInput.focus();
          return;
        }
        endpoint = '/incomes';
        payload = {
          amount,
          source,
          income_date: date,
          frequency: 'one-time',
          notes: descriptionInput && descriptionInput.value.trim() ? descriptionInput.value.trim() : null,
        };
      }

      quickAddSubmitting = true;
      const submitBtn = quickAddDialog.querySelector('[data-quick-add-submit]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
      }
      setQuickAddMessage('Saving…');

      let result = null;
      try {
        result = await api.post(endpoint, payload, { 'Idempotency-Key': quickAddKey });
      } catch (error) {
        result = null;
      }

      quickAddSubmitting = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save transaction';
      }

      if (result && (result.status === 201 || result.status === 200)) {
        quickAddForm.reset();
        const dateField = quickAddDialog.querySelector('#quick-add-date');
        if (dateField) dateField.value = UI.todayInputValue();
        setQuickAddType('expense');
        quickAddKey = api.newIdempotencyKey();
        setQuickAddMessage('Transaction saved.', 'success');
        quickAddDialog.close();
        UI.showToast(quickAddType === 'expense' ? 'Expense saved' : 'Income saved', 'success');
        // Let the page know a record changed so the visible widgets refresh.
        window.dispatchEvent(new CustomEvent('spendsense:transaction-created', { detail: { type: quickAddType } }));
        await loadDashboard();
        return;
      }

      const message =
        result && result.data && result.data.message
          ? result.data.message
          : 'The transaction could not be saved. Please try again.';
      setQuickAddMessage(message, 'error');
    };

    const submitBtn = quickAddDialog.querySelector('[data-quick-add-submit]');
    if (submitBtn) submitBtn.addEventListener('click', submit);

    quickAddForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    quickAddDialog.addEventListener('close', () => {
      quickAddSubmitting = false;
      // A closed dialog discards the pending key: the next opening starts a
      // new logical transaction.
      quickAddKey = null;
    });
  }

  /* ── Load ────────────────────────────────────────────────────────────── */
  async function loadDashboard() {
    await loadLayout();
    applyLayout();

    setLoading();

    const visible = visibleKeys();
    const wants = (key) => visible.includes(key);

    // Only the widgets the user kept visible are requested, and each request
    // settles on its own so one failure cannot break the page.
    const jobs = [];
    const call = (key, endpoint, handler) => {
      if (!wants(key)) return;
      jobs.push(
        api.get(endpoint).then(
          (result) => handler(result),
          () => handler(null)
        )
      );
    };

    call('summary', '/analytics/cash-flow', (result) => {
      if (result && result.status === 200 && result.data && result.data.data) {
        const data = result.data.data;
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
    });

    call('spending_categories', '/analytics/spending-by-category', renderBreakdown);
    call('cash_flow', '/analytics/month-comparison', renderComparison);
    call('budgets', '/analytics/budget-status', renderBudgets);
    call('recent_transactions', '/expenses', renderTransactions);
    call('savings_goals', '/analytics/savings-progress', renderSavingsWidget);
    call('upcoming_bills', '/analytics/commitments', renderCommitmentsWidget);
    call('spending_insights', '/analytics/spending-insights', renderInsightsWidget);
    call('cash_flow_forecast', '/analytics/cash-flow-forecast?horizon=30', renderForecastWidget);
    call('net_worth', '/net-worth', renderNetWorthWidget);
    call('subscription_renewals', '/subscriptions', renderSubscriptionsWidget);

    const settled = await Promise.allSettled(jobs);
    const okCount = settled.filter((entry) => entry.status === 'fulfilled').length;

    if (!monthResolved) {
      monthLabels.forEach((node) => {
        if (node.textContent === 'Loading…') node.textContent = 'This month';
      });
    }

    return {
      ok: okCount === settled.length,
      any: okCount > 0,
      okCount,
      total: settled.length,
    };
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      const original = refreshButton.textContent;
      refreshButton.disabled = true;
      refreshButton.textContent = 'Refreshing…';
      const result = await loadDashboard();
      refreshButton.disabled = false;
      refreshButton.textContent = original;
      if (result && result.ok) {
        UI.showToast('Dashboard refreshed', 'success');
      } else if (result && result.any) {
        UI.showToast('Some dashboard data could not be refreshed.', 'error');
      } else {
        UI.showToast('Could not refresh the dashboard. Try again.', 'error');
      }
    });
  }

  // A transaction created in the quick-add dialog refreshes the page data.
  window.addEventListener('spendsense:transaction-created', () => {
    loadDashboard();
  });

  loadDashboard();
});
