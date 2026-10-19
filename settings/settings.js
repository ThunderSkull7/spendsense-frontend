// Settings — local display preferences. Theme and currency persist on this device.
const currencySelect = document.querySelector('[data-currency-select]');
const currencyPreview = document.querySelector('[data-currency-preview]');
const paletteInputs = Array.from(document.querySelectorAll('input[name="themeColor"]'));
const modeInputs = Array.from(document.querySelectorAll('input[name="themeMode"]'));
const settingsMessage = document.querySelector('[data-settings-message]');

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
    if (settingsMessage) {
      settingsMessage.textContent = "Display currency updated and saved on this device.";
    }
  });
}

// ---------- Appearance: palette + mode ----------
// theme.js is the single source of truth; these controls only reflect and
// update it. A theme change applies instantly and persists on this device.
const syncThemeControls = () => {
  const color = settings.themeColor ? settings.themeColor() : "emerald";
  const mode = settings.themeMode ? settings.themeMode() : "light";
  paletteInputs.forEach((input) => {
    input.checked = input.value === color;
  });
  modeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
};

paletteInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) settings.applyTheme(input.value, settings.themeMode());
  });
});

modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) settings.applyTheme(settings.themeColor(), input.value);
  });
});

// Keep these controls in sync when the topbar toggle changes the mode.
window.addEventListener("spendsense:theme-change", syncThemeControls);
syncThemeControls();
