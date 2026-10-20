// Savings goals — manual contribution ledger with no transaction side effects.
(function () {
  'use strict';

  const progressPercent = (saved, target) => {
    const savedNumber = Number(saved);
    const targetNumber = Number(target);
    if (!Number.isFinite(savedNumber) || !Number.isFinite(targetNumber) || targetNumber <= 0) return 0;
    return Math.round((savedNumber / targetNumber) * 10000) / 100;
  };

  const progressBarPercent = (saved, target) => Math.max(0, Math.min(100, progressPercent(saved, target)));

  const goalStatusLabel = (status) => ({
    active: 'Active',
    completed: 'Completed',
    archived: 'Archived',
  }[status] || 'Active');

  const goalStatusTone = (status) => ({
    active: 'blue',
    completed: 'green',
    archived: 'neutral',
  }[status] || 'neutral');

  const entryLabel = (type) => (type === 'correction' ? 'Correction' : 'Contribution');

  const helpers = {
    progressPercent,
    progressBarPercent,
    goalStatusLabel,
    goalStatusTone,
    entryLabel,
    isArchived: (goal) => goal && goal.status === 'archived',
  };

  if (typeof window !== 'undefined') window.SpendSenseGoals = helpers;

  const boot = () => {
    const API = window.SpendSenseAPI;
    const UI = window.SpendSenseUI;
    if (!API || !UI) return;

    const meta = document.querySelector('meta[name="api-base-url"]');
    if (meta && meta.content) API.init(meta.content);

    const state = {
      data: null,
      filter: 'all',
      editingId: null,
      action: null,
      loading: false,
      pendingGoalKey: null,
      pendingEntryKeys: new Map(),
    };

    const dom = {
      form: document.querySelector('.goal-form'),
      formTitle: document.querySelector('[data-goal-form-title]'),
      formMessage: document.querySelector('[data-goal-message]'),
      submit: document.querySelector('.goal-form button[type="submit"]'),
      cancelEdit: document.querySelector('[data-goal-cancel-edit]'),
      list: document.querySelector('[data-goals-list]'),
      state: document.querySelector('[data-goals-state]'),
      count: document.querySelector('[data-goal-summary-count]'),
      reload: document.querySelector('[data-goal-reload]'),
      summaryActive: document.querySelector('[data-goal-summary-active]'),
      summarySaved: document.querySelector('[data-goal-summary-saved]'),
      summaryTarget: document.querySelector('[data-goal-summary-target]'),
      summaryCompleted: document.querySelector('[data-goal-summary-completed]'),
    };

    const fields = dom.form ? {
      name: dom.form.querySelector('#goal-name'),
      target: dom.form.querySelector('#goal-target'),
      date: dom.form.querySelector('#goal-date'),
      description: dom.form.querySelector('#goal-description'),
      notes: dom.form.querySelector('#goal-notes'),
    } : {};

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = String(text);
      return node;
    };

    const money = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);
    const formatDate = (value) => (value ? UI.formatDate(value) : 'No target date');

    const errorDetail = (data, fallback) => {
      if (data && data.errors && typeof data.errors === 'object') {
        const first = Object.values(data.errors).flat().filter(Boolean)[0];
        if (first) return first;
      }
      if (data && typeof data.message === 'string' && data.message.trim()) return data.message;
      return fallback;
    };

    const setFormMessage = (text, type) => {
      if (!dom.formMessage) return;
      dom.formMessage.textContent = text || '';
      dom.formMessage.classList.remove('success', 'error');
      if (type) dom.formMessage.classList.add(type);
    };

    const resetGoalForm = () => {
      if (!dom.form) return;
      dom.form.reset();
      state.pendingGoalKey = null;
      state.editingId = null;
      if (dom.cancelEdit) dom.cancelEdit.hidden = true;
      if (dom.submit) dom.submit.textContent = 'Create goal';
      if (dom.formTitle) dom.formTitle.textContent = 'New savings goal';
      setFormMessage('');
    };

    const enterEditMode = (goal) => {
      if (!dom.form || !goal) return;
      state.editingId = goal.id;
      state.action = null;
      state.pendingGoalKey = null;
      fields.name.value = goal.name || '';
      fields.target.value = goal.target_amount || '';
      fields.date.value = goal.target_date ? String(goal.target_date).slice(0, 10) : '';
      fields.description.value = goal.description || '';
      fields.notes.value = goal.notes || '';
      if (dom.submit) dom.submit.textContent = 'Update goal';
      if (dom.cancelEdit) dom.cancelEdit.hidden = false;
      if (dom.formTitle) dom.formTitle.textContent = 'Edit savings goal';
      setFormMessage('Editing this goal — saving keeps every contribution unchanged.');
      renderGoals();
      dom.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fields.name.focus();
    };

    if (dom.form) {
      dom.form.addEventListener('input', () => {
        state.pendingGoalKey = null;
        setFormMessage('');
      });
      dom.form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (dom.form.dataset.submitting === 'true') return;

        const name = fields.name.value.trim();
        const target = parseFloat(fields.target.value);
        const targetDate = fields.date.value || null;

        if (!name) return setFormMessage('Please enter a goal name.', 'error');
        if (!Number.isFinite(target) || target <= 0) {
          return setFormMessage('Please enter a target amount greater than zero.', 'error');
        }

        const payload = {
          name,
          target_amount: target,
          target_date: targetDate,
          description: fields.description.value.trim() || null,
          notes: fields.notes.value.trim() || null,
        };

        dom.form.dataset.submitting = 'true';
        if (dom.submit) {
          dom.submit.disabled = true;
          dom.submit.textContent = state.editingId ? 'Updating…' : 'Creating…';
        }
        setFormMessage(state.editingId ? 'Updating goal…' : 'Creating goal…');

        try {
          const response = state.editingId
            ? await API.put(`/savings-goals/${state.editingId}`, payload)
            : await API.post('/savings-goals', payload, {
                'Idempotency-Key': (state.pendingGoalKey ||= API.newIdempotencyKey()),
              });
          const { data, status } = response;
          const expected = state.editingId ? 200 : 201;

          if (status === expected) {
            const wasEditing = Boolean(state.editingId);
            state.pendingGoalKey = null;
            resetGoalForm();
            setFormMessage(wasEditing ? 'Goal updated.' : 'Goal created.', 'success');
            UI.showToast(wasEditing ? 'Savings goal updated' : 'Savings goal created', 'success');
            await loadGoals();
          } else {
            setFormMessage(errorDetail(data, 'Could not save this goal.'), 'error');
          }
        } catch (error) {
          setFormMessage(`Could not save this goal. ${error.message || ''}`.trim(), 'error');
        } finally {
          dom.form.dataset.submitting = 'false';
          if (dom.submit) {
            dom.submit.disabled = false;
            dom.submit.textContent = state.editingId ? 'Update goal' : 'Create goal';
          }
        }
      });
    }

    if (dom.cancelEdit) {
      dom.cancelEdit.addEventListener('click', () => {
        resetGoalForm();
        renderGoals();
      });
    }

    const renderSummary = (summary = {}) => {
      if (dom.summaryActive) dom.summaryActive.textContent = String(summary.active_count || 0);
      if (dom.summarySaved) dom.summarySaved.textContent = money(summary.total_saved || 0);
      if (dom.summaryTarget) dom.summaryTarget.textContent = money(summary.total_target || 0);
      if (dom.summaryCompleted) dom.summaryCompleted.textContent = String(summary.completed_count || 0);
      if (dom.count) {
        const goals = state.data && Array.isArray(state.data.goals) ? state.data.goals : [];
        dom.count.textContent = goals.length
          ? `${goals.length} goal${goals.length === 1 ? '' : 's'} · manual tracking only`
          : 'No goals yet · manual tracking only';
      }
    };

    const renderHistory = (goal) => {
      const entries = Array.isArray(goal.contributions) ? goal.contributions : [];
      const details = el('details', 'goal-history');
      const summary = el('summary', '', `History (${entries.length})`);
      details.appendChild(summary);

      if (!entries.length) {
        details.appendChild(el('p', 'goal-history-note', 'No contributions recorded yet.'));
        return details;
      }

      const list = el('ul', 'goal-history-list');
      entries.forEach((entry) => {
        const item = el('li');
        const type = el('span', `pill ${entry.type === 'correction' ? 'amber' : 'green'}`, entryLabel(entry.type));
        const note = el('span', 'goal-history-note', entry.note || 'No note');
        const right = el('span', 'goal-history-date');
        const amount = el(
          'strong',
          `goal-history-amount${entry.type === 'correction' ? ' correction' : ''}`,
          `${entry.type === 'correction' ? '−' : '+'}${money(entry.amount)}`
        );
        right.append(amount, document.createTextNode(' · '), document.createTextNode(formatDate(entry.contributed_at)));
        item.append(type, note, right);
        list.appendChild(item);
      });
      details.appendChild(list);
      return details;
    };

    const renderActionPanel = (goal) => {
      if (!state.action || state.action.goalId !== goal.id) return null;
      const type = state.action.type;
      const isCorrection = type === 'correction';
      const panel = el('div', 'goal-entry-panel');
      panel.appendChild(el('h4', '', isCorrection ? 'Correct saved amount' : 'Record a contribution'));
      panel.appendChild(el(
        'p',
        'help',
        isCorrection
          ? 'Adds a positive correction that reduces the saved total. A reason is required and the correction cannot exceed the current saved amount.'
          : 'This records money you set aside. It does not create an expense or income transaction.'
      ));

      const form = el('form', 'goal-entry-form');
      form.noValidate = true;
      form.dataset.goalEntry = '';
      form.dataset.goalId = String(goal.id);
      form.dataset.entryType = type;

      const amountField = el('div', 'field');
      const amountLabel = el('label', '', 'Amount');
      amountLabel.htmlFor = `entry-amount-${goal.id}`;
      const amount = el('input');
      amount.id = amountLabel.htmlFor;
      amount.name = 'amount';
      amount.type = 'number';
      amount.min = '0.01';
      amount.step = '0.01';
      amount.required = true;
      amount.placeholder = '0.00';
      amount.setAttribute('aria-describedby', `entry-help-${goal.id}`);
      amountField.append(amountLabel, amount);

      const dateField = el('div', 'field');
      const dateLabel = el('label', '', 'Date');
      dateLabel.htmlFor = `entry-date-${goal.id}`;
      const date = el('input');
      date.id = dateLabel.htmlFor;
      date.name = 'contributed_at';
      date.type = 'date';
      date.max = UI.todayInputValue();
      date.value = UI.todayInputValue();
      dateField.append(dateLabel, date);

      const noteField = el('div', 'field field-note');
      const noteLabel = el('label', '', isCorrection ? 'Reason (required)' : 'Note (optional)');
      noteLabel.htmlFor = `entry-note-${goal.id}`;
      const note = el('textarea');
      note.id = noteLabel.htmlFor;
      note.name = 'note';
      note.rows = 2;
      note.maxLength = 500;
      note.required = isCorrection;
      note.placeholder = isCorrection ? 'Why is the saved amount being reduced?' : 'Optional note';
      noteField.append(noteLabel, note);

      const actions = el('div', 'goal-entry-actions');
      const submit = el('button', 'btn primary sm', isCorrection ? 'Record correction' : 'Add contribution');
      submit.type = 'submit';
      const cancel = el('button', 'btn ghost sm', 'Cancel');
      cancel.type = 'button';
      cancel.dataset.goalCancelAction = '';
      const message = el('p', 'goal-entry-message');
      message.setAttribute('aria-live', 'polite');
      message.id = `entry-help-${goal.id}`;
      actions.append(submit, cancel, message);

      form.append(amountField, dateField, noteField, actions);
      form.addEventListener('input', () => {
        state.pendingEntryKeys.delete(`${goal.id}:${type}`);
        message.textContent = '';
      });
      panel.appendChild(form);
      return panel;
    };

    const renderGoal = (goal) => {
      const archived = goal.status === 'archived';
      const card = el('article', 'goal-card');
      card.dataset.goalId = String(goal.id);

      const head = el('div', 'goal-card-head');
      const titleWrap = el('div', 'goal-title-wrap');
      titleWrap.appendChild(el('h3', 'goal-title', goal.name));
      if (goal.description) titleWrap.appendChild(el('p', 'goal-description', goal.description));

      const badges = el('div', 'goal-badges');
      badges.appendChild(el('span', `pill ${goalStatusTone(goal.status)}`, goalStatusLabel(goal.status)));
      if (goal.is_overdue) badges.appendChild(el('span', 'pill danger', 'Target date passed'));
      else if (goal.target_date && !archived) badges.appendChild(el('span', 'pill neutral', formatDate(goal.target_date)));
      if (goal.overfunded_amount && Number(goal.overfunded_amount) > 0) {
        badges.appendChild(el('span', 'pill green', `+${money(goal.overfunded_amount)} over target`));
      }
      head.append(titleWrap, badges);

      const amounts = el('div', 'goal-amounts');
      const saved = el('span', 'goal-saved');
      saved.append(document.createTextNode('Saved '), el('strong', '', money(goal.saved_amount)));
      saved.append(document.createTextNode(` of ${money(goal.target_amount)}`));
      const target = el(
        'span',
        'goal-target',
        archived ? 'Archived goal' : `${money(goal.remaining_amount)} remaining`
      );
      amounts.append(saved, target);

      const progressWrap = el('div', 'goal-progress');
      const percentage = progressBarPercent(goal.saved_amount, goal.target_amount);
      const progress = el(
        'div',
        `progress${Number(goal.progress_percent) >= 100 ? ' danger' : percentage >= 80 ? ' warn' : ''}`
      );
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', `${goal.name} savings progress`);
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');
      progress.setAttribute('aria-valuenow', String(Math.round(percentage)));
      progress.setAttribute(
        'aria-valuetext',
        `${money(goal.saved_amount)} of ${money(goal.target_amount)}, ${goal.progress_percent}%`
      );
      const fill = el('span');
      fill.style.width = `${Math.max(percentage > 0 ? 3 : 0, percentage)}%`;
      progress.appendChild(fill);
      const meta = el('div', 'goal-progress-meta');
      meta.append(
        el('span', '', `${goal.progress_percent}% saved`),
        el('span', '', goal.target_date ? `Target ${formatDate(goal.target_date)}` : 'No target date')
      );
      progressWrap.append(progress, meta);

      card.append(head, amounts, progressWrap);
      if (goal.notes) card.appendChild(el('p', 'goal-notes', goal.notes));

      const actions = el('div', 'goal-actions');
      if (!archived) {
        const add = el('button', 'btn primary sm', 'Add contribution');
        add.type = 'button';
        add.dataset.goalAdd = '';
        add.setAttribute('aria-label', `Add a contribution to ${goal.name}`);
        actions.appendChild(add);

        if (Number(goal.saved_amount) > 0) {
          const correct = el('button', 'btn secondary sm', 'Correct');
          correct.type = 'button';
          correct.dataset.goalCorrect = '';
          correct.setAttribute('aria-label', `Correct the saved amount for ${goal.name}`);
          actions.appendChild(correct);
        }

        const edit = el('button', 'btn secondary sm', 'Edit');
        edit.type = 'button';
        edit.dataset.goalEdit = '';
        edit.setAttribute('aria-label', `Edit ${goal.name}`);
        actions.appendChild(edit);

        const archive = el('button', 'btn ghost sm', 'Archive');
        archive.type = 'button';
        archive.dataset.goalArchive = '';
        archive.setAttribute('aria-label', `Archive ${goal.name}`);
        actions.appendChild(archive);
      } else {
        const restore = el('button', 'btn secondary sm', 'Restore');
        restore.type = 'button';
        restore.dataset.goalRestore = '';
        restore.setAttribute('aria-label', `Restore ${goal.name}`);
        actions.appendChild(restore);
      }
      card.appendChild(actions);

      const entry = renderActionPanel(goal);
      if (entry) card.appendChild(entry);
      card.appendChild(renderHistory(goal));
      return card;
    };

    const renderGoals = () => {
      if (!dom.list || !dom.state) return;
      dom.list.replaceChildren();
      const goals = state.data && Array.isArray(state.data.goals) ? state.data.goals : [];
      const visible = state.filter === 'all'
        ? goals
        : goals.filter((goal) => goal.status === state.filter);

      renderSummary(state.data ? state.data.summary : {});

      if (!visible.length) {
        dom.list.hidden = true;
        dom.state.hidden = false;
        if (!goals.length) {
          UI.renderState(dom.state, 'empty', {
            message: 'No savings goals yet. Create a target and track contributions manually.',
            action: { href: '#goal-form', label: 'Create your first goal' },
          });
        } else {
          UI.renderState(dom.state, 'empty', {
            message: `No ${state.filter} goals. Choose another filter to see the rest.`,
            action: { href: '#goals', label: 'Show all goals' },
          });
        }
        return;
      }

      dom.state.hidden = true;
      dom.list.hidden = false;
      visible.forEach((goal) => dom.list.appendChild(renderGoal(goal)));
      const activeEntry = dom.list.querySelector('.goal-entry-form input[name="amount"]');
      if (activeEntry) activeEntry.focus();
    };

    const loadGoals = async () => {
      if (state.loading) return;
      state.loading = true;
      if (dom.list) dom.list.hidden = true;
      if (dom.state) {
        dom.state.hidden = false;
        UI.renderState(dom.state, 'loading', { message: 'Loading savings goals…' });
      }

      try {
        const { data, status } = await API.get('/savings-goals');
        if (status !== 200) throw new Error(errorDetail(data, 'Could not load savings goals.'));
        state.data = data.data;
        renderGoals();
      } catch (error) {
        if (dom.state) {
          UI.renderState(dom.state, 'error', {
            message: error.message || 'Could not load savings goals.',
            retry: loadGoals,
          });
        }
      } finally {
        state.loading = false;
      }
    };

    const findGoal = (id) => (state.data && state.data.goals || []).find((goal) => String(goal.id) === String(id));

    if (dom.list) {
      dom.list.addEventListener('click', async (event) => {
        const filter = event.target.closest('[data-goal-filter]');
        if (filter) return;

        const add = event.target.closest('[data-goal-add]');
        const correct = event.target.closest('[data-goal-correct]');
        const edit = event.target.closest('[data-goal-edit]');
        const archive = event.target.closest('[data-goal-archive]');
        const restore = event.target.closest('[data-goal-restore]');
        const cancel = event.target.closest('[data-goal-cancel-action]');

        if (cancel) {
          state.action = null;
          renderGoals();
          return;
        }

        if (add || correct) {
          const card = (add || correct).closest('.goal-card');
          const goal = findGoal(card.dataset.goalId);
          if (!goal) return;
          const type = add ? 'contribution' : 'correction';
          state.action = { goalId: goal.id, type };
          renderGoals();
          return;
        }

        if (edit) {
          const goal = findGoal(edit.closest('.goal-card').dataset.goalId);
          if (goal) enterEditMode(goal);
          return;
        }

        if (archive) {
          const goal = findGoal(archive.closest('.goal-card').dataset.goalId);
          if (!goal || !window.confirm(`Archive "${goal.name}"? Contributions stay in history and the goal becomes read-only.`)) return;
          archive.disabled = true;
          try {
            const { data, status } = await API.post(`/savings-goals/${goal.id}/archive`);
            if (status !== 200) {
              UI.showToast(errorDetail(data, 'Could not archive this goal.'), 'error');
              archive.disabled = false;
              return;
            }
            state.action = null;
            UI.showToast('Savings goal archived', 'success');
            await loadGoals();
          } catch (error) {
            archive.disabled = false;
            UI.showToast(`Could not archive this goal. ${error.message || ''}`.trim(), 'error');
          }
          return;
        }

        if (restore) {
          const goal = findGoal(restore.closest('.goal-card').dataset.goalId);
          if (!goal) return;
          restore.disabled = true;
          try {
            const { data, status } = await API.post(`/savings-goals/${goal.id}/restore`);
            if (status !== 200) {
              UI.showToast(errorDetail(data, 'Could not restore this goal.'), 'error');
              restore.disabled = false;
              return;
            }
            UI.showToast('Savings goal restored', 'success');
            await loadGoals();
          } catch (error) {
            restore.disabled = false;
            UI.showToast(`Could not restore this goal. ${error.message || ''}`.trim(), 'error');
          }
        }
      });

      dom.list.addEventListener('submit', async (event) => {
        const form = event.target.closest('[data-goal-entry]');
        if (!form) return;
        event.preventDefault();

        const goalId = form.dataset.goalId;
        const type = form.dataset.entryType === 'correction' ? 'correction' : 'contribution';
        const amountInput = form.querySelector('input[name="amount"]');
        const dateInput = form.querySelector('input[name="contributed_at"]');
        const noteInput = form.querySelector('textarea[name="note"]');
        const message = form.querySelector('.goal-entry-message');
        const submit = form.querySelector('button[type="submit"]');
        const amount = parseFloat(amountInput.value);

        const fail = (text) => {
          if (message) message.textContent = text;
          amountInput.focus();
        };

        if (!Number.isFinite(amount) || amount <= 0) return fail('Enter an amount greater than zero.');
        if (type === 'correction' && !noteInput.value.trim()) return fail('A correction reason is required.');
        if (dateInput.value && dateInput.value > UI.todayInputValue()) {
          return fail('The contribution date cannot be in the future.');
        }

        const key = `${goalId}:${type}`;
        const payload = {
          amount,
          contributed_at: dateInput.value || UI.todayInputValue(),
          note: noteInput.value.trim() || null,
        };
        const headers = {
          'Idempotency-Key': state.pendingEntryKeys.get(key) || API.newIdempotencyKey(),
        };
        state.pendingEntryKeys.set(key, headers['Idempotency-Key']);

        if (submit) {
          submit.disabled = true;
          submit.textContent = type === 'correction' ? 'Correcting…' : 'Adding…';
        }
        if (message) message.textContent = '';

        try {
          const endpoint = type === 'correction'
            ? `/savings-goals/${goalId}/corrections`
            : `/savings-goals/${goalId}/contributions`;
          const { data, status } = await API.post(endpoint, payload, headers);
          if (status !== 201) {
            if (message) message.textContent = errorDetail(data, 'Could not record this entry.');
            if (submit) {
              submit.disabled = false;
              submit.textContent = type === 'correction' ? 'Record correction' : 'Add contribution';
            }
            return;
          }

          state.pendingEntryKeys.delete(key);
          state.action = null;
          UI.showToast(
            type === 'correction' ? 'Correction recorded' : 'Contribution recorded',
            'success'
          );
          await loadGoals();
        } catch (error) {
          if (message) message.textContent = `Could not record this entry. ${error.message || ''}`.trim();
          if (submit) {
            submit.disabled = false;
            submit.textContent = type === 'correction' ? 'Record correction' : 'Add contribution';
          }
        }
      });
    }

    document.querySelectorAll('[data-goal-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.goalFilter || 'all';
        state.action = null;
        document.querySelectorAll('[data-goal-filter]').forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle('is-active', active);
          candidate.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderGoals();
      });
    });

    if (dom.reload) dom.reload.addEventListener('click', loadGoals);
    loadGoals();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
