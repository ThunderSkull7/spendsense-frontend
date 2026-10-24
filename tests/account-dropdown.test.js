// Tests for the top-right account dropdown and UI redesign foundations.
// Run with: node --test tests/account-dropdown.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const THEME_JS = path.join(__dirname, '..', 'theme.js');
const STYLES_CSS = path.join(__dirname, '..', 'styles.css');
const DASHBOARD_HTML = path.join(__dirname, '..', 'dashboard', 'dashboard.html');
const EXPENSES_HTML = path.join(__dirname, '..', 'expense-management', 'expenses.html');
const SETTINGS_HTML = path.join(__dirname, '..', 'settings', 'settings.html');

test('dashboard.html contains top-right account dropdown control in topbar-actions', () => {
  const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
  assert.match(html, /class="topbar-actions"/, 'topbar-actions container must exist');
  assert.match(html, /class="account-menu"/, 'account-menu must exist in topbar');
  assert.match(html, /id="account-menu-trigger"/, 'account trigger button must exist');
  assert.match(html, /aria-haspopup="menu"/, 'trigger must specify aria-haspopup="menu"');
  assert.match(html, /class="dropdown-chevron"/, 'dropdown indicator chevron must exist');
  assert.match(html, /data-user-name/, 'account name must use data-user-name attribute');
  assert.match(html, /data-user-avatar/, 'avatar must use data-user-avatar attribute');
  assert.match(html, /data-user-email/, 'dropdown must display user email');
  assert.match(html, /href="\.\.\/settings\/settings\.html#profile"/, 'dropdown must link to My Profile');
  assert.match(html, /href="\.\.\/settings\/settings\.html"/, 'dropdown must link to Settings');
  assert.match(html, /href="\.\.\/settings\/settings\.html#security"/, 'dropdown must link to Security');
  assert.match(html, /href="\.\.\/support\/support\.html"/, 'dropdown must link to Help & Support');
  assert.match(html, /class="dropdown-link dropdown-logout"[^>]*data-logout/, 'dropdown must have clearly separated Logout');
});

test('expenses.html contains top-right account dropdown control', () => {
  const html = fs.readFileSync(EXPENSES_HTML, 'utf8');
  assert.match(html, /class="account-menu"/, 'account-menu must exist in expenses topbar');
  assert.match(html, /id="account-menu-trigger"/, 'account trigger must exist');
  assert.match(html, /class="account-dropdown"/, 'dropdown menu must exist');
});

test('settings.html contains profile and security anchor targets', () => {
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  assert.match(html, /id="profile"/, 'profile section must have id="profile"');
  assert.match(html, /id="security"/, 'security section must have id="security"');
});

test('styles.css contains design foundation tokens, account menu rules, and stat-card hierarchy', () => {
  const css = fs.readFileSync(STYLES_CSS, 'utf8');

  // Design foundation variables
  assert.match(css, /--space-md:\s*16px;/, 'must declare spacing scale');
  assert.match(css, /--font-size-base:\s*0\.9375rem;/, 'must declare typography scale');
  assert.match(css, /--focus-ring:\s*0 0 0 3px var\(--primary-ring\);/, 'must declare focus ring token');
  assert.match(css, /--border-radius-md:\s*var\(--r\);/, 'must declare border radius token');

  // Account menu & dropdown styles
  assert.match(css, /\.account-menu\s*\{[^}]*position:\s*relative;/i);
  assert.match(css, /\.account-trigger\s*\{[^}]*display:\s*inline-flex;/i);
  assert.match(css, /\.account-dropdown\s*\{[^}]*position:\s*absolute;/i);
  assert.match(css, /\.account-dropdown\s*\{[^}]*right:\s*0;/i);
  assert.match(css, /\.account-dropdown\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/i);
  assert.match(css, /\.dropdown-logout\s*\{[^}]*color:\s*var\(--danger\);/i);

  // Stat card hierarchy
  assert.match(css, /\.stat-card-income::before/, 'must style income card accent');
  assert.match(css, /\.stat-card-expenses::before/, 'must style expenses card accent');
  assert.match(css, /\.stat-card-net::before/, 'must style net cash flow card accent');
  assert.match(css, /\.stat-card-budget::before/, 'must style budget remaining card accent');

  // Mobile overflow & responsiveness
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.account-name\s*\{\s*display:\s*none;\s*\}/i);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow-x:\s*auto;/i);
});

test('theme.js dynamically mounts and wires account dropdown with keyboard and click navigation', () => {
  let clickHandler = null;
  let keydownHandler = null;
  let docClickHandler = null;
  let domContentLoadedHandler = null;

  const trigger = {
    tagName: 'BUTTON',
    attributes: { 'aria-expanded': 'false' },
    hasAttribute(attr) { return attr in this.attributes; },
    getAttribute(attr) { return this.attributes[attr] || null; },
    setAttribute(attr, val) { this.attributes[attr] = String(val); },
    removeAttribute(attr) { delete this.attributes[attr]; },
    addEventListener(evt, fn) {
      if (evt === 'click') clickHandler = fn;
    },
    focus() { this.focused = true; }
  };

  const dropdown = {
    tagName: 'DIV',
    closest(sel) { return menu; },
    attributes: { hidden: 'true' },
    hasAttribute(attr) { return attr in this.attributes; },
    getAttribute(attr) { return this.attributes[attr] || null; },
    setAttribute(attr, val) { this.attributes[attr] = String(val); },
    removeAttribute(attr) { delete this.attributes[attr]; },
    querySelectorAll() { return []; }
  };

  const menu = {
    tagName: 'DIV',
    querySelector(sel) {
      if (sel.includes('trigger') || sel.includes('button')) return trigger;
      if (sel.includes('dropdown') || sel.includes('panel')) return dropdown;
      return null;
    },
    contains(target) { return target === trigger || target === dropdown || target === menu; },
    addEventListener(evt, fn) {
      if (evt === 'keydown') keydownHandler = fn;
    }
  };

  const topbarActions = {
    tagName: 'DIV',
    className: 'topbar-actions',
    querySelector(sel) {
      if (sel.includes('data-account-menu')) return menu;
      return null;
    },
    appendChild() {}
  };

  const documentStub = {
    documentElement: { dataset: { themeColor: 'green', mode: 'light' } },
    body: { classList: { add() {}, remove() {}, toggle() {} } },
    querySelector(sel) {
      if (sel === '.topbar-actions') return topbarActions;
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('data-account-menu')) return [menu];
      if (sel.includes('account-dropdown')) return [dropdown];
      return [];
    },
    createTreeWalker() {
      return { nextNode() { return null; } };
    },
    addEventListener(evt, fn) {
      if (evt === 'click') docClickHandler = fn;
      if (evt === 'DOMContentLoaded') domContentLoadedHandler = fn;
    }
  };

  const context = {
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {} },
    console,
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class CustomEvent { constructor(t, opt = {}) { this.type = t; this.detail = opt.detail; } }
  };
  context.window = context;
  context.window.dispatchEvent = () => {};
  context.window.addEventListener = () => {};

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(THEME_JS, 'utf8'), context);

  // Trigger initShell
  if (domContentLoadedHandler) domContentLoadedHandler();

  // 1. Initially hidden
  assert.equal(dropdown.hasAttribute('hidden'), true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');

  // 2. Click to open
  assert.ok(clickHandler, 'click handler must be attached to trigger');
  clickHandler({ stopPropagation() {} });
  assert.equal(dropdown.hasAttribute('hidden'), false, 'dropdown should be visible after click');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');

  // 3. Escape key closes
  assert.ok(keydownHandler, 'keydown handler must be attached to menu');
  keydownHandler({ key: 'Escape', preventDefault() {} });
  assert.equal(dropdown.hasAttribute('hidden'), true, 'dropdown should be hidden after Escape');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(trigger.focused, true, 'focus should return to trigger');

  // 4. Click outside closes
  clickHandler({ stopPropagation() {} });
  assert.equal(dropdown.hasAttribute('hidden'), false);
  assert.ok(docClickHandler, 'outside click handler must exist');
  docClickHandler({ target: { outside: true } });
  assert.equal(dropdown.hasAttribute('hidden'), true, 'outside click must close dropdown');
});
