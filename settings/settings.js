// Settings — profile preferences. Theme and currency persist locally.
const settingsForm = document.querySelector('[data-settings-form]');
const securityForm = document.querySelector('[data-security-form]');
const currencySelect = document.querySelector('[data-currency-select]');
const currencyPreview = document.querySelector('[data-currency-preview]');
const themeColorSelect = document.querySelector('[data-theme-color]');
const themeModeSelect = document.querySelector('[data-theme-mode]');
const settingsMessage = document.querySelector('[data-settings-message]');
const securityMessage = document.querySelector('[data-security-message]');

const settings = window.SpendSenseSettings;

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
  themeColorSelect.addEventListener("change", () => {
    settings.applyTheme(themeColorSelect.value, themeModeSelect ? themeModeSelect.value : (settings ? settings.themeMode() : "light"));
  });
}

if (themeModeSelect) {
  themeModeSelect.value = (settings && settings.themeMode) ? settings.themeMode() : "light";
  themeModeSelect.addEventListener("change", () => {
    settings.applyTheme(themeColorSelect ? themeColorSelect.value : (settings ? settings.themeColor() : "green"), themeModeSelect.value);
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