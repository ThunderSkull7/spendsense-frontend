/*
 * Reports centre — simplified, graph-focused.
 *
 * One report contract (/api/reports) powers the preview and both exports, so
 * the numbers shown here are exactly the numbers that are exported. All
 * actual totals come from the server; this module only formats and renders.
 * There is no charting dependency: the income-versus-expenses trend is an
 * inline SVG built from the shared design tokens, and everything else is
 * CSS bars and tables.
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

  /* The sections this page renders. The report keeps to what is shown, so an
     export downloads exactly the data on screen instead of the full builder
     payload used by the retired multi-section report. */
  const STATIC_SECTIONS = ['monthly', 'categories', 'income_sources', 'upcoming_bills', 'expense_review'];

  const dom = {
    form: document.querySelector('[data-report-form]'),
    from: document.querySelector('#report-from'),
    to: document.querySelector('#report-to'),
    compare: document.querySelector('#report-compare'),
    fromField: document.querySelector('[data-report-date-from-field]'),
    toField: document.querySelector('[data-report-date-to-field]'),
    presets: document.querySelector('[data-report-presets]'),
    message: document.querySelector('[data-report-message]'),
    state: document.querySelector('[data-report-state]'),
    content: document.querySelector('[data-report-content]'),
    period: document.querySelector('[data-report-period]'),
    chartLabel: document.querySelector('[data-report-chart-label]'),
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
    const custom = preset === 'custom';
    if (dom.fromField) dom.fromField.hidden = !custom;
    if (dom.toField) dom.toField.hidden = !custom;
  };

  /* ── Load ────────────────────────────────────────────────────────────── */
  const selectedSections = () =>
    dom.compare && dom.compare.value !== 'none'
      ? ['comparison', ...STATIC_SECTIONS]
      : STATIC_SECTIONS.slice();

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

  /* ── The income-versus-expenses trend chart ──────────────────────────── */
  // A grouped bar chart rendered as inline SVG. Colours come from the theme
  // tokens (--chart-income / --chart-expense), so the chart follows the
  // active palette and light/dark mode automatically.
  const trendChart = (monthly) => {
    const chartBox = document.querySelector('[data-report-chart]');
    if (chartBox) chartBox.replaceChildren();

    if (!chartBox || !monthly.length) {
      const empty = document.querySelector('[data-r="monthly-empty"]');
      if (empty) empty.hidden = false;
      return;
    }
    const empty = document.querySelector('[data-r="monthly-empty"]');
    if (empty) empty.hidden = true;

    const WIDTH = 720;
    const HEIGHT = 260;
    const PAD = { top: 12, right: 8, bottom: 28, left: 8 };
    const plotWidth = WIDTH - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;

    const peak = monthly.reduce(
      (highest, row) => Math.max(highest, Number(row.income_amount) || 0, Number(row.expense_amount) || 0),
      0
    );
    const max = peak > 0 ? peak : 1;
    const groupWidth = plotWidth / monthly.length;
    const barWidth = Math.min(26, Math.max(8, (groupWidth - 10) / 2));

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(HEIGHT));
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      `Income versus expenses per calendar month, ${monthly.length} month${monthly.length === 1 ? '' : 's'}`
    );
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Horizontal grid lines with the scale they represent.
    const GRID_LINES = 4;
    for (let index = 0; index <= GRID_LINES; index += 1) {
      const y = PAD.top + (plotHeight / GRID_LINES) * index;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(PAD.left));
      line.setAttribute('x2', String(WIDTH - PAD.right));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', 'var(--border)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(PAD.left + 4));
      label.setAttribute('y', String(Math.max(10, y - 4)));
      label.setAttribute('class', 'trend-axis-label');
      label.textContent = money((max / GRID_LINES) * (GRID_LINES - index));
      svg.appendChild(label);
    }

    monthly.forEach((row, index) => {
      const income = Number(row.income_amount) || 0;
      const expense = Number(row.expense_amount) || 0;
      const groupX = PAD.left + groupWidth * index;
      const incomeHeight = (income / max) * plotHeight;
      const expenseHeight = (expense / max) * plotHeight;
      const incomeY = PAD.top + plotHeight - incomeHeight;
      const expenseY = PAD.top + plotHeight - expenseHeight;

      const group = document.createElementNS(svgNS, 'g');

      const incomeBar = document.createElementNS(svgNS, 'rect');
      incomeBar.setAttribute('x', String(groupX + groupWidth / 2 - barWidth - 2));
      incomeBar.setAttribute('y', String(incomeY));
      incomeBar.setAttribute('width', String(barWidth));
      incomeBar.setAttribute('height', String(Math.max(incomeHeight, income > 0 ? 2 : 0)));
      incomeBar.setAttribute('rx', '3');
      incomeBar.setAttribute('fill', 'var(--chart-income)');
      incomeBar.setAttribute('class', 'trend-bar');
      group.appendChild(incomeBar);

      const expenseBar = document.createElementNS(svgNS, 'rect');
      expenseBar.setAttribute('x', String(groupX + groupWidth / 2 + 2));
      expenseBar.setAttribute('y', String(expenseY));
      expenseBar.setAttribute('width', String(barWidth));
      expenseBar.setAttribute('height', String(Math.max(expenseHeight, expense > 0 ? 2 : 0)));
      expenseBar.setAttribute('rx', '3');
      expenseBar.setAttribute('fill', 'var(--chart-expense)');
      expenseBar.setAttribute('class', 'trend-bar');
      group.appendChild(expenseBar);

      // The values are exposed to assistive tech and pointer users via the
      // accessible names, not as cramped in-chart text.
      const incomeTitle = document.createElementNS(svgNS, 'title');
      incomeTitle.textContent = `${H.monthLabel(row.month)} — income ${money(income)}`;
      incomeBar.appendChild(incomeTitle);

      const expenseTitle = document.createElementNS(svgNS, 'title');
      expenseTitle.textContent = `${H.monthLabel(row.month)} — expenses ${money(expense)}`;
      expenseBar.appendChild(expenseTitle);

      const monthLabel = document.createElementNS(svgNS, 'text');
      monthLabel.setAttribute('x', String(groupX + groupWidth / 2));
      monthLabel.setAttribute('y', String(HEIGHT - 8));
      monthLabel.setAttribute('text-anchor', 'middle');
      monthLabel.setAttribute('class', 'trend-axis-label');
      monthLabel.textContent = H.monthLabel(row.month, { short: true });
      group.appendChild(monthLabel);

      svg.appendChild(group);
    });

    chartBox.appendChild(svg);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  const render = (data) => {
    const summary = data.summary || {};
    const expectations = data.expectations || {};

    if (dom.period) dom.period.textContent = data.period ? data.period.label : 'Build, preview and export a report for any period';
    if (dom.chartLabel && data.monthly && data.monthly.length) {
      dom.chartLabel.textContent = `${H.monthLabel(data.monthly[0].month, { short: true })} to ${H.monthLabel(data.monthly[data.monthly.length - 1].month)} · actuals by calendar month`;
    }

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

    /* The trend chart — the centrepiece of the page. */
    trendChart(Array.isArray(data.monthly) ? data.monthly : []);

    /* Monthly table alternative */
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

    /* Comparison */
    const comparisonEl = document.querySelector('[data-r="comparison"]');
    const comparisonNote = document.querySelector('[data-r="comparison-note"]');
    const comparisonLabel = document.querySelector('[data-r="comparison-label"]');
    const comparisonWrap = document.querySelector('[data-comparison-wrap]');
    if (comparisonEl) comparisonEl.replaceChildren();

    if (data.comparison && comparisonEl) {
      if (comparisonWrap) comparisonWrap.hidden = false;
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
    } else if (comparisonWrap) {
      comparisonWrap.hidden = true;
      if (comparisonEl) comparisonEl.replaceChildren();
      setText(comparisonNote, '');
    }

    /* Categories */
    const categories = data.categories || [];
    const categoriesEl = document.querySelector('[data-r="categories"]');
    if (categoriesEl) categoriesEl.replaceChildren();
    if (document.querySelector('[data-r="category-empty"]')) {
      document.querySelector('[data-r="category-empty"]').hidden = categories.length > 0;
    }
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

    /* Largest transactions */
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

    /* Notes from the server (reading rules for the figures shown). */
    const notesList = document.querySelector('[data-r="notes"]');
    if (notesList) {
      notesList.replaceChildren();
      (data.notes || []).forEach((note) => {
        if (typeof note === 'string' && note.trim()) notesList.appendChild(el('li', '', note));
      });
    }
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
  load();
});
