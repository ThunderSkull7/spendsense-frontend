// Settings — profile preferences. The display name is saved through the
// authenticated profile API; theme and currency remain device preferences.
const settingsForm = document.querySelector('[data-settings-form]');
const currencySelect = document.querySelector('[data-currency-select]');
const currencyPreview = document.querySelector('[data-currency-preview]');
const themeModeSelect = document.querySelector('select#themeMode, select[data-theme-mode-select], select[data-theme-mode]');
const themeColorSelect = document.querySelector('select#themeColor, select[data-theme-color-select], select[data-theme-color]');
const paletteButtons = document.querySelectorAll('[data-palette]');
const settingsMessage = document.querySelector('[data-settings-message]');
const nameInput = document.querySelector('#name');
const emailInput = document.querySelector('#email');
const submitButton = document.querySelector('[data-settings-submit]');

const settings = window.SpendSenseSettings;
const api = window.SpendSenseAPI;

const setSettingsMessage = (message = '', type = '') => {
  if (!settingsMessage) return;
  settingsMessage.textContent = message;
  settingsMessage.classList.remove('error', 'success');
  if (type) settingsMessage.classList.add(type);
};

const fillProfile = (user) => {
  if (!user) return;
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = user.name || '';
  }
  if (emailInput) {
    emailInput.value = user.email || '';
  }
};

const renderCurrencyPreview = () => {
  if (!currencySelect || !currencyPreview) return;
  const symbol = settings.currencySymbols[currencySelect.value] || "₹";
  currencyPreview.textContent = `${symbol}2,486`;
};

if (currencySelect) {
  currencySelect.value = localStorage.getItem("spendsenseCurrency") || "INR";
  renderCurrencyPreview();

  currencySelect.addEventListener("change", () => {
    settings.applyCurrency(currencySelect.value);
    renderCurrencyPreview();
  });
}

const updatePaletteUI = (color) => {
  if (themeColorSelect) themeColorSelect.value = color;
  paletteButtons.forEach((btn) => {
    const isSelected = btn.dataset.palette === color;
    btn.classList.toggle('is-active', isSelected);
    btn.setAttribute('aria-checked', String(isSelected));
  });
};

if (themeModeSelect) {
  themeModeSelect.value = (settings && settings.themeMode) ? settings.themeMode() : "light";
  themeModeSelect.addEventListener("change", (e) => {
    const mode = (e && e.target && e.target.value) || themeModeSelect.value;
    if (settings && typeof settings.applyTheme === 'function') {
      settings.applyTheme(mode);
    }
  });
}

if (themeColorSelect) {
  const currentColor = (settings && settings.themeColor) ? settings.themeColor() : "teal";
  themeColorSelect.value = currentColor;
  updatePaletteUI(currentColor);

  themeColorSelect.addEventListener("change", (e) => {
    const color = (e && e.target && e.target.value) || themeColorSelect.value;
    if (settings && typeof settings.applyTheme === 'function') {
      settings.applyTheme(null, color);
    }
    updatePaletteUI(color);
  });
}

paletteButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.palette;
    if (settings && typeof settings.applyTheme === 'function') {
      settings.applyTheme(null, color);
    }
    updatePaletteUI(color);
  });
});

window.addEventListener("spendsense:theme-change", (event) => {
  if (event.detail) {
    if (themeModeSelect && event.detail.mode) themeModeSelect.value = event.detail.mode;
    if (event.detail.color) updatePaletteUI(event.detail.color);
  }
});

window.addEventListener("spendsense:auth-change", () => {
  if (api && typeof api.getUser === "function") {
    fillProfile(api.getUser());
  }
});

const loadProfile = async () => {
  if (!api || typeof api.loadSessionUser !== "function") return;

  const cached = typeof api.getUser === "function" ? api.getUser() : null;
  if (cached) fillProfile(cached);

  const user = await api.loadSessionUser();
  if (user) {
    fillProfile(user);
    setSettingsMessage('');
  } else {
    setSettingsMessage("We couldn't load your profile. Refresh the page or sign in again.", "error");
  }
};

if (settingsForm) {
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!settingsForm.checkValidity()) {
      setSettingsMessage("Please enter your name before saving.", "error");
      settingsForm.reportValidity();
      return;
    }

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      setSettingsMessage("Please enter your name before saving.", "error");
      nameInput?.focus();
      return;
    }

    if (currencySelect) {
      settings.applyCurrency(currencySelect.value);
      renderCurrencyPreview();
    }

    const originalLabel = submitButton ? submitButton.textContent : '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving…";
    }
    setSettingsMessage("Saving your profile…");

    try {
      const { data, status } = await api.put('/user', { name });

      if (status === 200 && data && data.user) {
        api.setUser(data.user);
        fillProfile(data.user);
        setSettingsMessage("Profile saved. Your display currency is stored on this device.", "success");
        if (window.SpendSenseUI) {
          window.SpendSenseUI.showToast("Profile saved", "success");
        }
      } else {
        const validationMessage = data && data.errors && data.errors.name
          ? data.errors.name[0]
          : null;
        setSettingsMessage(
          validationMessage || (data && data.message) || "Your profile could not be saved. Please try again.",
          "error"
        );
      }
    } catch (error) {
      setSettingsMessage("Unable to reach the server. Please check your connection and try again.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel || "Save profile";
      }
    }
  });
}

// Data Backup Export (BACKUP-01)
const exportBackupBtn = document.querySelector('[data-export-backup]');
if (exportBackupBtn) {
  exportBackupBtn.addEventListener('click', async () => {
    if (exportBackupBtn.disabled) return;
    exportBackupBtn.disabled = true;
    const originalText = exportBackupBtn.textContent;
    exportBackupBtn.textContent = 'Preparing backup…';

    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.downloadFile('/export/all', `spendsense-user-data-${today}.json`);
      if (window.SpendSenseUI) {
        window.SpendSenseUI.showToast('Data backup downloaded successfully', 'success');
      }
    } catch (err) {
      if (window.SpendSenseUI) {
        window.SpendSenseUI.showToast(err.message || 'Failed to download data backup', 'error');
      }
    } finally {
      exportBackupBtn.disabled = false;
      exportBackupBtn.textContent = originalText;
    }
  });
}

// Password Change Form (AUTH-RESET-01)
const passwordForm = document.querySelector('[data-password-form]');
const passwordMessage = document.querySelector('[data-password-message]');
const passwordSubmitBtn = document.querySelector('[data-password-submit]');

const setPasswordMessage = (message = '', type = '') => {
  if (!passwordMessage) return;
  passwordMessage.textContent = message;
  passwordMessage.classList.remove('error', 'success');
  if (type) passwordMessage.classList.add(type);
};

if (passwordForm) {
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const currentPasswordInput = passwordForm.querySelector('#current_password');
    const newPasswordInput = passwordForm.querySelector('#new_password');
    const confirmPasswordInput = passwordForm.querySelector('#new_password_confirmation');

    const current_password = currentPasswordInput ? currentPasswordInput.value : '';
    const password = newPasswordInput ? newPasswordInput.value : '';
    const password_confirmation = confirmPasswordInput ? confirmPasswordInput.value : '';

    if (!current_password) {
      setPasswordMessage('Please enter your current password.', 'error');
      currentPasswordInput?.focus();
      return;
    }

    if (!password || password.length < 8) {
      setPasswordMessage('New password must be at least 8 characters.', 'error');
      newPasswordInput?.focus();
      return;
    }

    if (password !== password_confirmation) {
      setPasswordMessage('New passwords do not match.', 'error');
      confirmPasswordInput?.focus();
      return;
    }

    const originalText = passwordSubmitBtn ? passwordSubmitBtn.textContent : '';
    if (passwordSubmitBtn) {
      passwordSubmitBtn.disabled = true;
      passwordSubmitBtn.textContent = 'Updating password…';
    }
    setPasswordMessage('Updating your password…');

    try {
      const { data, status } = await api.post('/password/change', {
        current_password,
        password,
        password_confirmation,
      });

      if (status === 200 && data && data.success) {
        passwordForm.reset();
        setPasswordMessage(data.message || 'Password updated successfully.', 'success');
        if (window.SpendSenseUI) {
          window.SpendSenseUI.showToast('Password updated successfully', 'success');
        }
      } else {
        const errorMsg = (data && data.errors && (data.errors.current_password?.[0] || data.errors.password?.[0]))
          || (data && data.message)
          || 'Failed to update password. Please check your inputs.';
        setPasswordMessage(errorMsg, 'error');
      }
    } catch (err) {
      setPasswordMessage('Unable to reach the server. Please check your network connection.', 'error');
    } finally {
      if (passwordSubmitBtn) {
        passwordSubmitBtn.disabled = false;
        passwordSubmitBtn.textContent = originalText || 'Update password';
      }
    }
  });
}

// Settings may be the first page-level script to ask for identity data. The
// shared bootstrap starts the same request, and loadSessionUser deduplicates it.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadProfile, { once: true });
} else {
  loadProfile();
}
