// Browser runtime regression test for account dropdown and responsive viewports (360, 768, 1024, 1440 px).
// Run with: node --test tests/account-dropdown-browser.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return process.env.CHROME_BIN;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
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

function createStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(parsedUrl.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relPath = pathname.replace(/^[/\\]+/, '');
    const filePath = path.normalize(path.join(rootDir, relPath));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    if (ext === '.css') {
      const css = fs.readFileSync(filePath, 'utf8').replace(/@import\s+url\([^)]+\);?/g, '');
      res.end(css);
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  });
  return server;
}

test('browser runtime: account dropdown interactions and responsive viewports (360, 768, 1024, 1440 px)', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found on this system, skipping browser test');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const server = createStaticServer(rootDir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-account-test-'));

  const chrome = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=0',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + tmpDir
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let cdpPort = null;
  const devToolsUrlPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 10000);
    chrome.stderr.on('data', (data) => {
      const match = data.toString().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = parseInt(match[1], 10);
        clearTimeout(timeout);
        resolve(cdpPort);
      }
    });
  });

  try {
    await devToolsUrlPromise;
    const dashboardUrl = `http://127.0.0.1:${port}/dashboard/dashboard.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(dashboardUrl), { method: 'PUT' });
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        callbacks.get(msg.id)(msg);
        callbacks.delete(msg.id);
      }
    };

    const send = (method, params = {}) => {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, (res) => resolve(res.result));
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    const evalScript = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result ? res.result.value : undefined;
    };

    await send('Page.enable');
    await send('DOM.enable');

    // Test responsive viewports: 1440, 1024, 768, 360
    const viewports = [
      { width: 1440, height: 900, name: 'desktop-wide' },
      { width: 1024, height: 768, name: 'desktop-standard' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 360, height: 740, name: 'mobile' }
    ];

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 768
      });

      // Check for horizontal overflow
      const overflow = await evalScript(`
        (() => {
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          };
        })()
      `);

      assert.equal(overflow.hasOverflow, false, `Horizontal overflow detected at ${vp.width}px (${vp.name})`);
    }

    // Now test account dropdown interactions on mobile (360px)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 1,
      mobile: true
    });

    // 1. Initial state: dropdown is hidden
    const initialHidden = await evalScript(`
      (() => {
        const dd = document.querySelector('.account-dropdown');
        const trigger = document.querySelector('.account-trigger');
        return {
          hasHidden: dd ? dd.hasAttribute('hidden') : false,
          ariaExpanded: trigger ? trigger.getAttribute('aria-expanded') : null
        };
      })()
    `);
    assert.equal(initialHidden.hasHidden, true, 'account dropdown must be initially hidden');
    assert.equal(initialHidden.ariaExpanded, 'false');

    // 2. Click trigger: dropdown opens and stays within viewport
    const openState = await evalScript(`
      (() => {
        const trigger = document.querySelector('.account-trigger');
        trigger.click();
        const dd = document.querySelector('.account-dropdown');
        const rect = dd.getBoundingClientRect();
        return {
          hasHidden: dd.hasAttribute('hidden'),
          ariaExpanded: trigger.getAttribute('aria-expanded'),
          rectRight: rect.right,
          rectLeft: rect.left,
          windowWidth: window.innerWidth,
          isClipped: rect.right > window.innerWidth || rect.left < 0
        };
      })()
    `);
    assert.equal(openState.hasHidden, false, 'dropdown must be visible after click');
    assert.equal(openState.ariaExpanded, 'true');
    assert.equal(openState.isClipped, false, 'dropdown must not clip outside the 360px viewport');

    // 3. Escape key closes dropdown
    const escapeState = await evalScript(`
      (() => {
        const menu = document.querySelector('[data-account-menu]');
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const dd = document.querySelector('.account-dropdown');
        const trigger = document.querySelector('.account-trigger');
        return {
          hasHidden: dd.hasAttribute('hidden'),
          ariaExpanded: trigger.getAttribute('aria-expanded')
        };
      })()
    `);
    assert.equal(escapeState.hasHidden, true, 'Escape key must close the dropdown');
    assert.equal(escapeState.ariaExpanded, 'false');

    // Clean up
    ws.close();
  } finally {
    chrome.kill();
    server.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
});
