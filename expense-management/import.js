/*
 * Import transactions — CSV upload, preview, and import.
 * Uses the Stage 5 /api/import/preview and /api/import endpoints.
 */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.SpendSenseAPI || !window.SpendSenseUI) return;

  const API = window.SpendSenseAPI;
  const UI = window.SpendSenseUI;

  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) API.init(metaBase.content);

  const form = document.getElementById('import-form');
  const fileInput = document.getElementById('csv-file');
  const previewSection = document.getElementById('import-preview');
  const resultSection = document.getElementById('import-result');
  const submitBtn = document.getElementById('import-submit');
  const backBtn = document.getElementById('import-back');
  const messageEl = document.getElementById('import-message');

  const totalRowsEl = document.getElementById('total-rows');
  const validRowsEl = document.getElementById('valid-rows');
  const errorRowsEl = document.getElementById('error-rows');
  const duplicateRowsEl = document.getElementById('duplicate-rows');

  const errorsTableBody = document.getElementById('errors-table-body');
  const errorsTableWrap = document.getElementById('errors-table-wrap');
  const noErrorsEl = document.getElementById('no-errors');

  const duplicatesTableBody = document.getElementById('duplicates-table-body');
  const duplicatesTableWrap = document.getElementById('duplicates-table-wrap');
  const noDuplicatesEl = document.getElementById('no-duplicates');
  const duplicatesDetails = document.getElementById('duplicates-details');

  const importForm = document.getElementById('import-form');
  const importPreview = document.getElementById('import-preview');
  const importResult = document.getElementById('import-result');
  const importSubmit = document.getElementById('import-submit');
  const importBack = document.getElementById('import-back');

  const resultImported = document.getElementById('result-imported');
  const resultSkipped = document.getElementById('result-skipped');
  const resultValid = document.getElementById('result-valid');
  const resultDuplicates = document.getElementById('result-duplicates');

  const errorsTableBody = document.getElementById('errors-table-body');
  const errorsTableWrap = document.getElementById('errors-table-wrap');
  const noErrorsEl = document.getElementById('no-errors');

  const duplicatesTableBody = document.getElementById('duplicates-table-body');
  const duplicatesTableWrap = document.getElementById('duplicates-table-wrap');
  const noDuplicatesEl = document.getElementById('no-duplicates');
  const duplicatesDetails = document.getElementById('duplicates-details');

  const totalRowsEl = document.getElementById('total-rows');
  const validRowsEl = document.getElementById('valid-rows');
  const errorRowsEl = document.getElementById('error-rows');
  const duplicateRowsEl = document.getElementById('duplicate-rows');

  const messageEl = document.getElementById('import-message');
  const submitBtn = document.getElementById('import-submit');
  const backBtn = document.getElementById('import-back');

  let previewData = null;

  const setMessage = function(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.classList.remove('error', 'success');
    if (type) messageEl.classList.add(type);
  };

  const renderErrors = function(errors) {
    if (!errorsTableBody) return;
    errorsTableBody.replaceChildren();

    if (!errors || errors.length === 0) {
      if (errorsTableWrap) errorsTableWrap.hidden = true;
      if (noErrorsEl) noErrorsEl.hidden = false;
      return;
    }

    if (errorsTableWrap) errorsTableWrap.hidden = false;
    if (noErrorsEl) noErrorsEl.hidden = true;

    errors.forEach(function(err) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + err.row + '</td><td>' + err.field + '</td><td>' + err.message + '</td>';
      errorsTableBody.appendChild(tr);
    });
  };

  const renderDuplicates = function(duplicates) {
    if (!duplicatesTableBody) return;
    duplicatesTableBody.replaceChildren();

    if (!duplicates || duplicates.length === 0) {
      if (duplicatesTableWrap) duplicatesTableWrap.hidden = true;
      if (noDuplicatesEl) noDuplicatesEl.hidden = false;
      if (duplicatesDetails) duplicatesDetails.hidden = true;
      return;
    }

    if (duplicatesTableWrap) duplicatesTableWrap.hidden = false;
    if (noDuplicatesEl) noDuplicatesEl.hidden = true;
    if (duplicatesDetails) duplicatesDetails.hidden = false;

    duplicates.forEach(function(dup) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + dup.row + '</td><td>' + dup.type + '</td><td class="num">' + window.SpendSenseUI.formatMoney(dup.amount) + '</td><td>' + dup.date + '</td><td>' + dup.message + '</td>';
      duplicatesTableBody.appendChild(tr);
    });
  };

  var showPreview = function(data) {
    previewData = data;

    var total = data.summary?.total_rows ?? 0;
    var valid = data.summary?.valid_rows ?? 0;
    var errors = data.summary?.error_rows ?? 0;
    var duplicates = data.summary?.duplicate_rows ?? 0;

    var totalRowsEl = document.getElementById('total-rows');
    var validRowsEl = document.getElementById('valid-rows');
    var errorRowsEl = document.getElementById('error-rows');
    var duplicateRowsEl = document.getElementById('duplicate-rows');

    if (totalRowsEl) totalRowsEl.textContent = total.toLocaleString();
    if (validRowsEl) validRowsEl.textContent = valid.toLocaleString();
    if (errorRowsEl) errorRowsEl.textContent = errors.toLocaleString();
    if (duplicateRowsEl) duplicateRowsEl.textContent = duplicates.toLocaleString();

    renderErrors(data.errors);
    renderDuplicates(data.duplicates);

    var importPreview = document.getElementById('import-preview');
    var importForm = document.getElementById('import-form');
    var submitBtn = document.getElementById('import-submit');

    if (importPreview) importPreview.hidden = false;
    if (importForm) importForm.hidden = false;
    if (submitBtn) submitBtn.disabled = valid === 0;
  };

  var showResult = function(data) {
    var importPreview = document.getElementById('import-preview');
    var importForm = document.getElementById('import-form');
    var importResult = document.getElementById('import-result');

    if (importPreview) importPreview.hidden = true;
    if (importForm) importForm.hidden = true;
    if (importResult) importResult.hidden = false;

    var resultImported = document.getElementById('result-imported');
    var resultSkipped = document.getElementById('result-skipped');
    var resultValid = document.getElementById('result-valid');
    var resultDuplicates = document.getElementById('result-duplicates');

    if (resultImported) resultImported.textContent = (data.imported ?? 0).toLocaleString();
    if (resultSkipped) resultSkipped.textContent = (data.skipped ?? 0).toLocaleString();
    if (resultValid) resultValid.textContent = (data.total_valid ?? 0).toLocaleString();
    if (resultDuplicates) resultDuplicates.textContent = (data.duplicates_skipped ?? 0).toLocaleString();
  };

  var setMessage = function(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.classList.remove('error', 'success');
    if (type) messageEl.classList.add(type);
  };

  var setLoading = function(loading) {
    var submitBtn = document.getElementById('import-submit');
    if (submitBtn) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? 'Importing...' : 'Import transactions';
    }
  };

  var handlePreview = async function(file) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('confirm', 'true');

    var csrfToken = await API.ensureCsrfToken();
    var response = await fetch(API.API_BASE_URL + '/api/import/preview', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-XSRF-TOKEN': csrfToken,
        'Accept': 'application/json',
      },
      body: formData,
    });

    var result = await response.json();
    if (response.ok && result.success) {
      showPreview(result.data);
    } else {
      setMessage(result?.data?.message ?? 'Failed to preview import', 'error');
    }
  };

  var handleImport = async function() {
    var file = fileInput?.files?.[0];
    if (!file) return;

    setMessage('');
    setLoading(true);

    var formData = new FormData();
    formData.append('file', file);
    formData.append('confirm', 'true');

    var csrfToken = await API.ensureCsrfToken();
    try {
      var response = await fetch(API.API_BASE_URL + '/api/import', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-XSRF-TOKEN': csrfToken,
          'Accept': 'application/json',
        },
        body: formData,
      });

      var result = await response.json();

      if (response.ok && result.success) {
        showResult(result.data);
        setMessage('Successfully imported ' + result.data.imported + ' transactions', 'success');
      } else {
        setMessage(result?.data?.message ?? 'Import failed', 'error');
      }
    } catch (err) {
      setMessage('Import failed: ' + (err?.message ?? 'Unknown error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  var setMessage = function(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.classList.remove('error', 'success');
    if (type) messageEl.classList.add(type);
  };

  var setLoading = function(loading) {
    var submitBtn = document.getElementById('import-submit');
    if (submitBtn) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? 'Importing...' : 'Import transactions';
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    var API = window.SpendSenseAPI;
    var UI = window.SpendSenseUI;

    var metaBase = document.querySelector('meta[name="api-base-url"]');
    if (metaBase) API.init(metaBase.content);

    var fileInput = document.getElementById('csv-file');
    var importForm = document.getElementById('import-form');
    var submitBtn = document.getElementById('import-submit');
    var backBtn = document.getElementById('import-back');

    if (fileInput) {
      fileInput.addEventListener('change', async function(e) {
        var file = e.target.files?.[0];
        if (!file) return;

        setMessage('');
        var importPreview = document.getElementById('import-preview');
        var resultSection = document.getElementById('import-result');
        var importForm = document.getElementById('import-form');
        var submitBtn = document.getElementById('import-submit');

        importPreview.hidden = true;
        resultSection.hidden = true;
        importForm.hidden = false;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Import transactions';

        await handlePreview(fileInput.files[0]);
      });
    }

    if (importForm) {
      importForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleImport();
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', function() {
        var resultSection = document.getElementById('import-result');
        var importPreview = document.getElementById('import-preview');
        var importForm = document.getElementById('import-form');
        resultSection.hidden = true;
        importPreview.hidden = false;
        importForm.hidden = false;
        submitBtn.textContent = 'Import transactions';
      });
    }

    var submitBtn = document.getElementById('import-submit');
    if (submitBtn) submitBtn.addEventListener('click', handleImport);

    if (fileInput) {
      fileInput.addEventListener('click', function() {
        var messageEl = document.getElementById('import-message');
        if (messageEl) {
          messageEl.textContent = '';
          messageEl.classList.remove('error', 'success');
        }
      });
    }
  });