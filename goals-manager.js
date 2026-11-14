/**
 * SpendSense — Financial Goals Component (GOAL-01)
 * Manages savings goal creation, contribution and correction ledgers,
 * progress calculation, monthly contribution estimates, and completion.
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

  function SpendSenseGoals() {
    this.api = window.api || (typeof window.SpendSenseAPI === 'function' ? new window.SpendSenseAPI() : window.SpendSenseAPI) || null;
    this.goals = [];
    this.summary = null;
    this.currentFilter = 'active';
    this.searchQuery = '';
    this.viewMode = 'grid'; // 'grid' or 'list'
  }

  SpendSenseGoals.prototype.init = function () {
    this.bindEvents();
    this.loadGoals();
  };

  SpendSenseGoals.prototype.loadGoals = async function () {
    var self = this;
    var container = document.getElementById('goals-container');
    if (!container) return;

    container.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading financial goals…</p></div>';

    try {
      if (!this.api && window.SpendSenseAPI) {
        this.api = window.SpendSenseAPI;
      }
      var res = await this.api.get('/savings-goals');
      var payload = unwrap(res);

      if (payload) {
        self.goals = payload.goals || [];
        self.summary = payload.summary || null;
      } else {
        self.goals = [];
      }

      self.renderSummary();
      self.renderGoals();
    } catch (err) {
      container.innerHTML = '<div class="notice error">Failed to load financial goals. Please try again.</div>';
    }
  };

  SpendSenseGoals.prototype.renderSummary = function () {
    if (!this.summary) return;

    var elActive = document.getElementById('goals-stat-active');
    var elTarget = document.getElementById('goals-stat-target');
    var elSaved = document.getElementById('goals-stat-saved');
    var elCompleted = document.getElementById('goals-stat-completed');

    if (elActive) elActive.textContent = this.summary.active_count ?? 0;
    if (elTarget) elTarget.textContent = formatCurrency(this.summary.total_target);
    if (elSaved) elSaved.textContent = formatCurrency(this.summary.total_saved);
    if (elCompleted) elCompleted.textContent = this.summary.completed_count ?? 0;
  };

  SpendSenseGoals.prototype.renderGoals = function () {
    var self = this;
    var container = document.getElementById('goals-container');
    if (!container) return;

    var filtered = this.goals.filter(function (goal) {
      if (self.currentFilter !== 'all' && goal.status !== self.currentFilter) {
        return false;
      }
      if (self.searchQuery) {
        var q = self.searchQuery.toLowerCase();
        var nameMatch = (goal.name || '').toLowerCase().includes(q);
        var notesMatch = (goal.notes || '').toLowerCase().includes(q);
        if (!nameMatch && !notesMatch) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="state empty">' +
        '<p>No financial goals found for the selected filter.</p>' +
        '<button type="button" class="btn primary sm mt-2" id="create-first-goal-btn">Create your first goal</button>' +
        '</div>';
      var firstBtn = document.getElementById('create-first-goal-btn');
      if (firstBtn) {
        firstBtn.addEventListener('click', function () {
          self.openGoalModal();
        });
      }
      return;
    }

    var html = '';
    if (this.viewMode === 'list') {
      html = '<div class="table-responsive"><table class="data-table" aria-label="Financial Goals Table">' +
        '<thead><tr>' +
        '<th>Goal Name</th><th>Status</th><th>Target Date</th><th>Saved / Target</th><th>Progress</th><th>Est. Monthly</th><th>Actions</th>' +
        '</tr></thead><tbody>';

      filtered.forEach(function (g) {
        var pct = Math.min(100, Math.max(0, parseFloat(g.progress_percent) || 0));
        var badgeClass = g.status === 'completed' ? 'badge-success' : (g.status === 'archived' ? 'badge-muted' : (g.is_overdue ? 'badge-danger' : 'badge-teal'));
        var statusLabel = g.is_overdue && g.status === 'active' ? 'Overdue' : (g.status.charAt(0).toUpperCase() + g.status.slice(1));
        var est = g.monthly_contribution_estimate ? formatCurrency(g.monthly_contribution_estimate) + '/mo' : '—';

        html += '<tr data-goal-id="' + g.id + '">' +
          '<td><strong>' + escapeHtml(g.name) + '</strong>' + (g.notes ? '<br><small class="text-muted">' + escapeHtml(g.notes) + '</small>' : '') + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + statusLabel + '</span></td>' +
          '<td>' + formatDate(g.target_date) + '</td>' +
          '<td>' + formatCurrency(g.saved_amount) + ' / ' + formatCurrency(g.target_amount) + '</td>' +
          '<td>' +
            '<div class="progress-bar-wrap" style="width: 100px; display: inline-block; vertical-align: middle; margin-right: 6px;">' +
              '<div class="progress-bar" style="width: ' + pct + '%;"></div>' +
            '</div>' + pct.toFixed(1) + '%' +
          '</td>' +
          '<td>' + est + '</td>' +
          '<td>' +
            '<button type="button" class="btn ghost sm action-contribute-btn" data-goal-id="' + g.id + '" title="Contribute">Add</button> ' +
            '<button type="button" class="btn ghost sm action-edit-goal-btn" data-goal-id="' + g.id + '" title="Edit">Edit</button> ' +
            '<button type="button" class="btn ghost sm action-history-goal-btn" data-goal-id="' + g.id + '" title="History">History</button>' +
          '</td>' +
        '</tr>';
      });

      html += '</tbody></table></div>';
    } else {
      // Grid view
      html = '<div class="grid grid-3" style="gap: 16px;">';
      filtered.forEach(function (g) {
        var pct = Math.min(100, Math.max(0, parseFloat(g.progress_percent) || 0));
        var badgeClass = g.status === 'completed' ? 'badge-success' : (g.status === 'archived' ? 'badge-muted' : (g.is_overdue ? 'badge-danger' : 'badge-teal'));
        var statusLabel = g.is_overdue && g.status === 'active' ? 'Overdue' : (g.status.charAt(0).toUpperCase() + g.status.slice(1));

        html += '<article class="card goal-card" data-goal-id="' + g.id + '" style="position: relative; display: flex; flex-direction: column; justify-content: space-between;">' +
          '<div>' +
            '<div class="card-head" style="margin-bottom: 8px;">' +
              '<div>' +
                '<h3 class="card-title" style="font-size: 1.05rem;">' + escapeHtml(g.name) + '</h3>' +
                (g.notes ? '<p class="card-sub">' + escapeHtml(g.notes) + '</p>' : '') +
              '</div>' +
              '<span class="badge ' + badgeClass + '">' + statusLabel + '</span>' +
            '</div>' +

            '<div style="margin: 12px 0;">' +
              '<div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">' +
                '<span style="font-size: 1.25rem; font-weight: 700; color: var(--teal);">' + formatCurrency(g.saved_amount) + '</span>' +
                '<span style="font-size: 0.88rem; color: var(--muted);">of ' + formatCurrency(g.target_amount) + '</span>' +
              '</div>' +
              '<div class="progress-bar-wrap" style="height: 8px; background: var(--surface-3, #e5e7eb); border-radius: 4px; overflow: hidden;">' +
                '<div class="progress-bar" style="height: 100%; width: ' + pct + '%; background: var(--teal); border-radius: 4px; transition: width 0.3s ease;"></div>' +
              '</div>' +
              '<div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 0.8rem; color: var(--muted);">' +
                '<span>' + pct.toFixed(1) + '% saved</span>' +
                '<span>' + formatCurrency(g.remaining_amount) + ' remaining</span>' +
              '</div>' +
            '</div>' +

            '<div style="font-size: 0.82rem; color: var(--muted); margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">' +
              (g.target_date ? '<div>Target date: <strong style="color: var(--ink);">' + formatDate(g.target_date) + '</strong></div>' : '') +
              (g.monthly_contribution_estimate && g.status === 'active' ? '<div>Monthly estimate: <strong style="color: var(--teal);">' + formatCurrency(g.monthly_contribution_estimate) + '/mo</strong></div>' : '') +
            '</div>' +
          '</div>' +

          '<div class="card-actions" style="display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--border); padding-top: 12px; margin-top: auto;">' +
            (g.status === 'active' ? '<button type="button" class="btn secondary sm action-contribute-btn" data-goal-id="' + g.id + '">+ Add</button>' : '') +
            (g.status === 'active' ? '<button type="button" class="btn ghost sm action-correction-btn" data-goal-id="' + g.id + '">- Withdraw</button>' : '') +
            '<button type="button" class="btn ghost sm action-edit-goal-btn" data-goal-id="' + g.id + '">Edit</button>' +
            '<button type="button" class="btn ghost sm action-history-goal-btn" data-goal-id="' + g.id + '">History</button>' +
            (g.status === 'archived' ?
              '<button type="button" class="btn ghost sm action-restore-goal-btn" data-goal-id="' + g.id + '">Restore</button>' :
              '<button type="button" class="btn ghost sm action-archive-goal-btn" data-goal-id="' + g.id + '">Archive</button>') +
          '</div>' +
        '</article>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
  };

  SpendSenseGoals.prototype.bindEvents = function () {
    var self = this;

    // Create Goal trigger
    var addBtn = document.getElementById('add-goal-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        self.openGoalModal();
      });
    }

    // Filter tabs / buttons
    var filterBtns = document.querySelectorAll('[data-goal-filter]');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.currentFilter = btn.getAttribute('data-goal-filter') || 'active';
        self.renderGoals();
      });
    });

    // View mode toggle
    var viewBtns = document.querySelectorAll('[data-goal-view-mode]');
    viewBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.viewMode = btn.getAttribute('data-goal-view-mode') || 'grid';
        self.renderGoals();
      });
    });

    // Search input
    var searchInput = document.getElementById('goals-search-input') || document.getElementById('goals-search');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        self.searchQuery = e.target.value.trim();
        self.renderGoals();
      });
    }

    // Status filter select
    var statusSelect = document.getElementById('goals-filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', function (e) {
        self.currentFilter = e.target.value || 'active';
        self.renderGoals();
      });
    }

    // Event delegation on container
    var container = document.getElementById('goals-container');
    if (container) {
      container.addEventListener('click', function (e) {
        var contributeBtn = e.target.closest('.action-contribute-btn');
        if (contributeBtn) {
          var id = parseInt(contributeBtn.getAttribute('data-goal-id'), 10);
          self.openContributionModal(id, 'contribution');
          return;
        }

        var correctBtn = e.target.closest('.action-correction-btn');
        if (correctBtn) {
          var cid = parseInt(correctBtn.getAttribute('data-goal-id'), 10);
          self.openContributionModal(cid, 'correction');
          return;
        }

        var editBtn = e.target.closest('.action-edit-goal-btn');
        if (editBtn) {
          var eid = parseInt(editBtn.getAttribute('data-goal-id'), 10);
          var goal = self.goals.find(function (g) { return g.id === eid; });
          if (goal) self.openGoalModal(goal);
          return;
        }

        var historyBtn = e.target.closest('.action-history-goal-btn');
        if (historyBtn) {
          var hid = parseInt(historyBtn.getAttribute('data-goal-id'), 10);
          self.openHistoryModal(hid);
          return;
        }

        var archiveBtn = e.target.closest('.action-archive-goal-btn');
        if (archiveBtn) {
          var aid = parseInt(archiveBtn.getAttribute('data-goal-id'), 10);
          self.archiveGoal(aid);
          return;
        }

        var restoreBtn = e.target.closest('.action-restore-goal-btn');
        if (restoreBtn) {
          var rid = parseInt(restoreBtn.getAttribute('data-goal-id'), 10);
          self.restoreGoal(rid);
          return;
        }
      });
    }

    // Modal submit bindings
    var goalForm = document.getElementById('goal-form');
    if (goalForm) {
      goalForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.saveGoal(new FormData(goalForm));
      });
    }

    var contribForm = document.getElementById('goal-contribution-form');
    if (contribForm) {
      contribForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.saveContribution(new FormData(contribForm));
      });
    }

    // Modal close buttons
    var closeButtons = document.querySelectorAll('[data-close-goal-modal]');
    closeButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        self.closeModals();
      });
    });
  };

  SpendSenseGoals.prototype.openGoalModal = function (goal) {
    var modal = document.getElementById('goal-modal');
    if (!modal) return;

    var title = document.getElementById('goal-modal-title');
    var idInput = document.getElementById('goal-id') || document.getElementById('goal-form-id');
    var nameInput = document.getElementById('goal-name') || document.getElementById('goal-form-name');
    var targetInput = document.getElementById('goal-target') || document.getElementById('goal-form-target');
    var dateInput = document.getElementById('goal-target-date') || document.getElementById('goal-form-date');
    var notesInput = document.getElementById('goal-notes') || document.getElementById('goal-form-notes');
    var errorMsg = document.getElementById('goal-form-error');

    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    }

    if (goal) {
      if (title) title.textContent = 'Edit Financial Goal';
      if (idInput) idInput.value = goal.id;
      if (nameInput) nameInput.value = goal.name || '';
      if (targetInput) targetInput.value = goal.target_amount || '';
      if (dateInput) dateInput.value = goal.target_date || '';
      if (notesInput) notesInput.value = goal.notes || '';
    } else {
      if (title) title.textContent = 'Create Financial Goal';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (targetInput) targetInput.value = '';
      if (dateInput) dateInput.value = '';
      if (notesInput) notesInput.value = '';
    }

    modal.hidden = false;
    modal.removeAttribute('hidden');
    if (nameInput) nameInput.focus();
  };

  SpendSenseGoals.prototype.openContributionModal = function (goalId, type) {
    var modal = document.getElementById('goal-contribution-modal');
    if (!modal) return;

    var goal = this.goals.find(function (g) { return g.id === goalId; });
    if (!goal) return;

    var title = document.getElementById('goal-contribution-modal-title');
    var sub = document.getElementById('goal-contribution-modal-sub');
    var idInput = document.getElementById('contrib-goal-id');
    var typeInput = document.getElementById('contrib-type');
    var amountInput = document.getElementById('contrib-amount');
    var dateInput = document.getElementById('contrib-date');
    var noteInput = document.getElementById('contrib-note');
    var errorMsg = document.getElementById('contrib-form-error');

    if (errorMsg) errorMsg.textContent = '';
    if (idInput) idInput.value = goalId;
    if (typeInput) typeInput.value = type || 'contribution';

    var isCorrection = type === 'correction';
    if (title) title.textContent = isCorrection ? 'Record Goal Withdrawal / Correction' : 'Add Money to Goal';
    if (sub) sub.textContent = 'Goal: ' + goal.name + ' (Saved: ' + formatCurrency(goal.saved_amount) + ' of ' + formatCurrency(goal.target_amount) + ')';

    if (amountInput) {
      amountInput.value = '';
      amountInput.placeholder = '0.00';
      if (isCorrection) {
        amountInput.max = goal.saved_amount;
      } else {
        amountInput.removeAttribute('max');
      }
    }

    if (dateInput) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
    if (noteInput) noteInput.value = '';

    modal.hidden = false;
    modal.removeAttribute('hidden');
    if (amountInput) amountInput.focus();
  };

  SpendSenseGoals.prototype.openHistoryModal = async function (goalId) {
    var modal = document.getElementById('goal-history-modal');
    if (!modal) return;

    var title = document.getElementById('goal-history-modal-title');
    var listEl = document.getElementById('goal-history-list');

    modal.hidden = false;
    modal.removeAttribute('hidden');

    if (listEl) {
      listEl.innerHTML = '<div class="state loading"><span class="spinner" aria-hidden="true"></span><p>Loading history…</p></div>';
    }

    try {
      var res = await this.api.get('/savings-goals/' + goalId);
      var goal = unwrap(res);

      if (title) title.textContent = 'Contribution History: ' + (goal ? goal.name : '');

      if (!goal || !goal.contributions || goal.contributions.length === 0) {
        if (listEl) listEl.innerHTML = '<p class="text-muted text-center" style="padding: 24px;">No contributions or withdrawals recorded yet.</p>';
        return;
      }

      var html = '<table class="data-table" aria-label="Contribution Ledger">' +
        '<thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead><tbody>';

      goal.contributions.forEach(function (c) {
        var isPlus = c.type === 'contribution';
        html += '<tr>' +
          '<td>' + formatDate(c.contributed_at) + '</td>' +
          '<td><span class="badge ' + (isPlus ? 'badge-teal' : 'badge-amber') + '">' + (isPlus ? 'Contribution' : 'Withdrawal') + '</span></td>' +
          '<td><strong style="color: ' + (isPlus ? 'var(--teal)' : 'var(--warn, #f59e0b)') + ';">' + (isPlus ? '+' : '-') + formatCurrency(c.amount) + '</strong></td>' +
          '<td>' + escapeHtml(c.note || '—') + '</td>' +
        '</tr>';
      });

      html += '</tbody></table>';
      if (listEl) listEl.innerHTML = html;
    } catch (err) {
      if (listEl) listEl.innerHTML = '<div class="notice error">Failed to load history.</div>';
    }
  };

  SpendSenseGoals.prototype.saveGoal = async function (formData) {
    var self = this;
    var errorMsg = document.getElementById('goal-form-error');
    var submitBtn = document.getElementById('goal-submit-btn');

    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    }

    var id = formData.get('id');
    var payload = {
      name: (formData.get('name') || '').trim(),
      target_amount: parseFloat(formData.get('target_amount')),
      target_date: formData.get('target_date') || null,
      notes: (formData.get('notes') || '').trim() || null
    };

    if (!payload.name) {
      if (errorMsg) {
        errorMsg.textContent = 'Please provide a goal name.';
        errorMsg.style.display = 'block';
      }
      return;
    }
    if (isNaN(payload.target_amount) || payload.target_amount <= 0) {
      if (errorMsg) {
        errorMsg.textContent = 'Target amount must be greater than zero.';
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
      if (id) {
        await this.api.put('/savings-goals/' + id, payload);
      } else {
        await this.api.post('/savings-goals', payload);
      }
      self.closeModals();
      self.loadGoals();
    } catch (err) {
      if (errorMsg) {
        var detail = (err.data && (err.data.message || (err.data.errors && Object.values(err.data.errors)[0][0]))) || 'Failed to save goal.';
        errorMsg.textContent = detail;
        errorMsg.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Save Goal';
      }
    }
  };

  SpendSenseGoals.prototype.saveContribution = async function (formData) {
    var self = this;
    var errorMsg = document.getElementById('contrib-form-error');
    var submitBtn = document.getElementById('contrib-submit-btn');

    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.style.display = 'none';
    }

    var goalId = formData.get('goal_id');
    var type = formData.get('type') || 'contribution';
    var payload = {
      amount: parseFloat(formData.get('amount')),
      contributed_at: formData.get('contributed_at') || null,
      note: (formData.get('note') || '').trim() || null
    };

    if (isNaN(payload.amount) || payload.amount <= 0) {
      if (errorMsg) {
        errorMsg.textContent = 'Amount must be greater than zero.';
        errorMsg.style.display = 'block';
      }
      return;
    }

    var endpoint = type === 'correction' ?
      '/savings-goals/' + goalId + '/corrections' :
      '/savings-goals/' + goalId + '/contributions';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.textContent = 'Saving…';
    }

    try {
      await this.api.post(endpoint, payload);
      self.closeModals();
      self.loadGoals();
    } catch (err) {
      if (errorMsg) {
        var detail = (err.data && (err.data.message || (err.data.errors && Object.values(err.data.errors)[0][0]))) || 'Failed to record transaction.';
        errorMsg.textContent = detail;
        errorMsg.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.originalText || 'Record Contribution';
      }
    }
  };

  SpendSenseGoals.prototype.archiveGoal = async function (goalId) {
    try {
      await this.api.post('/savings-goals/' + goalId + '/archive');
      this.loadGoals();
    } catch (err) {
      alert('Failed to archive goal.');
    }
  };

  SpendSenseGoals.prototype.restoreGoal = async function (goalId) {
    try {
      await this.api.post('/savings-goals/' + goalId + '/restore');
      this.loadGoals();
    } catch (err) {
      alert('Failed to restore goal.');
    }
  };

  SpendSenseGoals.prototype.closeModals = function () {
    var modals = document.querySelectorAll('#goal-modal, #goal-contribution-modal, #goal-history-modal');
    modals.forEach(function (m) {
      m.hidden = true;
      m.setAttribute('hidden', '');
    });
  };

  if (typeof window !== 'undefined') {
    window.SpendSenseGoals = SpendSenseGoals;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SpendSenseGoals: SpendSenseGoals,
      formatCurrency: formatCurrency,
      formatDate: formatDate
    };
  }
})(typeof window !== 'undefined' ? window : global, typeof document !== 'undefined' ? document : {});
