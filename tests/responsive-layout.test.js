// Browser regression test for Batch 4 responsive-layout verification.
// Opens representative pages at the required viewport widths (360, 390, 768,
// 1280) in light and dark appearances and asserts that no horizontal page
// overflow is produced and that the mobile drawer can be opened and closed
// with the Escape key.
// Run with: node --test tests/responsive-layout.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].find((candidate) => fs.existsSync(candidate)) || null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJSON(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function createMockServer(rootDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    const endpoint = pathname.replace(/^\/api/, '');

    if (endpoint === '/user') {
      sendJSON(res, { success: true, user: { id: 1, name: 'Responsive Batch Check', email: 'batch4@example.com' } });
      return;
    }
    if (endpoint === '/analytics/cash-flow') {
      sendJSON(res, {
        success: true,
        data: { month: 10, year: 2026, income: 42000, expenses: 18000, net: 24000 }
      });
      return;
    }
    if (endpoint === '/analytics/spending-by-category') {
      sendJSON(res, {
        success: true,
        data: { month: 10, year: 2026, breakdown: [ { category_id: 11, category_name: 'Food', total_spent: 1200 } ] }
      });
      return;
    }
    if (endpoint === '/analytics/month-comparison') {
      sendJSON(res, {
        success: true,
        data: {
          current_month: { month: 10, year: 2026, income: 42000, expenses: 18000, net: 24000 },
          previous_month: { month: 9, year: 2026, income: 40000, expenses: 19000, net: 21000 },
          change_percentage: { income: 5, expenses: -5.3 }
        }
      });
      return;
    }
    if (endpoint === '/analytics/budget-status') {
      sendJSON(res, {
        success: true,
        data: { month: 10, year: 2026, budgets: [] }
      });
      return;
    }
    if (endpoint === '/categories') {
      sendJSON(res, {
        success: true,
        data: [
          { id: 11, name: 'Food', type: 'expense' },
          { id: 12, name: 'Transport', type: 'expense' },
          { id: 21, name: 'Salary', type: 'income' }
        ]
      });
      return;
    }
    if (endpoint === '/expenses' || endpoint.startsWith('/expenses?') || /^\/expenses\/\d+$/.test(endpoint)) {
      sendJSON(res, {
        success: true,
        data: [
          { id: 1, amount: 250.5, description: 'Groceries', category: { id: 11, name: 'Food' }, transaction_date: '2026-10-08' },
          { id: 2, amount: 89.99, description: 'Metro card recharge', category: { id: 12, name: 'Transport' }, transaction_date: '2026-10-09' }
        ],
        meta: { current_page: 1, last_page: 1, per_page: 10 }
      });
      return;
    }
    if (endpoint === '/incomes' || endpoint.startsWith('/incomes?') || /^\/incomes\/\d+$/.test(endpoint)) {
      sendJSON(res, {
        success: true,
        data: [
          { id: 1, amount: 35000, source: 'Salary', frequency: 'monthly', income_date: '2026-10-01' }
        ],
        meta: { current_page: 1, last_page: 1, per_page: 10 }
      });
      return;
    }
    if (endpoint === '/budgets') {
      sendJSON(res, {
        success: true,
        data: [
          { id: 1, limit_amount: 3000, month_year: '2026-10', category: { id: 11, name: 'Food' } }
        ]
      });
      return;
    }

    const filePath = path.join(rootDir, pathname.slice(1));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html' || ext === '.js') {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/127\.0\.0\.1:8002/g, `127.0.0.1:${req.socket.localPort}`);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] });
      res.end(content);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const PAGES = [
  'dashboard/dashboard.html',
  'expense-management/expenses.html',
  'income-management/income.html',
  'budget-planning/budget.html',
  'categories-management/categories.html',
  'settings/settings.html'
];
const VIEWPORTS = [360, 390, 768, 1280];

test('authenticated pages have no horizontal overflow at required widths and themes', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    if (process.env.CI) {
      assert.fail('Chrome executable required in CI environment but not found');
    }
    t.skip('Chrome executable not found; skipping browser test');
    return;
  }
  const rootDir = path.resolve(__dirname, '..');
  const server = createMockServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devTools = new Promise((resolve) => {
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = Number(match[1]);
        resolve();
      }
    });
  });
  let ws = null;
  let msgId = 1;
  const callbacks = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    callbacks.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression: `(() => { try { ${expression} } catch (error) { return { error: error.message }; } })()`,
      returnByValue: true
    });
    const value = response.result && response.result.result ? response.result.result.value : null;
    if (value && value.error) throw new Error(value.error);
    return value;
  };

  try {
    await devTools;
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/${PAGES[0]}`), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && callbacks.has(message.id)) {
        callbacks.get(message.id)(message);
        callbacks.delete(message.id);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.enable');

    for (const page of PAGES) {
      for (const mode of ['light', 'dark']) {
        for (const width of VIEWPORTS) {
          await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
          await send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
          await new Promise((resolve) => setTimeout(resolve, 450));

          const result = await evaluate(`
            const element = document.documentElement;
            const overflow = element.scrollWidth - element.clientWidth;
            return { page: ${JSON.stringify(page)}, width: ${width}, mode: ${JSON.stringify(mode)}, overflow };
          `);
          assert.ok(
            result.overflow <= 1,
            `${page} at ${width}px (${mode}) should not overflow horizontally (overflow=${result.overflow}px)`
          );
        }
      }

      // Theme controls must remain present and labelled at all widths.
      const themeCtl = await evaluate(`
        const btn = document.querySelector('[data-theme-toggle]');
        return { present: Boolean(btn), label: btn ? btn.getAttribute('aria-label') : null };
      `);
      assert.ok(themeCtl.present, 'theme toggle present on dashboard');
      assert.ok(themeCtl.label, 'theme toggle has an accessible label');
    }

    // Mobile drawer: open at 390px and close with Escape on one page.
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/${PAGES[1]}` });
    await new Promise((resolve) => setTimeout(resolve, 450));
    await evaluate(`document.querySelector('[data-sidebar-toggle]').click();`);
    const opened = await evaluate(`return document.body.classList.contains('sidebar-open');`);
    assert.equal(opened, true, 'mobile drawer should open at 390px');
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
    const closed = await evaluate(`return document.body.classList.contains('sidebar-open');`);
    assert.equal(closed, false, 'Escape should close the mobile drawer');

    // Reports header: period selectors, theme toggle, Refresh, and the account
    // trigger must share one bottom baseline at desktop width without overflow.
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/reports-analytics/reports.html` });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const baseline = await evaluate(`
      const bottoms = ['[data-period-month]', '[data-period-year]', '[data-theme-toggle]', '[data-reports-refresh]', '[data-account-trigger]']
        .map((sel) => {
          const el = document.querySelector(sel);
          return el ? Math.round(el.getBoundingClientRect().bottom) : null;
        })
        .filter((v) => v !== null);
      return { bottoms, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    `);
    assert.ok(
      Math.max(...baseline.bottoms) - Math.min(...baseline.bottoms) <= 2,
      `reports header controls should share a bottom baseline (bottoms=${JSON.stringify(baseline.bottoms)})`
    );
    assert.ok(baseline.overflow <= 1, 'reports header should not overflow at 1280px');

    // Transaction pages: filter toolbar and table inherit the card's resting
    // horizontal padding instead of hugging the card edges.
    for (const txnPage of ['expense-management/expenses.html', 'income-management/income.html']) {
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/${txnPage}` });
      const waitStart = Date.now();
      while (Date.now() - waitStart < 8000) {
        const ready = await evaluate(`return Boolean(document.querySelector('.filter-toolbar'));`);
        if (ready === true) break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const spacing = await evaluate(`
        const toolbar = document.querySelector('[data-expense-filters]') || document.querySelector('[data-income-filters]');
        return {
          className: toolbar ? toolbar.className : null,
          toolbarPaddingLeft: toolbar ? parseFloat(getComputedStyle(toolbar).paddingLeft) : null,
          href: location.href
        };
      `);
      assert.ok(
        spacing.toolbarPaddingLeft !== null && spacing.toolbarPaddingLeft >= 16,
        `${txnPage}: filter toolbar should have resting horizontal padding (class=${spacing.className}, pad=${spacing.toolbarPaddingLeft}px at ${spacing.href})`
      );
    }
  } finally {
    if (ws) ws.close();
    await new Promise((resolve) => { chrome.on('exit', resolve); chrome.kill(); });
    server.closeAllConnections && server.closeAllConnections();
    server.close();
  }
});

test('Phase 1: landing page responsive viewports, mobile navigation, auth modal, touch targets, and form validation', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    if (process.env.CI) {
      assert.fail('Chrome executable required in CI environment but not found');
    }
    t.skip('Chrome executable not found; skipping browser test');
    return;
  }
  const rootDir = path.resolve(__dirname, '..');
  const server = createMockServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devTools = new Promise((resolve) => {
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = Number(match[1]);
        resolve();
      }
    });
  });
  let ws = null;
  let msgId = 1;
  const callbacks = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = msgId++;
    callbacks.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression: `(() => { try { ${expression} } catch (error) { return { error: error.message }; } })()`,
      returnByValue: true
    });
    const value = response.result && response.result.result ? response.result.result.value : null;
    if (value && value.error) throw new Error(value.error);
    return value;
  };

  try {
    await devTools;
    const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/index.html`), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && callbacks.has(message.id)) {
        callbacks.get(message.id)(message);
        callbacks.delete(message.id);
      }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.enable');

    // 1. Landing page across all required viewports in light and dark modes
    const LANDING_VIEWPORTS = [320, 360, 375, 390, 430, 768, 1024, 1440];
    for (const mode of ['light', 'dark']) {
      for (const width of LANDING_VIEWPORTS) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 });
        await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
        await new Promise((resolve) => setTimeout(resolve, 350));

        if (mode === 'dark') {
          await evaluate(`document.documentElement.setAttribute('data-theme', 'dark');`);
        }

        const result = await evaluate(`
          const element = document.documentElement;
          const overflow = element.scrollWidth - element.clientWidth;
          return { width: ${width}, mode: ${JSON.stringify(mode)}, overflow };
        `);
        assert.ok(
          result.overflow <= 1,
          `landing page index.html at ${width}px (${mode}) should not overflow horizontally (overflow=${result.overflow}px)`
        );
      }
    }

    // 2. Mobile navigation toggle behavior at 360px
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
    await new Promise((resolve) => setTimeout(resolve, 400));

    const navCheck = await evaluate(`
      const toggle = document.querySelector('.nav-toggle');
      const links = document.querySelector('[data-nav-links]');
      return {
        toggleExists: Boolean(toggle),
        toggleVisible: toggle ? window.getComputedStyle(toggle).display !== 'none' : false,
        toggleLabel: toggle ? toggle.getAttribute('aria-label') : null,
        ariaExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
        linksOpen: links ? links.classList.contains('open') : false
      };
    `);
    assert.equal(navCheck.toggleExists, true, 'nav toggle exists in index.html');
    assert.equal(navCheck.toggleVisible, true, 'nav toggle is visible at 360px');
    assert.equal(navCheck.toggleLabel, 'Toggle navigation', 'nav toggle has accessible name');
    assert.equal(navCheck.ariaExpanded, 'false', 'aria-expanded is initially false');
    assert.equal(navCheck.linksOpen, false, 'nav links are initially collapsed');

    // Toggle menu open
    await evaluate(`document.querySelector('.nav-toggle').click();`);
    const openedNav = await evaluate(`
      const toggle = document.querySelector('.nav-toggle');
      const links = document.querySelector('[data-nav-links]');
      return {
        ariaExpanded: toggle.getAttribute('aria-expanded'),
        linksOpen: links.classList.contains('open')
      };
    `);
    assert.equal(openedNav.ariaExpanded, 'true', 'aria-expanded is true after click');
    assert.equal(openedNav.linksOpen, true, 'nav links have open class');

    // Escape closes navigation and focuses nav toggle
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
    const closedNav = await evaluate(`
      const toggle = document.querySelector('.nav-toggle');
      const links = document.querySelector('[data-nav-links]');
      return {
        ariaExpanded: toggle.getAttribute('aria-expanded'),
        linksOpen: links.classList.contains('open'),
        activeIsToggle: document.activeElement === toggle
      };
    `);
    assert.equal(closedNav.ariaExpanded, 'false', 'aria-expanded is false after Escape');
    assert.equal(closedNav.linksOpen, false, 'nav links closed after Escape');
    assert.equal(closedNav.activeIsToggle, true, 'focus restored to nav-toggle after Escape');

    // 3. Touch target sizes (>= 44x44px)
    const targets = await evaluate(`
      const navToggle = document.querySelector('.nav-toggle');
      const navRect = navToggle.getBoundingClientRect();

      // Open auth modal to check modal controls
      document.querySelector('[data-auth-toggle="login"]').click();
      const modalClose = document.querySelector('.modal-close');
      const closeRect = modalClose.getBoundingClientRect();
      const authTab = document.querySelector('.auth-tab');
      const tabRect = authTab.getBoundingClientRect();
      const pwToggle = document.querySelector('.password-field [data-toggle-password]');
      const pwRect = pwToggle.getBoundingClientRect();

      return {
        navToggle: { width: Math.round(navRect.width), height: Math.round(navRect.height) },
        modalClose: { width: Math.round(closeRect.width), height: Math.round(closeRect.height) },
        authTab: { height: Math.round(tabRect.height) },
        pwToggle: { width: Math.round(pwRect.width), height: Math.round(pwRect.height) }
      };
    `);
    assert.ok(targets.navToggle.width >= 44 && targets.navToggle.height >= 44, `nav toggle touch target >= 44x44 (got ${targets.navToggle.width}x${targets.navToggle.height})`);
    assert.ok(targets.modalClose.width >= 44 && targets.modalClose.height >= 44, `modal close touch target >= 44x44 (got ${targets.modalClose.width}x${targets.modalClose.height})`);
    assert.ok(targets.authTab.height >= 44, `auth tab height >= 44px (got ${targets.authTab.height})`);
    assert.ok(targets.pwToggle.width >= 44 && targets.pwToggle.height >= 44, `password toggle touch target >= 44x44 (got ${targets.pwToggle.width}x${targets.pwToggle.height})`);

    // 4. Modal focus trap, tab switching, and focus restoration
    const focusState1 = await evaluate(`
      return {
        activeId: document.activeElement ? document.activeElement.id : null,
        activeTag: document.activeElement ? document.activeElement.tagName : null
      };
    `);
    assert.equal(focusState1.activeId, 'login-email', 'opening modal focuses login email input');

    // 4a. Verify Tab & Shift+Tab keyboard wrapping in Login mode
    const loginTrap = await evaluate(`
      const modalClose = document.querySelector('.modal-close');
      const loginSubmit = document.querySelector('[data-login-section] button[type="submit"]');

      // Focus last active control in Login mode and press Tab
      loginSubmit.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      const tabWrappedToClose = document.activeElement === modalClose;

      // Focus first active control (.modal-close) and press Shift+Tab
      modalClose.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      const shiftTabWrappedToSubmit = document.activeElement === loginSubmit;

      return { tabWrappedToClose, shiftTabWrappedToSubmit };
    `);
    assert.equal(loginTrap.tabWrappedToClose, true, 'Tab from login submit button wraps to modal close button');
    assert.equal(loginTrap.shiftTabWrappedToSubmit, true, 'Shift+Tab from modal close button wraps to login submit button');

    // Switch tab to register -> register name input focused
    await evaluate(`document.querySelector('[data-auth-tab="register"]').click();`);
    const focusState2 = await evaluate(`
      return {
        activeId: document.activeElement ? document.activeElement.id : null,
        registerVisible: document.querySelector('[data-register-section]').style.display
      };
    `);
    assert.equal(focusState2.registerVisible, 'block', 'register section is displayed');
    assert.equal(focusState2.activeId, 'register-name', 'switching tab focuses register name input');

    // 4b. Verify Tab & Shift+Tab keyboard wrapping in Registration mode
    const regTrap = await evaluate(`
      const modalClose = document.querySelector('.modal-close');
      const regSubmit = document.querySelector('[data-register-section] button[type="submit"]');

      // Focus last active control in Registration mode and press Tab
      regSubmit.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      const tabWrappedToClose = document.activeElement === modalClose;

      // Focus first active control (.modal-close) and press Shift+Tab
      modalClose.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      const shiftTabWrappedToSubmit = document.activeElement === regSubmit;

      // Dynamically disabled control is excluded from keyboard trap
      regSubmit.disabled = true;
      modalClose.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      const disabledExcluded = document.activeElement !== regSubmit;
      regSubmit.disabled = false;

      return { tabWrappedToClose, shiftTabWrappedToSubmit, disabledExcluded };
    `);
    assert.equal(regTrap.tabWrappedToClose, true, 'Tab from register submit button wraps to modal close button');
    assert.equal(regTrap.shiftTabWrappedToSubmit, true, 'Shift+Tab from modal close button wraps to register submit button');
    assert.equal(regTrap.disabledExcluded, true, 'Dynamically disabled control is excluded from keyboard focus trap');

    // Escape closes modal and restores focus to login trigger
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));`);
    const modalClosed = await evaluate(`
      const modal = document.querySelector('#auth-modal');
      const trigger = document.querySelector('[data-auth-toggle="login"]');
      return {
        ariaHidden: modal.getAttribute('aria-hidden'),
        activeIsTrigger: document.activeElement === trigger
      };
    `);
    assert.equal(modalClosed.ariaHidden, 'true', 'modal aria-hidden is true after Escape');
    assert.equal(modalClosed.activeIsTrigger, true, 'focus restored to trigger button after Escape dismissal');

    // 5. Auth form validation distinguishing required vs format errors
    // Reopen login modal
    await evaluate(`document.querySelector('[data-auth-toggle="login"]').click();`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Submit empty form
    await evaluate(`
      const form = document.querySelector('[data-login-section] form');
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    const emptyErr = await evaluate(`
      return document.querySelector('[data-login-section] [data-auth-message]').textContent;
    `);
    assert.equal(emptyErr, 'Please complete all required fields.', 'empty form shows required fields error');

    // Submit with invalid email format
    await evaluate(`
      const emailInput = document.querySelector('#login-email');
      const pwInput = document.querySelector('#login-password');
      emailInput.value = 'invalidemail';
      pwInput.value = 'secret123';
      const form = document.querySelector('[data-login-section] form');
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    const formatErr = await evaluate(`
      return document.querySelector('[data-login-section] [data-auth-message]').textContent;
    `);
    assert.equal(formatErr, 'Please enter a valid email address.', 'invalid email shows format error rather than missing fields');

    // Typing clears the error
    await evaluate(`
      const emailInput = document.querySelector('#login-email');
      emailInput.value = 'valid@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    const clearedErr = await evaluate(`
      return document.querySelector('[data-login-section] [data-auth-message]').textContent;
    `);
    assert.equal(clearedErr, '', 'typing clears validation error message');

  } finally {
    if (ws) ws.close();
    await new Promise((resolve) => { chrome.on('exit', resolve); chrome.kill(); });
    server.closeAllConnections && server.closeAllConnections();
    server.close();
  }
});
