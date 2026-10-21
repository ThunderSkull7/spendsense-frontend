/*
 * Stage 5 frontend integration – navigation.
 *
 * Replaces the sidebar "Insights" region on every page with the canonical
 * Stage 5 navigation, so the new Insights pages and the existing Stage 4
 * pages are all reachable and consistently grouped.
 *
 * The Reports link is restored here as part of the canonical block.
 *
 * Run from the frontend directory:  node tools/stage5-nav.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ICON = {
  overview:
    '<svg viewBox="0 0 24 24"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/><path d="M17 5l4 4"/></svg>',
  budgets:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/></svg>',
  savings:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2"/><path d="M12 19v2"/><path d="M3 12h2"/><path d="M19 12h2"/></svg>',
  commitments:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/></svg>',
  quality:
    '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
  reports:
    '<svg viewBox="0 0 24 24"><path d="M5 20v-6"/><path d="M11 20V8"/><path d="M17 20v-9"/><path d="M3 20h18"/></svg>',
  subscriptions:
    '<svg viewBox="0 0 24 24"><path d="M20 7h-9a4 4 0 0 0-4 4v1"/><path d="M17 4l3 3-3 3"/><path d="M4 17h9a4 4 0 0 0 4-4v-1"/><path d="M7 20l-3-3 3-3"/></svg>',
};

/**
 * Canonical Stage 5 navigation groups.
 * `active` marks the entry that should be marked active on a given page.
 */
const GROUPS = [
  {
    title: 'Insights',
    links: [
      { key: 'insights-overview', href: '../insights/overview.html', label: 'Insights overview', icon: ICON.overview },
      { key: 'insights-budgets', href: '../insights/budgets.html', label: 'Budget performance', icon: ICON.budgets },
      { key: 'insights-savings', href: '../insights/savings.html', label: 'Savings progress', icon: ICON.savings },
      { key: 'insights-commitments', href: '../insights/commitments.html', label: 'Recurring commitments', icon: ICON.commitments },
      { key: 'insights-quality', href: '../insights/data-quality.html', label: 'Data quality', icon: ICON.quality },
    ],
  },
  {
    title: 'Reports & more',
    links: [
      { key: 'reports', href: '../reports-analytics/reports.html', label: 'Reports', icon: ICON.reports },
      { key: 'subscriptions', href: '../financial-intelligence/subscriptions.html', label: 'Subscriptions', icon: ICON.subscriptions },
    ],
  },
];

const linkMarkup = (link, activeKey) => {
  const active = link.key === activeKey ? ' active' : '';
  return `        <a class="sidebar-link${active}" href="${link.href}" data-nav="${link.key}"><span class="nav-ico">${link.icon}</span>${link.label}</a>`;
};

const buildBlock = (activeKey) =>
  GROUPS.map(
    (group) =>
      `        <p class="sidebar-group">${group.title}</p>\n` +
      group.links.map((link) => linkMarkup(link, activeKey)).join('\n')
  ).join('\n');

/* Pages and the nav key that should be marked active on each. */
const PAGES = [
  ['dashboard/dashboard.html', 'dashboard'],
  ['expense-management/expenses.html', 'expenses'],
  ['expense-management/add-expense.html', 'expenses'],
  ['income-management/income.html', 'income'],
  ['budget-planning/budget.html', 'budgets'],
  ['savings-goals/savings-goals.html', 'goals'],
  ['categories-management/categories.html', 'categories'],
  ['reports-analytics/reports.html', 'reports'],
  ['financial-intelligence/subscriptions.html', 'subscriptions'],
  ['notifications/notifications.html', 'notifications'],
  ['settings/settings.html', 'settings'],
  ['support/support.html', 'support'],
  ['insights/overview.html', 'insights-overview'],
  ['insights/budgets.html', 'insights-budgets'],
  ['insights/savings.html', 'insights-savings'],
  ['insights/commitments.html', 'insights-commitments'],
  ['insights/data-quality.html', 'insights-quality'],
];

/*
 * The region replaced is the sidebar "Insights" group up to (but not
 * including) the "Account" group. Pages that do not yet have an Insights
 * group get the block inserted before the Account group.
 */
const REGION = /(\s*)<p class="sidebar-group">Insights<\/p>[\s\S]*?(?=<p class="sidebar-group">Account<\/p>)/;

let changed = 0;
let skipped = 0;

PAGES.forEach(([relative, activeKey]) => {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    console.log(`SKIP  ${relative} (missing)`);
    return;
  }

  let html = fs.readFileSync(file, 'utf8');
  const before = html;

  if (REGION.test(html)) {
    html = html.replace(REGION, (_, indent) => `${indent}${buildBlock(activeKey)}\n`);
  } else {
    // No Insights group yet: insert before the Account group.
    const accountAnchor = '<p class="sidebar-group">Account</p>';
    if (!html.includes(accountAnchor)) {
      console.log(`SKIP  ${relative} (no Account group anchor)`);
      return;
    }
    html = html.replace(
      accountAnchor,
      `${buildBlock(activeKey)}\n        ${accountAnchor}`
    );
  }

  // The "active" class must be applied to exactly one sidebar link. The
  // builder handles the Stage 5 links; clear it everywhere else.
  html = html.replace(
    /<a class="sidebar-link active" href="([^"]*)" data-nav="([^"]*)">/g,
    '<a class="sidebar-link" href="$1" data-nav="$2">'
  );
  const activeLink = new RegExp(
    `<a class="sidebar-link" href="([^"]*)" data-nav="${activeKey.replace(/[-]/g, '\\-')}">`
  );
  html = html.replace(activeLink, '<a class="sidebar-link active" href="$1" data-nav="ACTIVEKEY">');
  html = html.replace(/data-nav="ACTIVEKEY"/g, `data-nav="${activeKey}"`);

  if (html !== before) {
    fs.writeFileSync(file, html, 'utf8');
    changed += 1;
    console.log(`OK    ${relative} (active: ${activeKey})`);
  } else {
    skipped += 1;
    console.log(`SAME  ${relative}`);
  }
});

console.log(`\n${changed} page(s) updated, ${skipped} unchanged`);
