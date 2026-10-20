/*
 * Stage 5 frontend integration – dashboard layout robustness.
 *
 * 1. The widgets that the default layout hides start hidden in the markup, so
 *    a slow or failed preferences request leaves the page in the documented
 *    default state instead of briefly showing every widget.
 * 2. The preferences request carries a cache buster, so a cached layout can
 *    never be applied after the user has just changed it.
 *
 * Run from the frontend directory:  node tools/stage5-dashboard-robust.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ── 1. The default-hidden widgets start hidden ───────────────────────── */
const htmlFile = path.join(ROOT, 'dashboard', 'dashboard.html');
let html = fs.readFileSync(htmlFile, 'utf8');

['net_worth', 'subscription_renewals'].forEach((key) => {
  const needle = `<article class="card dashboard-widget" data-widget="${key}">`;
  const replacement = `<article class="card dashboard-widget" data-widget="${key}" hidden>`;
  if (html.includes(replacement)) {
    console.log(`SAME  dashboard.html: ${key} already starts hidden`);
    return;
  }
  if (!html.includes(needle)) {
    console.log(`SKIP  dashboard.html: ${key}`);
    return;
  }
  html = html.split(needle).join(replacement);
  console.log(`OK    dashboard.html: ${key} starts hidden`);
});

fs.writeFileSync(htmlFile, html, 'utf8');

/* ── 2. The preferences request carries a cache buster ────────────────── */
const jsFile = path.join(ROOT, 'dashboard', 'dashboard.js');
let source = fs.readFileSync(jsFile, 'utf8');

const needle = `      const result = await api.get('/dashboard/preferences');`;
const replacement = `      // The cache buster keeps a previously cached layout from being applied
      // after the user has just changed it.
      const result = await api.get(\`/dashboard/preferences?_=\${Date.now()}\`);`;

if (!source.includes(needle)) {
  console.log('SKIP  dashboard.js: the preferences request');
} else {
  source = source.split(needle).join(replacement);
  fs.writeFileSync(jsFile, source, 'utf8');
  console.log('OK    dashboard.js: the preferences request carries a cache buster');
}
