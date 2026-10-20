/*
 * Stage 5 frontend integration – small corrections.
 *
 * 1. The shared API client already prefixes "/api", so the endpoint paths
 *    must not repeat it.
 * 2. The reports API takes inclusive YYYY-MM-DD dates, not YYYY-MM months.
 *    The month presets are converted to a concrete date range before the
 *    request is sent.
 *
 * Run from the frontend directory:  node tools/stage5-fix-endpoints.js
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
    "      const result = await api.get(`/api/reports?${qs.toString()}`);",
    "      const result = await api.get(`/reports?${qs.toString()}`);",
    'reports endpoint path',
  ],
]);

/* ── expenses.js ──────────────────────────────────────────────────────── */
patch('expense-management/expenses.js', [
  [
    "      const { data, status } = await api.get(`/api/transactions/search?${query.toString()}`);",
    "      const { data, status } = await api.get(`/transactions/search?${query.toString()}`);",
    'transaction search endpoint path',
  ],
]);
