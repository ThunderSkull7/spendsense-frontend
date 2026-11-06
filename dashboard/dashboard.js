// Dashboard — renders real API data with loading / empty / error states.
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) window.SpendSenseAPI.init(metaBase.content);

  const UI = window.SpendSenseUI;
  const api = window.SpendSenseAPI;
  const money = (value) => UI.formatMoney(value);
  const periodHelper = window.SpendSensePeriod;

  const refreshButton = document.querySelector('[data-refresh]');
  const periodLabels = document.querySelectorAll('[data-period-label]');
  const statEls = {
    income: document.querySelector('[data-stat="income"]'),
    expenses: document.querySelector('[data-stat="expenses"]'),
    net: document.querySelector('[data-stat="net"]'),
    budget: document.querySelector('[data-stat="budget"]'),
  };
  const breakdownEl = document.querySelector('[data-breakdown]');
  const comparisonEl = document.querySelector('[data-comparison]');
  const comparisonSummaryEl = document.querySelector('[data-comparison-summary]');
  const budgetsEl = document.querySelector('[data-budgets]');
  const transactionsEl = document.querySelector('[data-transactions]');
  const monthLabels = document.querySelectorAll('[data-month-label]');

  const barTones = ['', 'teal', 'amber', 'blue', 'rose'];

  const monthName = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const shortMonth = (month, year) =>
    new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short' });

  let monthResolved = false;
  let lastBreakdownResult = null;
  let lastComparisonResult = null;
  let lastBudgetsResult = null;
  let lastExpensesResult = null;
  let lastIncomesResult = null;
  let lastCalendarResult = null;
  let reportingPeriod = periodHelper ? periodHelper.readPeriod() : { month: new Date().getMonth() + 1, year: new Date().getFullYear() };

  const setMonthLabels = (month, year) => {
    monthResolved = true;
    monthLabels.forEach((el) => {
      el.textContent = monthName(month, year);
    });
    if (periodLabels.length) {
      periodLabels.forEach((el) => {
        el.textContent = monthName(month, year);
      });
    }
  };

  const spendPeriodQuery = (endpoint) =>
    periodHelper ? periodHelper.query(endpoint, reportingPeriod) : `${endpoint}?month=${reportingPeriod.month}&year=${reportingPeriod.year}`;

  const renderStat = (el, { value, foot = '', tone = '' }) => {
    if (!el) return;
    el.replaceChildren();
    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value' + (tone ? ' ' + tone : '');
    valueEl.textContent = value;
    const footEl = document.createElement('div');
    footEl.className = 'stat-foot';
    footEl.textContent = foot;
    el.append(valueEl, footEl);
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

  const renderBreakdown = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(breakdownEl, 'error', { message: 'Could not load spending breakdown.', retry: loadDashboard });
      return;
    }
    const payload = result.data.data;
    const items = (payload.breakdown || []).slice().sort((a, b) => b.total_spent - a.total_spent);
    if (payload.month && payload.year) setMonthLabels(payload.month, payload.year);

    if (!items.length) {
      UI.renderState(breakdownEl, 'empty', { message: 'No expenses recorded this month yet.' });
      return;
    }

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

    breakdownEl.replaceChildren(list);
  };

  const renderComparison = (result) => {
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      UI.renderState(comparisonEl, 'error', { message: 'Could not load cash flow comparison.', retry: loadDashboard });
      return;
    }
    const payload = result.data.data;
    const current = payload.current_month || {};
    const previous = payload.previous_month || {};
    const change = payload.change_percentage || {};
    const max = Math.max(current.income || 0, current.expenses || 0, previous.income || 0, previous.expenses || 0, 1);

    if (comparisonSummaryEl) {
      const currentLabel = current.month && current.year ? monthName(current.month, current.year) : 'This month';
      const previousLabel = previous.month && previous.year ? monthName(previous.month, previous.year) : 'Last month';
      comparisonSummaryEl.textContent = `${currentLabel}: income ${money(current.income || 0)}, expenses ${money(current.expenses || 0)}, net cash flow ${money(current.net || 0)}. ${previousLabel}: income ${money(previous.income || 0)}, expenses ${money(previous.expenses || 0)}, net cash flow ${money(previous.net || 0)}.`;
      comparisonSummaryEl.hidden = false;
    }

    comparisonEl.replaceChildren();

    if (typeof change.expenses === 'number') {
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
      '<span class="legend-item"><span class="dot" style="background: var(--success)"></span> Income</span>' +
      '<span class="legend-item"><span class="dot" style="background: var(--warn)"></span> Expenses</span>';
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
      UI.renderState(budgetsEl, 'empty', { message: 'No budgets for this month yet — set one from the Budgets page.' });
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
    budgetsEl.replaceChildren(list);
  };

  const normalizeExpenseRow = (row) => {
    if (!row || typeof row !== 'object') return null;
    const date = String(row.expense_date || row.transaction_date || row.date || '').trim().slice(0, 10);
    const amount = Number(row.amount != null ? row.amount : NaN);
    const category = row.category && typeof row.category === 'object' ? row.category : null;
    const categoryName = category && category.name ? String(category.name).trim() : '';
    const description = String(row.description || '').trim();
    const title = description || categoryName || 'Expense';
    const sub = (date ? UI.formatDate(date) : '') + (description && categoryName ? ' · ' + categoryName : '');
    return {
      type: 'expense',
      id: row.id != null ? row.id : '',
      date,
      created_at: String(row.created_at || ''),
      amount: Number.isFinite(amount) ? amount : 0,
      title,
      sub: sub || (date ? UI.formatDate(date) : ''),
      category,
      categoryName,
    };
  };

  const normalizeIncomeRow = (row) => {
    if (!row || typeof row !== 'object') return null;
    const date = String(row.income_date || row.transaction_date || row.date || '').trim().slice(0, 10);
    const amount = Number(row.amount != null ? row.amount : NaN);
    const source = String(row.source || '').trim();
    const notes = String(row.notes || '').trim();
    const frequency = String(row.frequency || '').trim();
    const title = source || 'Income';
    let extra = '';
    if (notes) {
      extra = ' · ' + notes;
    } else if (frequency && frequency !== 'one-time') {
      extra = ' · ' + frequency;
    }
    const sub = (date ? UI.formatDate(date) : '') + extra;
    return {
      type: 'income',
      id: row.id != null ? row.id : '',
      date,
      created_at: String(row.created_at || ''),
      amount: Number.isFinite(amount) ? amount : 0,
      title,
      sub: sub || (date ? UI.formatDate(date) : ''),
      source,
      category: null,
      categoryName: source || 'Income',
    };
  };

  const extractRows = (result) => {
    if (!result || !result.data) return [];
    const d = result.data.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.data)) return d.data;
    return [];
  };

  const isResultSuccess = (result) =>
    Boolean(result && (result.status === 200 || result.status === 201) && result.data && result.data.success !== false && result.data.data !== undefined);

  const renderTransactions = (expensesRes, incomesRes) => {
    const expenseOk = isResultSuccess(expensesRes);
    const incomeOk = isResultSuccess(incomesRes);

    if (!expenseOk && !incomeOk) {
      UI.renderState(transactionsEl, 'error', { message: 'Could not load recent transactions.', retry: loadDashboard });
      return;
    }

    const rawExpenses = expenseOk ? extractRows(expensesRes) : [];
    const rawIncomes = incomeOk ? extractRows(incomesRes) : [];

    const expenses = rawExpenses.map(normalizeExpenseRow).filter(Boolean);
    const incomes = rawIncomes.map(normalizeIncomeRow).filter(Boolean);

    const combined = [...expenses, ...incomes];

    // Check if both succeeded and no transactions exist
    if (expenseOk && incomeOk && !combined.length) {
      UI.renderState(transactionsEl, 'empty', { message: 'No transactions logged yet. Add your first expense or income to see it here.' });
      return;
    }

    // Stable, deterministic sorting:
    // 1. Transaction date descending
    // 2. Created_at descending (if present and distinct)
    // 3. ID descending (numeric if finite)
    // 4. Deterministic type tie-breaker ('expense' < 'income')
    combined.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date < b.date ? 1 : -1;
      }
      if (a.created_at && b.created_at && a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      const idA = Number(a.id);
      const idB = Number(b.id);
      if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
        return idA < idB ? 1 : -1;
      }
      if (a.type !== b.type) {
        return a.type < b.type ? -1 : 1;
      }
      return 0;
    });

    const container = document.createElement('div');

    // Partial failure notifications: safe and clear user communication
    if (!expenseOk && incomeOk) {
      const notice = document.createElement('div');
      notice.className = 'tx-partial-notice';
      notice.setAttribute('role', 'status');
      notice.style.margin = '8px 12px 10px 12px';
      notice.style.padding = '8px 12px';
      notice.style.borderRadius = 'var(--r-card, 8px)';
      notice.style.background = 'var(--surface-3)';
      notice.style.borderLeft = '3px solid var(--amber, #f59e0b)';
      notice.style.fontSize = '0.8rem';
      notice.style.color = 'var(--ink-2)';

      const pill = document.createElement('span');
      pill.className = 'pill amber';
      pill.style.fontSize = '0.68rem';
      pill.style.padding = '1px 6px';
      pill.style.marginRight = '6px';
      pill.textContent = 'Notice';

      notice.append(pill, document.createTextNode('Could not load recent expense transactions. Displaying income only.'));
      container.appendChild(notice);

      if (!incomes.length) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.padding = '16px';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = 'var(--muted)';
        emptyMsg.style.fontSize = '0.88rem';
        emptyMsg.textContent = 'No income records found.';
        container.appendChild(emptyMsg);
        transactionsEl.replaceChildren(container);
        return;
      }
    } else if (expenseOk && !incomeOk) {
      const notice = document.createElement('div');
      notice.className = 'tx-partial-notice';
      notice.setAttribute('role', 'status');
      notice.style.margin = '8px 12px 10px 12px';
      notice.style.padding = '8px 12px';
      notice.style.borderRadius = 'var(--r-card, 8px)';
      notice.style.background = 'var(--surface-3)';
      notice.style.borderLeft = '3px solid var(--amber, #f59e0b)';
      notice.style.fontSize = '0.8rem';
      notice.style.color = 'var(--ink-2)';

      const pill = document.createElement('span');
      pill.className = 'pill amber';
      pill.style.fontSize = '0.68rem';
      pill.style.padding = '1px 6px';
      pill.style.marginRight = '6px';
      pill.textContent = 'Notice';

      notice.append(pill, document.createTextNode('Could not load recent income transactions. Displaying expenses only.'));
      container.appendChild(notice);

      if (!expenses.length) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.padding = '16px';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = 'var(--muted)';
        emptyMsg.style.fontSize = '0.88rem';
        emptyMsg.textContent = 'No expense records found.';
        container.appendChild(emptyMsg);
        transactionsEl.replaceChildren(container);
        return;
      }
    }

    const list = document.createElement('div');
    list.className = 'tx-list';

    combined.slice(0, 6).forEach((row) => {
      const wrap = document.createElement('div');
      wrap.className = 'tx-row';
      wrap.dataset.txType = row.type;
      if (row.id) wrap.dataset.txId = String(row.id);

      const ico = document.createElement('span');
      ico.className = 'tx-ico';

      if (row.type === 'income') {
        ico.style.backgroundColor = 'var(--primary-100, rgba(13, 148, 136, 0.12))';
        ico.style.color = 'var(--primary, #0D9488)';
        ico.style.borderColor = 'rgba(13, 148, 136, 0.28)';
        ico.textContent = (row.source || 'I').charAt(0).toUpperCase();
        ico.title = 'Income: ' + (row.source || 'Income');
      } else {
        const tone = window.SpendSenseSettings && typeof window.SpendSenseSettings.getCategoryTone === 'function'
          ? window.SpendSenseSettings.getCategoryTone(row.category)
          : { color: 'var(--ink)' };
        ico.style.backgroundColor = tone.bgSubtle || ((tone.color || '#0D9488') + '18');
        ico.style.color = tone.color || 'var(--ink)';
        ico.style.borderColor = tone.borderSubtle || ((tone.color || '#0D9488') + '38');
        ico.textContent = (row.category && row.category.name ? row.category.name : 'E').charAt(0).toUpperCase();
        ico.title = 'Expense: ' + (row.category && row.category.name ? row.category.name : 'Expense');
      }

      const main = document.createElement('div');
      main.className = 'tx-main';

      const title = document.createElement('div');
      title.className = 'tx-title';
      title.textContent = row.title;

      const sub = document.createElement('div');
      sub.className = 'tx-sub';
      const typeLabel = row.type === 'income' ? 'Income' : 'Expense';
      const dateLabel = row.date ? UI.formatDate(row.date) : '';
      const catLabel = row.categoryName && row.categoryName !== row.title ? row.categoryName : '';
      const parts = [dateLabel, typeLabel, catLabel].filter(Boolean);
      sub.textContent = parts.join(' · ');
      main.append(title, sub);

      const amount = document.createElement('span');
      if (row.type === 'income') {
        amount.className = 'tx-amt amount-pos';
        amount.textContent = '+' + money(row.amount);
      } else {
        amount.className = 'tx-amt amount-neg';
        amount.textContent = '-' + money(row.amount);
      }

      wrap.append(ico, main, amount);
      list.appendChild(wrap);
    });

    container.appendChild(list);
    transactionsEl.replaceChildren(container);
  };

  const upcomingBillsEl = document.querySelector('[data-upcoming-bills]');
  const goalsEl = document.querySelector('[data-goals-summary]');
  let lastGoalsResult = null;

  function renderGoalsSummary(result) {
    if (!goalsEl) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      goalsEl.innerHTML = '<p class="card-sub" style="padding: 12px 16px; margin: 0;">No financial goals active.</p>';
      return;
    }

    const payload = result.data.data;
    const goals = payload.goals || [];
    const activeGoals = goals.filter((g) => g.status === 'active');

    if (activeGoals.length === 0) {
      goalsEl.innerHTML = '<p class="card-sub" style="padding: 12px 16px; margin: 0;">No active goals. <a href="../budget-planning/budget.html?tab=goals">Create a goal</a> to track savings.</p>';
      return;
    }

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.padding = '10px 16px';

    activeGoals.slice(0, 3).forEach((g) => {
      const item = document.createElement('div');
      const pct = Math.min(100, Math.max(0, parseFloat(g.progress_percent) || 0));

      item.innerHTML = '<div style="display: flex; justify-content: space-between; font-size: 0.84rem; font-weight: 600; margin-bottom: 3px;">' +
        '<span>' + (g.name || 'Goal') + '</span>' +
        '<span style="color: var(--teal);">' + money(g.saved_amount) + ' / ' + money(g.target_amount) + '</span>' +
      '</div>' +
      '<div class="progress-bar-wrap" style="height: 6px; background: var(--surface-3); border-radius: 3px; overflow: hidden;">' +
        '<div style="height: 100%; width: ' + pct + '%; background: var(--teal); border-radius: 3px; transition: width 0.3s ease;"></div>' +
      '</div>';

      container.appendChild(item);
    });

    goalsEl.innerHTML = '';
    goalsEl.appendChild(container);
  }

  function renderUpcomingBills(result) {
    if (!upcomingBillsEl) return;
    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      upcomingBillsEl.innerHTML = '<p class="card-sub" style="padding: 12px 16px; margin: 0;">No upcoming bills scheduled.</p>';
      return;
    }

    const data = result.data.data;
    const upcoming = data.upcoming || [];
    const overdue = data.overdue || [];
    const combined = [...overdue, ...upcoming].slice(0, 5);

    if (combined.length === 0) {
      upcomingBillsEl.innerHTML = '<p class="card-sub" style="padding: 12px 16px; margin: 0;">No bills due in the next 30 days. <a href="../expense-management/expenses.html#recurring">Add recurring bills</a></p>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'tx-list';
    combined.forEach((occ) => {
      const row = document.createElement('div');
      row.className = 'tx-row';
      const left = document.createElement('div');
      const desc = document.createElement('div');
      desc.className = 'tx-desc';
      desc.textContent = occ.schedule ? occ.schedule.description : 'Recurring Bill';
      const meta = document.createElement('div');
      meta.className = 'tx-meta';
      const cat = occ.schedule && occ.schedule.category ? occ.schedule.category.name : 'Bill';
      meta.textContent = `${cat} • Due ${occ.occurrence_date}`;
      left.append(desc, meta);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '8px';
      right.style.marginLeft = 'auto';

      const amt = document.createElement('div');
      amt.className = 'tx-amt neg';
      amt.textContent = money(occ.expected_amount);

      if (occ.is_overdue) {
        const badge = document.createElement('span');
        badge.className = 'pill danger';
        badge.textContent = 'Overdue';
        right.appendChild(badge);
      } else if (occ.is_due) {
        const badge = document.createElement('span');
        badge.className = 'pill teal';
        badge.textContent = 'Due Today';
        right.appendChild(badge);
      }

      right.appendChild(amt);
      row.append(left, right);
      list.appendChild(row);
    });

    upcomingBillsEl.innerHTML = '';
    upcomingBillsEl.appendChild(list);
  }

  async function loadDashboard() {
    setLoading();

    const [cashFlow, breakdown, comparison, budgetStatus, expensesSettled, incomesSettled, calendarSettled, goalsSettled] = await Promise.allSettled([
      api.get(spendPeriodQuery('/analytics/cash-flow')),
      api.get(spendPeriodQuery('/analytics/spending-by-category')),
      api.get(spendPeriodQuery('/analytics/month-comparison')),
      api.get(spendPeriodQuery('/analytics/budget-status')),
      api.get('/expenses'),
      api.get('/incomes'),
      api.get('/recurring-expenses/calendar'),
      api.get('/savings-goals'),
    ]);

    // --- Stat cards + month label from cash flow ---
    const cf = cashFlow.status === 'fulfilled' ? cashFlow.value : null;
    if (cf && cf.status === 200 && cf.data && cf.data.data) {
      const data = cf.data.data;
      setMonthLabels(data.month, data.year);
      const periodLabel = data.month && data.year ? monthName(data.month, data.year) : 'This month';
      renderStat(statEls.income, { value: money(data.total_income), foot: `Total logged income for ${periodLabel}` });
      renderStat(statEls.expenses, { value: money(data.total_expenses), foot: `Total logged spending for ${periodLabel}` });
      renderStat(statEls.net, {
        value: money(data.net_cash_flow),
        tone: data.net_cash_flow > 0 ? 'pos' : data.net_cash_flow < 0 ? 'neg' : '',
        foot: `Income minus expenses for ${periodLabel}`,
      });
    } else {
      renderStatError(statEls.income);
      renderStatError(statEls.expenses);
      renderStatError(statEls.net);
    }

    lastBreakdownResult = breakdown.status === 'fulfilled' ? breakdown.value : null;
    lastComparisonResult = comparison.status === 'fulfilled' ? comparison.value : null;
    lastBudgetsResult = budgetStatus.status === 'fulfilled' ? budgetStatus.value : null;
    lastExpensesResult = expensesSettled.status === 'fulfilled' ? expensesSettled.value : null;
    lastIncomesResult = incomesSettled.status === 'fulfilled' ? incomesSettled.value : null;
    lastCalendarResult = calendarSettled.status === 'fulfilled' ? calendarSettled.value : null;
    lastGoalsResult = goalsSettled.status === 'fulfilled' ? goalsSettled.value : null;

    renderBreakdown(lastBreakdownResult);
    renderComparison(lastComparisonResult);
    renderBudgets(lastBudgetsResult);
    renderTransactions(lastExpensesResult, lastIncomesResult);
    renderUpcomingBills(lastCalendarResult);
    renderGoalsSummary(lastGoalsResult);

    if (!monthResolved) {
      monthLabels.forEach((el) => {
        if (el.textContent === 'Loading…') el.textContent = 'This month';
      });
    }
  }

  window.addEventListener('spendsense:theme-change', () => {
    if (lastBreakdownResult) renderBreakdown(lastBreakdownResult);
    if (lastComparisonResult) renderComparison(lastComparisonResult);
    if (lastBudgetsResult) renderBudgets(lastBudgetsResult);
    if (lastExpensesResult || lastIncomesResult) renderTransactions(lastExpensesResult, lastIncomesResult);
    if (lastCalendarResult) renderUpcomingBills(lastCalendarResult);
  });

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
