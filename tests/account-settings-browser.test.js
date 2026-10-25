// Browser regression tests for the shared account menu and Settings profile.
// Run with: node --test tests/account-settings-browser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function createMockServer(rootDir) {
  const state = {
    authenticated: true,
    user: { id: 7, name: 'Asha Rao', email: 'asha@example.com' },
    updates: [],
    logoutCalls: 0,
    failNextUpdate: false
  };

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const jsonHeaders = { 'Content-Type': 'application/json' };

    if (pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204);
      return res.end();
    }

    if (pathname === '/api/user' && req.method === 'GET') {
      if (!state.authenticated) {
        res.writeHead(401, jsonHeaders);
        return res.end(JSON.stringify({ message: 'Unauthenticated.' }));
      }
      res.writeHead(200, jsonHeaders);
      return res.end(JSON.stringify({ user: state.user }));
    }

    if (pathname === '/api/user' && req.method === 'PUT') {
      if (!state.authenticated) {
        res.writeHead(401, jsonHeaders);
        return res.end(JSON.stringify({ message: 'Unauthenticated.' }));
      }
      const payload = await readJsonBody(req);
      if (state.failNextUpdate) {
        state.failNextUpdate = false;
        res.writeHead(422, jsonHeaders);
        return res.end(JSON.stringify({
          message: 'The given data was invalid.',
          errors: { name: ['The server rejected this display name.'] }
        }));
      }
      state.user = { ...state.user, name: String(payload.name || '').trim() };
      state.updates.push(state.user.name);
      res.writeHead(200, jsonHeaders);
      return res.end(JSON.stringify({ user: state.user, message: 'Profile updated.' }));
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      state.authenticated = false;
      state.logoutCalls += 1;
      res.writeHead(200, jsonHeaders);
      return res.end(JSON.stringify({ status: 'logged_out' }));
    }

    if (pathname.startsWith('/api/')) {
      res.writeHead(404, jsonHeaders);
      return res.end(JSON.stringify({ message: 'Not found' }));
    }

    let staticPath = pathname;
    if (staticPath.endsWith('/')) staticPath += 'index.html';
    const relPath = staticPath.replace(/^[/\\]+/, '');
    const filePath = path.normalize(path.join(rootDir, relPath));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    if (ext === '.html') {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const html = fs.readFileSync(filePath, 'utf8').replace('http://127.0.0.1:8002', origin);
      res.end(html);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return { server, state };
}

test('browser runtime: account menu is accessible, identity-aware, and Settings saves only supported fields', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome binary not found');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const { server, state } = createMockServer(rootDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-account-test-'));

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,900',
    '--user-data-dir=' + tmpDir
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let cdpPort = null;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome DevTools did not start')), 15000);
      chrome.stderr.on('data', (data) => {
        const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (match) {
          clearTimeout(timer);
          cdpPort = parseInt(match[1], 10);
          resolve();
        }
      });
    });

    const tabUrl = `${origin}/dashboard/dashboard.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(tabUrl), { method: 'PUT' });
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map();
    const jsExceptions = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') jsExceptions.push(msg.params);
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
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (result.result?.exceptionDetails) {
        throw new Error(result.result.exceptionDetails.text || 'Browser evaluation failed');
      }
      return result.result?.result?.value;
    };

    const waitFor = async (expression, timeout = 6000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const value = await evaluate(expression);
        if (value) return value;
        await delay(100);
      }
      throw new Error(`Timed out waiting for: ${expression}`);
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: tabUrl });

    await waitFor(`document.querySelector('[data-account-trigger]')?.getAttribute('aria-label') === 'Account menu for Asha Rao'`);

    const initial = await evaluate(`(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      const panel = document.querySelector('[data-account-panel]');
      return {
        exists: Boolean(trigger && panel),
        expanded: trigger?.getAttribute('aria-expanded'),
        panelHidden: panel?.hidden,
        panelRole: panel?.getAttribute('role'),
        triggerControls: trigger?.getAttribute('aria-controls'),
        name: document.querySelector('.account-identity [data-user-name]')?.textContent,
        email: document.querySelector('.account-identity [data-user-email]')?.textContent,
        avatar: trigger?.querySelector('.account-avatar')?.textContent,
        settingsHref: panel?.querySelector('a[href$="settings/settings.html"]')?.getAttribute('href'),
        menuItems: Array.from(panel?.querySelectorAll('[role="menuitem"]') || []).map((item) => item.textContent.trim()),
      };
    })()`);

    assert.equal(initial.exists, true);
    assert.equal(initial.expanded, 'false');
    assert.equal(initial.panelHidden, true);
    assert.equal(initial.panelRole, 'menu');
    assert.equal(initial.triggerControls, 'account-menu-panel');
    assert.equal(initial.name, 'Asha Rao');
    assert.equal(initial.email, 'asha@example.com');
    assert.equal(initial.avatar, 'AR');
    assert.equal(initial.settingsHref, '../settings/settings.html');
    assert.deepEqual(initial.menuItems, ['Settings', 'Notifications', 'Support', 'Log out']);

    // Open with the trigger and verify focus moves into the menu.
    await evaluate(`(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      trigger.focus();
      trigger.click();
    })()`);
    const opened = await evaluate(`(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      const panel = document.querySelector('[data-account-panel]');
      return {
        expanded: trigger.getAttribute('aria-expanded'),
        hidden: panel.hidden,
        activeRole: document.activeElement?.getAttribute('role'),
        activeText: document.activeElement?.textContent.trim(),
      };
    })()`);
    assert.equal(opened.expanded, 'true');
    assert.equal(opened.hidden, false);
    assert.equal(opened.activeRole, 'menuitem');
    assert.equal(opened.activeText, 'Settings');

    // Escape closes and returns focus to the trigger.
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    const afterEscape = await evaluate(`(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      return {
        expanded: trigger.getAttribute('aria-expanded'),
        hidden: document.querySelector('[data-account-panel]').hidden,
        activeIsTrigger: document.activeElement === trigger,
      };
    })()`);
    assert.equal(afterEscape.expanded, 'false');
    assert.equal(afterEscape.hidden, true);
    assert.equal(afterEscape.activeIsTrigger, true);

    // Outside pointerdown dismissal.
    await evaluate(`document.querySelector('[data-account-trigger]').click()`);
    await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    assert.equal(await evaluate(`document.querySelector('[data-account-panel]').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('[data-account-trigger]').getAttribute('aria-expanded')`), 'false');

    // Keyboard activation and roving focus.
    await evaluate(`(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    })()`);
    assert.equal(await evaluate(`document.activeElement?.textContent.trim()`), 'Settings');
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))`);
    assert.equal(await evaluate(`document.activeElement?.textContent.trim()`), 'Notifications');
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))`);
    assert.equal(await evaluate(`document.activeElement?.textContent.trim()`), 'Log out');
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))`);
    assert.equal(await evaluate(`document.activeElement?.textContent.trim()`), 'Settings');
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);

    // The Settings destination in the menu resolves and navigates.
    await evaluate(`(() => {
      document.querySelector('[data-account-trigger]').click();
      document.querySelector('[data-account-panel] a[href$="settings/settings.html"]').click();
    })()`);
    await waitFor(`location.pathname.endsWith('/settings/settings.html')`);

    // Narrow viewport: the account control and open panel stay in bounds.
    await send('Page.navigate', { url: tabUrl });
    await waitFor(`Boolean(document.querySelector('[data-account-trigger]'))`);
    await send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true
    });
    await delay(250);
    await evaluate(`document.querySelector('[data-account-trigger]').click()`);
    const mobile = await evaluate(`(() => {
      const trigger = document.querySelector('[data-account-trigger]');
      const panel = document.querySelector('[data-account-panel]');
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const topbarRect = document.querySelector('.topbar').getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        triggerRight: triggerRect.right,
        triggerVisible: triggerRect.width > 0 && triggerRect.left >= 0,
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
        panelTop: panelRect.top,
        panelBottom: panelRect.bottom,
        topbarRight: topbarRect.right,
      };
    })()`);
    assert.equal(mobile.triggerVisible, true);
    assert.ok(mobile.scrollWidth <= mobile.viewport + 1, 'account control must not create horizontal overflow');
    assert.ok(mobile.triggerRight <= mobile.viewport, 'account trigger must stay inside the viewport');
    assert.ok(mobile.panelLeft >= 0, 'account panel must not clip on the left');
    assert.ok(mobile.panelRight <= mobile.viewport, 'account panel must not overflow the right edge');
    assert.ok(mobile.panelTop >= 0 && mobile.panelBottom <= 800, 'account panel must stay in the viewport');
    assert.ok(mobile.topbarRight <= mobile.viewport, 'topbar must not overflow');
    await evaluate(`document.querySelector('[data-account-trigger]').click()`);
    await send('Emulation.clearDeviceMetricsOverride');

    // Settings uses the same authenticated identity and saves the name only.
    await send('Page.navigate', { url: `${origin}/settings/settings.html` });
    await waitFor(`document.querySelector('#name')?.value === 'Asha Rao'`);

    const profileInitial = await evaluate(`(() => ({
      name: document.querySelector('#name').value,
      email: document.querySelector('#email').value,
      emailReadonly: document.querySelector('#email').readOnly,
      securityFormPresent: Boolean(document.querySelector('[data-security-form]')),
      securityUnavailable: document.querySelector('.settings-unavailable')?.textContent,
      saveDisabled: document.querySelector('[data-settings-submit]')?.disabled,
    }))()`);
    assert.equal(profileInitial.name, 'Asha Rao');
    assert.equal(profileInitial.email, 'asha@example.com');
    assert.equal(profileInitial.emailReadonly, true);
    assert.equal(profileInitial.securityFormPresent, false);
    assert.match(profileInitial.securityUnavailable, /aren't available yet/);
    assert.equal(profileInitial.saveDisabled, false);

    await evaluate(`(() => {
      document.querySelector('#name').value = 'Asha R. Rao';
      document.querySelector('[data-settings-form]').requestSubmit();
    })()`);
    await waitFor(`document.querySelector('[data-settings-message]')?.classList.contains('success')`);
    const saved = await evaluate(`(() => ({
      message: document.querySelector('[data-settings-message]').textContent,
      name: document.querySelector('#name').value,
      email: document.querySelector('#email').value,
      button: document.querySelector('[data-settings-submit]').textContent,
      buttonDisabled: document.querySelector('[data-settings-submit]').disabled,
      triggerLabel: document.querySelector('[data-account-trigger]').getAttribute('aria-label'),
      menuName: document.querySelector('.account-identity [data-user-name]').textContent,
      menuEmail: document.querySelector('.account-identity [data-user-email]').textContent,
    }))()`);
    assert.match(saved.message, /Profile saved/);
    assert.equal(saved.name, 'Asha R. Rao');
    assert.equal(saved.email, 'asha@example.com');
    assert.equal(saved.button, 'Save profile');
    assert.equal(saved.buttonDisabled, false);
    assert.equal(saved.triggerLabel, 'Account menu for Asha R. Rao');
    assert.equal(saved.menuName, 'Asha R. Rao');
    assert.equal(saved.menuEmail, 'asha@example.com');
    assert.deepEqual(state.updates, ['Asha R. Rao']);

    // Server validation errors are shown without changing the identity.
    state.failNextUpdate = true;
    await evaluate(`(() => {
      document.querySelector('#name').value = 'Rejected Name';
      document.querySelector('[data-settings-form]').requestSubmit();
    })()`);
    await waitFor(`document.querySelector('[data-settings-message]')?.classList.contains('error')`);
    const failed = await evaluate(`(() => ({
      message: document.querySelector('[data-settings-message]').textContent,
      triggerLabel: document.querySelector('[data-account-trigger]').getAttribute('aria-label'),
      menuName: document.querySelector('.account-identity [data-user-name]').textContent,
      buttonDisabled: document.querySelector('[data-settings-submit]').disabled,
    }))()`);
    assert.match(failed.message, /rejected this display name/i);
    assert.equal(failed.triggerLabel, 'Account menu for Asha R. Rao');
    assert.equal(failed.menuName, 'Asha R. Rao');
    assert.equal(failed.buttonDisabled, false);
    assert.equal(state.user.name, 'Asha R. Rao');

    // The shared logout flow is used from the menu and returns to the landing page.
    await evaluate(`document.querySelector('[data-account-trigger]').click()`);
    await evaluate(`document.querySelector('[data-account-logout]').click()`);
    await waitFor(`location.pathname.endsWith('/index.html')`);
    assert.equal(state.logoutCalls, 1);
    assert.equal(state.authenticated, false);

    // With no session, the shell keeps neutral fallbacks instead of inventing identity.
    await send('Page.navigate', { url: `${origin}/dashboard/dashboard.html` });
    await waitFor(`Boolean(document.querySelector('[data-account-trigger]'))`);
    await delay(300);
    const fallback = await evaluate(`(() => ({
      label: document.querySelector('[data-account-trigger]').getAttribute('aria-label'),
      name: document.querySelector('.account-identity [data-user-name]').textContent,
      email: document.querySelector('.account-identity [data-user-email]').textContent,
      avatar: document.querySelector('[data-account-trigger] .account-avatar').textContent,
    }))()`);
    assert.equal(fallback.label, 'Account menu');
    assert.equal(fallback.name, 'Account');
    assert.equal(fallback.email, 'Email unavailable');
    assert.equal(fallback.avatar, 'S');

    assert.deepEqual(jsExceptions, [], 'Expected zero uncaught JS exceptions');

    ws.close();
  } finally {
    chrome.kill();
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});
