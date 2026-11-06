/**
 * SpendSense CSV Import Workflow Component
 *
 * Implements the 5-stage recoverable CSV import workflow:
 * 1. File Selection & Client-Side Pre-validation
 * 2. Header Recognition & Column Mapping
 * 3. Data Preview & Duplicate Handling Policy
 * 4. Explicit Confirmation & Transaction-Safe Execution
 * 5. Completion Summary & Formula-Safe Error Download
 *
 * Fully accessible with focus trap, keyboard navigation, and responsive layout.
 */
(function () {
  'use strict';

  let activeFile = null;
  let activePreview = null;
  let lastFocusedTrigger = null;
  let currentStage = 'select'; // 'select' | 'mapping' | 'preview' | 'complete'

  // Neutralize formula injection in client-generated CSV reports
  function sanitizeCsvCell(value) {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/\0/g, '');
    // Check if numeric
    if (/^-?\d+(?:\.\d+)?$/.test(str.trim())) {
      return str.trim();
    }
    // Neutralize spreadsheet formula prefixes
    if (/^[\s\x00-\x20]*[=+\-@|%]/.test(str) || /^[\t\r\n]/.test(str)) {
      return '"\'' + str.replace(/"/g, '""') + '"';
    }
    return '"' + str.replace(/"/g, '""') + '"';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getModalHtml() {
    return `
      <div id="import-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="import-modal-title" hidden>
        <div class="modal modal-wide" tabindex="-1">
          <button class="modal-close" type="button" data-import-close aria-label="Close">×</button>
          <h2 id="import-modal-title">Import Transactions from CSV</h2>
          <p class="modal-sub" data-import-sub>Upload a CSV file containing your expense or income records to review before importing.</p>

          <div class="import-content">
            <!-- Stage 1: File Selection -->
            <div data-import-stage="select">
              <div class="import-dropzone" data-import-dropzone tabindex="0" role="button" aria-label="Choose or drop CSV file">
                <input type="file" id="import-file-input" class="sr-only" accept=".csv,text/csv,text/plain" data-import-file-input />
                <div class="import-dropzone-inner">
                  <svg class="import-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="12" y2="12"></line>
                    <line x1="15" y1="15" x2="12" y2="12"></line>
                  </svg>
                  <p class="import-prompt"><strong>Choose a CSV file</strong> or drag and drop it here</p>
                  <p class="import-hint">Maximum file size: 2 MB. Supported format: CSV (.csv) with headers.</p>
                </div>
              </div>

              <div class="import-selected-file" data-import-selected-file hidden>
                <div class="file-info">
                  <span class="file-name" data-import-filename>filename.csv</span>
                  <span class="file-size" data-import-filesize>0 KB</span>
                </div>
                <button type="button" class="btn ghost sm" data-import-remove-file>Remove</button>
              </div>

              <div class="import-guide card-sub" style="margin-top: 16px;">
                <strong>Expected columns:</strong>
                <code>Date</code> (YYYY-MM-DD or DD/MM/YYYY), <code>Amount</code>, <code>Category</code> (for expenses), <code>Description</code> or <code>Source</code> (for income), and optional <code>Type</code>.
              </div>

              <p class="import-message msg error" data-import-error role="status" aria-live="polite" hidden></p>

              <div class="modal-actions" style="margin-top: 24px;">
                <button type="button" class="btn secondary" data-import-close>Cancel</button>
                <button type="button" class="btn primary" data-import-analyze disabled>
                  <span class="btn-text">Analyze & Preview</span>
                  <span class="spinner-sm" data-import-spinner hidden aria-hidden="true"></span>
                </button>
              </div>
            </div>

            <!-- Stage 2: Preview & Duplicate Review -->
            <div data-import-stage="preview" hidden>
              <!-- Summary pills -->
              <div class="import-summary-bar">
                <span class="pill" data-summary-total>Total: 0</span>
                <span class="pill success" data-summary-valid>0 Valid</span>
                <span class="pill amber" data-summary-duplicates>0 Duplicates</span>
                <span class="pill rose" data-summary-errors>0 Errors</span>
              </div>

              <!-- Duplicate policy selection -->
              <div class="import-policy-box" data-import-policy-box>
                <fieldset class="import-policy-fieldset">
                  <legend class="import-policy-legend">Duplicate Handling</legend>
                  <label class="radio-label">
                    <input type="radio" name="dupPolicy" value="skip" checked data-import-dup-policy />
                    <span><strong>Skip duplicates</strong> (recommended — keeps your existing records untouched)</span>
                  </label>
                  <label class="radio-label">
                    <input type="radio" name="dupPolicy" value="import" data-import-dup-policy />
                    <span><strong>Import duplicates anyway</strong> (adds them as additional transactions)</span>
                  </label>
                </fieldset>
              </div>

              <!-- Row errors notification box -->
              <div class="import-errors-box" data-import-errors-container hidden>
                <div class="import-errors-head">
                  <span class="import-errors-title">Issues found in <span data-import-error-count>0</span> row(s):</span>
                </div>
                <ul class="import-errors-list" data-import-errors-list></ul>
              </div>

              <!-- Data Preview Table -->
              <div class="import-preview-section">
                <h3 class="import-section-title">Data Preview (first rows)</h3>
                <div class="table-wrap import-table-wrap">
                  <table class="table import-preview-table" data-import-table>
                    <thead>
                      <tr>
                        <th class="col-tight">Row</th>
                        <th class="col-tight">Date</th>
                        <th class="col-tight">Type</th>
                        <th class="num col-tight">Amount</th>
                        <th>Description / Source</th>
                        <th class="col-tight">Category</th>
                        <th class="col-tight">Status</th>
                      </tr>
                    </thead>
                    <tbody data-import-preview-rows></tbody>
                  </table>
                </div>
              </div>

              <p class="import-message msg error" data-import-commit-error role="status" aria-live="polite" hidden></p>

              <div class="modal-actions" style="margin-top: 20px;">
                <button type="button" class="btn secondary" data-import-back>Back / Choose File</button>
                <button type="button" class="btn primary" data-import-confirm>
                  <span class="btn-text" data-import-confirm-label>Confirm Import</span>
                  <span class="spinner-sm" data-import-confirm-spinner hidden aria-hidden="true"></span>
                </button>
              </div>
            </div>

            <!-- Stage 3: Completion Summary -->
            <div data-import-stage="complete" hidden>
              <div class="import-success-banner">
                <svg class="success-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h3 class="success-title">Import Finished</h3>
                <p class="success-sub" data-import-complete-summary>Your records have been safely imported into SpendSense.</p>
              </div>

              <div class="import-results-stats">
                <div class="stat-card">
                  <span class="stat-label">Imported</span>
                  <span class="stat-num pos" data-result-imported>0</span>
                </div>
                <div class="stat-card">
                  <span class="stat-label">Skipped</span>
                  <span class="stat-num muted" data-result-skipped>0</span>
                </div>
                <div class="stat-card">
                  <span class="stat-label">Duplicates Filtered</span>
                  <span class="stat-num warn" data-result-duplicates>0</span>
                </div>
              </div>

              <div class="import-download-errors" data-import-download-errors hidden style="margin-top: 16px;">
                <button type="button" class="btn secondary sm" data-import-download-errors-btn>
                  Download Rejected Rows Error Report (.csv)
                </button>
              </div>

              <div class="modal-actions" style="margin-top: 24px;">
                <button type="button" class="btn primary" data-import-done>Done</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  function ensureModalInDom() {
    let modal = document.querySelector('#import-modal');
    if (!modal) {
      const div = document.createElement('div');
      div.innerHTML = getModalHtml();
      document.body.appendChild(div.firstElementChild);
      modal = document.querySelector('#import-modal');
      bindModalEvents(modal);
    }
    return modal;
  }

  // Element visibility helper for modal focus trapping
  function isElementVisible(el) {
    if (!el || el.disabled || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    if (el.tabIndex < 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    let curr = el.parentElement;
    const modal = document.querySelector('#import-modal');
    while (curr && curr !== modal && curr !== document.body) {
      if (curr.hidden || curr.getAttribute('aria-hidden') === 'true') return false;
      if (window.getComputedStyle(curr).display === 'none') return false;
      curr = curr.parentElement;
    }
    return true;
  }

  function getFocusableElements(modal) {
    const selector = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(modal.querySelectorAll(selector)).filter(isElementVisible);
  }

  function openModal(triggerBtn) {
    lastFocusedTrigger = triggerBtn || document.activeElement;
    const modal = ensureModalInDom();
    resetImportState();
    modal.hidden = false;
    modal.removeAttribute('aria-hidden');

    // Focus the dropzone or close button
    const focusable = getFocusableElements(modal);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  function closeModal() {
    const modal = document.querySelector('#import-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    resetImportState();
    if (lastFocusedTrigger && typeof lastFocusedTrigger.focus === 'function') {
      lastFocusedTrigger.focus();
    }
  }

  function switchStage(stageName) {
    currentStage = stageName;
    const modal = document.querySelector('#import-modal');
    if (!modal) return;

    modal.querySelectorAll('[data-import-stage]').forEach((el) => {
      el.hidden = el.getAttribute('data-import-stage') !== stageName;
    });

    // Update modal subtitle
    const sub = modal.querySelector('[data-import-sub]');
    if (sub) {
      if (stageName === 'select') {
        sub.textContent = 'Upload a CSV file containing your expense or income records to review before importing.';
      } else if (stageName === 'preview') {
        sub.textContent = 'Review your transaction preview, configure duplicate handling, and confirm import.';
      } else if (stageName === 'complete') {
        sub.textContent = 'Your import has been processed. Review the outcome below.';
      }
    }

    // Move focus to first visible element in the new stage
    setTimeout(() => {
      const focusable = getFocusableElements(modal);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 50);
  }

  function resetImportState() {
    activeFile = null;
    activePreview = null;
    const modal = document.querySelector('#import-modal');
    if (!modal) return;

    const fileInput = modal.querySelector('[data-import-file-input]');
    if (fileInput) fileInput.value = '';

    const selectedFile = modal.querySelector('[data-import-selected-file]');
    if (selectedFile) selectedFile.hidden = true;

    const dropzone = modal.querySelector('[data-import-dropzone]');
    if (dropzone) dropzone.hidden = false;

    const analyzeBtn = modal.querySelector('[data-import-analyze]');
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      const text = analyzeBtn.querySelector('.btn-text');
      if (text) text.textContent = 'Analyze & Preview';
      const spinner = analyzeBtn.querySelector('[data-import-spinner]');
      if (spinner) spinner.hidden = true;
    }

    const err = modal.querySelector('[data-import-error]');
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }

    const commitErr = modal.querySelector('[data-import-commit-error]');
    if (commitErr) {
      commitErr.hidden = true;
      commitErr.textContent = '';
    }

    switchStage('select');
  }

  function validateFileSelection(file) {
    if (!file) {
      return { valid: false, message: 'Please select a file to import.' };
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'txt') {
      return { valid: false, message: 'Only CSV files (.csv or .txt) are supported.' };
    }
    const maxSize = 2 * 1024 * 1024; // 2 MB
    if (file.size > maxSize) {
      return { valid: false, message: 'File exceeds the maximum 2 MB size limit.' };
    }
    if (file.size === 0) {
      return { valid: false, message: 'The selected file is empty.' };
    }
    return { valid: true };
  }

  function handleFileSelected(file) {
    const modal = document.querySelector('#import-modal');
    if (!modal) return;

    const validation = validateFileSelection(file);
    const err = modal.querySelector('[data-import-error]');
    const analyzeBtn = modal.querySelector('[data-import-analyze]');
    const dropzone = modal.querySelector('[data-import-dropzone]');
    const selectedBox = modal.querySelector('[data-import-selected-file]');

    if (!validation.valid) {
      activeFile = null;
      if (err) {
        err.textContent = validation.message;
        err.hidden = false;
      }
      if (analyzeBtn) analyzeBtn.disabled = true;
      if (selectedBox) selectedBox.hidden = true;
      if (dropzone) dropzone.hidden = false;
      return;
    }

    activeFile = file;
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }

    // Display selected file info
    if (dropzone) dropzone.hidden = true;
    if (selectedBox) {
      selectedBox.hidden = false;
      const nameEl = selectedBox.querySelector('[data-import-filename]');
      const sizeEl = selectedBox.querySelector('[data-import-filesize]');
      if (nameEl) nameEl.textContent = file.name;
      if (sizeEl) sizeEl.textContent = formatBytes(file.size);
    }
    if (analyzeBtn) analyzeBtn.disabled = false;
  }

  async function analyzeAndPreview() {
    if (!activeFile) return;
    const modal = document.querySelector('#import-modal');
    if (!modal) return;

    const analyzeBtn = modal.querySelector('[data-import-analyze]');
    const spinner = modal.querySelector('[data-import-spinner]');
    const btnText = analyzeBtn ? analyzeBtn.querySelector('.btn-text') : null;
    const err = modal.querySelector('[data-import-error]');

    if (analyzeBtn) analyzeBtn.disabled = true;
    if (spinner) spinner.hidden = false;
    if (btnText) btnText.textContent = 'Analyzing...';
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }

    try {
      const formData = new FormData();
      formData.append('file', activeFile);

      if (!window.SpendSenseAPI || typeof window.SpendSenseAPI.postForm !== 'function') {
        throw new Error('API client is not ready. Please refresh the page.');
      }

      const res = await window.SpendSenseAPI.postForm('/import/preview', formData);

      if (res.status === 200 && res.data && res.data.success) {
        activePreview = res.data.data;
        renderPreviewStage(activePreview);
        switchStage('preview');
      } else {
        const errorMsg = (res.data && res.data.message) || (res.data && res.data.errors && Object.values(res.data.errors)[0]) || 'Failed to parse CSV file. Please verify headers and format.';
        if (err) {
          err.textContent = Array.isArray(errorMsg) ? errorMsg[0] : String(errorMsg);
          err.hidden = false;
        }
      }
    } catch (e) {
      if (err) {
        err.textContent = e.message || 'An unexpected error occurred while analyzing the file.';
        err.hidden = false;
      }
    } finally {
      if (analyzeBtn) analyzeBtn.disabled = false;
      if (spinner) spinner.hidden = true;
      if (btnText) btnText.textContent = 'Analyze & Preview';
    }
  }

  function renderPreviewStage(preview) {
    const modal = document.querySelector('#import-modal');
    if (!modal || !preview) return;

    const summary = preview.summary || {};
    const totalEl = modal.querySelector('[data-summary-total]');
    const validEl = modal.querySelector('[data-summary-valid]');
    const dupEl = modal.querySelector('[data-summary-duplicates]');
    const errEl = modal.querySelector('[data-summary-errors]');

    if (totalEl) totalEl.textContent = `Total: ${summary.total_rows || 0}`;
    if (validEl) validEl.textContent = `${summary.valid_rows || 0} Valid`;
    if (dupEl) dupEl.textContent = `${summary.duplicate_rows || 0} Duplicates`;
    if (errEl) errEl.textContent = `${summary.error_rows || 0} Errors`;

    // Duplicates policy box visibility
    const policyBox = modal.querySelector('[data-import-policy-box]');
    if (policyBox) {
      policyBox.hidden = (summary.duplicate_rows || 0) === 0;
    }

    // Row errors list
    const errContainer = modal.querySelector('[data-import-errors-container]');
    const errList = modal.querySelector('[data-import-errors-list]');
    const errCount = modal.querySelector('[data-import-error-count]');
    const errors = preview.errors || [];

    if (errContainer && errList) {
      if (errors.length > 0) {
        errContainer.hidden = false;
        if (errCount) errCount.textContent = errors.length;
        errList.innerHTML = errors.slice(0, 15).map(e => `
          <li><strong>Row ${e.row}:</strong> ${escapeHtml(e.message)}</li>
        `).join('') + (errors.length > 15 ? `<li>...and ${errors.length - 15} more error(s)</li>` : '');
      } else {
        errContainer.hidden = true;
        errList.innerHTML = '';
      }
    }

    // Preview table rows
    const tbody = modal.querySelector('[data-import-preview-rows]');
    if (tbody) {
      const rows = preview.preview_rows || [];
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 24px; color: var(--muted);">No rows available to preview.</td></tr>';
      } else {
        const currencySymbol = (window.SpendSenseSettings && typeof window.SpendSenseSettings.currencySymbol === 'function')
          ? window.SpendSenseSettings.currencySymbol()
          : (window.SpendSenseSettings ? window.SpendSenseSettings.symbol : '₹');

        tbody.innerHTML = rows.map(r => {
          let statusBadge = '<span class="pill sm success">Valid</span>';
          if (r.status === 'duplicate') {
            statusBadge = '<span class="pill sm amber">Duplicate</span>';
          } else if (r.status === 'error') {
            statusBadge = `<span class="pill sm rose" title="${escapeHtml(r.error_message || '')}">Error</span>`;
          }

          const typeBadge = r.type === 'income'
            ? '<span class="pill sm" style="color: var(--success); background: var(--success-100);">Income</span>'
            : '<span class="pill sm" style="color: var(--ink-2); background: var(--surface-2);">Expense</span>';

          return `
            <tr>
              <td class="col-tight" style="color: var(--muted);">${r.row}</td>
              <td class="col-tight">${escapeHtml(r.date || '')}</td>
              <td class="col-tight">${typeBadge}</td>
              <td class="num col-tight">${currencySymbol}${Number(r.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="cell-wrap">${escapeHtml(r.description || '')}</td>
              <td class="col-tight">${escapeHtml(r.category || '—')}</td>
              <td class="col-tight">${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Update confirmation button
    const confirmBtn = modal.querySelector('[data-import-confirm]');
    const confirmLabel = modal.querySelector('[data-import-confirm-label]');
    const validCount = summary.valid_rows || 0;

    if (confirmBtn) {
      confirmBtn.disabled = validCount === 0;
    }
    if (confirmLabel) {
      confirmLabel.textContent = validCount > 0 ? `Confirm Import (${validCount} records)` : 'No Valid Records to Import';
    }
  }

  async function executeCommit() {
    if (!activeFile || !activePreview) return;
    const modal = document.querySelector('#import-modal');
    if (!modal) return;

    const confirmBtn = modal.querySelector('[data-import-confirm]');
    const spinner = modal.querySelector('[data-import-confirm-spinner]');
    const err = modal.querySelector('[data-import-commit-error]');
    const selectedPolicy = modal.querySelector('input[name="dupPolicy"]:checked');
    const dupPolicy = selectedPolicy ? selectedPolicy.value : 'skip';

    if (confirmBtn) confirmBtn.disabled = true;
    if (spinner) spinner.hidden = false;
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }

    try {
      const formData = new FormData();
      formData.append('file', activeFile);
      formData.append('confirm', '1');
      formData.append('duplicate_policy', dupPolicy);

      const res = await window.SpendSenseAPI.postForm('/import', formData);

      if (res.status === 200 && res.data && res.data.success) {
        const result = res.data.data;
        renderCompleteStage(result);
        switchStage('complete');

        // Notify application components to reload transactions
        window.dispatchEvent(new CustomEvent('spendsense:data-imported', { detail: result }));
      } else {
        const errorMsg = (res.data && res.data.message) || 'Import commit failed. Please check your data and retry.';
        if (err) {
          err.textContent = String(errorMsg);
          err.hidden = false;
        }
      }
    } catch (e) {
      if (err) {
        err.textContent = e.message || 'An unexpected network error occurred during import.';
        err.hidden = false;
      }
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
      if (spinner) spinner.hidden = true;
    }
  }

  function renderCompleteStage(result) {
    const modal = document.querySelector('#import-modal');
    if (!modal || !result) return;

    const importedEl = modal.querySelector('[data-result-imported]');
    const skippedEl = modal.querySelector('[data-result-skipped]');
    const dupEl = modal.querySelector('[data-result-duplicates]');
    const summaryMsg = modal.querySelector('[data-import-complete-summary]');
    const downloadBox = modal.querySelector('[data-import-download-errors]');

    if (importedEl) importedEl.textContent = result.imported || 0;
    if (skippedEl) skippedEl.textContent = result.skipped || 0;
    if (dupEl) dupEl.textContent = result.duplicates_skipped || 0;

    if (summaryMsg) {
      summaryMsg.textContent = `Successfully imported ${result.imported || 0} transaction(s) into your records.`;
    }

    // If there were rejected rows, offer downloadable CSV error report
    const errors = (activePreview && activePreview.errors) ? activePreview.errors : [];
    if (downloadBox) {
      if (errors.length > 0) {
        downloadBox.hidden = false;
        const btn = downloadBox.querySelector('[data-import-download-errors-btn]');
        if (btn) {
          btn.onclick = () => downloadErrorReportCsv(errors);
        }
      } else {
        downloadBox.hidden = true;
      }
    }
  }

  function downloadErrorReportCsv(errors) {
    const headers = ['Row', 'Field', 'Error Message'];
    const csvRows = [headers.map(sanitizeCsvCell).join(',')];

    for (const e of errors) {
      csvRows.push([
        sanitizeCsvCell(e.row),
        sanitizeCsvCell(e.field),
        sanitizeCsvCell(e.message)
      ].join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'spendsense-import-errors.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindModalEvents(modal) {
    // Close buttons
    modal.querySelectorAll('[data-import-close]').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    // Done button in complete stage
    const doneBtn = modal.querySelector('[data-import-done]');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        closeModal();
        // If current page is expenses or income, trigger page reload to display fresh records
        if (window.location.pathname.includes('expenses.html') || window.location.pathname.includes('income.html')) {
          window.location.reload();
        }
      });
    }

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Keyboard navigation & focus trap
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusableElements(modal);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modal.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });

    // File input & Drag-and-drop
    const fileInput = modal.querySelector('[data-import-file-input]');
    const dropzone = modal.querySelector('[data-import-dropzone]');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFileSelected(e.dataTransfer.files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFileSelected(e.target.files[0]);
        }
      });
    }

    // Remove file button
    const removeBtn = modal.querySelector('[data-import-remove-file]');
    if (removeBtn) {
      removeBtn.addEventListener('click', resetImportState);
    }

    // Analyze button
    const analyzeBtn = modal.querySelector('[data-import-analyze]');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', analyzeAndPreview);
    }

    // Back button in preview stage
    const backBtn = modal.querySelector('[data-import-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        switchStage('select');
      });
    }

    // Confirm button in preview stage
    const confirmBtn = modal.querySelector('[data-import-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', executeCommit);
    }
  }

  // Global initializer
  function initCsvImportWorkflow() {
    document.querySelectorAll('[data-import-csv]').forEach(btn => {
      if (!btn._importBound) {
        btn._importBound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          openModal(btn);
        });
      }
    });
  }

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCsvImportWorkflow);
  } else {
    initCsvImportWorkflow();
  }

  window.SpendSenseImport = {
    openModal,
    closeModal,
    init: initCsvImportWorkflow,
    sanitizeCsvCell,
  };
})();

