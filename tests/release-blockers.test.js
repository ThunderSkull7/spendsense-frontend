// Regression tests for the frontend release blockers:
// - Pages worker routing for /api/*, /user, OPTIONS, and static assets
// - notification endpoint construction through the shared API client
// - CSV import preview/submit through the shared API client
// - exact Pages-origin deployment validation
// Run with: node --test tests/release-blockers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { File } = require('node:buffer');

const FRONTEND_ROOT = path.join(__dirname, '..');
const SCRIPT_JS = path.join(FRONTEND_ROOT, 'script.js');
const NOTIFICATIONS_JS = path.join(FRONTEND_ROOT, 'notifications', 'notifications.js');
const IMPORT_JS = path.join(FRONTEND_ROOT, 'expense-management', 'import.js');
const PREPARE_JS = path.join(FRONTEND_ROOT, 'deploy', 'prepare-frontend-deploy.js');
const prepare = require(PREPARE_JS);

const jsonResponse = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function waitFor(predicate, label) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function fakeElement(overrides = {}) {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    hidden: false,
    disabled: false,
    textContent: '',
    className: '',
    dataset: {},
    children: [],
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      },
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains(name) {
        return classes.has(name);
      },
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    appendChild(node) {
      this.children.push(node);
      return node;
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    ...overrides,
  };
  Object.defineProperty(element, 'listeners', { value: listeners, enumerable: false });
  return element;
}

function createDocumentStub({ elements = {}, selectors = {}, cookie = '' } = {}) {
  const listeners = new Map();
  const documentStub = {
    readyState: 'complete',
    cookie,
    body: fakeElement(),
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    querySelector(selector) {
      return Object.prototype.hasOwnProperty.call(selectors, selector) ? selectors[selector] : null;
    },
    querySelectorAll(selector) {
      return Object.prototype.hasOwnProperty.call(selectors, selector) ? selectors[selector] : [];
    },
    getElementById(id) {
      return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
    },
    createElement(tag) {
      return fakeElement({ tagName: String(tag).toUpperCase() });
    },
  };
  Object.defineProperty(documentStub, 'listeners', { value: listeners, enumerable: false });
  return documentStub;
}

function loadSharedClient(documentStub, fetchImpl) {
  const context = {
    document: documentStub,
    fetch: fetchImpl,
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    FormData,
    File,
    Blob,
    Response,
    Headers,
    Request,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  };
  context.window = context;
  context.window.dispatchEvent = () => {};
  context.window.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SCRIPT_JS, 'utf8'), context, { filename: 'script.js' });
  return context;
}

function lastDomContentLoaded(documentStub) {
  const callbacks = documentStub.listeners.get('DOMContentLoaded') || [];
  assert.ok(callbacks.length > 0, 'expected a DOMContentLoaded listener');
  return callbacks[callbacks.length - 1];
}

test('every frontend JavaScript source file parses', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.wrangler', 'dist'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(FRONTEND_ROOT);

  assert.ok(files.length > 20, `expected to find frontend scripts, found ${files.length}`);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: path.relative(FRONTEND_ROOT, file) }),
      `syntax error in ${path.relative(FRONTEND_ROOT, file)}`
    );
  }
});

test('deployment API base validation accepts only the exact Pages origin', () => {
  assert.equal(prepare.PRODUCTION_ORIGIN, 'https://spendsensehq.pages.dev');
  assert.equal(prepare.validateApiBaseUrl(prepare.PRODUCTION_ORIGIN), prepare.PRODUCTION_ORIGIN);

  for (const invalid of [
    '',
    'https://spendsense-api-t0up.onrender.com',
    'http://spendsensehq.pages.dev',
    'https://spendsensehq.pages.dev/',
    'https://spendsensehq.pages.dev/dashboard',
    'https://spendsensehq.pages.dev?x=1',
    'https://spendsensehq.pages.dev#fragment',
    'https://user:pass@spendsensehq.pages.dev',
    'https://spendsensehq.pages.dev:443',
    'https://SPENDSENSEHQ.PAGES.DEV',
    'https://spendsensehq.pages.dev.evil.example',
    'http://localhost:5500',
    'https://127.0.0.1',
  ]) {
    assert.throws(
      () => prepare.validateApiBaseUrl(invalid),
      /exactly https:\/\/spendsensehq\.pages\.dev/,
      `should reject ${JSON.stringify(invalid)}`
    );
  }
});

test('generated worker proxies only /api/* and /user and preserves the upstream contract', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spendsense-worker-'));
  const workerFile = path.join(tempDir, '_worker.js');
  fs.writeFileSync(workerFile, prepare.buildWorkerCode(), 'utf8');

  const originalFetch = global.fetch;
  const upstreamCalls = [];
  const assetCalls = [];
  let postBody = null;

  global.fetch = async (request) => {
    upstreamCalls.push(request);
    if (request.method === 'POST') {
      postBody = await request.clone().text();
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session=abc; Path=/; HttpOnly',
      },
    });
  };

  const env = {
    ASSETS: {
      async fetch(request) {
        assetCalls.push(request);
        return new Response('asset', { status: 200, headers: { 'Content-Type': 'text/html' } });
      },
    },
  };

  try {
    const worker = (await import(`${pathToFileURL(workerFile).href}?v=${Date.now()}`)).default;

    const userRequest = new Request('https://spendsensehq.pages.dev/user?x=1', {
      headers: {
        Cookie: 'session=abc',
        Origin: prepare.PRODUCTION_ORIGIN,
        Referer: `${prepare.PRODUCTION_ORIGIN}/dashboard/dashboard.html`,
      },
    });
    const userResponse = await worker.fetch(userRequest, env);
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].url, 'https://spendsense-api-t0up.onrender.com/user?x=1');
    assert.equal(upstreamCalls[0].method, 'GET');
    assert.equal(upstreamCalls[0].headers.get('cookie'), 'session=abc');
    assert.equal(upstreamCalls[0].headers.get('origin'), prepare.PRODUCTION_ORIGIN);
    assert.equal(upstreamCalls[0].headers.get('referer'), `${prepare.PRODUCTION_ORIGIN}/dashboard/dashboard.html`);
    assert.equal(userResponse.status, 200);
    assert.equal(userResponse.headers.get('access-control-allow-origin'), prepare.PRODUCTION_ORIGIN);
    assert.match(userResponse.headers.get('set-cookie'), /session=abc/);
    assert.equal(await userResponse.text(), JSON.stringify({ ok: true }));

    const apiRequest = new Request('https://spendsensehq.pages.dev/api/notifications?filter=all&offset=0');
    await worker.fetch(apiRequest, env);
    assert.equal(upstreamCalls.length, 2);
    assert.equal(upstreamCalls[1].url, 'https://spendsense-api-t0up.onrender.com/api/notifications?filter=all&offset=0');

    const importRequest = new Request('https://spendsensehq.pages.dev/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'session=abc' },
      body: JSON.stringify({ confirm: true }),
    });
    await worker.fetch(importRequest, env);
    assert.equal(upstreamCalls.length, 3);
    assert.equal(upstreamCalls[2].method, 'POST');
    assert.equal(postBody, JSON.stringify({ confirm: true }));

    const optionsRequest = new Request('https://spendsensehq.pages.dev/api/notifications', { method: 'OPTIONS' });
    const optionsResponse = await worker.fetch(optionsRequest, env);
    assert.equal(optionsResponse.status, 204);
    assert.equal(optionsResponse.headers.get('access-control-allow-origin'), prepare.PRODUCTION_ORIGIN);
    assert.match(optionsResponse.headers.get('access-control-allow-methods'), /POST/);
    assert.equal(upstreamCalls.length, 3, 'OPTIONS must not reach the backend');

    const userOptions = await worker.fetch(
      new Request('https://spendsensehq.pages.dev/user', { method: 'OPTIONS' }),
      env
    );
    assert.equal(userOptions.status, 204);
    assert.equal(upstreamCalls.length, 3, '/user OPTIONS must not reach the backend');

    const staticRequest = new Request('https://spendsensehq.pages.dev/dashboard/dashboard.html?tab=1');
    const staticResponse = await worker.fetch(staticRequest, env);
    assert.equal(await staticResponse.text(), 'asset');
    assert.equal(assetCalls.length, 1);
    assert.equal(assetCalls[0].url, staticRequest.url);
    assert.equal(upstreamCalls.length, 3);

    const arbitraryRequest = new Request('https://spendsensehq.pages.dev/admin');
    await worker.fetch(arbitraryRequest, env);
    assert.equal(assetCalls.length, 2);
    assert.equal(assetCalls[1].url, arbitraryRequest.url);

    const apiBareRequest = new Request('https://spendsensehq.pages.dev/api');
    await worker.fetch(apiBareRequest, env);
    assert.equal(assetCalls.length, 3);

    const userTrailingSlash = new Request('https://spendsensehq.pages.dev/user/');
    await worker.fetch(userTrailingSlash, env);
    assert.equal(assetCalls.length, 4);
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('notifications use single-prefixed shared-client endpoints and CSRF headers', async () => {
  const calls = [];
  const list = fakeElement();
  const markAll = fakeElement();
  const meta = { content: prepare.PRODUCTION_ORIGIN };
  const documentStub = createDocumentStub({
    cookie: 'XSRF-TOKEN=test-token',
    selectors: {
      'meta[name="api-base-url"]': meta,
      '[data-notification-list]': list,
    },
    elements: {
      'mark-all-read': markAll,
    },
  });

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/notifications/read-all')) return jsonResponse(200, { updated: 1 });
    if (String(url).includes('/notifications/') && options.method === 'POST') return jsonResponse(200, {});
    return jsonResponse(200, {
      data: {
        notifications: [],
        summary: { total: 0, unread: 0, read: 0 },
        pagination: { has_more: false },
      },
    });
  };

  const context = loadSharedClient(documentStub, fetchImpl);
  const UI = {
    formatMoney: (value) => String(value),
    formatDate: (value) => String(value),
    showToast() {},
    renderState() {},
  };
  context.SpendSenseUI = UI;
  context.window.SpendSenseUI = UI;
  vm.runInContext(fs.readFileSync(NOTIFICATIONS_JS, 'utf8'), context, { filename: 'notifications.js' });

  await lastDomContentLoaded(documentStub)();
  await waitFor(() => calls.length >= 1, 'initial notification load');

  assert.equal(
    calls[0].url,
    `${prepare.PRODUCTION_ORIGIN}/api/notifications?filter=all&limit=100&offset=0`
  );
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers['X-XSRF-TOKEN'], undefined);

  const markAllClick = markAll.listeners.get('click');
  assert.ok(markAllClick, 'mark-all-read should be wired');
  await markAllClick();
  await waitFor(
    () => calls.some((call) => call.url === `${prepare.PRODUCTION_ORIGIN}/api/notifications/read-all`),
    'mark-all-read request'
  );
  const readAllCall = calls.find(
    (call) => call.url === `${prepare.PRODUCTION_ORIGIN}/api/notifications/read-all`
  );
  assert.equal(readAllCall.options.method, 'POST');
  assert.equal(readAllCall.options.credentials, 'include');
  assert.equal(readAllCall.options.headers['X-XSRF-TOKEN'], 'test-token');

  const listClick = list.listeners.get('click');
  assert.ok(listClick, 'notification list should delegate mark-read clicks');
  const readButton = fakeElement({
    dataset: { markRead: '42', markType: 'bill_reminder' },
  });
  await listClick({
    target: {
      closest(selector) {
        return selector === '[data-mark-read]' ? readButton : null;
      },
    },
  });
  await waitFor(
    () =>
      calls.some(
        (call) =>
          call.url === `${prepare.PRODUCTION_ORIGIN}/api/notifications/bill_reminder/42/read`
      ),
    'mark-read request'
  );
  const markReadCall = calls.find(
    (call) => call.url === `${prepare.PRODUCTION_ORIGIN}/api/notifications/bill_reminder/42/read`
  );
  assert.equal(markReadCall.options.method, 'POST');
  assert.equal(markReadCall.options.headers['X-XSRF-TOKEN'], 'test-token');
  assert.ok(
    !calls.some((call) => call.url.includes('/api/api/')),
    'shared client already adds /api; callers must not add it again'
  );
});

function createImportDocument() {
  const elements = {};
  for (const id of [
    'import-form',
    'csv-file',
    'import-preview',
    'import-result',
    'import-submit',
    'import-back',
    'import-message',
    'total-rows',
    'valid-rows',
    'error-rows',
    'duplicate-rows',
    'errors-table-body',
    'errors-table-wrap',
    'no-errors',
    'duplicates-table-body',
    'duplicates-table-wrap',
    'no-duplicates',
    'duplicates-details',
    'result-imported',
    'result-skipped',
    'result-valid',
    'result-duplicates',
  ]) {
    elements[id] = fakeElement({ id });
  }
  const meta = { content: prepare.PRODUCTION_ORIGIN };
  const documentStub = createDocumentStub({
    cookie: 'XSRF-TOKEN=test-token',
    selectors: { 'meta[name="api-base-url"]': meta },
    elements,
  });
  return { documentStub, elements };
}

async function loadImportHarness(fetchImpl) {
  const { documentStub, elements } = createImportDocument();
  const context = loadSharedClient(documentStub, fetchImpl);
  const UI = {
    formatMoney: (value) => String(value),
    formatDate: (value) => String(value),
    showToast() {},
    renderState() {},
  };
  context.SpendSenseUI = UI;
  context.window.SpendSenseUI = UI;
  vm.runInContext(fs.readFileSync(IMPORT_JS, 'utf8'), context, { filename: 'import.js' });

  await lastDomContentLoaded(documentStub)();
  return { documentStub, elements, context };
}

test('import preview and submit use the shared client, FormData, cookies, and CSRF', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/import/preview')) {
      return jsonResponse(200, {
        success: true,
        data: {
          summary: { total_rows: 2, valid_rows: 2, error_rows: 0, duplicate_rows: 0 },
          errors: [],
          duplicates: [],
        },
      });
    }
    if (String(url).endsWith('/import')) {
      return jsonResponse(200, {
        success: true,
        data: { imported: 2, skipped: 0, total_valid: 2, duplicates_skipped: 0 },
      });
    }
    return jsonResponse(404, { message: 'unexpected URL' });
  };

  const { elements } = await loadImportHarness(fetchImpl);
  const fileInput = elements['csv-file'];
  const form = elements['import-form'];

  fileInput.files = [new File(['date,type,amount,description\n'], 'transactions.csv', { type: 'text/csv' })];
  const change = fileInput.listeners.get('change');
  assert.ok(change, 'file input change should be wired');
  await change({ target: fileInput });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${prepare.PRODUCTION_ORIGIN}/api/import/preview`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.headers['X-XSRF-TOKEN'], 'test-token');
  assert.equal(calls[0].options.headers['Content-Type'], undefined);
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.body.get('confirm'), 'true');
  assert.equal(calls[0].options.body.get('file').name, 'transactions.csv');
  assert.equal(elements['import-preview'].hidden, false);
  assert.equal(elements['import-submit'].disabled, false);

  const submit = form.listeners.get('submit');
  assert.ok(submit, 'form submit should be wired');
  await submit({ preventDefault() {} });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, `${prepare.PRODUCTION_ORIGIN}/api/import`);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.headers['X-XSRF-TOKEN'], 'test-token');
  assert.equal(calls[1].options.headers['Content-Type'], undefined);
  assert.ok(calls[1].options.body instanceof FormData);
  assert.equal(calls[1].options.body.get('confirm'), 'true');
  assert.equal(calls[1].options.body.get('file').name, 'transactions.csv');
  assert.equal(elements['import-result'].hidden, false);
  assert.equal(elements['result-imported'].textContent, '2');
  assert.match(elements['import-message'].textContent, /Successfully imported 2 transactions/);
});

test('import preview surfaces server validation failures', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse(422, {
      message: 'Invalid CSV',
      errors: { file: ['The file must be a CSV file.'] },
    });
  };

  const { elements } = await loadImportHarness(fetchImpl);
  const fileInput = elements['csv-file'];
  fileInput.files = [new File(['not a csv'], 'bad.txt', { type: 'text/plain' })];
  const change = fileInput.listeners.get('change');
  await change({ target: fileInput });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${prepare.PRODUCTION_ORIGIN}/api/import/preview`);
  assert.equal(elements['import-message'].textContent, 'Invalid CSV');
  assert.equal(elements['import-message'].classList.contains('error'), true);
});

test('import preview retries once with a refreshed XSRF token and reuses FormData', async () => {
  const calls = [];
  let previewCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/sanctum/csrf-cookie')) {
      return jsonResponse(204, {});
    }
    if (String(url).endsWith('/import/preview')) {
      previewCalls += 1;
      if (previewCalls === 1) return jsonResponse(419, { message: 'CSRF token mismatch.' });
      return jsonResponse(200, {
        success: true,
        data: {
          summary: { total_rows: 1, valid_rows: 1, error_rows: 0, duplicate_rows: 0 },
          errors: [],
          duplicates: [],
        },
      });
    }
    return jsonResponse(404, { message: 'unexpected URL' });
  };

  // The shared client reads the refreshed token from document.cookie, just as
  // the browser would after the CSRF cookie response updates the jar.
  let documentStub;
  const wrappedFetch = async (url, options = {}) => {
    if (String(url).endsWith('/sanctum/csrf-cookie')) {
      documentStub.cookie = 'XSRF-TOKEN=fresh-token';
    }
    return fetchImpl(url, options);
  };

  const harness = await loadImportHarness(wrappedFetch);
  documentStub = harness.documentStub;

  const fileInput = harness.elements['csv-file'];
  fileInput.files = [new File(['date,type,amount,description\n'], 'transactions.csv', { type: 'text/csv' })];
  const change = fileInput.listeners.get('change');
  await change({ target: fileInput });

  assert.equal(previewCalls, 2, 'one rejected request plus one retry');
  assert.equal(calls.filter((call) => call.url.endsWith('/sanctum/csrf-cookie')).length, 1);
  const previews = calls.filter((call) => call.url.endsWith('/import/preview'));
  assert.equal(previews.length, 2);
  assert.equal(previews[0].options.headers['X-XSRF-TOKEN'], 'test-token');
  assert.equal(previews[1].options.headers['X-XSRF-TOKEN'], 'fresh-token');
  assert.ok(previews[0].options.body instanceof FormData);
  assert.ok(previews[1].options.body instanceof FormData);
  assert.equal(harness.elements['import-preview'].hidden, false);
});

test('prepare script writes a deployable copy to an external temporary directory', () => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'spendsense-dist-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        PREPARE_JS,
        '--api-base-url',
        prepare.PRODUCTION_ORIGIN,
        '--destination',
        destination,
        '--force',
      ],
      { cwd: FRONTEND_ROOT, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.existsSync(path.join(destination, '_worker.js')));
    assert.ok(fs.existsSync(path.join(destination, 'index.html')));
    assert.equal(fs.existsSync(path.join(destination, 'tests')), false);
    assert.equal(fs.existsSync(path.join(destination, '.github')), false);
    assert.equal(fs.existsSync(path.join(destination, 'deploy')), false);

    const index = fs.readFileSync(path.join(destination, 'index.html'), 'utf8');
    assert.ok(index.includes(`content="${prepare.PRODUCTION_ORIGIN}"`));
    assert.ok(!index.includes('http://127.0.0.1:8002'));

    const worker = fs.readFileSync(path.join(destination, '_worker.js'), 'utf8');
    assert.match(worker, /pathname === '\/user'/);
    assert.match(worker, /pathname\.startsWith\('\/api\/'\)/);
    assert.match(worker, /spendsense-api-t0up\.onrender\.com/);
  } finally {
    fs.rmSync(destination, { recursive: true, force: true });
  }
});
