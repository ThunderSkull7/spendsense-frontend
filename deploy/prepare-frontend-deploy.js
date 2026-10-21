#!/usr/bin/env node
/**
 * prepare-frontend-deploy.js
 *
 * Cross-platform (Node.js) version of prepare-frontend-deploy.ps1
 * Produces a deployable copy of the SpendSense static frontend with the
 * API base URL rewritten for the target environment.
 *
 * Usage:
 *   node deploy/prepare-frontend-deploy.js --api-base-url https://spendsensehq.pages.dev --destination ./dist
 *
 * The source frontend directory is never modified. The destination folder
 * is what gets published (e.g. uploaded to Cloudflare Pages).
 */

const fs = require('fs');
const path = require('path');

// The browser must only talk to the Pages origin. The generated worker is the
// same-origin bridge to the Render API, so accepting any other API base URL
// would break cookies/CSRF or bypass that bridge.
const PRODUCTION_ORIGIN = 'https://spendsensehq.pages.dev';
const API_ORIGIN = 'https://spendsense-api-t0up.onrender.com';

// Never publish repository metadata, CI configuration, tests, or build tools.
const EXCLUDED_ROOT_ENTRIES = new Set(['.git', '.github', 'deploy', 'tests', 'tools']);

// Simple argument parsing without external dependencies
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    source: path.resolve(__dirname, '..'), // frontend root (parent of deploy/)
    replace: 'http://127.0.0.1:8002',
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--api-base-url' && i + 1 < args.length) {
      options.apiBaseUrl = args[++i];
    } else if (arg === '--destination' && i + 1 < args.length) {
      options.destination = args[++i];
    } else if (arg === '--source' && i + 1 < args.length) {
      options.source = args[++i];
    } else if (arg === '--replace' && i + 1 < args.length) {
      options.replace = args[++i];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.apiBaseUrl) {
    throw new Error('Missing required option: --api-base-url');
  }
  if (!options.destination) {
    throw new Error('Missing required option: --destination');
  }

  return options;
}

function validateApiBaseUrl(api) {
  const value = String(api ?? '').trim();
  if (value !== PRODUCTION_ORIGIN) {
    throw new Error(
      `ApiBaseUrl must be exactly ${PRODUCTION_ORIGIN} (HTTPS origin, no path, query, credentials, port, or trailing slash)`
    );
  }
  return value;
}

function resolvePath(p, base = process.cwd()) {
  return path.resolve(base, p);
}

function main() {
  const options = parseArgs();
  const source = resolvePath(options.source);
  const destination = resolvePath(options.destination);
  const replaceThis = options.replace;
  const apiBaseUrl = validateApiBaseUrl(options.apiBaseUrl);

  if (!fs.existsSync(source)) {
    throw new Error(`Source directory not found: ${source}`);
  }
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`Source does not look like the SpendSense frontend (missing index.html): ${source}`);
  }

  if (destination === process.cwd()) {
    throw new Error('Destination must not be the current directory');
  }
  if (destination === source) {
    throw new Error('Destination must differ from the source');
  }
  if (destination.startsWith(source + path.sep)) {
    throw new Error('Destination must not be inside the source tree');
  }
  if (source.startsWith(destination + path.sep)) {
    throw new Error('Source must not be inside the destination directory');
  }

  // Create clean destination
  if (fs.existsSync(destination)) {
    if (!options.force) {
      throw new Error(`Destination already exists: ${destination} (use --force to replace)`);
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }
  fs.mkdirSync(destination, { recursive: true });

  console.log(`Source      : ${source}`);
  console.log(`Destination : ${destination}`);
  console.log(`API base    : ${apiBaseUrl}`);

  // Copy source to destination, excluding non-public repository files
  copyRecursiveSync(source, destination, true);

  // Create Cloudflare Pages _worker.js for the same-origin API proxy
  createWorkerProxy(destination);

  // Rewrite the copy only
  const htmlFiles = getHtmlFiles(destination);
  let replaced = 0;
  const skipped = [];

  for (const file of htmlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(replaceThis)) {
      const updated = text.replaceAll(replaceThis, apiBaseUrl);
      fs.writeFileSync(file, updated, 'utf8');
      replaced++;
    } else if (text.includes('name="api-base-url"')) {
      const relative = path.relative(destination, file);
      throw new Error(`Page already points somewhere other than ${replaceThis}: ${relative}`);
    } else {
      skipped.push(path.relative(destination, file));
    }
  }

  if (replaced === 0) {
    throw new Error(`No occurrences of '${replaceThis}' found in the copy - check --source and --replace`);
  }

  // Verify the copy - no leftover localhost URLs
  const leftover = [];
  for (const file of htmlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(replaceThis)) {
      leftover.push(file);
    }
  }
  if (leftover.length > 0) {
    for (const file of leftover) {
      console.error(`LEFTOVER ${path.relative(destination, file)}`);
    }
    throw new Error('The local API base URL is still present in the destination copy');
  }

  // Verify the source was NOT touched
  const sourceHtmlFiles = getHtmlFiles(source);
  let sourceMatchesAfter = 0;
  for (const file of sourceHtmlFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(replaceThis)) {
      sourceMatchesAfter++;
    }
  }
  if (sourceMatchesAfter !== sourceHtmlFiles.length) {
    throw new Error(`Source frontend changed during the run (expected ${sourceHtmlFiles.length} source pages still containing the dev URL, found ${sourceMatchesAfter})`);
  }

  // Report
  console.log('');
  console.log(`HTML pages in copy  : ${htmlFiles.length}`);
  console.log(`API URL rewritten   : ${replaced}`);
  console.log(`Pages without meta  : ${skipped.length}`);
  for (const s of skipped) {
    console.log(`  - ${s}`);
  }
  if (replaced !== 28) {
    console.warn(`Warning: expected 28 SpendSense pages to carry the API meta tag, rewrote ${replaced} - verify the page set before deploying.`);
  }
  console.log(`Source untouched    : ${sourceMatchesAfter} source pages still contain ${replaceThis}`);
  console.log('OK - deployable copy ready.');
}

function buildWorkerCode() {
  return `/**
 * Cloudflare Pages Worker for SpendSense API Proxy
 * Proxies /api/* and the exact /user session-hydration endpoint to the
 * backend API. All other paths are served by the static asset binding.
 * Target: ${API_ORIGIN}
 * Browser-facing origin: ${PRODUCTION_ORIGIN}
 */

const PAGES_ORIGIN = '${PRODUCTION_ORIGIN}';
const BACKEND_HOST = '${new URL(API_ORIGIN).hostname}';

function isProxyPath(pathname) {
  // Only the API namespace and the one session-hydration route may reach the
  // backend. Never proxy arbitrary paths from this worker.
  return pathname === '/user' || pathname.startsWith('/api/');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': PAGES_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization, X-XSRF-TOKEN, X-Requested-With, Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Advanced mode assumes control of every request; serve the static site
    // for every path except the explicit proxy allowlist.
    if (!isProxyPath(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    // Handle preflight without forwarding it to the backend.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Preserve the request path and query string while changing only the
    // upstream origin. Cookies, Origin, Referer and other headers are copied.
    const targetUrl = new URL(request.url);
    targetUrl.protocol = 'https:';
    targetUrl.hostname = BACKEND_HOST;
    targetUrl.port = '';

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.delete('host');

    const proxyInit = {
      method: request.method,
      headers: proxyHeaders,
      redirect: 'follow'
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      proxyInit.body = request.body;
      // Required by the standard Request constructor when a stream body is
      // supplied; Cloudflare's runtime accepts the same option.
      proxyInit.duplex = 'half';
    }

    const response = await fetch(new Request(targetUrl.toString(), proxyInit));

    // Preserve backend response headers, including Set-Cookie, and add the
    // same-origin CORS headers used by the browser-facing Pages host.
    const responseHeaders = new Headers(response.headers);
    for (const [name, value] of Object.entries(corsHeaders())) {
      responseHeaders.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  }
};
`;
}

function createWorkerProxy(destDir) {
  const workerPath = path.join(destDir, '_worker.js');
  fs.writeFileSync(workerPath, buildWorkerCode(), 'utf8');
  console.log(`Created Cloudflare worker: ${path.relative(process.cwd(), workerPath)}`);
}

function copyRecursiveSync(src, dest, isRoot = false) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (isRoot && EXCLUDED_ROOT_ENTRIES.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursiveSync(srcPath, destPath, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getHtmlFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getHtmlFiles(fullPath));
    } else if (entry.name.endsWith('.html')) {
      results.push(fullPath);
    }
  }
  return results;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`prepare-frontend-deploy: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  PRODUCTION_ORIGIN,
  API_ORIGIN,
  parseArgs,
  validateApiBaseUrl,
  buildWorkerCode,
  createWorkerProxy,
  main
};
