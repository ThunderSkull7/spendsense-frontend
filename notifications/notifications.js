// Notifications page — wired to active in-app bill reminders.
(function () {
  'use strict';

  var markReadButton = document.querySelector('[data-mark-read]');
  var reminderForm = document.querySelector('[data-reminder-form]');
  var notificationMessage = document.querySelector('[data-notification-message]');
  var notifList = document.querySelector('[data-notification-list]');
  var paymentStat = document.querySelector('[data-stat-payment-reminders]');
  var api = window.api || (typeof window.SpendSenseAPI === 'function' ? new window.SpendSenseAPI() : window.SpendSenseAPI) || null;

  function setNotificationMessage(text) {
    if (!notificationMessage) return;
    notificationMessage.textContent = text || '';
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '₹0.00';
    var num = parseFloat(amount);
    if (isNaN(num)) return '₹' + amount;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    var parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadBillReminders() {
    if (!api || !notifList) return;

    api.get('/bill-reminders')
      .then(function (res) {
        var data = res && res.data ? res.data : {};
        var reminders = data.reminders || [];
        var summary = data.summary || {};

        if (paymentStat) {
          paymentStat.textContent = summary.unread_count !== undefined ? summary.unread_count : reminders.length;
        }

        renderReminders(reminders);
      })
      .catch(function () {
        // Fall back gracefully to empty state
      });
  }

  function renderReminders(reminders) {
    if (!notifList) return;

    if (reminders.length === 0) {
      notifList.innerHTML =
        '<div class="empty-state">' +
        '<div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/></svg></div>' +
        '<h3>No active bill reminders</h3>' +
        '<p>You have no upcoming or overdue payment reminders right now. <a href="../expense-management/expenses.html#recurring">Manage recurring bills</a></p>' +
        '</div>';
      return;
    }

    var html = '<div class="stack" style="display: flex; flex-direction: column; gap: 10px; padding: 12px 16px;">';

    reminders.forEach(function (r) {
      var isRead = r.is_read || r.read_at;
      var typeClass = r.type === 'overdue' ? 'status-overdue' : (r.type === 'due' ? 'status-due' : 'status-upcoming');
      var typeLabel = r.type === 'overdue' ? 'Overdue' : (r.type === 'due' ? 'Due Today' : 'Upcoming');

      var title = r.title || (r.schedule ? r.schedule.description : 'Payment Reminder');
      var amount = r.expected_amount || (r.occurrence ? r.occurrence.expected_amount : '');
      var due = r.due_date || (r.occurrence ? r.occurrence.occurrence_date : '');

      html += '<article class="card notif-item' + (isRead ? ' read' : '') + '" style="margin: 0; padding: 12px 14px; background: var(--surface); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;' + (isRead ? ' opacity: 0.65;' : '') + '">' +
        '<div>' +
        '<div style="display: flex; align-items: center; gap: 8px;">' +
        '<strong style="font-size: 0.95rem;">' + escapeHtml(title) + '</strong>' +
        '<span class="pill ' + typeClass + '">' + typeLabel + '</span>' +
        '</div>' +
        '<div class="cell-sub" style="margin-top: 4px;">' +
        (amount ? 'Amount: <strong>' + formatCurrency(amount) + '</strong> • ' : '') +
        'Due: ' + formatDate(due) +
        '</div>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">' +
        '<a href="../expense-management/expenses.html#calendar" class="btn ghost sm">View on calendar</a>' +
        (!isRead ? '<button type="button" class="btn secondary sm" data-single-mark-read="' + r.id + '">Mark read</button>' : '<span class="cell-sub">Read</span>') +
        '</div>' +
        '</article>';
    });

    html += '</div>';
    notifList.innerHTML = html;

    // Bind individual mark read buttons
    notifList.querySelectorAll('[data-single-mark-read]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-single-mark-read');
        api.post('/bill-reminders/' + id + '/read')
          .then(function () {
            loadBillReminders();
          })
          .catch(function () {});
      });
    });
  }

  if (markReadButton) {
    markReadButton.addEventListener('click', function () {
      if (!api) return;

      api.post('/bill-reminders/read-all')
        .then(function () {
          loadBillReminders();
          setNotificationMessage('All bill reminders marked as read.');
          markReadButton.textContent = 'All read';
        })
        .catch(function () {
          setNotificationMessage('Failed to mark all as read.');
        });
    });
  }

  if (reminderForm) {
    reminderForm.addEventListener('submit', function (event) {
      event.preventDefault();
      // Preferences note: Individual channel settings are fixed; bill reminder window is configured per schedule.
      setNotificationMessage('Reminder preferences: In-app bill reminders are automatically synced based on each bill\'s configured reminder window.');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadBillReminders();
  });

})();
