#!/usr/bin/env node
/**
 * prepare-frontend-deploy.js
 *
 * Cross-platform (Node.js) version of prepare-frontend-deploy.ps1
 * Produces a deployable copy of the SpendSense static frontend with the
 * API base URL rewritten for the target environment.
 *
 * Usage:
 *   node deploy/prepare-frontend-deploy.js --api-base-url https://api.example.com --destination ./dist
 *
 * The source frontend directory is never modified. The destination folder
 * is what gets published (e.g. uploaded to Cloudflare Pages).
 */

const fs = require('fs');
const path = require('path');

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

const options = parseArgs();

function fail(message) {
  console.error(`prepare-frontend-deploy: ${message}`);
  process.exit(1);
}

function validateApiBaseUrl(api) {
  const apiUrl = api.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*$/.test(apiUrl)) {
    fail('ApiBaseUrl must be an HTTPS origin, host only (example: https://api.example.com)');
  }
  if (/localhost|127\.|\.local$/i.test(apiUrl)) {
    fail('ApiBaseUrl must not point at a local address');
  }
  return apiUrl;
}

function fail(message) {
  console.error(`prepare-frontend-deploy: ${message}`);
  process.exit(1);
}

function resolvePath(p, base = process.cwd()) {
  return path.resolve(base, p);
}

function main() {
  const source = resolvePath(options.source);
  const destination = resolvePath(options.destination);
  const replaceThis = options.replace;
  const apiBaseUrl = validateApiBaseUrl(options.apiBaseUrl);

  if (!fs.existsSync(source)) {
    fail(`Source directory not found: ${source}`);
  }
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    fail(`Source does not look like the SpendSense frontend (missing index.html): ${source}`);
  }

  if (destination === process.cwd()) {
    fail('Destination must not be the current directory');
  }
  if (destination === source) {
    fail('Destination must differ from the source');
  }
  if (destination.startsWith(source + path.sep)) {
    fail('Destination must not be inside the source tree');
  }
  if (source.startsWith(destination + path.sep)) {
    fail('Source must not be inside the destination directory');
  }

  // Create clean destination
  if (fs.existsSync(destination)) {
    if (!options.force) {
      fail(`Destination already exists: ${destination} (use --force to replace)`);
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }
  fs.mkdirSync(destination, { recursive: true });

  console.log(`Source      : ${source}`);
  console.log(`Destination : ${destination}`);
  console.log(`API base    : ${apiBaseUrl}`);

  // Copy source to destination (including hidden files)
  copyRecursiveSync(source, destination);

  // Create Cloudflare Pages _worker.js for API proxy
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

function createWorkerProxy(destDir) {
  const workerCode = `/**
 * Cloudflare Pages Worker for SpendSense API Proxy
 * Proxies /api/* requests to the backend API
 * Target: https://spendsense-api-t0up.onrender.com
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Only proxy /api/* requests
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    // Build the target URL
    const targetUrl = new URL(request.url);
    targetUrl.hostname = 'spendsense-api-t0up.onrender.com';
    targetUrl.protocol = 'https:';
    targetUrl.port = '';

    // Create new request to backend
    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });

    // Forward the request to the backend
    const response = await fetch(proxyRequest);

    // Return response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-XSRF-TOKEN, X-Requested-With');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: responseHeaders
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  }
};
`;

  const workerPath = path.join(destDir, '_worker.js');
  fs.writeFileSync(workerPath, workerCode, 'utf8');
  console.log(`Created Cloudflare worker: ${path.relative(process.cwd(), workerPath)}`);
}

function copyRecursiveSync(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursiveSync(srcPath, destPath);
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

main();