// Regression tests for the shared API client's 419 recovery and 401 signal.
// Run with: node --test tests/api-client.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT_JS = path.join(__dirname, '..', 'script.js');

function loadClient({ fetchImpl, cookie = '' }) {
  const events = [];
  const documentStub = {
    cookie,
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const context = {
    document: documentStub,
    fetch: fetchImpl,
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  };
  context.window = context;
  context.window.dispatchEvent = (event) => events.push(event.type);
  context.window.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SCRIPT_JS, 'utf8'), context, { filename: 'script.js' });
  return { api: context.SpendSenseAPI, events, documentStub };
}

const jsonResponse = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

test('a persistent 419 refreshes the token once, retries once, then fails', async () => {
  let posts = 0;
  let csrfCalls = 0;
  const { api } = loadClient({
    cookie: 'XSRF-TOKEN=stale',
    fetchImpl: async (url, options) => {
      if (String(url).endsWith('/sanctum/csrf-cookie')) {
        csrfCalls += 1;
        return jsonResponse(204, {});
      }
      if (options.method === 'POST') {
        posts += 1;
        return jsonResponse(419, { message: 'CSRF token mismatch.' });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');
  const result = await api.api('POST', '/budgets', { limit_amount: 10 }, 'stale');

  assert.equal(posts, 2, 'the original request plus exactly one retry');
  assert.equal(csrfCalls, 1, 'the token is refreshed only once');
  assert.equal(result.status, 419);
  assert.equal(result.data.message, 'CSRF token mismatch. Please log in again.');
});

test('a stale token is retried successfully after one refresh', async () => {
  let posts = 0;
  let csrfCalls = 0;
  const { api } = loadClient({
    cookie: 'XSRF-TOKEN=stale',
    fetchImpl: async (url, options) => {
      if (String(url).endsWith('/sanctum/csrf-cookie')) {
        csrfCalls += 1;
        return jsonResponse(204, {});
      }
      if (options.method === 'POST') {
        posts += 1;
        return posts === 1
          ? jsonResponse(419, { message: 'CSRF token mismatch.' })
          : jsonResponse(201, { message: 'Budget saved!' });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');
  const result = await api.api('POST', '/budgets', { limit_amount: 10 }, 'stale');

  assert.equal(posts, 2);
  assert.equal(csrfCalls, 1);
  assert.equal(result.status, 201);
  assert.equal(result.data.message, 'Budget saved!');
});

test('a 401 emits the session-expired signal exactly once', async () => {
  const { api, events } = loadClient({
    fetchImpl: async () => jsonResponse(401, { message: 'Unauthenticated.' }),
  });
  api.init('http://127.0.0.1:8002');
  const result = await api.get('/expenses');

  assert.equal(result.status, 401);
  assert.equal(result.data.expired, true);
  assert.deepEqual(events, ['spendsense:session-expired']);
});

test('an idempotency key survives the CSRF retry unchanged', async () => {
  let posts = 0;
  const seenKeys = [];
  const { api } = loadClient({
    cookie: 'XSRF-TOKEN=stale',
    fetchImpl: async (url, options) => {
      if (String(url).endsWith('/sanctum/csrf-cookie')) {
        return jsonResponse(204, {});
      }
      if (options.method === 'POST') {
        posts += 1;
        seenKeys.push(options.headers['Idempotency-Key']);
        return posts === 1
          ? jsonResponse(419, { message: 'CSRF token mismatch.' })
          : jsonResponse(201, { data: { id: 7 } });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');

  const result = await api.api(
    'POST',
    '/expenses',
    { amount: 10 },
    'stale',
    false,
    { 'Idempotency-Key': 'expense-key-7' }
  );

  assert.equal(result.status, 201);
  assert.deepEqual(seenKeys, ['expense-key-7', 'expense-key-7']);
});
