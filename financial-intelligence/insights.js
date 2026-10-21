/*
 * Spending insights view. All values come from the owner-scoped API; this
 * module only formats and renders them. It never creates or edits financial
 * records, and it never treats recurring expectations as actual spending.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI || !window.SpendSenseIntelligence) return;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;
  const H = window.SpendSenseIntelligence;
  const meta = document.querySelector('meta[name="api-base-url"]');
  if (meta) API.init(meta.content);

  const money = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);
  const signedMoney = (value) => {
    const number = Number(value) || 0;
    return `${number > 0 ? '+' : ''}${money(number)}`;
  };

  const dom = {
    form: document.querySelector('[data-insights-form]'),
    from: document.querySelector('#insights-from'),
    to: document.querySelector('#insights-to'),
    preset: document.querySelector('[data-insights-preset]'),
    message: document.querySelector('[data-insights-message]'),
    pageState: document.querySelector('[data-insights-page-state]'),
    content: document.querySelector('[data-insights-content]'),
    periodLabel: document.querySelector('[data-insight-period-label]'),
    income: document.querySelector('[data-insight="income"]'),
    incomeNote: document.querySelector('[data-insight="income-note"]'),
    expenses: document.querySelector('[data-insight="expenses"]'),
    expensesNote: document.querySelector('[data-insight="expenses-note"]'),
    net: document.querySelector('[data-insight="net"]'),
    netNote: document.querySelector('[data-insight="net-note"]'),
    average: document.querySelector('[data-insight="average"]'),
    averageNote: document.querySelector('[data-insight="average-note"]'),
    categoryCount: document.querySelector('[data-insight="category-count"]'),
    categories: document.querySelector('[data-insight-categories]'),
    categoriesEmpty: document.querySelector('[data-insight-categories-empty]'),
    categoryRows: document.querySelector('[data-insight-category-rows]'),
    largestCategory: document.querySelector('[data-insight-largest-category]'),
    comparison: document.querySelector('[data-insight-comparison]'),
    comparisonNote: document.querySelector('[data-insight-comparison-note]'),
    monthRows: document.querySelector('[data-insight-month-rows]'),
    monthBars: document.querySelector('[data-insight-month-bars]'),
    monthsEmpty: document.querySelector('[data-insight-months-empty]'),
    monthDetailRows: document.querySelector('[data-insight-month-detail-rows]'),
    anomalyPill: document.querySelector('[data-insight-anomaly-pill]'),
    anomalyRule: document.querySelector('[data-insight-anomaly-rule]'),
    anomalyRows: document.querySelector('[data-insight-anomaly-rows]'),
    anomalyReason: document.querySelector('[data-insight-anomaly-reason]'),
    largestRows: document.querySelector('[data-insight-largest-rows]'),
    largestEmpty: document.querySelector('[data-insight-largest-empty]'),
    budgetLatest: document.querySelector('[data-insight-budget-latest]'),
    budgetSummary: document.querySelector('[data-insight-budget-summary]'),
    budgetItems: document.querySelector('[data-insight-budget-items]'),
    budgetEmpty: document.querySelector('[data-insight-budget-empty]'),
    budgetNote: document.querySelector('[data-insight-budget-note]'),
    recurringSummary: document.querySelector('[data-insight-recurring-summary]'),
    recurringNote: document.querySelector('[data-insight-recurring-note]'),
    subscriptionSummary: document.querySelector('[data-insight-subscription-summary]'),
    subscriptionNote: document.querySelector('[data-insight-subscription-note]'),
    notes: document.querySelector('[data-insight-notes]'),
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const setText = (node, value) => {
    if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
  };

  const setMessage = (text, type = '') => {
    if (!dom.message) return;
    dom.message.textContent = text || '';
    dom.message.classList.remove('error', 'success');
    if (type) dom.message.classList.add(type);
  };

  const tbodyRows = (body, rows, columns, emptyMessage = 'No rows for this period.') => {
    if (!body) return;
    body.replaceChildren();
    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'cell-sub', emptyMessage);
      td.colSpan = columns;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = el('tr');
      row.forEach((cell, index) => {
        const td = el('td', index > 0 ? 'num' : '');
        if (cell && typeof cell === 'object' && cell.text !== undefined) {
          td.textContent = cell.text;
          if (cell.className) td.className = cell.className;
        } else {
          td.textContent = cell === null || cell === undefined ? '—' : String(cell);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  };

  const barRow = (name, value, width, colorClass, note = '') => {
    const row = el('div', 'viz-row');
    const meta = el('div', 'viz-meta');
    const label = el('span', 'viz-name');
    const dot = el('span', `dot ${colorClass || ''}`.trim());
    label.append(dot, document.createTextNode(name));
    const amount = el('strong', '', `${money(value)}${note ? ` · ${note}` : ''}`);
    meta.append(label, amount);
    const track = el('div', 'viz-track');
    const fill = el('span', `viz-fill ${colorClass || ''}`.trim());
    fill.style.width = `${H.progressPercent(width)}%`;
    track.appendChild(fill);
    row.append(meta, track);
    return row;
  };

  const metric = (label, value, note = '') => {
    const box = el('div', 'metric-mini');
    box.append(el('span', '', label), el('strong', '', value));
    if (note) box.appendChild(el('div', 'action-note', note));
    return box;
  };

  const toneValue = (node, value, { inverse = false } = {}) => {
    if (!node) return;
    node.classList.remove('pos', 'neg');
    const tone = H.changeTone(value, { inverse });
    if (tone !== 'neutral') node.classList.add(tone);
  };

  const renderSummary = (data) => {
    const s = data.summary || {};
    setText(dom.income, money(s.total_income));
    setText(dom.incomeNote, `${s.income_count || 0} actual income record${s.income_count === 1 ? '' : 's'}`);
    setText(dom.expenses, money(s.total_expenses));
    setText(dom.expensesNote, `${s.expense_count || 0} actual expense record${s.expense_count === 1 ? '' : 's'}`);
    setText(dom.net, signedMoney(s.net_cash_flow));
    toneValue(dom.net, s.net_cash_flow);
    setText(dom.netNote, 'Income minus expenses');
    setText(dom.average, money(s.average_monthly_expenses));
    setText(dom.averageNote, `Across ${data.period?.month_count || 0} selected month${data.period?.month_count === 1 ? '' : 's'}`);
    setText(dom.categoryCount, `${(data.categories || []).length} categories`);
    setText(dom.periodLabel, `${H.monthLabel(data.period?.from)} to ${H.monthLabel(data.period?.to)} · UTC calendar months`);
  };

  const renderCategories = (data) => {
    const items = Array.isArray(data.categories) ? data.categories : [];
    dom.categories.replaceChildren();
    dom.categoryRows.replaceChildren();
    dom.categoriesEmpty.hidden = items.length > 0;

    const max = items.reduce((highest, item) => Math.max(highest, Number(item.total_spent) || 0), 0) || 1;
    const colors = ['blue', 'teal', 'amber', 'danger'];
    const rows = [];

    items.forEach((item, index) => {
      const share = H.formatPercent(item.share_percent, '0%');
      dom.categories.appendChild(
        barRow(item.category_name, item.total_spent, ((Number(item.total_spent) || 0) / max) * 100, colors[index % colors.length], share)
      );
      rows.push([
        item.category_name,
        money(item.total_spent),
        share,
        item.transaction_count,
        money(item.average_transaction),
      ]);
    });

    tbodyRows(dom.categoryRows, rows, 5, 'No category spending in this period.');

    const top = data.summary?.largest_category;
    if (!top) {
      dom.largestCategory.replaceChildren(el('div', 'empty-inline', 'No expense category has data for this period.'));
      return;
    }
    dom.largestCategory.replaceChildren();
    const wrap = el('div');
    wrap.append(el('span', 'kpi-label', 'Top category by actual spend'));
    const title = el('div', 'stat-value text-value', top.category_name);
    title.style.marginTop = '6px';
    wrap.append(title);
    wrap.append(el('div', 'action-note', `${money(top.total_spent)} across ${top.transaction_count} transaction${top.transaction_count === 1 ? '' : 's'} · ${H.formatPercent(top.share_percent, '0%')} of selected spending`));
    dom.largestCategory.append(wrap);
  };

  const renderComparison = (data) => {
    const comparison = data.comparison || {};
    const current = comparison.current || {};
    const previous = comparison.previous || {};
    dom.comparison.replaceChildren();

    [['Current month', current], ['Previous month', previous]].forEach(([label, row]) => {
      const card = el('div', 'comparison-card');
      card.append(el('span', 'comparison-label', `${label} · ${H.monthLabel(row.month)}`));
      const values = [
        ['Income', money(row.income)],
        ['Expenses', money(row.expenses)],
        ['Net', signedMoney(row.net)],
      ];
      values.forEach(([key, value]) => {
        const line = el('div', 'comparison-row');
        line.append(el('span', '', key), el('strong', '', value));
        card.appendChild(line);
      });
      dom.comparison.appendChild(card);
    });

    const expenseChange = comparison.expense_change_percent;
    const incomeChange = comparison.income_change_percent;
    const describe = (value, label, inverse = false) => {
      if (value === null || value === undefined) return `${label}: no prior-month baseline`;
      const direction = Number(value) >= 0 ? 'up' : 'down';
      return `${label} ${direction} ${H.formatPercent(Math.abs(Number(value)), '0%')}`;
    };
    const expenseTone = expenseChange === null || expenseChange === undefined
      ? ''
      : (Number(expenseChange) > 0 ? 'warn' : '');
    dom.comparisonNote.className = `callout ${expenseTone}`.trim();
    dom.comparisonNote.textContent = `${describe(expenseChange, 'Expenses', true)}; ${describe(incomeChange, 'Income')}. Percentages are omitted when the prior month is zero.`;
    if (expenseTone) dom.comparisonNote.setAttribute('aria-label', `Expenses increased: ${dom.comparisonNote.textContent}`);
    else dom.comparisonNote.removeAttribute('aria-label');

    tbodyRows(dom.monthRows, (data.months || []).map((row) => [
      H.monthLabel(row.month),
      money(row.income),
      money(row.expenses),
      signedMoney(row.net),
    ]), 4);
  };

  const renderMonths = (data) => {
    const months = Array.isArray(data.months) ? data.months : [];
    dom.monthBars.replaceChildren();
    const max = months.reduce((highest, month) => Math.max(highest, Number(month.income) || 0, Number(month.expenses) || 0), 0) || 1;
    const hasAny = months.some((month) => Number(month.income) !== 0 || Number(month.expenses) !== 0);
    dom.monthsEmpty.hidden = hasAny;

    months.forEach((month) => {
      const wrapper = el('div', 'intel-stack');
      wrapper.style.gap = '7px';
      wrapper.appendChild(barRow(`${H.monthLabel(month.month)} income`, month.income, ((Number(month.income) || 0) / max) * 100, 'income'));
      wrapper.appendChild(barRow(`${H.monthLabel(month.month)} expenses`, month.expenses, ((Number(month.expenses) || 0) / max) * 100, 'expense'));
      dom.monthBars.appendChild(wrapper);
    });

    tbodyRows(dom.monthDetailRows, months.map((month) => [
      H.monthLabel(month.month),
      money(month.income),
      money(month.expenses),
      signedMoney(month.net),
      month.is_in_progress ? 'Current month' : 'Complete month',
    ]), 5);
  };

  const renderAnomalies = (data) => {
    const anomalies = data.anomalies || {};
    const transactions = Array.isArray(anomalies.transactions) ? anomalies.transactions : [];
    setText(dom.anomalyPill, anomalies.eligible ? `${transactions.length} flagged` : 'Not enough data');
    dom.anomalyRule.textContent = `${anomalies.rule}. Threshold: ${money(anomalies.threshold_amount)}. Requires at least ${anomalies.minimum_expenses || 5} expenses in the selected period.`;
    dom.anomalyReason.textContent = anomalies.reason || (transactions.length ? 'Review the largest transactions against your own expectations. This screen is descriptive only.' : '');
    tbodyRows(dom.anomalyRows, transactions.map((item) => [
      { text: H.dateLabel(item.expense_date), className: '' },
      { text: item.description || 'Expense', className: '' },
      { text: item.category_name || 'Uncategorised', className: '' },
      { text: money(item.amount), className: 'num' },
    ]), 4, anomalies.eligible ? 'No transaction crossed the documented threshold.' : 'At least five expenses are needed before this screen is calculated.');
  };

  const renderLargest = (data) => {
    const items = Array.isArray(data.largest_transactions) ? data.largest_transactions : [];
    dom.largestEmpty.hidden = items.length > 0;
    tbodyRows(dom.largestRows, items.map((item) => [
      { text: H.dateLabel(item.expense_date), className: '' },
      { text: item.description || 'Expense', className: '' },
      { text: item.category_name || 'Uncategorised', className: '' },
      { text: money(item.amount), className: 'num' },
    ]), 4, 'No expense transactions to rank yet.');
  };

  const renderBudgets = (data) => {
    const budget = data.budget_utilization || {};
    const summary = budget.summary || {};
    const items = Array.isArray(budget.items) ? budget.items : [];
    setText(dom.budgetLatest, budget.latest_month ? H.monthLabel(budget.latest_month) : 'No budgets');
    dom.budgetSummary.replaceChildren(
      metric('Budgeted', money(summary.total_limit), `${summary.budget_count || 0} categories`),
      metric('Spent in budget', money(summary.total_spent), 'Budgeted categories only'),
      metric('Utilisation', H.formatPercent(summary.utilization_percent, '0%'), `${summary.overspent_count || 0} overspent`)
    );
    dom.budgetItems.replaceChildren();
    dom.budgetEmpty.hidden = items.length > 0;
    items.forEach((item) => {
      const percent = Number(item.percentage_used) || 0;
      const row = barRow(
        item.category_name || 'Category',
        item.spent_amount,
        percent,
        percent > 100 ? 'danger' : percent >= 80 ? 'amber' : '',
        `${H.formatPercent(percent, '0%')} of ${money(item.limit_amount)}`
      );
      dom.budgetItems.appendChild(row);
    });
    dom.budgetNote.textContent = budget.note || '';
  };

  const renderExpectations = (data) => {
    const recurring = data.recurring_expenses || {};
    dom.recurringSummary.replaceChildren(
      metric('Active schedules', recurring.active_count || 0),
      metric('Monthly estimate', money(recurring.estimated_monthly_cost)),
      metric('Next 30 days', money(recurring.upcoming_30_days_amount), `${recurring.upcoming_30_days_count || 0} occurrences`)
    );
    dom.recurringNote.textContent = recurring.note || 'Expectations are not actual transactions.';

    const subscriptions = data.subscriptions || {};
    dom.subscriptionSummary.replaceChildren(
      metric('Active trackers', subscriptions.active_count || 0, `${subscriptions.linked_count || 0} linked`),
      metric('Monthly estimate', money(subscriptions.estimated_monthly_cost)),
      metric('Annual estimate', money(subscriptions.estimated_annual_cost))
    );
    dom.subscriptionNote.textContent = 'Subscription estimates are a separate planning summary and are not added to actual spending.';
  };

  const renderNotes = (notes) => {
    dom.notes.replaceChildren();
    (Array.isArray(notes) ? notes : []).forEach((note) => {
      if (typeof note === 'string' && note.trim()) dom.notes.appendChild(el('li', '', note));
    });
  };

  const render = (data) => {
    renderSummary(data);
    renderCategories(data);
    renderComparison(data);
    renderMonths(data);
    renderAnomalies(data);
    renderLargest(data);
    renderBudgets(data);
    renderExpectations(data);
    renderNotes(data.notes);
  };

  const stateOptions = (message, retry) => ({ message, retry });

  const load = async () => {
    const from = dom.from.value;
    const to = dom.to.value;
    if (!H.dateRangeIsValid(from, to)) {
      setMessage('Choose valid months with the start month on or before the end month.', 'error');
      return;
    }
    if (H.rangeMonthCount(from, to) > 24) {
      setMessage('Choose no more than 24 calendar months.', 'error');
      return;
    }

    setMessage('');
    dom.content.hidden = true;
    dom.pageState.hidden = false;
    UI.renderState(dom.pageState, 'loading', { message: 'Loading spending insights…' });
    dom.form.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });

    let result;
    try {
      result = await API.get(`/analytics/spending-insights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    } catch (error) {
      result = null;
    } finally {
      dom.form.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
    }

    if (!result || result.status !== 200 || !result.data || result.data.success !== true || !result.data.data) {
      UI.renderState(dom.pageState, 'error', stateOptions(H.errorMessage(result, 'Could not load spending insights.'), load));
      return;
    }

    dom.pageState.hidden = true;
    dom.content.hidden = false;
    render(result.data.data);
  };

  const setPreset = () => {
    const now = H.monthInputValue();
    dom.to.value = now;
    dom.from.value = H.addMonths(now, -5);
    setMessage('');
  };

  if (dom.form) {
    dom.form.addEventListener('submit', (event) => {
      event.preventDefault();
      load();
    });
  }
  if (dom.preset) dom.preset.addEventListener('click', setPreset);
  if (dom.from) dom.from.addEventListener('change', () => setMessage(''));
  if (dom.to) dom.to.addEventListener('change', () => setMessage(''));

  setPreset();
  load();
});
