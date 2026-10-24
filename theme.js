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

  const VALID_PALETTES = new Set(["green", "blue", "red", "amber"]);
  const normalizePalette = (c) => {
    const raw = String(c || "").trim().toLowerCase();
    if (raw === "rose") return "red";
    if (raw === "yellow") return "amber";
    if (raw === "emerald" || raw === "clean-light") return "green";
    return VALID_PALETTES.has(raw) ? raw : "green";
  };

  const rawSavedColor = safeStorage.getItem(KEYS.color);
  const savedColor = normalizePalette(rawSavedColor || "green");
  const savedMode = safeStorage.getItem(KEYS.mode) === "dark" ? "dark" : "light";
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
    const chosenColor = normalizePalette(color || safeStorage.getItem(KEYS.color) || "green");
    const chosenMode = mode ? (mode === "dark" ? "dark" : "light") : (safeStorage.getItem(KEYS.mode) === "dark" ? "dark" : "light");
    root.dataset.themeColor = chosenColor;
    root.dataset.mode = chosenMode;
    safeStorage.setItem(KEYS.color, chosenColor);
    safeStorage.setItem(KEYS.mode, chosenMode);
    window.dispatchEvent(
      new CustomEvent("spendsense:theme-change", { detail: { color: chosenColor, mode: chosenMode } })
    );
  };

  const themeColor = () => root.dataset.themeColor || normalizePalette(safeStorage.getItem(KEYS.color) || "green");
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

  // --- App shell behaviour (sidebar, theme toggle, account dropdown, session chip, logout) ---
  const updateShellUser = () => {
    let user = window.SpendSenseAPI && window.SpendSenseAPI.user;
    if (!user && typeof localStorage !== "undefined") {
      try {
        const cached = localStorage.getItem("spendsense_user");
        if (cached) user = JSON.parse(cached);
      } catch (e) {}
    }
    const name = user && user.name ? user.name : "Account";
    const email = user && user.email ? user.email : "Signed-in session";
    const initial = (name.trim().charAt(0) || "S").toUpperCase();

    document.querySelectorAll("[data-user-name], #user-name").forEach((el) => {
      el.textContent = name;
    });
    document.querySelectorAll("[data-user-email]").forEach((el) => {
      el.textContent = email;
    });
    document.querySelectorAll("[data-user-avatar]").forEach((el) => {
      el.textContent = initial;
    });
  };

  const ensureTopbarAccountMenu = () => {
    const actions = document.querySelector(".topbar-actions");
    if (!actions || actions.querySelector("[data-account-menu]")) return;

    const menu = document.createElement("div");
    menu.className = "account-menu";
    menu.setAttribute("data-account-menu", "");
    menu.innerHTML = `
      <button class="account-trigger" type="button" aria-haspopup="menu" aria-expanded="false" id="account-menu-trigger" aria-label="Account menu">
        <span class="user-avatar" data-user-avatar>S</span>
        <span class="account-name" data-user-name>Account</span>
        <svg class="dropdown-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="account-dropdown" role="menu" aria-labelledby="account-menu-trigger" hidden>
        <div class="dropdown-header">
          <div class="dropdown-profile-badge">
            <span class="user-avatar lg" data-user-avatar>S</span>
            <div class="dropdown-profile-info">
              <span class="dropdown-profile-title">Signed in as</span>
              <strong class="dropdown-profile-name" data-user-name>Account</strong>
              <span class="dropdown-profile-email" data-user-email>Signed-in session</span>
            </div>
          </div>
        </div>
        <div class="dropdown-divider" role="separator"></div>
        <div class="dropdown-nav" role="none">
          <a class="dropdown-link" href="../settings/settings.html#profile" role="menuitem">
            <span class="dropdown-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </span>
            <span class="dropdown-label">My Profile</span>
          </a>
          <a class="dropdown-link" href="../settings/settings.html" role="menuitem">
            <span class="dropdown-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </span>
            <span class="dropdown-label">Settings</span>
          </a>
          <a class="dropdown-link" href="../settings/settings.html#security" role="menuitem">
            <span class="dropdown-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </span>
            <span class="dropdown-label">Security &amp; Password</span>
          </a>
          <a class="dropdown-link" href="../support/support.html" role="menuitem">
            <span class="dropdown-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 1 1 3.8 2.6c-.8.3-1 .9-1 1.6v.4"/><path d="M12 17.2v.01"/>
              </svg>
            </span>
            <span class="dropdown-label">Help &amp; Support</span>
          </a>
        </div>
        <div class="dropdown-divider" role="separator"></div>
        <div class="dropdown-footer" role="none">
          <button class="dropdown-link dropdown-logout" type="button" role="menuitem" data-logout>
            <span class="dropdown-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            <span class="dropdown-label">Log out</span>
          </button>
        </div>
      </div>
    `;
    actions.appendChild(menu);
  };

  const initAccountDropdowns = () => {
    ensureTopbarAccountMenu();

    const menus = document.querySelectorAll("[data-account-menu], [data-account-dropdown]");
    menus.forEach((menu) => {
      const trigger = menu.querySelector(".account-trigger, [data-account-trigger], #account-menu-trigger");
      const dropdown = menu.querySelector(".account-dropdown, [data-account-menu-panel]");
      if (!trigger || !dropdown) return;

      const openDropdown = () => {
        dropdown.removeAttribute("hidden");
        trigger.setAttribute("aria-expanded", "true");
      };

      const closeDropdown = () => {
        dropdown.setAttribute("hidden", "true");
        trigger.setAttribute("aria-expanded", "false");
      };

      const toggleDropdown = () => {
        const isHidden = dropdown.hasAttribute("hidden");
        if (isHidden) openDropdown();
        else closeDropdown();
      };

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDropdown();
      });

      menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeDropdown();
          trigger.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const items = Array.from(dropdown.querySelectorAll('a[role="menuitem"], button[role="menuitem"]'));
          if (!items.length) return;
          e.preventDefault();
          if (dropdown.hasAttribute("hidden")) {
            openDropdown();
            items[0].focus();
            return;
          }
          const activeIndex = items.indexOf(document.activeElement);
          if (e.key === "ArrowDown") {
            const next = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
            items[next].focus();
          } else {
            const prev = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
            items[prev].focus();
          }
        } else if (e.key === "Home" && !dropdown.hasAttribute("hidden")) {
          const items = dropdown.querySelectorAll('a[role="menuitem"], button[role="menuitem"]');
          if (items.length) { e.preventDefault(); items[0].focus(); }
        } else if (e.key === "End" && !dropdown.hasAttribute("hidden")) {
          const items = dropdown.querySelectorAll('a[role="menuitem"], button[role="menuitem"]');
          if (items.length) { e.preventDefault(); items[items.length - 1].focus(); }
        } else if (e.key === "Tab" && !dropdown.hasAttribute("hidden")) {
          // If tabbing away from the dropdown, close it cleanly
          setTimeout(() => {
            if (!menu.contains(document.activeElement)) {
              closeDropdown();
            }
          }, 0);
        }
      });
    });

    document.addEventListener("click", (e) => {
      document.querySelectorAll(".account-dropdown:not([hidden])").forEach((dropdown) => {
        const menu = dropdown.closest("[data-account-menu], [data-account-dropdown]");
        if (menu && !menu.contains(e.target)) {
          dropdown.setAttribute("hidden", "true");
          const trigger = menu.querySelector(".account-trigger, [data-account-trigger], #account-menu-trigger");
          if (trigger) trigger.setAttribute("aria-expanded", "false");
        }
      });
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

    // Delegated logout handler: supports static and dynamically added logout buttons
    document.addEventListener("click", async (e) => {
      const button = e.target.closest("[data-logout]");
      if (!button) return;
      button.disabled = true;
      try {
        if (window.SpendSenseAPI) await window.SpendSenseAPI.logout();
      } catch (err) {
        /* even if the request fails, return to the landing page */
      }
      window.location.href = button.dataset.logoutHref || "../index.html";
    });

    initAccountDropdowns();
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
