/*
 * Reports centre.
 *
 * One report contract (/api/reports) powers the preview and both exports, so
 * the numbers shown here are exactly the numbers that are exported. All
 * actual totals come from the server; this module only formats and renders.
 * There is no charting dependency: the visuals are CSS bars and tables built
 * from the shared SpendSense design tokens.
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

  const dom = {
    form: document.querySelector('[data-report-form]'),
    from: document.querySelector('#report-from'),
    to: document.querySelector('#report-to'),
    compare: document.querySelector('#report-compare'),
    presets: document.querySelector('[data-report-presets]'),
    message: document.querySelector('[data-report-message]'),
    state: document.querySelector('[data-report-state]'),
    content: document.querySelector('[data-report-content]'),
    period: document.querySelector('[data-report-period]'),
    exportCsv: document.querySelector('[data-export-csv]'),
    exportJson: document.querySelector('[data-export-json]'),
    print: document.querySelector('[data-report-print]'),
  };

  let report = null;

  /* ── Small DOM helpers ───────────────────────────────────────────────── */
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

  /* ── Period presets ──────────────────────────────────────────────────── */
  // The period maths lives in the shared Stage 5 module so the reports
  // centre, the insights pages and the tests all agree on the boundaries.
  const presetRange = (preset) => S5.presetRange(preset);

  const activePreset = () => {
    const button = dom.presets ? dom.presets.querySelector('[aria-pressed="true"]') : null;
    return button ? button.dataset.preset : 'this-month';
  };

  const setActivePreset = (preset) => {
    if (!dom.presets) return;
    dom.presets.querySelectorAll('[data-preset]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.preset === preset));
    });
  };

  /* ── Section selection (the custom report builder) ───────────────────── */
  const sectionInputs = () =>
    Array.from(document.querySelectorAll('[data-section]')).filter((input) => input.checked);

  const selectedSections = () => sectionInputs().map((input) => input.dataset.section);

  const applySectionVisibility = () => {
    const active = selectedSections();
    document.querySelectorAll('[data-section-wrap]').forEach((wrap) => {
      const key = wrap.dataset.sectionWrap;
      wrap.hidden = !active.includes(key);
    });
  };

  /* ── Load ────────────────────────────────────────────────────────────── */
  const buildQuery = () =>
    S5.buildReportQuery({
      from: dom.from.value,
      to: dom.to.value,
      compare: dom.compare.value,
      sections: selectedSections(),
    });

  const load = async () => {
    if (!dom.from.value || !dom.to.value) {
      setMessage('Choose a start and an end date.', 'error');
      return;
    }
    if (dom.from.value > dom.to.value) {
      setMessage('The start date must be on or before the end date.', 'error');
      return;
    }

    setMessage('');
    dom.content.hidden = true;
    dom.state.hidden = false;
    UI.renderState(dom.state, 'loading', { message: 'Building the report…' });

    const result = await API.get(`/reports?${buildQuery().toString()}`);

    if (!result || result.status !== 200 || !result.data || !result.data.data) {
      dom.content.hidden = true;
      dom.state.hidden = false;
      UI.renderState(dom.state, 'error', {
        message: H.errorMessage(result, 'Could not build the report.'),
        retry: load,
      });
      return;
    }

    report = result.data.data;
    render(report);
    dom.state.hidden = true;
    dom.content.hidden = false;
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  const render = (data) => {
    const summary = data.summary || {};
    const expectations = data.expectations || {};

    if (dom.period) dom.period.textContent = data.period ? data.period.label : 'Build, preview and export a report for any period';

    /* Summary */
    setText(document.querySelector('[data-r="income"]'), money(summary.income_amount));
    setText(document.querySelector('[data-r="income-note"]'), `${summary.income_count || 0} actual income record${summary.income_count === 1 ? '' : 's'}`);
    setText(document.querySelector('[data-r="expenses"]'), money(summary.expense_amount));
    setText(document.querySelector('[data-r="expenses-note"]'), `${summary.expense_count || 0} actual expense record${summary.expense_count === 1 ? '' : 's'}`);
    setText(document.querySelector('[data-r="net"]'), signedMoney(summary.net_amount));
    setText(document.querySelector('[data-r="expected"]'), money(expectations.upcoming_bills_amount));
    setText(
      document.querySelector('[data-r="expected-note"]'),
      `${expectations.upcoming_bill_count || 0} expected bill${expectations.upcoming_bill_count === 1 ? '' : 's'} in the next 30 days`
    );

    /* Comparison */
    const comparisonEl = document.querySelector('[data-r="comparison"]');
    const comparisonNote = document.querySelector('[data-r="comparison-note"]');
    const comparisonLabel = document.querySelector('[data-r="comparison-label"]');
    if (comparisonEl) comparisonEl.replaceChildren();

    if (data.comparison) {
      [
        ['Current period', data.comparison.current || {}],
        ['Previous period', data.comparison.previous || {}],
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
        comparisonEl.appendChild(card);
      });

      const changes = data.comparison.changes || {};
      const describe = (value, label) => {
        if (value === null || value === undefined) return `${label}: no baseline`;
        const direction = Number(value) >= 0 ? 'up' : 'down';
        return `${label} ${direction} ${percent(Math.abs(Number(value)), '0%')}`;
      };
      setText(
        comparisonNote,
        `${describe(changes.expense ? changes.expense.percent : null, 'Expenses')}; ${describe(changes.income ? changes.income.percent : null, 'Income')}. Percentages are omitted when the previous period is zero.`
      );
      if (comparisonLabel && data.comparison_period) {
        comparisonLabel.textContent = `${data.comparison_period.from} to ${data.comparison_period.to} · ${String(data.comparison_period.basis || '').replace(/_/g, ' ')}`;
      }

      const drivers = [
        ...(data.comparison.drivers.expense_categories || []).map((row) => [
          'Expense category',
          row.category_name,
          money(row.current_amount),
          money(row.previous_amount),
          money(row.change_amount),
          row.change_percent === null || row.change_percent === undefined ? '—' : percent(row.change_percent, '0%'),
        ]),
        ...(data.comparison.drivers.income_sources || []).map((row) => [
          'Income source',
          row.source,
          money(row.current_amount),
          money(row.previous_amount),
          money(row.change_amount),
          row.change_percent === null || row.change_percent === undefined ? '—' : percent(row.change_percent, '0%'),
        ]),
      ];
      tbodyRows(document.querySelector('[data-r="driver-rows"]'), drivers, 6, 'No change drivers for this period.');
    } else {
      if (comparisonEl) comparisonEl.appendChild(el('div', 'empty-inline', 'No comparison was requested for this report.'));
      setText(comparisonNote, '');
      setText(comparisonLabel, 'No comparison requested');
      tbodyRows(document.querySelector('[data-r="driver-rows"]'), [], 6, 'No change drivers for this period.');
    }

    /* Balances */
    const balances = data.balances || {};
    setText(document.querySelector('[data-r="balance-reason"]'), balances.opening ? balances.opening.reason : '');
    setText(
      document.querySelector('[data-r="balance-note"]'),
      balances.ending ? balances.ending.reason : ''
    );

    /* Monthly actuals */
    const monthly = data.monthly || [];
    if (document.querySelector('[data-r="monthly-empty"]')) {
      document.querySelector('[data-r="monthly-empty"]').hidden = monthly.length > 0;
    }
    tbodyRows(
      document.querySelector('[data-r="monthly-rows"]'),
      monthly.map((row) => [
        H.monthLabel(row.month),
        money(row.income_amount),
        money(row.expense_amount),
        signedMoney(row.net_amount),
        row.is_partial ? 'Partial month' : 'Complete month',
      ]),
      5,
      'No monthly data for the selected period.'
    );

    /* Categories */
    const categories = data.categories || [];
    const categoriesEl = document.querySelector('[data-r="categories"]');
    if (categoriesEl) categoriesEl.replaceChildren();
    if (document.querySelector('[data-r="category-empty"]')) {
      document.querySelector('[data-r="category-empty"]').hidden = categories.length > 0;
    }
    const categoryTotal = categories.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const categoryMax = categories.reduce((highest, row) => Math.max(highest, Number(row.amount) || 0), 0) || 1;
    const colors = ['blue', 'teal', 'amber', 'danger'];
    categories.forEach((row, index) => {
      categoriesEl.appendChild(
        barRow(
          row.category_name,
          row.amount,
          ((Number(row.amount) || 0) / categoryMax) * 100,
          colors[index % colors.length],
          percent(row.share_percent, '0%')
        )
      );
    });
    tbodyRows(
      document.querySelector('[data-r="category-rows"]'),
      categories.map((row) => [
        row.category_name,
        money(row.amount),
        row.transaction_count,
        percent(row.share_percent, '0%'),
      ]),
      4,
      'No category spending in the selected period.'
    );

    /* Income sources */
    const sources = data.income_sources || [];
    if (document.querySelector('[data-r="source-empty"]')) {
      document.querySelector('[data-r="source-empty"]').hidden = sources.length > 0;
    }
    tbodyRows(
      document.querySelector('[data-r="source-rows"]'),
      sources.map((row) => [
        row.source,
        money(row.amount),
        row.transaction_count,
        percent(row.share_percent, '0%'),
      ]),
      4,
      'No income in the selected period.'
    );

    /* Budgets */
    const budgets = data.budgets;
    const budgetItems = budgets && budgets.items ? budgets.items : [];
    if (document.querySelector('[data-r="budget-empty"]')) {
      document.querySelector('[data-r="budget-empty"]').hidden = budgetItems.length > 0;
    }
    const STATUS = {
      over: 'Over limit',
      near_limit: 'Near limit',
      on_track: 'On track',
    };
    tbodyRows(
      document.querySelector('[data-r="budget-rows"]'),
      budgetItems.map((row) => [
        H.monthLabel(row.month),
        row.category_name,
        money(row.limit_amount),
        money(row.spent_amount),
        percent(row.utilization_percent, '0%'),
        STATUS[row.status] || row.status,
      ]),
      6,
      'No budgets are set for the selected months.'
    );

    /* Savings */
    const savingsGoals = data.savings && data.savings.goals ? data.savings.goals : [];
    if (document.querySelector('[data-r="savings-empty"]')) {
      document.querySelector('[data-r="savings-empty"]').hidden = savingsGoals.length > 0;
    }
    tbodyRows(
      document.querySelector('[data-r="savings-rows"]'),
      savingsGoals.map((row) => {
        const estimate = row.estimated_completion || {};
        return [
          row.name,
          H.statusLabel(row.status),
          money(row.target_amount),
          money(row.saved_amount),
          percent(row.progress_percent, '0%'),
          estimate.status === 'estimated'
            ? H.monthLabel(estimate.projected_month)
            : estimate.reason || '—',
        ];
      }),
      6,
      'No savings goals have been created yet.'
    );

    /* Upcoming bills */
    const upcoming = data.upcoming_bills || [];
    if (document.querySelector('[data-r="upcoming-empty"]')) {
      document.querySelector('[data-r="upcoming-empty"]').hidden = upcoming.length > 0;
    }
    tbodyRows(
      document.querySelector('[data-r="upcoming-rows"]'),
      upcoming.map((row) => [
        H.dateLabel(row.date),
        row.name,
        row.category_name || '—',
        money(row.amount),
        row.status,
      ]),
      5,
      'No upcoming expected obligations.'
    );

    /* Subscriptions */
    const subscriptionStrip = document.querySelector('[data-r="subscription-summary"]');
    if (subscriptionStrip) {
      subscriptionStrip.replaceChildren();
      const summary = (data.subscriptions && data.subscriptions.summary) || {};
      subscriptionStrip.append(
        metric('Active trackers', summary.active_count || 0),
        metric('Linked (in bill schedules)', summary.linked_count || 0),
        metric('Standalone', summary.standalone_count || 0),
        metric('Estimated monthly cost', money(summary.estimated_monthly_cost || 0)),
        metric('Estimated annual cost', money(summary.estimated_annual_cost || 0))
      );
    }
    setText(
      document.querySelector('[data-r="subscription-note"]'),
      'Subscription estimates are separate from recorded expenses. A linked tracker is represented by its bill schedule, so it is not counted twice.'
    );

    /* Combined commitments */
    const commitmentStrip = document.querySelector('[data-r="commitment-summary"]');
    if (commitmentStrip) {
      commitmentStrip.replaceChildren();
      const summary = (data.commitments && data.commitments.summary) || {};
      commitmentStrip.append(
        metric('Combined monthly', money(summary.combined_monthly_commitment || 0)),
        metric('Combined annual', money(summary.combined_annual_commitment || 0)),
        metric('Bill schedules', money(summary.bill_schedule_monthly_cost || 0), 'Active schedules'),
        metric('Standalone subscriptions', money(summary.standalone_subscription_monthly_cost || 0), 'Added to the bill total'),
        metric('Linked subscriptions', money(summary.linked_subscription_monthly_cost || 0), 'Already inside the bill total')
      );
    }
    setText(
      document.querySelector('[data-r="commitment-note"]'),
      'Expected obligations and subscription estimates are not included in the actual income or expense totals above.'
    );

    /* Forecast */
    const forecastStrip = document.querySelector('[data-r="forecast-summary"]');
    if (forecastStrip) {
      forecastStrip.replaceChildren();
      const forecast = data.forecast || {};
      forecastStrip.append(
        metric('Expected income', money(forecast.expected_income || 0)),
        metric('Expected expenses', money(forecast.expected_expenses || 0)),
        metric('Projected net flow', signedMoney(forecast.projected_net_cash_flow || 0)),
        metric('Negative-date status', forecast.negative_cash_flow_status || 'not_calculable')
      );
    }
    setText(
      document.querySelector('[data-r="forecast-note"]'),
      (data.forecast && data.forecast.starting_balance_reason) ||
        'The forecast projects materialized planned occurrences. It never creates a transaction and it does not report a cash balance.'
    );

    /* Net worth */
    const netWorthStrip = document.querySelector('[data-r="net-worth-summary"]');
    if (netWorthStrip) {
      netWorthStrip.replaceChildren();
      const netWorth = data.net_worth || {};
      const summary = netWorth.summary || {};
      netWorthStrip.append(
        metric('Assets', money(summary.total_assets || 0)),
        metric('Liabilities', money(summary.total_liabilities || 0)),
        metric('Net worth', money(summary.net_worth || 0)),
        metric('As of', netWorth.as_of ? H.dateLabel(netWorth.as_of) : '—')
      );
    }
    setText(
      document.querySelector('[data-r="net-worth-note"]'),
      (data.net_worth && data.net_worth.note) ||
        'Net worth uses manual dated valuations. It is not a verified available-cash balance and does not change actual income or expense totals.'
    );

    /* Expense review */
    const review = data.expense_review;
    const reviewRows = review && review.largest_expenses ? review.largest_expenses : [];
    if (document.querySelector('[data-r="review-empty"]')) {
      document.querySelector('[data-r="review-empty"]').hidden = reviewRows.length > 0;
    }
    tbodyRows(
      document.querySelector('[data-r="review-rows"]'),
      reviewRows.map((row) => [
        H.dateLabel(row.date),
        row.description || 'Expense',
        row.category_name || '—',
        money(row.amount),
      ]),
      4,
      'No expense transactions to rank yet.'
    );

    /* Notes */
    const notesList = document.querySelector('[data-r="notes"]');
    if (notesList) {
      notesList.replaceChildren();
      (data.notes || []).forEach((note) => {
        if (typeof note === 'string' && note.trim()) notesList.appendChild(el('li', '', note));
      });
    }

    applySectionVisibility();
  };

  /* ── Exports ─────────────────────────────────────────────────────────── */
  const exportCsv = () => {
    if (!report) {
      UI.showToast('Build a report before exporting.', 'error');
      return;
    }
    const base = meta ? meta.content : '';
    const link = document.createElement('a');
    link.href = `${base}/api/reports/export?${buildQuery().toString()}`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    UI.showToast('CSV export started', 'info');
  };

  const exportJson = () => {
    if (!report) {
      UI.showToast('Build a report before exporting.', 'error');
      return;
    }
    const payload = {
      format: 'spendsense-report',
      format_version: 1,
      generated_at: new Date().toISOString(),
      query: {
        from: dom.from.value,
        to: dom.to.value,
        compare: dom.compare.value,
        sections: selectedSections(),
      },
      report,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spendsense-report-${dom.from.value}-to-${dom.to.value}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    UI.showToast('JSON export downloaded', 'success');
  };

  /* ── Events ──────────────────────────────────────────────────────────── */
  if (dom.presets) {
    dom.presets.addEventListener('click', (event) => {
      const button = event.target.closest('[data-preset]');
      if (!button) return;
      setActivePreset(button.dataset.preset);
      const range = presetRange(button.dataset.preset);
      if (range) {
        dom.from.value = range.from;
        dom.to.value = range.to;
        load();
      } else {
        setMessage('Choose the start and end dates for a custom period.', '');
        if (dom.from) dom.from.focus();
      }
    });
  }

  if (dom.form) {
    dom.form.addEventListener('submit', (event) => {
      event.preventDefault();
      setActivePreset('custom');
      load();
    });
  }

  if (dom.compare) {
    dom.compare.addEventListener('change', () => load());
  }

  document.querySelectorAll('[data-section]').forEach((input) => {
    input.addEventListener('change', () => {
      applySectionVisibility();
      load();
    });
  });

  if (dom.exportCsv) dom.exportCsv.addEventListener('click', exportCsv);
  if (dom.exportJson) dom.exportJson.addEventListener('click', exportJson);
  if (dom.print) {
    dom.print.addEventListener('click', () => {
      window.print();
    });
  }

  /* ── Start ───────────────────────────────────────────────────────────── */
  const initial = presetRange('this-month');
  dom.from.value = initial.from;
  dom.to.value = initial.to;
  setActivePreset('this-month');
  applySectionVisibility();
  load();
});
