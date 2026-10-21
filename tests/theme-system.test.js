// Theme system contract tests.
// Run with: node --test tests/theme-system.test.js
//
// theme.js is a browser IIFE. These tests execute the real production file in
// a vm sandbox with stubs for matchMedia and storage, so the persistence and
// resolution rules (palette separate from light/dark, "system" following the
// OS preference live) are checked against the shipped code, not a copy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const THEME_JS = path.join(__dirname, '..', 'theme.js');

function loadTheme({ saved = {}, osDark = true } = {}) {
  const storageData = new Map(Object.entries(saved));
  const storage = {
    getItem: (key) => (storageData.has(key) ? storageData.get(key) : null),
    setItem: (key, value) => storageData.set(key, String(value)),
  };

  const root = { dataset: {} };
  const mediaListeners = [];
  const media = {
    get matches() {
      return currentOsDark;
    },
    addEventListener: (_type, listener) => mediaListeners.push(listener),
  };
  let currentOsDark = osDark;

  const dispatched = [];
  const documentStub = {
    documentElement: root,
    body: null,
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    createTreeWalker() {
      return { nextNode: () => false };
    },
  };

  const context = {
    document: documentStub,
    localStorage: storage,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options ? options.detail : undefined;
      }
    },
  };
  context.window = context;
  context.window.matchMedia = () => media;
  context.window.dispatchEvent = (event) => {
    dispatched.push(event);
  };
  context.window.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(THEME_JS, 'utf8'), context, { filename: 'theme.js' });

  return {
    settings: context.SpendSenseSettings,
    root,
    storage: storageData,
    dispatched,
    setOsDark(value) {
      currentOsDark = value;
    },
    fireOsChange() {
      mediaListeners.slice().forEach((listener) => listener({ matches: currentOsDark }));
    },
  };
}

test('first visit follows the OS preference without storing an explicit mode', () => {
  const env = loadTheme({ osDark: true });
  assert.equal(env.settings.themeMode(), 'system');
  assert.equal(env.settings.resolvedThemeMode(), 'dark');
  assert.equal(env.root.dataset.mode, 'dark');
  assert.equal(env.root.dataset.themeColor, 'emerald');
  // The preference is persisted so first paint on the next page agrees.
  assert.equal(env.storage.get('spendsenseThemeMode'), 'system');
});

test('an explicit saved mode wins over the OS preference', () => {
  const env = loadTheme({ saved: { spendsenseThemeMode: 'light' }, osDark: true });
  assert.equal(env.settings.themeMode(), 'light');
  assert.equal(env.settings.resolvedThemeMode(), 'light');
  assert.equal(env.root.dataset.mode, 'light');

  const dark = loadTheme({ saved: { spendsenseThemeMode: 'dark' }, osDark: false });
  assert.equal(dark.settings.resolvedThemeMode(), 'dark');
});

test('system mode re-resolves live when the OS setting changes', () => {
  const env = loadTheme({ osDark: true });
  assert.equal(env.root.dataset.mode, 'dark');

  env.setOsDark(false);
  env.fireOsChange();
  assert.equal(env.root.dataset.mode, 'light');
  assert.equal(env.settings.themeMode(), 'system', 'the preference itself never changes');
  assert.equal(env.dispatched.length, 1);
  assert.equal(env.dispatched[0].type, 'spendsense:theme-change');
  assert.equal(env.dispatched[0].detail.resolvedMode, 'light');

  // An explicit choice is never overridden by the OS.
  env.settings.applyTheme(env.settings.themeColor(), 'dark');
  env.dispatched.length = 0;
  env.setOsDark(true);
  env.fireOsChange();
  assert.equal(env.root.dataset.mode, 'dark');
  assert.equal(env.dispatched.length, 0, 'no event when nothing changed');
});

test('palette choice is independent of light/dark mode and both persist', () => {
  const env = loadTheme({ saved: { spendsenseThemeColor: 'amber', spendsenseThemeMode: 'dark' } });
  assert.equal(env.settings.themeColor(), 'amber');
  assert.equal(env.settings.resolvedThemeMode(), 'dark');

  env.settings.applyTheme('blue', 'dark');
  assert.equal(env.storage.get('spendsenseThemeColor'), 'blue');
  assert.equal(env.storage.get('spendsenseThemeMode'), 'dark');

  env.settings.applyTheme('blue', 'system');
  assert.equal(env.storage.get('spendsenseThemeColor'), 'blue');
  assert.equal(env.storage.get('spendsenseThemeMode'), 'system');
  assert.equal(env.root.dataset.mode, 'dark', 'system resolves against the OS (dark)');

  // Legacy palette aliases keep older saved preferences working.
  env.settings.applyTheme('yellow', 'light');
  assert.equal(env.storage.get('spendsenseThemeColor'), 'amber');
});

test('theme attributes are applied before any render, without FOUC', () => {
  // theme.js applies dataset attributes synchronously at load; there is no
  // DOMContentLoaded or stylesheet dependency in the theming path.
  const source = fs.readFileSync(THEME_JS, 'utf8');
  const applyBlock = source.indexOf("root.dataset.themeColor = savedColor;");
  const listenerBlock = source.indexOf('document.addEventListener("DOMContentLoaded", initShell);');
  assert.ok(applyBlock > -1 && listenerBlock > -1);
  assert.ok(applyBlock < listenerBlock, 'theme must resolve before the shell initialises');
});

test('the settings page offers system, light and dark with palette choice separate', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.html'), 'utf8');
  assert.ok(html.includes('name="themeMode" value="system"'));
  assert.ok(html.includes('name="themeMode" value="light"'));
  assert.ok(html.includes('name="themeMode" value="dark"'));
  ['emerald', 'blue', 'red', 'amber'].forEach((palette) => {
    assert.ok(html.includes(`name="themeColor" value="${palette}"`), `the ${palette} palette should exist`);
  });
  // Settings reads the preference (themeMode), not the resolved attribute.
  const source = fs.readFileSync(path.join(__dirname, '..', 'settings', 'settings.js'), 'utf8');
  assert.ok(source.includes('settings.themeMode()'));
});
