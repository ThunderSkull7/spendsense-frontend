// Regression tests for the shared category → chart-colour mapping.
// Run with: node --test tests/theme-colors.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const THEME_JS = path.join(__dirname, '..', 'theme.js');

// theme.js is a browser IIFE; this minimal DOM/localStorage stub lets Node
// execute the same production file instead of duplicating its colour logic.
function loadSettings(chartVars = {}) {
  const storage = new Map();
  const root = { dataset: {} };
  const documentStub = {
    documentElement: root,
    body: null,
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
  };
  const context = {
    document: documentStub,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    getComputedStyle() {
      return {
        getPropertyValue(name) {
          return chartVars[name] || '';
        },
      };
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    console,
  };
  context.window = context;
  context.window.dispatchEvent = () => {};
  context.window.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(THEME_JS, 'utf8'), context, { filename: 'theme.js' });
  return { settings: context.SpendSenseSettings, root, storage };
}

const plain = (map) => Object.fromEntries([...map.entries()]);

test('category tone slots are independent of input order', () => {
  const { settings } = loadSettings();
  const forward = plain(settings.categoryTones(['cat:3', 'cat:1', 'cat:10', 'name:rent']));
  const reverse = plain(settings.categoryTones(['name:rent', 'cat:10', 'cat:1', 'cat:3']));
  assert.deepEqual(forward, reverse);
});

test('adding a newer category does not recolour existing categories', () => {
  const { settings } = loadSettings();
  const before = plain(settings.categoryTones(['cat:1', 'cat:2', 'cat:3']));
  const after = plain(settings.categoryTones(['cat:1', 'cat:2', 'cat:3', 'cat:12']));
  assert.equal(after['cat:1'], before['cat:1']);
  assert.equal(after['cat:2'], before['cat:2']);
  assert.equal(after['cat:3'], before['cat:3']);
});

test('removing a category does not recolour the remaining categories', () => {
  const { settings } = loadSettings();
  const before = plain(settings.categoryTones(['cat:1', 'cat:2', 'cat:3', 'cat:12']));
  const after = plain(settings.categoryTones(['cat:1', 'cat:3', 'cat:12']));
  assert.equal(after['cat:1'], before['cat:1']);
  assert.equal(after['cat:3'], before['cat:3']);
  assert.equal(after['cat:12'], before['cat:12']);
});

test('dashboard and reports receive the same mapping for the same categories', () => {
  const { settings } = loadSettings();
  const dashboardKeys = ['cat:2', 'cat:1', 'cat:4', 'cat:3', 'cat:5'];
  const reportsKeys = ['cat:5', 'cat:3', 'cat:4', 'cat:1', 'cat:2'];
  assert.deepEqual(plain(settings.categoryTones(dashboardKeys)), plain(settings.categoryTones(reportsKeys)));
});

test('name-only fallback keys remain deterministic', () => {
  const { settings } = loadSettings();
  const first = plain(settings.categoryTones(['name:food & dining', 'name:rent']));
  const second = plain(settings.categoryTones(['name:rent', 'name:food & dining']));
  assert.deepEqual(first, second);
});

test('more categories than palette colours are all mapped with a stable fallback', () => {
  const { settings } = loadSettings();
  const keys = Array.from({ length: 30 }, (_, index) => `cat:${index + 1}`);
  const before = plain(settings.categoryTones(keys));
  const after = plain(settings.categoryTones([...keys, 'cat:31']));
  assert.equal(Object.keys(before).length, 30);
  assert.ok(Object.values(before).every((slot) => Number.isInteger(slot) && slot >= 0 && slot < 10));
  keys.forEach((key) => assert.equal(after[key], before[key], `${key} stayed stable`));
  assert.ok(new Set(Object.values(before)).size < keys.length, 'documented hue reuse above 10 categories');
});

test('theme changes affect colours, not category slots', () => {
  const light = loadSettings({ '--chart-1': '#059669', '--chart-2': '#2563EB' });
  const dark = loadSettings({ '--chart-1': '#34D399', '--chart-2': '#60A5FA' });
  const keys = ['cat:1', 'cat:2', 'cat:3'];
  assert.deepEqual(plain(light.settings.categoryTones(keys)), plain(dark.settings.categoryTones(keys)));
  assert.notDeepEqual(light.settings.chartColors().slice(0, 2), dark.settings.chartColors().slice(0, 2));
  assert.equal(light.settings.chartColors().length, 10);
});

test('word boundaries prevent substring keyword false positives', () => {
  const { settings } = loadSettings();
  const tones = plain(settings.categoryTones(['name:rent', 'name:parenting', 'name:current account']));
  assert.equal(tones['name:rent'], 6, 'rent is slot 6');
  assert.notEqual(tones['name:parenting'], 6, 'parenting must not match rent');
  assert.notEqual(tones['name:current account'], 6, 'current must not match rent');
});

test('prefix matching is case-insensitive', () => {
  const { settings } = loadSettings();
  const lower = plain(settings.categoryTones(['cat:2', 'name:groceries']));
  const upper = plain(settings.categoryTones(['CAT:2', 'NAME:Groceries']));
  assert.equal(lower['cat:2'], upper['CAT:2']);
  assert.equal(lower['name:groceries'], upper['NAME:Groceries']);
});

test('settings.html offers exactly Light and Dark appearance mode and no accent palette selector exists', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  const modeMatch = html.match(/<select[^>]*data-theme-mode[^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(modeMatch, 'themeMode select element exists');
  const optionValues = [...modeMatch[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(optionValues, ['light', 'dark']);

  const optionTexts = [...modeMatch[1].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim());
  assert.deepEqual(optionTexts, ['Light mode', 'Dark mode']);

  // No accent palette selector in settings.html
  assert.equal(html.includes('data-theme-color'), false, 'data-theme-color must not be present in settings.html');
  assert.equal(html.includes('id="themeColor"'), false, 'themeColor id must not be present in settings.html');
  assert.equal(html.includes('theme-swatches-legend'), false, 'theme-swatches-legend must not be present in settings.html');
  assert.equal(html.includes('Colour palette'), false, 'Colour palette label must not be present in settings.html');
});

test('applyTheme toggles between light and dark modes with canonical teal accent and persists spendsenseThemeMode', () => {
  const { settings, root, storage } = loadSettings();

  settings.applyTheme('dark');
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(root.dataset.mode, 'dark');
  assert.equal(storage.get('spendsenseThemeMode'), 'dark');
  assert.equal(storage.get('spendsenseThemeColor'), undefined);

  settings.applyTheme('light');
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(root.dataset.mode, 'light');
  assert.equal(storage.get('spendsenseThemeMode'), 'light');
  assert.equal(storage.get('spendsenseThemeColor'), undefined);
});

test('existing alternate spendsenseThemeColor values are safely cleaned up and canonical teal is always enforced', () => {
  const storageMap = new Map([
    ['spendsenseThemeColor', 'red'],
    ['spendsenseThemeMode', 'dark']
  ]);

  const root = { dataset: {} };
  const context = {
    document: { documentElement: root, addEventListener() {}, querySelectorAll() { return []; } },
    localStorage: {
      getItem(key) { return storageMap.get(key) || null; },
      setItem(key, value) { storageMap.set(key, String(value)); },
      removeItem(key) { storageMap.delete(key); }
    },
    getComputedStyle() { return { getPropertyValue() { return ''; } }; },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class CustomEvent { constructor(type, opt = {}) { this.type = type; this.detail = opt.detail; } }
  };
  context.window = context;
  context.window.dispatchEvent = () => {};
  context.window.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(THEME_JS, 'utf8'), context, { filename: 'theme.js' });

  // Stored obsolete color must be removed and canonical teal enforced
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(root.dataset.mode, 'dark');
  assert.equal(storageMap.has('spendsenseThemeColor'), false, 'spendsenseThemeColor must be removed from storage');
  assert.equal(storageMap.get('spendsenseThemeMode'), 'dark', 'spendsenseThemeMode must be preserved');
});

test('styles.css contains fixed viewport height and flex column rules for sidebar', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.sidebar\s*\{[^}]*height:\s*100vh;/i);
  assert.match(css, /\.sidebar\s*\{[^}]*height:\s*100dvh;/i);
  assert.match(css, /\.sidebar\s*\{[^}]*display:\s*flex;/i);
  assert.match(css, /\.sidebar\s*\{[^}]*flex-direction:\s*column;/i);
  assert.match(css, /\.sidebar\s*\{[^}]*overflow-y:\s*hidden;/i);
  assert.match(css, /\.sidebar-nav\s*\{[^}]*overflow-y:\s*auto;/i);
  assert.match(css, /\.sidebar-footer\s*\{[^}]*margin-top:\s*auto;/i);
  assert.match(css, /@media\s*\(\s*max-height:\s*750px\s*\)/i);
});

test('styles.css defines canonical teal accent tokens for light and dark modes and contains no alternate blue/red/amber palette selectors', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  // Canonical teal token verification (#10B981)
  assert.match(css, /--primary:\s*#10B981;/i, 'primary accent must be canonical teal #10B981');

  // Alternate palette selectors must NOT exist in styles.css
  assert.doesNotMatch(css, /:root\[data-theme-color=["']?blue["']?\]/i, 'blue palette must be removed');
  assert.doesNotMatch(css, /:root\[data-theme-color=["']?red["']?\]/i, 'red palette must be removed');
  assert.doesNotMatch(css, /:root\[data-theme-color=["']?amber["']?\]/i, 'amber palette must be removed');
  assert.doesNotMatch(css, /:root\[data-mode=["']?dark["']?\]\[data-theme-color=["']?blue["']?\]/i);
  assert.doesNotMatch(css, /:root\[data-mode=["']?dark["']?\]\[data-theme-color=["']?red["']?\]/i);
  assert.doesNotMatch(css, /:root\[data-mode=["']?dark["']?\]\[data-theme-color=["']?amber["']?\]/i);

  // Near-black background token verification (#090B0F and surface #14171D)
  assert.match(css, /--bg:\s*#090B0F;/i, 'dark background must be #090B0F');
  assert.match(css, /--surface:\s*#14171D;/i, 'dark surface must be #14171D');
});

test('mode switching preserves canonical teal accent across public and authenticated pages', () => {
  const { settings, root } = loadSettings();

  assert.equal(settings.themeColor(), 'teal');
  assert.equal(root.dataset.themeColor, 'teal');

  settings.applyTheme('dark');
  assert.equal(settings.themeColor(), 'teal');
  assert.equal(root.dataset.mode, 'dark');

  settings.applyTheme('light');
  assert.equal(settings.themeColor(), 'teal');
  assert.equal(root.dataset.mode, 'light');
});

test('settings.js manages themeModeSelect without throwing or referencing obsolete themeColor', () => {
  const SETTINGS_JS = path.join(__dirname, '..', 'settings', 'settings.js');
  const storage = new Map([['spendsenseThemeMode', 'light']]);
  const root = {
    tagName: 'HTML',
    dataset: { themeColor: 'teal', mode: 'light' },
    getAttribute(attr) { return attr === 'data-mode' ? 'light' : null; },
    hasAttribute(attr) { return attr === 'data-mode'; }
  };

  const selectMode = {
    tagName: 'SELECT',
    id: 'themeMode',
    value: 'light',
    listeners: {},
    addEventListener(evt, handler) { this.listeners[evt] = handler; },
    dispatchEvent(evt) { if (this.listeners[evt.type]) this.listeners[evt.type](evt); }
  };

  const documentStub = {
    documentElement: root,
    querySelector(selector) {
      if (selector.includes('themeMode')) return selectMode;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  const context = {
    document: documentStub,
    localStorage: {
      getItem(k) { return storage.get(k) || null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); }
    },
    console,
    CustomEvent: class CustomEvent { constructor(t, opt = {}) { this.type = t; this.detail = opt.detail; } }
  };
  context.window = context;
  context.window.dispatchEvent = () => {};
  context.window.addEventListener = () => {};

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(THEME_JS, 'utf8'), context);
  vm.runInContext(fs.readFileSync(SETTINGS_JS, 'utf8'), context);

  // When user toggles mode to dark:
  selectMode.value = 'dark';
  selectMode.dispatchEvent({ type: 'change', target: selectMode });

  assert.equal(root.dataset.mode, 'dark');
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(storage.get('spendsenseThemeMode'), 'dark');
});


