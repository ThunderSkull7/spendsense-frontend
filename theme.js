/* SpendSense — theme, currency, and shared app-shell behaviour.
   Loaded in <head> on every page. Exposes window.SpendSenseSettings. */
(function () {
  const root = document.documentElement;

  const KEYS = {
    color: "spendsenseThemeColor",
    mode: "spendsenseThemeMode",
    currency: "spendsenseCurrency",
  };

  // localStorage can throw in hardened/private browser modes. Preferences are
  // optional, so every access degrades to an in-memory fallback instead of
  // aborting the whole shell (skip link, theme controls, navigation).
  const memoryStore = new Map();
  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return memoryStore.has(key) ? memoryStore.get(key) : null;
      }
    },
    set(key, value) {
      const text = String(value);
      memoryStore.set(key, text);
      try {
        localStorage.setItem(key, text);
      } catch (e) {
        /* the in-memory copy keeps this page working */
      }
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

  const savedColor = normalizeColor(storage.get(KEYS.color));
  const savedMode = normalizeMode(storage.get(KEYS.mode));
  const savedCurrency = storage.get(KEYS.currency) || "INR";

  const symbolFor = (code) => currencySymbols[code] || currencySymbols.INR;

  // Convert hard-coded currency amounts in static markup to the selected symbol.
  const applyMoneySymbols = () => {
    if (!document.body) return;
    const symbol = symbolFor(storage.get(KEYS.currency) || "INR");
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
    storage.set(KEYS.color, nextColor);
    storage.set(KEYS.mode, nextMode);
    syncThemeToggleLabels();
    window.dispatchEvent(
      new CustomEvent("spendsense:theme-change", { detail: { color: nextColor, mode: nextMode } })
    );
  };

  const themeColor = () => normalizeColor(root.dataset.themeColor || storage.get(KEYS.color));
  const themeMode = () => normalizeMode(root.dataset.mode || storage.get(KEYS.mode));

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
    storage.set(KEYS.currency, currency);
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
      symbolFor(storage.get(KEYS.currency) || "INR");
    return `${sign}${symbol}${Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  // Date-only values (YYYY-MM-DD, or Laravel's date-cast
  // "YYYY-MM-DDT00:00:00.000000Z") describe a calendar date, not an instant.
  // Parsing them with new Date() and formatting in local time shifts the day
  // for users west of UTC, so the date parts are read directly instead.
  const dateOnlyMatch = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?Z)?$/.exec(String(value).trim());
    return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
  };

  const formatDate = (value) => {
    if (value === null || value === undefined || value === "") return "";
    const parts = dateOnlyMatch(value);
    const date = parts
      ? new Date(parts.year, parts.month - 1, parts.day)
      : value instanceof Date
        ? value
        : new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Today's calendar date in the user's local timezone, as YYYY-MM-DD.
  // <input type="date"> expects exactly this; valueAsDate converts through
  // UTC and returns yesterday just after local midnight in positive offsets.
  const todayInputValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
  };

  // --- App shell behaviour (sidebar, theme toggle, session chip, logout) ---

  const updateShellUser = () => {
    const user = window.SpendSenseAPI && window.SpendSenseAPI.user;
    const name = user && user.name ? user.name : "Account";
    const email = user && user.email ? user.email : "Not signed in";
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

  // Protected pages declare data-requires-auth. Verify the Sanctum session
  // once on load: hydrate the shell with the real user, or send a signed-out
  // visitor to the login page instead of leaving placeholder identity and a
  // grid of failed panels on screen.
  let redirectingToLogin = false;
  const loginHref = () => {
    const body = document.body;
    return (body && body.getAttribute("data-login-href")) || "authentication/login.html";
  };
  const redirectToLogin = (expired) => {
    if (redirectingToLogin) return;
    redirectingToLogin = true;
    const here = window.location.pathname + window.location.search;
    const separator = loginHref().includes("?") ? "&" : "?";
    window.location.replace(
      `${loginHref()}${separator}next=${encodeURIComponent(here)}${expired ? "&expired=1" : ""}`
    );
  };

  const checkSession = async () => {
    const body = document.body;
    if (!body) return;
    const protectedPage = body.hasAttribute("data-requires-auth");
    // Public app-shell pages (e.g. Support) have the identity chip but must
    // stay reachable; hydrate them without redirecting.
    if (!protectedPage && !body.querySelector("[data-user-name], [data-user-email]")) return;
    const meta = document.querySelector('meta[name="api-base-url"]');
    const base = meta ? meta.content : "";
    try {
      const response = await fetch(`${base}/user`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        if (protectedPage) redirectToLogin(false);
        return;
      }
      if (response.ok) {
        const user = await response.json();
        if (window.SpendSenseAPI && typeof window.SpendSenseAPI.setUser === "function") {
          window.SpendSenseAPI.setUser(user);
        }
        updateShellUser();
      }
    } catch (e) {
      /* Offline or unreachable API: page-specific error states handle it. */
    }
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

  // The sidebar markup is copied into every page, so the highlighted entry is
  // not trusted: it is recomputed here from the current URL, and stale hardcoded
  // "active" classes (pages that copied an older shell) are cleared. This keeps
  // highlighting correct everywhere — e.g. Notifications highlights
  // Notifications, never Reports.
  const highlightCurrentNav = () => {
    const current = decodeURIComponent(window.location.pathname)
      .replace(/\\/g, "/")
      .toLowerCase();
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let linkPath;
      try {
        linkPath = decodeURIComponent(new URL(href, window.location.href).pathname)
          .replace(/\\/g, "/")
          .toLowerCase();
      } catch (e) {
        return;
      }
      if (linkPath.endsWith("/")) linkPath += "index.html";
      const isActive = linkPath === current;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };

  const initShell = () => {
    const body = document.body;
    ensureSkipLink();
    highlightCurrentNav();

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
    window.addEventListener("spendsense:session-expired", () => {
      if (!document.body || !document.body.hasAttribute("data-requires-auth")) return;
      // Only call it an expired session if this page had actually loaded a
      // user; a never-signed-in visitor should get the neutral login prompt.
      const knownUser = window.SpendSenseAPI && window.SpendSenseAPI.user;
      redirectToLogin(Boolean(knownUser));
    });
    applyMoneySymbols();
    checkSession();
  };

  root.dataset.themeColor = savedColor;
  root.dataset.mode = savedMode;
  // Persist normalised values so legacy "green"/"yellow" entries migrate.
  storage.set(KEYS.color, savedColor);
  storage.set(KEYS.mode, savedMode);

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
    chartColors,
    categoryTones,
  };

  document.addEventListener("DOMContentLoaded", initShell);
})();
