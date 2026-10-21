// Bills and expected-payment calendar.
// The backend owns recurrence arithmetic, payment linking, ownership and
// reminder reconciliation. This module renders state and submits user actions.
(function () {
  'use strict';

  const FREQUENCY_LABELS = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    'half-yearly': 'Half-yearly',
    yearly: 'Yearly',
  };

  const STATUS_LABELS = {
    active: 'Active',
    paused: 'Paused',
    stopped: 'Stopped',
    planned: 'Planned',
    upcoming: 'Upcoming',
    due: 'Due today',
    overdue: 'Overdue',
    paid: 'Paid',
    skipped: 'Skipped',
    cancelled: 'Cancelled',
  };

  const STATUS_TONES = {
    active: 'green',
    paused: 'amber',
    stopped: 'neutral',
    planned: 'blue',
    upcoming: 'blue',
    due: 'amber',
    overdue: 'danger',
    paid: 'green',
    skipped: 'neutral',
    cancelled: 'neutral',
  };

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const pad = (value) => String(value).padStart(2, '0');

  const validMonth = (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''));

  const monthLabel = (month) => {
    if (!validMonth(month)) return '';
    const [year, monthNumber] = month.split('-').map(Number);
    return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
  };

  const shiftMonth = (month, delta) => {
    if (!validMonth(month)) return month;
    const [year, monthNumber] = month.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, monthNumber - 1 + Number(delta || 0), 1));
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
  };

  const groupEntriesByDate = (entries) => {
    const grouped = {};
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const date = entry && entry.occurrence_date;
      if (!date) return;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(entry);
    });
    return grouped;
  };

  const buildMonthCells = (month, entries) => {
    if (!validMonth(month)) return [];
    const [year, monthNumber] = month.split('-').map(Number);
    const grouped = groupEntriesByDate(entries);
    const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const leadingBlanks = (firstWeekday + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
    const cells = [];

    for (let index = 0; index < totalCells; index += 1) {
      const day = index - leadingBlanks + 1;
      const inMonth = day >= 1 && day <= daysInMonth;
      const date = inMonth ? `${year}-${pad(monthNumber)}-${pad(day)}` : null;

      cells.push({
        date,
        day: inMonth ? day : null,
        outside: !inMonth,
        entries: date ? grouped[date] || [] : [],
      });
    }

    return cells;
  };

  const buildCalendarQuery = ({ month, status, categoryId } = {}) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (status) params.set('status', status);
    if (categoryId) params.set('category_id', categoryId);
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const frequencyLabel = (frequency) => FREQUENCY_LABELS[frequency] || frequency || 'Schedule';
  const statusLabel = (status) => STATUS_LABELS[status] || status || 'Unknown';
  const statusTone = (status) => STATUS_TONES[status] || 'neutral';

  const helpers = {
    FREQUENCY_LABELS,
    STATUS_LABELS,
    frequencyLabel,
    statusLabel,
    statusTone,
    validMonth,
    monthLabel,
    shiftMonth,
    groupEntriesByDate,
    buildMonthCells,
    buildCalendarQuery,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = helpers;
  }

  if (typeof window === 'undefined') return;

  window.SpendSenseBills = helpers;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;
  if (!API || !UI) return;

  const state = {
    month: '',
    status: '',
    categoryId: '',
    categories: [],
    schedules: [],
    scheduleSummary: null,
    details: {},
    loadingDetails: new Set(),
    expanded: new Set(),
    calendar: null,
    selected: null,
    focusOccurrenceId: null,
    editingId: null,
    createRequest: null,
    paymentRequests: {},
  };

  const dom = {};

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const pill = (status, text) => el('span', `pill ${statusTone(status)}`, text || statusLabel(status));

  const money = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);

  const formatDate = (value) => (value ? UI.formatDate(value) : '—');

  const todayValue = () => {
    const value = UI.todayInputValue ? UI.todayInputValue() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Date().toISOString().slice(0, 10);
  };

  const todayMonth = () => todayValue().slice(0, 7);

  const errorDetail = (data, fallback) => {
    if (data && data.errors && typeof data.errors === 'object') {
      const first = Object.values(data.errors).flat().filter(Boolean)[0];
      if (first) return first;
    }
    if (data && typeof data.message === 'string' && data.message.trim()) return data.message;
    return fallback;
  };

  const prefersReducedMotion = () => (
    typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const scrollToElement = (node, focusNode) => {
    if (!node) return;
    node.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    if (focusNode) {
      window.setTimeout(() => focusNode.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 220);
    }
  };

  const updateQueryString = () => {
    try {
      const query = buildCalendarQuery({
        month: state.month,
        status: state.status,
        categoryId: state.categoryId,
      });
      window.history.replaceState({}, '', `${window.location.pathname}${query}`);
    } catch (error) {
      // History is a convenience; an embedded or sandboxed page may reject it.
    }
  };

  const setText = (node, value) => {
    if (node) node.textContent = value;
  };

  const setFormMessage = (message, isError = false) => {
    if (!dom.formMessage) return;
    dom.formMessage.textContent = message || '';
    dom.formMessage.classList.toggle('error', Boolean(isError));
  };

  const clearFieldErrors = () => {
    if (!dom.form) return;
    dom.form.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
      field.removeAttribute('aria-invalid');
    });
  };

  const applyFieldErrors = (errors) => {
    clearFieldErrors();
    if (!errors || typeof errors !== 'object') return;
    Object.keys(errors).forEach((name) => {
      const field = dom.form ? dom.form.elements.namedItem(name) : null;
      if (field && field.setAttribute) field.setAttribute('aria-invalid', 'true');
    });
  };

  const setButtonBusy = (button, busy, busyLabel) => {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = busyLabel || 'Working…';
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) {
        button.textContent = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  };

  const cacheDom = () => {
    dom.monthLabel = document.querySelector('[data-month-label]');
    dom.monthPrev = document.querySelector('[data-month-prev]');
    dom.monthNext = document.querySelector('[data-month-next]');
    dom.monthToday = document.querySelector('[data-month-today]');
    dom.statusFilter = document.querySelector('[data-status-filter]');
    dom.categoryFilter = document.querySelector('[data-category-filter]');
    dom.clearFilters = document.querySelector('[data-clear-filters]');
    dom.calendarState = document.querySelector('[data-calendar-state]');
    dom.calendarBody = document.querySelector('[data-calendar-body]');
    dom.calendarGrid = document.querySelector('[data-calendar-grid]');
    dom.calendarList = document.querySelector('[data-calendar-list]');
    dom.calendarSummary = document.querySelector('[data-calendar-summary]');
    dom.selectedBill = document.querySelector('[data-selected-bill]');
    dom.overdueState = document.querySelector('[data-overdue-state]');
    dom.overdueList = document.querySelector('[data-overdue-list]');
    dom.overdueBadge = document.querySelector('[data-overdue-badge]');
    dom.upcomingState = document.querySelector('[data-upcoming-state]');
    dom.upcomingList = document.querySelector('[data-upcoming-list]');
    dom.upcomingBadge = document.querySelector('[data-upcoming-badge]');
    dom.scheduleState = document.querySelector('[data-schedule-list-state]');
    dom.scheduleList = document.querySelector('[data-schedule-list]');
    dom.form = document.querySelector('.recurring-form');
    dom.formTitle = document.querySelector('[data-bill-form-title]');
    dom.formSub = document.querySelector('[data-bill-form-sub]');
    dom.formMessage = document.querySelector('[data-bill-message]');
    dom.description = document.querySelector('#bill-description');
    dom.amount = document.querySelector('#bill-amount');
    dom.category = document.querySelector('#bill-category');
    dom.frequency = document.querySelector('#bill-frequency');
    dom.start = document.querySelector('#bill-start');
    dom.end = document.querySelector('#bill-end');
    dom.reminderDays = document.querySelector('#bill-reminder-days');
    dom.notes = document.querySelector('#bill-notes');
    dom.preview = document.querySelector('[data-bill-preview]');
    dom.previewCount = document.querySelector('[data-bill-preview-count]');
    dom.previewTotal = document.querySelector('[data-bill-preview-total]');
    dom.previewNote = document.querySelector('[data-bill-preview-note]');
    dom.previewDates = document.querySelector('[data-bill-preview-dates]');
    dom.previewButton = document.querySelector('[data-bill-preview-button]');
    dom.submit = document.querySelector('[data-bill-submit]');
    dom.cancelEdit = document.querySelector('[data-bill-cancel]');
    dom.summary = {
      monthExpected: document.querySelector('[data-bill-summary="month_expected"]'),
      monthUnpaid: document.querySelector('[data-bill-summary="month_unpaid"]'),
      monthOverdue: document.querySelector('[data-bill-summary="month_overdue"]'),
      monthPaid: document.querySelector('[data-bill-summary="month_paid"]'),
      activeCount: document.querySelector('[data-bill-summary="active_count"]'),
      statusBreakdown: document.querySelector('[data-bill-summary="status_breakdown"]'),
    };
  };

  const readQueryState = () => {
    const params = new URLSearchParams(window.location.search);
    const requestedMonth = params.get('month');
    state.month = validMonth(requestedMonth) ? requestedMonth : todayMonth();
    state.status = params.get('status') || '';
    state.categoryId = params.get('category_id') || '';
    const focusedBill = Number(params.get('bill'));
    state.focusOccurrenceId = Number.isFinite(focusedBill) && focusedBill > 0 ? focusedBill : null;
  };

  const selectFocusedBill = () => {
    if (!state.focusOccurrenceId || !state.calendar) return;
    const pools = [
      ...(state.calendar.entries || []),
      ...(state.calendar.upcoming || []),
      ...(state.calendar.overdue || []),
    ];
    const entry = pools.find((item) => Number(item.id) === Number(state.focusOccurrenceId));
    state.focusOccurrenceId = null;
    if (entry) selectOccurrence(entry, true);
  };

  const populateSelect = (select, placeholder, items, selectedValue) => {
    if (!select) return;
    select.replaceChildren();
    const blank = el('option', '', placeholder);
    blank.value = '';
    select.append(blank);
    items.forEach((item) => {
      const option = el('option', '', item.name);
      option.value = String(item.id);
      select.append(option);
    });
    const available = items.some((item) => String(item.id) === String(selectedValue));
    select.value = available ? String(selectedValue) : '';
  };

  const loadCategories = async () => {
    try {
      const { data, status } = await API.get('/categories');
      if (status !== 200) throw new Error(errorDetail(data, 'Could not load categories.'));

      const categories = (data && data.data ? data.data : [])
        .filter((category) => category.type === 'expense');
      state.categories = categories;

      const currentFormCategory = state.editingId
        ? (state.schedules.find((schedule) => schedule.id === state.editingId) || {}).category_id
        : dom.category.value;
      populateSelect(dom.category, 'Choose category', categories, currentFormCategory);
      populateSelect(dom.categoryFilter, 'All categories', categories, state.categoryId);

      if (!categories.length) {
        setFormMessage('Create an expense category before adding a scheduled bill.', true);
        if (dom.submit) dom.submit.disabled = true;
      } else if (dom.submit) {
        dom.submit.disabled = false;
      }
    } catch (error) {
      setFormMessage(error.message || 'Could not load categories.', true);
    }
  };

  const updateTopSummary = () => {
    const summary = state.scheduleSummary || {};
    setText(dom.summary.activeCount, summary.active_count === undefined ? '—' : String(summary.active_count));
    const active = Number(summary.active_count || 0);
    const paused = Number(summary.paused_count || 0);
    const stopped = Number(summary.stopped_count || 0);
    const total = active + paused + stopped;
    setText(
      dom.summary.statusBreakdown,
      total
        ? `${active} active · ${paused} paused · ${stopped} stopped`
        : 'No schedules yet'
    );
  };

  const updateCalendarSummary = (calendar) => {
    const summary = calendar && calendar.summary ? calendar.summary : {};
    setText(dom.summary.monthExpected, money(summary.expected_total || 0));
    setText(dom.summary.monthUnpaid, money(summary.unpaid_total || 0));
    setText(dom.summary.monthPaid, money(summary.paid_total || 0));
    const overdueCents = Math.round(Number(summary.overdue_total || 0) * 100);
    setText(
      dom.summary.monthOverdue,
      overdueCents > 0
        ? `${money(summary.overdue_total)} overdue`
        : 'No overdue bills in this month'
    );
  };

  const skeletonState = (container, message) => {
    if (!container) return;
    const wrapper = el('div', 'state loading');
    wrapper.setAttribute('role', 'status');
    wrapper.setAttribute('aria-busy', 'true');
    wrapper.append(el('span', 'spinner'), el('p', '', message));
    container.replaceChildren(wrapper);
    container.hidden = false;
  };

  const loadSchedules = async () => {
    skeletonState(dom.scheduleState, 'Loading recurring bills…');
    dom.scheduleList.hidden = true;

    try {
      const { data, status } = await API.get('/recurring-expenses');
      if (status !== 200) throw new Error(errorDetail(data, 'Could not load recurring bills.'));

      state.schedules = data && data.data && Array.isArray(data.data.schedules)
        ? data.data.schedules
        : [];
      state.scheduleSummary = data && data.data ? data.data.summary : null;
      updateTopSummary();
      renderSchedules();
    } catch (error) {
      dom.scheduleState.hidden = false;
      UI.renderState(dom.scheduleState, 'error', {
        message: error.message || 'Could not load recurring bills.',
        retry: loadSchedules,
      });
    }
  };

  const scheduleActionButton = (label, action, scheduleId, className = 'btn ghost sm') => {
    const button = el('button', className, label);
    button.type = 'button';
    button.dataset.scheduleAction = action;
    button.dataset.scheduleId = scheduleId;
    return button;
  };

  const figure = (label, value, foot, tone) => {
    const wrapper = el('div', 'schedule-figure');
    wrapper.append(el('span', 'schedule-figure-label', label));
    const strong = el('strong', `schedule-figure-value${tone ? ` ${tone}` : ''}`, value);
    wrapper.append(strong);
    if (foot) wrapper.append(el('span', 'schedule-figure-foot', foot));
    return wrapper;
  };

  const renderSchedules = () => {
    if (!dom.scheduleList || !dom.scheduleState) return;
    dom.scheduleList.replaceChildren();

    if (!state.schedules.length) {
      dom.scheduleList.hidden = true;
      dom.scheduleState.hidden = false;
      UI.renderState(dom.scheduleState, 'empty', {
        message: 'No recurring bills yet. Create one to see expected dates on the calendar.',
        action: { href: '#bill-form', label: 'Create a schedule' },
      });
      return;
    }

    dom.scheduleState.replaceChildren();
    dom.scheduleState.hidden = true;
    dom.scheduleList.hidden = false;

    state.schedules.forEach((schedule) => {
      const card = el('article', 'schedule-card');
      card.id = `schedule-${schedule.id}`;

      const head = el('div', 'schedule-card-head');
      const titleWrap = el('div', 'schedule-title-wrap');
      titleWrap.append(
        el('h4', 'schedule-name', schedule.description || 'Recurring bill'),
        el(
          'p',
          'schedule-meta',
          `${frequencyLabel(schedule.frequency)} · ${formatDate(schedule.start_date)} – ${schedule.end_date ? formatDate(schedule.end_date) : 'Ongoing'} · Reminder ${schedule.reminder_days_before} ${Number(schedule.reminder_days_before) === 1 ? 'day' : 'days'} before`
        )
      );
      if (schedule.next_due_date) {
        titleWrap.append(el('p', 'schedule-meta', `Next expected: ${formatDate(schedule.next_due_date)}`));
      }
      head.append(titleWrap, pill(schedule.status));
      card.append(head);

      const summary = schedule.summary || {};
      const figures = el('div', 'schedule-figures');
      figures.append(
        figure('Expected total', money(summary.expected_total || 0), 'Expectation, not an expense'),
        figure('Paid', money(summary.paid_total || 0), 'Linked actual expenses', 'pos'),
        figure(
          'Unpaid',
          money(summary.unpaid_total || 0),
          summary.overdue_count
            ? `${money(summary.overdue_total || 0)} overdue`
            : 'Nothing overdue',
          'neg'
        )
      );
      card.append(figures);

      const actions = el('div', 'schedule-actions');
      actions.append(scheduleActionButton(
        state.expanded.has(schedule.id) ? 'Hide dates' : 'Show dates',
        'toggle',
        schedule.id,
        'btn secondary sm'
      ));
      if (schedule.status !== 'stopped') {
        actions.append(scheduleActionButton('Edit', 'edit', schedule.id));
      }
      if (schedule.status === 'active') {
        actions.append(scheduleActionButton('Pause', 'pause', schedule.id));
      } else if (schedule.status === 'paused') {
        actions.append(scheduleActionButton('Resume', 'resume', schedule.id));
      }
      if (schedule.status !== 'stopped') {
        actions.append(scheduleActionButton('Stop', 'stop', schedule.id, 'btn danger-ghost sm'));
      }
      card.append(actions);

      if (state.expanded.has(schedule.id)) {
        const detail = el('div', 'schedule-detail');
        const detailData = state.details[schedule.id];
        if (detailData) {
          detail.append(renderOccurrenceTable(schedule, detailData.occurrences || []));
        } else {
          const loading = el('div', 'state loading');
          loading.setAttribute('role', 'status');
          loading.setAttribute('aria-busy', 'true');
          loading.append(el('span', 'spinner'), el('p', '', 'Loading expected dates…'));
          detail.append(loading);
          loadScheduleDetail(schedule.id);
        }
        card.append(detail);
      }

      dom.scheduleList.append(card);
    });
  };

  const renderOccurrenceTable = (schedule, occurrences) => {
    const wrap = el('div', 'table-wrap');
    const table = el('table');
    const caption = el('caption', 'sr-only', `Expected dates for ${schedule.description}`);
    table.append(caption);

    const thead = el('thead');
    const headerRow = el('tr');
    ['Date', 'Expected', 'Status', 'Actual', 'Actions'].forEach((heading) => {
      const th = el('th', '', heading);
      th.scope = 'col';
      headerRow.append(th);
    });
    thead.append(headerRow);
    table.append(thead);

    const tbody = el('tbody');
    if (!occurrences.length) {
      const row = el('tr');
      const cell = el('td', '', 'No expected dates generated for this schedule.');
      cell.colSpan = 5;
      row.append(cell);
      tbody.append(row);
    }

    occurrences.forEach((occurrence) => {
      state.details[schedule.id] = state.details[schedule.id] || { occurrences: [] };
      const existing = state.details[schedule.id].occurrences || [];
      if (!existing.some((item) => item.id === occurrence.id)) existing.push(occurrence);
      const row = el('tr');
      row.append(el('td', '', formatDate(occurrence.occurrence_date)));
      row.append(el('td', '', money(occurrence.expected_amount)));
      const statusCell = el('td');
      statusCell.append(pill(occurrence.display_status || occurrence.status));
      row.append(statusCell);
      row.append(el(
        'td',
        '',
        occurrence.actual_amount === null || occurrence.actual_amount === undefined
          ? '—'
          : money(occurrence.actual_amount)
      ));

      const actionsCell = el('td');
      const actions = el('div', 'occ-actions');
      if (occurrence.status === 'planned') {
        const pay = el('button', 'btn secondary sm', 'Mark paid');
        pay.type = 'button';
        pay.dataset.scheduleAction = 'open-pay';
        pay.dataset.scheduleId = schedule.id;
        pay.dataset.occurrenceId = occurrence.id;
        pay.setAttribute('aria-label', `Choose payment details for ${schedule.description} on ${formatDate(occurrence.occurrence_date)}`);
        const skip = el('button', 'btn ghost sm', 'Skip');
        skip.type = 'button';
        skip.dataset.scheduleAction = 'skip';
        skip.dataset.scheduleId = schedule.id;
        skip.dataset.occurrenceId = occurrence.id;
        skip.setAttribute('aria-label', `Skip ${schedule.description} on ${formatDate(occurrence.occurrence_date)}`);
        actions.append(pay, skip);
      } else if (occurrence.status === 'skipped') {
        const unpaid = el('button', 'btn ghost sm', 'Mark unpaid');
        unpaid.type = 'button';
        unpaid.dataset.scheduleAction = 'unpaid';
        unpaid.dataset.scheduleId = schedule.id;
        unpaid.dataset.occurrenceId = occurrence.id;
        unpaid.setAttribute('aria-label', `Mark ${schedule.description} on ${formatDate(occurrence.occurrence_date)} unpaid`);
        actions.append(unpaid);
      }
      if (occurrence.expense_id && occurrence.status === 'paid') {
        const link = el('a', 'btn ghost sm', occurrence.expense_deleted ? 'Expense in trash' : 'Expense');
        link.href = '../expense-management/expenses.html';
        link.setAttribute('aria-label', `Open the actual expense linked to ${schedule.description} on ${formatDate(occurrence.occurrence_date)}`);
        actions.append(link);
      }
      actionsCell.append(actions);
      row.append(actionsCell);
      tbody.append(row);
    });

    table.append(tbody);
    wrap.append(table);
    return wrap;
  };

  const loadScheduleDetail = async (scheduleId) => {
    if (state.loadingDetails.has(scheduleId)) return;
    state.loadingDetails.add(scheduleId);
    try {
      const { data, status } = await API.get(`/recurring-expenses/${scheduleId}`);
      if (status !== 200) throw new Error(errorDetail(data, 'Could not load this schedule.'));
      state.details[scheduleId] = data.data;
      if (state.expanded.has(scheduleId)) renderSchedules();
    } catch (error) {
      state.expanded.delete(scheduleId);
      UI.showToast(error.message || 'Could not load this schedule.', 'error');
      renderSchedules();
    } finally {
      state.loadingDetails.delete(scheduleId);
    }
  };

  const loadCalendar = async () => {
    skeletonState(dom.calendarState, 'Loading bill calendar…');
    if (dom.calendarBody) dom.calendarBody.hidden = true;
    setText(dom.monthLabel, monthLabel(state.month));
    if (dom.monthLabel) dom.monthLabel.setAttribute('aria-busy', 'true');
    updateQueryString();

    try {
      const query = buildCalendarQuery({
        month: state.month,
        status: state.status,
        categoryId: state.categoryId,
      });
      const { data, status } = await API.get(`/recurring-expenses/calendar${query}`);
      if (status !== 200) throw new Error(errorDetail(data, 'Could not load the bill calendar.'));

      state.calendar = data.data;
      setText(dom.monthLabel, state.calendar.month_label || monthLabel(state.calendar.month));

      if ((state.calendar.entries || []).length) {
        dom.calendarState.hidden = true;
        dom.calendarBody.hidden = false;
        renderCalendar(state.calendar);
      } else {
        dom.calendarState.hidden = false;
        const message = state.status || state.categoryId
          ? 'No bills match these filters for this month.'
          : 'No expected bills in this month. Create a schedule to plan one.';
        UI.renderState(dom.calendarState, 'empty', {
          message,
          action: state.status || state.categoryId
            ? undefined
            : { href: '#bill-form', label: 'Create a schedule' },
        });
      }

      renderUpcomingAndOverdue(state.calendar);
      updateCalendarSummary(state.calendar);
      selectFocusedBill();
    } catch (error) {
      dom.calendarState.hidden = false;
      UI.renderState(dom.calendarState, 'error', {
        message: error.message || 'Could not load the bill calendar.',
        retry: loadCalendar,
      });
      renderUpcomingError(error);
    } finally {
      if (dom.monthLabel) dom.monthLabel.removeAttribute('aria-busy');
    }
  };

  const occurrenceButtonLabel = (entry) => {
    const description = entry.schedule ? entry.schedule.description : 'Scheduled bill';
    return `${description}, ${money(entry.expected_amount)}, ${statusLabel(entry.display_status || entry.status)}, ${formatDate(entry.occurrence_date)}. Open payment actions.`;
  };

  const bindOccurrenceButton = (button, entry) => {
    button.addEventListener('click', () => selectOccurrence(entry, true));
    button.setAttribute('aria-label', occurrenceButtonLabel(entry));
  };

  const entryTone = (entry) => statusTone(entry.display_status || entry.status);

  const renderCalendar = (calendar) => {
    if (!dom.calendarGrid || !dom.calendarList) return;
    dom.calendarGrid.replaceChildren();
    dom.calendarList.replaceChildren();

    const today = todayValue();
    const cells = buildMonthCells(calendar.month, calendar.entries || []);

    cells.forEach((cell) => {
      const dayCell = el('div', 'calendar-day');
      dayCell.setAttribute('role', 'gridcell');

      if (cell.outside) {
        dayCell.classList.add('is-outside');
        dayCell.setAttribute('aria-hidden', 'true');
      } else {
        dayCell.setAttribute('aria-label', formatDate(cell.date));
        if (cell.date === today) {
          dayCell.classList.add('is-today');
          dayCell.setAttribute('aria-current', 'date');
        }
        dayCell.append(el('span', 'calendar-day-num', cell.day));
      }

      const bills = el('div', 'calendar-day-bills');
      cell.entries.forEach((entry) => {
        const button = el('button', `calendar-entry tone-${entryTone(entry)} is-${entry.status}`);
        button.type = 'button';
        if (state.selected && state.selected.id === entry.id) button.classList.add('is-selected');
        button.append(
          el('span', 'calendar-entry-title', entry.schedule ? entry.schedule.description : 'Bill'),
          (() => {
            const meta = el('span', 'calendar-entry-meta');
            meta.append(
              el('span', '', statusLabel(entry.display_status || entry.status)),
              el('strong', '', money(entry.expected_amount))
            );
            return meta;
          })()
        );
        bindOccurrenceButton(button, entry);
        bills.append(button);
      });

      if (cell.entries.length) dayCell.append(bills);
      dom.calendarGrid.append(dayCell);
    });

    const grouped = groupEntriesByDate(calendar.entries || []);
    Object.keys(grouped).sort().forEach((date) => {
      const day = el('div', 'calendar-mobile-day');
      if (date === today) day.classList.add('is-today');
      day.append(el('span', 'calendar-mobile-date', formatDate(date)));
      const items = el('div', 'calendar-mobile-items');

      grouped[date].forEach((entry) => {
        const button = el('button', `calendar-mobile-item tone-${entryTone(entry)} is-${entry.status}`);
        button.type = 'button';
        const main = el('div', 'calendar-mobile-item-main');
        main.append(
          el('strong', '', entry.schedule ? entry.schedule.description : 'Bill'),
          el('small', '', `${statusLabel(entry.display_status || entry.status)} · ${entry.schedule && entry.schedule.category ? entry.schedule.category.name : 'Uncategorised'}`)
        );
        button.append(main, el('strong', '', money(entry.expected_amount)));
        bindOccurrenceButton(button, entry);
        items.append(button);
      });

      day.append(items);
      dom.calendarList.append(day);
    });

    const summary = calendar.summary || {};
    dom.calendarSummary.replaceChildren();
    const parts = [
      `${summary.entry_count || 0} ${Number(summary.entry_count) === 1 ? 'bill' : 'bills'}`,
      `Expected ${money(summary.expected_total || 0)}`,
      `Paid ${money(summary.paid_total || 0)}`,
      `Unpaid ${money(summary.unpaid_total || 0)}`,
    ];
    if (Number(summary.overdue_total || 0) > 0) parts.push(`${money(summary.overdue_total)} overdue`);
    parts.forEach((part) => dom.calendarSummary.append(el('span', '', part), el('span', '', '·')));
    if (dom.calendarSummary.lastChild) dom.calendarSummary.lastChild.remove();
  };

  const renderFeed = (entries, stateNode, listNode, badgeNode, emptyMessage) => {
    if (!stateNode || !listNode) return;
    setText(badgeNode, String((entries || []).length));
    listNode.replaceChildren();

    if (!(entries || []).length) {
      listNode.hidden = true;
      stateNode.hidden = false;
      UI.renderState(stateNode, 'empty', { message: emptyMessage });
      return;
    }

    stateNode.replaceChildren();
    stateNode.hidden = true;
    listNode.hidden = false;

    entries.forEach((entry) => {
      const item = el('button', `bill-feed-item tone-${entryTone(entry)}`);
      item.type = 'button';
      const main = el('div', 'bill-feed-main');
      main.append(
        el('span', 'bill-feed-title', entry.schedule ? entry.schedule.description : 'Scheduled bill'),
        el(
          'span',
          'bill-feed-meta',
          `${formatDate(entry.occurrence_date)} · ${statusLabel(entry.display_status || entry.status)}${entry.schedule && entry.schedule.category ? ` · ${entry.schedule.category.name}` : ''}`
        )
      );
      const amount = el('span', 'bill-feed-amount');
      amount.append(
        el('strong', '', money(entry.expected_amount)),
        el('span', '', entry.schedule && entry.schedule.status === 'paused' ? 'Paused' : 'Expected')
      );
      item.append(main, amount);
      bindOccurrenceButton(item, entry);
      listNode.append(item);
    });
  };

  const renderUpcomingAndOverdue = (calendar) => {
    renderFeed(
      calendar.overdue || [],
      dom.overdueState,
      dom.overdueList,
      dom.overdueBadge,
      'No overdue bills right now.'
    );
    renderFeed(
      calendar.upcoming || [],
      dom.upcomingState,
      dom.upcomingList,
      dom.upcomingBadge,
      'No active bills due in the next 30 days.'
    );
  };

  const renderUpcomingError = (error) => {
    [dom.overdueState, dom.upcomingState].forEach((container) => {
      if (!container) return;
      container.hidden = false;
      UI.renderState(container, 'error', {
        message: errorDetail(null, 'Could not load upcoming bills.'),
        retry: loadCalendar,
      });
    });
    if (dom.overdueList) dom.overdueList.hidden = true;
    if (dom.upcomingList) dom.upcomingList.hidden = true;
    setText(dom.overdueBadge, '—');
    setText(dom.upcomingBadge, '—');
  };

  const selectOccurrence = (entry, focus = false) => {
    if (!entry) return;
    state.selected = entry;
    renderSelectedBill();
    if (focus && dom.selectedBill) {
      scrollToElement(dom.selectedBill, dom.selectedBill.querySelector('h3'));
    }
  };

  const renderSelectedBill = () => {
    if (!dom.selectedBill) return;
    const entry = state.selected;

    if (!entry) {
      dom.selectedBill.hidden = true;
      dom.selectedBill.replaceChildren();
      return;
    }

    dom.selectedBill.hidden = false;
    dom.selectedBill.replaceChildren();

    const schedule = entry.schedule || {};
    const displayStatus = entry.display_status || entry.status;
    const head = el('div', 'selected-bill-head');
    const titleWrap = el('div');
    const title = el('h3', 'selected-bill-title', schedule.description || 'Scheduled bill');
    title.tabIndex = -1;
    titleWrap.append(
      title,
      el(
        'p',
        'selected-bill-sub',
        `${formatDate(entry.occurrence_date)} · ${frequencyLabel(schedule.frequency)}${schedule.category ? ` · ${schedule.category.name}` : ''}`
      )
    );
    head.append(titleWrap, pill(displayStatus));
    dom.selectedBill.append(head);

    const stats = el('div', 'selected-bill-stats');
    const stat = (label, value) => {
      const wrapper = el('div', 'selected-bill-stat');
      wrapper.append(el('span', '', label), el('strong', '', value));
      stats.append(wrapper);
    };
    stat('Expected', money(entry.expected_amount));
    stat('Actual', entry.actual_amount === null || entry.actual_amount === undefined ? 'Not posted' : money(entry.actual_amount));
    stat('Schedule', statusLabel(schedule.status || 'active'));
    stat('Reminder', schedule.reminder_days_before === undefined ? '—' : `${schedule.reminder_days_before} days before`);
    dom.selectedBill.append(stats);

    if (schedule.status === 'paused') {
      dom.selectedBill.append(el('p', 'selected-bill-note', 'This schedule is paused. Existing expected dates are kept, but reminders are suppressed.'));
    }
    if (schedule.status === 'stopped') {
      dom.selectedBill.append(el('p', 'selected-bill-note', 'This schedule is stopped. Future planned dates were cancelled; historical records remain.'));
    }
    if (entry.status === 'paid') {
      const note = entry.expense_deleted
        ? 'The linked actual expense is currently in the expense trash. Restore it from Expenses to keep the payment visible there.'
        : `Payment recorded as an actual expense${entry.payment_date ? ` on ${formatDate(entry.payment_date)}` : ''}.`;
      dom.selectedBill.append(el('p', 'selected-bill-note', note));
      const actions = el('div', 'selected-bill-actions');
      const link = el('a', 'btn secondary sm', 'Open expenses');
      link.href = '../expense-management/expenses.html';
      actions.append(link);
      dom.selectedBill.append(actions);
    }

    if (entry.can_pay) {
      const payForm = el('form', 'selected-bill-pay');
      payForm.setAttribute('aria-label', `Record payment for ${schedule.description || 'this bill'}`);
      const amountField = el('div', 'field');
      const amountId = `selected-bill-amount-${entry.id}`;
      const amountLabel = el('label', '', 'Actual amount');
      amountLabel.htmlFor = amountId;
      const amountInput = el('input');
      amountInput.id = amountId;
      amountInput.name = 'actual_amount';
      amountInput.type = 'number';
      amountInput.step = '0.01';
      amountInput.min = '0.01';
      amountInput.max = '99999999.99';
      amountInput.required = true;
      amountInput.value = entry.actual_amount || entry.expected_amount || '';
      amountField.append(amountLabel, amountInput);

      const dateField = el('div', 'field');
      const dateId = `selected-bill-date-${entry.id}`;
      const dateLabel = el('label', '', 'Payment date');
      dateLabel.htmlFor = dateId;
      const dateInput = el('input');
      dateInput.id = dateId;
      dateInput.name = 'paid_date';
      dateInput.type = 'date';
      dateInput.required = true;
      dateInput.value = entry.payment_date || entry.occurrence_date;
      dateField.append(dateLabel, dateInput);

      const paySubmit = el('button', 'btn primary sm', 'Mark paid');
      paySubmit.type = 'submit';
      const skip = el('button', 'btn secondary sm', 'Skip occurrence');
      skip.type = 'button';
      payForm.append(amountField, dateField, paySubmit, skip);
      payForm.addEventListener('submit', (event) => {
        event.preventDefault();
        recordPayment(entry, payForm, paySubmit);
      });
      skip.addEventListener('click', () => skipOccurrence(entry, skip));
      dom.selectedBill.append(payForm);
    }

    if (entry.can_mark_unpaid) {
      const actions = el('div', 'selected-bill-actions');
      const unpaid = el('button', 'btn secondary sm', 'Mark occurrence unpaid');
      unpaid.type = 'button';
      unpaid.addEventListener('click', () => markUnpaid(entry, unpaid));
      actions.append(unpaid);
      dom.selectedBill.append(actions);
    }

    if (entry.status === 'cancelled') {
      dom.selectedBill.append(el('p', 'selected-bill-note', 'This occurrence was cancelled when its schedule was stopped. It cannot be paid or skipped.'));
    }
  };

  const refreshAfterOccurrenceChange = async (scheduleId) => {
    delete state.details[scheduleId];
    await Promise.allSettled([loadSchedules(), loadCalendar()]);
    if (state.selected) renderSelectedBill();
  };

  const recordPayment = async (entry, form, button) => {
    const amountInput = form.elements.namedItem('actual_amount');
    const dateInput = form.elements.namedItem('paid_date');
    const amount = Number(amountInput ? amountInput.value : NaN);
    const paidDate = dateInput ? dateInput.value : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      UI.showToast('Enter a payment amount greater than zero.', 'error');
      if (amountInput) amountInput.focus();
      return;
    }
    if (!paidDate) {
      UI.showToast('Choose a payment date.', 'error');
      if (dateInput) dateInput.focus();
      return;
    }

    const payload = { actual_amount: amount.toFixed(2), paid_date: paidDate };
    const signature = JSON.stringify(payload);
    if (!state.paymentRequests[entry.id] || state.paymentRequests[entry.id].signature !== signature) {
      state.paymentRequests[entry.id] = {
        signature,
        key: API.newIdempotencyKey(),
      };
    }
    const request = state.paymentRequests[entry.id];

    setButtonBusy(button, true, 'Recording…');
    try {
      const { data, status } = await API.post(
        `/recurring-expenses/${entry.schedule.id}/occurrences/${entry.id}/pay`,
        payload,
        { 'Idempotency-Key': request.key }
      );

      if (status === 200 && data && data.data) {
        delete state.paymentRequests[entry.id];
        state.selected = data.data;
        renderSelectedBill();
        UI.showToast('Payment recorded as an actual expense.', 'success');
        await refreshAfterOccurrenceChange(entry.schedule.id);
        return;
      }

      if (status === 409 || status === 422) {
        delete state.paymentRequests[entry.id];
      }
      UI.showToast(errorDetail(data, 'Could not record this payment.'), 'error');
    } catch (error) {
      UI.showToast(`Could not record this payment. ${error.message || ''}`.trim(), 'error');
    } finally {
      setButtonBusy(button, false);
    }
  };

  const skipOccurrence = async (entry, button) => {
    if (!window.confirm(`Skip ${entry.schedule.description} on ${formatDate(entry.occurrence_date)}? No expense will be created.`)) {
      return;
    }

    setButtonBusy(button, true, 'Skipping…');
    try {
      const { data, status } = await API.post(
        `/recurring-expenses/${entry.schedule.id}/occurrences/${entry.id}/skip`
      );
      if (status === 200 && data && data.data) {
        state.selected = data.data;
        renderSelectedBill();
        UI.showToast('Occurrence skipped. No expense was created.', 'success');
        await refreshAfterOccurrenceChange(entry.schedule.id);
        return;
      }
      UI.showToast(errorDetail(data, 'Could not skip this occurrence.'), 'error');
    } catch (error) {
      UI.showToast(`Could not skip this occurrence. ${error.message || ''}`.trim(), 'error');
    } finally {
      setButtonBusy(button, false);
    }
  };

  const markUnpaid = async (entry, button) => {
    setButtonBusy(button, true, 'Updating…');
    try {
      const { data, status } = await API.post(
        `/recurring-expenses/${entry.schedule.id}/occurrences/${entry.id}/unpaid`
      );
      if (status === 200 && data && data.data) {
        state.selected = data.data;
        renderSelectedBill();
        UI.showToast('Occurrence returned to planned.', 'success');
        await refreshAfterOccurrenceChange(entry.schedule.id);
        return;
      }
      UI.showToast(errorDetail(data, 'Could not mark this occurrence unpaid.'), 'error');
    } catch (error) {
      UI.showToast(`Could not mark this occurrence unpaid. ${error.message || ''}`.trim(), 'error');
    } finally {
      setButtonBusy(button, false);
    }
  };

  const findCachedOccurrence = (scheduleId, occurrenceId) => {
    const detail = state.details[scheduleId];
    const occurrences = detail && Array.isArray(detail.occurrences) ? detail.occurrences : [];
    return occurrences.find((occurrence) => Number(occurrence.id) === Number(occurrenceId)) || null;
  };

  const handleScheduleAction = async (event) => {
    const button = event.target.closest('button[data-schedule-action]');
    if (!button) return;
    const action = button.dataset.scheduleAction;
    const scheduleId = Number(button.dataset.scheduleId);
    const occurrenceId = Number(button.dataset.occurrenceId);
    const schedule = state.schedules.find((item) => Number(item.id) === scheduleId);

    if (action === 'toggle') {
      if (state.expanded.has(scheduleId)) {
        state.expanded.delete(scheduleId);
      } else {
        state.expanded.add(scheduleId);
      }
      renderSchedules();
      return;
    }

    if (action === 'edit' && schedule) {
      fillForm(schedule);
      return;
    }

    if (action === 'open-pay') {
      const occurrence = findCachedOccurrence(scheduleId, occurrenceId);
      if (occurrence) {
        selectOccurrence(occurrence, true);
      } else if (schedule) {
        await loadScheduleDetail(scheduleId);
      }
      return;
    }

    if (action === 'skip' || action === 'unpaid') {
      const occurrence = findCachedOccurrence(scheduleId, occurrenceId);
      if (occurrence) {
        if (action === 'skip') await skipOccurrence(occurrence, button);
        else await markUnpaid(occurrence, button);
      }
      return;
    }

    if (action === 'pause' || action === 'resume' || action === 'stop') {
      if (!schedule) return;
      if (action === 'stop' && !window.confirm(`Stop ${schedule.description}? Future planned occurrences will be cancelled. Paid and skipped history stays intact.`)) {
        return;
      }
      setButtonBusy(button, true, action === 'stop' ? 'Stopping…' : 'Updating…');
      try {
        const { data, status } = await API.post(`/recurring-expenses/${scheduleId}/${action}`);
        if (status === 200 && data && data.data) {
          state.selected = null;
          renderSelectedBill();
          delete state.details[scheduleId];
          state.expanded.delete(scheduleId);
          UI.showToast(
            action === 'stop'
              ? 'Schedule stopped. Future expected dates were cancelled.'
              : action === 'pause'
                ? 'Schedule paused. Reminders are suppressed.'
                : 'Schedule resumed.',
            'success'
          );
          await Promise.allSettled([loadSchedules(), loadCalendar()]);
          return;
        }
        UI.showToast(errorDetail(data, `Could not ${action} this schedule.`), 'error');
      } catch (error) {
        UI.showToast(`Could not ${action} this schedule. ${error.message || ''}`.trim(), 'error');
      } finally {
        setButtonBusy(button, false);
      }
    }
  };

  const resetForm = (focus = false) => {
    if (!dom.form) return;
    state.editingId = null;
    state.createRequest = null;
    dom.form.reset();
    dom.start.value = todayValue();
    dom.reminderDays.value = '3';
    dom.category.value = '';
    dom.formTitle.textContent = 'New schedule';
    dom.formSub.textContent = 'Preview expected dates before saving.';
    dom.submit.textContent = 'Create schedule';
    dom.cancelEdit.hidden = true;
    dom.preview.hidden = true;
    setFormMessage('');
    clearFieldErrors();
    if (state.categories.length && dom.submit) dom.submit.disabled = false;
    if (focus) dom.description.focus();
  };

  const fillForm = (schedule) => {
    if (!schedule || schedule.status === 'stopped') return;
    state.editingId = schedule.id;
    state.createRequest = null;
    dom.description.value = schedule.description || '';
    dom.amount.value = schedule.amount || '';
    if (![...dom.category.options].some((option) => option.value === String(schedule.category_id))) {
      const option = el('option', '', schedule.category ? schedule.category.name : 'Current category');
      option.value = String(schedule.category_id);
      dom.category.append(option);
    }
    dom.category.value = String(schedule.category_id);
    dom.frequency.value = schedule.frequency || 'monthly';
    dom.start.value = schedule.start_date || '';
    dom.end.value = schedule.end_date || '';
    dom.reminderDays.value = schedule.reminder_days_before === undefined ? '3' : String(schedule.reminder_days_before);
    dom.notes.value = schedule.notes || '';
    dom.formTitle.textContent = 'Edit schedule';
    dom.formSub.textContent = 'Future planned dates will be rebuilt. Paid and skipped history will not change.';
    dom.submit.textContent = 'Save changes';
    dom.cancelEdit.hidden = false;
    dom.preview.hidden = true;
    setFormMessage('Editing only regenerates future planned dates.');
    clearFieldErrors();
    if (dom.submit) dom.submit.disabled = false;
    scrollToElement(document.querySelector('#bill-form'), dom.description);
  };

  const readPreviewPayload = () => {
    const amount = Number(dom.amount.value);
    const startDate = dom.start.value;
    const endDate = dom.end.value;
    const frequency = dom.frequency.value || 'monthly';

    if (!Number.isFinite(amount) || amount <= 0 || !startDate) {
      setFormMessage('Enter a positive amount and a start date to preview dates.', true);
      return null;
    }
    if (endDate && endDate < startDate) {
      setFormMessage('The end date must be on or after the start date.', true);
      dom.end.focus();
      return null;
    }

    return {
      amount,
      frequency,
      start_date: startDate,
      end_date: endDate || null,
    };
  };

  const renderPreview = (preview) => {
    if (!preview || !dom.preview) return;
    dom.preview.hidden = false;
    dom.previewCount.textContent = `${preview.count} expected ${preview.count === 1 ? 'date' : 'dates'}`;
    dom.previewTotal.textContent = `Total ${money(preview.total_expected)}`;
    dom.previewNote.textContent = preview.open_ended
      ? `Ongoing preview through ${formatDate(preview.end_date)}. Nothing is added to actual expenses.`
      : 'Preview only. Nothing is added to actual expenses until you mark a date paid.';
    dom.previewDates.replaceChildren();

    const dates = Array.isArray(preview.dates) ? preview.dates : [];
    const visible = dates.slice(0, 8);
    visible.forEach((date) => dom.previewDates.append(el('li', '', formatDate(date))));
    if (dates.length > visible.length) {
      dom.previewDates.append(el('li', '', `+${dates.length - visible.length} more`));
    }
  };

  const loadPreview = async () => {
    const payload = readPreviewPayload();
    if (!payload) return;
    setButtonBusy(dom.previewButton, true, 'Previewing…');
    try {
      const { data, status } = await API.post('/recurring-expenses/preview', payload);
      if (status !== 200 || !data || !data.data) {
        setFormMessage(errorDetail(data, 'Could not preview this schedule.'), true);
        return;
      }
      setFormMessage('');
      renderPreview(data.data);
    } catch (error) {
      setFormMessage(`Could not preview this schedule. ${error.message || ''}`.trim(), true);
    } finally {
      setButtonBusy(dom.previewButton, false);
    }
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!dom.form) return;
    clearFieldErrors();

    const amount = Number(dom.amount.value);
    const reminderDays = Number(dom.reminderDays.value);
    const description = dom.description.value.trim();
    const categoryId = Number(dom.category.value);
    const startDate = dom.start.value;
    const endDate = dom.end.value;

    if (!description) {
      setFormMessage('Enter a description for this bill.', true);
      dom.description.focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormMessage('Enter an expected amount greater than zero.', true);
      dom.amount.focus();
      return;
    }
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setFormMessage('Choose an expense category.', true);
      dom.category.focus();
      return;
    }
    if (!startDate) {
      setFormMessage('Choose a start date.', true);
      dom.start.focus();
      return;
    }
    if (endDate && endDate < startDate) {
      setFormMessage('The end date must be on or after the start date.', true);
      dom.end.focus();
      return;
    }
    if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 30) {
      setFormMessage('Reminder days must be a whole number from 0 to 30.', true);
      dom.reminderDays.focus();
      return;
    }

    const payload = {
      description,
      amount: amount.toFixed(2),
      category_id: categoryId,
      frequency: dom.frequency.value,
      start_date: startDate,
      end_date: endDate || null,
      reminder_days_before: reminderDays,
      notes: dom.notes.value.trim() || null,
    };

    const isEditing = Boolean(state.editingId);
    let key = null;
    if (!isEditing) {
      const signature = JSON.stringify(payload);
      if (!state.createRequest || state.createRequest.signature !== signature) {
        state.createRequest = { signature, key: API.newIdempotencyKey() };
      }
      key = state.createRequest.key;
    }

    setButtonBusy(dom.submit, true, isEditing ? 'Saving…' : 'Creating…');
    setFormMessage('');
    try {
      const response = isEditing
        ? await API.put(`/recurring-expenses/${state.editingId}`, payload)
        : await API.post('/recurring-expenses', payload, { 'Idempotency-Key': key });
      const { data, status } = response;

      if ((isEditing && status === 200) || (!isEditing && status === 201)) {
        const scheduleId = data && data.data ? data.data.id : null;
        state.createRequest = null;
        UI.showToast(isEditing ? 'Schedule updated.' : 'Schedule created.', 'success');
        resetForm();
        await Promise.allSettled([loadSchedules(), loadCalendar()]);
        if (scheduleId) {
          const card = document.getElementById(`schedule-${scheduleId}`);
          if (card) scrollToElement(card, card.querySelector('button'));
        }
        return;
      }

      if (status === 422) {
        state.createRequest = null;
        applyFieldErrors(data && data.errors);
      }
      setFormMessage(errorDetail(data, isEditing ? 'Could not update this schedule.' : 'Could not create this schedule.'), true);
    } catch (error) {
      setFormMessage(`${isEditing ? 'Could not update' : 'Could not create'} this schedule. ${error.message || ''}`.trim(), true);
    } finally {
      setButtonBusy(dom.submit, false);
      if (!state.categories.length) dom.submit.disabled = true;
    }
  };

  const clearSelection = () => {
    state.selected = null;
    renderSelectedBill();
  };

  const bindEvents = () => {
    dom.monthPrev.addEventListener('click', () => {
      state.month = shiftMonth(state.month, -1);
      clearSelection();
      loadCalendar();
    });
    dom.monthNext.addEventListener('click', () => {
      state.month = shiftMonth(state.month, 1);
      clearSelection();
      loadCalendar();
    });
    dom.monthToday.addEventListener('click', () => {
      state.month = todayMonth();
      clearSelection();
      loadCalendar();
    });
    dom.statusFilter.addEventListener('change', () => {
      state.status = dom.statusFilter.value;
      clearSelection();
      loadCalendar();
    });
    dom.categoryFilter.addEventListener('change', () => {
      state.categoryId = dom.categoryFilter.value;
      clearSelection();
      loadCalendar();
    });
    dom.clearFilters.addEventListener('click', () => {
      state.status = '';
      state.categoryId = '';
      dom.statusFilter.value = '';
      dom.categoryFilter.value = '';
      clearSelection();
      loadCalendar();
    });

    dom.calendarGrid.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...dom.calendarGrid.querySelectorAll('.calendar-entry')];
      const current = buttons.indexOf(document.activeElement);
      if (current < 0 || !buttons.length) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowLeft') next = current - 1;
      if (event.key === 'ArrowRight') next = current + 1;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next >= 0 && next < buttons.length) buttons[next].focus();
    });

    dom.scheduleList.addEventListener('click', handleScheduleAction);

    dom.form.addEventListener('submit', submitForm);
    dom.form.addEventListener('input', (event) => {
      if (event.target && event.target.getAttribute('aria-invalid') === 'true') {
        event.target.removeAttribute('aria-invalid');
      }
      if (event.target !== dom.notes) state.createRequest = null;
      if (!dom.preview.hidden) dom.preview.hidden = true;
      if (dom.formMessage.classList.contains('error')) setFormMessage('');
    });
    dom.previewButton.addEventListener('click', loadPreview);
    dom.cancelEdit.addEventListener('click', () => resetForm(true));

    document.querySelectorAll('[data-new-bill], [data-new-schedule]').forEach((link) => {
      link.addEventListener('click', () => resetForm(false));
    });
  };

  const init = async () => {
    cacheDom();
    if (!dom.form || !dom.calendarState) return;
    const meta = document.querySelector('meta[name="api-base-url"]');
    if (meta && meta.content) API.init(meta.content);
    readQueryState();
    resetForm();
    dom.statusFilter.value = state.status;
    bindEvents();

    await Promise.allSettled([loadCategories(), loadSchedules(), loadCalendar()]);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
