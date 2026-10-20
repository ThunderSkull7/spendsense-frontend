/*
 * Unified notification centre — bill reminders and budget alerts in one feed.
 * Fetches from /api/notifications with filter, pagination, and mark-read actions.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) API.init(metaBase.content);

  const state = {
    notifications: [],
    loading: false,
    filter: 'all',
    month: null,
    limit: 100,
    offset: 0,
    hasMore: true,
    total: 0,
    unread: 0,
    read: 0,
  };

  const dom = {
    filterTabs: document.querySelectorAll('[data-filter]'),
    filterPanels: document.querySelectorAll('[role="tabpanel"]'),
    totalCount: document.querySelector('[data-total-count]'),
    unreadCount: document.querySelector('[data-unread-count]'),
    readCount: document.querySelector('[data-read-count]'),
    markAllRead: document.getElementById('mark-all-read'),
    markAllReadFiltered: document.getElementById('mark-all-read-filtered'),
    filterTabs: document.querySelectorAll('[data-filter]'),
    list: document.querySelector('[data-notification-list]'),
    state: document.getElementById('notifications-state'),
    content: document.getElementById('notifications-content'),
    empty: document.querySelector('[data-empty]'),
    loadMore: document.getElementById('load-more'),
    pagination: document.querySelector('[data-pagination]'),
    periodLabel: document.querySelector('[data-period-label]'),
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const setText = (node, value) => {
    if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
  };

  const setMessage = (text, type = '') => {
    if (!dom.message) return;
    dom.message.textContent = text || '';
    dom.message.classList.remove('error', 'success');
    if (type) dom.message.classList.add(type);
  };

  const formatMoney = (value) => UI.formatMoney(value === null || value === undefined ? 0 : value);

  const formatDate = (value) => (value ? UI.formatDate(value) : '—');

  const tbodyRows = (body, rows, columns, emptyMessage = 'No items.') => {
    if (!body) return;
    body.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.className = 'cell-sub';
      td.colSpan = columns;
      td.textContent = emptyMessage;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell, index) => {
        const td = document.createElement('td');
        td.className = index > 0 ? 'num' : '';
        if (cell && typeof cell === 'object' && cell.text !== undefined) {
          td.textContent = cell.text;
          if (cell.className) td.className = cell.className;
        } else {
          td.textContent = cell === null || cell === undefined ? '—' : String(cell);
        }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  };

  const notificationIcon = (type) => {
    const svg = type === 'overdue'
      ? '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/>'
      : type === 'due'
        ? '<path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/>'
        : type === 'budget_alert'
          ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
          : '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>';
    const span = document.createElement('span');
    span.className = `notification-icon tone-${type}`;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`;
    return span;
  };

  const renderNotification = (notification) => {
    const item = document.createElement('li');
    item.className = `notification-item${notification.is_read ? '' : ' is-unread'}`;
    item.dataset.id = notification.id;
    item.dataset.type = notification.type;

    const icon = notificationIcon(notification.type);

    const main = document.createElement('div');
    main.className = 'notification-main';

    const top = document.createElement('div');
    top.className = 'notification-top';

    const title = document.createElement('h3');
    title.className = 'notification-title';
    title.textContent = notification.title || notification.message || 'Notification';

    const typeLabel = document.createElement('span');
    typeLabel.className = `notification-type ${notification.type === 'bill_reminder' ? `tone-${notification.status}` : 'tone-' + (notification.percentage_used > 100 ? 'danger' : 'amber')}`;
    typeLabel.textContent = notification.type_label || notification.type;

    top.append(title, typeLabel);

    main.append(top);

    const metaParts = [];
    if (notification.date) metaParts.push(`Due ${formatDate(notification.date)}`);
    if (notification.category) metaParts.push(notification.category);
    if (notification.status) metaParts.push(notification.status);

    const meta = document.createElement('p');
    meta.className = 'notification-meta';
    meta.textContent = metaParts.join(' · ');
    main.append(meta);

    if (notification.amount) {
      const amount = document.createElement('p');
      amount.className = 'notification-amount';
      amount.textContent = `Expected ${formatMoney(notification.amount)}` + (notification.limit_amount ? ` of ${formatMoney(notification.limit_amount)}` : '');
      main.append(amount);
    }

    const actions = document.createElement('div');
    actions.className = 'notification-actions';

    if (!notification.is_read) {
      const readBtn = document.createElement('button');
      readBtn.className = 'btn secondary sm';
      readBtn.type = 'button';
      readBtn.textContent = 'Mark read';
      readBtn.dataset.markRead = notification.id;
      readBtn.dataset.markType = notification.type;
      readBtn.setAttribute('aria-label', `Mark ${notification.title || 'notification'} as read`);
      actions.appendChild(readBtn);
    } else {
      const readBadge = document.createElement('span');
      readBadge.className = 'pill neutral';
      readBadge.textContent = 'Read';
      actions.appendChild(readBadge);
    }

    const link = document.createElement('a');
    link.className = 'btn ghost sm';
    link.textContent = notification.type === 'bill_reminder' ? 'Open bill' : 'Open budget';
    link.href = notification.url || '#';
    link.setAttribute('aria-label', `Open ${notification.category || 'details'}`);
    actions.appendChild(link);

    main.append(actions);

    const item = document.createElement('li');
    item.className = `notification-item${notification.is_read ? '' : ' is-unread'}`;
    item.dataset.id = notification.id;
    item.dataset.type = notification.type;

    const icon = notificationIcon(notification.type);

    item.append(icon, main, actions);

    return item;
  };

  const setLoading = (loading) => {
    if (!dom.state) return;
    if (loading) {
      dom.state.hidden = false;
      UI.renderState(dom.state, 'loading', { message: 'Loading notifications…' });
    } else {
      dom.state.hidden = true;
    }
  };

  const showEmpty = (message) => {
    if (!dom.list) return;
    dom.list.replaceChildren();
    dom.list.hidden = false;
    if (dom.content) dom.content.hidden = false;
    if (dom.state) dom.state.hidden = true;
    if (dom.empty) {
      dom.empty.textContent = message || 'No notifications match your filter.';
      dom.empty.hidden = false;
    }
    if (dom.pagination) dom.pagination.hidden = true;
  };

  const render = (data) => {
    const { notifications, summary, pagination } = data;
    state.notifications = notifications;
    state.hasMore = pagination?.has_more ?? false;
    state.offset = state.offset + notifications.length;

    // Update summary counts
    const totalCountEl = document.querySelector('[data-total-count]');
    const unreadCountEl = document.querySelector('[data-unread-count]');
    const readCountEl = document.querySelector('[data-read-count]');
    if (totalCountEl) totalCountEl.textContent = summary.total;
    if (unreadCountEl) unreadCountEl.textContent = summary.unread;
    if (readCountEl) readCountEl.textContent = summary.read;

    // Update filter tab counts (could be enhanced later)
    document.querySelectorAll('[data-filter]').forEach(tab => {
      tab.removeAttribute('data-count');
    });

    // Render notifications
    if (dom.list) {
      dom.list.replaceChildren();
      if (!notifications.length) {
        const emptyEl = document.querySelector('[data-empty]');
        if (emptyEl) {
          emptyEl.hidden = false;
          emptyEl.textContent = 'No notifications match your filter.';
        }
        if (dom.pagination) dom.pagination.hidden = true;
        return;
      }

      if (dom.list) dom.list.hidden = false;
      if (dom.empty) dom.empty.hidden = true;

      notifications.forEach((notification) => {
        dom.list.append(renderNotification(notification));
      });

      // Pagination
      if (dom.pagination) {
        dom.pagination.hidden = !pagination?.has_more;
      }
    }

    // Update mark-all-read button state
    if (dom.markAllRead) {
      const hasUnread = (state.unread ?? 0) > 0;
      dom.markAllRead.disabled = !hasUnread;
    }
  };

  const load = async () => {
    if (state.loading) return;
    state.loading = true;
    setLoading(true);

    const params = new URLSearchParams({
      filter: state.filter,
      limit: state.limit,
      offset: state.offset,
    });
    if (state.month) params.set('month', state.month);

    try {
      const result = await API.get(`/api/notifications?${params.toString()}`);
      if (result.status !== 200) throw new Error('Could not load notifications.');
      state.loading = false;
      setLoading(false);
      render(result.data.data);
    } catch (error) {
      state.loading = false;
      setLoading(false);
      UI.renderState(document.getElementById('notifications-state'), 'error', {
        message: error.message || 'Could not load notifications.',
        retry: load,
      });
    }
  };

  const loadMore = async () => {
    if (state.loading || !state.hasMore) return;
    state.loading = true;
    state.offset += 100;

    const params = new URLSearchParams({
      filter: state.filter,
      limit: state.limit,
      offset: state.offset,
    });
    if (state.month) params.set('month', state.month);

    try {
      const result = await API.get(`/api/notifications?${params.toString()}`);
      if (result.status !== 200) throw new Error('Could not load more notifications.');
      state.loading = false;
      if (result.status === 200 && result.data && result.data.data) {
        render(result.data.data);
      }
    } catch (error) {
      state.loading = false;
      state.offset = Math.max(0, state.offset - 100);
    }
  };

  const markRead = async (id, type, button) => {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Marking…';

    try {
      const result = await API.post(`/api/notifications/${type}/${id}/read`);
      if (result.status !== 200) throw new Error(result.data?.message ?? 'Could not mark read.');

      // Update local state
      const item = document.querySelector(`[data-id="${id}"]`);
      if (item) {
        item.classList.remove('is-unread');
        item.classList.add('is-read');
        const actions = item.querySelector('.notification-actions');
        if (actions) {
          const readBtn = actions.querySelector('[data-mark-read]');
          if (readBtn) {
            actions.replaceChildren();
            actions.append(document.createElement('span', 'pill neutral', 'Read'));
            const link = document.createElement('a');
            link.className = 'btn ghost sm';
            link.href = item.querySelector('a[href^="../"]')?.href || '#';
            link.textContent = 'Open';
            actions.appendChild(link);
          }
        }
      }
      UI.showToast('Marked as read', 'success');
      load(); // Reload to update counts
    } catch (error) {
      UI.showToast(`Could not mark as read. ${error.message || ''}`.trim(), 'error');
      button.disabled = false;
      button.textContent = originalText;
    }
  };

  const markAllRead = async () => {
    const btn = document.getElementById('mark-all-read');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Marking…';

    try {
      const result = await API.post('/api/notifications/read-all');
      if (result.status !== 200) throw new Error('Could not mark all read.');
      UI.showToast(`Marked ${result.data.updated} notifications as read`, 'success');
      load();
    } catch (error) {
      UI.showToast(`Could not mark all read. ${error.message || ''}`.trim(), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mark all read';
    }
  };

  const markFilteredRead = async () => {
    const btn = document.getElementById('mark-all-read-filtered');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Marking…';

    try {
      const result = await API.post('/api/notifications/read-all', {
        filter: state.filter,
        month: state.month,
      });
      if (result.status !== 200) throw new Error('Could not mark filtered read.');
      UI.showToast(`Marked ${result.data.updated} filtered notifications as read`, 'success');
      load();
    } catch (error) {
      UI.showToast(`Could not mark filtered read. ${error.message || ''}`.trim(), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mark filtered read';
    }
  };

  const setFilter = (filter) => {
    state.filter = filter;
    state.offset = 0;
    state.hasMore = true;

    // Update tab UI
    document.querySelectorAll('[data-filter]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === filter);
      tab.setAttribute('aria-selected', tab.dataset.filter === filter);
    });

    load();
  };

  const init = () => {
    const cacheDom = () => {
      return {
        list: document.querySelector('[data-notification-list]'),
        state: document.getElementById('notifications-state'),
        content: document.getElementById('notifications-content'),
        empty: document.querySelector('[data-empty]'),
        loadMore: document.getElementById('load-more'),
        pagination: document.querySelector('[data-pagination]'),
        periodLabel: document.querySelector('[data-period-label]'),
      };
    };

    dom = cacheDom();

    // Filter tabs
    document.querySelectorAll('[data-filter]').forEach(tab => {
      tab.addEventListener('click', () => setFilter(tab.dataset.filter));
    });

    // Load more
    if (dom.loadMore) {
      dom.loadMore.addEventListener('click', loadMore);
    }

    // Mark all read
    if (dom.markAllRead) {
      dom.markAllRead.addEventListener('click', markAllRead);
    }

    // Mark filtered read (hidden by default, shown when filter is active)
    const markAllReadFilteredBtn = document.getElementById('mark-all-read-filtered');
    if (markAllReadFilteredBtn) {
      markAllReadFilteredBtn.addEventListener('click', markFilteredRead);
    }

    // Delegated event for mark-read buttons
    if (document.querySelector('[data-notification-list]')) {
      document.querySelector('[data-notification-list]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-mark-read]');
        if (!button) return;
        markRead(Number(button.dataset.markRead), button.dataset.markType, button);
      });
    }

    // Load more button
    if (dom.loadMore) {
      dom.loadMore.addEventListener('click', loadMore);
    }

    // Initial load
    load();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();