/* SpendSense — theme, currency, and shared app-shell behaviour.
   Loaded in <head> on every page. Exposes window.SpendSenseSettings. */
(function () {
  const root = document.documentElement;

  const KEYS = {
    color: "spendsenseThemeColor",
    mode: "spendsenseThemeMode",
    currency: "spendsenseCurrency",
  };

  const memStorage = new Map();
  const safeStorage = {
    getItem(key) {
      try {
        if (typeof localStorage !== "undefined" && localStorage) {
          return localStorage.getItem(key);
        }
      } catch (e) {
        /* storage blocked/unavailable, fallback to memory */
      }
      return memStorage.has(key) ? memStorage.get(key) : null;
    },
    setItem(key, value) {
      try {
        if (typeof localStorage !== "undefined" && localStorage) {
          localStorage.setItem(key, String(value));
          return;
        }
      } catch (e) {
        /* storage blocked/unavailable, fallback to memory */
      }
      memStorage.set(key, String(value));
    },
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

  const savedColor = safeStorage.getItem(KEYS.color) || "green";
  const savedMode = safeStorage.getItem(KEYS.mode) || "light";
  const savedCurrency = safeStorage.getItem(KEYS.currency) || "INR";

  const symbolFor = (code) => currencySymbols[code] || currencySymbols.INR;

  // Convert hard-coded currency amounts in static markup to the selected symbol.
  const applyMoneySymbols = () => {
    if (!document.body) return;
    const symbol = symbolFor(safeStorage.getItem(KEYS.currency) || "INR");
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
    const chosenColor = color || safeStorage.getItem(KEYS.color) || "green";
    const chosenMode = mode || safeStorage.getItem(KEYS.mode) || "light";
    root.dataset.themeColor = chosenColor;
    root.dataset.mode = chosenMode;
    safeStorage.setItem(KEYS.color, chosenColor);
    safeStorage.setItem(KEYS.mode, chosenMode);
    window.dispatchEvent(
      new CustomEvent("spendsense:theme-change", { detail: { color: chosenColor, mode: chosenMode } })
    );
  };

  const themeColor = () => root.dataset.themeColor || safeStorage.getItem(KEYS.color) || "green";
  const themeMode = () => root.dataset.mode || safeStorage.getItem(KEYS.mode) || "light";

  const applyCurrency = (currency) => {
    safeStorage.setItem(KEYS.currency, currency);
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
      symbolFor(safeStorage.getItem(KEYS.currency) || "INR");
    return `${sign}${symbol}${Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  const formatDate = (value) => {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return "";
      return value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
    const str = String(value).trim();
    if (!str) return "";

    // Date-only string "YYYY-MM-DD"
    const dateOnlyMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const y = parseInt(dateOnlyMatch[1], 10);
      const m = parseInt(dateOnlyMatch[2], 10) - 1;
      const d = parseInt(dateOnlyMatch[3], 10);
      return new Date(y, m, d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    // Laravel midnight timestamp: "YYYY-MM-DD[T ]00:00:00(.000000)?(Z|[+-]00:00)?"
    const midnightMatch = str.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ]00:00:00(?:\.0+)?(?:Z|[+-]00:00)?$/
    );
    if (midnightMatch) {
      const y = parseInt(midnightMatch[1], 10);
      const m = parseInt(midnightMatch[2], 10) - 1;
      const d = parseInt(midnightMatch[3], 10);
      return new Date(y, m, d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    // Datetime with actual time (e.g. 2026-10-19T22:30:00Z)
    const date = new Date(str.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return str;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const todayInputValue = () => {
    const local = new Date();
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, "0");
    const d = String(local.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // --- Category-to-Color deterministic mapping & Chart Colors ---
  const DEFAULT_CHART_COLORS = [
    "#059669", // Slot 0: Emerald (Food & Dining)
    "#65A30D", // Slot 1: Lime Green (Groceries)
    "#2563EB", // Slot 2: Blue (Transport)
    "#D97706", // Slot 3: Amber (Bills & Utilities)
    "#7C3AED", // Slot 4: Violet (Education)
    "#EA580C", // Slot 5: Coral (Entertainment)
    "#4F46E5", // Slot 6: Indigo (Rent & Housing)
    "#E11D48", // Slot 7: Rose (Healthcare)
    "#0284C7", // Slot 8: Cyan / Sky (Shopping)
    "#9333EA", // Slot 9: Purple (Other / Misc)
  ];

  const KNOWN_CATEGORY_NAMES = {
    food: 0,
    dining: 0,
    restaurant: 0,
    groceries: 1,
    grocery: 1,
    market: 1,
    transport: 2,
    travel: 2,
    commute: 2,
    fuel: 2,
    metro: 2,
    cab: 2,
    bills: 3,
    bill: 3,
    utilities: 3,
    utility: 3,
    electricity: 3,
    water: 3,
    education: 4,
    tuition: 4,
    learning: 4,
    books: 4,
    entertainment: 5,
    leisure: 5,
    movies: 5,
    gaming: 5,
    rent: 6,
    housing: 6,
    mortgage: 6,
    healthcare: 7,
    health: 7,
    medical: 7,
    doctor: 7,
    pharmacy: 7,
    medicine: 7,
    shopping: 8,
    clothes: 8,
    clothing: 8,
    retail: 8,
    salary: 0,
    freelance: 2,
    business: 4,
    investments: 6,
    rental: 8,
    other: 9,
    miscellaneous: 9,
  };

  const TONE_NAMES = [
    "emerald",
    "lime",
    "blue",
    "amber",
    "violet",
    "coral",
    "indigo",
    "rose",
    "cyan",
    "purple",
  ];

  const categoryTones = (keys = []) => {
    const map = new Map();
    for (const key of keys) {
      const strKey = String(key || "").trim();
      const lowerKey = strKey.toLowerCase();
      let slot = 0;

      if (lowerKey.startsWith("cat:")) {
        const id = parseInt(strKey.slice(4), 10);
        if (Number.isFinite(id) && id > 0) {
          slot = (id - 1) % 10;
        } else {
          slot = 0;
        }
      } else if (lowerKey.startsWith("name:")) {
        const name = strKey.slice(5).trim().toLowerCase();
        let matched = false;
        // 1. Exact match
        if (Object.prototype.hasOwnProperty.call(KNOWN_CATEGORY_NAMES, name)) {
          slot = KNOWN_CATEGORY_NAMES[name];
          matched = true;
        }
        // 2. Word-boundary match (e.g. "Food & Dining" matches "food", but "parenting" doesn't match "rent")
        if (!matched) {
          for (const [kw, s] of Object.entries(KNOWN_CATEGORY_NAMES)) {
            const regex = new RegExp(`(^|[\\s_/-])${kw}([\\s_/-]|$)`, "i");
            if (regex.test(name)) {
              slot = s;
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          let h = 0;
          for (let i = 0; i < name.length; i++) {
            h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
          }
          slot = Math.abs(h) % 10;
        }
      } else {
        const num = parseInt(strKey, 10);
        if (Number.isFinite(num) && num > 0) {
          slot = (num - 1) % 10;
        } else {
          let h = 0;
          for (let i = 0; i < strKey.length; i++) {
            h = (Math.imul(31, h) + strKey.charCodeAt(i)) | 0;
          }
          slot = Math.abs(h) % 10;
        }
      }
      map.set(key, slot);
    }
    return map;
  };

  const chartColors = () => {
    let style = null;
    try {
      if (typeof getComputedStyle === "function" && root) {
        style = getComputedStyle(root);
      }
    } catch (e) {
      /* ignore */
    }
    return Array.from({ length: 10 }, (_, i) => {
      const varName = `--chart-${i + 1}`;
      const val = style ? style.getPropertyValue(varName).trim() : "";
      return val || DEFAULT_CHART_COLORS[i];
    });
  };

  const hexToRgba = (color, alpha = 1) => {
    if (typeof color === "string" && color.startsWith("#")) {
      const hex = color.slice(1);
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16) || 0;
        const g = parseInt(hex.slice(2, 4), 16) || 0;
        const b = parseInt(hex.slice(4, 6), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    return color;
  };

  const getCategoryTone = (categoryOrName, id = null) => {
    let key = "";
    if (typeof categoryOrName === "object" && categoryOrName !== null) {
      if (categoryOrName.id != null) {
        key = `cat:${categoryOrName.id}`;
      } else if (categoryOrName.name) {
        key = `name:${categoryOrName.name}`;
      }
    } else if (id != null) {
      key = `cat:${id}`;
    } else if (typeof categoryOrName === "string" || typeof categoryOrName === "number") {
      const str = String(categoryOrName);
      const lower = str.toLowerCase();
      if (lower.startsWith("cat:") || lower.startsWith("name:")) {
        key = str;
      } else if (/^\d+$/.test(str)) {
        key = `cat:${str}`;
      } else {
        key = `name:${str}`;
      }
    }
    const map = categoryTones([key]);
    const slot = map.get(key) || 0;
    const colors = chartColors();
    const color = colors[slot] || DEFAULT_CHART_COLORS[slot];
    return {
      slot,
      color,
      toneName: TONE_NAMES[slot] || "emerald",
      bgSubtle: hexToRgba(color, 0.12),
      borderSubtle: hexToRgba(color, 0.28),
    };
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
    todayInputValue,
    themeColor,
    themeMode,
    categoryTones,
    chartColors,
    getCategoryTone,
    hexToRgba,
  };

  document.addEventListener("DOMContentLoaded", initShell);
})();
