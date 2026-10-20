/*
 * Stage 5 frontend integration – wire the shared helpers into the pages.
 *
 * The reports centre, the insights pages and the dashboard all use the same
 * period maths and layout rules, so they read them from the shared module
 * instead of keeping their own copies.
 *
 * Run from the frontend directory:  node tools/stage5-wire-common.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const patch = (relative, edits) => {
  const file = path.join(ROOT, relative);
  let source = fs.readFileSync(file, 'utf8');
  edits.forEach(([needle, replacement, label]) => {
    if (!source.includes(needle)) {
      console.log(`SKIP  ${relative}: ${label}`);
      return;
    }
    source = source.split(needle).join(replacement);
    console.log(`OK    ${relative}: ${label}`);
  });
  fs.writeFileSync(file, source, 'utf8');
};

/* ── reports.js ───────────────────────────────────────────────────────── */
patch('reports-analytics/reports.js', [
  [
    `  const H = window.SpendSenseIntelligence;`,
    `  const H = window.SpendSenseIntelligence;
  const S5 = window.SpendSenseStage5;`,
    'read the shared helpers',
  ],
  [
    `  const pad = (value) => String(value).padStart(2, '0');
  const iso = (date) => \`\${date.getUTCFullYear()}-\${pad(date.getUTCMonth() + 1)}-\${pad(date.getUTCDate())}\`;
  const monthStart = (year, month) => iso(new Date(Date.UTC(year, month, 1)));
  const monthEnd = (year, month) => iso(new Date(Date.UTC(year, month + 1, 0)));
  const todayIso = () => iso(new Date());

  const presetRange = (preset) => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    switch (preset) {
      case 'last-month': {
        const date = new Date(Date.UTC(year, month - 1, 1));
        return { from: monthStart(date.getUTCFullYear(), date.getUTCMonth()), to: monthEnd(date.getUTCFullYear(), date.getUTCMonth()) };
      }
      case 'this-quarter': {
        const start = Math.floor(month / 3) * 3;
        return { from: monthStart(year, start), to: monthEnd(year, start + 2) };
      }
      case 'last-quarter': {
        const start = Math.floor(month / 3) * 3 - 3;
        const base = new Date(Date.UTC(year, start, 1));
        return {
          from: monthStart(base.getUTCFullYear(), base.getUTCMonth()),
          to: monthEnd(base.getUTCFullYear(), base.getUTCMonth() + 2),
        };
      }
      case 'last-6-months': {
        const date = new Date(Date.UTC(year, month - 5, 1));
        return { from: monthStart(date.getUTCFullYear(), date.getUTCMonth()), to: todayIso() };
      }
      case 'year-to-date':
        return { from: monthStart(year, 0), to: todayIso() };
      case 'custom':
        return null;
      case 'this-month':
      default:
        return { from: monthStart(year, month), to: todayIso() };
    }
  };`,
    `  // The period maths lives in the shared Stage 5 module so the reports
  // centre, the insights pages and the tests all agree on the boundaries.
  const presetRange = (preset) => S5.presetRange(preset);`,
    'use the shared preset range',
  ],
  [
    `  const buildQuery = () => {
    const query = new URLSearchParams();
    query.set('from', dom.from.value);
    query.set('to', dom.to.value);
    query.set('compare', dom.compare.value);
    const sections = selectedSections();
    if (sections.length) query.set('sections', sections.join(','));
    return query;
  };`,
    `  const buildQuery = () =>
    S5.buildReportQuery({
      from: dom.from.value,
      to: dom.to.value,
      compare: dom.compare.value,
      sections: selectedSections(),
    });`,
    'use the shared report query builder',
  ],
]);

/* ── insights-pages.js ───────────────────────────────────────────────── */
patch('insights/insights-pages.js', [
  [
    `  const H = window.SpendSenseIntelligence;`,
    `  const H = window.SpendSenseIntelligence;
  const S5 = window.SpendSenseStage5;`,
    'read the shared helpers',
  ],
  [
    `  const lastDayOfMonth = (month) => {
    const [year, monthNumber] = String(month).split('-').map(Number);
    const date = new Date(Date.UTC(year, monthNumber, 0));
    return date.toISOString().slice(0, 10);
  };

  const monthRangeToDates = (fromMonth, toMonth) => ({
    from: \`\${fromMonth}-01\`,
    to: lastDayOfMonth(toMonth),
  });`,
    `  // The reports API takes inclusive YYYY-MM-DD dates, so the month
  // selectors are converted with the shared helper.
  const monthRangeToDates = (fromMonth, toMonth) => S5.monthRangeToDates(fromMonth, toMonth);`,
    'use the shared month range conversion',
  ],
]);

/* ── dashboard.js ────────────────────────────────────────────────────── */
patch('dashboard/dashboard.js', [
  [
    `  const settings = window.SpendSenseSettings;`,
    `  const settings = window.SpendSenseSettings;
  const S5 = window.SpendSenseStage5;`,
    'read the shared helpers',
  ],
  [
    `  const defaultLayout = () =>
    WIDGETS.map((widget) => ({
      key: widget.key,
      visible: !DEFAULT_HIDDEN.includes(widget.key),
    }));`,
    `  const defaultLayout = () => S5.defaultWidgetLayout(WIDGET_KEYS, DEFAULT_HIDDEN);`,
    'use the shared default layout',
  ],
]);

/* ── the pages load the shared module ────────────────────────────────── */
const scriptTag = '  <script src="../stage5/stage5-common.js"></script>\n';

const addScript = (relative, anchor) => {
  const file = path.join(ROOT, relative);
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('stage5-common.js')) {
    console.log(`SKIP  ${relative}: shared script already linked`);
    return;
  }
  if (!source.includes(anchor)) {
    console.log(`SKIP  ${relative}: anchor not found`);
    return;
  }
  source = source.replace(anchor, scriptTag + anchor);
  fs.writeFileSync(file, source, 'utf8');
  console.log(`OK    ${relative}: shared script linked`);
};

addScript('reports-analytics/reports.html', '    <script src="../script.js"></script>');
addScript('dashboard/dashboard.html', '    <script src="../script.js"></script>');

// The Insights pages are generated, so the generator carries the script tag.
const generatorFile = path.join(ROOT, 'tools', 'stage5-insights-pages.js');
let generator = fs.readFileSync(generatorFile, 'utf8');
if (generator.includes('stage5-common.js')) {
  console.log('SKIP  tools/stage5-insights-pages.js: shared script already linked');
} else {
  const anchor = '    <script src="../script.js"></script>';
  if (!generator.includes(anchor)) {
    console.log('SKIP  tools/stage5-insights-pages.js: anchor not found');
  } else {
    generator = generator.replace(
      anchor,
      '    <script src="../stage5/stage5-common.js"></script>\n' + anchor
    );
    fs.writeFileSync(generatorFile, generator, 'utf8');
    console.log('OK    tools/stage5-insights-pages.js: shared script linked');
  }
}
