/*
 * Stage 5 frontend integration – shared navigation data.
 *
 * Used by both the navigation updater and the Insights page generator so the
 * sidebar is identical everywhere.
 */
const ICON = {
  dashboard:
    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  expenses:
    '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/></svg>',
  income:
    '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  budgets:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/></svg>',
  bills:
    '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>',
  goals:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2"/><path d="M12 19v2"/><path d="M3 12h2"/><path d="M19 12h2"/></svg>',
  categories:
    '<svg viewBox="0 0 24 24"><path d="M3 5a2 2 0 0 1 2-2h6l10 10-8 8L3 11z"/><circle cx="8.5" cy="8.5" r="1.2"/></svg>',
  notifications:
    '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  support:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 1 1 3.8 2.6c-.8.3-1 .9-1 1.6v.4"/><path d="M12 17.2v.01"/></svg>',
  insightsOverview:
    '<svg viewBox="0 0 24 24"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/><path d="M17 5l4 4"/></svg>',
  trends:
    '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 7-8"/><path d="M17 7h4v4"/><path d="M21 21H3"/></svg>',
  quality:
    '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
  reports:
    '<svg viewBox="0 0 24 24"><path d="M5 20v-6"/><path d="M11 20V8"/><path d="M17 20v-9"/><path d="M3 20h18"/></svg>',
  spendingInsights:
    '<svg viewBox="0 0 24 24"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/><path d="M17 5l4 4"/></svg>',
  forecast:
    '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 7-8"/><path d="M17 7h4v4"/><path d="M21 21H3"/></svg>',
  netWorth:
    '<svg viewBox="0 0 24 24"><path d="M4 7h16v12H4z"/><path d="M7 7V4h10v3"/><path d="M4 11h16"/><path d="M15 15h2"/></svg>',
  subscriptions:
    '<svg viewBox="0 0 24 24"><path d="M20 7h-9a4 4 0 0 0-4 4v1"/><path d="M17 4l3 3-3 3"/><path d="M4 17h9a4 4 0 0 0 4-4v-1"/><path d="M7 20l-3-3 3-3"/></svg>',
};

const MONEY_GROUPS = [
  {
    title: 'Money',
    links: [
      { key: 'expenses', href: '../expense-management/expenses.html', label: 'Expenses', icon: ICON.expenses },
      { key: 'income', href: '../income-management/income.html', label: 'Income', icon: ICON.income },
      { key: 'budgets', href: '../budget-planning/budget.html', label: 'Budgets', icon: ICON.budgets },
      { key: 'bills', href: '../recurring-expenses/recurring-expenses.html', label: 'Bills', icon: ICON.bills },
      { key: 'goals', href: '../savings-goals/savings-goals.html', label: 'Goals', icon: ICON.goals },
      { key: 'categories', href: '../categories-management/categories.html', label: 'Categories', icon: ICON.categories },
    ],
  },
];

const STAGE5_GROUPS = [
  {
    title: 'Insights',
    links: [
      { key: 'insights-overview', href: '../insights/overview.html', label: 'Insights overview', icon: ICON.insightsOverview },
      { key: 'insights-trends', href: '../insights/trends.html', label: 'Spending trends', icon: ICON.trends },
      { key: 'insights-income', href: '../insights/income.html', label: 'Income analysis', icon: ICON.income },
      { key: 'insights-budgets', href: '../insights/budgets.html', label: 'Budget performance', icon: ICON.budgets },
      { key: 'insights-savings', href: '../insights/savings.html', label: 'Savings goals progress', icon: ICON.goals },
      { key: 'insights-commitments', href: '../insights/commitments.html', label: 'Recurring commitments', icon: ICON.bills },
      { key: 'insights-quality', href: '../insights/data-quality.html', label: 'Data quality', icon: ICON.quality },
    ],
  },
  {
    title: 'Reports & more',
    links: [
      { key: 'reports', href: '../reports-analytics/reports.html', label: 'Reports', icon: ICON.reports },
      { key: 'insights', href: '../financial-intelligence/insights.html', label: 'Spending insights', icon: ICON.spendingInsights },
      { key: 'forecast', href: '../financial-intelligence/forecast.html', label: 'Cash-flow forecast', icon: ICON.forecast },
      { key: 'net-worth', href: '../financial-intelligence/net-worth.html', label: 'Net worth', icon: ICON.netWorth },
      { key: 'subscriptions', href: '../financial-intelligence/subscriptions.html', label: 'Subscriptions', icon: ICON.subscriptions },
    ],
  },
];

const ACCOUNT_GROUP = {
  title: 'Account',
  links: [
    { key: 'notifications', href: '../notifications/notifications.html', label: 'Notifications', icon: ICON.notifications },
    { key: 'settings', href: '../settings/settings.html', label: 'Settings', icon: ICON.settings },
    { key: 'support', href: '../support/support.html', label: 'Support', icon: ICON.support },
  ],
};

const OVERVIEW_GROUP = {
  title: 'Overview',
  links: [
    { key: 'dashboard', href: '../dashboard/dashboard.html', label: 'Dashboard', icon: ICON.dashboard },
  ],
};

const linkMarkup = (link, activeKey) => {
  const active = link.key === activeKey ? ' active' : '';
  return `        <a class="sidebar-link${active}" href="${link.href}" data-nav="${link.key}"><span class="nav-ico">${link.icon}</span>${link.label}</a>`;
};

const groupMarkup = (group, activeKey) =>
  `        <p class="sidebar-group">${group.title}</p>\n` +
  group.links.map((link) => linkMarkup(link, activeKey)).join('\n');

/**
 * Build the whole sidebar navigation for a page.
 * `activeKey` is the data-nav value of the current page.
 */
const buildNav = (activeKey) =>
  [OVERVIEW_GROUP, ...MONEY_GROUPS, ...STAGE5_GROUPS, ACCOUNT_GROUP]
    .map((group) => groupMarkup(group, activeKey))
    .join('\n');

module.exports = { ICON, buildNav, groupMarkup, linkMarkup, STAGE5_GROUPS, MONEY_GROUPS, ACCOUNT_GROUP, OVERVIEW_GROUP };
