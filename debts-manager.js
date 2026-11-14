/**
 * SpendSense — Debt & Loan Tracker Component (DEBT-01)
 * Manages loan and liability tracking, repayment recording, balance reconciliation,
 * payoff estimates, and accounting boundary separation.
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

  function unwrap(res) {
    if (!res) return null;
    var body = res.data !== undefined ? res.data : res;
    if (body && typeof body === 'object' && body.data !== undefined) return body.data;
    return body;
  }

  function SpendSenseDebts() {
    this.api = window.api || (typeof window.SpendSenseAPI === 'function' ? new window.SpendSenseAPI() : window.SpendSenseAPI) || null;
    this.debts = [];
    this.summary = null;
    this.currentFilter = 'active';
    this.searchQuery = '';
    this.viewMode = 'grid'; // 'grid' or 'list'
  }

  SpendSenseDebts.prototype.init = function () {
    this.bindEvents();
    this.loadDebts();
  };

  SpendSenseDebts.prototype.loadDebts = async function () {
    var self = this;
    var container = document.getElementById('debts-container');
    if (!container) return;

    container.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading debt & loan records…</p></div>';

    try {
      if (!this.api && window.SpendSenseAPI) {
        this.api = window.SpendSenseAPI;
      }
      var res = await this.api.get('/debts');
      var payload = unwrap(res);

      if (payload) {
        self.debts = payload.debts || [];
        self.summary = payload.summary || null;
      } else {
        self.debts = [];
      }

      self.renderSummary();
      self.renderDebts();
    } catch (err) {
      container.innerHTML = '<div class="notice error">Failed to load debt records. Please try again.</div>';
    }
  };

  SpendSenseDebts.prototype.renderSummary = function () {
    if (!this.summary) return;

    var elActive = document.getElementById('debts-stat-active');
    var elPrincipal = document.getElementById('debts-stat-principal');
    var elBalance = document.getElementById('debts-stat-balance');
    var elRepaid = document.getElementById('debts-stat-repaid');

    if (elActive) elActive.textContent = this.summary.active_count ?? 0;
    if (elPrincipal) elPrincipal.textContent = formatCurrency(this.summary.total_original);
    if (elBalance) elBalance.textContent = formatCurrency(this.summary.total_current_balance);
    if (elRepaid) elRepaid.textContent = formatCurrency(this.summary.total_repaid);
  };

  SpendSenseDebts.prototype.renderDebts = function () {
    var self = this;
    var container = document.getElementById('debts-container');
    if (!container) return;

    var filtered = this.debts.filter(function (debt) {
      if (self.currentFilter !== 'all' && debt.status !== self.currentFilter) {
        return false;
      }
      if (self.searchQuery) {
        var q = self.searchQuery.toLowerCase();
        var nameMatch = (debt.name || '').toLowerCase().includes(q);
        var lenderMatch = (debt.lender || debt.institution || '').toLowerCase().includes(q);
        var notesMatch = (debt.notes || '').toLowerCase().includes(q);
        if (!nameMatch && !lenderMatch && !notesMatch) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="state empty">' +
        '<p>No loans or liabilities found for the selected filter.</p>' +
        '<button type="button" class="btn primary sm mt-2" id="create-first-debt-btn">Add your first debt / loan</button>' +
        '</div>';
      var firstBtn = document.getElementById('create-first-debt-btn');
      if (firstBtn) {
        firstBtn.addEventListener('click', function () {
          self.openDebtModal();
        });
      }
      return;
    }

    var html = '';
    if (this.viewMode === 'list') {
      html = '<div class="table-responsive"><table class="data-table" aria-label="Debt and Loan Table">' +
        '<thead><tr>' +
        '<th>Liability Name</th><th>Lender</th><th>Status</th><th>Outstanding / Principal</th><th>Repaid</th><th>Est. Payoff</th><th>Actions</th>' +
        '</tr></thead><tbody>';

      filtered.forEach(function (d) {
        var pct = Math.min(100, Math.max(0, parseFloat(d.repayment_progress_percent) || 0));
        var badgeClass = d.status === 'completed' ? 'badge-success' : (d.status === 'archived' ? 'badge-muted' : 'badge-amber');
        var statusLabel = d.status.charAt(0).toUpperCase() + d.status.slice(1);
        var payoffText = d.payoff_estimate ? d.payoff_estimate.estimated_months_remaining + ' mos' : '—';

        html += '<tr data-debt-id="' + d.id + '">' +
          '<td><strong>' + escapeHtml(d.name) + '</strong>' + (d.notes ? '<br><small class="text-muted">' + escapeHtml(d.notes) + '</small>' : '') + '</td>' +
          '<td>' + escapeHtml(d.lender || d.institution || '—') + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + statusLabel + '</span></td>' +
          '<td><strong>' + formatCurrency(d.current_balance) + '</strong> <span class="text-muted">/ ' + formatCurrency(d.original_principal) + '</span></td>' +
          '<td>' +
            '<div class="progress-bar-wrap" style="width: 100px; display: inline-block; vertical-align: middle; margin-right: 6px;">' +
              '<div class="progress-bar" style="width: ' + pct + '%;"></div>' +
            '</div>' + pct.toFixed(1) + '%' +
          '</td>' +
          '<td>' + payoffText + '</td>' +
          '<td>' +
            (d.status === 'active' ? '<button type="button" class="btn ghost sm action-repay-debt-btn" data-debt-id="' + d.id + '" title="Record Payment">Repay</button> ' : '') +
            '<button type="button" class="btn ghost sm action-edit-debt-btn" data-debt-id="' + d.id + '" title="Edit">Edit</button> ' +
            '<button type="button" class="btn ghost sm action-history-debt-btn" data-debt-id="' + d.id + '" title="History">History</button>' +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      // Grid view
      html = '<div class="grid grid-3" style="gap: 16px;">';
      filtered.forEach(function (d) {
        var pct = Math.min(100, Math.max(0, parseFloat(d.repayment_progress_percent) || 0));
        var badgeClass = d.status === 'completed' ? 'badge-success' : (d.status === 'archived' ? 'badge-muted' : 'badge-amber');
        var statusLabel = d.status.charAt(0).toUpperCase() + d.status.slice(1);

        html += '<article class="card debt-card" data-debt-id="' + d.id + '" style="position: relative; display: flex; flex-direction: column; justify-content: space-between;">' +
          '<div>' +
            '<div class="card-head" style="margin-bottom: 8px;">' +
              '<div>' +
                '<h3 class="card-title" style="font-size: 1.05rem;">' + escapeHtml(d.name) + '</h3>' +
                (d.lender ? '<p class="card-sub">Lender: ' + escapeHtml(d.lender) + '</p>' : '') +
              '</div>' +
              '<span class="badge ' + badgeClass + '">' + statusLabel + '</span>' +
            '</div>' +

            '<div style="margin: 12px 0;">' +
              '<div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">' +
                '<span style="font-size: 1.25rem; font-weight: 700; color: var(--warn, #f59e0b);">' + formatCurrency(d.current_balance) + '</span>' +
                '<span style="font-size: 0.88rem; color: var(--muted);">of ' + formatCurrency(d.original_principal) + '</span>' +
              '</div>' +
              '<div class="progress-bar-wrap" style="height: 8px; background: var(--surface-3, #e5e7eb); border-radius: 4px; overflow: hidden;">' +
                '<div class="progress-bar" style="height: 100%; width: ' + pct + '%; background: var(--teal); border-radius: 4px; transition: width 0.3s ease;"></div>' +
              '</div>' +
              '<div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 0.8rem; color: var(--muted);">' +
                '<span>' + pct.toFixed(1) + '% repaid</span>' +
                '<span>' + formatCurrency(d.repaid_amount) + ' total paid</span>' +
              '</div>' +
            '</div>' +

            '<div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">' +
              (d.interest_rate ? '<div>Interest rate: <strong style="color: var(--ink);">' + d.interest_rate + '% p.a.</strong></div>' : '') +
              (d.minimum_payment ? '<div>Min payment: <strong style="color: var(--ink);">' + formatCurrency(d.minimum_payment) + '</strong></div>' : '') +
              (d.payoff_estimate ? '<div>Payoff projection: <strong style="color: var(--teal);">' + d.payoff_estimate.estimated_months_remaining + ' months</strong> <small>(' + formatDate(d.payoff_estimate.projected_payoff_date) + ')</small></div>' : '') +
              (d.notes ? '<div style="margin-top: 4px; font-style: italic;">"' + escapeHtml(d.notes) + '"</div>' : '') +
            '</div>' +
          '</div>' +

          '<div class="card-actions" style="display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 12px; margin-top: auto;">' +
            (d.status === 'active' ? '<button type="button" class="btn primary sm action-repay-debt-btn" data-debt-id="' + d.id + '">Record Payment</button>' : '') +
            '<button type="button" class="btn ghost sm action-edit-debt-btn" data-debt-id="' + d.id + '">Edit</button>' +
            '<button type="button" class="btn ghost sm action-history-debt-btn" data-debt-id="' + d.id + '">History</button>' +
            (d.status === 'archived' ?
              '<button type="button" class="btn ghost sm action-restore-debt-btn" data-debt-id="' + d.id + '">Restore</button>' :
              '<button type="button" class="btn ghost sm action-archive-debt-btn" data-debt-id="' + d.id + '">Archive</button>') +
          '</div>' +
        '</article>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
  };

  SpendSenseDebts.prototype.bindEvents = function () {
    var self = this;

    // Add Debt trigger
    var addBtn = document.getElementById('add-debt-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        self.openDebtModal();
      });
    }

    // Filter tabs
    var filterBtns = document.querySelectorAll('[data-debt-filter]');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.currentFilter = btn.getAttribute('data-debt-filter') || 'active';
        self.renderDebts();
      });
    });

    // View mode toggle
    var viewBtns = document.querySelectorAll('[data-debt-view-mode]');
    viewBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.viewMode = btn.getAttribute('data-debt-view-mode') || 'grid';
        self.renderDebts();
      });
    });

    // Search input
    var searchInput = document.getElementById('debts-search-input') || document.getElementById('debts-search');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        self.searchQuery = e.target.value.trim();
        self.renderDebts();
      });
    }

    // Status filter select
    var statusSelect = document.getElementById('debts-filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', function (e) {
        self.currentFilter = e.target.value || 'active';
        self.renderDebts();
      });
    }

    // Event delegation on container
    var container = document.getElementById('debts-container');
    if (container) {
      container.addEventListener('click', function (e) {
        var repayBtn = e.target.closest('.action-repay-debt-btn');
        if (repayBtn) {
          var id = parseInt(repayBtn.getAttribute('data-debt-id'), 10);
          self.openRepaymentModal(id);
          return;
        }

        var editBtn = e.target.closest('.action-edit-debt-btn');
        if (editBtn) {
          var eid = parseInt(editBtn.getAttribute('data-debt-id'), 10);
          var debt = self.debts.find(function (d) { return d.id === eid; });
          if (debt) self.openDebtModal(debt);
          return;
        }

        var historyBtn = e.target.closest('.action-history-debt-btn');
        if (historyBtn) {
          var hid = parseInt(historyBtn.getAttribute('data-debt-id'), 10);
          self.openHistoryModal(hid);
          return;
        }

        var archiveBtn = e.target.closest('.action-archive-debt-btn');
        if (archiveBtn) {
          var aid = parseInt(archiveBtn.getAttribute('data-debt-id'), 10);
          self.archiveDebt(aid);
          return;
        }

        var restoreBtn = e.target.closest('.action-restore-debt-btn');
        if (restoreBtn) {
          var rid = parseInt(restoreBtn.getAttribute('data-debt-id'), 10);
          self.restoreDebt(rid);
          return;
        }
      });
    }

    // Modal submit bindings
    var debtForm = document.getElementById('debt-form');
    if (debtForm) {
      debtForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.saveDebt(new FormData(debtForm));
      });
    }

    var repayForm = document.getElementById('debt-repayment-form');
    if (repayForm) {
      repayForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.saveRepayment(new FormData(repayForm));
      });
    }

    // Modal close buttons
    var closeButtons = document.querySelectorAll('[data-close-debt-modal]');
    closeButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        self.closeModals();
      });
    });
  };

  SpendSenseDebts.prototype.openDebtModal = function (debt) {
    var modal = document.getElementById('debt-modal');
    if (!modal) return;

    var title = document.getElementById('debt-modal-title');
    var idInput = document.getElementById('debt-id') || document.getElementById('debt-form-id');
    var nameInput = document.getElementById('debt-name') || document.getElementById('debt-form-name');
    var lenderInput = document.getElementById('debt-lender') || document.getElementById('debt-form-lender');
    var principalInput = document.getElementById('debt-principal') || document.getElementById('debt-form-principal');
    var balanceInput = document.getElementById('debt-balance') || document.getElementById('debt-form-balance');
    var rateInput = document.getElementById('debt-rate') || document.getElementById('debt-form-rate');
    var minPayInput = document.getElementById('debt-minimum-payment') || document.getElementById('debt-form-min-payment');
    var notesInput = document.getElementById('debt-notes') || document.getElementById('debt-form-notes');
    var errorMsg = document.getElementById('debt-form-error');

    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    }

    if (debt) {
      if (title) title.textContent = 'Edit Liability / Loan';
      if (idInput) idInput.value = debt.id;
      if (nameInput) nameInput.value = debt.name || '';
      if (lenderInput) lenderInput.value = debt.lender || debt.institution || '';
      if (principalInput) {
        principalInput.value = debt.original_principal || debt.original_amount || '';
        principalInput.disabled = true; // Principal cannot be modified after creation
      }
      if (balanceInput) {
        balanceInput.value = debt.current_balance || '';
        balanceInput.disabled = true; // Balance is modified via repayments
      }
      if (rateInput) rateInput.value = debt.interest_rate || '';
      if (minPayInput) minPayInput.value = debt.minimum_payment || '';
      if (notesInput) notesInput.value = debt.notes || '';
    } else {
      if (title) title.textContent = 'Add Liability / Loan';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (lenderInput) lenderInput.value = '';
      if (principalInput) {
        principalInput.value = '';
        principalInput.disabled = false;
      }
      if (balanceInput) {
        balanceInput.value = '';
        balanceInput.disabled = false;
      }
      if (rateInput) rateInput.value = '';
      if (minPayInput) minPayInput.value = '';
      if (notesInput) notesInput.value = '';
    }

    modal.hidden = false;
    modal.removeAttribute('hidden');
    if (nameInput) nameInput.focus();
  };

  SpendSenseDebts.prototype.openRepaymentModal = function (debtId) {
    var modal = document.getElementById('debt-repayment-modal');
    if (!modal) return;

    var debt = this.debts.find(function (d) { return d.id === debtId; });
    if (!debt) return;

    var title = document.getElementById('debt-repayment-modal-title');
    var sub = document.getElementById('debt-repayment-modal-sub');
    var idInput = document.getElementById('repay-debt-id');
    var amountInput = document.getElementById('repay-amount');
    var dateInput = document.getElementById('repay-date');
    var noteInput = document.getElementById('repay-note');
    var errorMsg = document.getElementById('repay-form-error');

    if (errorMsg) errorMsg.textContent = '';
    if (idInput) idInput.value = debtId;

    if (title) title.textContent = 'Record Loan Repayment';
    if (sub) sub.textContent = 'Loan: ' + debt.name + ' (Outstanding: ' + formatCurrency(debt.current_balance) + ')';

    if (amountInput) {
      amountInput.value = '';
      amountInput.placeholder = '0.00';
      amountInput.max = debt.current_balance;
    }

    if (dateInput) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    if (noteInput) noteInput.value = '';

    modal.hidden = false;
    modal.removeAttribute('hidden');
    if (amountInput) amountInput.focus();
  };

  SpendSenseDebts.prototype.openHistoryModal = async function (debtId) {
    var modal = document.getElementById('debt-history-modal');
    if (!modal) return;

    var title = document.getElementById('debt-history-modal-title');
    var listEl = document.getElementById('debt-history-list');

    modal.hidden = false;
    modal.removeAttribute('hidden');

    if (listEl) {
      listEl.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading history…</p></div>';
    }

    try {
      var res = await this.api.get('/debts/' + debtId);
      var debt = unwrap(res);

      if (title) title.textContent = 'Repayment & Balance History: ' + (debt ? debt.name : '');

      if (!debt || !debt.repayments || debt.repayments.length === 0) {
        if (listEl) listEl.innerHTML = '<p class="text-muted text-center" style="padding: 24px;">No repayment records yet.</p>';
        return;
      }

      var html = '<table class="data-table" aria-label="Repayment Ledger">' +
        '<thead><tr><th>Date</th><th>Balance</th><th>Record / Note</th></tr></thead><tbody>';

      debt.repayments.forEach(function (r) {
        html += '<tr>' +
          '<td>' + formatDate(r.valuation_date) + '</td>' +
          '<td><strong style="color: var(--ink);">' + formatCurrency(r.balance_amount) + '</strong></td>' +
          '<td>' + escapeHtml(r.note || '—') + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      if (listEl) listEl.innerHTML = html;
    } catch (err) {
      if (listEl) listEl.innerHTML = '<div class="notice error">Failed to load history.</div>';
    }
  };

  SpendSenseDebts.prototype.saveDebt = async function (formData) {
    var self = this;
    var errorMsg = document.getElementById('debt-form-error');
    var submitBtn = document.getElementById('debt-submit-btn');

    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    }

    var id = formData.get('id');
    var isEdit = Boolean(id);

    var payload = {
      name: (formData.get('name') || '').trim(),
      lender: (formData.get('lender') || '').trim() || null,
      notes: (formData.get('notes') || '').trim() || null
    };

    var rate = formData.get('interest_rate');
    if (rate !== null && rate !== '') payload.interest_rate = parseFloat(rate);

    var minPay = formData.get('minimum_payment');
    if (minPay !== null && minPay !== '') payload.minimum_payment = parseFloat(minPay);

    if (!payload.name) {
      if (errorMsg) {
        errorMsg.textContent = 'Please provide a loan or liability name.';
        errorMsg.style.display = 'block';
      }
      return;
    }

    if (!isEdit) {
      payload.original_amount = parseFloat(formData.get('original_amount'));
      var curBal = formData.get('current_balance');
      if (curBal !== null && curBal !== '') {
        payload.current_balance = parseFloat(curBal);
      }
      if (isNaN(payload.original_amount) || payload.original_amount <= 0) {
        if (errorMsg) {
          errorMsg.textContent = 'Original principal must be greater than zero.';
          errorMsg.style.display = 'block';
        }
        return;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = 'Saving…';
    }

    try {
      if (isEdit) {
        await this.api.put('/debts/' + id, payload);
      } else {
        await this.api.post('/debts', payload);
      }
      self.closeModals();
      self.loadDebts();
    } catch (err) {
      if (errorMsg) {
        var detail = (err.data && (err.data.message || (err.data.errors && Object.values(err.data.errors)[0][0]))) || 'Failed to save debt record.';
        errorMsg.textContent = detail;
        errorMsg.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Save Debt Record';
      }
    }
  };

  SpendSenseDebts.prototype.saveRepayment = async function (formData) {
    var self = this;
    var errorMsg = document.getElementById('repay-form-error');
    var submitBtn = document.getElementById('repay-submit-btn');

    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    }

    var debtId = formData.get('debt_id');
    var payload = {
      amount: parseFloat(formData.get('amount')),
      payment_date: formData.get('payment_date') || null,
      note: (formData.get('note') || '').trim() || null
    };

    if (isNaN(payload.amount) || payload.amount <= 0) {
      if (errorMsg) {
        errorMsg.textContent = 'Repayment amount must be greater than zero.';
        errorMsg.style.display = 'block';
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = 'Saving…';
    }

    try {
      await this.api.post('/debts/' + debtId + '/repayments', payload);
      self.closeModals();
      self.loadDebts();
    } catch (err) {
      if (errorMsg) {
        var detail = (err.data && (err.data.message || (err.data.errors && Object.values(err.data.errors)[0][0]))) || 'Failed to record repayment.';
        errorMsg.textContent = detail;
        errorMsg.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Record Payment';
      }
    }
  };

  SpendSenseDebts.prototype.archiveDebt = async function (debtId) {
    try {
      await this.api.post('/debts/' + debtId + '/archive');
      this.loadDebts();
    } catch (err) {
      alert('Failed to archive debt.');
    }
  };

  SpendSenseDebts.prototype.restoreDebt = async function (debtId) {
    try {
      await this.api.post('/debts/' + debtId + '/restore');
      this.loadDebts();
    } catch (err) {
      alert('Failed to restore debt.');
    }
  };

  SpendSenseDebts.prototype.closeModals = function () {
    var modals = document.querySelectorAll('#debt-modal, #debt-repayment-modal, #debt-history-modal');
    modals.forEach(function (m) {
      m.hidden = true;
      m.setAttribute('hidden', '');
    });
  };

  if (typeof window !== 'undefined') {
    window.SpendSenseDebts = SpendSenseDebts;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SpendSenseDebts: SpendSenseDebts,
      formatCurrency: formatCurrency,
      formatDate: formatDate
    };
  }
})(typeof window !== 'undefined' ? window : global, typeof document !== 'undefined' ? document : {});
