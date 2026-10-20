/*
 * Schedule-based cash-flow forecast. Read-only: the API projects materialized
 * planned occurrences and never writes a transaction or changes a schedule.
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
    form: document.querySelector('[data-forecast-form]'),
    asOf: document.querySelector('#forecast-as-of'),
    horizon: document.querySelector('[data-forecast-horizon]'),
    message: document.querySelector('[data-forecast-message]'),
    pageState: document.querySelector('[data-forecast-page-state]'),
    content: document.querySelector('[data-forecast-content]'),
    income: document.querySelector('[data-forecast="income"]'),
    incomeCount: document.querySelector('[data-forecast="income-count"]'),
    expenses: document.querySelector('[data-forecast="expenses"]'),
    expenseCount: document.querySelector('[data-forecast="expense-count"]'),
    net: document.querySelector('[data-forecast="net"]'),
    balance: document.querySelector('[data-forecast="balance"]'),
    balanceNote: document.querySelector('[data-forecast="balance-note"]'),
    balanceReason: document.querySelector('[data-forecast-balance-reason]'),
    negativeStatus: document.querySelector('[data-forecast="negative-status"]'),
    eventCount: document.querySelector('[data-forecast="event-count"]'),
    windowDays: document.querySelector('[data-forecast="window-days"]'),
    negativeReason: document.querySelector('[data-forecast-negative-reason]'),
    window: document.querySelector('[data-forecast-window]'),
    horizonPill: document.querySelector('[data-forecast-horizon-pill]'),
    monthBars: document.querySelector('[data-forecast-month-bars]'),
    monthEmpty: document.querySelector('[data-forecast-month-empty]'),
    monthRows: document.querySelector('[data-forecast-month-rows]'),
    history: document.querySelector('[data-forecast-history]'),
    historyNote: document.querySelector('[data-forecast-history-note]'),
    overdue: document.querySelector('[data-forecast-overdue]'),
    eventRows: document.querySelector('[data-forecast-event-rows]'),
    eventNote: document.querySelector('[data-forecast-event-note]'),
    eventEmpty: document.querySelector('[data-forecast-event-empty]'),
    upcoming: document.querySelector('[data-forecast-upcoming]'),
    upcomingEmpty: document.querySelector('[data-forecast-upcoming-empty]'),
    scheduleCounts: document.querySelector('[data-forecast-schedule-counts]'),
    subscriptionNote: document.querySelector('[data-forecast-subscription-note]'),
    notes: document.querySelector('[data-forecast-notes]'),
  };

  let horizon = 30;

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

  const rows = (body, values, columns, emptyText = 'No rows for this window.') => {
    if (!body) return;
    body.replaceChildren();
    if (!values.length) {
      const tr = el('tr');
      const td = el('td', 'cell-sub', emptyText);
      td.colSpan = columns;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    values.forEach((valueRow) => {
      const tr = el('tr');
      valueRow.forEach((cell, index) => {
        const td = el('td', index > 0 ? 'num' : '');
        if (cell && typeof cell === 'object' && cell.text !== undefined) {
          td.textContent = String(cell.text);
          if (cell.className) td.className = cell.className;
        } else {
          td.textContent = cell === null || cell === undefined ? '—' : String(cell);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  };

  const metric = (label, value, note = '') => {
    const box = el('div', 'metric-mini');
    box.append(el('span', '', label), el('strong', '', value));
    if (note) box.appendChild(el('div', 'action-note', note));
    return box;
  };

  const bar = (name, value, width, tone) => {
    const row = el('div', 'viz-row');
    const meta = el('div', 'viz-meta');
    const label = el('span', 'viz-name');
    label.append(el('span', `dot ${tone}`), document.createTextNode(name));
    meta.append(label, el('strong', '', money(value)));
    const track = el('div', 'viz-track');
    const fill = el('span', `viz-fill ${tone}`);
    fill.style.width = `${H.progressPercent(width)}%`;
    track.appendChild(fill);
    row.append(meta, track);
    return row;
  };

  const renderSummary = (data) => {
    setText(dom.income, money(data.expected_income));
    setText(dom.incomeCount, `${data.expected_income_count || 0} planned occurrence${data.expected_income_count === 1 ? '' : 's'}`);
    setText(dom.expenses, money(data.expected_expenses));
    setText(dom.expenseCount, `${data.expected_expense_count || 0} planned occurrence${data.expected_expense_count === 1 ? '' : 's'}`);
    setText(dom.net, signedMoney(data.projected_net_cash_flow));
    dom.net.classList.remove('pos', 'neg');
    const tone = H.changeTone(data.projected_net_cash_flow);
    if (tone !== 'neutral') dom.net.classList.add(tone);
    setText(dom.balance, 'Not available');
    dom.balance.classList.remove('pos', 'neg');
    setText(dom.balanceNote, 'No verified opening cash balance is stored');
    setText(dom.negativeStatus, H.forecastBalanceLabel(data.negative_cash_flow_status));
    setText(dom.eventCount, data.events_truncated ? `${data.event_count}+` : data.event_count);
    setText(dom.windowDays, `${data.horizon_days} UTC days`);
    setText(dom.window, `${H.dateLabel(data.window?.start)} through ${H.dateLabel(data.window?.end)} · ${data.window?.boundary || 'Inclusive UTC calendar days'}`);
    setText(dom.horizonPill, `${data.horizon_days}-day horizon`);
    dom.balanceReason.textContent = data.starting_balance_reason || data.ending_balance_reason || 'A trustworthy opening balance is unavailable, so no ending balance can be calculated.';
    dom.negativeReason.textContent = data.negative_cash_flow_reason || '';
  };

  const renderMonths = (data) => {
    const months = Array.isArray(data.monthly_projection) ? data.monthly_projection : [];
    const max = months.reduce((highest, month) => Math.max(highest, Number(month.expected_income) || 0, Number(month.expected_expenses) || 0), 0) || 1;
    const hasAny = months.some((month) => Number(month.expected_income) !== 0 || Number(month.expected_expenses) !== 0);
    dom.monthEmpty.hidden = hasAny;
    dom.monthBars.replaceChildren();
    months.forEach((month) => {
      const group = el('div', 'intel-stack');
      group.style.gap = '7px';
      group.appendChild(bar(`${H.monthLabel(month.month)} income`, month.expected_income, ((Number(month.expected_income) || 0) / max) * 100, 'income'));
      group.appendChild(bar(`${H.monthLabel(month.month)} expenses`, month.expected_expenses, ((Number(month.expected_expenses) || 0) / max) * 100, 'expense'));
      dom.monthBars.appendChild(group);
    });
    rows(dom.monthRows, months.map((month) => [
      H.monthLabel(month.month),
      money(month.expected_income),
      money(month.expected_expenses),
      signedMoney(month.projected_net_cash_flow),
      month.is_partial ? 'Partial month' : 'Full month',
    ]), 5);
  };

  const renderHistory = (data) => {
    const history = data.historical_actuals || {};
    dom.history.replaceChildren(
      metric('Average income', money(history.average_monthly_income), `${history.months || 3} completed months`),
      metric('Average expenses', money(history.average_monthly_expenses), 'Actual ledger values'),
      metric('Context window', `${H.dateLabel(history.from)} – ${H.dateLabel(history.to)}`)
    );
    dom.historyNote.textContent = history.note || 'Historical averages are context only and are never added to expected totals.';
  };

  const renderOverdue = (data) => {
    const overdue = data.overdue_commitments || {};
    const count = Number(overdue.count) || 0;
    dom.overdue.hidden = count === 0;
    if (count > 0) {
      dom.overdue.textContent = `${count} planned bill${count === 1 ? '' : 's'} dated before this window total ${money(overdue.total)}. They are shown for awareness but are not re-dated or added to the forecast.`;
    }
  };

  const renderEvents = (data) => {
    const events = Array.isArray(data.events) ? data.events : [];
    dom.eventEmpty.hidden = events.length > 0;
    rows(dom.eventRows, events.map((event) => [
      { text: H.dateLabel(event.date), className: '' },
      { text: event.type === 'income' ? 'Expected income' : 'Expected expense', className: '' },
      { text: event.name || 'Scheduled item', className: '' },
      { text: event.category?.name || (event.type === 'income' ? 'Income' : 'Uncategorised'), className: '' },
      { text: money(event.amount), className: 'num' },
    ]), 5);
    dom.eventNote.textContent = data.events_truncated
      ? `Showing the first 200 of ${data.event_count} planned events. Use the Bills page for the complete schedule.`
      : 'Expected values remain plans until they are paid or received; those actions are not performed by this page.';
  };

  const renderUpcoming = (data) => {
    const bills = Array.isArray(data.upcoming_bills) ? data.upcoming_bills : [];
    dom.upcomingEmpty.hidden = bills.length > 0;
    dom.upcoming.replaceChildren();
    bills.forEach((bill) => {
      const row = el('div', 'timeline-row expense');
      row.append(
        el('span', 'timeline-date', H.dateLabel(bill.date)),
        (() => {
          const wrap = el('div', 'timeline-name');
          wrap.append(el('strong', '', bill.name || 'Expected bill'));
          wrap.append(el('div', 'timeline-sub', bill.category?.name || 'Uncategorised'));
          return wrap;
        })(),
        el('span', 'timeline-amount', money(bill.amount))
      );
      dom.upcoming.appendChild(row);
    });
  };

  const renderSchedules = (data) => {
    const income = data.schedule_context?.recurring_income || {};
    const expense = data.schedule_context?.recurring_expense || {};
    dom.scheduleCounts.replaceChildren(
      metric('Active income schedules', income.active || 0, `${income.paused || 0} paused · ${income.stopped || 0} stopped`),
      metric('Active expense schedules', expense.active || 0, `${expense.paused || 0} paused · ${expense.stopped || 0} stopped`),
      metric('Planned events', data.event_count || 0, `${data.events_truncated ? 'Truncated display' : 'Complete display'}`)
    );
    const subs = data.subscriptions || {};
    dom.subscriptionNote.textContent = `${subs.note || 'Subscription costs are separate from expected expenses.'} Active trackers: ${subs.active_count || 0}; estimated monthly cost: ${money(subs.estimated_monthly_cost)}.`;
    dom.notes.replaceChildren();
    (Array.isArray(data.notes) ? data.notes : []).forEach((note) => {
      if (typeof note === 'string' && note.trim()) dom.notes.appendChild(el('li', '', note));
    });
  };

  const render = (data) => {
    renderSummary(data);
    renderMonths(data);
    renderHistory(data);
    renderOverdue(data);
    renderEvents(data);
    renderUpcoming(data);
    renderSchedules(data);
  };

  const load = async () => {
    if (!dom.asOf.value) {
      setMessage('Choose a valid starting date.', 'error');
      return;
    }
    setMessage('');
    dom.content.hidden = true;
    dom.pageState.hidden = false;
    UI.renderState(dom.pageState, 'loading', { message: 'Building schedule forecast…' });
    dom.form.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });

    let result;
    try {
      result = await API.get(`/analytics/cash-flow-forecast?horizon=${encodeURIComponent(horizon)}&as_of=${encodeURIComponent(dom.asOf.value)}`);
    } catch (error) {
      result = null;
    } finally {
      dom.form.querySelectorAll('button, input').forEach((control) => { control.disabled = false; });
    }

    if (!result || result.status !== 200 || !result.data || result.data.success !== true || !result.data.data) {
      UI.renderState(dom.pageState, 'error', {
        message: H.errorMessage(result, 'Could not build the cash-flow forecast.'),
        retry: load,
      });
      return;
    }

    dom.pageState.hidden = true;
    dom.content.hidden = false;
    render(result.data.data);
  };

  if (dom.horizon) {
    dom.horizon.addEventListener('click', (event) => {
      const button = event.target.closest('[data-horizon]');
      if (!button) return;
      horizon = Number(button.dataset.horizon) || 30;
      dom.horizon.querySelectorAll('[data-horizon]').forEach((item) => {
        item.setAttribute('aria-pressed', String(Number(item.dataset.horizon) === horizon));
      });
      load();
    });
  }

  if (dom.form) {
    dom.form.addEventListener('submit', (event) => {
      event.preventDefault();
      load();
    });
  }

  if (dom.asOf) dom.asOf.value = H.todayIso();
  load();
});
