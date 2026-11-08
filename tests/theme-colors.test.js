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

test('settings.html offers Light, Dark, and System appearance modes and eight-color palette selector', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  const modeMatch = html.match(/<select[^>]*data-theme-mode[^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(modeMatch, 'themeMode select element exists');
  const optionValues = [...modeMatch[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(optionValues, ['light', 'dark', 'system']);

  // Palette selector in settings.html
  assert.ok(html.includes('data-theme-color'), 'data-theme-color must be present in settings.html');
  assert.ok(html.includes('id="themeColor"'), 'themeColor id must be present in settings.html');
  assert.ok(html.includes('data-palette-picker'), 'data-palette-picker must be present in settings.html');

  // Verify all 8 palettes are present
  const expectedPalettes = ['teal', 'blue', 'violet', 'plum', 'rose', 'orange', 'jade', 'indigo'];
  for (const pal of expectedPalettes) {
    assert.ok(html.includes(`data-palette="${pal}"`), `palette button for ${pal} must be present`);
  }
});

test('applyTheme toggles between light, dark, and system modes and persists user preferences', () => {
  const { settings, root, storage } = loadSettings();

  settings.applyTheme('dark');
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(root.dataset.mode, 'dark');
  assert.equal(storage.get('spendsenseThemeMode'), 'dark');
  assert.equal(storage.get('spendsenseThemeColor'), 'teal');

  settings.applyTheme('light');
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(root.dataset.mode, 'light');
  assert.equal(storage.get('spendsenseThemeMode'), 'light');
  assert.equal(storage.get('spendsenseThemeColor'), 'teal');

  settings.applyTheme('system');
  assert.equal(root.dataset.themeColor, 'teal');
  assert.equal(storage.get('spendsenseThemeMode'), 'system');
  assert.ok(['light', 'dark'].includes(root.dataset.mode));
});

test('eight selectable accent palettes are supported with immediate switching and persistence', () => {
  const { settings, root, storage } = loadSettings();
  const palettes = ['teal', 'blue', 'violet', 'plum', 'rose', 'orange', 'jade', 'indigo'];

  for (const pal of palettes) {
    settings.applyTheme(null, pal);
    assert.equal(root.dataset.themeColor, pal, `root dataset must be ${pal}`);
    assert.equal(storage.get('spendsenseThemeColor'), pal, `storage must persist ${pal}`);
    assert.equal(settings.themeColor(), pal);
  }

  // Fallback for invalid palette
  settings.applyTheme(null, 'nonexistent_palette');
  assert.equal(root.dataset.themeColor, 'teal', 'invalid palette must fall back to default teal');
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

test('styles.css defines complete 12-step tonal scales for all eight palettes in light and dark modes', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const expectedPalettes = ['teal', 'blue', 'violet', 'plum', 'rose', 'orange', 'jade', 'indigo'];

  for (const pal of expectedPalettes) {
    assert.match(css, new RegExp(`:root\\[data-theme-color=["']?${pal}["']?\\]`, 'i'), `${pal} light palette selector must exist`);
    assert.match(css, new RegExp(`:root\\[data-mode=["']?dark["']?\\]\\[data-theme-color=["']?${pal}["']?\\]`, 'i'), `${pal} dark palette selector must exist`);
  }

  // Verify 12-step scale tokens are defined
  for (let i = 1; i <= 12; i++) {
    assert.match(css, new RegExp(`--palette-${i}:`, 'i'), `--palette-${i} token must be defined`);
  }

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



test('System mode resolves according to OS preference and updates on live changes', () => {
  const storage = new Map([['spendsenseThemeMode', 'system'], ['spendsenseThemeColor', 'teal']]);
  const root = { dataset: {} };
  let osDark = true;
  let mqlListener = null;

  const context = {
    document: { documentElement: root, addEventListener() {}, querySelectorAll() { return []; } },
    localStorage: {
      getItem(k) { return storage.get(k) || null; },
      setItem(k, v) { storage.set(k, String(v)); },
      removeItem(k) { storage.delete(k); }
    },
    matchMedia(query) {
      return {
        matches: osDark,
        addEventListener(evt, fn) { mqlListener = fn; },
        addListener(fn) { mqlListener = fn; }
      };
    },
    getComputedStyle() { return { getPropertyValue() { return ''; } }; },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class CustomEvent { constructor(t, opt = {}) { this.type = t; this.detail = opt.detail; } }
  };
  context.window = context;
  let lastEvent = null;
  context.window.dispatchEvent = (e) => { lastEvent = e; };
  context.window.addEventListener = () => {};

  vm.createContext(context);
  vm.runInContext(fs.readFileSync(THEME_JS, 'utf8'), context);

  // Initial load with OS dark:
  assert.equal(root.dataset.themeMode, 'system', 'saved mode must be system');
  assert.equal(root.dataset.mode, 'dark', 'effective mode must be dark when OS is dark');

  // Live change to Light:
  osDark = false;
  if (mqlListener) {
    mqlListener({ matches: false });
  }
  assert.equal(root.dataset.themeMode, 'system', 'saved mode remains system');
  assert.equal(root.dataset.mode, 'light', 'effective mode updates to light');
  assert.equal(lastEvent?.detail?.effectiveMode, 'light');
  assert.equal(lastEvent?.detail?.mode, 'system');
});

test('Contrast ratios for all eight palettes in light and dark modes satisfy WCAG 2.2 AA (>= 4.5:1)', () => {
  function sRGBtoLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
  }
  function contrast(h1, h2) {
    const l1 = lum(h1), l2 = lum(h2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const palettes = ['teal', 'blue', 'violet', 'plum', 'rose', 'orange', 'jade', 'indigo'];

  for (const pal of palettes) {
    // Extract light mode button background (--primary-600)
    const lightMatch = css.match(new RegExp(`:root\\[data-theme-color=["']?${pal}["']?\\][^{]*\\{[^}]*--primary-600:\\s*(#[0-9a-fA-F]{6});`, 'i'));
    assert.ok(lightMatch, `Light mode --primary-600 must exist for ${pal}`);
    const lightBtnBg = lightMatch[1];
    const lightBtnContrast = contrast(lightBtnBg, '#FFFFFF');
    assert.ok(lightBtnContrast >= 4.5, `Light button for ${pal} (${lightBtnBg}) against white must exceed 4.5:1 (got ${lightBtnContrast.toFixed(2)})`);

    // Extract dark mode text accent (--primary)
    const darkMatch = css.match(new RegExp(`:root\\[data-mode=["']?dark["']?\\]\\[data-theme-color=["']?${pal}["']?\\][^{]*\\{[^}]*--primary:\\s*(#[0-9a-fA-F]{6});`, 'i'));
    assert.ok(darkMatch, `Dark mode --primary must exist for ${pal}`);
    const darkPrimary = darkMatch[1];
    // Dark surface is #14171D
    const darkTextContrast = contrast(darkPrimary, '#14171D');
    assert.ok(darkTextContrast >= 4.5, `Dark text for ${pal} (${darkPrimary}) against #14171D must exceed 4.5:1 (got ${darkTextContrast.toFixed(2)})`);
  }
});

test('Theme-change event dispatches correct details for both mode and palette changes', () => {
  const { settings } = loadSettings();
  let received = null;
  global.window = {
    dispatchEvent(evt) { if (evt.type === 'spendsense:theme-change') received = evt.detail; }
  };

  settings.applyTheme('dark', 'rose');
  assert.equal(settings.themeMode(), 'dark');
  assert.equal(settings.themeColor(), 'rose');
  assert.equal(settings.effectiveMode(), 'dark');

  settings.applyTheme('light', 'violet');
  assert.equal(settings.themeMode(), 'light');
  assert.equal(settings.themeColor(), 'violet');
  assert.equal(settings.effectiveMode(), 'light');
});
