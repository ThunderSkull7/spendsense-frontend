// Regression tests for production deployment preparation (deploy/prepare-frontend-deploy.js)
// Run with: node --test tests/prepare-deploy.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const {
  PRODUCTION_ORIGIN,
  validateApiBaseUrl,
  parseArgs,
} = require('../deploy/prepare-frontend-deploy.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'deploy', 'prepare-frontend-deploy.js');

test('validateApiBaseUrl enforces exact HTTPS production origin without paths or slashes', () => {
  // Valid origin
  assert.equal(validateApiBaseUrl('https://spendsensehq.pages.dev'), 'https://spendsensehq.pages.dev');
  assert.equal(validateApiBaseUrl('  https://spendsensehq.pages.dev  '), 'https://spendsensehq.pages.dev');

  // Invalid variations
  const invalidOrigins = [
    '',
    null,
    undefined,
    'http://spendsensehq.pages.dev', // not HTTPS
    'https://spendsensehq.pages.dev/', // trailing slash
    'https://spendsensehq.pages.dev/api', // subpath
    'https://user:pass@spendsensehq.pages.dev', // credentials
    'https://spendsensehq.pages.dev:443', // port
    'https://malicious.pages.dev', // wrong domain
    'https://spendsense-api-t0up.onrender.com', // backend origin (not Pages origin)
  ];

  for (const origin of invalidOrigins) {
    assert.throws(
      () => validateApiBaseUrl(origin),
      /ApiBaseUrl must be exactly https:\/\/spendsensehq\.pages\.dev/,
      `Origin '${origin}' must be rejected by validateApiBaseUrl`
    );
  }
});

test('prepare-frontend-deploy CLI rejects missing required arguments', () => {
  // Missing --destination
  assert.throws(
    () => {
      execFileSync(
        process.execPath,
        [SCRIPT_PATH, '--api-base-url', PRODUCTION_ORIGIN],
        { stdio: 'pipe' }
      );
    },
    /Missing required option: --destination/
  );

  // Missing --api-base-url
  assert.throws(
    () => {
      execFileSync(
        process.execPath,
        [SCRIPT_PATH, '--destination', path.join(os.tmpdir(), 'some-dest')],
        { stdio: 'pipe' }
      );
    },
    /Missing required option: --api-base-url/
  );
});

test('prepare-frontend-deploy rejects unsafe destination configurations', () => {
  // Destination equals current working directory
  assert.throws(
    () => {
      execFileSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--api-base-url', PRODUCTION_ORIGIN,
          '--destination', process.cwd(),
          '--force',
        ],
        { cwd: process.cwd(), stdio: 'pipe' }
      );
    },
    /Destination must not be the current directory/
  );

  // Destination equals source
  assert.throws(
    () => {
      execFileSync(
        process.execPath,
        [
          SCRIPT_PATH,
          '--source', REPO_ROOT,
          '--destination', REPO_ROOT,
          '--api-base-url', PRODUCTION_ORIGIN,
          '--force',
        ],
        { cwd: os.tmpdir(), stdio: 'pipe' }
      );
    },
    /Destination must differ from the source/
  );
});

test('prepare-frontend-deploy safely supports in-tree destination without recursion or source corruption', () => {
  const inTreeDest = path.join(REPO_ROOT, 'scratch-test-dist');

  try {
    execFileSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--api-base-url', PRODUCTION_ORIGIN,
        '--destination', inTreeDest,
        '--force',
      ],
      { cwd: REPO_ROOT, stdio: 'pipe' }
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

    // Destination HTML check: rewritten to production origin
    const destIndex = fs.readFileSync(path.join(inTreeDest, 'index.html'), 'utf8');
    assert.ok(destIndex.includes(PRODUCTION_ORIGIN), 'destination index.html must contain production origin');
    assert.equal(destIndex.includes('http://127.0.0.1:8002'), false, 'destination index.html must not contain dev URL');

    // Source immutability check
    const sourceIndex = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    assert.match(sourceIndex, /http:\/\/127\.0\.0\.1:8002/, 'source index.html must remain untouched with dev URL');
  } finally {
    if (fs.existsSync(inTreeDest)) {
      fs.rmSync(inTreeDest, { recursive: true, force: true });
    }
  }
});

test('prepare-frontend-deploy output contains no build machine paths or secrets', () => {
  const tmpDest = fs.mkdtempSync(path.join(os.tmpdir(), 'spendsense-clean-dist-'));

  try {
    execFileSync(
      process.execPath,
      [
        SCRIPT_PATH,
        '--api-base-url', PRODUCTION_ORIGIN,
        '--destination', tmpDest,
        '--force',
      ],
      { cwd: REPO_ROOT, stdio: 'pipe' }
    );

    // Recursively check all generated files
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith('.html') || entry.name.endsWith('.js') || entry.name.endsWith('.css')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Must not leak user home directory or temp path
          assert.equal(
            content.includes(process.env.USERPROFILE || 'NoSuchPath'),
            false,
            `File ${entry.name} must not leak local machine user path`
          );
          // Must not contain local dev URL in output
          assert.equal(
            content.includes('http://127.0.0.1:8002'),
            false,
            `File ${entry.name} in destination must not contain dev URL`
          );
        }
      }
    };

    checkDir(tmpDest);
  } finally {
    if (fs.existsSync(tmpDest)) {
      fs.rmSync(tmpDest, { recursive: true, force: true });
    }
  }
});
