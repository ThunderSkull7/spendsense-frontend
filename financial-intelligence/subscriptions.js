/*
 * Manual subscription tracker. This module never cancels a provider
 * subscription, never pays a bill and never creates an expense row.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI || !window.SpendSenseIntelligence) return;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;
  const H = window.SpendSenseIntelligence;
  const meta = document.querySelector('meta[name="api-base-url"]');
  if (meta) API.init(meta.content);

  const money = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);

  const dom = {
    filters: document.querySelector('[data-subscription-filters]'),
    search: document.querySelector('#subscription-search'),
    statusFilter: document.querySelector('#subscription-status-filter'),
    linkFilter: document.querySelector('#subscription-link-filter'),
    asOf: document.querySelector('#subscription-as-of'),
    message: document.querySelector('[data-subscription-message]'),
    active: document.querySelector('[data-subscription="active"]'),
    counts: document.querySelector('[data-subscription="counts"]'),
    monthly: document.querySelector('[data-subscription="monthly"]'),
    annual: document.querySelector('[data-subscription="annual"]'),
    due: document.querySelector('[data-subscription="due"]'),
    overdue: document.querySelector('[data-subscription="overdue"]'),
    listLabel: document.querySelector('[data-subscription-list-label]'),
    total: document.querySelector('[data-subscription-total]'),
    pageState: document.querySelector('[data-subscription-page-state]'),
    list: document.querySelector('[data-subscription-list]'),
    form: document.querySelector('[data-subscription-form]'),
    formTitle: document.querySelector('[data-subscription-form-title]'),
    formHelp: document.querySelector('[data-subscription-form-help]'),
    formMessage: document.querySelector('[data-subscription-form-message]'),
    name: document.querySelector('#subscription-name'),
    provider: document.querySelector('#subscription-provider'),
    linked: document.querySelector('#subscription-linked'),
    amount: document.querySelector('#subscription-amount'),
    frequency: document.querySelector('#subscription-frequency'),
    renewal: document.querySelector('#subscription-renewal'),
    category: document.querySelector('#subscription-category'),
    status: document.querySelector('#subscription-status'),
    notes: document.querySelector('#subscription-notes'),
    cancel: document.querySelector('[data-subscription-cancel]'),
    upcomingWindow: document.querySelector('[data-subscription-upcoming-window]'),
    upcomingCount: document.querySelector('[data-subscription-upcoming-count]'),
    upcomingRows: document.querySelector('[data-subscription-upcoming-rows]'),
    upcomingNote: document.querySelector('[data-subscription-upcoming-note]'),
  };

  let subscriptions = [];
  let schedules = [];
  let editing = null;
  let listLoading = false;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const setText = (node, value) => {
    if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
  };

  const setMessage = (node, text, type = '') => {
    if (!node) return;
    node.textContent = text || '';
    node.classList.remove('error', 'success');
    if (type) node.classList.add(type);
  };

  const badge = (text, tone = 'neutral') => el('span', `pill ${tone}`, text);

  const metric = (label, value, note = '') => {
    const box = el('div', 'metric-mini');
    box.append(el('span', '', label), el('strong', '', value));
    if (note) box.appendChild(el('div', 'action-note', note));
    return box;
  };

  const rowTable = (body, rows, columns, emptyText) => {
    if (!body) return;
    body.replaceChildren();
    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'cell-sub', emptyText);
      td.colSpan = columns;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = el('tr');
      row.forEach((cell, index) => {
        const td = el('td', index === row.length - 1 ? 'num' : '');
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

  const updateSummary = (summary) => {
    setText(dom.active, summary.active_count || 0);
    setText(dom.counts, `${summary.total_count || 0} total · ${summary.linked_count || 0} linked · ${summary.standalone_count || 0} standalone`);
    setText(dom.monthly, money(summary.estimated_monthly_cost));
    setText(dom.annual, money(summary.estimated_annual_cost));
    setText(dom.due, money(summary.due_within_30_days_amount));
    setText(dom.overdue, summary.overdue_count
      ? `${summary.overdue_count} overdue renewal${summary.overdue_count === 1 ? '' : 's'}`
      : `${summary.due_within_30_days_count || 0} renewal${summary.due_within_30_days_count === 1 ? '' : 's'} due within 30 days`);
    setText(dom.total, `${summary.total_count || 0} tracker${summary.total_count === 1 ? '' : 's'}`);
    setText(dom.listLabel, `As of ${H.dateLabel(summary.as_of)} · paused and cancelled trackers are excluded from estimates`);
  };

  const renewalLabel = (item) => {
    if (!item.next_renewal_date) return 'No renewal date';
    const days = Number(item.days_until_renewal);
    if (Number.isFinite(days) && days < 0) return `${H.dateLabel(item.next_renewal_date)} · overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
    if (Number.isFinite(days) && days === 0) return `${H.dateLabel(item.next_renewal_date)} · due today`;
    if (Number.isFinite(days)) return `${H.dateLabel(item.next_renewal_date)} · in ${days} day${days === 1 ? '' : 's'}`;
    return H.dateLabel(item.next_renewal_date);
  };

  const renderEntry = (item) => {
    const card = el('article', 'record-card');
    card.dataset.subscriptionId = String(item.id);

    const top = el('div', 'record-top');
    const titleWrap = el('div', 'record-title-wrap');
    titleWrap.append(
      el('div', 'record-title', item.name),
      el('div', 'record-sub', item.provider || (item.is_linked ? `Linked to ${item.schedule?.description || 'a bill'}` : 'Standalone tracker'))
    );
    const badges = el('div', 'record-badges');
    badges.append(badge(H.statusLabel(item.effective_status), H.statusTone(item.effective_status)));
    badges.append(badge(item.is_linked ? 'Linked bill' : 'Standalone', item.is_linked ? 'blue' : 'neutral'));
    if (item.is_linked && item.schedule_status && item.schedule_status !== 'active') {
      badges.append(badge(`Bill ${H.statusLabel(item.schedule_status)}`, H.statusTone(item.schedule_status)));
    }
    top.append(titleWrap, badges);

    const amount = el('div', 'record-amount');
    const amountWrap = el('div');
    amountWrap.append(el('strong', '', money(item.amount)));
    amountWrap.append(el('div', 'record-date', `${H.frequencyLabel(item.frequency)} · ${money(item.monthly_cost)}/month · ${money(item.annual_cost)}/year`));
    amount.append(amountWrap, el('span', 'record-date', renewalLabel(item)));

    const meta = el('div', 'detail-grid');
    const categoryLabel = item.category?.name || 'No category';
    const statusNote = item.is_linked
      ? `Tracker: ${H.statusLabel(item.status)} · bill: ${H.statusLabel(item.schedule_status || 'unknown')}`
      : `Tracker: ${H.statusLabel(item.status)}`;
    [[`Category`, categoryLabel], ['Status detail', statusNote]].forEach(([label, value]) => {
      meta.append(el('dt', '', label), el('dd', '', value));
    });

    const actions = el('div', 'record-actions');
    const edit = el('button', 'btn ghost sm', 'Edit');
    edit.type = 'button';
    edit.dataset.action = 'edit';
    actions.appendChild(edit);

    if (item.status !== 'active') {
      const activate = el('button', 'btn ghost sm', 'Activate');
      activate.type = 'button';
      activate.dataset.action = 'set-status';
      activate.dataset.status = 'active';
      actions.appendChild(activate);
    }
    if (item.status !== 'paused') {
      const pause = el('button', 'btn ghost sm', 'Pause');
      pause.type = 'button';
      pause.dataset.action = 'set-status';
      pause.dataset.status = 'paused';
      actions.appendChild(pause);
    }
    if (item.status !== 'cancelled') {
      const cancel = el('button', 'btn ghost sm', 'Mark cancelled');
      cancel.type = 'button';
      cancel.dataset.action = 'set-status';
      cancel.dataset.status = 'cancelled';
      actions.appendChild(cancel);
    }

    card.append(top, amount, meta, actions);
    if (item.notes) card.appendChild(el('p', 'action-note', item.notes));
    if (item.is_linked) card.appendChild(el('p', 'action-note', 'Amount, frequency, category and renewal are read from the linked bill. Cancel a tracker here only after handling the provider directly.'));
    return card;
  };

  const renderList = (items) => {
    subscriptions = items;
    dom.list.replaceChildren();
    if (!items.length) {
      dom.list.appendChild(el('div', 'empty-inline', 'No subscription trackers match these filters. Add one on the right to start tracking.'));
    } else {
      items.forEach((item) => dom.list.appendChild(renderEntry(item)));
    }
  };

  const renderUpcoming = (items, windowDays) => {
    setText(dom.upcomingCount, `${items.length} renewal${items.length === 1 ? '' : 's'}`);
    setText(dom.upcomingWindow, `Next ${windowDays} days, including overdue active renewals`);
    rowTable(dom.upcomingRows, items.map((item) => [
      { text: renewalLabel(item), className: '' },
      { text: item.name, className: '' },
      { text: item.provider || '—', className: '' },
      { text: H.statusLabel(item.effective_status), className: '' },
      { text: money(item.amount), className: 'num' },
      { text: money(item.monthly_cost), className: 'num' },
    ]), 6, 'No active renewal dates in this window.');
    dom.upcomingNote.textContent = items.some((item) => item.is_overdue)
      ? 'Overdue renewals are shown for awareness only. They are not re-dated, paid or turned into expenses by this page.'
      : 'Renewal dates and amounts are expectations based on this manual tracker.';
  };

  const loadList = async () => {
    if (listLoading) return;
    listLoading = true;
    setMessage(dom.message, '');
    dom.list.hidden = true;
    dom.pageState.hidden = false;
    UI.renderState(dom.pageState, 'loading', { message: 'Loading subscriptions…' });

    const query = new URLSearchParams();
    if (dom.search.value.trim()) query.set('search', dom.search.value.trim());
    if (dom.statusFilter.value) query.set('status', dom.statusFilter.value);
    if (dom.linkFilter.value) query.set('link', dom.linkFilter.value);
    if (dom.asOf.value) query.set('as_of', dom.asOf.value);

    let result;
    try {
      result = await API.get(`/subscriptions?${query.toString()}`);
    } catch (error) {
      result = null;
    } finally {
      listLoading = false;
    }

    if (!result || result.status !== 200 || !result.data?.data) {
      UI.renderState(dom.pageState, 'error', {
        message: H.errorMessage(result, 'Could not load subscriptions.'),
        retry: loadList,
      });
      return;
    }

    const data = result.data.data;
    dom.pageState.hidden = true;
    dom.list.hidden = false;
    updateSummary(data.summary || {});
    renderList(Array.isArray(data.subscriptions) ? data.subscriptions : []);
    renderUpcoming(Array.isArray(data.upcoming_renewals) ? data.upcoming_renewals : [], data.upcoming_window_days || 60);
  };

  const addCategoryOptions = (categories) => {
    const current = dom.category.value;
    dom.category.replaceChildren(el('option', '', 'No category'));
    dom.category.firstChild.value = '';
    categories.filter((category) => category.type === 'expense').forEach((category) => {
      const option = el('option', '', category.name);
      option.value = String(category.id);
      dom.category.appendChild(option);
    });
    if (current) dom.category.value = current;
  };

  const addScheduleOptions = () => {
    const current = dom.linked.value;
    dom.linked.replaceChildren();
    const standalone = el('option', '', 'Standalone subscription');
    standalone.value = '';
    dom.linked.appendChild(standalone);
    schedules.forEach((schedule) => {
      const option = el('option', '', `${schedule.description || 'Recurring expense'} · ${money(schedule.amount)} · ${H.frequencyLabel(schedule.frequency)}${schedule.status && schedule.status !== 'active' ? ` · ${H.statusLabel(schedule.status)}` : ''}`);
      option.value = String(schedule.id);
      option.disabled = schedule.status === 'stopped';
      if (current === String(schedule.id)) option.selected = true;
      dom.linked.appendChild(option);
    });
    if (current) dom.linked.value = current;
  };

  const loadReferences = async () => {
    const [categoriesResult, schedulesResult] = await Promise.allSettled([
      API.get('/categories'),
      API.get('/recurring-expenses'),
    ]);
    if (categoriesResult.status === 'fulfilled' && categoriesResult.value?.status === 200) {
      addCategoryOptions(Array.isArray(categoriesResult.value.data?.data) ? categoriesResult.value.data.data : []);
    }
    if (schedulesResult.status === 'fulfilled' && schedulesResult.value?.status === 200) {
      schedules = Array.isArray(schedulesResult.value.data?.data?.schedules) ? schedulesResult.value.data.data.schedules : [];
      addScheduleOptions();
    }
  };

  const toggleLinkedFields = () => {
    const linked = dom.linked.value !== '';
    const editingLinked = editing?.is_linked === true;
    const hideDerived = linked || editingLinked;
    [dom.amount, dom.frequency, dom.renewal, dom.category].forEach((field) => {
      const wrapper = field.closest('.field');
      if (wrapper) wrapper.hidden = hideDerived;
    });
    dom.amount.required = !hideDerived;
    dom.frequency.required = !hideDerived;
    dom.renewal.required = !hideDerived;
    if (hideDerived) {
      dom.formHelp.textContent = linked
        ? 'This tracker will read amount, frequency, category and renewal from the selected bill.'
        : 'Amount, frequency, category and renewal are read from the linked bill. Manage them on the Bills page.';
    } else {
      dom.formHelp.textContent = 'Standalone trackers need their own amount, frequency and renewal date.';
    }
  };

  const resetForm = () => {
    editing = null;
    dom.form.reset();
    dom.name.value = '';
    dom.provider.value = '';
    dom.linked.disabled = false;
    dom.linked.value = '';
    dom.status.value = 'active';
    dom.formTitle.textContent = 'Add subscription';
    dom.cancel.hidden = true;
    dom.form.querySelector('button[type="submit"]').textContent = 'Save subscription';
    toggleLinkedFields();
    setMessage(dom.formMessage, '');
  };

  const startEdit = (item) => {
    editing = item;
    dom.name.value = item.name || '';
    dom.provider.value = item.provider || '';
    dom.linked.disabled = true;
    if (item.is_linked && item.schedule) {
      if (![...dom.linked.options].some((option) => option.value === String(item.schedule.id))) {
        const option = el('option', '', item.schedule.description || 'Linked bill');
        option.value = String(item.schedule.id);
        dom.linked.appendChild(option);
      }
      dom.linked.value = String(item.schedule.id);
    } else {
      dom.linked.value = '';
    }
    dom.amount.value = item.is_linked ? '' : H.cleanMoney(item.amount);
    dom.frequency.value = item.frequency || 'monthly';
    dom.renewal.value = item.next_renewal_date || '';
    dom.category.value = item.category?.id ? String(item.category.id) : '';
    dom.status.value = item.status || 'active';
    dom.notes.value = item.notes || '';
    dom.formTitle.textContent = 'Edit subscription';
    dom.cancel.hidden = false;
    dom.form.querySelector('button[type="submit"]').textContent = 'Save changes';
    toggleLinkedFields();
    setMessage(dom.formMessage, item.is_linked
      ? 'Linked schedule values are read-only here. Change the bill on the Bills page.'
      : 'Standalone tracker details can be edited here.');
    dom.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dom.name.focus({ preventScroll: true });
  };

  const submit = async (event) => {
    event.preventDefault();
    const name = dom.name.value.trim();
    if (!name) {
      setMessage(dom.formMessage, 'Name is required.', 'error');
      return;
    }
    const linked = editing ? editing.is_linked : dom.linked.value !== '';
    const body = {
      name,
      provider: dom.provider.value.trim() || null,
      status: dom.status.value,
      notes: dom.notes.value.trim() || null,
    };

    if (!editing && linked) {
      body.recurring_expense_id = Number(dom.linked.value);
    } else if (!linked) {
      const amount = Number(dom.amount.value);
      if (dom.amount.value === '' || !Number.isFinite(amount) || amount <= 0) {
        setMessage(dom.formMessage, 'Enter an amount greater than zero.', 'error');
        return;
      }
      if (!dom.frequency.value) {
        setMessage(dom.formMessage, 'Choose a billing frequency.', 'error');
        return;
      }
      if (!dom.renewal.value) {
        setMessage(dom.formMessage, 'Choose the next renewal date.', 'error');
        return;
      }
      body.amount = Number(amount).toFixed(2);
      body.frequency = dom.frequency.value;
      body.next_renewal_date = dom.renewal.value;
      body.category_id = dom.category.value ? Number(dom.category.value) : null;
    }

    const button = dom.form.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage(dom.formMessage, 'Saving…');
    let result;
    try {
      result = editing
        ? await API.put(`/subscriptions/${editing.id}`, body)
        : await API.post('/subscriptions', body);
    } catch (error) {
      result = null;
    } finally {
      button.disabled = false;
    }

    if (!result || ![200, 201].includes(result.status) || result.data?.success !== true) {
      setMessage(dom.formMessage, H.errorMessage(result, 'Could not save this subscription.'), 'error');
      return;
    }
    setMessage(dom.formMessage, editing ? 'Subscription updated.' : 'Subscription tracker created. No payment or expense was created.', 'success');
    resetForm();
    await loadList();
  };

  const setStatus = async (item, status) => {
    setMessage(dom.message, 'Updating tracker status…');
    let result;
    try {
      result = await API.put(`/subscriptions/${item.id}`, { status });
    } catch (error) {
      result = null;
    }
    if (!result || result.status !== 200 || result.data?.success !== true) {
      setMessage(dom.message, H.errorMessage(result, 'Could not update this tracker.'), 'error');
      return;
    }
    setMessage(dom.message, status === 'cancelled'
      ? 'Tracker marked cancelled. This did not cancel anything with the provider.'
      : `Tracker marked ${H.statusLabel(status).toLowerCase()}.`, 'success');
    await loadList();
  };

  dom.form.addEventListener('submit', submit);
  dom.cancel.addEventListener('click', resetForm);
  dom.linked.addEventListener('change', toggleLinkedFields);
  dom.filters.addEventListener('submit', (event) => {
    event.preventDefault();
    loadList();
  });

  dom.list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    const card = event.target.closest('[data-subscription-id]');
    if (!button || !card) return;
    const item = subscriptions.find((row) => Number(row.id) === Number(card.dataset.subscriptionId));
    if (!item) return;
    if (button.dataset.action === 'edit') {
      startEdit(item);
      return;
    }
    if (button.dataset.action === 'set-status') {
      button.disabled = true;
      await setStatus(item, button.dataset.status);
      button.disabled = false;
    }
  });

  if (dom.asOf) dom.asOf.value = H.todayIso();
  resetForm();
  loadReferences().then(() => loadList());
});
