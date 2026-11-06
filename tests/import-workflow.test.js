const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const IMPORT_MODAL_JS = path.join(__dirname, '..', 'import-modal.js');

test('import-modal.js exports SpendSenseImport and sanitizeCsvCell neutralizes formula injection', () => {
  const context = {
    document: {
      querySelectorAll() { return []; },
      querySelector() { return null; },
      addEventListener() {},
      readyState: 'complete',
    },
    window: {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(IMPORT_MODAL_JS, 'utf8'), context);

  assert.ok(context.SpendSenseImport, 'window.SpendSenseImport is defined');
  const sanitize = context.SpendSenseImport.sanitizeCsvCell;
  assert.equal(typeof sanitize, 'function');

  // Neutralizes formulas starting with =, +, -, @, |, %
  assert.equal(sanitize('=SUM(A1:B10)'), '"\'=SUM(A1:B10)"');
  assert.equal(sanitize('+cmd|calc!A0'), '"\'+cmd|calc!A0"');
  assert.equal(sanitize('-12345'), ' -12345'.trim()); // Legitimate negative numbers are not mangled
  assert.equal(sanitize('-calc'), '"\'-calc"');
  assert.equal(sanitize('@alert'), '"\'@alert"');
  assert.equal(sanitize('|pipe'), '"\'|pipe"');
  assert.equal(sanitize('%COMSPEC%'), '"\'%COMSPEC%"');
  assert.equal(sanitize('  =formula'), '"\'  =formula"');

  // Plain strings and numbers
  assert.equal(sanitize('Normal description'), '"Normal description"');
  assert.equal(sanitize('100.50'), '100.50');
  assert.equal(sanitize('0'), '0');
  assert.equal(sanitize(''), '""');
  assert.equal(sanitize(null), '""');
});

test('expenses.html, income.html, and settings.html provide data-import-csv trigger buttons and load import-modal.js', () => {
  const root = path.join(__dirname, '..');
  const pages = [
    { file: 'expense-management/expenses.html', hasTrigger: true },
    { file: 'income-management/income.html', hasTrigger: true },
    { file: 'settings/settings.html', hasTrigger: true },
  ];

  for (const p of pages) {
    const html = fs.readFileSync(path.join(root, p.file), 'utf8');
    assert.ok(html.includes('data-import-csv'), `${p.file} must include data-import-csv button`);
    assert.ok(html.includes('import-modal.js'), `${p.file} must include <script src="...import-modal.js">`);
  }
});

test('styles.css contains modal-wide and import workflow layout styles', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.modal\.modal-wide/i, 'styles.css must style .modal.modal-wide');
  assert.match(css, /\.import-dropzone/i, 'styles.css must style .import-dropzone');
  assert.match(css, /\.import-summary-bar/i, 'styles.css must style .import-summary-bar');
  assert.match(css, /\.import-policy-box/i, 'styles.css must style .import-policy-box');
  assert.match(css, /\.import-table-wrap/i, 'styles.css must style .import-table-wrap');
  assert.match(css, /\.import-errors-box/i, 'styles.css must style .import-errors-box');
});

test('script.js SpendSenseAPI provides postForm method for multipart CSV uploads', () => {
  const scriptContent = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  assert.match(scriptContent, /async\s+postForm\s*\(/i, 'SpendSenseAPI must provide postForm method');
  assert.match(scriptContent, /X-XSRF-TOKEN/i, 'postForm must attach CSRF token');
});

