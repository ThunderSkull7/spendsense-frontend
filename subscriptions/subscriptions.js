/**
 * SpendSense — Subscriptions Standalone Module
 * Manages user subscriptions, renewal countdowns, and recurring expense linkages.
 * Financial Integrity: Never writes to expenses table, never duplicates recurring bills.
 */
'use strict';

(function () {
  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const Subscriptions = {
    subscriptions: [],
    categories: [],
    schedules: [],
    summary: null,
    upcoming: [],
    editingId: null,
    filters: {
      search: '',
      status: '',
      link: ''
    },

    init() {
      this.bindElements();
      this.bindEvents();
      this.loadInitialData();
    },

    bindElements() {
      this.dom = {
        stateContainer: document.getElementById('subscriptions-state-container'),
        tableWrap: document.getElementById('subscriptions-table-wrap'),
        tableBody: document.getElementById('subscriptions-table-body'),
        countLabel: document.getElementById('subscriptions-count-label'),
        statActive: document.getElementById('stat-active-count'),
        statCountsSub: document.getElementById('stat-counts-sub'),
        statMonthly: document.getElementById('stat-monthly-cost'),
        statAnnual: document.getElementById('stat-annual-cost'),
        statDueCount: document.getElementById('stat-due-soon-count'),
        statDueAmount: document.getElementById('stat-due-soon-amount'),
        upcomingBody: document.getElementById('upcoming-renewals-body'),
        upcomingBadge: document.getElementById('upcoming-renewals-badge'),
        // Filter toolbar
        filterForm: document.getElementById('subscription-filter-form'),
        searchFilter: document.getElementById('subscription-search'),
        statusFilter: document.getElementById('subscription-status-filter'),
        linkFilter: document.getElementById('subscription-link-filter'),
        clearFiltersBtn: document.getElementById('subscription-clear-filters'),
        // Modal
        modal: document.getElementById('subscription-modal'),
        modalTitle: document.getElementById('modal-subscription-title'),
        modalSub: document.getElementById('modal-subscription-sub'),
        form: document.getElementById('subscription-form'),
        formId: document.getElementById('sub-form-id'),
        modeContainer: document.getElementById('sub-mode-container'),
        typeStandalone: document.getElementById('sub-type-standalone'),
        typeLinked: document.getElementById('sub-type-linked'),
        linkedSection: document.getElementById('sub-linked-section'),
        standaloneFields: document.getElementById('sub-standalone-fields'),
        recurringExpenseSelect: document.getElementById('sub-recurring-expense-id'),
        nameInput: document.getElementById('sub-name'),
        providerInput: document.getElementById('sub-provider'),
        amountInput: document.getElementById('sub-amount'),
        frequencySelect: document.getElementById('sub-frequency'),
        renewalInput: document.getElementById('sub-renewal-date'),
        categorySelect: document.getElementById('sub-category-id'),
        statusSelect: document.getElementById('sub-status'),
        notesInput: document.getElementById('sub-notes'),
        formError: document.getElementById('sub-form-error'),
        submitBtn: document.getElementById('sub-submit-btn'),
        // Triggers
        openModalBtns: document.querySelectorAll('[data-open-subscription-modal]'),
        closeModalBtns: document.querySelectorAll('[data-close-subscription-modal]'),
        refreshBtn: document.getElementById('refresh-subscriptions-btn')
      };
    },

    bindEvents() {
      // Open / Close modal
      this.dom.openModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.openModal());
      });
      this.dom.closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.closeModal());
      });

      // Close modal on escape or backdrop click
      this.dom.modal?.addEventListener('click', (e) => {
        if (e.target === this.dom.modal) this.closeModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.dom.modal && !this.dom.modal.hidden) {
          this.closeModal();
        }
      });

      // Form submission
      this.dom.form?.addEventListener('submit', (e) => this.handleFormSubmit(e));

      // Link mode radio toggle
      const handleModeChange = () => {
        const isLinked = this.dom.typeLinked.checked;
        this.dom.linkedSection.style.display = isLinked ? 'block' : 'none';
        this.dom.standaloneFields.style.display = isLinked ? 'none' : 'block';
        if (isLinked) {
          this.dom.amountInput.removeAttribute('required');
          this.dom.renewalInput.removeAttribute('required');
          this.dom.recurringExpenseSelect.setAttribute('required', 'required');
        } else {
          this.dom.amountInput.setAttribute('required', 'required');
          this.dom.renewalInput.setAttribute('required', 'required');
          this.dom.recurringExpenseSelect.removeAttribute('required');
        }
      };
      this.dom.typeStandalone?.addEventListener('change', handleModeChange);
      this.dom.typeLinked?.addEventListener('change', handleModeChange);

      // Filters
      let debounceTimer = null;
      this.dom.searchFilter?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filters.search = this.dom.searchFilter.value.trim();
          this.updateClearFilterVisibility();
          this.loadSubscriptions();
        }, 300);
      });

      this.dom.statusFilter?.addEventListener('change', () => {
        this.filters.status = this.dom.statusFilter.value;
        this.updateClearFilterVisibility();
        this.loadSubscriptions();
      });

      this.dom.linkFilter?.addEventListener('change', () => {
        this.filters.link = this.dom.linkFilter.value;
        this.updateClearFilterVisibility();
        this.loadSubscriptions();
      });

      this.dom.clearFiltersBtn?.addEventListener('click', () => {
        this.dom.searchFilter.value = '';
        this.dom.statusFilter.value = '';
        this.dom.linkFilter.value = '';
        this.filters = { search: '', status: '', link: '' };
        this.updateClearFilterVisibility();
        this.loadSubscriptions();
      });

      this.dom.filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.loadSubscriptions();
      });

      // Refresh button
      this.dom.refreshBtn?.addEventListener('click', () => {
        this.loadInitialData();
      });

      // Actions delegation on tables
      this.dom.tableBody?.addEventListener('click', (e) => this.handleTableAction(e));
    },

    updateClearFilterVisibility() {
      const hasActive = Boolean(this.filters.search || this.filters.status || this.filters.link);
      if (this.dom.clearFiltersBtn) {
        this.dom.clearFiltersBtn.style.display = hasActive ? 'inline-block' : 'none';
      }
    },

    async loadInitialData() {
      try {
        await Promise.all([
          this.loadCategories(),
          this.loadRecurringSchedules()
        ]);
        await this.loadSubscriptions();
      } catch (err) {
        console.error('Failed to load initial subscription references:', err);
      }
    },

    async loadCategories() {
      try {
        const { data, status } = await API.get('/categories');
        if (status === 200 && data) {
          const list = Array.isArray(data) ? data : (data.data || []);
          this.categories = list.filter(c => c.type === 'expense');
          this.populateCategoriesDropdown();
        }
      } catch (e) {
        console.warn('Could not load categories:', e);
      }
    },

    populateCategoriesDropdown() {
      if (!this.dom.categorySelect) return;
      this.dom.categorySelect.innerHTML = '<option value="">No category</option>';
      this.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        this.dom.categorySelect.appendChild(opt);
      });
    },

    async loadRecurringSchedules() {
      try {
        const { data, status } = await API.get('/recurring-expenses');
        if (status === 200 && data) {
          const raw = data.data;
          const list = Array.isArray(data)
            ? data
            : (Array.isArray(raw) ? raw : (raw?.schedules || []));
          this.schedules = Array.isArray(list) ? list : [];
          this.populateSchedulesDropdown();
        }
      } catch (e) {
        console.warn('Could not load recurring expense schedules:', e);
      }
    },

    populateSchedulesDropdown(selectedScheduleId = null) {
      if (!this.dom.recurringExpenseSelect) return;
      this.dom.recurringExpenseSelect.innerHTML = '<option value="">-- Choose a recurring bill --</option>';
      const list = Array.isArray(this.schedules) ? this.schedules : [];
      list.forEach(sched => {
        const opt = document.createElement('option');
        opt.value = sched.id;
        const freq = sched.frequency ? ` (${sched.frequency})` : '';
        const amt = sched.amount ? ` - ${UI ? UI.formatMoney(sched.amount) : '₹' + sched.amount}` : '';
        opt.textContent = `${sched.description || sched.name || 'Recurring bill'}${freq}${amt}`;
        if (selectedScheduleId && String(selectedScheduleId) === String(sched.id)) {
          opt.selected = true;
        }
        this.dom.recurringExpenseSelect.appendChild(opt);
      });
    },

    async loadSubscriptions() {
      if (UI) UI.renderState(this.dom.stateContainer, 'loading', { message: 'Loading subscriptions…' });
      this.dom.tableWrap.style.display = 'none';

      try {
        const params = new URLSearchParams();
        if (this.filters.status) params.append('status', this.filters.status);
        if (this.filters.link) params.append('link', this.filters.link);
        if (this.filters.search) params.append('search', this.filters.search);

        const queryStr = params.toString() ? `?${params.toString()}` : '';
        const { data, status } = await API.get(`/subscriptions${queryStr}`);

        if (status === 200 && data && data.success) {
          const payload = data.data || {};
          this.subscriptions = payload.subscriptions || [];
          this.summary = payload.summary || null;
          this.upcoming = payload.upcoming_renewals || [];

          this.renderSummary();
          this.renderSubscriptionsTable();
          this.renderUpcomingRenewals();
        } else {
          const msg = (data && data.message) || 'Could not load subscriptions.';
          if (UI) {
            UI.renderState(this.dom.stateContainer, 'error', {
              message: msg,
              retry: () => this.loadSubscriptions()
            });
          }
        }
      } catch (err) {
        if (UI) {
          UI.renderState(this.dom.stateContainer, 'error', {
            message: 'Network error loading subscriptions. Please try again.',
            retry: () => this.loadSubscriptions()
          });
        }
      }
    },

    renderSummary() {
      const s = this.summary;
      if (!s) return;

      const formatVal = (v) => UI ? UI.formatMoney(v || 0) : `₹${Number(v || 0).toFixed(2)}`;

      if (this.dom.statActive) this.dom.statActive.textContent = s.active_count ?? 0;
      if (this.dom.statCountsSub) {
        this.dom.statCountsSub.textContent = `${s.linked_count ?? 0} linked, ${s.standalone_count ?? 0} standalone`;
      }
      if (this.dom.statMonthly) this.dom.statMonthly.textContent = formatVal(s.estimated_monthly_cost);
      if (this.dom.statAnnual) this.dom.statAnnual.textContent = formatVal(s.estimated_annual_cost);
      if (this.dom.statDueCount) this.dom.statDueCount.textContent = s.due_within_30_days_count ?? 0;
      if (this.dom.statDueAmount) {
        this.dom.statDueAmount.textContent = `${formatVal(s.due_within_30_days_amount)} estimated`;
      }
    },

    renderSubscriptionsTable() {
      const items = this.subscriptions;

      if (!items.length) {
        this.dom.tableWrap.style.display = 'none';
        const emptyMsg = this.filters.search || this.filters.status || this.filters.link
          ? 'No subscriptions match your active filters.'
          : 'No subscriptions tracked yet. Add your first subscription to track renewals.';
        if (UI) UI.renderState(this.dom.stateContainer, 'empty', { message: emptyMsg });
        if (this.dom.countLabel) this.dom.countLabel.textContent = '0 subscriptions';
        return;
      }

      this.dom.stateContainer.replaceChildren();
      this.dom.tableWrap.style.display = 'block';
      if (this.dom.countLabel) {
        const count = items.length;
        this.dom.countLabel.textContent = `${count} ${count === 1 ? 'subscription' : 'subscriptions'}`;
      }

      const rowsHtml = items.map(item => {
        const nameEsc = this.escapeHtml(item.name);
        const providerEsc = item.provider ? `<div style="font-size: 0.78rem; color: var(--muted);">${this.escapeHtml(item.provider)}</div>` : '';
        const linkBadge = item.is_linked
          ? `<span class="pill primary" title="Linked to Recurring Bill #${item.recurring_expense_id}">Linked Bill</span>`
          : `<span class="pill neutral">Standalone</span>`;
        const catName = item.category?.name ? this.escapeHtml(item.category.name) : '<span style="color: var(--muted);">—</span>';
        const freq = this.escapeHtml(item.frequency_label || item.frequency || 'Monthly');
        const amountFmt = UI ? UI.formatMoney(item.amount) : `₹${item.amount}`;
        const monthlyFmt = UI ? UI.formatMoney(item.monthly_cost) : `₹${item.monthly_cost}`;

        // Renewal countdown badge
        let renewalHtml = '<span style="color: var(--muted);">—</span>';
        if (item.next_renewal_date) {
          const dateStr = UI ? UI.formatDate(item.next_renewal_date) : item.next_renewal_date;
          let badgeTag = '';
          if (item.is_overdue) {
            badgeTag = `<span class="pill danger" style="margin-left: 6px; font-size: 0.7rem;">Overdue</span>`;
          } else {
            const days = this.daysUntil(item.next_renewal_date);
            if (days === 0) {
              badgeTag = `<span class="pill warn" style="margin-left: 6px; font-size: 0.7rem;">Due today</span>`;
            } else if (days === 1) {
              badgeTag = `<span class="pill warn" style="margin-left: 6px; font-size: 0.7rem;">Due tomorrow</span>`;
            } else if (days > 1 && days <= 7) {
              badgeTag = `<span class="pill warn" style="margin-left: 6px; font-size: 0.7rem;">in ${days}d</span>`;
            } else if (days > 7) {
              badgeTag = `<span class="pill neutral" style="margin-left: 6px; font-size: 0.7rem;">in ${days}d</span>`;
            }
          }
          renewalHtml = `<div>${dateStr}${badgeTag}</div>`;
        }

        // Status badge
        let statusBadge = `<span class="pill success">Active</span>`;
        if (item.effective_status === 'paused') {
          statusBadge = `<span class="pill warn">Paused</span>`;
        } else if (item.effective_status === 'cancelled') {
          statusBadge = `<span class="pill neutral">Cancelled</span>`;
        }

        // Action toggles
        const toggleBtnLabel = item.status === 'active' ? 'Pause' : 'Resume';
        const toggleBtnStatus = item.status === 'active' ? 'paused' : 'active';

        return `
          <tr data-sub-id="${item.id}">
            <td>
              <div style="font-weight: 600; color: var(--ink);">${nameEsc}</div>
              ${providerEsc}
            </td>
            <td class="col-tight">${linkBadge}</td>
            <td>${catName}</td>
            <td class="col-tight" style="text-transform: capitalize;">${freq}</td>
            <td class="num col-tight" style="font-weight: 600;">${amountFmt}</td>
            <td class="num col-tight" style="color: var(--muted);">${monthlyFmt}</td>
            <td>${renewalHtml}</td>
            <td class="col-tight">${statusBadge}</td>
            <td class="col-tight text-right">
              <div style="display: inline-flex; gap: 4px;">
                <button type="button" class="btn secondary sm" data-action="edit" data-id="${item.id}">Edit</button>
                <button type="button" class="btn ghost sm" data-action="toggle-status" data-id="${item.id}" data-target-status="${toggleBtnStatus}">${toggleBtnLabel}</button>
                ${item.status !== 'cancelled' ? `<button type="button" class="btn ghost sm" style="color: var(--danger);" data-action="cancel" data-id="${item.id}">Cancel</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

      this.dom.tableBody.innerHTML = rowsHtml;
    },

    renderUpcomingRenewals() {
      const items = this.upcoming;
      if (this.dom.upcomingBadge) {
        this.dom.upcomingBadge.textContent = String(items.length);
      }

      if (!items.length) {
        this.dom.upcomingBody.innerHTML = `
          <tr><td colspan="6" class="cell-sub" style="text-align: center; padding: 20px; color: var(--muted);">No upcoming renewals in the next 60 days.</td></tr>
        `;
        return;
      }

      const rowsHtml = items.map(item => {
        const dateStr = UI ? UI.formatDate(item.next_renewal_date) : item.next_renewal_date;
        const days = item.days_until_renewal ?? this.daysUntil(item.next_renewal_date);
        let badgeTag = '';
        if (days < 0) {
          badgeTag = `<span class="pill danger" style="margin-left: 6px; font-size: 0.7rem;">Overdue</span>`;
        } else if (days === 0) {
          badgeTag = `<span class="pill warn" style="margin-left: 6px; font-size: 0.7rem;">Due today</span>`;
        } else {
          badgeTag = `<span class="pill neutral" style="margin-left: 6px; font-size: 0.7rem;">in ${days}d</span>`;
        }

        const nameEsc = this.escapeHtml(item.name);
        const providerEsc = item.provider ? this.escapeHtml(item.provider) : '—';
        const amountFmt = UI ? UI.formatMoney(item.amount) : `₹${item.amount}`;
        const monthlyFmt = UI ? UI.formatMoney(item.monthly_cost) : `₹${item.monthly_cost}`;
        const statusBadge = item.effective_status === 'active'
          ? `<span class="pill success">Active</span>`
          : `<span class="pill warn">${item.effective_status}</span>`;

        return `
          <tr>
            <td><strong>${dateStr}</strong>${badgeTag}</td>
            <td><span style="font-weight: 600;">${nameEsc}</span></td>
            <td>${providerEsc}</td>
            <td class="num col-tight">${amountFmt}</td>
            <td class="num col-tight">${monthlyFmt}</td>
            <td class="col-tight">${statusBadge}</td>
          </tr>
        `;
      }).join('');

      this.dom.upcomingBody.innerHTML = rowsHtml;
    },

    openModal(subscription = null) {
      this.clearFormError();
      this.dom.form?.reset();
      this.populateSchedulesDropdown();

      if (!subscription) {
        // Create mode
        this.editingId = null;
        this.dom.formId.value = '';
        this.dom.modalTitle.textContent = 'Add Subscription';
        this.dom.modalSub.textContent = 'Track a recurring service plan';
        this.dom.submitBtn.textContent = 'Save Subscription';

        this.dom.modeContainer.style.display = 'block';
        this.dom.typeStandalone.checked = true;
        this.dom.linkedSection.style.display = 'none';
        this.dom.standaloneFields.style.display = 'block';
        this.dom.amountInput.setAttribute('required', 'required');
        this.dom.renewalInput.setAttribute('required', 'required');
        this.dom.recurringExpenseSelect.removeAttribute('required');

        // Set default renewal date to 30 days from today
        const nextMonth = new Date();
        nextMonth.setDate(nextMonth.getDate() + 30);
        this.dom.renewalInput.value = nextMonth.toISOString().split('T')[0];
        this.dom.statusSelect.value = 'active';
      } else {
        // Edit mode
        this.editingId = subscription.id;
        this.dom.formId.value = subscription.id;
        this.dom.modalTitle.textContent = 'Edit Subscription';
        this.dom.modalSub.textContent = `Update tracker details for "${subscription.name}"`;
        this.dom.submitBtn.textContent = 'Save Changes';

        this.dom.nameInput.value = subscription.name || '';
        this.dom.providerInput.value = subscription.provider || '';
        this.dom.statusSelect.value = subscription.status || 'active';
        this.dom.notesInput.value = subscription.notes || '';

        // Linkage is immutable on update per backend rules
        this.dom.modeContainer.style.display = 'none';

        if (subscription.is_linked) {
          this.dom.typeLinked.checked = true;
          this.dom.linkedSection.style.display = 'block';
          this.populateSchedulesDropdown(subscription.recurring_expense_id);
          this.dom.recurringExpenseSelect.disabled = true;
          this.dom.standaloneFields.style.display = 'none';
          this.dom.amountInput.removeAttribute('required');
          this.dom.renewalInput.removeAttribute('required');
        } else {
          this.dom.typeStandalone.checked = true;
          this.dom.linkedSection.style.display = 'none';
          this.dom.standaloneFields.style.display = 'block';
          this.dom.amountInput.value = subscription.amount ? Number(subscription.amount).toFixed(2) : '';
          this.dom.frequencySelect.value = subscription.frequency || 'monthly';
          this.dom.renewalInput.value = subscription.next_renewal_date ? subscription.next_renewal_date.split('T')[0] : '';
          this.dom.categorySelect.value = subscription.category?.id || '';
          this.dom.amountInput.setAttribute('required', 'required');
          this.dom.renewalInput.setAttribute('required', 'required');
        }
      }

      this.dom.modal.hidden = false;
      this.dom.nameInput.focus();
    },

    closeModal() {
      if (this.dom.modal) this.dom.modal.hidden = true;
      this.dom.recurringExpenseSelect.disabled = false;
      this.editingId = null;
      this.clearFormError();
    },

    showFormError(msg) {
      if (!this.dom.formError) return;
      this.dom.formError.textContent = msg;
      this.dom.formError.style.display = 'block';
    },

    clearFormError() {
      if (!this.dom.formError) return;
      this.dom.formError.textContent = '';
      this.dom.formError.style.display = 'none';
    },

    async handleFormSubmit(event) {
      event.preventDefault();
      this.clearFormError();

      const name = this.dom.nameInput.value.trim();
      if (!name) {
        this.showFormError('Subscription name is required.');
        return;
      }

      const isLinked = this.editingId
        ? Boolean(this.subscriptions.find(s => s.id === this.editingId)?.is_linked)
        : this.dom.typeLinked.checked;

      const payload = {
        name,
        provider: this.dom.providerInput.value.trim() || null,
        status: this.dom.statusSelect.value,
        notes: this.dom.notesInput.value.trim() || null
      };

      if (!this.editingId) {
        // Create request
        if (isLinked) {
          const schedId = this.dom.recurringExpenseSelect.value;
          if (!schedId) {
            this.showFormError('Please select an existing recurring bill to link.');
            return;
          }
          payload.recurring_expense_id = Number(schedId);
          // Backend constraint: amount, frequency, renewal date, category must remain undefined/null for linked
        } else {
          const amt = parseFloat(this.dom.amountInput.value);
          if (isNaN(amt) || amt <= 0) {
            this.showFormError('Please enter a valid amount greater than zero.');
            return;
          }
          if (!this.dom.frequencySelect.value) {
            this.showFormError('Please select a billing frequency.');
            return;
          }
          if (!this.dom.renewalInput.value) {
            this.showFormError('Please select the next renewal date.');
            return;
          }
          payload.amount = amt.toFixed(2);
          payload.frequency = this.dom.frequencySelect.value;
          payload.next_renewal_date = this.dom.renewalInput.value;
          payload.category_id = this.dom.categorySelect.value ? Number(this.dom.categorySelect.value) : null;
        }
      } else {
        // Update request
        if (!isLinked) {
          const amt = parseFloat(this.dom.amountInput.value);
          if (isNaN(amt) || amt <= 0) {
            this.showFormError('Please enter a valid amount greater than zero.');
            return;
          }
          if (!this.dom.renewalInput.value) {
            this.showFormError('Please select the next renewal date.');
            return;
          }
          payload.amount = amt.toFixed(2);
          payload.frequency = this.dom.frequencySelect.value;
          payload.next_renewal_date = this.dom.renewalInput.value;
          payload.category_id = this.dom.categorySelect.value ? Number(this.dom.categorySelect.value) : null;
        }
        // Linked updates only send name, provider, status, notes
      }

      this.dom.submitBtn.disabled = true;
      this.dom.submitBtn.textContent = 'Saving…';

      try {
        let res;
        if (this.editingId) {
          res = await API.put(`/subscriptions/${this.editingId}`, payload);
        } else {
          res = await API.post('/subscriptions', payload);
        }

        if (res && (res.status === 200 || res.status === 201) && res.data?.success) {
          const successMsg = this.editingId ? 'Subscription updated successfully.' : 'Subscription created successfully.';
          if (UI) UI.showToast(successMsg, 'success');
          this.closeModal();
          await this.loadSubscriptions();
        } else {
          let errText = (res && res.data && res.data.message) || 'Failed to save subscription.';
          if (res?.data?.errors) {
            const firstErr = Object.values(res.data.errors)[0];
            if (Array.isArray(firstErr) && firstErr[0]) errText = firstErr[0];
          }
          this.showFormError(errText);
        }
      } catch (err) {
        this.showFormError('Network error while saving. Please try again.');
      } finally {
        this.dom.submitBtn.disabled = false;
        this.dom.submitBtn.textContent = this.editingId ? 'Save Changes' : 'Save Subscription';
      }
    },

    async handleTableAction(event) {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const subId = Number(btn.dataset.id);
      const sub = this.subscriptions.find(s => s.id === subId);
      if (!sub) return;

      if (action === 'edit') {
        this.openModal(sub);
      } else if (action === 'toggle-status') {
        const targetStatus = btn.dataset.targetStatus || (sub.status === 'active' ? 'paused' : 'active');
        await this.updateStatus(sub, targetStatus);
      } else if (action === 'cancel') {
        const confirmed = window.confirm(
          `Are you sure you want to cancel the tracker for "${sub.name}"?\n\nNote: This updates your SpendSense record only and does not cancel your membership with ${sub.provider || sub.name}.`
        );
        if (confirmed) {
          await this.updateStatus(sub, 'cancelled');
        }
      }
    },

    async updateStatus(sub, targetStatus) {
      try {
        const { data, status } = await API.put(`/subscriptions/${sub.id}`, { status: targetStatus });
        if (status === 200 && data?.success) {
          const label = targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1);
          if (UI) UI.showToast(`Subscription marked as ${label}.`, 'success');
          await this.loadSubscriptions();
        } else {
          const msg = data?.message || 'Could not update status.';
          if (UI) UI.showToast(msg, 'error');
        }
      } catch (e) {
        if (UI) UI.showToast('Network error updating subscription status.', 'error');
      }
    },

    daysUntil(dateStr) {
      if (!dateStr) return 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr);
      target.setHours(0, 0, 0, 0);
      const diffMs = target.getTime() - today.getTime();
      return Math.round(diffMs / (1000 * 60 * 60 * 24));
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  // Export globally for testability and lifecycle initialization
  window.SpendSenseSubscriptions = Subscriptions;

  document.addEventListener('DOMContentLoaded', () => {
    Subscriptions.init();
  });
})();
