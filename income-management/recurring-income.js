// Recurring income schedules on the Income page.
// The backend remains the source of truth for recurrence dates, limits,
// receipt linking and owner isolation. This module only renders and submits.
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
  };

  const OCCURRENCE_LABELS = {
    planned: 'Planned',
    received: 'Received',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  };

  const STATUS_TONES = {
    active: 'green',
    paused: 'amber',
    stopped: 'neutral',
    planned: 'blue',
    received: 'green',
    overdue: 'amber',
    cancelled: 'neutral',
  };

  const addMonthsInput = (dateString, months) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    const target = new Date(year, month - 1 + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(
      target.getDate()
    ).padStart(2, '0')}`;
  };

  const scheduleNextLabel = (schedule, formatDate) => {
    const format = typeof formatDate === 'function' ? formatDate : (value) => String(value || '');
    const plan = schedule || {};

    if (plan.status === 'stopped') return 'Stopped — future dates cancelled';
    if (plan.status === 'paused') {
      return plan.next_due_date
        ? `Paused — next planned ${format(plan.next_due_date)}`
        : 'Paused — no upcoming dates';
    }

    return plan.next_due_date ? `Next due ${format(plan.next_due_date)}` : 'No upcoming dates';
  };

  const helpers = {
    frequencyLabel: (value) => FREQUENCY_LABELS[value] || String(value || ''),
    scheduleStatusLabel: (value) => STATUS_LABELS[value] || String(value || ''),
    occurrenceStatusLabel: (value) => OCCURRENCE_LABELS[value] || String(value || ''),
    statusTone: (value) => STATUS_TONES[value] || 'neutral',
    addMonthsInput,
    scheduleNextLabel,
  };

  window.SpendSenseRecurring = helpers;

  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

    const metaBase = document.querySelector('meta[name="api-base-url"]');
    if (metaBase) window.SpendSenseAPI.init(metaBase.content);

    const UI = window.SpendSenseUI;
    const api = window.SpendSenseAPI;
    const money = (value) => UI.formatMoney(value);

    const form = document.querySelector('.recurring-form');
    if (!form) return;

    const listState = document.querySelector('[data-recurring-list-state]');
    const list = document.querySelector('[data-recurring-list]');
    const formTitle = document.querySelector('[data-recurring-form-title]');
    const formSub = document.querySelector('[data-recurring-form-sub]');
    const nameInput = form.querySelector('#recurring-name');
    const amountInput = form.querySelector('#recurring-amount');
    const frequencyInput = form.querySelector('#recurring-frequency');
    const startInput = form.querySelector('#recurring-start');
    const endInput = form.querySelector('#recurring-end');
    const notesInput = form.querySelector('#recurring-notes');
    const message = form.querySelector('[data-recurring-message]');
    const submitBtn = form.querySelector('[data-recurring-submit]');
    const previewButton = form.querySelector('[data-recurring-preview-button]');
    const previewPanel = form.querySelector('[data-recurring-preview]');
    const previewCount = form.querySelector('[data-recurring-preview-count]');
    const previewTotal = form.querySelector('[data-recurring-preview-total]');
    const previewDates = form.querySelector('[data-recurring-preview-dates]');
    const cancelEditBtn = form.querySelector('[data-recurring-cancel]');
    const newScheduleLink = document.querySelector('[data-recurring-new]');

    const schedulesById = new Map();
    const expandedSchedules = new Set();
    let editingScheduleId = null;
    let pendingRecurringKey = null;
    let loadingSchedules = false;
    let reloadSchedules = false;
    let previewTimer = null;
    let previewSequence = 0;

    form.addEventListener('input', () => { pendingRecurringKey = null; });
    form.addEventListener('change', () => { pendingRecurringKey = null; });

    const errorDetail = (data, fallback) => {
      if (data && data.errors) {
        const first = Object.values(data.errors)[0];
        if (Array.isArray(first) && first.length) return first[0];
      }
      return (data && data.message) || fallback;
    };

    const setMessage = (text, type) => {
      if (!message) return;
      message.textContent = text || '';
      message.classList.remove('error', 'success');
      if (type) message.classList.add(type);
    };

    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const setDefaultDates = () => {
      const start = UI.todayInputValue();
      if (startInput) startInput.value = start;
      if (endInput) endInput.value = addMonthsInput(start, 3);
    };

    const hidePreview = () => {
      previewSequence += 1;
      if (previewPanel) previewPanel.hidden = true;
      if (previewDates) previewDates.replaceChildren();
    };

    const clearForm = () => {
      form.reset();
      if (frequencyInput) frequencyInput.value = 'weekly';
      setDefaultDates();
      if (notesInput) notesInput.value = '';
      hidePreview();
    };

    const exitEditMode = () => {
      editingScheduleId = null;
      if (formTitle) formTitle.textContent = 'New schedule';
      if (formSub) formSub.textContent = 'Preview the expected dates before saving.';
      if (submitBtn) submitBtn.textContent = 'Create schedule';
      if (cancelEditBtn) cancelEditBtn.hidden = true;
      clearForm();
      setMessage('');
    };

    const enterEditMode = (schedule) => {
      pendingRecurringKey = null;
      if (!schedule || schedule.status === 'stopped') return;
      editingScheduleId = schedule.id;

      if (nameInput) nameInput.value = schedule.name || '';
      if (amountInput) amountInput.value = schedule.amount != null ? String(schedule.amount) : '';
      if (frequencyInput) frequencyInput.value = schedule.frequency || 'weekly';
      if (startInput) startInput.value = String(schedule.start_date || '').slice(0, 10);
      if (endInput) endInput.value = String(schedule.end_date || '').slice(0, 10);
      if (notesInput) notesInput.value = schedule.notes || '';

      if (formTitle) formTitle.textContent = 'Edit schedule';
      if (formSub) formSub.textContent = 'Only future, unreceived dates are rebuilt.';
      if (submitBtn) submitBtn.textContent = 'Save changes';
      if (cancelEditBtn) cancelEditBtn.hidden = false;
      setMessage('Editing this schedule. Received and past dates are preserved.', '');
      requestPreview(false);
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (nameInput) nameInput.focus({ preventScroll: true });
    };

    const setSummary = (summary) => {
      const value = summary || {};
      const text = (key, content) => {
        document.querySelectorAll(`[data-recurring-summary="${key}"]`).forEach((node) => {
          node.textContent = content;
        });
      };

      text('expected_total', money(value.expected_total || 0));
      text('received_total', money(value.received_total || 0));
      text('overdue_total', money(value.overdue_total || 0));
      text('active_count', String(value.active_count || 0));

      const overdue = Number(value.overdue_count || 0);
      const total = Number(value.active_count || 0) + Number(value.paused_count || 0) + Number(value.stopped_count || 0);
      text('overdue_count', overdue ? `${overdue} overdue ${overdue === 1 ? 'date' : 'dates'}` : 'No overdue dates');
      document.querySelectorAll('[data-recurring-summary="overdue_total"]').forEach((node) => {
        node.classList.toggle('warn', overdue > 0);
      });
      text(
        'status_breakdown',
        total
          ? `${total} total · ${value.paused_count || 0} paused · ${value.stopped_count || 0} stopped`
          : 'No schedules yet'
      );
    };

    const pill = (status, label) => {
      const node = element('span', `pill ${helpers.statusTone(status)}`, label);
      return node;
    };

    const figure = (label, value, sub, tone) => {
      const node = element('div', 'schedule-figure');
      node.append(element('span', 'schedule-figure-label', label));
      const amount = element('strong', `schedule-figure-value${tone ? ` ${tone}` : ''}`, value);
      node.append(amount);
      if (sub) node.append(element('span', 'schedule-figure-sub', sub));
      return node;
    };

    const actionButton = (label, action, scheduleId, className) => {
      const button = element('button', className || 'btn secondary sm', label);
      button.type = 'button';
      button.dataset.scheduleAction = action;
      button.dataset.scheduleId = scheduleId;
      return button;
    };

    const renderSummaryFromSchedules = (schedules) => {
      const summary = { active_count: 0, paused_count: 0, stopped_count: 0 };
      schedules.forEach((schedule) => {
        const key = `${schedule.status}_count`;
        summary[key] = (summary[key] || 0) + 1;
      });
      return summary;
    };

    const buildScheduleCard = (schedule) => {
      const card = element('article', 'schedule-card');
      card.dataset.scheduleId = schedule.id;

      const head = element('div', 'schedule-card-head');
      const titleWrap = element('div', 'schedule-title-wrap');
      titleWrap.append(
        element('h4', 'schedule-name', schedule.name || 'Recurring income'),
        element(
          'p',
          'schedule-meta',
          `${helpers.frequencyLabel(schedule.frequency)} · ${UI.formatDate(schedule.start_date)} – ${UI.formatDate(
            schedule.end_date
          )}`
        )
      );
      head.append(titleWrap, pill(schedule.status, helpers.scheduleStatusLabel(schedule.status)));
      card.append(head);

      const summary = schedule.summary || {};
      const figures = element('div', 'schedule-figures');
      figures.append(
        figure('Expected', money(summary.expected_total || 0), 'Expected, not actual'),
        figure('Received', money(summary.received_total || 0), 'Actual linked income', 'pos'),
        figure(
          'Overdue',
          money(summary.overdue_total || 0),
          summary.overdue_count
            ? `${summary.overdue_count} ${summary.overdue_count === 1 ? 'date' : 'dates'}`
            : 'None',
          summary.overdue_count ? 'warn' : ''
        )
      );
      card.append(figures);

      const foot = element('div', 'schedule-foot');
      foot.append(
        element('span', 'schedule-next', helpers.scheduleNextLabel(schedule, UI.formatDate))
      );

      const actions = element('div', 'schedule-actions');
      const detailId = `schedule-occurrences-${schedule.id}`;
      const toggle = actionButton(
        expandedSchedules.has(schedule.id) ? 'Hide dates' : 'View dates',
        'toggle',
        schedule.id,
        'btn ghost sm'
      );
      toggle.setAttribute('aria-expanded', expandedSchedules.has(schedule.id) ? 'true' : 'false');
      toggle.setAttribute('aria-controls', detailId);
      actions.append(toggle);

      if (schedule.status !== 'stopped') {
        actions.append(actionButton('Edit', 'edit', schedule.id));
        if (schedule.status === 'active') {
          actions.append(actionButton('Pause', 'pause', schedule.id));
        } else {
          actions.append(actionButton('Resume', 'resume', schedule.id));
        }
        actions.append(actionButton('Stop', 'stop', schedule.id, 'btn danger-ghost sm'));
      }
      foot.append(actions);
      card.append(foot);

      const detail = element('div', 'schedule-detail');
      detail.id = detailId;
      detail.setAttribute('role', 'region');
      detail.setAttribute('aria-label', `${schedule.name || 'Recurring income'} dates`);
      detail.hidden = !expandedSchedules.has(schedule.id);
      card.append(detail);

      card.addEventListener('click', (event) => {
        const button = event.target.closest('[data-schedule-action]');
        if (!button) return;
        handleScheduleAction(button.dataset.scheduleAction, button.dataset.scheduleId, button);
      });

      if (expandedSchedules.has(schedule.id)) {
        loadOccurrences(schedule.id, detail);
      }

      return card;
    };

    const renderSchedules = (schedules) => {
      if (!list) return;
      list.replaceChildren();
      schedulesById.clear();

      if (!schedules.length) {
        list.hidden = true;
        if (listState) {
          listState.hidden = false;
          UI.renderState(listState, 'empty', {
            message: 'No recurring income schedules yet. Create one to plan expected payments.',
            action: { href: '#recurring-form', label: 'Create schedule' },
          });
        }
        return;
      }

      if (listState) listState.hidden = true;
      list.hidden = false;

      schedules.forEach((schedule) => {
        schedulesById.set(String(schedule.id), schedule);
        list.append(buildScheduleCard(schedule));
      });
    };

    const loadSchedules = async () => {
      if (loadingSchedules) {
        reloadSchedules = true;
        return;
      }
      loadingSchedules = true;

      if (listState) {
        listState.hidden = false;
        UI.renderState(listState, 'loading', { message: 'Loading recurring income…' });
      }
      if (list) list.hidden = true;

      try {
        const { data, status } = await api.get('/recurring-incomes');
        if (status !== 200 || !data || !data.data) {
          if (listState) {
            listState.hidden = false;
            UI.renderState(listState, 'error', {
              message: errorDetail(data, 'Could not load recurring income schedules.'),
              retry: loadSchedules,
            });
          }
          return;
        }

        const schedules = data.data.schedules || [];
        setSummary(data.data.summary || renderSummaryFromSchedules(schedules));
        renderSchedules(schedules);
      } catch (err) {
        if (listState) {
          listState.hidden = false;
          UI.renderState(listState, 'error', {
            message: 'Could not reach the API. ' + (err.message || ''),
            retry: loadSchedules,
          });
        }
      } finally {
        loadingSchedules = false;
        if (reloadSchedules) {
          reloadSchedules = false;
          loadSchedules();
        }
      }
    };

    const occurrenceActionLabel = (occurrence) => {
      if (occurrence.display_status === 'received') return 'Correct';
      if (occurrence.display_status === 'planned' || occurrence.display_status === 'overdue') return 'Mark received';
      return '';
    };

    const buildReceiptForm = (schedule, occurrence, mode) => {
      const formNode = element('form', 'receipt-form');
      formNode.dataset.mode = mode;
      formNode.dataset.scheduleId = schedule.id;
      formNode.dataset.occurrenceId = occurrence.id;
      let pendingReceiptKey = null;

      formNode.addEventListener('input', () => { pendingReceiptKey = null; });
      formNode.addEventListener('change', () => { pendingReceiptKey = null; });

      const fields = element('div', 'receipt-fields');
      const amountField = element('div', 'field');
      const amountLabel = element('label', '', 'Actual received amount');
      amountLabel.htmlFor = `receipt-amount-${occurrence.id}`;
      const amount = element('input');
      amount.id = amountLabel.htmlFor;
      amount.type = 'number';
      amount.step = '0.01';
      amount.min = '0.01';
      amount.max = '99999999.99';
      amount.required = true;
      amount.value = occurrence.actual_amount || occurrence.expected_amount || '';
      amountField.append(amountLabel, amount);

      const dateField = element('div', 'field');
      const dateLabel = element('label', '', 'Actual received date');
      dateLabel.htmlFor = `receipt-date-${occurrence.id}`;
      const date = element('input');
      date.id = dateLabel.htmlFor;
      date.type = 'date';
      date.required = true;
      date.value = String(occurrence.actual_received_date || occurrence.occurrence_date || '').slice(0, 10);
      dateField.append(dateLabel, date);

      fields.append(amountField, dateField);

      const actions = element('div', 'receipt-actions');
      const save = element('button', 'btn primary sm', mode === 'correct' ? 'Save correction' : 'Confirm received');
      save.type = 'submit';
      const cancel = element('button', 'btn ghost sm', 'Cancel');
      cancel.type = 'button';
      actions.append(save, cancel);

      const receiptMessage = element('p', 'receipt-message');
      receiptMessage.setAttribute('role', 'status');
      receiptMessage.setAttribute('aria-live', 'polite');

      formNode.append(fields, actions, receiptMessage);

      cancel.addEventListener('click', () => {
        const row = formNode.closest('.receipt-editor-row');
        if (row) row.remove();
      });

      formNode.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (formNode.dataset.submitting === 'true') return;

        const amountValue = parseFloat(amount.value);
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          receiptMessage.textContent = 'Enter an amount greater than zero.';
          receiptMessage.classList.add('error');
          amount.focus();
          return;
        }
        if (!date.value) {
          receiptMessage.textContent = 'Choose the actual received date.';
          receiptMessage.classList.add('error');
          date.focus();
          return;
        }

        formNode.dataset.submitting = 'true';
        save.disabled = true;
        cancel.disabled = true;
        receiptMessage.classList.remove('error');
        receiptMessage.textContent = mode === 'correct' ? 'Saving correction…' : 'Recording receipt…';

        const endpoint =
          mode === 'correct'
            ? `/recurring-incomes/${schedule.id}/occurrences/${occurrence.id}/receipt`
            : `/recurring-incomes/${schedule.id}/occurrences/${occurrence.id}/receive`;

        try {
          const payload = {
            actual_amount: amountValue,
            actual_received_date: date.value,
          };
          const { data, status } =
            mode === 'correct'
              ? await api.put(endpoint, payload)
              : await api.post(endpoint, payload, {
                  'Idempotency-Key': (pendingReceiptKey ||= api.newIdempotencyKey()),
                });

          if (status === 200) {
            pendingReceiptKey = null;
            UI.showToast(mode === 'correct' ? 'Receipt corrected' : 'Income marked received', 'success');
            expandedSchedules.add(schedule.id);
            await loadSchedules();
          } else {
            receiptMessage.textContent = errorDetail(
              data,
              mode === 'correct' ? 'Could not correct this receipt.' : 'Could not mark this date received.'
            );
            receiptMessage.classList.add('error');
            save.disabled = false;
            cancel.disabled = false;
          }
        } catch (err) {
          receiptMessage.textContent = 'Could not save this receipt. ' + (err.message || '');
          receiptMessage.classList.add('error');
          save.disabled = false;
          cancel.disabled = false;
        } finally {
          formNode.dataset.submitting = 'false';
        }
      });

      return formNode;
    };

    const buildOccurrenceTable = (schedule, occurrences, detail) => {
      const wrap = element('div', 'table-wrap recurring-table-wrap');
      const table = element('table', 'table recurring-occurrence-table');
      const caption = element('caption', 'sr-only', `Planned and received dates for ${schedule.name || 'recurring income'}`);
      table.append(caption);
      const thead = element('thead');
      const headRow = element('tr');
      ['Date', 'Status', 'Expected', 'Received', 'Actions'].forEach((label, index) => {
        const th = element('th', index === 2 || index === 3 ? 'num' : index === 4 ? 'actions-heading' : '', label);
        th.scope = 'col';
        headRow.append(th);
      });
      thead.append(headRow);

      const tbody = element('tbody');
      const occurrenceById = new Map();
      occurrences.forEach((occurrence) => occurrenceById.set(String(occurrence.id), occurrence));

      occurrences.forEach((occurrence) => {
        const row = element('tr');
        row.dataset.occurrenceId = occurrence.id;

        const dateCell = element('td', 'col-tight', UI.formatDate(occurrence.occurrence_date));
        const statusCell = element('td', 'col-tight');
        statusCell.append(pill(occurrence.display_status || occurrence.status, helpers.occurrenceStatusLabel(occurrence.display_status || occurrence.status)));
        const expectedCell = element('td', 'num col-tight', money(occurrence.expected_amount));

        const actualCell = element('td', 'num col-tight');
        if (occurrence.actual_amount != null) {
          actualCell.append(element('div', 'amount-pos', money(occurrence.actual_amount)));
          if (occurrence.actual_received_date) {
            actualCell.append(element('div', 'cell-sub', UI.formatDate(occurrence.actual_received_date)));
          }
        } else {
          actualCell.textContent = '—';
        }

        const actionCell = element('td', 'col-tight actions-cell');
        const actionLabel = occurrenceActionLabel(occurrence);
        if (actionLabel) {
          const action = element('button', 'row-btn secondary', actionLabel);
          action.type = 'button';
          action.dataset.receiptAction = occurrence.display_status === 'received' ? 'correct' : 'receive';
          action.dataset.occurrenceId = occurrence.id;
          actionCell.append(action);
        }

        row.append(dateCell, statusCell, expectedCell, actualCell, actionCell);
        tbody.append(row);
      });

      tbody.addEventListener('click', (event) => {
        const action = event.target.closest('[data-receipt-action]');
        if (!action) return;
        const occurrence = occurrenceById.get(String(action.dataset.occurrenceId));
        if (!occurrence) return;

        detail.querySelectorAll('.receipt-editor-row').forEach((row) => row.remove());

        const row = action.closest('tr');
        const editorRow = element('tr', 'receipt-editor-row');
        const cell = element('td');
        cell.colSpan = 5;
        cell.append(buildReceiptForm(schedule, occurrence, action.dataset.receiptAction));
        editorRow.append(cell);
        row.after(editorRow);
        const firstInput = editorRow.querySelector('input');
        if (firstInput) firstInput.focus();
      });

      table.append(thead, tbody);
      wrap.append(table);
      return wrap;
    };

    async function loadOccurrences(scheduleId, detail, force = false) {
      if (!detail) return;
      if (detail.dataset.loaded === 'true' && !force) return;

      detail.hidden = false;
      detail.replaceChildren();
      const loading = element('div', 'state loading');
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-busy', 'true');
      const spinner = element('span', 'spinner');
      spinner.setAttribute('aria-hidden', 'true');
      loading.append(spinner, element('p', '', 'Loading dates…'));
      detail.append(loading);

      try {
        const { data, status } = await api.get(`/recurring-incomes/${scheduleId}`);
        if (status !== 200 || !data || !data.data) {
          detail.replaceChildren();
          UI.renderState(detail, 'error', {
            message: errorDetail(data, 'Could not load schedule dates.'),
            retry: () => loadOccurrences(scheduleId, detail, true),
          });
          return;
        }

        const schedule = data.data;
        const occurrences = schedule.occurrences || [];
        detail.replaceChildren();

        if (!occurrences.length) {
          UI.renderState(detail, 'empty', { message: 'This schedule has no occurrence dates.' });
        } else {
          detail.append(buildOccurrenceTable(schedule, occurrences, detail));
        }
        detail.dataset.loaded = 'true';
        schedulesById.set(String(schedule.id), schedule);
      } catch (err) {
        detail.replaceChildren();
        UI.renderState(detail, 'error', {
          message: 'Could not reach the API. ' + (err.message || ''),
          retry: () => loadOccurrences(scheduleId, detail, true),
        });
      }
    }

    const handleScheduleAction = async (action, scheduleId, button) => {
      const schedule = schedulesById.get(String(scheduleId));
      if (!schedule) return;

      if (action === 'edit') {
        enterEditMode(schedule);
        return;
      }

      if (action === 'toggle') {
        const card = button.closest('.schedule-card');
        const detail = card ? card.querySelector('.schedule-detail') : null;
        const opening = !expandedSchedules.has(schedule.id);

        if (opening) {
          expandedSchedules.add(schedule.id);
        } else {
          expandedSchedules.delete(schedule.id);
        }

        if (detail) detail.hidden = !opening;
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
        button.textContent = opening ? 'Hide dates' : 'View dates';
        if (opening) loadOccurrences(schedule.id, detail);
        return;
      }

      if (action === 'stop') {
        const confirmed = window.confirm(
          'Stop this schedule? Future planned dates will be cancelled. Received income and past history will be kept.'
        );
        if (!confirmed) return;
      }

      button.disabled = true;
      try {
        const { data, status } = await api.post(`/recurring-incomes/${schedule.id}/${action}`);
        if (status === 200) {
          const label = action === 'pause' ? 'Schedule paused' : action === 'resume' ? 'Schedule resumed' : 'Schedule stopped';
          UI.showToast(label, 'success');
          if (action === 'stop' && editingScheduleId === schedule.id) {
            exitEditMode();
          }
          expandedSchedules.add(schedule.id);
          await loadSchedules();
        } else {
          button.disabled = false;
          UI.showToast(errorDetail(data, `Could not ${action} this schedule.`), 'error');
        }
      } catch (err) {
        button.disabled = false;
        UI.showToast(`Could not ${action} this schedule. ` + (err.message || ''), 'error');
      }
    };

    const readPreviewPayload = () => {
      const amount = parseFloat(amountInput ? amountInput.value : '');
      const startDate = startInput ? startInput.value : '';
      const endDate = endInput ? endInput.value : '';
      const frequency = frequencyInput ? frequencyInput.value : 'weekly';

      if (!Number.isFinite(amount) || amount <= 0 || !startDate || !endDate) return null;
      if (endDate < startDate) return null;
      return { amount, frequency, start_date: startDate, end_date: endDate };
    };

    const renderPreview = (data) => {
      if (!previewPanel || !previewCount || !previewTotal || !previewDates) return;
      const count = Number(data.count || 0);
      const dates = data.dates || [];

      previewCount.textContent = `${count} expected ${count === 1 ? 'date' : 'dates'}`;
      previewTotal.textContent = money(data.total_expected || 0);
      previewDates.replaceChildren();

      dates.slice(0, 14).forEach((date) => {
        const item = element('li');
        const time = element('time', '', UI.formatDate(date));
        time.dateTime = date;
        item.append(time);
        previewDates.append(item);
      });
      if (dates.length > 14) {
        previewDates.append(element('li', 'muted', `…and ${dates.length - 14} more`));
      }

      previewPanel.hidden = false;
    };

    const requestPreview = async (announce) => {
      const payload = readPreviewPayload();
      if (!payload) {
        hidePreview();
        if (announce) setMessage('Enter a positive amount and a valid start and end date.', 'error');
        return;
      }

      const sequence = ++previewSequence;
      try {
        const { data, status } = await api.post('/recurring-incomes/preview', payload);
        if (sequence !== previewSequence) return;

        if (status === 200 && data && data.data) {
          renderPreview(data.data);
          if (announce) setMessage('Preview updated. These dates are expected, not posted income.', 'success');
        } else {
          hidePreview();
          if (announce) setMessage(errorDetail(data, 'Could not calculate the expected dates.'), 'error');
        }
      } catch (err) {
        if (sequence !== previewSequence) return;
        hidePreview();
        if (announce) setMessage('Could not calculate the expected dates. ' + (err.message || ''), 'error');
      }
    };

    const schedulePreview = () => {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => requestPreview(false), 350);
    };

    if (startInput) {
      startInput.addEventListener('change', () => {
        if (startInput.value && (!endInput.value || endInput.value < startInput.value)) {
          if (endInput) endInput.value = addMonthsInput(startInput.value, 3);
        }
        schedulePreview();
      });
    }

    [amountInput, frequencyInput, endInput].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', schedulePreview);
      input.addEventListener('change', schedulePreview);
    });

    if (previewButton) {
      previewButton.addEventListener('click', () => requestPreview(true));
    }

    if (newScheduleLink) {
      newScheduleLink.addEventListener('click', () => {
        exitEditMode();
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (nameInput) nameInput.focus({ preventScroll: true });
      });
    }

    if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', exitEditMode);
    }

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (form.dataset.submitting === 'true') return;

        const name = nameInput ? nameInput.value.trim() : '';
        const amount = parseFloat(amountInput ? amountInput.value : '');
        const startDate = startInput ? startInput.value : '';
        const endDate = endInput ? endInput.value : '';
        const frequency = frequencyInput ? frequencyInput.value : 'weekly';
        const notes = notesInput ? notesInput.value.trim() || null : null;

        if (!name) return setMessage('Enter a name or income source.', 'error');
        if (!Number.isFinite(amount) || amount <= 0) return setMessage('Enter an amount greater than zero.', 'error');
        if (!startDate || !endDate) return setMessage('Choose a start and end date.', 'error');
        if (endDate < startDate) return setMessage('The end date must be on or after the start date.', 'error');

        form.dataset.submitting = 'true';
        if (submitBtn) submitBtn.disabled = true;
        if (previewButton) previewButton.disabled = true;
        setMessage(editingScheduleId ? 'Saving changes…' : 'Creating schedule…');

        const payload = {
          name,
          amount,
          frequency,
          start_date: startDate,
          end_date: endDate,
          notes,
        };

        try {
          const result = editingScheduleId
            ? await api.put(`/recurring-incomes/${editingScheduleId}`, payload)
            : await api.post('/recurring-incomes', payload, {
                'Idempotency-Key': (pendingRecurringKey ||= api.newIdempotencyKey()),
              });

          const ok = editingScheduleId ? result.status === 200 : result.status === 201;
          if (ok) {
            pendingRecurringKey = null;
            const saved = result.data && result.data.data;
            UI.showToast(editingScheduleId ? 'Schedule updated' : 'Schedule created', 'success');
            if (saved && saved.id) expandedSchedules.add(saved.id);
            exitEditMode();
            await loadSchedules();
          } else {
            setMessage(
              errorDetail(result.data, editingScheduleId ? 'Could not update the schedule.' : 'Could not create the schedule.'),
              'error'
            );
          }
        } catch (err) {
          setMessage('Could not save the schedule. ' + (err.message || ''), 'error');
        } finally {
          form.dataset.submitting = 'false';
          if (submitBtn) submitBtn.disabled = false;
          if (previewButton) previewButton.disabled = false;
        }
      });
    }

    setDefaultDates();
    loadSchedules();
  });
})();
