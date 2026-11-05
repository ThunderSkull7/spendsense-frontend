# SpendSense Frontend — Developer Guide

This guide covers local development setup, server configuration, testing procedures, and debugging workflows for the SpendSense vanilla JavaScript frontend.

---

## 1. Prerequisites

- **Node.js:** v24 or later (supports native Node.js test runner `--test`).
- **Web Browser:** Google Chrome (required for running headless browser regression tests) or any modern Chromium/WebKit/Gecko browser for manual verification.
- **Backend API (Optional for static UI work):** A running local instance of [spendsense-backend](https://github.com/ThunderSkull7/spendsense-backend) at `http://127.0.0.1:8002`.

---

## 2. Quickstart & Local Server

Because SpendSense is built with native vanilla JavaScript, HTML, and CSS, **no build step, transpiler, or `npm install` is required**.

### 1. Clone the repository
```bash
git clone https://github.com/ThunderSkull7/spendsense-frontend.git
cd spendsense-frontend
```

### 2. Start a local static file server
You can use any standard static HTTP server from the repository root:

- **Using Node `npx serve`:**
  ```bash
  npx serve -l 8000 .
  ```
- **Using Python 3:**
  ```bash
  python -m http.server 8000
  ```
- **Using PHP:**
  ```bash
  php -S 127.0.0.1:8000
  ```

Open your browser to `http://127.0.0.1:8000`.

---

## 3. Connecting to the Backend API

Each HTML page includes a `<meta name="api-base-url">` tag in its `<head>`:

```html
<meta name="api-base-url" content="http://127.0.0.1:8002">
```

- In local development, leave this pointing to `http://127.0.0.1:8002` (the default port for `php artisan serve`).
- The `API.init()` helper in `script.js` automatically reads this meta tag and configures all outgoing fetch calls.
- **Do not edit this URL in the source files for production deployments.** The production preparation script (`deploy/prepare-frontend-deploy.js`) automatically rewrites the destination copy to `https://spendsensehq.pages.dev` during deployment.

---

## 4. Automated Testing Suite

SpendSense uses the native Node.js test runner (`node:test` and `node:assert/strict`) orchestrating unit, integration, and browser tests via `tools/run-tests.js`.

### Running Tests

```bash
# 1. Run all Node unit, orchestration, and Worker tests (fast)
node tools/run-tests.js --suite=node

# 2. Run all headless Chrome browser regression tests
node tools/run-tests.js --suite=browser

# 3. Run the complete test suite (both suites sequentially)
node tools/run-tests.js --suite=all

# 4. List all discovered test files and classifications
node tools/run-tests.js --list

# 5. Run legacy site structure verification
node tools/legacy-site-verify.js
```

### Browser Regression Testing & Chrome Requirements

The browser test suite (`*browser.test.js` and `responsive-layout.test.js`) launches headless Google Chrome via the Chrome DevTools Protocol (CDP):

- **Chrome Discovery:** Tests search standard installation paths:
  - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - Linux: `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`
- **Explicit Binary Path:** You can specify a custom Chrome path using the `CHROME_BIN` environment variable:
  ```bash
  # Linux/macOS
  export CHROME_BIN=/usr/bin/google-chrome

  # Windows PowerShell
  $env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"
  ```
- **Verify Chrome Detection:**
  ```bash
  node tools/run-tests.js --check-chrome
  ```
- **Local Skip Convenience:** If Chrome is not installed locally, browser tests gracefully skip (`t.skip()`). In CI environments (`CI=true`), missing Chrome is strictly forbidden and causes an immediate failure.

---

## 5. Troubleshooting & Common Issues

### 1. CORS Errors When Making Requests
- **Symptom:** `Access to fetch at 'https://spendsense-api-t0up.onrender.com/api/...' has been blocked by CORS policy`.
- **Cause:** Directly targeting the Render API from a browser bypassing the reverse proxy.
- **Fix:** In local development, ensure the backend API is running locally at `http://127.0.0.1:8002` with Sanctum stateful domain configuration. In production, requests must route through `https://spendsensehq.pages.dev` to utilize the Pages Worker proxy.

### 2. HTTP 419 (CSRF Token Mismatch) on Mutations
- **Symptom:** POST/PUT requests fail with 419.
- **Cause:** Missing `XSRF-TOKEN` cookie or mismatch between origin hostnames (e.g. browsing via `localhost` while API runs on `127.0.0.1`).
- **Fix:** Access both the frontend and backend using consistent hostnames (prefer `127.0.0.1` over `localhost`). Ensure the backend `SANCTUM_STATEFUL_DOMAINS` includes your frontend port (e.g. `127.0.0.1:8000`).

### 3. Chrome Window Appears or Hangs on Windows
- **Cause:** Invoking Chrome without headless flags or executing GUI subsystem binaries synchronously.
- **Fix:** The test suite automatically spawns Chrome with `--headless --remote-debugging-port=0 --disable-gpu --no-sandbox` to ensure clean execution. Use `tools/run-tests.js` which manages Chrome process lifecycles and temporary user data directories safely.
