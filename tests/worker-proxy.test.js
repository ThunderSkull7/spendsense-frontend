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
