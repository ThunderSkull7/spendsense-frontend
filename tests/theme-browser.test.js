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

test('browser runtime: selecting red immediately applies red accents and persists across dark mode & dashboard navigation', async (t) => {
  const chromePath = findChrome();
  if (!chromePath) {
    t.skip('Chrome executable not found on this system, skipping browser test');
    return;
  }

  const rootDir = path.resolve(__dirname, '..');
  const server = createStaticServer(rootDir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-theme-test-'));

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
    const settingsUrl = `http://127.0.0.1:${port}/settings/settings.html`;
    const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?` + encodeURIComponent(settingsUrl), { method: 'PUT' });
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
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 600));

    const evalJs = async (expr) => {
      const res = await send('Runtime.evaluate', {
        expression: `(() => { try { ${expr} } catch(e) { return 'ERROR: ' + e.message; } })()`,
        returnByValue: true
      });
      return res.result && res.result.result ? res.result.result.value : null;
    };

    // Wait until stylesheet is loaded and applied
    for (let i = 0; i < 30; i++) {
      const p = await evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()`);
      if (p) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // 1. Initial State verification
    const initial = await evalJs(`
      const html = document.documentElement;
      const htmlStyle = getComputedStyle(html);
      const btn = document.querySelector('.btn.primary');
      const btnStyle = btn ? getComputedStyle(btn) : null;
      const activeNav = document.querySelector('.sidebar-link.active');
      const activeNavStyle = activeNav ? getComputedStyle(activeNav) : null;
      const select = document.querySelector('select#themeColor');
      return {
        selectValue: select ? select.value : null,
        themeColor: html.dataset.themeColor,
        mode: html.dataset.mode,
        primaryVar: htmlStyle.getPropertyValue('--primary').trim(),
        btnBg: btnStyle ? btnStyle.backgroundColor : null,
        activeNavColor: activeNavStyle ? activeNavStyle.color : null
      };
    `);

    assert.equal(initial.selectValue, 'green');
    assert.equal(initial.themeColor, 'green');
    assert.equal(initial.primaryVar, '#10B981');
    assert.equal(initial.btnBg, 'rgb(16, 185, 129)');
    assert.equal(initial.activeNavColor, 'rgb(16, 185, 129)');

    // 2. Select 'red' in Settings and trigger change
    await evalJs(`
      const select = document.querySelector('select#themeColor');
      select.value = 'red';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    // Wait for the 0.16s CSS transition to finish
    await new Promise(r => setTimeout(r, 250));

    const afterRed = await evalJs(`
      const select = document.querySelector('select#themeColor');
      const html = document.documentElement;
      const htmlStyle = getComputedStyle(html);
      const btn = document.querySelector('.btn.primary');
      const btnStyle = btn ? getComputedStyle(btn) : null;
      const activeNav = document.querySelector('.sidebar-link.active');
      const activeNavStyle = activeNav ? getComputedStyle(activeNav) : null;

      return {
        selectValue: select.value,
        themeColor: html.dataset.themeColor,
        mode: html.dataset.mode,
        storedColor: localStorage.getItem('spendsenseThemeColor'),
        primaryVar: htmlStyle.getPropertyValue('--primary').trim(),
        btnBg: btnStyle ? btnStyle.backgroundColor : null,
        activeNavColor: activeNavStyle ? activeNavStyle.color : null
      };
    `);

    assert.equal(afterRed.selectValue, 'red');
    assert.equal(afterRed.themeColor, 'red');
    assert.equal(afterRed.storedColor, 'red');
    assert.equal(afterRed.primaryVar, '#FB7185');
    assert.equal(afterRed.btnBg, 'rgb(251, 113, 133)', 'primary button must change from green to red');
    assert.equal(afterRed.activeNavColor, 'rgb(251, 113, 133)', 'active sidebar link must change from green to red');

    // 3. Switch to Dark Mode while Red is selected
    await evalJs(`
      const modeSelect = document.querySelector('select#themeMode');
      modeSelect.value = 'dark';
      modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    // Wait for the CSS transition
    await new Promise(r => setTimeout(r, 250));

    const afterDark = await evalJs(`
      const html = document.documentElement;
      const htmlStyle = getComputedStyle(html);
      const btn = document.querySelector('.btn.primary');
      const btnStyle = btn ? getComputedStyle(btn) : null;
      const activeNav = document.querySelector('.sidebar-link.active');
      const activeNavStyle = activeNav ? getComputedStyle(activeNav) : null;

      return {
        themeColor: html.dataset.themeColor,
        mode: html.dataset.mode,
        storedColor: localStorage.getItem('spendsenseThemeColor'),
        storedMode: localStorage.getItem('spendsenseThemeMode'),
        primaryVar: htmlStyle.getPropertyValue('--primary').trim(),
        bgVar: htmlStyle.getPropertyValue('--bg').trim(),
        surfaceVar: htmlStyle.getPropertyValue('--surface').trim(),
        btnBg: btnStyle ? btnStyle.backgroundColor : null,
        activeNavColor: activeNavStyle ? activeNavStyle.color : null
      };
    `);

    assert.equal(afterDark.themeColor, 'red', 'red palette must be preserved in dark mode');
    assert.equal(afterDark.mode, 'dark');
    assert.equal(afterDark.storedColor, 'red');
    assert.equal(afterDark.storedMode, 'dark');
    assert.equal(afterDark.primaryVar, '#FB7185');
    assert.equal(afterDark.bgVar, '#090B0F', 'dark page background must be #090B0F');
    assert.equal(afterDark.surfaceVar, '#14171D', 'dark card surface must be #14171D');
    assert.equal(afterDark.btnBg, 'rgb(251, 113, 133)');
    assert.equal(afterDark.activeNavColor, 'rgb(251, 113, 133)');

    // 4. Navigate to Dashboard and verify persistence of red palette & dark mode
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/dashboard/dashboard.html` });
    await new Promise(r => setTimeout(r, 1000));

    const dashboardState = await evalJs(`
      const html = document.documentElement;
      const htmlStyle = getComputedStyle(html);
      const btn = document.querySelector('.btn.primary');
      const btnStyle = btn ? getComputedStyle(btn) : null;
      const activeNav = document.querySelector('.sidebar-link.active');
      const activeNavStyle = activeNav ? getComputedStyle(activeNav) : null;

      return {
        themeColor: html.dataset.themeColor,
        mode: html.dataset.mode,
        storedColor: localStorage.getItem('spendsenseThemeColor'),
        storedMode: localStorage.getItem('spendsenseThemeMode'),
        primaryVar: htmlStyle.getPropertyValue('--primary').trim(),
        bgVar: htmlStyle.getPropertyValue('--bg').trim(),
        surfaceVar: htmlStyle.getPropertyValue('--surface').trim(),
        btnBg: btnStyle ? btnStyle.backgroundColor : null,
        activeNavColor: activeNavStyle ? activeNavStyle.color : null
      };
    `);

    assert.equal(dashboardState.themeColor, 'red');
    assert.equal(dashboardState.mode, 'dark');
    assert.equal(dashboardState.storedColor, 'red');
    assert.equal(dashboardState.storedMode, 'dark');
    assert.equal(dashboardState.primaryVar, '#FB7185');
    assert.equal(dashboardState.bgVar, '#090B0F');
    assert.equal(dashboardState.surfaceVar, '#14171D');
    assert.equal(dashboardState.btnBg, 'rgb(251, 113, 133)');
    assert.equal(dashboardState.activeNavColor, 'rgb(251, 113, 133)');

    ws.close();
  } finally {
    chrome.kill();
    server.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  }
});
