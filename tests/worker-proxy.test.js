// Regression tests for Cloudflare worker proxy routing.
// Run with: node --test tests/worker-proxy.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildWorkerCode } = require('../deploy/prepare-frontend-deploy.js');

function loadWorkerModule() {
  const code = buildWorkerCode();
  // Transform ES export default into module.exports for Node VM
  const cjsCode = code.replace(/export\s+default\s+/, 'module.exports = ');
  const moduleStub = { exports: {} };
  const context = {
    module: moduleStub,
    exports: moduleStub.exports,
    URL,
    Response,
    Request,
    Headers,
    console,
    fetch: (...args) => globalThis.fetch(...args),
  };
  vm.createContext(context);
  vm.runInContext(cjsCode, context);
  return moduleStub.exports;
}

test('worker routes /sanctum/csrf-cookie to backend upstream', async () => {
  const worker = loadWorkerModule();
  let upstreamCalled = false;
  let targetUrl = '';

  const mockEnv = {
    ASSETS: {
      fetch: async () => {
        throw new Error('Static assets handler should not be called for /sanctum/*');
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (req) => {
    upstreamCalled = true;
    targetUrl = req.url;
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': 'XSRF-TOKEN=test-token; Path=/' },
    });
  };

  try {
    const request = new Request('https://spendsensehq.pages.dev/sanctum/csrf-cookie', {
      method: 'GET',
      headers: { Origin: 'https://spendsensehq.pages.dev' },
    });
    const response = await worker.fetch(request, mockEnv);

    assert.equal(upstreamCalled, true, 'upstream backend fetch must be invoked');
    assert.equal(targetUrl, 'https://spendsense-api-t0up.onrender.com/sanctum/csrf-cookie');
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://spendsensehq.pages.dev');
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
    assert.ok(response.headers.get('Set-Cookie'), 'Set-Cookie must be preserved');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker routes /api/expenses to backend upstream and preserves query params', async () => {
  const worker = loadWorkerModule();
  let targetUrl = '';

  const mockEnv = {
    ASSETS: {
      fetch: async () => {
        throw new Error('Static assets handler should not be called for /api/*');
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (req) => {
    targetUrl = req.url;
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const request = new Request('https://spendsensehq.pages.dev/api/expenses?page=2&limit=10', {
      method: 'GET',
    });
    const response = await worker.fetch(request, mockEnv);

    assert.equal(targetUrl, 'https://spendsense-api-t0up.onrender.com/api/expenses?page=2&limit=10');
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker routes /user session-hydration endpoint to backend upstream', async () => {
  const worker = loadWorkerModule();
  let targetUrl = '';

  const mockEnv = {
    ASSETS: {
      fetch: async () => {
        throw new Error('Static assets handler should not be called for /user');
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (req) => {
    targetUrl = req.url;
    return new Response(JSON.stringify({ id: 1, email: 'test@example.com' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const request = new Request('https://spendsensehq.pages.dev/user', {
      method: 'GET',
    });
    const response = await worker.fetch(request, mockEnv);

    assert.equal(targetUrl, 'https://spendsense-api-t0up.onrender.com/user');
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker responds to CORS preflight OPTIONS without forwarding upstream', async () => {
  const worker = loadWorkerModule();
  let upstreamCalled = false;

  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called for preflight'); } },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response();
  };

  try {
    const request = new Request('https://spendsensehq.pages.dev/api/expenses', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://spendsensehq.pages.dev',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const response = await worker.fetch(request, mockEnv);

    assert.equal(upstreamCalled, false, 'OPTIONS preflight must NOT call upstream');
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://spendsensehq.pages.dev');
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
    assert.ok(response.headers.get('Access-Control-Allow-Headers').includes('Idempotency-Key'));
    assert.ok(response.headers.get('Access-Control-Allow-Headers').includes('X-XSRF-TOKEN'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker allows Cloudflare Pages preview origin and reflects it in CORS headers', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const previewOrigin = 'https://1019b890.spendsensehq.pages.dev';

  // Test preflight OPTIONS
  const preflightReq = new Request('https://spendsensehq.pages.dev/api/login', {
    method: 'OPTIONS',
    headers: {
      Origin: previewOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,X-XSRF-TOKEN',
    },
  });
  const preflightRes = await worker.fetch(preflightReq, mockEnv);
  assert.equal(preflightRes.status, 204);
  assert.equal(preflightRes.headers.get('Access-Control-Allow-Origin'), previewOrigin);
  assert.equal(preflightRes.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(preflightRes.headers.get('Vary'), 'Origin');

  // Test proxied response preserves the preview origin
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ user: { email: 'preview@example.com' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const postReq = new Request('https://spendsensehq.pages.dev/api/login', {
      method: 'POST',
      headers: {
        Origin: previewOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'preview@example.com', password: 'password123' }),
    });
    const postRes = await worker.fetch(postReq, mockEnv);
    assert.equal(postRes.status, 200);
    assert.equal(postRes.headers.get('Access-Control-Allow-Origin'), previewOrigin);
    assert.equal(postRes.headers.get('Access-Control-Allow-Credentials'), 'true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker falls back to production PAGES_ORIGIN for unauthorized cross-origin requests', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const untrustedOrigin = 'https://malicious-site.example.com';
  const preflightReq = new Request('https://spendsensehq.pages.dev/api/login', {
    method: 'OPTIONS',
    headers: {
      Origin: untrustedOrigin,
      'Access-Control-Request-Method': 'POST',
    },
  });
  const preflightRes = await worker.fetch(preflightReq, mockEnv);
  assert.equal(preflightRes.status, 204);
  assert.equal(preflightRes.headers.get('Access-Control-Allow-Origin'), 'https://spendsensehq.pages.dev');
});

test('worker delegates static asset requests to env.ASSETS.fetch', async () => {
  const worker = loadWorkerModule();
  let assetFetchCalled = false;
  let requestedAssetPath = '';

  const mockEnv = {
    ASSETS: {
      fetch: async (req) => {
        assetFetchCalled = true;
        requestedAssetPath = new URL(req.url).pathname;
        return new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Upstream backend must not be called for static assets');
  };

  try {
    const request = new Request('https://spendsensehq.pages.dev/dashboard/dashboard.html');
    const response = await worker.fetch(request, mockEnv);

    assert.equal(assetFetchCalled, true, 'env.ASSETS.fetch must be called for static assets');
    assert.equal(requestedAssetPath, '/dashboard/dashboard.html');
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('worker routes POST /api/transactions with headers, body, and idempotency key preserved', async () => {
  const worker = loadWorkerModule();
  let receivedMethod = '';
  let receivedUrl = '';
  let receivedHeaders = null;
  let receivedBody = '';

  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (req) => {
    receivedMethod = req.method;
    receivedUrl = req.url;
    receivedHeaders = req.headers;
    receivedBody = await req.text();
    return new Response(JSON.stringify({ id: 99, amount: 250 }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const payload = JSON.stringify({ amount: 250, description: 'Lunch', category_id: 2 });
    const request = new Request('https://spendsensehq.pages.dev/api/transactions', {
      method: 'POST',
      headers: {
        Origin: 'https://spendsensehq.pages.dev',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-test-key-12345',
        'X-XSRF-TOKEN': 'xsrf-token-sample',
        Cookie: 'spendsense_session=sessionval; XSRF-TOKEN=xsrf-token-sample',
        Host: 'spendsensehq.pages.dev',
      },
      body: payload,
    });

    const response = await worker.fetch(request, mockEnv);
    assert.equal(receivedMethod, 'POST');
    assert.equal(receivedUrl, 'https://spendsense-api-t0up.onrender.com/api/transactions');
    assert.equal(receivedBody, payload);
    assert.equal(receivedHeaders.get('idempotency-key'), 'idem-test-key-12345');
    assert.equal(receivedHeaders.get('x-xsrf-token'), 'xsrf-token-sample');
    assert.equal(receivedHeaders.get('cookie'), 'spendsense_session=sessionval; XSRF-TOKEN=xsrf-token-sample');
    assert.equal(receivedHeaders.get('host'), null, 'host header must be stripped from proxy request');
    assert.equal(response.status, 201);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker routes PUT and DELETE mutations with method and header preservation', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const originalFetch = globalThis.fetch;
  let lastMethod = '';
  let lastUrl = '';

  globalThis.fetch = async (req) => {
    lastMethod = req.method;
    lastUrl = req.url;
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  };

  try {
    const putReq = new Request('https://spendsensehq.pages.dev/api/categories/5', {
      method: 'PUT',
      headers: {
        Origin: 'https://spendsensehq.pages.dev',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Groceries' }),
    });
    const putRes = await worker.fetch(putReq, mockEnv);
    assert.equal(lastMethod, 'PUT');
    assert.equal(lastUrl, 'https://spendsense-api-t0up.onrender.com/api/categories/5');
    assert.equal(putRes.status, 200);

    const deleteReq = new Request('https://spendsensehq.pages.dev/api/transactions/42', {
      method: 'DELETE',
      headers: { Origin: 'https://spendsensehq.pages.dev' },
    });
    const deleteRes = await worker.fetch(deleteReq, mockEnv);
    assert.equal(lastMethod, 'DELETE');
    assert.equal(lastUrl, 'https://spendsense-api-t0up.onrender.com/api/transactions/42');
    assert.equal(deleteRes.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker routes complex query parameters and preserves URL encoding', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const originalFetch = globalThis.fetch;
  let targetUrl = '';
  globalThis.fetch = async (req) => {
    targetUrl = req.url;
    return new Response(JSON.stringify([]), { status: 200 });
  };

  try {
    const complexQuery = 'from=2026-01-01&to=2026-01-31&category=Food%20%26%20Dining&sort=desc';
    const request = new Request(`https://spendsensehq.pages.dev/api/reports?${complexQuery}`);
    await worker.fetch(request, mockEnv);

    assert.equal(
      targetUrl,
      `https://spendsense-api-t0up.onrender.com/api/reports?${complexQuery}`
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker allows localhost and 127.0.0.1 development origins with port', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const devOrigins = ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://localhost'];
  for (const devOrigin of devOrigins) {
    const req = new Request('https://spendsensehq.pages.dev/api/user', {
      method: 'OPTIONS',
      headers: {
        Origin: devOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    const res = await worker.fetch(req, mockEnv);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), devOrigin);
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), 'true');
  }
});

test('worker rejects malicious origin lookalikes and falls back to PAGES_ORIGIN', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const maliciousOrigins = [
    'https://spendsensehq.pages.dev.attacker.com',
    'https://notspendsensehq.pages.dev',
    'http://spendsensehq.pages.dev',
    'https://evil.example.org',
  ];

  for (const malicious of maliciousOrigins) {
    const req = new Request('https://spendsensehq.pages.dev/api/user', {
      method: 'OPTIONS',
      headers: {
        Origin: malicious,
        'Access-Control-Request-Method': 'GET',
      },
    });
    const res = await worker.fetch(req, mockEnv);
    assert.equal(res.status, 204);
    assert.equal(
      res.headers.get('Access-Control-Allow-Origin'),
      'https://spendsensehq.pages.dev',
      `Origin ${malicious} must be rejected in favor of production origin`
    );
  }
});

test('worker handles requests without Origin header safely', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

  try {
    const req = new Request('https://spendsensehq.pages.dev/api/categories');
    const res = await worker.fetch(req, mockEnv);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://spendsensehq.pages.dev');
    assert.equal(res.headers.get('Vary'), 'Origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker preserves upstream 502 Bad Gateway response with CORS headers', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'Render service waking up' }), {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const req = new Request('https://spendsensehq.pages.dev/api/expenses', {
      headers: { Origin: 'https://spendsensehq.pages.dev' },
    });
    const res = await worker.fetch(req, mockEnv);
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://spendsensehq.pages.dev');
    const data = await res.json();
    assert.equal(data.message, 'Render service waking up');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker handles upstream network failure gracefully and returns 502 Bad Gateway with CORS headers', async () => {
  const worker = loadWorkerModule();
  const mockEnv = {
    ASSETS: { fetch: async () => { throw new Error('ASSETS should not be called'); } },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed: Connection refused');
  };

  try {
    const req = new Request('https://spendsensehq.pages.dev/api/expenses', {
      headers: { Origin: 'https://spendsensehq.pages.dev' },
    });
    const res = await worker.fetch(req, mockEnv);
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://spendsensehq.pages.dev');
    const data = await res.json();
    assert.equal(data.error, 'Bad Gateway');
    assert.match(data.message, /fetch failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker delegates non-allowlisted /user/* subpaths to static assets', async () => {
  const worker = loadWorkerModule();
  let assetFetchCalled = false;
  let requestedAssetPath = '';

  const mockEnv = {
    ASSETS: {
      fetch: async (req) => {
        assetFetchCalled = true;
        requestedAssetPath = new URL(req.url).pathname;
        return new Response('Not Found', { status: 404 });
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Upstream backend must not be called for non-allowlisted /user/* path');
  };

  try {
    const req = new Request('https://spendsensehq.pages.dev/user/settings');
    const res = await worker.fetch(req, mockEnv);
    assert.equal(assetFetchCalled, true);
    assert.equal(requestedAssetPath, '/user/settings');
    assert.equal(res.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('worker delegates arbitrary non-API root paths to static assets', async () => {
  const worker = loadWorkerModule();
  let assetFetchCalled = false;
  let requestedAssetPath = '';

  const mockEnv = {
    ASSETS: {
      fetch: async (req) => {
        assetFetchCalled = true;
        requestedAssetPath = new URL(req.url).pathname;
        return new Response('OK', { status: 200 });
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Upstream backend must not be called for static paths');
  };

  try {
    const paths = ['/styles.css', '/theme.js', '/favicon.ico', '/budget-planning/budget.html'];
    for (const p of paths) {
      assetFetchCalled = false;
      const req = new Request(`https://spendsensehq.pages.dev${p}`);
      const res = await worker.fetch(req, mockEnv);
      assert.equal(assetFetchCalled, true);
      assert.equal(requestedAssetPath, p);
      assert.equal(res.status, 200);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prepare-frontend-deploy safely supports in-tree destination without recursion or source corruption', () => {
  const { execFileSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');

  const repoRoot = path.resolve(__dirname, '..');
  const inTreeDest = path.join(repoRoot, 'scratch-test-dist');

  try {
    // Run the preparation script targeting an in-tree folder
    execFileSync(
      process.execPath,
      [
        path.join(repoRoot, 'deploy', 'prepare-frontend-deploy.js'),
        '--api-base-url',
        'https://spendsensehq.pages.dev',
        '--destination',
        inTreeDest,
        '--force',
      ],
      { cwd: repoRoot, stdio: 'pipe' }
    );

    assert.ok(fs.existsSync(inTreeDest), 'in-tree destination directory must be created');
    assert.ok(fs.existsSync(path.join(inTreeDest, 'index.html')), 'index.html must be copied');
    assert.ok(fs.existsSync(path.join(inTreeDest, '_worker.js')), '_worker.js must be generated');

    // Exclusions check
    assert.equal(fs.existsSync(path.join(inTreeDest, '.git')), false, '.git must be excluded');
    assert.equal(fs.existsSync(path.join(inTreeDest, '.github')), false, '.github must be excluded');
    assert.equal(fs.existsSync(path.join(inTreeDest, 'deploy')), false, 'deploy/ must be excluded');
    assert.equal(fs.existsSync(path.join(inTreeDest, 'tests')), false, 'tests/ must be excluded');
    assert.equal(fs.existsSync(path.join(inTreeDest, 'tools')), false, 'tools/ must be excluded');
    assert.equal(fs.existsSync(path.join(inTreeDest, 'scratch-test-dist')), false, 'destination must not copy into itself');

    // Worker routing verification in output
    const workerContent = fs.readFileSync(path.join(inTreeDest, '_worker.js'), 'utf8');
    assert.match(workerContent, /pathname\.startsWith\('\/sanctum\/'\)/, 'worker must proxy /sanctum/*');
    assert.match(workerContent, /pathname\.startsWith\('\/api\/'\)/, 'worker must proxy /api/*');
    assert.match(workerContent, /pathname === '\/user'/, 'worker must proxy /user');

    // Source immutability check
    const sourceIndex = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    assert.match(sourceIndex, /http:\/\/127\.0\.0\.1:8002/, 'source index.html must remain untouched with dev URL');
  } finally {
    if (fs.existsSync(inTreeDest)) {
      fs.rmSync(inTreeDest, { recursive: true, force: true });
    }
  }
});
