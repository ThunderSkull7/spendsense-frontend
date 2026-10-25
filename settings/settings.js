// Settings — profile preferences. The display name is saved through the
// authenticated profile API; theme and currency remain device preferences.
const settingsForm = document.querySelector('[data-settings-form]');
const currencySelect = document.querySelector('[data-currency-select]');
const currencyPreview = document.querySelector('[data-currency-preview]');
const themeColorSelect = document.querySelector('select#themeColor, select[data-theme-color-select], select[data-theme-color]');
const themeModeSelect = document.querySelector('select#themeMode, select[data-theme-mode-select], select[data-theme-mode]');
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

if (themeColorSelect) {
  themeColorSelect.value = (settings && settings.themeColor) ? settings.themeColor() : "green";
  themeColorSelect.addEventListener("change", (e) => {
    const color = (e && e.target && e.target.value) || themeColorSelect.value;
    const mode = themeModeSelect ? themeModeSelect.value : (settings ? settings.themeMode() : "light");
    settings.applyTheme(color, mode);
  });
}

if (themeModeSelect) {
  themeModeSelect.value = (settings && settings.themeMode) ? settings.themeMode() : "light";
  themeModeSelect.addEventListener("change", (e) => {
    const mode = (e && e.target && e.target.value) || themeModeSelect.value;
    const color = themeColorSelect ? themeColorSelect.value : (settings ? settings.themeColor() : "green");
    settings.applyTheme(color, mode);
  });
}

window.addEventListener("spendsense:theme-change", (event) => {
  if (event.detail) {
    if (themeColorSelect && event.detail.color) themeColorSelect.value = event.detail.color;
    if (themeModeSelect && event.detail.mode) themeModeSelect.value = event.detail.mode;
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

// Settings may be the first page-level script to ask for identity data. The
// shared bootstrap starts the same request, and loadSessionUser deduplicates it.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadProfile, { once: true });
} else {
  loadProfile();
}
