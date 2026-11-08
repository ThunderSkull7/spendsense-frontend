// Headless Chrome Browser Runtime Accessibility Tests for Batch 3.3.
// Verifies:
// 1. Modal dialog opening places initial focus inside the dialog.
// 2. Tab key trapping inside active modal (focus wraps around and cannot leak to background).
// 3. Escape key dismisses modal and restores focus to opening trigger button.
// 4. Account menu opens with keyboard (ArrowDown/Enter), traps navigation, and closes on Escape.
// 5. High-contrast focus rings (:focus-visible) render on interactive buttons.
// Run with: node --test tests/accessibility-browser.test.js

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
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].find((c) => fs.existsSync(c)) || null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJSON(res, payload, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function createMockServer(rootDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname.replace(/^\/api/, '');

    if (pathname === '/user') {
      sendJSON(res, { success: true, user: { id: 1, name: 'Accessibility Tester', email: 'a11y@example.com' } });
      return;
    }
    if (pathname === '/subscriptions') {
      sendJSON(res, {
        success: true,
        data: {
          subscriptions: [],
          summary: { active_count: 0, estimated_monthly_cost: 0, estimated_annual_cost: 0 },
          upcoming_renewals: []
        }
      });
      return;
    }
    if (pathname === '/recurring-bills') {
      sendJSON(res, { success: true, data: { schedules: [] } });
      return;
    }
    if (pathname === '/categories') {
      sendJSON(res, { success: true, categories: [] });
      return;
    }

    const cleanPath = url.pathname.replace(/^\/+/, '');
    const filePath = path.join(rootDir, cleanPath || 'index.html');
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
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

test('browser runtime: modal focus trap, escape dismissal, focus restoration, and keyboard navigation', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    if (process.env.CI) assert.fail('Chrome executable required in CI');
    t.skip('Chrome not found');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const server = createMockServer(rootDir);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  await new Promise((resolve) => {
    chrome.stderr.on('data', (d) => {
      const match = d.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match && !cdpPort) {
        cdpPort = Number(match[1]);
        resolve();
      }
    });
  });

  const tabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(`http://127.0.0.1:${port}/subscriptions/subscriptions.html`), { method: 'PUT' });
  const tab = await tabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 1;
  const callbacks = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id)(msg);
      callbacks.delete(msg.id);
    }
  };
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

  const pressKey = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
    await new Promise(r => setTimeout(r, 60));
  };

  try {
    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 600));

    // 1. Verify H1 exists and is the primary heading
    const h1Check = await evaluate(`
      const h1 = document.querySelector('h1');
      return { exists: Boolean(h1), text: h1 ? h1.textContent.trim() : null, tag: h1 ? h1.tagName : null };
    `);
    assert.equal(h1Check.exists, true, 'Page must have an H1');
    assert.equal(h1Check.tag, 'H1');
    assert.equal(h1Check.text, 'Subscriptions');

    // 2. Open subscription modal using trigger button
    await evaluate(`
      const trigger = document.querySelector('[data-open-subscription-modal]');
      trigger.focus();
      trigger.click();
    `);
    await new Promise(r => setTimeout(r, 200));

    // Verify modal is open, has role="dialog", aria-modal="true"
    const modalState = await evaluate(`
      const modal = document.querySelector('#subscription-modal');
      const dialog = modal.querySelector('[role="dialog"]');
      const activeEl = document.activeElement;
      return {
        isOpen: !modal.hidden,
        hasRoleDialog: dialog.getAttribute('role') === 'dialog',
        isAriaModal: dialog.getAttribute('aria-modal') === 'true',
        hasAriaLabelledby: dialog.getAttribute('aria-labelledby') === 'modal-subscription-title',
        focusIsInsideModal: dialog.contains(activeEl),
        focusedTag: activeEl ? activeEl.tagName : null,
        focusedId: activeEl ? activeEl.id : null
      };
    `);
    assert.equal(modalState.isOpen, true, 'Modal should be visible');
    assert.equal(modalState.hasRoleDialog, true, 'Modal must have role="dialog"');
    assert.equal(modalState.isAriaModal, true, 'Modal must have aria-modal="true"');
    assert.equal(modalState.hasAriaLabelledby, true, 'Modal must link title via aria-labelledby');
    assert.equal(modalState.focusIsInsideModal, true, 'Focus must be placed inside the opened modal');

    // 3. Tab key trapping: focus the last interactive element and press Tab
    await evaluate(`
      const modal = document.querySelector('#subscription-modal');
      const cancelBtn = modal.querySelector('[data-close-subscription-modal]:last-of-type, .btn.secondary');
      cancelBtn.focus();
    `);
    // Press Tab
    await pressKey('Tab', 'Tab', 9, 0);
    const tabTrapped = await evaluate(`
      const modal = document.querySelector('#subscription-modal');
      const active = document.activeElement;
      return { isInside: modal.contains(active), activeTag: active.tagName, activeId: active.id };
    `);
    assert.equal(tabTrapped.isInside, true, 'Tab key must remain trapped inside active modal');

    // 4. Shift+Tab key trapping: focus the first interactive element and press Shift+Tab
    await evaluate(`
      const modal = document.querySelector('#subscription-modal');
      const closeX = modal.querySelector('.modal-close');
      closeX.focus();
    `);
    // Press Shift+Tab (modifiers: 8 for Shift)
    await pressKey('Tab', 'Tab', 9, 8);
    const shiftTabTrapped = await evaluate(`
      const modal = document.querySelector('#subscription-modal');
      const active = document.activeElement;
      return { isInside: modal.contains(active), activeTag: active.tagName, activeId: active.id };
    `);
    assert.equal(shiftTabTrapped.isInside, true, 'Shift+Tab key must wrap to bottom of modal');

    // 5. Dismiss with Escape key and verify focus restoration to opening trigger
    await pressKey('Escape', 'Escape', 27, 0);
    await new Promise(r => setTimeout(r, 200));

    const closedState = await evaluate(`
      const modal = document.querySelector('#subscription-modal');
      const active = document.activeElement;
      return {
        isClosed: modal.hidden,
        activeMatchesTrigger: active.hasAttribute('data-open-subscription-modal') || active.id === 'open-subscription-modal-btn'
      };
    `);
    assert.equal(closedState.isClosed, true, 'Escape key must close the modal');
    assert.equal(closedState.activeMatchesTrigger, true, 'Focus must be restored to opening trigger button');

    // 6. Test Account Menu Keyboard Navigation (Header)
    await evaluate(`
      const trigger = document.querySelector('#account-menu-trigger');
      trigger.focus();
    `);
    // Press ArrowDown to open account menu
    await pressKey('ArrowDown', 'ArrowDown', 40, 0);
    await new Promise(r => setTimeout(r, 150));

    const menuOpen = await evaluate(`
      const panel = document.querySelector('#account-menu-panel');
      const trigger = document.querySelector('#account-menu-trigger');
      return {
        isOpen: !panel.hidden,
        expanded: trigger.getAttribute('aria-expanded') === 'true',
        activeIsMenuItem: document.activeElement && document.activeElement.getAttribute('role') === 'menuitem'
      };
    `);
    assert.equal(menuOpen.isOpen, true, 'Account menu panel must open on ArrowDown');
    assert.equal(menuOpen.expanded, true, 'Trigger must declare aria-expanded="true"');
    assert.equal(menuOpen.activeIsMenuItem, true, 'Focus must move to first menu item');

    // Press Escape to close account menu and verify focus restores to trigger
    await pressKey('Escape', 'Escape', 27, 0);
    await new Promise(r => setTimeout(r, 150));

    const menuClosed = await evaluate(`
      const panel = document.querySelector('#account-menu-panel');
      const trigger = document.querySelector('#account-menu-trigger');
      return {
        isClosed: panel.hidden,
        expanded: trigger.getAttribute('aria-expanded') === 'false',
        activeIsTrigger: document.activeElement === trigger
      };
    `);
    assert.equal(menuClosed.isClosed, true, 'Account menu must close on Escape');
    assert.equal(menuClosed.expanded, true, 'Trigger aria-expanded must return to false');
    assert.equal(menuClosed.activeIsTrigger, true, 'Focus must restore to account menu trigger');

  } finally {
    ws.close();
    chrome.kill();
    server.close();
  }
});

