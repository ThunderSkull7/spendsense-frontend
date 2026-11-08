// Dedicated Accessibility Regression Test Suite for SpendSense
// Verifies WCAG 2.2 AA accessibility requirements:
// - Heading structure (H1 -> H2 -> H3) across all 25 pages
// - SVG and Icon accessibility (aria-hidden on decorative SVGs)
// - Form control labeling (inputs, selects, textareas, radios, checkboxes)
// - Modal dialog semantics (role="dialog", aria-modal="true", aria-labelledby)
// - Focus indicators and contrast (:focus-visible)
// - Reduced motion support (@media (prefers-reduced-motion: reduce))
// - Focus trapping and management in SpendSenseUI
// Run with: node --test tests/accessibility.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

const ALL_25_PAGES = [
  'index.html',
  'authentication/login.html',
  'authentication/signup.html',
  'authentication/forgot-password.html',
  'dashboard/dashboard.html',
  'expense-management/expenses.html',
  'expense-management/add-expense.html',
  'income-management/income.html',
  'budget-planning/budget.html',
  'categories-management/categories.html',
  'recurring-transactions/recurring-transactions.html',
  'savings-goals/savings-goals.html',
  'debts-loans/debts-loans.html',
  'subscriptions/subscriptions.html',
  'net-worth/net-worth.html',
  'reports-analytics/reports.html',
  'spending-trends/spending-trends.html',
  'income-analysis/income-analysis.html',
  'budget-performance/budget-performance.html',
  'cash-flow-forecast/cash-flow-forecast.html',
  'financial-health/financial-health.html',
  'financial-calendar/financial-calendar.html',
  'notifications/notifications.html',
  'settings/settings.html',
  'support/support.html'
];

test('every application page has exactly one primary H1 heading with logical hierarchy', () => {
  for (const pageRel of ALL_25_PAGES) {
    const filePath = path.join(rootDir, pageRel);
    assert.ok(fs.existsSync(filePath), `Page file must exist: ${pageRel}`);
    const html = fs.readFileSync(filePath, 'utf8');

    // Extract all headings
    const headings = [];
    const regex = /<(h[1-6])\b([^>]*)>(.*?)<\/\1>/gis;
    let match;
    while ((match = regex.exec(html)) !== null) {
      headings.push({
        level: parseInt(match[1].slice(1), 10),
        tag: match[1].toLowerCase(),
        text: match[3].replace(/<[^>]+>/g, '').trim()
      });
    }

    const h1s = headings.filter(h => h.level === 1);
    assert.equal(
      h1s.length,
      1,
      `${pageRel} must have exactly one H1 primary heading (found ${h1s.length}: ${h1s.map(h => h.text).join(', ')})`
    );

    // Verify no skipped heading levels (e.g. H1 followed immediately by H3 or H4)
    let currentLevel = 0;
    for (const h of headings) {
      if (currentLevel > 0) {
        assert.ok(
          h.level <= currentLevel + 1,
          `${pageRel} heading hierarchy must not skip levels (jumped from H${currentLevel} to H${h.level}: "${h.text}")`
        );
      }
      currentLevel = h.level;
    }
  }
});

test('decorative SVGs across all pages declare aria-hidden="true"', () => {
  for (const pageRel of ALL_25_PAGES) {
    const filePath = path.join(rootDir, pageRel);
    const html = fs.readFileSync(filePath, 'utf8');

    const svgRegex = /<svg\b([^>]*)>/gi;
    let match;
    let unlabelledCount = 0;
    const unlabelled = [];

    while ((match = svgRegex.exec(html)) !== null) {
      const attrs = match[1];
      const hasAriaHidden = /aria-hidden\s*=\s*["']true["']/i.test(attrs);
      const hasAriaLabel = /aria-label\s*=/i.test(attrs);
      const hasAriaLabelledby = /aria-labelledby\s*=/i.test(attrs);
      const hasRoleImg = /role\s*=\s*["']img["']/i.test(attrs);

      if (!hasAriaHidden && !hasAriaLabel && !hasAriaLabelledby && !hasRoleImg) {
        unlabelledCount++;
        unlabelled.push(match[0].slice(0, 70));
      }
    }

    assert.equal(
      unlabelledCount,
      0,
      `${pageRel} has ${unlabelledCount} SVGs without aria-hidden="true" or accessible label: ${unlabelled.join('; ')}`
    );
  }
});

test('all form controls across all pages have accessible names and associated labels', () => {
  for (const pageRel of ALL_25_PAGES) {
    const filePath = path.join(rootDir, pageRel);
    const html = fs.readFileSync(filePath, 'utf8');

    const labelsFor = new Set();
    for (const m of html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>/gi)) {
      labelsFor.add(m[1]);
    }

    const inputRegex = /<(input|select|textarea)\b([^>]*)>/gi;
    let match;
    const missingLabels = [];

    while ((match = inputRegex.exec(html)) !== null) {
      const tag = match[1];
      const attrs = match[2];
      const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : (tag === 'input' ? 'text' : tag);
      if (type === 'hidden') continue;

      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      const id = idMatch ? idMatch[1] : null;
      const hasAriaLabel = /\baria-label=["'][^"']+["']/i.test(attrs);
      const hasAriaLabelledby = /\baria-labelledby=["'][^"']+["']/i.test(attrs);
      const hasAssociatedLabel = id && labelsFor.has(id);

      // Check if wrapped inside a <label>
      const before = html.slice(Math.max(0, match.index - 180), match.index);
      const wrappedInLabel = /<label\b[^>]*>[^<]*$/i.test(before);

      if (!hasAssociatedLabel && !hasAriaLabel && !hasAriaLabelledby && !wrappedInLabel) {
        missingLabels.push(`<${tag} id="${id || 'none'}" type="${type}">`);
      }
    }

    assert.equal(
      missingLabels.length,
      0,
      `${pageRel} has ${missingLabels.length} unlabelled form controls: ${missingLabels.join(', ')}`
    );
  }
});

test('all modal dialogs declare role="dialog", aria-modal="true", and matching aria-labelledby', () => {
  const pagesWithModals = [
    'index.html',
    'recurring-transactions/recurring-transactions.html',
    'savings-goals/savings-goals.html',
    'debts-loans/debts-loans.html',
    'subscriptions/subscriptions.html',
    'net-worth/net-worth.html',
    'financial-calendar/financial-calendar.html'
  ];

  for (const pageRel of pagesWithModals) {
    const filePath = path.join(rootDir, pageRel);
    const html = fs.readFileSync(filePath, 'utf8');

    // Find all modal dialog containers (elements with class="modal" exactly, not modal-header/body/footer)
    const dialogMatches = Array.from(html.matchAll(/<(div|aside)\b([^>]*)>/gi))
      .filter(m => {
        const clsMatch = m[2].match(/\bclass=["']([^"']+)["']/i);
        if (!clsMatch) return false;
        const classes = clsMatch[1].split(/\s+/);
        return classes.includes('modal') && !classes.includes('modal-backdrop');
      });
    assert.ok(dialogMatches.length > 0, `${pageRel} should have at least one modal element`);

    for (const match of dialogMatches) {
      const attrs = match[2];
      // Either this element or its parent backdrop has role="dialog" and aria-modal="true"
      const hasRoleDialog = /role=["']dialog["']/i.test(attrs) || /role=["']dialog["']/i.test(html.slice(Math.max(0, match.index - 120), match.index));
      const hasAriaModal = /aria-modal=["']true["']/i.test(attrs) || /aria-modal=["']true["']/i.test(html.slice(Math.max(0, match.index - 120), match.index));
      const hasAriaLabelledby = /aria-labelledby=["']([^"']+)["']/i.test(attrs) || /aria-label=["']([^"']+)["']/i.test(attrs);

      assert.ok(hasRoleDialog, `${pageRel} modal must declare role="dialog" (${match[0]})`);
      assert.ok(hasAriaModal, `${pageRel} modal must declare aria-modal="true" (${match[0]})`);
      assert.ok(hasAriaLabelledby, `${pageRel} modal must declare aria-labelledby or aria-label (${match[0]})`);

      // If aria-labelledby is used, confirm that title element exists
      const labelledbyMatch = attrs.match(/aria-labelledby=["']([^"']+)["']/i);
      if (labelledbyMatch) {
        const titleId = labelledbyMatch[1];
        assert.ok(html.includes(`id="${titleId}"`), `${pageRel} modal title with id="${titleId}" must exist`);
      }
    }
  }
});

test('styles.css and auth.css respect prefers-reduced-motion: reduce', () => {
  const stylesCss = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
  assert.ok(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(stylesCss),
    'styles.css must contain @media (prefers-reduced-motion: reduce) block'
  );
  assert.ok(
    /animation-duration:\s*0\.01ms\s*!important/i.test(stylesCss),
    'styles.css must collapse animation duration under reduced motion'
  );
  assert.ok(
    /transition-duration:\s*0\.01ms\s*!important/i.test(stylesCss),
    'styles.css must collapse transition duration under reduced motion'
  );

  const authCss = fs.readFileSync(path.join(rootDir, 'authentication', 'auth.css'), 'utf8');
  assert.ok(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/i.test(authCss),
    'auth.css must contain @media (prefers-reduced-motion: reduce) block'
  );
});

test('focus indicators provide high contrast rings across interactive states', () => {
  const stylesCss = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
  assert.ok(
    /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--primary\)/i.test(stylesCss),
    'styles.css must define standard :focus-visible outline with --primary'
  );
  assert.ok(
    /\.btn\.primary:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--ink\)/i.test(stylesCss),
    'styles.css must provide high-contrast --ink outline on .btn.primary:focus-visible'
  );
  assert.ok(
    /\.btn\.primary:focus-visible[^{]*\{[^}]*box-shadow:[^;]*var\(--primary-ring\)/i.test(stylesCss),
    'styles.css must supply matching --primary-ring box-shadow on focused primary button'
  );
});

test('SpendSenseUI exposes accessible focus trap and focusable element helpers', () => {
  const scriptJs = fs.readFileSync(path.join(rootDir, 'script.js'), 'utf8');
  assert.ok(
    /getFocusableElements\(container\)/.test(scriptJs),
    'script.js SpendSenseUI must provide getFocusableElements helper'
  );
  assert.ok(
    /trapFocus\(container,\s*event\)/.test(scriptJs),
    'script.js SpendSenseUI must provide trapFocus keyboard management helper'
  );
  assert.ok(
    /lastUniversalTrigger/.test(scriptJs),
    'script.js must track last active trigger for modal focus restoration'
  );
});
