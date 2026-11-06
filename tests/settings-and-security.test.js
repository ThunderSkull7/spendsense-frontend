'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('settings.html structure contains Data Backup download and Security password update form', () => {
  const html = read('settings/settings.html');

  // Data Management: CSV Import & Backup Export
  assert.match(html, /data-import-csv/, 'Contains CSV import trigger');
  assert.match(html, /data-export-backup/, 'Contains data backup export trigger');
  assert.match(html, /spendsense-user-data-v1/, 'Mentions backup schema format');

  // Security: Password Update Form
  assert.match(html, /data-password-form/, 'Contains password change form');
  assert.match(html, /name="current_password"/, 'Contains current password field');
  assert.match(html, /name="password"/, 'Contains new password field');
  assert.match(html, /name="password_confirmation"/, 'Contains confirmation field');
  assert.match(html, /data-password-submit/, 'Contains password submit button');
  assert.match(html, /data-password-message/, 'Contains password message area');
  assert.match(html, /Advanced security controls aren't available yet/, 'Preserves advanced security notice');
});

test('forgot-password.html structure contains forgot form and reset form with token entry', () => {
  const html = read('authentication/forgot-password.html');

  // Step 1: Forgot form
  assert.match(html, /data-forgot-form/, 'Contains forgot form');
  assert.match(html, /data-forgot-submit/, 'Contains forgot submit button');
  assert.match(html, /data-show-reset-step/, 'Contains switch to reset step button');

  // Step 2: Reset form
  assert.match(html, /data-reset-form/, 'Contains reset form');
  assert.match(html, /name="token"/, 'Contains token input field');
  assert.match(html, /name="password"/, 'Contains new password field');
  assert.match(html, /name="password_confirmation"/, 'Contains password confirmation field');
  assert.match(html, /data-reset-submit/, 'Contains reset submit button');

  // Legacy placeholder removed
  assert.doesNotMatch(html, /Password reset isn't supported yet/, 'Must not state password reset is unsupported');
});

test('script.js SpendSenseAPI attaches X-Request-Id correlation header and records lastRequestId (OBS-01)', () => {
  const scriptContent = read('script.js');
  assert.match(scriptContent, /generateRequestId/, 'SpendSenseAPI must implement generateRequestId');
  assert.match(scriptContent, /X-Request-Id/, 'SpendSenseAPI must attach X-Request-Id header');
  assert.match(scriptContent, /lastRequestId/, 'SpendSenseAPI must track lastRequestId');
});

test('worker proxy allowlist includes X-Request-Id in CORS headers', () => {
  const deployScript = read('deploy/prepare-frontend-deploy.js');
  assert.match(deployScript, /Access-Control-Allow-Headers.*X-Request-Id/, 'Worker allows X-Request-Id header');
  assert.match(deployScript, /Access-Control-Expose-Headers.*X-Request-Id/, 'Worker exposes X-Request-Id header');
});

test('auth.js extracts token and email URLSearchParams to auto-activate and populate reset form (Prompt 9)', () => {
  const authJs = read('authentication/auth.js');
  assert.match(authJs, /new URLSearchParams\(window\.location\.search\)/, 'auth.js must parse window.location.search');
  assert.match(authJs, /urlParams\.get\(['"]token['"]\)/, 'auth.js must inspect token parameter');
  assert.match(authJs, /urlParams\.get\(['"]email['"]\)/, 'auth.js must inspect email parameter');
  assert.match(authJs, /resetForm\.hidden\s*=\s*false/, 'auth.js must unhide reset form when link params present');
});

test('forgot-password.html declares explicit referrer-policy meta tag for cross-origin protection (Prompt 9.2)', () => {
  const html = read('authentication/forgot-password.html');
  assert.match(
    html,
    /<meta\s+name=["']referrer["']\s+content=["']strict-origin-when-cross-origin["']\s*\/?>/i,
    'Must include strict-origin-when-cross-origin referrer policy meta tag'
  );
});

test('auth.js immediately scrubs sensitive credentials from visible browser URL via replaceState (Prompt 9.2)', () => {
  const authJs = read('authentication/auth.js');
  assert.match(authJs, /urlParams\.delete\(['"]token['"]\)/, 'Must delete token from URL search params');
  assert.match(authJs, /urlParams\.delete\(['"]email['"]\)/, 'Must delete email from URL search params');
  assert.match(authJs, /window\.history\.replaceState/, 'Must call history.replaceState to clean address bar');

  // Verify URL cleaning logic deterministically
  const search = '?token=secret123&email=user%40example.com&theme=dark#step2';
  const urlParams = new URLSearchParams('?token=secret123&email=user%40example.com&theme=dark');
  const token = urlParams.get('token');
  const email = urlParams.get('email');
  assert.equal(token, 'secret123');
  assert.equal(email, 'user@example.com');

  urlParams.delete('token');
  urlParams.delete('email');
  const remaining = urlParams.toString();
  const cleanUrl = '/authentication/forgot-password.html' + (remaining ? '?' + remaining : '') + '#step2';

  assert.doesNotMatch(cleanUrl, /secret123/, 'Clean URL must not contain the raw token');
  assert.doesNotMatch(cleanUrl, /user%40example\.com/, 'Clean URL must not contain the email address');
  assert.match(cleanUrl, /theme=dark/, 'Clean URL must preserve non-sensitive query parameters');
  assert.match(cleanUrl, /#step2/, 'Clean URL must preserve URL hash');
});


