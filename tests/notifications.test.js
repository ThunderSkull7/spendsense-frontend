// Regression tests for the notifications centre frontend contract.
// (The bills/calendar page was retired; the tests that covered its helpers
// were removed together with recurring-expenses.js.)
// Run with: node --test tests/notifications.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const NOTIFICATIONS_JS = path.join(__dirname, '..', 'notifications', 'notifications.js');
const NOTIFICATIONS_HTML = path.join(__dirname, '..', 'notifications', 'notifications.html');

test('notification scripts reference the intended owner-scoped APIs', () => {
  const notifications = fs.readFileSync(NOTIFICATIONS_JS, 'utf8');
  const notificationsHtml = fs.readFileSync(NOTIFICATIONS_HTML, 'utf8');

  for (const endpoint of [
    "API.get(`/notifications?",
    "API.post(`/notifications/",
    "API.post('/notifications/read-all",
  ]) {
    assert.ok(notifications.includes(endpoint), `notification script missing ${endpoint}`);
  }

  assert.ok(notificationsHtml.includes('data-notification-list'));
  assert.ok(notificationsHtml.includes('Mark all read'));
  assert.ok(notificationsHtml.includes('aria-label="Notification filter"'));
  assert.ok(notificationsHtml.includes('data-filter="unread"'));
});
