/*
 * Import transactions — CSV upload, preview, and import.
 * Uses the shared API client for /import/preview and /import, so cookies,
 * XSRF handling, and the one-shot 419 recovery stay consistent with the rest
 * of the frontend.
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

  const resultImported = document.getElementById('result-imported');
  const resultSkipped = document.getElementById('result-skipped');
  const resultValid = document.getElementById('result-valid');
  const resultDuplicates = document.getElementById('result-duplicates');

  const setMessage = (text, type = '') => {
    if (!messageEl) return;
    messageEl.textContent = text || '';
    messageEl.classList.remove('error', 'success');
    if (type) messageEl.classList.add(type);
  };

  const setLoading = (loading) => {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Importing...' : 'Import transactions';
  };

  const renderErrors = (errors) => {
    if (!errorsTableBody) return;
    errorsTableBody.replaceChildren();

    if (!errors || errors.length === 0) {
      if (errorsTableWrap) errorsTableWrap.hidden = true;
      if (noErrorsEl) noErrorsEl.hidden = false;
      return;
    }

    if (errorsTableWrap) errorsTableWrap.hidden = false;
    if (noErrorsEl) noErrorsEl.hidden = true;

    errors.forEach((err) => {
      const tr = document.createElement('tr');
      [err.row, err.field, err.message].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value === null || value === undefined ? '' : String(value);
        tr.appendChild(td);
      });
      errorsTableBody.appendChild(tr);
    });
  };

  const renderDuplicates = (duplicates) => {
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

    duplicates.forEach((dup) => {
      const tr = document.createElement('tr');
      [dup.row, dup.type, UI.formatMoney(dup.amount), dup.date, dup.message].forEach((value, index) => {
        const td = document.createElement('td');
        if (index === 2) td.className = 'num';
        td.textContent = value === null || value === undefined ? '' : String(value);
        tr.appendChild(td);
      });
      duplicatesTableBody.appendChild(tr);
    });
  };

  const showPreview = (data) => {
    const summary = data?.summary || {};
    const total = summary.total_rows ?? 0;
    const valid = summary.valid_rows ?? 0;
    const errors = summary.error_rows ?? 0;
    const duplicates = summary.duplicate_rows ?? 0;

    if (totalRowsEl) totalRowsEl.textContent = total.toLocaleString();
    if (validRowsEl) validRowsEl.textContent = valid.toLocaleString();
    if (errorRowsEl) errorRowsEl.textContent = errors.toLocaleString();
    if (duplicateRowsEl) duplicateRowsEl.textContent = duplicates.toLocaleString();

    renderErrors(data?.errors);
    renderDuplicates(data?.duplicates);

    if (previewSection) previewSection.hidden = false;
    if (resultSection) resultSection.hidden = true;
    if (form) form.hidden = false;
    if (submitBtn) submitBtn.disabled = valid === 0;
  };

  const showResult = (data) => {
    if (previewSection) previewSection.hidden = true;
    if (form) form.hidden = true;
    if (resultSection) resultSection.hidden = false;

    if (resultImported) resultImported.textContent = (data?.imported ?? 0).toLocaleString();
    if (resultSkipped) resultSkipped.textContent = (data?.skipped ?? 0).toLocaleString();
    if (resultValid) resultValid.textContent = (data?.total_valid ?? 0).toLocaleString();
    if (resultDuplicates) resultDuplicates.textContent = (data?.duplicates_skipped ?? 0).toLocaleString();
  };

  const responseMessage = (result, fallback) =>
    result?.data?.data?.message || result?.data?.message || fallback;

  const handlePreview = async (file) => {
    if (!file) return;

    setMessage('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('confirm', 'true');

    try {
      const result = await API.post('/import/preview', formData);
      if (result.status === 200 && result.data?.success) {
        showPreview(result.data.data);
      } else {
        setMessage(responseMessage(result, 'Failed to preview import'), 'error');
      }
    } catch (error) {
      setMessage(`Failed to preview import: ${error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleImport = async () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      setMessage('Please select a CSV file to import.', 'error');
      return;
    }

    setMessage('');
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('confirm', 'true');

    try {
      const result = await API.post('/import', formData);
      if (result.status === 200 && result.data?.success) {
        const data = result.data.data;
        showResult(data);
        setMessage(`Successfully imported ${data?.imported ?? 0} transactions`, 'success');
      } else {
        setMessage(responseMessage(result, 'Import failed'), 'error');
      }
    } catch (error) {
      setMessage(`Import failed: ${error?.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (fileInput) {
    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setMessage('');
      if (previewSection) previewSection.hidden = true;
      if (resultSection) resultSection.hidden = true;
      if (form) form.hidden = false;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Import transactions';
      }

      await handlePreview(file);
    });

    fileInput.addEventListener('click', () => setMessage(''));
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await handleImport();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (resultSection) resultSection.hidden = true;
      if (previewSection) previewSection.hidden = false;
      if (form) form.hidden = false;
      if (submitBtn) submitBtn.textContent = 'Import transactions';
    });
  }
});
