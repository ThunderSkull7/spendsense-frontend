// SpendSense — Unified Frontend Script
// Uses window.SpendSenseAPI with credentials: 'include' for Sanctum cookie-based auth

let API_BASE_URL = ''; // configured via API.init() from <meta name="api-base-url">
const API = {
  // Initialize with base URL from meta tag
  init(baseUrl) {
    API_BASE_URL = baseUrl;
  },

  // Core fetch helper: sends JSON with credentials (Sanctum cookie-based auth)
  // Automatically fetches and sends XSRF-TOKEN for state-changing requests.
  async api(method, endpoint, body = null, csrfToken = null) {
    const url = `${API_BASE_URL}/api${endpoint}`;
    const options = {
      method,
      credentials: 'include', // send Sanctum session cookie
      headers: { 'Content-Type': 'application/json' },
    };
    // Add XSRF-TOKEN header if provided (required for POST/PUT/DELETE on stateful routes)
    if (csrfToken !== null) {
      options.headers['X-XSRF-TOKEN'] = csrfToken;
    }
    if (body !== null) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);

    // A stale XSRF-TOKEN (e.g. after the session rotates on login) returns 419.
    // Refresh the token once and retry the request before surfacing the error.
    if (response.status === 419 && csrfToken !== null) {
      const freshToken = await fetchXSRFToken();
      if (freshToken && freshToken !== csrfToken) {
        return this.api(method, endpoint, body, freshToken);
      }
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { message: response.statusText };
    }
    // Handle common error codes client-side
    if (response.status === 419) {
      data = { message: 'CSRF token mismatch. Please log in again.' };
    }
    if (response.status === 401 && data.message === 'Unauthenticated.') {
      data = { message: 'Session expired. Please log in again.', expired: true };
    }
    return { response, data, status: response.status };
  },

  // Shortcuts for common operations.
  // State-changing requests automatically include the current XSRF-TOKEN so
  // Sanctum's CSRF protection accepts them on stateful routes.
  async post(endpoint, body) { return this.api('POST', endpoint, body, await this.ensureCsrfToken()); },
  get(endpoint) { return this.api('GET', endpoint); },
  async put(endpoint, body) { return this.api('PUT', endpoint, body, await this.ensureCsrfToken()); },
  async delete(endpoint) { return this.api('DELETE', endpoint, null, await this.ensureCsrfToken()); },

  // Read the current XSRF-TOKEN cookie value (set by Laravel on stateful responses).
  getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  },

  // Make sure an XSRF-TOKEN cookie exists before a state-changing request.
  // fetchXSRFToken (defined below) primes/refreshes the cookie.
  async ensureCsrfToken() {
    const existing = this.getCsrfToken();
    if (existing !== null) return existing;
    try {
      return await fetchXSRFToken();
    } catch (e) {
      return null;
    }
  },

  // Authentication helpers
  async login(email, password) {
    const { data, status } = await this.post('/login', { email, password });
    if (status === 200) {
      return { success: true, user: data.user, message: data.message };
    }
    return { success: false, message: data.message || 'Login failed' };
  },

  async logout() {
    const { status } = await this.post('/logout');
    return { success: status === 200 };
  },

  // Register new user
  async register(name, email, password) {
    const { data, status } = await this.post('/register', { name, email, password, password_confirmation: password });
    if (status === 201) {
      return { success: true, user: data.user, message: data.message };
    }
    return { success: false, message: data.message || 'Registration failed' };
  },

  // Session user known to this page (set on login/register; the shell shows it).
  user: null,

  setUser(user) {
    API.user = user;
    window.dispatchEvent(new CustomEvent('spendsense:auth-change'));
    return user;
  },

  // Check if user has a session in memory (persistent across API calls on this page)
  isAuthenticated() {
    return !!API.user;
  },

  getUser() {
    return API.user || null;
  },

  // Formatting helpers shared with SpendSenseSettings (theme.js)
  formatMoney(value, options) {
    if (window.SpendSenseSettings) return window.SpendSenseSettings.formatMoney(value, options);
    return String(value);
  },

  formatDate(value) {
    if (window.SpendSenseSettings) return window.SpendSenseSettings.formatDate(value);
    return String(value || '');
  },

  // Login/logout helpers for other modules
  loginWithAPI(email, password) { return this.login(email, password); },
  logoutWithAPI() { return this.logout(); },
};

// ---- CSRF management ----

let cachedXSRFToken = null;

// Fetch the XSRF-TOKEN cookie from the /sanctum/csrf-cookie endpoint.
// The response sets the XSRF-TOKEN cookie, which we then read and cache.
async function fetchXSRFToken() {
  const csrfResp = await API.get('/sanctum/csrf-cookie');
  // The XSRF-TOKEN cookie should now be in the jar; read it back from document.cookie.
  const cookies = document.cookie.match(/(XSRF-TOKEN)=([^;]+)/);
  if (cookies) {
    cachedXSRFToken = decodeURIComponent(cookies[2]);
  } else {
    // Fallback: try to read from the response headers
    const setCookie = csrfResp.response.headers['set-cookie'];
    if (setCookie) {
      const match = setCookie[0].match(/XSRF-TOKEN=([^;]+)/);
      if (match) {
        cachedXSRFToken = decodeURIComponent(match[1]);
      }
    }
  }
  return cachedXSRFToken;
}

// --- UI Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  // Read API base URL from meta tag
  const metaBase = document.querySelector('meta[name="api-base-url"]');
  if (metaBase) API.init(metaBase.content);

  // --- Landing page navigation toggle (small screens) ---
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('[data-nav-links]');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.addEventListener('click', (event) => {
      if (event.target.tagName === 'A') {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- Auth modal (landing page) ---
  const authModal = document.querySelector('#auth-modal');
  const authBackdrop = document.querySelector('.modal-backdrop');
  const authClose = document.querySelector('[data-auth-close]');
  const authTabs = document.querySelector('.auth-tabs');

  // Toggle between the login and register sections
  function switchAuthMode(isRegister) {
    const loginSection = document.querySelector('[data-login-section]');
    const registerSection = document.querySelector('[data-register-section]');
    const loginTab = document.querySelector('[data-auth-tab="login"]');
    const registerTab = document.querySelector('[data-auth-tab="register"]');
    if (!loginSection || !registerSection) return;
    loginSection.style.display = isRegister ? 'none' : 'block';
    registerSection.style.display = isRegister ? 'block' : 'none';
    if (loginTab) loginTab.setAttribute('aria-selected', String(!isRegister));
    if (registerTab) registerTab.setAttribute('aria-selected', String(isRegister));
  }

  // Show/hide auth modal
  function toggleAuthModal(show) {
    if (!authModal) return;
    if (show) {
      authModal.removeAttribute('aria-hidden');
      const focusTarget = authModal.querySelector('input');
      if (focusTarget) focusTarget.focus();
    } else {
      authModal.setAttribute('aria-hidden', 'true');
    }
  }

  // Auth trigger buttons/links
  document.querySelectorAll('[data-auth-toggle]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const target = trigger.dataset.authToggle;
      if (target === 'register') {
        switchAuthMode(true);
        toggleAuthModal(true);
      } else if (target === 'login') {
        switchAuthMode(false);
        toggleAuthModal(true);
      } else {
        toggleAuthModal(true);
      }
    });
  });

  if (authClose) {
    authClose.addEventListener('click', () => toggleAuthModal(false));
  }

  // Close on backdrop click
  if (authBackdrop) {
    authBackdrop.addEventListener('click', (event) => {
      if (event.target === authBackdrop) {
        toggleAuthModal(false);
      }
    });
  }

  // Tab switching
  if (authTabs) {
    authTabs.addEventListener('click', (event) => {
      const tab = event.target.dataset ? event.target.dataset.authTab : null;
      if (tab) switchAuthMode(tab === 'register');
    });
  }

  // Keyboard Escape to close modal
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && authModal) {
      toggleAuthModal(false);
    }
  });

  // Auth form submission (one handler per form: login and register)
  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    const message = form.querySelector('[data-auth-message]');
    form.addEventListener('submit', async (event) => {
      // Authentication pages (login/signup/forgot-password) load their own auth.js,
      // which marks their form with data-auth-bound and owns the submission there.
      // Skipping it here prevents duplicate API requests per submit.
      if (form.dataset.authBound === '1') return;
      event.preventDefault();
      if (message) {
        message.textContent = '';
        message.classList.remove('error', 'success');
      }

      const isRegistration = form.querySelector('input[name="name"]') !== null;
      const nameInput = isRegistration ? form.querySelector('input[name="name"]') : null;
      const emailInput = form.querySelector('input[type="email"]');
      const passwordInput = form.querySelector('input[type="password"]');
      const name = nameInput ? nameInput.value.trim() : undefined;
      const email = emailInput ? emailInput.value : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!email || !password || (isRegistration && !name)) {
        if (message) {
          message.textContent = 'Please complete the required fields.';
          message.classList.add('error');
        }
        return;
      }

      // Validate registration: check password match when a confirmation field exists.
      if (isRegistration) {
        const pwConfirm = form.querySelector('input[name="password_confirmation"]');
        if (pwConfirm && pwConfirm.value !== password) {
          message.textContent = 'Passwords do not match.';
          message.classList.add('error');
          return;
        }
      }

      // Show loading on button
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = isRegistration ? 'Creating...' : 'Logging in...';
      }

      let result;
      try {
        result = isRegistration
          ? await window.auth.register(name, email, password)
          : await window.auth.login(email, password);
      } catch (err) {
        result = { success: false, message: 'Something went wrong. ' + (err.message || '') };
      }

      // Re-enable button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isRegistration ? 'Create account' : 'Log in';
      }

      if (result.success) {
        if (message) {
          message.classList.add('success');
          message.textContent = result.message || 'Success!';
        }
        API.setUser(result.user);
        toggleAuthModal(false);
        if (isRegistration) setTimeout(() => switchAuthMode(false), 1200);
        const redirect = form.dataset.redirect;
        if (redirect) {
          setTimeout(() => {
            window.location.href = redirect;
          }, 900);
        }
      } else if (message) {
        message.classList.add('error');
        message.textContent = result.message || 'Failed';
      }
    });
  });

  // Password toggle functionality
  document.querySelectorAll('[data-toggle-password]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = toggle.parentElement.querySelector('input');
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      toggle.textContent = isHidden ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      toggle.setAttribute('aria-pressed', String(isHidden));
    });
  });

  // Deep links: index.html#login / #register open the auth modal directly.
  if (authModal) {
    const hash = (window.location.hash || '').toLowerCase();
    if (hash === '#login' || hash === '#register') {
      switchAuthMode(hash === '#register');
      toggleAuthModal(true);
    }
  }

  // --- Dashboard stats refresh (landing + any page with the hooks) ---
  const refreshButton = document.querySelector('[data-refresh-stats]');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      refreshStats();
    });
  }
  if (API.isAuthenticated()) {
    refreshStats();
  }

  // --- CSRF token fetch on startup ---
  // Prime the cookie jar so that subsequent state-changing requests include X-XSRF-TOKEN.
  (async () => {
    try {
      await fetchXSRFToken();
    } catch (e) {
      // If the backend is unavailable the first state-changing request will
      // surface the error; there is nothing to prime here.
    }
  })();
});

// Refresh any inline stat panels (safe no-op when the hooks are absent).
async function refreshStats() {
  try {
    const { data: budgetStatus, status } = await window.SpendSenseAPI.get('/analytics/budget-status');

    const budgetUsed = document.querySelector('[data-budget-used]');
    const budgetLimit = document.querySelector('[data-budget-limit]');
    if (budgetUsed && budgetLimit && status === 200 && budgetStatus.data) {
      const budgets = budgetStatus.data.budgets || [];
      if (budgets.length > 0) {
        budgetUsed.textContent = window.SpendSenseAPI.formatMoney(budgets[0].spent_amount || 0);
        budgetLimit.textContent = window.SpendSenseAPI.formatMoney(budgets[0].limit_amount || 0);
      }
    }
  } catch (e) {
    // These panels are optional; page-specific scripts handle their own errors.
  }
}

// --- Shared UI helpers (loading / empty / error states, toasts) ---
window.SpendSenseUI = {
  formatMoney(value, options) {
    return window.SpendSenseSettings.formatMoney(value, options);
  },

  formatDate(value) {
    return window.SpendSenseSettings.formatDate(value);
  },

  // renderState(container, 'loading' | 'empty' | 'error', {
  //   message, retry, action: { href, label }, secondaryAction: { href, label }
  // })
  renderState(container, type, options = {}) {
    if (!container) return;
    const state = document.createElement('div');
    state.className = `state ${type}`;
    state.setAttribute('role', type === 'error' ? 'alert' : 'status');
    if (type === 'loading') state.setAttribute('aria-busy', 'true');

    const icons = {
      loading: '<span class="spinner" aria-hidden="true"></span>',
      empty:
        '<span class="state-ico"><svg viewBox="0 0 24 24"><path d="M3 8l3-4h12l3 4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 8h18"/><path d="M9 12h6"/></svg></span>',
      error:
        '<span class="state-ico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></svg></span>',
    };

    state.innerHTML = icons[type] || icons.empty;
    const text = document.createElement('p');
    text.textContent =
      options.message ||
      (type === 'loading' ? 'Loading…' : type === 'error' ? 'Could not load data.' : 'Nothing here yet.');
    state.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'state-actions';
    const addAction = (action, style) => {
      if (!action || !action.label) return;
      const link = document.createElement('a');
      link.className = `btn ${style} sm`;
      link.href = action.href || '#';
      link.textContent = action.label;
      actions.appendChild(link);
    };
    addAction(options.action, 'primary');
    addAction(options.secondaryAction, 'secondary');

    if (type === 'error' && typeof options.retry === 'function') {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn secondary sm';
      retryBtn.textContent = 'Try again';
      retryBtn.addEventListener('click', options.retry);
      actions.appendChild(retryBtn);
    }

    if (actions.childElementCount) state.appendChild(actions);
    container.replaceChildren(state);
    return state;
  },

  showToast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
      toast.remove();
      if (!stack.childElementCount) stack.remove();
    }, 3200);
  },
};

// Export for use by other modules
window.SpendSenseAPI = API;
window.auth = {
  login: API.login.bind(API),
  logout: API.logout.bind(API),
  register: API.register.bind(API),
  isAuthenticated: API.isAuthenticated.bind(API),
  getUser: API.getUser.bind(API),
};
window.refreshStats = refreshStats;
