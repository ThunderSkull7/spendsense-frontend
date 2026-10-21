/*
 * Stage 5 frontend integration – attribute repair.
 *
 * A number of data-* attributes were written with a missing closing quote
 * (for example data-r="monthly-rows>). A browser parses such an attribute
 * as one long value, so the JavaScript selectors that look for it never
 * match. This script finds every data-* attribute whose value is not closed
 * before the next ">" or before the next attribute, and closes it.
 *
 * Run from the frontend directory:  node tools/stage5-attr-repair.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FILES = [
  'dashboard/dashboard.html',
  'reports-analytics/reports.html',
  'insights/overview.html',
  'insights/budgets.html',
  'insights/savings.html',
  'insights/commitments.html',
  'insights/data-quality.html',
  // The page generator carries the same markup, so it is repaired too. A
  // regenerated page then stays correct without a second manual pass.
  'tools/stage5-insights-pages.js',
];

/**
 * Close every data-* attribute whose quoted value is not terminated.
 * Returns the repaired source and the number of fixes.
 */
const repair = (html) => {
  let fixes = 0;

  // Case 0: an earlier pass already split the attribute incorrectly, for
  // example data-r="comparison-note style"="margin-top: 12px">.
  html = html.replace(
    /data-([a-z-]+)="([a-z-]+) ([a-z-]+)"="/g,
    (match, name, value, nextAttribute) => {
      fixes += 1;
      return `data-${name}="${value}" ${nextAttribute}="`;
    }
  );

  // Case 0b: the same shape with a boolean attribute, for example
  // data-r="monthly-empty hidden">.
  html = html.replace(
    /data-([a-z-]+)="([a-z-]+) ([a-z-]+)">/g,
    (match, name, value, nextAttribute) => {
      fixes += 1;
      return `data-${name}="${value}" ${nextAttribute}>`;
    }
  );

  // Case 1: the value ran into the next attribute, for example
  //   data-r="comparison-note style="margin-top: 12px">
  // The value ends at the whitespace before the next attribute name.
  html = html.replace(
    /data-([a-z-]+)="([a-z-]+) ([a-z-]+)="/g,
    (match, name, value, nextAttribute) => {
      fixes += 1;
      return `data-${name}="${value}" ${nextAttribute}="`;
    }
  );

  // Case 2: the value ran into the closing bracket, for example
  //   data-r="monthly-rows>
  html = html.replace(
    /data-([a-z-]+)="([a-z-]+)>/g,
    (match, name, value) => {
      fixes += 1;
      return `data-${name}="${value}">`;
    }
  );

  // Case 3: the value ran into a space before a boolean attribute, for
  //   example data-r="monthly-empty hidden>
  html = html.replace(
    /data-([a-z-]+)="([a-z-]+) ([a-z-]+)>/g,
    (match, name, value, nextAttribute) => {
      fixes += 1;
      return `data-${name}="${value}" ${nextAttribute}>`;
    }
  );

  return { html, fixes };
};

FILES.forEach((relative) => {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    console.log(`SKIP  ${relative} (missing)`);
    return;
  }
  const source = fs.readFileSync(file, 'utf8');
  const { html, fixes } = repair(source);
  if (fixes === 0) {
    console.log(`OK    ${relative} (no repairs needed)`);
    return;
  }
  fs.writeFileSync(file, html, 'utf8');
  console.log(`FIX   ${relative} (${fixes} attribute${fixes === 1 ? '' : 's'} closed)`);
});
