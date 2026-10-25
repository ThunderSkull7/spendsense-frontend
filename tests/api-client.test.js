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
    crypto,
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

test('a 401 on /login preserves the real error message and does not emit session-expired', async () => {
  const { api, events } = loadClient({
    fetchImpl: async () => jsonResponse(401, { message: 'Invalid credentials' }),
  });
  api.init('http://127.0.0.1:8002');
  const result = await api.post('/login', { email: 'user@test.com', password: 'bad' });

  assert.equal(result.status, 401);
  assert.equal(result.data.message, 'Invalid credentials');
  assert.equal(result.data.expired, undefined);
  assert.deepEqual(events, []);
});

test('concurrent fetchXSRFToken requests are deduplicated to a single network call', async () => {
  let csrfCalls = 0;
  const { api } = loadClient({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/sanctum/csrf-cookie')) {
        csrfCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return jsonResponse(204, {});
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');

  await Promise.all([
    api.fetchXSRFToken(),
    api.fetchXSRFToken(),
    api.fetchXSRFToken(),
  ]);

  assert.equal(csrfCalls, 1, 'only one network fetch across 3 concurrent calls');
});

test('a mutation automatically generates an idempotency key that survives 419 retry', async () => {
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
          : jsonResponse(201, { data: { id: 10 } });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');

  const result = await api.post('/expenses', { amount: 42, description: 'Groceries' });

  assert.equal(result.status, 201);
  assert.equal(posts, 2);
  assert.equal(seenKeys.length, 2);
  assert.ok(seenKeys[0], 'an idempotency key was automatically generated');
  assert.equal(seenKeys[0], seenKeys[1], 'the same generated key was preserved across the 419 retry');
  assert.match(seenKeys[0], /^[A-Za-z0-9._:-]+$/, 'key complies with backend regex constraint');
});

test('two separate mutations receive distinct automatic idempotency keys', async () => {
  const seenKeys = [];
  const { api } = loadClient({
    cookie: 'XSRF-TOKEN=valid',
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') {
        seenKeys.push(options.headers['Idempotency-Key']);
        return jsonResponse(201, { success: true });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');

  await api.post('/expenses', { amount: 15 });
  await api.post('/incomes', { amount: 50 });

  assert.equal(seenKeys.length, 2);
  assert.ok(seenKeys[0] && seenKeys[1]);
  assert.notEqual(seenKeys[0], seenKeys[1], 'separate mutations receive different idempotency keys');
});

test('a caller-supplied idempotency key is preserved and not overwritten', async () => {
  const seenKeys = [];
  const { api } = loadClient({
    cookie: 'XSRF-TOKEN=valid',
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') {
        seenKeys.push(options.headers['Idempotency-Key']);
        return jsonResponse(201, { success: true });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');

  await api.post('/expenses', { amount: 20 }, { 'Idempotency-Key': 'my-custom-key-999' });

  assert.equal(seenKeys.length, 1);
  assert.equal(seenKeys[0], 'my-custom-key-999');
});

test('concurrent mutations generate independent idempotency keys', async () => {
  const seenKeys = [];
  const { api } = loadClient({
    cookie: 'XSRF-TOKEN=valid',
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') {
        seenKeys.push(options.headers['Idempotency-Key']);
        return jsonResponse(201, { success: true });
      }
      return jsonResponse(200, {});
    },
  });
  api.init('http://127.0.0.1:8002');

  await Promise.all([
    api.post('/budgets', { limit_amount: 100 }),
    api.post('/budgets', { limit_amount: 200 }),
    api.post('/budgets', { limit_amount: 300 }),
  ]);

  assert.equal(seenKeys.length, 3);
  const uniqueKeys = new Set(seenKeys);
  assert.equal(uniqueKeys.size, 3, 'all concurrent requests received distinct keys');
});

test('loadSessionUser hydrates the shell user and deduplicates concurrent requests', async () => {
  let profileCalls = 0;
  let requestedUrl = '';
  const { api, events } = loadClient({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/user')) {
        profileCalls += 1;
        requestedUrl = String(url);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return jsonResponse(200, {
          user: { id: 7, name: 'Asha Rao', email: 'asha@example.com' },
        });
      }
      return jsonResponse(404, { message: 'Not found' });
    },
  });
  api.init('http://127.0.0.1:8002');

  const [first, second] = await Promise.all([
    api.loadSessionUser(),
    api.loadSessionUser(),
  ]);

  assert.equal(profileCalls, 1, 'concurrent identity loads share one request');
  assert.equal(requestedUrl, 'http://127.0.0.1:8002/api/user');
  assert.equal(first.name, 'Asha Rao');
  assert.equal(second.name, 'Asha Rao');
  assert.equal(api.getUser().email, 'asha@example.com');
  assert.deepEqual(events, ['spendsense:auth-change']);
});

test('loadSessionUser leaves neutral fallbacks when the session is absent', async () => {
  const { api, events } = loadClient({
    fetchImpl: async () => jsonResponse(401, { message: 'Unauthenticated.' }),
  });
  api.init('http://127.0.0.1:8002');

  const user = await api.loadSessionUser();

  assert.equal(user, null);
  assert.equal(api.getUser(), null);
  assert.deepEqual(events, [], 'identity hydration must not trigger a global session-expired event');
});

