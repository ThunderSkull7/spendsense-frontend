/*
 * Stage 5 Insights pages.
 *
 * One module renders every dedicated Insights page. The page is selected by
 * the data-insights-page attribute on <body>, so the shell, the loading /
 * empty / error conventions and the period controls are identical on every
 * view. Every value comes from the owner-scoped Stage 5 analytics API; this
 * module never calculates a financial total of its own.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI || !window.SpendSenseIntelligence) return;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;
  const H = window.SpendSenseIntelligence;
  const S5 = window.SpendSenseStage5;

  const meta = document.querySelector('meta[name="api-base-url"]');
  if (meta) API.init(meta.content);

  const money = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);
  const signedMoney = (value) => {
    const number = Number(value) || 0;
    return `${number > 0 ? '+' : ''}${money(number)}`;
  };
  const percent = (value, fallback = '—') => H.formatPercent(value, fallback);

  const page = document.body.dataset.insightsPage;

  /* ── Shared DOM helpers ──────────────────────────────────────────────── */
  const dom = {
    form: document.querySelector('[data-insights-form]'),
    message: document.querySelector('[data-insights-message]'),
    pageState: document.querySelector('[data-insights-page-state]'),
    content: document.querySelector('[data-insights-content]'),
  };

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
    const metaRow = el('div', 'viz-meta');
    const label = el('span', 'viz-name');
    const dot = el('span', `dot ${colorClass || ''}`.trim());
    label.append(dot, document.createTextNode(name));
    const amount = el('strong', '', `${money(value)}${note ? ` · ${note}` : ''}`);
    metaRow.append(label, amount);
    const track = el('div', 'viz-track');
    const fill = el('span', `viz-fill ${colorClass || ''}`.trim());
    fill.style.width = `${H.progressPercent(width)}%`;
    track.appendChild(fill);
    row.append(metaRow, track);
    return row;
  };

  const metric = (label, value, note = '') => {
    const box = el('div', 'metric-mini');
    box.append(el('span', '', label), el('strong', '', value));
    if (note) box.appendChild(el('div', 'action-note', note));
    return box;
  };

  const setLoading = (message) => {
    dom.content.hidden = true;
    dom.pageState.hidden = false;
    UI.renderState(dom.pageState, 'loading', { message: message || 'Loading…' });
  };

  const showError = (message) => {
    dom.content.hidden = true;
    dom.pageState.hidden = false;
    UI.renderState(dom.pageState, 'error', { message, retry: () => renderers[page].reload() });
  };

  const showContent = () => {
    dom.pageState.hidden = true;
    dom.content.hidden = false;
  };

  /* ── Period helpers ──────────────────────────────────────────────────── */
  // The reports API takes inclusive YYYY-MM-DD dates, so the month
  // selectors are converted with the shared helper.
  const monthRangeToDates = (fromMonth, toMonth) => S5.monthRangeToDates(fromMonth, toMonth);

  const validateMonthRange = (from, to) => {
    if (!H.dateRangeIsValid(from, to)) {
      setMessage('Choose valid months with the start month on or before the end month.', 'error');
      return false;
    }
    if (H.rangeMonthCount(from, to) > 24) {
      setMessage('Choose no more than 24 calendar months.', 'error');
      return false;
    }
    return true;
  };

  /**
   * Wire a month-range form. `onLoad(from, to)` is called immediately and
   * again whenever the form is submitted.
   */
  const monthRangeForm = (onLoad, defaultMonths = 6) => {
    const from = dom.form.querySelector('[name="from"]');
    const to = dom.form.querySelector('[name="to"]');
    const now = H.monthInputValue();
    to.value = now;
    from.value = H.addMonths(now, -(defaultMonths - 1));

    const submit = () => {
      if (!validateMonthRange(from.value, to.value)) return;
      setMessage('');
      onLoad(from.value, to.value);
    };

    dom.form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    submit();
  };

  /* ── Page renderers ──────────────────────────────────────────────────── */

  /* A1 — Insights overview ------------------------------------------------ */
  const renderOverview = () => {
    const nodes = {
      income: document.querySelector('[data-o="income"]'),
      incomeNote: document.querySelector('[data-o="income-note"]'),
      expenses: document.querySelector('[data-o="expenses"]'),
      expensesNote: document.querySelector('[data-o="expenses-note"]'),
      net: document.querySelector('[data-o="net"]'),
      netNote: document.querySelector('[data-o="net-note"]'),
      expected: document.querySelector('[data-o="expected"]'),
      expectedNote: document.querySelector('[data-o="expected-note"]'),
      comparison: document.querySelector('[data-o="comparison"]'),
      comparisonNote: document.querySelector('[data-o="comparison-note"]'),
      comparisonLabel: document.querySelector('[data-o="comparison-label"]'),
      categories: document.querySelector('[data-o="categories"]'),
      categoriesEmpty: document.querySelector('[data-o="categories-empty"]'),
    };

    const compareSelect = dom.form.querySelector('[name="compare"]');
    const from = dom.form.querySelector('[name="from"]');
    const to = dom.form.querySelector('[name="to"]');

    const load = async () => {
      setLoading('Building the insights overview…');
      const compare = compareSelect ? compareSelect.value : 'previous';
      const range = monthRangeToDates(from.value, to.value);
      const query = new URLSearchParams({
        from: range.from,
        to: range.to,
        compare,
        sections: 'comparison,monthly,categories,income_sources',
      });

      const result = await API.get(`/reports?${query.toString()}`);

      if (!result || result.status !== 200 || !result.data || !result.data.data) {
        showError(H.errorMessage(result, 'Could not load the insights overview.'));
        return;
      }

      const report = result.data.data;
      const summary = report.summary || {};

      setText(nodes.income, money(summary.income_amount));
      setText(nodes.incomeNote, `${summary.income_count || 0} actual income record${summary.income_count === 1 ? '' : 's'}`);
      setText(nodes.expenses, money(summary.expense_amount));
      setText(nodes.expensesNote, `${summary.expense_count || 0} actual expense record${summary.expense_count === 1 ? '' : 's'}`);
      setText(nodes.net, signedMoney(summary.net_amount));
      if (nodes.net) {
        nodes.net.classList.remove('pos', 'neg');
        const net = Number(summary.net_amount) || 0;
        if (net > 0) nodes.net.classList.add('pos');
        if (net < 0) nodes.net.classList.add('neg');
      }
      setText(nodes.netNote, 'Income minus expenses');

      const expectations = report.expectations || {};
      setText(nodes.expected, money(expectations.upcoming_bills_amount));
      setText(
        nodes.expectedNote,
        `${expectations.upcoming_bill_count || 0} expected bill${expectations.upcoming_bill_count === 1 ? '' : 's'} in the next 30 days`
      );

      // Comparison
      if (nodes.comparison) nodes.comparison.replaceChildren();
      if (report.comparison) {
        const current = report.comparison.current || {};
        const previous = report.comparison.previous || {};
        [
          ['Current period', current],
          ['Previous period', previous],
        ].forEach(([label, row]) => {
          const card = el('div', 'comparison-card');
          card.append(el('span', 'comparison-label', label));
          [
            ['Income', money(row.income_amount)],
            ['Expenses', money(row.expense_amount)],
            ['Net', signedMoney(row.net_amount)],
          ].forEach(([key, value]) => {
            const line = el('div', 'comparison-row');
            line.append(el('span', '', key), el('strong', '', value));
            card.appendChild(line);
          });
          nodes.comparison.appendChild(card);
        });

        if (nodes.comparisonNote) {
          const changes = report.comparison.changes || {};
          const expenseChange = changes.expense ? changes.expense.percent : null;
          const describe = (value, label) => {
            if (value === null || value === undefined) return `${label}: no baseline`;
            const direction = Number(value) >= 0 ? 'up' : 'down';
            return `${label} ${direction} ${percent(Math.abs(Number(value)), '0%')}`;
          };
          nodes.comparisonNote.textContent = `${describe(expenseChange, 'Expenses')}; ${describe(changes.income ? changes.income.percent : null, 'Income')}. Percentages are omitted when the previous period is zero.`;
          nodes.comparisonNote.className = 'callout';
        }
        if (nodes.comparisonLabel) {
          const period = report.comparison_period;
          nodes.comparisonLabel.textContent = period
            ? `${period.from} to ${period.to} · ${period.basis.replace(/_/g, ' ')}`
            : 'Current period against the previous one';
        }
      } else {
        if (nodes.comparison) {
          nodes.comparison.appendChild(el('div', 'empty-inline', 'No comparison was requested for this report.'));
        }
        if (nodes.comparisonNote) nodes.comparisonNote.textContent = '';
        if (nodes.comparisonLabel) nodes.comparisonLabel.textContent = 'No comparison requested';
      }

      // Categories
      const categories = report.categories || [];
      if (nodes.categories) nodes.categories.replaceChildren();
      if (nodes.categoriesEmpty) nodes.categoriesEmpty.hidden = categories.length > 0;
      const max = categories.reduce((highest, row) => Math.max(highest, Number(row.amount) || 0), 0) || 1;
      const colors = ['blue', 'teal', 'amber', 'danger'];
      categories.forEach((row, index) => {
        nodes.categories.appendChild(
          barRow(
            row.category_name,
            row.amount,
            ((Number(row.amount) || 0) / max) * 100,
            colors[index % colors.length],
            percent(row.share_percent, '0%')
          )
        );
      });

      showContent();
    };

    dom.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validateMonthRange(from.value, to.value)) return;
      setMessage('');
      load();
    });

    monthRangeForm(load);
  };

  /* A5 — Budget performance ------------------------------------------------ */
  const renderBudgets = () => {
    const nodes = {
      budgeted: document.querySelector('[data-b="budgeted"]'),
      budgetedNote: document.querySelector('[data-b="budgeted-note"]'),
      spent: document.querySelector('[data-b="spent"]'),
      spentNote: document.querySelector('[data-b="spent-note"]'),
      remaining: document.querySelector('[data-b="remaining"]'),
      remainingNote: document.querySelector('[data-b="remaining-note"]'),
      repeat: document.querySelector('[data-b="repeat"]'),
      repeatNote: document.querySelector('[data-b="repeat-note"]'),
      periodLabel: document.querySelector('[data-b="period-label"]'),
      rows: document.querySelector('[data-b="rows"]'),
      empty: document.querySelector('[data-b="empty"]'),
      historyRows: document.querySelector('[data-b="history-rows"]'),
      alertRows: document.querySelector('[data-b="alert-rows"]'),
      alertEmpty: document.querySelector('[data-b="alert-empty"]'),
    };

    const STATUS = {
      over: { label: 'Over limit', pill: 'danger' },
      near_limit: { label: 'Near limit', pill: 'amber' },
      on_track: { label: 'On track', pill: 'green' },
    };

    const load = async (from, to) => {
      setLoading('Loading budget performance…');
      const query = new URLSearchParams({ from, to });
      const result = await API.get(`/analytics/budget-performance?${query.toString()}`);

      if (!result || result.status !== 200 || !result.data || !result.data.data) {
        showError(H.errorMessage(result, 'Could not load the budget performance.'));
        return;
      }

      const data = result.data.data;
      const summary = data.summary || {};

      setText(nodes.budgeted, money(summary.budgeted_amount));
      setText(nodes.budgetedNote, `${summary.budget_rows || 0} budget row${summary.budget_rows === 1 ? '' : 's'}`);
      setText(nodes.spent, money(summary.spent_amount));
      setText(nodes.spentNote, 'Budgeted categories only');
      setText(nodes.remaining, money(summary.remaining_amount));
      setText(nodes.remainingNote, 'Budgeted minus spent');
      setText(nodes.repeat, (data.repeated_overspending || []).length);
      setText(nodes.repeatNote, 'Categories over limit in two or more months');
      setText(nodes.periodLabel, `${H.monthLabel(data.from)} to ${H.monthLabel(data.to)} · whole UTC calendar months`);

      const items = Array.isArray(data.items) ? data.items : [];
      if (nodes.empty) nodes.empty.hidden = items.length > 0;
      tbodyRows(
        nodes.rows,
        items.map((row) => {
          const status = STATUS[row.status] || { label: row.status, pill: 'neutral' };
          return [
            H.monthLabel(row.month),
            row.category_name,
            money(row.limit_amount),
            money(row.spent_amount),
            money(row.remaining_amount),
            percent(row.utilization_percent, '0%'),
            status.label,
          ];
        }),
        7,
        'No budgets are set for the selected months.'
      );

      tbodyRows(
        nodes.historyRows,
        (data.history || []).map((row) => [
          H.monthLabel(row.month),
          money(row.budgeted_amount),
          money(row.spent_amount),
          money(row.remaining_amount),
          percent(row.utilization_percent, '0%'),
          row.overspent_count,
        ]),
        6
      );

      const alerts = Array.isArray(data.threshold_events) ? data.threshold_events : [];
      if (nodes.alertEmpty) nodes.alertEmpty.hidden = alerts.length > 0;
      tbodyRows(
        nodes.alertRows,
        alerts.map((row) => [
          H.monthLabel(row.period_month),
          `${row.threshold}%`,
          money(row.spent_amount),
          money(row.limit_amount),
          row.read_at ? 'Read' : 'Unread',
        ]),
        5,
        'No threshold crossings were recorded in the selected months.'
      );

      showContent();
    };

    monthRangeForm(load);
  };

  /* A6 — Savings goal progress -------------------------------------------- */
  const renderSavings = () => {
    const nodes = {
      saved: document.querySelector('[data-s="saved"]'),
      savedNote: document.querySelector('[data-s="saved-note"]'),
      target: document.querySelector('[data-s="target"]'),
      targetNote: document.querySelector('[data-s="target-note"]'),
      period: document.querySelector('[data-s="period"]'),
      periodNote: document.querySelector('[data-s="period-note"]'),
      ontrack: document.querySelector('[data-s="ontrack"]'),
      ontrackNote: document.querySelector('[data-s="ontrack-note"]'),
      periodLabel: document.querySelector('[data-s="period-label"]'),
      goals: document.querySelector('[data-s="goals"]'),
      goalsEmpty: document.querySelector('[data-s="goals-empty"]'),
      historyRows: document.querySelector('[data-s="history-rows"]'),
      historyEmpty: document.querySelector('[data-s="history-empty"]'),
    };

    const load = async (from, to) => {
      setLoading('Loading savings progress…');
      const query = new URLSearchParams({ from, to });
      const result = await API.get(`/analytics/savings-progress?${query.toString()}`);

      if (!result || result.status !== 200 || !result.data || !result.data.data) {
        showError(H.errorMessage(result, 'Could not load the savings progress.'));
        return;
      }

      const data = result.data.data;
      const summary = data.summary || {};

      setText(nodes.saved, money(summary.total_saved_active_amount));
      setText(nodes.savedNote, `${summary.active_goal_count || 0} active goal${summary.active_goal_count === 1 ? '' : 's'}`);
      setText(nodes.target, money(summary.total_target_amount));
      setText(nodes.targetNote, 'Target across active goals');
      setText(nodes.period, money(summary.period_net_amount));
      setText(nodes.periodNote, 'Net contributions in the selected months');
      setText(nodes.ontrack, `${summary.on_track_count || 0} / ${summary.active_goal_count || 0}`);
      setText(nodes.ontrackNote, `${summary.behind_count || 0} behind, ${summary.no_estimate_count || 0} without an estimate`);
      setText(nodes.periodLabel, `${H.monthLabel(data.from)} to ${H.monthLabel(data.to)} · UTC calendar months`);

      const goals = Array.isArray(data.goals) ? data.goals : [];
      if (nodes.goals) nodes.goals.replaceChildren();
      if (nodes.goalsEmpty) nodes.goalsEmpty.hidden = goals.length > 0;

      goals.forEach((goal) => {
        const card = el('div', 'goal-card');

        const head = el('div', 'goal-card-head');
        head.append(el('strong', '', goal.name));
        const pill = el('span', `pill ${H.statusTone(goal.status)}`, H.statusLabel(goal.status));
        head.appendChild(pill);
        card.appendChild(head);

        const figures = el('div', 'goal-figures');
        figures.appendChild(el('span', '', 'Target'));
        const target = el('b', '', money(goal.target_amount));
        figures.appendChild(target);
        figures.appendChild(el('span', '', 'Saved'));
        const saved = el('b', '', money(goal.saved_amount));
        figures.appendChild(saved);
        figures.appendChild(el('span', '', 'Remaining'));
        const remaining = el('b', '', money(goal.remaining_amount));
        figures.appendChild(remaining);
        figures.appendChild(el('span', '', 'Progress'));
        const progress = el('b', '', percent(goal.progress_percent, '0%'));
        figures.appendChild(progress);
        card.appendChild(figures);

        const track = el('div', 'progress');
        const fill = el('span');
        fill.style.width = `${H.progressPercent(goal.progress_percent)}%`;
        track.appendChild(fill);
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', `${goal.name} progress`);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(Math.round(H.progressPercent(goal.progress_percent))));
        card.appendChild(track);

        const estimate = goal.estimated_completion || {};
        const estimateClass = estimate.status === 'estimated' ? (estimate.on_track === false ? 'warn' : 'ok') : '';
        const estimateText =
          estimate.status === 'estimated'
            ? `Estimated completion: ${H.monthLabel(estimate.projected_month)} (${estimate.months_remaining} month${estimate.months_remaining === 1 ? '' : 's'})`
            : estimate.reason || 'No completion estimate available.';
        card.appendChild(el('div', `goal-estimate ${estimateClass}`.trim(), estimateText));

        if (goal.target_date) {
          card.appendChild(el('div', 'action-note', `Target date: ${H.dateLabel(goal.target_date)}`));
        }
        if (goal.last_contribution_date) {
          card.appendChild(el('div', 'action-note', `Last contribution: ${H.dateLabel(goal.last_contribution_date)}`));
        }

        nodes.goals.appendChild(card);
      });

      const history = Array.isArray(data.history) ? data.history : [];
      if (nodes.historyEmpty) nodes.historyEmpty.hidden = history.length > 0;
      tbodyRows(
        nodes.historyRows,
        history.map((row) => [
          H.monthLabel(row.month),
          money(row.contributions_amount),
          money(row.corrections_amount),
          money(row.net_amount),
          money(row.cumulative_active_saved),
        ]),
        5,
        'No contributions were recorded in the selected months.'
      );

      showContent();
    };

    monthRangeForm(load);
  };

  /* A9 — Recurring commitments -------------------------------------------- */
  const renderCommitments = () => {
    const nodes = {
      monthly: document.querySelector('[data-c="monthly"]'),
      monthlyNote: document.querySelector('[data-c="monthly-note"]'),
      annual: document.querySelector('[data-c="annual"]'),
      annualNote: document.querySelector('[data-c="annual-note"]'),
      schedules: document.querySelector('[data-c="schedules"]'),
      schedulesNote: document.querySelector('[data-c="schedules-note"]'),
      upcoming: document.querySelector('[data-c="upcoming"]'),
      upcomingNote: document.querySelector('[data-c="upcoming-note"]'),
      periodLabel: document.querySelector('[data-c="period-label"]'),
      breakdown: document.querySelector('[data-c="breakdown"]'),
      breakdownNote: document.querySelector('[data-c="breakdown-note"]'),
      upcomingRows: document.querySelector('[data-c="upcoming-rows"]'),
      upcomingEmpty: document.querySelector('[data-c="upcoming-empty"]'),
      scheduleRows: document.querySelector('[data-c="schedule-rows"]'),
      scheduleEmpty: document.querySelector('[data-c="schedule-empty"]'),
      historyRows: document.querySelector('[data-c="history-rows"]'),
      historyNote: document.querySelector('[data-c="history-note"]'),
    };

    const load = async (from, to) => {
      setLoading('Loading recurring commitments…');
      const asOf = dom.form.querySelector('[name="as_of"]');
      const query = new URLSearchParams({ from, to });
      if (asOf && asOf.value) query.set('as_of', asOf.value);

      const result = await API.get(`/analytics/commitments?${query.toString()}`);

      if (!result || result.status !== 200 || !result.data || !result.data.data) {
        showError(H.errorMessage(result, 'Could not load the recurring commitments.'));
        return;
      }

      const data = result.data.data;
      const summary = data.summary || {};

      setText(nodes.monthly, money(summary.combined_monthly_commitment));
      setText(nodes.monthlyNote, 'Bills plus standalone subscriptions');
      setText(nodes.annual, money(summary.combined_annual_commitment));
      setText(nodes.annualNote, 'Annualised estimate');
      setText(nodes.schedules, summary.active_schedule_count || 0);
      setText(nodes.schedulesNote, `${summary.active_subscription_count || 0} active subscription trackers`);
      setText(nodes.upcoming, summary.upcoming_count || 0);
      setText(nodes.upcomingNote, `${money(summary.upcoming_total_amount)} expected in the next ${summary.upcoming_window_days || 60} days`);
      setText(nodes.periodLabel, `${H.monthLabel(data.from)} to ${H.monthLabel(data.to)} · as of ${H.dateLabel(data.as_of)}`);

      if (nodes.breakdown) {
        nodes.breakdown.replaceChildren(
          metric('Combined monthly', money(summary.combined_monthly_commitment)),
          metric('Bill schedules', money(summary.bill_schedule_monthly_cost), 'Active schedules'),
          metric('Standalone subscriptions', money(summary.standalone_subscription_monthly_cost), 'Added to the bill total'),
          metric(
            'Linked subscriptions',
            money(summary.linked_subscription_monthly_cost),
            'Already inside the bill schedule total'
          )
        );
      }
      if (nodes.breakdownNote) {
        nodes.breakdownNote.textContent =
          'A linked subscription is represented by its bill schedule, so the same obligation is never counted twice. Expected obligations are never counted as paid expenses.';
      }

      const upcoming = Array.isArray(data.upcoming_obligations) ? data.upcoming_obligations : [];
      if (nodes.upcomingEmpty) nodes.upcomingEmpty.hidden = upcoming.length > 0;
      tbodyRows(
        nodes.upcomingRows,
        upcoming.map((row) => [
          H.dateLabel(row.date),
          row.source_label,
          row.name,
          money(row.amount),
          row.status,
        ]),
        5,
        'No expected obligations fall inside this window.'
      );

      const schedules = Array.isArray(data.schedules) ? data.schedules : [];
      if (nodes.scheduleEmpty) nodes.scheduleEmpty.hidden = schedules.length > 0;
      tbodyRows(
        nodes.scheduleRows,
        schedules.map((row) => [
          row.description,
          row.frequency_label,
          money(row.amount),
          money(row.monthly_cost),
          row.is_linked ? 'Yes' : 'No',
          H.statusLabel(row.status),
        ]),
        6,
        'No recurring bill schedules yet.'
      );

      tbodyRows(
        nodes.historyRows,
        (data.history || []).map((row) => [
          H.monthLabel(row.month),
          money(row.bill_schedule_monthly_amount),
          money(row.standalone_subscription_monthly_amount),
          money(row.combined_monthly_amount),
        ]),
        4
      );
      if (nodes.historyNote) {
        nodes.historyNote.textContent =
          'This history is a planning estimate built from the current schedule definitions. Historical schedule amounts are not versioned, so it is context rather than a recorded total.';
      }

      showContent();
    };

    const asOfInput = dom.form.querySelector('[name="as_of"]');
    if (asOfInput && !asOfInput.value) asOfInput.value = H.todayIso();

    monthRangeForm(load);
  };

  /* A10 — Data quality ----------------------------------------------------- */
  const renderQuality = () => {
    const nodes = {
      duplicates: document.querySelector('[data-q="duplicates"]'),
      duplicatesNote: document.querySelector('[data-q="duplicates-note"]'),
      missing: document.querySelector('[data-q="missing"]'),
      missingNote: document.querySelector('[data-q="missing-note"]'),
      large: document.querySelector('[data-q="large"]'),
      largeNote: document.querySelector('[data-q="large-note"]'),
      schedules: document.querySelector('[data-q="schedules"]'),
      schedulesNote: document.querySelector('[data-q="schedules-note"]'),
      thresholdLabel: document.querySelector('[data-q="threshold-label"]'),
      duplicateRows: document.querySelector('[data-q="duplicate-rows"]'),
      duplicateEmpty: document.querySelector('[data-q="duplicate-empty"]'),
      missingRows: document.querySelector('[data-q="missing-rows"]'),
      missingEmpty: document.querySelector('[data-q="missing-empty"]'),
      largeRows: document.querySelector('[data-q="large-rows"]'),
      largeEmpty: document.querySelector('[data-q="large-empty"]'),
      scheduleRows: document.querySelector('[data-q="schedule-rows"]'),
      scheduleEmpty: document.querySelector('[data-q="schedule-empty"]'),
      categoryNote: document.querySelector('[data-q="category-note"]'),
      importNote: document.querySelector('[data-q="import-note"]'),
    };

    const load = async (from, to) => {
      setLoading('Reviewing data quality…');
      const query = new URLSearchParams({ from, to });
      const result = await API.get(`/analytics/data-quality?${query.toString()}`);

      if (!result || result.status !== 200 || !result.data || !result.data.data) {
        showError(H.errorMessage(result, 'Could not load the data quality review.'));
        return;
      }

      const data = result.data.data;
      const counts = data.counts || {};

      setText(nodes.duplicates, counts.duplicate_expense_groups || 0);
      setText(
        nodes.duplicatesNote,
        `${counts.duplicate_expense_rows || 0} expense row${counts.duplicate_expense_rows === 1 ? '' : 's'} and ${counts.duplicate_income_groups || 0} income group${counts.duplicate_income_groups === 1 ? '' : 's'}`
      );
      setText(nodes.missing, counts.missing_descriptions || 0);
      setText(nodes.missingNote, 'Expenses without a description');
      setText(nodes.large, counts.large_expenses || 0);
      setText(nodes.largeNote, 'Above three times the period average');
      setText(nodes.schedules, counts.schedules_active_past_end || 0);
      setText(nodes.schedulesNote, 'Active schedules past their end date');

      if (nodes.thresholdLabel) {
        nodes.thresholdLabel.textContent = `Threshold ${money(data.large_expense_threshold)} against an average of ${money(data.large_expense_average)}`;
      }

      const duplicates = Array.isArray(data.duplicate_expenses) ? data.duplicate_expenses : [];
      if (nodes.duplicateEmpty) nodes.duplicateEmpty.hidden = duplicates.length > 0;
      tbodyRows(
        nodes.duplicateRows,
        duplicates.map((row) => [
          H.dateLabel(row.transaction_date),
          row.label || 'No description',
          money(row.amount),
          row.count,
          money(row.total_amount),
        ]),
        5,
        'No duplicate candidates were found in the selected period.'
      );

      const missing = Array.isArray(data.missing_descriptions) ? data.missing_descriptions : [];
      if (nodes.missingEmpty) nodes.missingEmpty.hidden = missing.length > 0;
      tbodyRows(
        nodes.missingRows,
        missing.map((row) => [H.dateLabel(row.expense_date), money(row.amount), `Category #${row.category_id}`]),
        3,
        'Every expense in this period has a description.'
      );

      const large = Array.isArray(data.large_expenses) ? data.large_expenses : [];
      if (nodes.largeEmpty) nodes.largeEmpty.hidden = large.length > 0;
      tbodyRows(
        nodes.largeRows,
        large.map((row) => [H.dateLabel(row.expense_date), row.description || 'Expense', money(row.amount)]),
        3,
        'No expense crossed the documented threshold.'
      );

      const scheduleIssues = [
        ...(data.schedules_past_end || []).map((row) => ({
          name: row.description,
          reason: row.reason,
          status: row.status,
        })),
        ...(data.subscription_status_issues || []).map((row) => ({
          name: row.name,
          reason: row.reason,
          status: row.status,
        })),
      ];
      if (nodes.scheduleEmpty) nodes.scheduleEmpty.hidden = scheduleIssues.length > 0;
      tbodyRows(
        nodes.scheduleRows,
        scheduleIssues.map((row) => [row.name, row.reason, H.statusLabel(row.status)]),
        3,
        'No schedule or tracker issues were found.'
      );

      if (nodes.categoryNote && data.category_coverage) {
        nodes.categoryNote.textContent = data.category_coverage.note;
      }
      if (nodes.importNote && data.import_validation) {
        nodes.importNote.textContent = data.import_validation.note;
      }

      showContent();
    };

    monthRangeForm(load);
  };

  /* ── Registry & bootstrap ────────────────────────────────────────────── */
  const renderers = {
    overview: renderOverview,
    budgets: renderBudgets,
    savings: renderSavings,
    commitments: renderCommitments,
    quality: renderQuality,
  };

  const renderer = renderers[page];
  if (!renderer) return;

  renderer();
});
