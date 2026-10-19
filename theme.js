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

  // Canonical palette ids stored in localStorage. Legacy values ("green",
  // "yellow", "sage") are normalised so older saved preferences keep working.
  const COLOR_ALIASES = {
    green: "emerald",
    sage: "emerald",
    emerald: "emerald",
    blue: "blue",
    red: "red",
    crimson: "red",
    rose: "red",
    amber: "amber",
    yellow: "amber",
  };

  const normalizeColor = (value) => COLOR_ALIASES[String(value || "").toLowerCase()] || "emerald";
  const normalizeMode = (value) => (String(value || "").toLowerCase() === "dark" ? "dark" : "light");

  const savedColor = normalizeColor(localStorage.getItem(KEYS.color));
  const savedMode = normalizeMode(localStorage.getItem(KEYS.mode));
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
    const nextColor = normalizeColor(color);
    const nextMode = normalizeMode(mode);
    root.dataset.themeColor = nextColor;
    root.dataset.mode = nextMode;
    localStorage.setItem(KEYS.color, nextColor);
    localStorage.setItem(KEYS.mode, nextMode);
    syncThemeToggleLabels();
    window.dispatchEvent(
      new CustomEvent("spendsense:theme-change", { detail: { color: nextColor, mode: nextMode } })
    );
  };

  const themeColor = () => normalizeColor(root.dataset.themeColor || localStorage.getItem(KEYS.color));
  const themeMode = () => normalizeMode(root.dataset.mode || localStorage.getItem(KEYS.mode));

  // Keep every theme toggle's accessible state in sync, including when the
  // mode is changed from Settings rather than by the toggle itself.
  const syncThemeToggleLabels = () => {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const dark = root.dataset.mode === "dark";
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("aria-pressed", String(dark));
    });
  };

  // --- Categorical chart colours -------------------------------------------
  // The palette lives in CSS custom properties (--chart-1 … --chart-10) so
  // light and dark mode can tune it; these helpers read the live values.

  const CHART_PALETTE_SIZE = 10;
  const CHART_COLOR_FALLBACKS = [
    "#059669", "#2563EB", "#D97706", "#7C3AED", "#DC2626",
    "#0891B2", "#DB2777", "#92400E", "#64748B", "#1E293B",
  ];

  const chartColors = () => {
    const computed = getComputedStyle(root);
    return CHART_COLOR_FALLBACKS.map(
      (fallback, index) => computed.getPropertyValue(`--chart-${index + 1}`).trim() || fallback
    );
  };

  const hashKey = (key) => {
    const text = String(key);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
  };

  const numericCategoryId = (key) => {
    const match = /^cat:(\d+)$/.exec(String(key));
    return match ? Number(match[1]) : null;
  };

  // A category's palette slot depends only on its own stable key. Numeric
  // category ids use id % palette size; name-only fallbacks use an FNV hash.
  // This means sorting, adding, or deleting categories can never recolour an
  // unrelated category. With more than ten categories two categories can share
  // a hue: that is the documented fallback (labels, legends, and tooltips still
  // identify each segment), avoiding a set-dependent assignment that would
  // shuffle existing colours whenever one category is removed.
  const toneSlot = (key) => {
    const id = numericCategoryId(key);
    return id === null ? hashKey(key) % CHART_PALETTE_SIZE : id % CHART_PALETTE_SIZE;
  };

  const categoryTones = (keys) => {
    const tones = new Map();
    [...new Set(keys.map((key) => String(key)))].forEach((key) => {
      tones.set(key, toneSlot(key));
    });
    return tones;
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

  // Add a skip link before the shell is used. It is inserted rather than
  // repeated in every page so keyboard users get the same shortcut everywhere.
  const ensureSkipLink = () => {
    // Prefer the semantic <main> so the skip link bypasses the topbar too.
    // The .main wrapper is only a fallback for any page without a landmark.
    const main = document.querySelector("main") || document.querySelector(".main");
    if (!main || document.querySelector(".skip-link")) return;
    if (!main.id) main.id = "main-content";
    // The fragment target must be focusable or browsers leave focus on <body>,
    // which sends the next Tab press back to the start of the page.
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    const link = document.createElement("a");
    link.className = "skip-link";
    link.href = "#" + main.id;
    link.textContent = "Skip to main content";
    link.addEventListener("click", () => main.focus({ preventScroll: true }));
    document.body.insertBefore(link, document.body.firstChild);
  };

  const initShell = () => {
    const body = document.body;
    ensureSkipLink();

    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.classList.contains("active")) link.setAttribute("aria-current", "page");
    });

    const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
    const overlay = document.querySelector("[data-sidebar-overlay]");
    const closeSidebar = (restoreFocus = false) => {
      const wasOpen = body.classList.contains("sidebar-open");
      body.classList.remove("sidebar-open");
      if (sidebarToggle) sidebarToggle.setAttribute("aria-expanded", "false");
      if (restoreFocus && wasOpen && sidebarToggle) sidebarToggle.focus();
    };
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        const open = body.classList.toggle("sidebar-open");
        sidebarToggle.setAttribute("aria-expanded", String(open));
        if (open) {
          const firstLink = body.querySelector(".sidebar-link");
          if (firstLink) firstLink.focus();
        }
      });
    }
    if (overlay) overlay.addEventListener("click", () => closeSidebar());
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1080) closeSidebar();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar(true);
    });

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(
          root.dataset.themeColor || savedColor,
          root.dataset.mode === "dark" ? "light" : "dark"
        );
      });
    });
    syncThemeToggleLabels();

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
  // Persist normalised values so legacy "green"/"yellow" entries migrate.
  localStorage.setItem(KEYS.color, savedColor);
  localStorage.setItem(KEYS.mode, savedMode);

  window.SpendSenseSettings = {
    currency: savedCurrency,
    symbol: symbolFor(savedCurrency),
    currencySymbols,
    applyTheme,
    applyCurrency,
    applyMoneySymbols,
    formatMoney,
    formatDate,
    themeColor,
    themeMode,
    chartColors,
    categoryTones,
  };

  document.addEventListener("DOMContentLoaded", initShell);
})();
