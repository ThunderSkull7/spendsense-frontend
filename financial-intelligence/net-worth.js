/*
 * Manual net-worth tracking. Entries and dated valuations are editable
 * estimates; no ledger transaction is created by any action on this page.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI || !window.SpendSenseIntelligence) return;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;
  const H = window.SpendSenseIntelligence;
  const meta = document.querySelector('meta[name="api-base-url"]');
  if (meta) API.init(meta.content);

  const money = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);
  const CATEGORY_LABELS = {
    cash: 'Cash and savings',
    investment: 'Investments',
    other_asset: 'Other assets',
    loan: 'Loan',
    other_liability: 'Other liabilities',
  };
  const CATEGORIES = {
    asset: ['cash', 'investment', 'other_asset'],
    liability: ['loan', 'other_liability'],
  };

  const dom = {
    asOf: document.querySelector('#net-worth-as-of'),
    status: document.querySelector('#net-worth-status'),
    refresh: document.querySelector('[data-net-worth-refresh]'),
    message: document.querySelector('[data-net-worth-message]'),
    assets: document.querySelector('[data-net-worth="assets"]'),
    assetsNote: document.querySelector('[data-net-worth="assets-note"]'),
    liabilities: document.querySelector('[data-net-worth="liabilities"]'),
    liabilitiesNote: document.querySelector('[data-net-worth="liabilities-note"]'),
    net: document.querySelector('[data-net-worth="net"]'),
    entries: document.querySelector('[data-net-worth="entries"]'),
    unvalued: document.querySelector('[data-net-worth="unvalued"]'),
    listLabel: document.querySelector('[data-net-worth-list-label]'),
    categoryCount: document.querySelector('[data-net-worth-category-count]'),
    pageState: document.querySelector('[data-net-worth-page-state]'),
    list: document.querySelector('[data-net-worth-list]'),
    form: document.querySelector('[data-net-worth-form]'),
    formTitle: document.querySelector('[data-net-worth-form-title]'),
    formMessage: document.querySelector('[data-net-worth-form-message]'),
    name: document.querySelector('#net-worth-name'),
    type: document.querySelector('#net-worth-type'),
    category: document.querySelector('#net-worth-category'),
    institution: document.querySelector('#net-worth-institution'),
    value: document.querySelector('#net-worth-value'),
    date: document.querySelector('#net-worth-date'),
    notes: document.querySelector('#net-worth-notes'),
    openingFields: document.querySelectorAll('[data-net-worth-opening-field]'),
    createHelp: document.querySelector('[data-net-worth-create-help]'),
    cancel: document.querySelector('[data-net-worth-cancel]'),
    trendMonths: document.querySelector('#net-worth-trend-months'),
    trendState: document.querySelector('[data-net-worth-trend-state]'),
    trendBody: document.querySelector('[data-net-worth-trend-body]'),
    trend: document.querySelector('[data-net-worth-trend]'),
    trendEmpty: document.querySelector('[data-net-worth-trend-empty]'),
    trendRows: document.querySelector('[data-net-worth-trend-rows]'),
    trendNote: document.querySelector('[data-net-worth-trend-note]'),
    notesList: document.querySelector('[data-net-worth-notes]'),
  };

  let editingId = null;
  let entriesById = new Map();
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

  const fieldsFor = (type) => CATEGORIES[type] || CATEGORIES.asset;

  const populateCategories = (type, selected = null) => {
    if (!dom.category) return;
    dom.category.replaceChildren();
    fieldsFor(type).forEach((value) => {
      const option = el('option', '', CATEGORY_LABELS[value] || value);
      option.value = value;
      if (selected === value) option.selected = true;
      dom.category.appendChild(option);
    });
  };

  const badge = (text, tone = 'neutral') => el('span', `pill ${tone}`, text);

  const summaryCard = (label, value, note = '') => {
    const box = el('div', 'metric-mini');
    box.append(el('span', '', label), el('strong', '', value));
    if (note) box.appendChild(el('div', 'action-note', note));
    return box;
  };

  const renderSummary = (summary) => {
    setText(dom.assets, money(summary.total_assets));
    setText(dom.assetsNote, summary.has_valuation ? `${summary.category_totals?.length || 0} valued categories` : 'No valuations yet');
    setText(dom.liabilities, money(summary.total_liabilities));
    setText(dom.liabilitiesNote, 'Positive amounts owed');
    setText(dom.net, money(summary.net_worth));
    dom.net.classList.remove('pos', 'neg');
    dom.net.classList.add(H.netWorthTone(summary.net_worth));
    setText(dom.entries, summary.active_entry_count || 0);
    setText(dom.unvalued, summary.unvalued_entry_count
      ? `${summary.unvalued_entry_count} active entr${summary.unvalued_entry_count === 1 ? 'y is' : 'ies are'} unvalued at this date`
      : 'All active entries have a valuation');
    setText(dom.categoryCount, `${summary.category_totals?.length || 0} categories`);
    setText(dom.listLabel, `Values as of ${H.dateLabel(summary.as_of)} · ${H.statusLabel(dom.status.value)} view`);
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

  const renderHistory = async (card, entry) => {
    const holder = card.querySelector('[data-history-body]');
    if (!holder || holder.dataset.loaded === 'true') return;
    holder.replaceChildren(el('div', 'empty-inline', 'Loading valuation history…'));
    let result;
    try {
      result = await API.get(`/net-worth/${entry.id}?as_of=${encodeURIComponent(dom.asOf.value || H.todayIso())}`);
    } catch (error) {
      result = null;
    }
    if (!result || result.status !== 200 || !result.data?.data) {
      holder.replaceChildren(el('div', 'empty-inline', H.errorMessage(result, 'Could not load valuation history.')));
      return;
    }
    const valuations = Array.isArray(result.data.data.valuations) ? result.data.data.valuations : [];
    holder.replaceChildren();
    if (!valuations.length) {
      holder.appendChild(el('div', 'empty-inline', 'No valuations on or before this date.'));
    } else {
      const list = el('ul', 'history-list');
      valuations.forEach((valuation) => {
        const item = el('li');
        const left = el('div');
        left.append(el('div', '', H.dateLabel(valuation.valuation_date)));
        left.append(el('div', 'history-meta', valuation.note || 'No note'));
        item.append(left, el('strong', '', money(valuation.value)));
        list.appendChild(item);
      });
      holder.appendChild(list);
    }
    holder.dataset.loaded = 'true';
  };

  const createValuationForm = (entry) => {
    const form = el('form', 'intel-form');
    form.dataset.valuationForm = 'true';
    form.innerHTML = `
      <div class="form-grid">
        <div class="field">
          <label for="valuation-value-${entry.id}">New value</label>
          <input id="valuation-value-${entry.id}" name="value" type="number" min="0" step="0.01" inputmode="decimal" required placeholder="0.00" />
        </div>
        <div class="field">
          <label for="valuation-date-${entry.id}">Valuation date</label>
          <input id="valuation-date-${entry.id}" name="valuation_date" type="date" required />
        </div>
        <div class="field full">
          <label for="valuation-note-${entry.id}">Note <span class="help">(optional)</span></label>
          <input id="valuation-note-${entry.id}" name="note" type="text" maxlength="1000" placeholder="Monthly statement check" />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn primary sm" type="submit">Save valuation</button>
        <button class="btn ghost sm" type="button" data-valuation-cancel>Cancel</button>
      </div>
      <p class="intel-message" data-valuation-message role="status" aria-live="polite"></p>
    `;
    form.querySelector('[name="valuation_date"]').value = H.todayIso();
    return form;
  };

  const renderEntry = (entry) => {
    const card = el('article', `record-card ${entry.status === 'archived' ? 'archived' : ''}`);
    card.dataset.entryId = String(entry.id);

    const top = el('div', 'record-top');
    const titleWrap = el('div', 'record-title-wrap');
    titleWrap.append(
      el('div', 'record-title', entry.name),
      el('div', 'record-sub', [entry.institution, CATEGORY_LABELS[entry.category] || entry.category].filter(Boolean).join(' · '))
    );
    const badges = el('div', 'record-badges');
    badges.append(
      badge(H.entryTypeLabel(entry.type), entry.type === 'liability' ? 'amber' : 'green'),
      badge(H.statusLabel(entry.status), entry.status === 'active' ? 'green' : 'neutral')
    );
    top.append(titleWrap, badges);

    const amount = el('div', 'record-amount');
    const amountWrap = el('div');
    amountWrap.append(el('strong', '', entry.latest_value === null ? 'Not valued' : money(entry.latest_value)));
    amountWrap.append(el('div', 'record-date', entry.latest_valuation_date ? `Valued ${H.dateLabel(entry.latest_valuation_date)}` : 'No valuation on or before this date'));
    amount.append(amountWrap, el('span', 'record-date', `${entry.valuation_count || 0} snapshot${entry.valuation_count === 1 ? '' : 's'}`));

    const actions = el('div', 'record-actions');
    if (entry.status === 'active') {
      const edit = el('button', 'btn ghost sm', 'Edit');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      const valuation = el('button', 'btn secondary sm', 'Add valuation');
      valuation.type = 'button';
      valuation.dataset.action = 'valuation';
      const archive = el('button', 'btn ghost sm', 'Archive');
      archive.type = 'button';
      archive.dataset.action = 'archive';
      actions.append(edit, valuation, archive);
    } else {
      const restore = el('button', 'btn secondary sm', 'Restore');
      restore.type = 'button';
      restore.dataset.action = 'restore';
      actions.appendChild(restore);
    }

    const history = el('details', 'data-alt');
    history.appendChild(el('summary', '', `Valuation history (${entry.valuation_count || 0})`));
    const historyBody = el('div');
    historyBody.dataset.historyBody = 'true';
    history.appendChild(historyBody);
    history.addEventListener('toggle', () => {
      if (history.open) renderHistory(card, entry);
    });

    const valuationHolder = el('div');
    valuationHolder.dataset.valuationHolder = 'true';
    valuationHolder.hidden = true;

    card.append(top, amount, actions, history, valuationHolder);
    return card;
  };

  const renderEntries = (entries) => {
    entriesById = new Map(entries.map((entry) => [Number(entry.id), entry]));
    dom.list.replaceChildren();
    if (!entries.length) {
      dom.list.appendChild(el('div', 'empty-inline', 'No net worth entries match this view. Add an asset or liability to begin.'));
    } else {
      entries.forEach((entry) => dom.list.appendChild(renderEntry(entry)));
    }
  };

  const loadList = async () => {
    if (listLoading) return;
    listLoading = true;
    setMessage(dom.message, '');
    dom.list.hidden = true;
    dom.pageState.hidden = false;
    UI.renderState(dom.pageState, 'loading', { message: 'Loading manual entries…' });
    dom.refresh.disabled = true;

    let result;
    try {
      const query = new URLSearchParams();
      if (dom.status.value) query.set('status', dom.status.value);
      if (dom.asOf.value) query.set('as_of', dom.asOf.value);
      result = await API.get(`/net-worth?${query.toString()}`);
    } catch (error) {
      result = null;
    } finally {
      listLoading = false;
      dom.refresh.disabled = false;
    }

    if (!result || result.status !== 200 || !result.data?.data) {
      UI.renderState(dom.pageState, 'error', {
        message: H.errorMessage(result, 'Could not load net worth entries.'),
        retry: loadList,
      });
      return;
    }

    const data = result.data.data;
    dom.pageState.hidden = true;
    dom.list.hidden = false;
    renderSummary(data.summary || {});
    renderEntries(Array.isArray(data.entries) ? data.entries : []);
    dom.notesList.replaceChildren();
    (Array.isArray(data.notes) ? data.notes : []).forEach((note) => {
      if (typeof note === 'string' && note.trim()) dom.notesList.appendChild(el('li', '', note));
    });
  };

  const loadTrend = async () => {
    if (!dom.trendState) return;
    dom.trendBody.hidden = true;
    dom.trendState.hidden = false;
    UI.renderState(dom.trendState, 'loading', { message: 'Loading net worth trend…' });
    let result;
    try {
      const query = new URLSearchParams({ months: dom.trendMonths.value || '12' });
      if (dom.asOf.value) query.set('as_of', dom.asOf.value);
      result = await API.get(`/net-worth/trend?${query.toString()}`);
    } catch (error) {
      result = null;
    }

    if (!result || result.status !== 200 || !result.data?.data) {
      UI.renderState(dom.trendState, 'error', {
        message: H.errorMessage(result, 'Could not load the net worth trend.'),
        retry: loadTrend,
      });
      return;
    }

    const data = result.data.data;
    const points = Array.isArray(data.points) ? data.points : [];
    dom.trendState.hidden = true;
    dom.trendBody.hidden = false;
    dom.trend.replaceChildren();
    dom.trendEmpty.hidden = data.sufficient_history === true;
    const max = points.reduce((highest, point) => Math.max(highest, Math.abs(Number(point.net_worth) || 0)), 0) || 1;

    points.forEach((point) => {
      const column = el('div', 'trend-column');
      const value = Number(point.net_worth) || 0;
      const bar = el('div', `trend-bar ${value < 0 ? 'negative' : ''}`.trim());
      bar.style.height = `${Math.max(3, (Math.abs(value) / max) * 100)}%`;
      bar.title = `${H.monthLabel(point.month)}: ${money(point.net_worth)}`;
      column.append(
        el('span', 'trend-value', money(point.net_worth)),
        bar,
        el('span', 'trend-label', H.monthLabel(point.month, { short: true }))
      );
      dom.trend.appendChild(column);
    });

    rowTable(dom.trendRows, points.map((point) => [
      H.monthLabel(point.month),
      money(point.total_assets),
      money(point.total_liabilities),
      money(point.net_worth),
      point.valued_entries,
    ]), 5, 'No month-end valuations yet.');
    dom.trendNote.textContent = (Array.isArray(data.notes) ? data.notes.join(' ') : '');
  };

  const reload = async () => {
    await Promise.all([loadList(), loadTrend()]);
  };

  const resetForm = () => {
    editingId = null;
    dom.form.reset();
    dom.type.value = 'asset';
    populateCategories('asset');
    dom.date.value = H.todayIso();
    dom.formTitle.textContent = 'Add net worth entry';
    dom.cancel.hidden = true;
    dom.openingFields.forEach((field) => { field.hidden = false; });
    dom.value.required = true;
    dom.date.required = true;
    dom.createHelp.textContent = 'Liabilities are entered as the amount owed. A snapshot date can never be in the future.';
    dom.form.querySelector('button[type="submit"]').textContent = 'Save entry';
    setMessage(dom.formMessage, '');
  };

  const startEdit = (entry) => {
    editingId = entry.id;
    dom.name.value = entry.name || '';
    dom.type.value = entry.type || 'asset';
    populateCategories(entry.type || 'asset', entry.category);
    dom.institution.value = entry.institution || '';
    dom.notes.value = entry.notes || '';
    dom.openingFields.forEach((field) => { field.hidden = true; });
    dom.value.required = false;
    dom.date.required = false;
    dom.formTitle.textContent = 'Edit net worth entry';
    dom.cancel.hidden = false;
    dom.createHelp.textContent = 'The current value is changed through a dated valuation so history is preserved.';
    dom.form.querySelector('button[type="submit"]').textContent = 'Save changes';
    setMessage(dom.formMessage, '');
    dom.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    dom.name.focus({ preventScroll: true });
  };

  const submitForm = async (event) => {
    event.preventDefault();
    const type = dom.type.value;
    const body = {
      name: dom.name.value.trim(),
      type,
      category: dom.category.value,
      institution: dom.institution.value.trim() || null,
      notes: dom.notes.value.trim() || null,
    };
    if (!body.name || !body.category) {
      setMessage(dom.formMessage, 'Name and category are required.', 'error');
      return;
    }
    if (!editingId) {
      const value = Number(dom.value.value);
      if (!Number.isFinite(value) || value < 0 || dom.value.value === '') {
        setMessage(dom.formMessage, 'Enter a non-negative value with at most two decimal places.', 'error');
        return;
      }
      body.value = Number(value).toFixed(2);
      body.valuation_date = dom.date.value || H.todayIso();
      body.valuation_note = 'Opening valuation';
    }

    const submit = dom.form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setMessage(dom.formMessage, 'Saving…');
    let result;
    try {
      result = editingId
        ? await API.put(`/net-worth/${editingId}`, body)
        : await API.post('/net-worth', body);
    } catch (error) {
      result = null;
    } finally {
      submit.disabled = false;
    }

    if (!result || ![200, 201].includes(result.status) || result.data?.success !== true) {
      setMessage(dom.formMessage, H.errorMessage(result, 'Could not save this net worth entry.'), 'error');
      return;
    }

    setMessage(dom.formMessage, editingId ? 'Entry updated.' : 'Entry created with its opening valuation.', 'success');
    resetForm();
    await reload();
  };

  const actionRequest = async (entry, action) => {
    const label = action === 'archive' ? 'Archiving…' : 'Restoring…';
    setMessage(dom.message, label);
    let result;
    try {
      result = await API.post(`/net-worth/${entry.id}/${action}`, {});
    } catch (error) {
      result = null;
    }
    if (!result || result.status !== 200 || result.data?.success !== true) {
      setMessage(dom.message, H.errorMessage(result, `Could not ${action} this entry.`), 'error');
      return;
    }
    setMessage(dom.message, action === 'archive' ? 'Entry archived. History is preserved.' : 'Entry restored.', 'success');
    await reload();
  };

  const submitValuation = async (form, entry) => {
    const value = form.querySelector('[name="value"]');
    const date = form.querySelector('[name="valuation_date"]');
    const note = form.querySelector('[name="note"]');
    const message = form.querySelector('[data-valuation-message]');
    const number = Number(value.value);
    if (value.value === '' || !Number.isFinite(number) || number < 0) {
      setMessage(message, 'Enter a non-negative value.', 'error');
      return;
    }
    if (!date.value) {
      setMessage(message, 'Choose a valuation date.', 'error');
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setMessage(message, 'Saving…');
    let result;
    try {
      result = await API.post(`/net-worth/${entry.id}/valuations`, {
        value: Number(number).toFixed(2),
        valuation_date: date.value,
        note: note.value.trim() || null,
      });
    } catch (error) {
      result = null;
    } finally {
      submit.disabled = false;
    }

    if (!result || result.status !== 201 || result.data?.success !== true) {
      setMessage(message, H.errorMessage(result, 'Could not save this valuation.'), 'error');
      return;
    }
    setMessage(dom.message, 'Valuation saved; previous valuations are unchanged.', 'success');
    form.hidden = true;
    await reload();
  };

  dom.type.addEventListener('change', () => populateCategories(dom.type.value));
  dom.form.addEventListener('submit', submitForm);
  dom.cancel.addEventListener('click', resetForm);
  dom.refresh.addEventListener('click', reload);
  dom.status.addEventListener('change', loadList);
  dom.asOf.addEventListener('change', reload);
  dom.trendMonths.addEventListener('change', loadTrend);

  dom.list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    const card = event.target.closest('[data-entry-id]');
    if (!button || !card) return;
    const entry = entriesById.get(Number(card.dataset.entryId));
    if (!entry) return;
    const action = button.dataset.action;

    if (action === 'edit') {
      startEdit(entry);
      return;
    }
    if (action === 'archive' || action === 'restore') {
      button.disabled = true;
      await actionRequest(entry, action);
      button.disabled = false;
      return;
    }
    if (action === 'valuation') {
      const holder = card.querySelector('[data-valuation-holder]');
      if (!holder) return;
      if (!holder.hidden) {
        holder.hidden = true;
        return;
      }
      holder.replaceChildren(createValuationForm(entry));
      holder.hidden = false;
      holder.querySelector('form').addEventListener('submit', (submitEvent) => {
        submitEvent.preventDefault();
        submitValuation(submitEvent.currentTarget, entry);
      });
      holder.querySelector('[data-valuation-cancel]').addEventListener('click', () => { holder.hidden = true; });
      holder.querySelector('[name="value"]').focus();
    }
  });

  resetForm();
  if (dom.asOf) dom.asOf.value = H.todayIso();
  reload();
});
