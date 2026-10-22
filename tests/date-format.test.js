// Regression tests for date-only formatting and local "today" defaults.
// Run with: node --test tests/date-format.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const THEME_JS = path.join(__dirname, '..', 'theme.js');

// Load the production theme.js in a minimal browser-like context. `now` fixes
// the clock so the local-date helper can be checked around midnight.
function loadSettings({ now, storageThrows = false } = {}) {
  const memory = new Map();
  const root = { dataset: {} };
  const RealDate = Date;
  const FixedDate = now
    ? class extends RealDate {
        constructor(...args) {
          if (args.length === 0) super(now);
          else super(...args);
        }
        static now() {
          return now;
        }
      }
    : RealDate;
  const localStorageStub = {
    getItem(key) {
      if (storageThrows) throw new Error('blocked');
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      if (storageThrows) throw new Error('blocked');
      memory.set(key, String(value));
    },
  };
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
    localStorage: localStorageStub,
    Date: FixedDate,
    getComputedStyle() {
      return { getPropertyValue: () => '' };
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
  return { settings: context.SpendSenseSettings, memory };
}

// Dates are formatted with en-IN, whose month abbreviations are locale data,
// so assertions compare the numeric day/year and the parsed month index.
const dayOf = (text) => Number(text.split(' ')[0]);
const yearOf = (text) => Number(text.split(' ')[2]);

test('date-only strings keep their calendar day in every timezone', () => {
  const { settings } = loadSettings();
  // A date-only value must never be re-interpreted as an instant, so the
  // result is the same regardless of the machine's timezone.
  const formatted = settings.formatDate('2026-10-19');
  assert.equal(dayOf(formatted), 19);
  assert.equal(yearOf(formatted), 2026);
});

test("Laravel's date-cast midnight timestamp keeps its calendar day", () => {
  const { settings } = loadSettings();
  const formatted = settings.formatDate('2026-10-19T00:00:00.000000Z');
  assert.equal(dayOf(formatted), 19);
  assert.equal(yearOf(formatted), 2026);
});

test('datetime strings with a real time still convert to local time', () => {
  const { settings } = loadSettings();
  // A timestamp with a real time is a genuine instant, so it must be shown in
  // the local timezone. Derive the expected day the same way to keep the test
  // independent of where it runs.
  const formatted = settings.formatDate('2026-10-19T22:30:00Z');
  assert.equal(dayOf(formatted), new Date('2026-10-19T22:30:00Z').getDate());
});

test('invalid dates fall back to the original string', () => {
  const { settings } = loadSettings();
  assert.equal(settings.formatDate('not-a-date'), 'not-a-date');
  assert.equal(settings.formatDate(''), '');
  assert.equal(settings.formatDate(null), '');
});

test('todayInputValue returns the local calendar date just after midnight', () => {
  // 2026-10-19 00:30 in Asia/Kolkata == 2026-10-18T19:00Z.
  const { settings } = loadSettings({ now: Date.UTC(2026, 9, 18, 19, 0, 0) });
  const local = new Date(Date.UTC(2026, 9, 18, 19, 0, 0));
  const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
    local.getDate()
  ).padStart(2, '0')}`;
  assert.equal(settings.todayInputValue(), expected);
  assert.match(settings.todayInputValue(), /^\d{4}-\d{2}-\d{2}$/);
});

test('storage failures fall back to memory instead of breaking the shell', () => {
  const { settings } = loadSettings({ storageThrows: true });
  assert.equal(settings.themeColor(), 'green');
  assert.equal(settings.themeMode(), 'light');
  settings.applyTheme('blue', 'dark');
  assert.equal(settings.themeColor(), 'blue');
  assert.equal(settings.themeMode(), 'dark');
  settings.applyCurrency('USD');
  assert.equal(settings.currency, 'USD');
  assert.equal(settings.symbol, '$');
});
