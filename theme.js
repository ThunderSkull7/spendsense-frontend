/* SpendSense — theme, currency, and shared app-shell behaviour.
   Loaded in <head> on every page. Exposes window.SpendSenseSettings. */
(function () {
  const root = document.documentElement;

  const KEYS = {
    color: "spendsenseThemeColor",
    mode: "spendsenseThemeMode",
    currency: "spendsenseCurrency",
  };

  const currencySymbols = {
    INR: "\u20B9",
    USD: "$",
    EUR: "\u20AC",
    GBP: "\u00A3",
    JPY: "\u00A5",
    AUD: "A$",
    CAD: "C$",
    SGD: "S$",
    AED: "AED ",
  };

  const moneyPattern =
    /([+-]?)\s*(A\$|C\$|S\$|AED\s?|\$|\u20B9|\u20AC|\u00A3|\u00A5)\s?(\d[\d,]*(?:\.\d+)?)/g;

  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "OPTION", "TEXTAREA"]);

  const savedColor = localStorage.getItem(KEYS.color) || "emerald";
  const savedMode = localStorage.getItem(KEYS.mode) || "light";
  const savedCurrency = localStorage.getItem(KEYS.currency) || "INR";

  const symbolFor = (code) => currencySymbols[code] || currencySymbols.INR;

  // Convert hard-coded currency amounts in static markup to the selected symbol.
  const applyMoneySymbols = () => {
    if (!document.body) return;
    const symbol = symbolFor(localStorage.getItem(KEYS.currency) || "INR");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || skipTags.has(node.parentElement.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        moneyPattern.lastIndex = 0;
        return moneyPattern.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach((node) => {
      node.nodeValue = node.nodeValue.replace(
        moneyPattern,
        (match, sign, oldSymbol, amount) => `${sign}${symbol}${amount}`
      );
    });
  };

  const applyTheme = (color, mode) => {
    // Only use the new emerald theme, ignore custom colors
    root.dataset.themeColor = "emerald";
    root.dataset.mode = mode;
    localStorage.setItem(KEYS.color, "emerald");
    localStorage.setItem(KEYS.mode, mode);
    window.dispatchEvent(new CustomEvent("spendsense:theme-change", { detail: { color: "emerald", mode } }));
  };

  const applyCurrency = (currency) => {
    localStorage.setItem(KEYS.currency, currency);
    window.SpendSenseSettings.currency = currency;
    window.SpendSenseSettings.symbol = symbolFor(currency);
    applyMoneySymbols();
    window.dispatchEvent(
      new CustomEvent("spendsense:currency-change", {
        detail: { currency, symbol: window.SpendSenseSettings.symbol },
      })
    );
  };

  // Money + date formatting (INR-first, en-IN grouping).
  const formatMoney = (value, options = {}) => {
    const number = Number(value);
    const amount = Number.isFinite(number) ? number : 0;
    const sign = amount < 0 ? "-" : "";
    const hasFraction = Math.abs(amount) % 1 !== 0;
    const decimals =
      typeof options.decimals === "number" ? options.decimals : hasFraction ? 2 : 0;
    const symbol =
      (window.SpendSenseSettings && window.SpendSenseSettings.symbol) ||
      symbolFor(localStorage.getItem(KEYS.currency) || "INR");
    return `${sign}${symbol}${Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  const formatDate = (value) => {
    if (value === null || value === undefined || value === "") return "";
    const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  // --- App shell behaviour (sidebar, theme toggle, session chip, logout) ---

  const updateShellUser = () => {
    const user = window.SpendSenseAPI && window.SpendSenseAPI.user;
    const name = user && user.name ? user.name : "Account";
    const email = user && user.email ? user.email : "Signed-in session";
    document.querySelectorAll("[data-user-name], #user-name").forEach((el) => {
      el.textContent = name;
    });
    document.querySelectorAll("[data-user-email]").forEach((el) => {
      el.textContent = email;
    });
    document.querySelectorAll("[data-user-avatar]").forEach((el) => {
      el.textContent = (name.trim().charAt(0) || "S").toUpperCase();
    });
  };

  const initShell = () => {
    const body = document.body;

    const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
    const overlay = document.querySelector("[data-sidebar-overlay]");
    const closeSidebar = () => {
      body.classList.remove("sidebar-open");
      if (sidebarToggle) sidebarToggle.setAttribute("aria-expanded", "false");
    };
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        const open = body.classList.toggle("sidebar-open");
        sidebarToggle.setAttribute("aria-expanded", String(open));
      });
    }
    if (overlay) overlay.addEventListener("click", closeSidebar);
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1080) closeSidebar();
    });

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const syncLabel = () =>
        button.setAttribute(
          "aria-label",
          root.dataset.mode === "dark" ? "Switch to light mode" : "Switch to dark mode"
        );
      syncLabel();
      button.addEventListener("click", () => {
        applyTheme(
          root.dataset.themeColor || savedColor,
          root.dataset.mode === "dark" ? "light" : "dark"
        );
        syncLabel();
      });
    });

    document.querySelectorAll("[data-logout]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          if (window.SpendSenseAPI) await window.SpendSenseAPI.logout();
        } catch (e) {
          /* even if the request fails, return to the landing page */
        }
        window.location.href = button.dataset.logoutHref || "../index.html";
      });
    });

    updateShellUser();
    window.addEventListener("spendsense:auth-change", updateShellUser);
    applyMoneySymbols();
  };

  root.dataset.themeColor = savedColor;
  root.dataset.mode = savedMode;

  window.SpendSenseSettings = {
    currency: savedCurrency,
    symbol: symbolFor(savedCurrency),
    currencySymbols,
    applyTheme,
    applyCurrency,
    applyMoneySymbols,
    formatMoney,
    formatDate,
  };

  document.addEventListener("DOMContentLoaded", initShell);
})();
