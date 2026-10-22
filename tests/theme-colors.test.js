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

test('applyTheme persists color and mode to storage and updates documentElement dataset', () => {
  const { settings, root, storage } = loadSettings();
  
  const palettes = ['green', 'blue', 'red', 'yellow', 'amethyst', 'clean-light'];
  for (const color of palettes) {
    settings.applyTheme(color, 'dark');
    assert.equal(root.dataset.themeColor, color);
    assert.equal(root.dataset.mode, 'dark');
    assert.equal(storage.get('spendsenseThemeColor'), color);
    assert.equal(storage.get('spendsenseThemeMode'), 'dark');

    settings.applyTheme(color, 'light');
    assert.equal(root.dataset.themeColor, color);
    assert.equal(root.dataset.mode, 'light');
    assert.equal(storage.get('spendsenseThemeColor'), color);
    assert.equal(storage.get('spendsenseThemeMode'), 'light');
  }
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

test('styles.css contains semantic tokens for all 6 required theme palettes in both light and dark mode', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const requiredPalettes = ['green', 'blue', 'red', 'yellow', 'amethyst', 'clean-light'];
  for (const palette of requiredPalettes) {
    assert.match(css, new RegExp(`:root\\[data-theme-color=["']?${palette}["']?\\]`, 'i'), `missing light mode for ${palette}`);
    if (palette !== 'clean-light') {
      assert.match(css, new RegExp(`:root\\[data-mode=["']?dark["']?\\]\\[data-theme-color=["']?${palette}["']?\\]`, 'i'), `missing dark mode for ${palette}`);
    }
  }
});


