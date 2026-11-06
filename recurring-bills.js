/**
 * SpendSense — Recurring Bills & Bill Calendar Component
 * Manages recurring payment definitions, occurrence lifecycle (pay/skip/unpaid),
 * monthly and annual estimates, and monthly bill calendar.
 */
(function (window, document) {
  'use strict';

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '₹0.00';
    var num = parseFloat(amount);
    if (isNaN(num)) return '₹' + amount;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    var parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatFrequency(freq) {
    var map = {
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Bi-weekly (2 wks)',
      monthly: 'Monthly',
      quarterly: 'Quarterly (3 mos)',
      'half-yearly': 'Half-yearly (6 mos)',
      yearly: 'Yearly'
    };
    return map[freq] || freq || 'Monthly';
  }

  function unwrap(res) {
    if (!res) return null;
    var body = res.data !== undefined ? res.data : res;
    if (body && typeof body === 'object' && body.data !== undefined) return body.data;
    return body;
  }

  function SpendSenseRecurringBills() {
    this.api = window.api || (typeof window.SpendSenseAPI === 'function' ? new window.SpendSenseAPI() : window.SpendSenseAPI) || null;
    this.schedules = [];
    this.categories = [];
    this.calendarData = null;
    this.currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    this.selectedDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    this.activeTab = 'all'; // 'all', 'recurring', 'calendar'
    this.filterStatus = 'all';
    this.filterFrequency = 'all';
    this.searchQuery = '';
    this.calendarStatusFilter = 'all';
    this.calendarCategoryFilter = 'all';
    this.calendarViewMode = 'grid'; // 'grid' or 'list'
  }

  SpendSenseRecurringBills.prototype.init = function () {
    this.cacheDom();
    this.bindEvents();
    this.loadCategories();
    this.handleRouteHash();
  };

  SpendSenseRecurringBills.prototype.cacheDom = function () {
    this.containerAll = document.getElementById('view-all-expenses');
    this.containerRecurring = document.getElementById('view-recurring-bills');
    this.containerCalendar = document.getElementById('view-bill-calendar');

    this.tabAll = document.getElementById('tab-all-expenses');
    this.tabRecurring = document.getElementById('tab-recurring-bills');
    this.tabCalendar = document.getElementById('tab-bill-calendar');

    // Recurring schedules elements
    this.schedulesTableBody = document.querySelector('[data-recurring-rows]');
    this.schedulesState = document.querySelector('[data-recurring-state]');
    this.schedulesTableWrap = document.querySelector('[data-recurring-table-wrap]');
    this.statMonthly = document.querySelector('[data-stat-monthly-commitment]');
    this.statAnnual = document.querySelector('[data-stat-annual-commitment]');
    this.statActive = document.querySelector('[data-stat-active-commitments]');
    this.statUpcoming = document.querySelector('[data-stat-upcoming-bills]');
    this.statOverdue = document.querySelector('[data-stat-overdue-bills]');

    // Calendar elements
    this.calMonthHeading = document.getElementById('calendar-month-heading');
    this.calPrevBtn = document.getElementById('calendar-prev-month');
    this.calNextBtn = document.getElementById('calendar-next-month');
    this.calTodayBtn = document.getElementById('calendar-today-btn');
    this.calGrid = document.querySelector('[data-calendar-grid]');
    this.calState = document.querySelector('[data-calendar-state]');
    this.calDayPanel = document.querySelector('[data-calendar-day-panel]');
    this.calDayTitle = document.querySelector('[data-calendar-day-title]');
    this.calDayList = document.querySelector('[data-calendar-day-list]');
    this.calListView = document.querySelector('[data-calendar-list-view]');
    this.calListWrap = document.querySelector('[data-calendar-list-wrap]');
    this.calToggleGrid = document.getElementById('cal-toggle-grid');
    this.calToggleList = document.getElementById('cal-toggle-list');

    this.calStatExpected = document.querySelector('[data-cal-stat-expected]');
    this.calStatPaid = document.querySelector('[data-cal-stat-paid]');
    this.calStatUnpaid = document.querySelector('[data-cal-stat-unpaid]');
    this.calStatOverdue = document.querySelector('[data-cal-stat-overdue]');

    // Filters
    this.recStatusFilter = document.getElementById('recurring-status-filter');
    this.recFreqFilter = document.getElementById('recurring-freq-filter');
    this.recSearch = document.getElementById('recurring-search');
    this.calStatusFilterSelect = document.getElementById('calendar-status-filter');
    this.calCategoryFilterSelect = document.getElementById('calendar-category-filter');

    // Modals
    this.recurringModal = document.getElementById('recurring-modal');
    this.recurringForm = document.getElementById('recurring-form');
    this.modalTitle = document.getElementById('recurring-modal-title');
    this.previewBox = document.getElementById('recurring-preview-box');
    this.openAddBtn = document.getElementById('open-add-recurring-btn');
    this.openAddFromCalBtn = document.getElementById('open-add-recurring-cal-btn');
    this.closeModalBtn = document.getElementById('close-recurring-modal-btn');
    this.cancelModalBtn = document.getElementById('cancel-recurring-modal-btn');

    this.payModal = document.getElementById('pay-bill-modal');
    this.payForm = document.getElementById('pay-bill-form');
    this.closePayModalBtn = document.getElementById('close-pay-modal-btn');
    this.cancelPayModalBtn = document.getElementById('cancel-pay-modal-btn');

    this.occurrencesModal = document.getElementById('occurrences-modal');
    this.closeOccurrencesBtn = document.getElementById('close-occurrences-modal-btn');
    this.occurrencesList = document.getElementById('occurrences-list');
    this.occurrencesTitle = document.getElementById('occurrences-modal-title');
  };

  SpendSenseRecurringBills.prototype.bindEvents = function () {
    var self = this;

    // Tabs
    if (this.tabAll) {
      this.tabAll.addEventListener('click', function () { self.switchTab('all'); });
    }
    if (this.tabRecurring) {
      this.tabRecurring.addEventListener('click', function () { self.switchTab('recurring'); });
    }
    if (this.tabCalendar) {
      this.tabCalendar.addEventListener('click', function () { self.switchTab('calendar'); });
    }

    // Hash change
    window.addEventListener('hashchange', function () {
      self.handleRouteHash();
    });

    // Calendar navigation
    if (this.calPrevBtn) {
      this.calPrevBtn.addEventListener('click', function () { self.changeMonth(-1); });
    }
    if (this.calNextBtn) {
      this.calNextBtn.addEventListener('click', function () { self.changeMonth(1); });
    }
    if (this.calTodayBtn) {
      this.calTodayBtn.addEventListener('click', function () {
        self.currentMonth = new Date().toISOString().slice(0, 7);
        self.selectedDate = new Date().toISOString().slice(0, 10);
        self.loadCalendar();
      });
    }

    // Calendar filters
    if (this.calStatusFilterSelect) {
      this.calStatusFilterSelect.addEventListener('change', function (e) {
        self.calendarStatusFilter = e.target.value;
        self.loadCalendar();
      });
    }
    if (this.calCategoryFilterSelect) {
      this.calCategoryFilterSelect.addEventListener('change', function (e) {
        self.calendarCategoryFilter = e.target.value;
        self.loadCalendar();
      });
    }

    // Calendar Grid vs List toggle
    if (this.calToggleGrid) {
      this.calToggleGrid.addEventListener('click', function () {
        self.setCalendarViewMode('grid');
      });
    }
    if (this.calToggleList) {
      this.calToggleList.addEventListener('click', function () {
        self.setCalendarViewMode('list');
      });
    }

    // Recurring filters
    if (this.recStatusFilter) {
      this.recStatusFilter.addEventListener('change', function (e) {
        self.filterStatus = e.target.value;
        self.renderSchedulesTable();
      });
    }
    if (this.recFreqFilter) {
      this.recFreqFilter.addEventListener('change', function (e) {
        self.filterFrequency = e.target.value;
        self.renderSchedulesTable();
      });
    }
    if (this.recSearch) {
      this.recSearch.addEventListener('input', function (e) {
        self.searchQuery = e.target.value.trim().toLowerCase();
        self.renderSchedulesTable();
      });
    }

    // Modal triggers
    if (this.openAddBtn) {
      this.openAddBtn.addEventListener('click', function () { self.openRecurringModal(); });
    }
    if (this.openAddFromCalBtn) {
      this.openAddFromCalBtn.addEventListener('click', function () { self.openRecurringModal(); });
    }
    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', function () { self.closeRecurringModal(); });
    }
    if (this.cancelModalBtn) {
      this.cancelModalBtn.addEventListener('click', function () { self.closeRecurringModal(); });
    }

    // Form inputs for preview
    if (this.recurringForm) {
      var previewInputs = this.recurringForm.querySelectorAll('[data-preview-trigger]');
      previewInputs.forEach(function (inp) {
        inp.addEventListener('input', function () { self.triggerPreview(); });
        inp.addEventListener('change', function () { self.triggerPreview(); });
      });

      this.recurringForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.handleRecurringSubmit();
      });
    }

    // Pay Modal
    if (this.closePayModalBtn) {
      this.closePayModalBtn.addEventListener('click', function () { self.closePayModal(); });
    }
    if (this.cancelPayModalBtn) {
      this.cancelPayModalBtn.addEventListener('click', function () { self.closePayModal(); });
    }
    if (this.payForm) {
      this.payForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.handlePaySubmit();
      });
    }

    // Occurrences Modal
    if (this.closeOccurrencesBtn) {
      this.closeOccurrencesBtn.addEventListener('click', function () { self.closeOccurrencesModal(); });
    }

    // Escape key modal dismiss
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (self.recurringModal && !self.recurringModal.hidden) self.closeRecurringModal();
        if (self.payModal && !self.payModal.hidden) self.closePayModal();
        if (self.occurrencesModal && !self.occurrencesModal.hidden) self.closeOccurrencesModal();
      }
    });
  };

  SpendSenseRecurringBills.prototype.handleRouteHash = function () {
    var hash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (hash === 'calendar' || hash === 'bill-calendar') {
      this.switchTab('calendar');
    } else if (hash === 'recurring' || hash === 'bills') {
      this.switchTab('recurring');
    } else {
      this.switchTab('all');
    }
  };

  SpendSenseRecurringBills.prototype.switchTab = function (tabName) {
    this.activeTab = tabName;

    if (this.tabAll) {
      this.tabAll.classList.toggle('active', tabName === 'all');
      this.tabAll.setAttribute('aria-selected', tabName === 'all');
    }
    if (this.tabRecurring) {
      this.tabRecurring.classList.toggle('active', tabName === 'recurring');
      this.tabRecurring.setAttribute('aria-selected', tabName === 'recurring');
    }
    if (this.tabCalendar) {
      this.tabCalendar.classList.toggle('active', tabName === 'calendar');
      this.tabCalendar.setAttribute('aria-selected', tabName === 'calendar');
    }

    if (this.containerAll) this.containerAll.hidden = tabName !== 'all';
    if (this.containerRecurring) this.containerRecurring.hidden = tabName !== 'recurring';
    if (this.containerCalendar) this.containerCalendar.hidden = tabName !== 'calendar';

    if (tabName === 'recurring') {
      this.loadSchedules();
      window.location.hash = '#recurring';
    } else if (tabName === 'calendar') {
      this.loadCalendar();
      window.location.hash = '#calendar';
    } else {
      if (window.location.hash && window.location.hash !== '#all') {
        history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  SpendSenseRecurringBills.prototype.loadCategories = function () {
    var self = this;
    if (!this.api) return;

    this.api.get('/categories')
      .then(function (res) {
        var raw = unwrap(res) || [];
        var cats = Array.isArray(raw) ? raw : (raw.data || []);
        self.categories = cats.filter(function (c) { return c.type === 'expense'; });
        self.populateCategoryDropdowns();
      })
      .catch(function () {});
  };

  SpendSenseRecurringBills.prototype.populateCategoryDropdowns = function () {
    var selectRec = document.getElementById('recurring-category');
    var selectCal = document.getElementById('calendar-category-filter');

    if (selectRec) {
      selectRec.innerHTML = '<option value="">Select category…</option>';
      this.categories.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name + (cat.is_default ? ' (Standard)' : '');
        selectRec.appendChild(opt);
      });
    }

    if (selectCal) {
      selectCal.innerHTML = '<option value="all">All categories</option>';
      this.categories.forEach(function (cat) {
        var opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        selectCal.appendChild(opt);
      });
    }
  };

  /* -------------------------------------------------------------
   * Recurring Bills Schedules
   * -----------------------------------------------------------*/

  SpendSenseRecurringBills.prototype.loadSchedules = function () {
    var self = this;
    if (!this.api) return;

    if (this.schedulesState) {
      this.schedulesState.hidden = false;
      this.schedulesState.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading recurring commitments…</p></div>';
    }
    if (this.schedulesTableWrap) this.schedulesTableWrap.hidden = true;

    this.api.get('/recurring-expenses')
      .then(function (res) {
        var data = unwrap(res) || {};
        self.schedules = data.schedules || [];
        var summary = data.summary || {};
        self.renderSchedulesSummary(summary);
        self.renderSchedulesTable();
      })
      .catch(function (err) {
        if (self.schedulesState) {
          self.schedulesState.hidden = false;
          self.schedulesState.innerHTML = '<div class="state error"><p>' + escapeHtml(err.message || 'Failed to load recurring bills.') + '</p><button type="button" class="btn secondary sm" id="retry-schedules-btn">Retry</button></div>';
          var retryBtn = document.getElementById('retry-schedules-btn');
          if (retryBtn) retryBtn.addEventListener('click', function () { self.loadSchedules(); });
        }
      });
  };

  SpendSenseRecurringBills.prototype.renderSchedulesSummary = function (summary) {
    if (this.statMonthly) {
      this.statMonthly.textContent = formatCurrency(summary.monthly_equivalent_total || 0);
    }
    if (this.statAnnual) {
      this.statAnnual.textContent = formatCurrency(summary.annual_equivalent_total || 0);
    }
    if (this.statActive) {
      this.statActive.textContent = (summary.active_count || 0) + ' active';
    }
    if (this.statUpcoming) {
      this.statUpcoming.textContent = formatCurrency(summary.unpaid_total || 0);
    }
    if (this.statOverdue) {
      this.statOverdue.textContent = formatCurrency(summary.overdue_total || 0);
    }
  };

  SpendSenseRecurringBills.prototype.renderSchedulesTable = function () {
    var self = this;
    if (!this.schedulesTableBody) return;

    var filtered = this.schedules.filter(function (s) {
      if (self.filterStatus !== 'all' && s.status !== self.filterStatus) return false;
      if (self.filterFrequency !== 'all' && s.frequency !== self.filterFrequency) return false;
      if (self.searchQuery) {
        var desc = (s.description || '').toLowerCase();
        var cat = (s.category && s.category.name ? s.category.name : '').toLowerCase();
        if (desc.indexOf(self.searchQuery) === -1 && cat.indexOf(self.searchQuery) === -1) return false;
      }
      return true;
    });

    if (this.schedulesState) {
      if (filtered.length === 0) {
        this.schedulesState.hidden = false;
        var msg = this.schedules.length === 0
          ? 'No recurring payment commitments found. Add your subscriptions or predictable bills to track them.'
          : 'No recurring bills match the selected filters.';
        this.schedulesState.innerHTML = '<div class="state empty"><p>' + escapeHtml(msg) + '</p>' +
          (this.schedules.length === 0 ? '<button type="button" class="btn primary sm" id="empty-add-recurring-btn">+ Add recurring bill</button>' : '') + '</div>';

        var emptyAdd = document.getElementById('empty-add-recurring-btn');
        if (emptyAdd) emptyAdd.addEventListener('click', function () { self.openRecurringModal(); });

        if (this.schedulesTableWrap) this.schedulesTableWrap.hidden = true;
        return;
      } else {
        this.schedulesState.hidden = true;
      }
    }

    if (this.schedulesTableWrap) this.schedulesTableWrap.hidden = false;
    this.schedulesTableBody.innerHTML = '';

    filtered.forEach(function (s) {
      var tr = document.createElement('tr');

      // Description & Category
      var tdDesc = document.createElement('td');
      tdDesc.className = 'cell-wrap';
      var dMain = document.createElement('div');
      dMain.className = 'cell-main';
      dMain.textContent = s.description;
      tdDesc.appendChild(dMain);

      var catName = s.category && s.category.name ? s.category.name : 'Uncategorized';
      var dSub = document.createElement('div');
      dSub.className = 'cell-sub';
      dSub.textContent = catName;
      tdDesc.appendChild(dSub);
      tr.appendChild(tdDesc);

      // Amount & Frequency
      var tdAmt = document.createElement('td');
      tdAmt.className = 'num col-tight';
      var aMain = document.createElement('div');
      aMain.className = 'amount-neg';
      aMain.textContent = formatCurrency(s.amount);
      tdAmt.appendChild(aMain);

      var aFreq = document.createElement('div');
      aFreq.className = 'cell-sub';
      aFreq.textContent = formatFrequency(s.frequency);
      tdAmt.appendChild(aFreq);
      tr.appendChild(tdAmt);

      // Estimates (Monthly / Annual)
      var tdEst = document.createElement('td');
      tdEst.className = 'num col-tight';
      var mEst = document.createElement('div');
      mEst.textContent = formatCurrency(s.monthly_equivalent) + '/mo';
      tdEst.appendChild(mEst);
      var yEst = document.createElement('div');
      yEst.className = 'cell-sub';
      yEst.textContent = formatCurrency(s.annual_equivalent) + '/yr';
      tdEst.appendChild(yEst);
      tr.appendChild(tdEst);

      // Next due date
      var tdNext = document.createElement('td');
      tdNext.className = 'col-tight';
      if (s.status === 'stopped') {
        tdNext.textContent = 'Cancelled';
      } else if (s.next_due_date) {
        tdNext.textContent = formatDate(s.next_due_date);
      } else {
        tdNext.textContent = 'None pending';
      }
      tr.appendChild(tdNext);

      // Status badge
      var tdStatus = document.createElement('td');
      tdStatus.className = 'col-tight';
      var sPill = document.createElement('span');
      sPill.className = 'pill ' + (s.status === 'active' ? 'status-paid' : (s.status === 'paused' ? 'status-upcoming' : 'status-skipped'));
      sPill.textContent = s.status.charAt(0).toUpperCase() + s.status.slice(1);
      tdStatus.appendChild(sPill);
      tr.appendChild(tdStatus);

      // Actions
      var tdActions = document.createElement('td');
      tdActions.className = 'col-tight text-right';
      var actWrap = document.createElement('div');
      actWrap.style.display = 'flex';
      actWrap.style.gap = '6px';
      actWrap.style.justifyContent = 'flex-end';

      // Occurrences view
      var occBtn = document.createElement('button');
      occBtn.type = 'button';
      occBtn.className = 'btn ghost sm';
      occBtn.textContent = 'Occurrences';
      occBtn.title = 'View schedule occurrences';
      occBtn.addEventListener('click', function () { self.openOccurrencesModal(s); });
      actWrap.appendChild(occBtn);

      // Edit (only if not stopped)
      if (s.status !== 'stopped') {
        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn ghost sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function () { self.openRecurringModal(s); });
        actWrap.appendChild(editBtn);

        // Pause / Resume
        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn ghost sm';
        toggleBtn.textContent = s.status === 'active' ? 'Pause' : 'Resume';
        toggleBtn.addEventListener('click', function () { self.toggleScheduleStatus(s); });
        actWrap.appendChild(toggleBtn);

        // Cancel / Stop
        var stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.className = 'btn ghost sm';
        stopBtn.textContent = 'Cancel';
        stopBtn.style.color = 'var(--danger, #EF4444)';
        stopBtn.addEventListener('click', function () { self.stopSchedule(s); });
        actWrap.appendChild(stopBtn);
      }

      tdActions.appendChild(actWrap);
      tr.appendChild(tdActions);

      self.schedulesTableBody.appendChild(tr);
    });
  };

  SpendSenseRecurringBills.prototype.toggleScheduleStatus = function (schedule) {
    var self = this;
    if (!this.api) return;

    var action = schedule.status === 'active' ? 'pause' : 'resume';
    this.api.post('/recurring-expenses/' + schedule.id + '/' + action)
      .then(function () {
        self.loadSchedules();
      })
      .catch(function (err) {
        alert(err.message || 'Failed to update schedule status.');
      });
  };

  SpendSenseRecurringBills.prototype.stopSchedule = function (schedule) {
    var self = this;
    if (!this.api) return;

    if (!confirm('Are you sure you want to cancel "' + schedule.description + '"? Future scheduled occurrences will be cancelled. Past paid expenses will be preserved.')) {
      return;
    }

    this.api.post('/recurring-expenses/' + schedule.id + '/stop')
      .then(function () {
        self.loadSchedules();
      })
      .catch(function (err) {
        alert(err.message || 'Failed to cancel schedule.');
      });
  };

  /* -------------------------------------------------------------
   * Add / Edit Recurring Bill Modal & Preview
   * -----------------------------------------------------------*/

  SpendSenseRecurringBills.prototype.openRecurringModal = function (schedule) {
    this.editingScheduleId = schedule ? schedule.id : null;
    this.modalTitle.textContent = schedule ? 'Edit Recurring Bill' : 'Add Recurring Bill';

    var descInp = document.getElementById('recurring-description');
    var amtInp = document.getElementById('recurring-amount');
    var catInp = document.getElementById('recurring-category');
    var freqInp = document.getElementById('recurring-frequency');
    var startInp = document.getElementById('recurring-start-date');
    var endInp = document.getElementById('recurring-end-date');
    var reminderInp = document.getElementById('recurring-reminder-days');
    var notesInp = document.getElementById('recurring-notes');
    var errorBox = document.getElementById('recurring-form-error');

    if (errorBox) errorBox.hidden = true;

    if (schedule) {
      if (descInp) descInp.value = schedule.description || '';
      if (amtInp) amtInp.value = schedule.amount || '';
      if (catInp) catInp.value = schedule.category_id || '';
      if (freqInp) freqInp.value = schedule.frequency || 'monthly';
      if (startInp) startInp.value = schedule.start_date || '';
      if (endInp) endInp.value = schedule.end_date || '';
      if (reminderInp) reminderInp.value = schedule.reminder_days_before !== undefined ? schedule.reminder_days_before : 3;
      if (notesInp) notesInp.value = schedule.notes || '';
    } else {
      if (descInp) descInp.value = '';
      if (amtInp) amtInp.value = '';
      if (catInp) catInp.value = '';
      if (freqInp) freqInp.value = 'monthly';
      if (startInp) startInp.value = new Date().toISOString().slice(0, 10);
      if (endInp) endInp.value = '';
      if (reminderInp) reminderInp.value = 3;
      if (notesInp) notesInp.value = '';
    }

    this.recurringModal.hidden = false;
    this.triggerPreview();

    if (descInp) descInp.focus();
  };

  SpendSenseRecurringBills.prototype.closeRecurringModal = function () {
    if (this.recurringModal) this.recurringModal.hidden = true;
    this.editingScheduleId = null;
  };

  SpendSenseRecurringBills.prototype.triggerPreview = function () {
    var self = this;
    if (!this.previewBox || !this.api) return;

    var freqInp = document.getElementById('recurring-frequency');
    var amtInp = document.getElementById('recurring-amount');
    var startInp = document.getElementById('recurring-start-date');
    var endInp = document.getElementById('recurring-end-date');

    var frequency = freqInp ? freqInp.value : 'monthly';
    var amount = amtInp ? amtInp.value : '';
    var startDate = startInp ? startInp.value : '';
    var endDate = endInp ? endInp.value : null;

    if (!amount || parseFloat(amount) <= 0 || !startDate) {
      this.previewBox.hidden = true;
      return;
    }

    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(function () {
      self.api.post('/recurring-expenses/preview', {
        frequency: frequency,
        amount: amount,
        start_date: startDate,
        end_date: endDate || null
      }).then(function (res) {
        var p = unwrap(res);
        if (!p) return;
        self.previewBox.hidden = false;
        self.previewBox.innerHTML =
          '<strong>Schedule Projection:</strong> ' + p.count + ' occurrences planned (' +
          formatDate(p.start_date) + ' to ' + formatDate(p.end_date) + ') — Total planned commitment: ' +
          formatCurrency(p.total_expected);
      }).catch(function () {
        self.previewBox.hidden = true;
      });
    }, 250);
  };

  SpendSenseRecurringBills.prototype.handleRecurringSubmit = function () {
    var self = this;
    if (!this.api) return;

    var descInp = document.getElementById('recurring-description');
    var amtInp = document.getElementById('recurring-amount');
    var catInp = document.getElementById('recurring-category');
    var freqInp = document.getElementById('recurring-frequency');
    var startInp = document.getElementById('recurring-start-date');
    var endInp = document.getElementById('recurring-end-date');
    var reminderInp = document.getElementById('recurring-reminder-days');
    var notesInp = document.getElementById('recurring-notes');
    var errorBox = document.getElementById('recurring-form-error');
    var submitBtn = document.getElementById('save-recurring-btn');

    if (errorBox) errorBox.hidden = true;

    var payload = {
      description: descInp ? descInp.value.trim() : '',
      amount: amtInp ? amtInp.value : '',
      category_id: catInp ? parseInt(catInp.value, 10) : null,
      frequency: freqInp ? freqInp.value : 'monthly',
      start_date: startInp ? startInp.value : '',
      end_date: endInp && endInp.value ? endInp.value : null,
      reminder_days_before: reminderInp ? parseInt(reminderInp.value, 10) : 3,
      notes: notesInp ? notesInp.value.trim() : null
    };

    if (!payload.description) {
      this.showModalError('Please enter a description for the bill.');
      return;
    }
    if (!payload.amount || parseFloat(payload.amount) <= 0) {
      this.showModalError('Please enter an amount greater than zero.');
      return;
    }
    if (!payload.category_id) {
      this.showModalError('Please select an expense category.');
      return;
    }
    if (!payload.start_date) {
      this.showModalError('Please select a start date.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
    }

    var request = this.editingScheduleId
      ? this.api.put('/recurring-expenses/' + this.editingScheduleId, payload)
      : this.api.post('/recurring-expenses', payload);

    request
      .then(function () {
        self.closeRecurringModal();
        self.loadSchedules();
        if (self.activeTab === 'calendar') self.loadCalendar();
      })
      .catch(function (err) {
        self.showModalError(err.message || 'Failed to save recurring bill.');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Recurring Bill';
        }
      });
  };

  SpendSenseRecurringBills.prototype.showModalError = function (msg) {
    var errorBox = document.getElementById('recurring-form-error');
    if (errorBox) {
      errorBox.hidden = false;
      errorBox.textContent = msg;
    }
  };

  /* -------------------------------------------------------------
   * Occurrences History & Management
   * -----------------------------------------------------------*/

  SpendSenseRecurringBills.prototype.openOccurrencesModal = function (schedule) {
    var self = this;
    if (!this.api || !this.occurrencesModal) return;

    this.occurrencesTitle.textContent = 'Occurrences for: ' + schedule.description;
    this.occurrencesList.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading occurrences…</p></div>';
    this.occurrencesModal.hidden = false;

    this.api.get('/recurring-expenses/' + schedule.id + '/occurrences')
      .then(function (res) {
        var payload = unwrap(res) || {};
        var occurrences = payload.occurrences || [];
        self.renderOccurrencesList(schedule, occurrences);
      })
      .catch(function (err) {
        self.occurrencesList.innerHTML = '<div class="state error"><p>' + escapeHtml(err.message || 'Failed to load occurrences.') + '</p></div>';
      });
  };

  SpendSenseRecurringBills.prototype.closeOccurrencesModal = function () {
    if (this.occurrencesModal) this.occurrencesModal.hidden = true;
  };

  SpendSenseRecurringBills.prototype.renderOccurrencesList = function (schedule, occurrences) {
    var self = this;
    if (!this.occurrencesList) return;

    if (occurrences.length === 0) {
      this.occurrencesList.innerHTML = '<div class="state empty"><p>No occurrences found for this schedule.</p></div>';
      return;
    }

    var html = '<table class="table"><thead><tr>' +
      '<th>Due Date</th>' +
      '<th>Expected Amount</th>' +
      '<th>Status</th>' +
      '<th>Actual Payment</th>' +
      '<th class="text-right">Actions</th>' +
      '</tr></thead><tbody>';

    occurrences.forEach(function (occ) {
      var statusBadge = '';
      if (occ.status === 'paid') {
        statusBadge = '<span class="pill status-paid">Paid</span>';
      } else if (occ.is_overdue) {
        statusBadge = '<span class="pill status-overdue">Overdue</span>';
      } else if (occ.is_due) {
        statusBadge = '<span class="pill status-due">Due Today</span>';
      } else if (occ.status === 'skipped') {
        statusBadge = '<span class="pill status-skipped">Skipped</span>';
      } else {
        statusBadge = '<span class="pill status-upcoming">Planned</span>';
      }

      var actualInfo = occ.actual_amount ? formatCurrency(occ.actual_amount) + ' on ' + formatDate(occ.payment_date) : '—';

      var actionsHtml = '';
      if (occ.can_pay) {
        actionsHtml += '<button type="button" class="btn primary sm" data-occ-pay="' + occ.id + '" data-sched-id="' + schedule.id + '" data-amt="' + occ.expected_amount + '" data-date="' + occ.occurrence_date + '">Pay</button> ';
        actionsHtml += '<button type="button" class="btn secondary sm" data-occ-skip="' + occ.id + '" data-sched-id="' + schedule.id + '">Skip</button>';
      } else if (occ.can_mark_unpaid) {
        actionsHtml += '<button type="button" class="btn ghost sm" data-occ-unpaid="' + occ.id + '" data-sched-id="' + schedule.id + '">Un-skip</button>';
      }

      html += '<tr>' +
        '<td><strong>' + formatDate(occ.occurrence_date) + '</strong></td>' +
        '<td class="num">' + formatCurrency(occ.expected_amount) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actualInfo + '</td>' +
        '<td class="text-right">' + actionsHtml + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    this.occurrencesList.innerHTML = html;

    // Bind action buttons
    this.occurrencesList.querySelectorAll('[data-occ-pay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.openPayModal(
          parseInt(btn.getAttribute('data-sched-id'), 10),
          parseInt(btn.getAttribute('data-occ-pay'), 10),
          schedule.description,
          btn.getAttribute('data-amt'),
          btn.getAttribute('data-date')
        );
      });
    });

    this.occurrencesList.querySelectorAll('[data-occ-skip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.skipOccurrence(
          parseInt(btn.getAttribute('data-sched-id'), 10),
          parseInt(btn.getAttribute('data-occ-skip'), 10),
          schedule
        );
      });
    });

    this.occurrencesList.querySelectorAll('[data-occ-unpaid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.unskipOccurrence(
          parseInt(btn.getAttribute('data-sched-id'), 10),
          parseInt(btn.getAttribute('data-occ-unpaid'), 10),
          schedule
        );
      });
    });
  };

  SpendSenseRecurringBills.prototype.skipOccurrence = function (scheduleId, occurrenceId, schedule) {
    var self = this;
    if (!this.api) return;

    this.api.post('/recurring-expenses/' + scheduleId + '/occurrences/' + occurrenceId + '/skip')
      .then(function () {
        self.openOccurrencesModal(schedule);
        if (self.activeTab === 'calendar') self.loadCalendar();
        self.loadSchedules();
      })
      .catch(function (err) {
        alert(err.message || 'Failed to skip occurrence.');
      });
  };

  SpendSenseRecurringBills.prototype.unskipOccurrence = function (scheduleId, occurrenceId, schedule) {
    var self = this;
    if (!this.api) return;

    this.api.post('/recurring-expenses/' + scheduleId + '/occurrences/' + occurrenceId + '/unpaid')
      .then(function () {
        self.openOccurrencesModal(schedule);
        if (self.activeTab === 'calendar') self.loadCalendar();
        self.loadSchedules();
      })
      .catch(function (err) {
        alert(err.message || 'Failed to un-skip occurrence.');
      });
  };

  /* -------------------------------------------------------------
   * Pay Occurrence Flow (Creates Actual Expense)
   * -----------------------------------------------------------*/

  SpendSenseRecurringBills.prototype.openPayModal = function (scheduleId, occurrenceId, desc, expectedAmt, scheduledDate) {
    this.payingScheduleId = scheduleId;
    this.payingOccurrenceId = occurrenceId;

    var title = document.getElementById('pay-bill-title');
    var descEl = document.getElementById('pay-bill-desc');
    var amtInp = document.getElementById('pay-bill-amount');
    var dateInp = document.getElementById('pay-bill-date');
    var errBox = document.getElementById('pay-bill-error');

    if (title) title.textContent = 'Record Bill Payment';
    if (descEl) descEl.textContent = desc + ' (Scheduled: ' + formatDate(scheduledDate) + ')';
    if (amtInp) amtInp.value = expectedAmt || '';
    if (dateInp) dateInp.value = new Date().toISOString().slice(0, 10);
    if (errBox) errBox.hidden = true;

    if (this.payModal) this.payModal.hidden = false;
    if (amtInp) amtInp.focus();
  };

  SpendSenseRecurringBills.prototype.closePayModal = function () {
    if (this.payModal) this.payModal.hidden = true;
    this.payingScheduleId = null;
    this.payingOccurrenceId = null;
  };

  SpendSenseRecurringBills.prototype.handlePaySubmit = function () {
    var self = this;
    if (!this.api || !this.payingScheduleId || !this.payingOccurrenceId) return;

    var amtInp = document.getElementById('pay-bill-amount');
    var dateInp = document.getElementById('pay-bill-date');
    var errBox = document.getElementById('pay-bill-error');
    var submitBtn = document.getElementById('confirm-pay-bill-btn');

    if (errBox) errBox.hidden = true;

    var actualAmount = amtInp ? amtInp.value : '';
    var paymentDate = dateInp ? dateInp.value : '';

    if (!actualAmount || parseFloat(actualAmount) <= 0) {
      if (errBox) { errBox.hidden = false; errBox.textContent = 'Please enter a valid payment amount.'; }
      return;
    }

    if (!paymentDate) {
      if (errBox) { errBox.hidden = false; errBox.textContent = 'Please choose a payment date.'; }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Recording…';
    }

    this.api.post(
      '/recurring-expenses/' + this.payingScheduleId + '/occurrences/' + this.payingOccurrenceId + '/pay',
      {
        actual_amount: actualAmount,
        paid_date: paymentDate
      }
    )
      .then(function () {
        self.closePayModal();
        self.closeOccurrencesModal();
        self.loadSchedules();
        if (self.activeTab === 'calendar') self.loadCalendar();
        // If on All Expenses view, refresh the expenses list
        if (window.loadExpenses) window.loadExpenses();
      })
      .catch(function (err) {
        if (errBox) {
          errBox.hidden = false;
          errBox.textContent = err.message || 'Failed to record bill payment.';
        }
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm Payment';
        }
      });
  };

  /* -------------------------------------------------------------
   * Bill Calendar Implementation
   * -----------------------------------------------------------*/

  SpendSenseRecurringBills.prototype.changeMonth = function (delta) {
    var parts = this.currentMonth.split('-');
    var yr = parseInt(parts[0], 10);
    var mo = parseInt(parts[1], 10) + delta;

    if (mo < 1) {
      mo = 12;
      yr -= 1;
    } else if (mo > 12) {
      mo = 1;
      yr += 1;
    }

    this.currentMonth = yr + '-' + (mo < 10 ? '0' + mo : mo);
    this.selectedDate = this.currentMonth + '-01';
    this.loadCalendar();
  };

  SpendSenseRecurringBills.prototype.setCalendarViewMode = function (mode) {
    this.calendarViewMode = mode;
    if (this.calToggleGrid) {
      this.calToggleGrid.classList.toggle('active', mode === 'grid');
      this.calToggleGrid.setAttribute('aria-pressed', mode === 'grid');
    }
    if (this.calToggleList) {
      this.calToggleList.classList.toggle('active', mode === 'list');
      this.calToggleList.setAttribute('aria-pressed', mode === 'list');
    }

    if (this.calGrid) this.calGrid.hidden = mode !== 'grid';
    if (this.calListWrap) this.calListWrap.hidden = mode !== 'list';
  };

  SpendSenseRecurringBills.prototype.loadCalendar = function () {
    var self = this;
    if (!this.api) return;

    if (this.calState) {
      this.calState.hidden = false;
      this.calState.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading bill calendar…</p></div>';
    }

    var url = '/recurring-expenses/calendar?month=' + this.currentMonth;
    if (this.calendarStatusFilter && this.calendarStatusFilter !== 'all') {
      url += '&status=' + encodeURIComponent(this.calendarStatusFilter);
    }
    if (this.calendarCategoryFilter && this.calendarCategoryFilter !== 'all') {
      url += '&category_id=' + encodeURIComponent(this.calendarCategoryFilter);
    }

    this.api.get(url)
      .then(function (res) {
        var data = unwrap(res);
        if (!data) return;
        self.calendarData = data;
        if (self.calState) self.calState.hidden = true;
        self.renderCalendar();
      })
      .catch(function (err) {
        if (self.calState) {
          self.calState.hidden = false;
          self.calState.innerHTML = '<div class="state error"><p>' + escapeHtml(err.message || 'Failed to load bill calendar.') + '</p><button type="button" class="btn secondary sm" id="retry-cal-btn">Retry</button></div>';
          var retry = document.getElementById('retry-cal-btn');
          if (retry) retry.addEventListener('click', function () { self.loadCalendar(); });
        }
      });
  };

  SpendSenseRecurringBills.prototype.renderCalendar = function () {
    var data = this.calendarData;
    if (!data) return;

    if (this.calMonthHeading) {
      this.calMonthHeading.textContent = data.month_label || this.currentMonth;
    }

    // Render calendar statistics
    var summary = data.summary || {};
    if (this.calStatExpected) this.calStatExpected.textContent = formatCurrency(summary.expected_total || 0);
    if (this.calStatPaid) this.calStatPaid.textContent = formatCurrency(summary.paid_total || 0);
    if (this.calStatUnpaid) this.calStatUnpaid.textContent = formatCurrency(summary.unpaid_total || 0);
    if (this.calStatOverdue) this.calStatOverdue.textContent = formatCurrency(summary.overdue_total || 0);

    // Group entries by date
    var entriesByDate = {};
    (data.entries || []).forEach(function (entry) {
      var d = entry.occurrence_date;
      if (!entriesByDate[d]) entriesByDate[d] = [];
      entriesByDate[d].push(entry);
    });

    this.renderCalendarGrid(data, entriesByDate);
    this.renderCalendarListView(data);
    this.renderDayPanel(entriesByDate[this.selectedDate] || [], this.selectedDate);
  };

  SpendSenseRecurringBills.prototype.renderCalendarGrid = function (data, entriesByDate) {
    var self = this;
    if (!this.calGrid) return;

    this.calGrid.innerHTML = '';

    // Weekday headers (Monday through Sunday)
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach(function (day) {
      var dHead = document.createElement('div');
      dHead.className = 'calendar-weekday';
      dHead.textContent = day;
      self.calGrid.appendChild(dHead);
    });

    var firstWeekday = data.first_weekday || 1; // 1 = Monday, 7 = Sunday
    var daysInMonth = data.days_in_month || 30;
    var todayIso = new Date().toISOString().slice(0, 10);

    // Empty cells before first day
    for (var i = 1; i < firstWeekday; i++) {
      var emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-day other-month';
      self.calGrid.appendChild(emptyCell);
    }

    // Days in current month
    for (var dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      var dateStr = this.currentMonth + '-' + (dayNum < 10 ? '0' + dayNum : dayNum);
      var dayEntries = entriesByDate[dateStr] || [];

      var cell = document.createElement('div');
      cell.className = 'calendar-day' +
        (dateStr === todayIso ? ' today' : '') +
        (dateStr === this.selectedDate ? ' selected' : '');
      cell.setAttribute('data-calendar-date', dateStr);
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', dateStr + (dayEntries.length > 0 ? ', ' + dayEntries.length + ' bills' : ''));

      var head = document.createElement('div');
      head.className = 'calendar-day-header';
      var numSpan = document.createElement('span');
      numSpan.className = 'calendar-day-num';
      numSpan.textContent = dayNum;
      head.appendChild(numSpan);

      if (dayEntries.length > 0) {
        var countBadge = document.createElement('span');
        countBadge.className = 'calendar-day-count';
        countBadge.textContent = dayEntries.length;
        head.appendChild(countBadge);
      }
      cell.appendChild(head);

      // Render pill preview of up to 2 bills
      var maxPills = 2;
      for (var p = 0; p < Math.min(dayEntries.length, maxPills); p++) {
        var item = dayEntries[p];
        var pill = document.createElement('div');
        pill.className = 'calendar-bill-pill status-' + (item.display_status || item.status);
        var title = (item.schedule ? item.schedule.description : 'Bill');
        pill.innerHTML = '<span>' + escapeHtml(title) + '</span><strong>' + formatCurrency(item.expected_amount) + '</strong>';
        cell.appendChild(pill);
      }

      if (dayEntries.length > maxPills) {
        var more = document.createElement('div');
        more.className = 'cell-sub';
        more.style.fontSize = '0.68rem';
        more.style.marginTop = '2px';
        more.textContent = '+' + (dayEntries.length - maxPills) + ' more';
        cell.appendChild(more);
      }

      (function (curDate, curEntries) {
        cell.addEventListener('click', function () {
          self.selectCalendarDate(curDate, curEntries);
        });
        cell.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            self.selectCalendarDate(curDate, curEntries);
          }
        });
      })(dateStr, dayEntries);

      self.calGrid.appendChild(cell);
    }
  };

  SpendSenseRecurringBills.prototype.selectCalendarDate = function (dateStr, entries) {
    this.selectedDate = dateStr;

    // Update selected class
    if (this.calGrid) {
      this.calGrid.querySelectorAll('.calendar-day').forEach(function (el) {
        el.classList.toggle('selected', el.getAttribute('data-calendar-date') === dateStr);
      });
    }

    this.renderDayPanel(entries, dateStr);
  };

  SpendSenseRecurringBills.prototype.renderDayPanel = function (entries, dateStr) {
    var self = this;
    if (!this.calDayPanel || !this.calDayTitle || !this.calDayList) return;

    this.calDayTitle.textContent = 'Bills Due on ' + formatDate(dateStr);

    if (entries.length === 0) {
      this.calDayList.innerHTML = '<p class="card-sub" style="margin: 8px 0 0;">No bills scheduled for this day.</p>';
      return;
    }

    var html = '<div class="day-bills-list" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">';

    entries.forEach(function (occ) {
      var desc = occ.schedule ? occ.schedule.description : 'Recurring Bill';
      var cat = occ.schedule && occ.schedule.category ? occ.schedule.category.name : 'Bill';
      var freq = occ.schedule ? formatFrequency(occ.schedule.frequency) : '';

      var statusPill = '';
      if (occ.status === 'paid') {
        statusPill = '<span class="pill status-paid">Paid</span>';
      } else if (occ.is_overdue) {
        statusPill = '<span class="pill status-overdue">Overdue</span>';
      } else if (occ.is_due) {
        statusPill = '<span class="pill status-due">Due Today</span>';
      } else if (occ.status === 'skipped') {
        statusPill = '<span class="pill status-skipped">Skipped</span>';
      } else {
        statusPill = '<span class="pill status-upcoming">Planned</span>';
      }

      var actions = '';
      if (occ.can_pay && occ.schedule) {
        actions += '<button type="button" class="btn primary sm" data-cal-pay="' + occ.id + '" data-sched="' + occ.schedule.id + '" data-amt="' + occ.expected_amount + '" data-date="' + occ.occurrence_date + '" data-desc="' + escapeHtml(desc) + '">Record Payment</button> ';
        actions += '<button type="button" class="btn secondary sm" data-cal-skip="' + occ.id + '" data-sched="' + occ.schedule.id + '">Skip</button>';
      } else if (occ.status === 'paid') {
        actions += '<span class="cell-sub">Paid ' + formatCurrency(occ.actual_amount) + ' on ' + formatDate(occ.payment_date) + '</span>';
      }

      html += '<div class="card" style="padding: 12px 14px; margin: 0; background: var(--surface); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">' +
        '<div>' +
        '<div style="font-weight: 600; font-size: 0.95rem;">' + escapeHtml(desc) + '</div>' +
        '<div class="cell-sub">' + escapeHtml(cat) + ' • ' + freq + '</div>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 12px; margin-left: auto;">' +
        '<div style="text-align: right;">' +
        '<div class="amount-neg" style="font-size: 1.05rem;">' + formatCurrency(occ.expected_amount) + '</div>' +
        statusPill +
        '</div>' +
        '<div>' + actions + '</div>' +
        '</div>' +
        '</div>';
    });

    html += '</div>';
    this.calDayList.innerHTML = html;

    // Bind action buttons in day panel
    this.calDayList.querySelectorAll('[data-cal-pay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.openPayModal(
          parseInt(btn.getAttribute('data-sched'), 10),
          parseInt(btn.getAttribute('data-cal-pay'), 10),
          btn.getAttribute('data-desc'),
          btn.getAttribute('data-amt'),
          btn.getAttribute('data-date')
        );
      });
    });

    this.calDayList.querySelectorAll('[data-cal-skip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var schedId = parseInt(btn.getAttribute('data-sched'), 10);
        var occId = parseInt(btn.getAttribute('data-cal-skip'), 10);
        self.api.post('/recurring-expenses/' + schedId + '/occurrences/' + occId + '/skip')
          .then(function () {
            self.loadCalendar();
          })
          .catch(function (err) {
            alert(err.message || 'Failed to skip bill.');
          });
      });
    });
  };

  SpendSenseRecurringBills.prototype.renderCalendarListView = function (data) {
    var self = this;
    if (!this.calListView) return;

    var entries = data.entries || [];
    if (entries.length === 0) {
      this.calListView.innerHTML = '<div class="state empty"><p>No bills found for ' + escapeHtml(data.month_label || this.currentMonth) + '.</p></div>';
      return;
    }

    var html = '<table class="table"><thead><tr>' +
      '<th>Date</th>' +
      '<th>Bill & Category</th>' +
      '<th class="num">Amount</th>' +
      '<th>Status</th>' +
      '<th class="text-right">Actions</th>' +
      '</tr></thead><tbody>';

    entries.forEach(function (occ) {
      var desc = occ.schedule ? occ.schedule.description : 'Bill';
      var cat = occ.schedule && occ.schedule.category ? occ.schedule.category.name : '';

      var statusBadge = '';
      if (occ.status === 'paid') {
        statusBadge = '<span class="pill status-paid">Paid</span>';
      } else if (occ.is_overdue) {
        statusBadge = '<span class="pill status-overdue">Overdue</span>';
      } else if (occ.is_due) {
        statusBadge = '<span class="pill status-due">Due Today</span>';
      } else if (occ.status === 'skipped') {
        statusBadge = '<span class="pill status-skipped">Skipped</span>';
      } else {
        statusBadge = '<span class="pill status-upcoming">Planned</span>';
      }

      var actions = '';
      if (occ.can_pay && occ.schedule) {
        actions = '<button type="button" class="btn primary sm" data-list-pay="' + occ.id + '" data-sched="' + occ.schedule.id + '" data-amt="' + occ.expected_amount + '" data-date="' + occ.occurrence_date + '" data-desc="' + escapeHtml(desc) + '">Pay</button>';
      }

      html += '<tr>' +
        '<td><strong>' + formatDate(occ.occurrence_date) + '</strong></td>' +
        '<td><div><strong>' + escapeHtml(desc) + '</strong></div><div class="cell-sub">' + escapeHtml(cat) + '</div></td>' +
        '<td class="num">' + formatCurrency(occ.expected_amount) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td class="text-right">' + actions + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    this.calListView.innerHTML = html;

    this.calListView.querySelectorAll('[data-list-pay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.openPayModal(
          parseInt(btn.getAttribute('data-sched'), 10),
          parseInt(btn.getAttribute('data-list-pay'), 10),
          btn.getAttribute('data-desc'),
          btn.getAttribute('data-amt'),
          btn.getAttribute('data-date')
        );
      });
    });
  };

  // Expose component to global window
  window.SpendSenseRecurringBills = SpendSenseRecurringBills;

  function boot() {
    if (document.getElementById('view-recurring-bills') || document.getElementById('view-bill-calendar')) {
      window.recurringBillsApp = new SpendSenseRecurringBills();
      window.recurringBillsApp.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
