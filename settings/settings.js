// Settings — profile preferences. Theme and currency persist locally.
const settingsForm = document.querySelector('[data-settings-form]');
const securityForm = document.querySelector('[data-security-form]');
const currencySelect = document.querySelector('[data-currency-select]');
const currencyPreview = document.querySelector('[data-currency-preview]');
const themeColorSelect = document.querySelector('select#themeColor, select[data-theme-color-select], select[data-theme-color]');
const themeModeSelect = document.querySelector('select#themeMode, select[data-theme-mode-select], select[data-theme-mode]');
const settingsMessage = document.querySelector('[data-settings-message]');
const securityMessage = document.querySelector('[data-security-message]');

const settings = window.SpendSenseSettings;

// Populate profile from authenticated session
const nameInput = document.querySelector('#name');
const emailInput = document.querySelector('#email');
const populateUserProfile = () => {
  let user = window.SpendSenseAPI && window.SpendSenseAPI.getUser ? window.SpendSenseAPI.getUser() : null;
  if (!user && typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem('spendsense_user');
      if (cached) user = JSON.parse(cached);
    } catch (e) {}
  }
  if (user) {
    if (nameInput && user.name) nameInput.value = user.name;
    if (emailInput && user.email) emailInput.value = user.email;
  }
};
populateUserProfile();
window.addEventListener('spendsense:auth-change', populateUserProfile);

// Handle hash navigation
const handleHash = () => {
  if (typeof window === 'undefined' || !window.location) return;
  const hash = window.location.hash;
  if (hash === '#security') {
    const sec = document.querySelector('#security');
    if (sec && typeof sec.scrollIntoView === 'function') sec.scrollIntoView({ behavior: 'smooth' });
  } else if (hash === '#profile') {
    const prof = document.querySelector('#profile');
    if (prof && typeof prof.scrollIntoView === 'function') prof.scrollIntoView({ behavior: 'smooth' });
  }
};
if (typeof window !== 'undefined' && window.location && window.location.hash) handleHash();
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('hashchange', handleHash);
}

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

if (settingsForm) {
  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currencySelect) {
      settings.applyCurrency(currencySelect.value);
      renderCurrencyPreview();
    }
    if (settingsMessage)
      settingsMessage.textContent =
        "Profile settings can't be saved yet — nothing was saved. Currency and theme preferences are stored on this device only.";
    if (window.SpendSenseUI)
      window.SpendSenseUI.showToast("Profile settings aren't saved yet — nothing was saved", "warning");
  });
}

if (securityForm) {
  securityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    // SECURITY SETTINGS ARE NOT YET SUPPORTED
    if (window.SpendSenseUI) {
      window.SpendSenseUI.showToast("Security settings are not yet supported", "warning");
    }
  });
}