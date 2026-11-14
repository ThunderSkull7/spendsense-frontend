# SpendSense — Prompt 1: Repository Audit & Requirements Reconciliation Report

**Document Name:** `SPENDSENSE_PROMPT_1_REPOSITORY_AUDIT.md`  
**Date of Audit:** November 6, 2026  
**Auditor:** Antigravity Advanced Agentic Coding System  
**Audit Type:** Read-Only Technical Architecture, Codebase Verification & Requirements Reconciliation  
**Target Workspaces:**  
- Workspace Root: `C:\Users\shaha\SpendSense`  
- Remote Backend Tracking: `release-work\spendsense-backend` (`https://github.com/ThunderSkull7/spendsense-backend.git`)  
- Remote Frontend Tracking: `release-work\spendsense-frontend` (`https://github.com/ThunderSkull7/spendsense-frontend.git`)  
- Local Frontend Development: `spendsense-frontend-main`  
- Local Backend Development: `spendsense-backend-main`  

---

## 1. Executive Summary

A comprehensive, non-destructive, read-only audit of the SpendSense repository and workspace was conducted to reconcile the current implementation status against all requirements in the outstanding changes specification.

### Key Audit Findings
1. **Repository Layout & Split Tracking:** The workspace contains two distinct layers:
   - Cloned remote tracking repositories under `release-work/spendsense-backend` and `release-work/spendsense-frontend`.
   - Local development working directories under `spendsense-backend-main` and `spendsense-frontend-main`.
   - In `spendsense-frontend-main`, 13 uncommitted file modifications exist (converting relative paths to root-relative paths) along with untracked debugging and test artifacts.
2. **Backend Domain Completeness vs. Frontend Presentation Asymmetry:**
   - **Backend:** Highly mature, production-grade Laravel 12 API featuring 70+ REST endpoints, 22 domain services, 19 Eloquent models, 28 database migrations, strict PostgreSQL check constraints, idempotency enforcement (`EnsureIdempotentRequest`), and comprehensive rate limiting.
   - **Frontend:** Zero-dependency Multi-Page Application (MPA) with 14 static HTML pages. While Core Expense, Income, Budget, Category, Notifications, Settings, and Reports pages are fully wired to API endpoints, several advanced domain capabilities implemented in the backend (Savings Goals, Recurring Bill Schedules, Financial Intelligence/Health, Streaming CSV Export, and CSV Import) have **no corresponding frontend UI** in the current 14-page classic architecture.
3. **Confirmed Frontend UI/UX & Responsive Defects:**
   - **Landing Page Mobile Navigation Defect:** In `index.html`, `<header class="landing-nav">` lacks the `.nav-toggle` button and `[data-nav-links]` attribute expected by `script.js:262-264`. At viewports $\le 768\text{px}$, CSS rule `.landing-nav .l-links { display: none; }` hides navigation links, leaving mobile visitors with no navigation menu.
   - **320px Viewport Horizontal Overflow:** `.landing-nav .l-bar` lacks `flex-wrap: wrap` and enforces a `28px` gap plus `56px` container padding (`padding: 0 28px`), forcing brand text and action buttons to overflow horizontally on 320px screens.
   - **WCAG Touch-Target Violations:** Password show/hide toggle buttons (`.password-field [data-toggle-password]`) have a computed height of `28px` (`styles.css:542`), and the mobile modal close button (`.modal-close`) is styled to `32px \times 32px` (`styles.css:1800`), failing the WCAG 2.1/2.2 Success Criterion 2.5.5 minimum target size of $44 \times 44\text{px}$.
   - **Modal Accessibility Deficiencies:** The authentication modal (`#auth-modal`) lacks a keyboard focus trap (allowing `Tab` focus to escape into the background document) and lacks focus restoration to the opening trigger upon dismissal.
4. **Test Suite Baseline:**
   - **Backend:** 350 Pest tests passing cleanly on SQLite (14 skipped PostgreSQL check constraint tests requiring a live PG database; 0 failures; 2,055 assertions).
   - **Frontend:** 70 Node.js unit, orchestration, and Worker proxy tests passing (0 failures). 9 browser regression tests passing via Chrome DevTools Protocol (0 failures). Legacy site structure verification and deployment preparation checks passing.
5. **No Modifications Made:** Zero files were edited, stashed, committed, or pushed during this audit.

---

## 2. Repository and Git Status

### 2.1 Workspace Overview
- **Workspace Path:** `C:\Users\shaha\SpendSense`
- **Root Directory Contents:**
  - `release-work\` (contains cloned remote Git repositories for backend and frontend)
  - `spendsense-backend-main\` (local backend workspace with SQLite database and public artifacts)
  - `spendsense-frontend-main\` (local frontend workspace with git tracking)
  - `SPENDSENSE_BATCH_3_CI_SECURITY_REPORT.md` (Batch 3 backend CI remediation report)
  - `SPENDSENSE_BATCH_4_FRONTEND_CI_REPORT.md` (Batch 4 frontend CI reliability report)
  - `SPENDSENSE_GITHUB_PORTFOLIO_AUDIT.md` (GitHub portfolio presentation audit report)

### 2.2 Git State: `release-work\spendsense-backend`
- **Repository Path:** `C:\Users\shaha\SpendSense\release-work\spendsense-backend`
- **Active Branch:** `docs/phase-1-release-readiness`
- **Remote Tracking:** `origin/docs/phase-1-release-readiness` (`https://github.com/ThunderSkull7/spendsense-backend.git`)
- **Synchronization Status:** Up to date with remote
- **HEAD Commit:** `045d675` — `docs: clarify dependency security audit wording in README`
- **Working Tree Status:** Clean (`nothing to commit, working tree clean`)
- **Recent Commit History:**
  - `045d675` docs: clarify dependency security audit wording in README
  - `e055ac8` docs: clarify historical baseline compatibility status in release guide
  - `a914666` docs: address Phase 1 review findings for release readiness and changelog
  - `59830e1` docs: establish release strategy, changelog, and README improvements
  - `dd5d664` Merge pull request #6 from ThunderSkull7/docs/batch-6-contributor-governance

### 2.3 Git State: `release-work\spendsense-frontend`
- **Repository Path:** `C:\Users\shaha\SpendSense\release-work\spendsense-frontend`
- **Active Branch:** `docs/theme-description-correction`
- **Remote Tracking:** `origin/docs/theme-description-correction` (`https://github.com/ThunderSkull7/spendsense-frontend.git`)
- **Synchronization Status:** Up to date with remote
- **HEAD Commit:** `a31ebb8` — `docs: update theme description to document light and dark modes with teal accent`
- **Working Tree Status:** Clean (`nothing to commit, working tree clean`)
- **Recent Commit History:**
  - `a31ebb8` docs: update theme description to document light and dark modes with teal accent
  - `a7ca582` Merge pull request #13 from ThunderSkull7/docs/phase-1-release-readiness
  - `cfb1f69` docs: clarify historical baseline compatibility status in release guide
  - `5aeca83` docs: address Phase 1 review findings for release readiness and changelog
  - `c43f53a` docs: establish release strategy, changelog, and README improvements

### 2.4 Git State: `spendsense-frontend-main`
- **Repository Path:** `C:\Users\shaha\SpendSense\spendsense-frontend-main`
- **Active Branch:** `master`
- **Remote Tracking:** None configured (`git remote -v` returns empty)
- **HEAD Commit:** `2bcfe06` — `fix: fix CSRF token handling for Sanctum integration`
- **Working Tree Status:** 13 modified uncommitted files, 19 untracked files
- **Uncommitted Modifications:**
  - `authentication/forgot-password.html` (converted relative asset/nav paths to root-relative `/`)
  - `authentication/login.html` (converted relative paths to root-relative `/`)
  - `authentication/signup.html` (converted relative paths to root-relative `/`)
  - `budget-planning/budget.html` (converted relative paths to root-relative `/`)
  - `categories-management/categories.html` (converted relative paths to root-relative `/`)
  - `dashboard/dashboard.js` (uncommitted local adjustments)
  - `expense-management/add-expense.html` (converted relative paths to root-relative `/`)
  - `expense-management/expenses.html` (converted relative paths to root-relative `/`)
  - `income-management/income.html` (converted relative paths to root-relative `/`)
  - `index.html` (converted relative paths to root-relative `/`)
  - `notifications/notifications.html` (converted relative paths to root-relative `/`)
  - `reports-analytics/reports.html` (converted relative paths to root-relative `/`)
  - `settings/settings.html` (converted relative paths to root-relative `/`)
  - `support/support.html` (converted relative paths to root-relative `/`)
- **Untracked Files:** `debug-overflow.js`, `node_modules/`, `package-lock.json`, `package.json`, `screenshots/`, and 14 `test-*.js` scripts.

### 2.5 State: `spendsense-backend-main`
- **Repository Path:** `C:\Users\shaha\SpendSense\spendsense-backend-main`
- **Git Status:** Not a Git repository (`.git` directory absent).
- **Contents:** Older local working copy containing active development artifacts, including `database/database.sqlite`, `check_session.php`, `login.json`, and mirrored frontend assets in `public/`.

---

## 3. Architecture and Technology Audit

### 3.1 Frontend Architecture
- **Framework & Runtime:** Pure Vanilla JavaScript (ES2022+), Semantic HTML5, and Modern CSS3 Custom Properties. Zero third-party runtime frameworks (no React, Vue, Angular, or jQuery).
- **Application Structure:** Multi-Page Application (MPA) consisting of exactly 14 primary HTML pages:
  1. `index.html` (Public Landing Page & Auth Modal)
  2. `authentication/login.html` (Standalone Login Page)
  3. `authentication/signup.html` (Standalone Registration Page)
  4. `authentication/forgot-password.html` (Password Reset Placeholder Page)
  5. `dashboard/dashboard.html` (Financial Overview & Metrics)
  6. `expense-management/expenses.html` (Expense Ledger & History)
  7. `expense-management/add-expense.html` (Quick Add Expense Form)
  8. `income-management/income.html` (Income Ledger & History)
  9. `budget-planning/budget.html` (Budget Limit Planning & Utilization)
  10. `categories-management/categories.html` (Category Management & Defaults Protection)
  11. `reports-analytics/reports.html` (Visual Analytics, Charts & Cash Flow)
  12. `notifications/notifications.html` (Unified Alerts & Bill Reminders)
  13. `settings/settings.html` (Theme Selector, Currency & Profile)
  14. `support/support.html` (Help & Documentation)
- **State Management:**
  - Decentralized DOM-based state per page.
  - Shared preferences (theme palette, theme mode, currency) stored in `localStorage` with in-memory fallback if storage is blocked (`theme.js:18-42`).
  - Active session cache in `window.SpendSenseAPI.user` and hydrated via `/user` endpoint.
- **API Communication Layer:**
  - Singleton `SpendSenseAPI` (`script.js:15-245`) utilizing native `fetch()`.
  - Configured via `<meta name="api-base-url" content="...">`.
  - Credentials inclusion (`credentials: 'include'`) on every request.
  - Automatic CSRF token bootstrap (`fetchXSRFToken()`) calling `/sanctum/csrf-cookie`.
  - Automatic 419 Page Expired handling: refreshes token once and transparently retries mutation.
  - Automatic 401 Unauthorized handling: fires `spendsense:session-expired` event and redirects to login (bypassing `/login` credential failures).
  - Client-side UUIDv4 `Idempotency-Key` generation for mutation endpoints (`/expenses`, `/incomes`, `/budgets`, `/recurring-*`, `/savings-goals/*`, `/net-worth/*`).
- **CSS Architecture & Design Tokens:**
  - Centralized in `styles.css` (1,813 lines).
  - Design tokens for background (`--bg`), surface (`--surface`, `--surface-2`, `--surface-3`), borders (`--border`, `--border-strong`), ink/typography (`--ink`, `--ink-2`, `--muted`, `--faint`), feedback (`--success`, `--warn`, `--danger`, `--info`), and border radii (`--r-sm`, `--r`, `--r-lg`, `--r-pill`).
  - 4 unified theme palettes (`green`, `blue`, `red`, `amber`) and dark mode surfaces (`#090B0F` background, `#14171D` surface) applied via `data-theme-color` and `data-mode="dark"` on `<html>`.
- **Reusable UI Components:** Sidebar drawer with navigation group semantics, sticky topbar with account dropdown, stat cards, metric pills, form controls with inline validation messages, modal backdrop/dialog, and accessible table wrappers.
- **Responsive Implementation:** Breakpoints at $1180\text{px}$, $1080\text{px}$ (sidebar collapses to drawer), $768\text{px}$ (content padding reduction, grid collapse), and $640\text{px}$ (table rows transform into stacked cards).
- **Testing Framework:** Native `node:test` and `node:assert/strict` (zero npm dependencies). Chrome DevTools Protocol automation in `tools/run-tests.js` for headless browser regression testing.

### 3.2 Backend Architecture
- **Framework & Runtime:** Laravel 12.x on PHP 8.2+ / 8.3.
- **Architecture Pattern:** Controller-Service-Model layered design.
  - Controllers in `app/Http/Controllers/` (18 controllers) remain thin coordinators.
  - Domain Services in `app/Services/` (22 services) encapsulate complex business rules, transaction boundaries, and calculations.
  - Form Requests in `app/Http/Requests/` (21 request classes) enforce syntactic and semantic validation.
- **Routing Organization:**
  - `routes/api.php` (288 lines, 70+ endpoints): Authentication, Expenses, Incomes, Categories, Budgets, Savings Goals, Recurring Transactions, Bill Reminders, Net Worth, Subscriptions, Search, Reports, Full Data Export, and CSV Import.
  - `routes/web.php`: Root health check endpoint (`/up`).
  - `routes/console.php`: Scheduled tasks (`recurring-expenses:sync-reminders`).
- **Database Layer & Models:**
  - Dual DBMS compatibility: SQLite (in-memory/file for testing and local dev) and PostgreSQL (production on Neon).
  - 19 Eloquent models: `BillReminder`, `Budget`, `BudgetAlert`, `Category`, `DashboardPreference`, `Expense`, `IdempotencyRecord`, `Income`, `NetWorthEntry`, `NetWorthValuation`, `RecurringExpense`, `RecurringExpenseOccurrence`, `RecurringIncome`, `RecurringIncomeOccurrence`, `SavingsGoal`, `SavingsGoalContribution`, `Subscription`, `Transaction`, `User`.
  - 28 migrations implementing foreign key cascades, soft deletes (`deleted_at`), reporting indexes, unique period constraints, and PostgreSQL CHECK constraints (`CHECK (amount > 0)`, `CHECK (limit_amount > 0)`).
- **Middleware & Security Controls:**
  - `statefulApi()` enabled for SPA cookie authentication.
  - `EnsureIdempotentRequest`: Deduplicates financial mutations based on `Idempotency-Key` and SHA-256 payload hashing.
  - Rate limiting via `throttle` middleware (`throttle:6,1` on login/register; `throttle:20,1` on search/export/import-preview; `throttle:5,1` on import execution; `throttle:10,1` on full export).
  - Proxy trust: `$middleware->trustProxies(at: '*')` for Render PaaS edge TLS termination.
  - JSON exception forcing: API exceptions always render JSON (`$exceptions->shouldRenderJsonWhen(...)`), preventing web redirect loops.
- **Testing Framework:** Pest 3.x / PHPUnit 11 with 364 automated tests.

### 3.3 Infrastructure & Deployment
- **Frontend Hosting:** Cloudflare Pages with static asset delivery and a Cloudflare Pages Worker (`_worker.js`) operating as a same-origin reverse proxy.
- **Reverse Proxy Operation:**
  - Routes `/api/*`, `/sanctum/*`, and `/user` to the Render backend origin (`spendsense-api-t0up.onrender.com`).
  - Passes client cookies, `X-XSRF-TOKEN`, and `Idempotency-Key` headers unchanged.
  - Handles CORS preflight (`OPTIONS`) directly on the edge.
  - Delegates static asset requests to Cloudflare Pages edge storage (`env.ASSETS.fetch`).
- **Backend Hosting:** Render PaaS container running `php:8.3-fpm-alpine` and Nginx.
- **Database:** Serverless PostgreSQL on Neon.

---

## 4. Authentication and Sign-in Investigation

A systematic review of the end-to-end authentication flow was conducted across the backend endpoints, frontend scripts, cookie settings, and session lifecycle.

### 4.1 Endpoints & Flows
1. **CSRF Cookie Initialization (`GET /sanctum/csrf-cookie`):**
   - Returns HTTP 204 No Content (`routes/api.php:39-41`).
   - Issues the encrypted session cookie and plaintext `XSRF-TOKEN` cookie via Laravel's CSRF middleware.
   - Frontend `script.js:160-179` deduplicates concurrent CSRF initialization calls through an in-flight Promise.
2. **User Authentication (`POST /api/login`):**
   - Throttled to 6 attempts per minute per IP/email (`throttle:6,1`).
   - Normalizes email casing via `Str::lower($email)` (`routes/api.php:47-51`) to avoid case-sensitivity mismatches on PostgreSQL.
   - Invokes `auth('web')->attempt($credentials, $remember)`.
   - On success, regenerates the session ID (`$request->session()->regenerate()`) to defend against session fixation attacks.
   - Returns HTTP 200 with `{'user': {...}}`.
3. **User Registration (`POST /api/register`):**
   - Throttled to 6 attempts per minute (`throttle:6,1`).
   - Normalizes email casing prior to validation.
   - Validates `name` (required, string, max 255), `email` (required, email, unique:users), `password` (required, min 8, confirmed).
   - Hashes password automatically via Eloquent's `'hashed'` cast on `User::$casts`.
   - Logs user in immediately (`auth('web')->login($user)`), regenerates session, and returns HTTP 201 with `{'user': {...}}`.
4. **User Logout (`POST /api/logout`):**
   - Calls `auth('web')->logout()`.
   - Invalidates session (`$request->session()->invalidate()`) and regenerates token (`$request->session()->regenerateToken()`).
   - Returns HTTP 200 `{'status': 'logged_out'}`.
5. **Session Hydration (`GET /api/user`):**
   - Protected by `auth:sanctum`.
   - Returns user id, name, email, and created_at timestamps.
   - Used by `script.js:loadSessionUser()` to hydrate user avatar and email in the sidebar/topbar.

### 4.2 Configuration Audit
- **CORS Configuration (`config/cors.php`):**
  - Paths allowed: `['api/*', 'sanctum/csrf-cookie', 'user']`.
  - Origins: Driven by `CORS_ALLOW_ORIGINS` environment variable, defaulting to localhost ports (3000, 5173, 5500, 8000).
  - `supports_credentials => true` enabled.
- **Sanctum Configuration (`config/sanctum.php`):**
  - Stateful domains: Configured via `SANCTUM_STATEFUL_DOMAINS` with fallback to localhost/127.0.0.1 ports and `APP_URL`.
  - Cloudflare Pages Worker reverses proxy requests under the frontend domain, satisfying stateful domain checks without cross-site cookie restrictions.
- **Session Configuration (`config/session.php`):**
  - Driver: Driven by `SESSION_DRIVER` (`file` in local testing, `database` in production).
  - SameSite: Set to `'lax'` (`config/session.php:202`).
  - HttpOnly: Enabled (`config/session.php:185`).
  - Secure: Driven by `SESSION_SECURE_COOKIE` (true in HTTPS production environments).

### 4.3 Sign-in Defect & Usability Analysis
- **Duplicate Request Race Condition Guard:** In `authentication/auth.js:136`, `authForm.dataset.authBound = "1"` is set. `script.js:360` explicitly checks `if (form.dataset.authBound === '1') return;`. This successfully prevents double-submission race conditions that previously caused duplicate 201/422 requests on registration.
- **Password Reset Dead End:** `authentication/forgot-password.html` contains an email submission form, but the backend lacks a password reset endpoint (`routes/api.php` has no `/forgot-password` or `/reset-password`). When submitted, `auth.js:36-38` displays: *"Password reset is not yet available. Contact support if you need assistance."*
- **Auth Error Differentiation:** In `script.js:125-127`, 401 Unauthorized responses from `/login` are specifically exempted from emitting `spendsense:session-expired`, ensuring that bad credential attempts display the exact error message in the form rather than triggering an unexpected page redirect.

---

## 5. Landing Page and Responsive Design Audit

The landing page (`index.html`) and associated stylesheet (`styles.css`) were inspected across required viewports: 320px, 360px, 375px, 390px, 430px, 768px, 1024px, and 1440px.

### 5.1 Viewport Audit Results

| Viewport Width | Device Archetype | Layout Status | Observations & Issues |
| :--- | :--- | :--- | :--- |
| **320px** | iPhone SE (1st gen) | **DEFECTIVE** | **Horizontal Overflow:** `.landing-nav .l-bar` (`styles.css:1370`) has `gap: 28px` with no wrapping, and `.l-container` has `padding: 0 28px` (56px total). Available width is 264px, while brand (140px) + actions (180px) = 320px+, causing navigation elements to clip and overflow the viewport. |
| **360px** | Galaxy S8+ / Android | **DEFECTIVE** | Navigation links are hidden (`display: none;` at $\le 768\text{px}$), but no hamburger toggle exists in DOM. Content grid stacks cleanly. |
| **375px** | iPhone SE / iPhone 13 mini | **DEFECTIVE** | Hero text and preview card fit, but landing navigation menu is unreachable due to missing toggle button. |
| **390px** | iPhone 14 / iPhone 15 | **DEFECTIVE** | Preview stats stack cleanly into 1 column (`styles.css:1740`), but header navigation remains inaccessible. |
| **430px** | iPhone 14 Pro Max | **DEFECTIVE** | Typography scales via `clamp()`, trust row wraps, header navigation inaccessible. |
| **768px** | iPad Mini / Portrait Tablet | **DEFECTIVE** | Breakpoint boundary (`@media (max-width: 768px)`). Navigation links hide; no drawer or hamburger button rendered. Hero switches to 1 column at 1080px. |
| **1024px** | iPad Pro / Small Laptop | **PASS** | Full desktop landing header with visible links (`Features`, `Dashboard`, `Support`). Hero displays 2-column grid (`1.1fr` / `0.9fr`). |
| **1440px** | Desktop Display | **PASS** | Max width constrained to `1180px` (`.l-container`). High contrast, balanced whitespace, clean grid alignment. |

### 5.2 Critical Confirmed Defect: Missing Landing Mobile Navigation Toggle
- **File:** `release-work\spendsense-frontend\index.html` (lines 12–28) vs. `release-work\spendsense-frontend\script.js` (lines 262–275).
- **Evidence:**
  In `script.js`:
  ```javascript
  // --- Landing page navigation toggle (small screens) ---
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('[data-nav-links]');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  ...
  ```
  In `index.html`:
  ```html
  <header class="landing-nav">
    <div class="l-container l-bar">
      <a class="brand" href="index.html" aria-label="SpendSense home">
        <span class="brand-mark">S</span>
        <span>SpendSense</span>
      </a>
      <nav class="l-links" aria-label="Site">
        <a href="#features">Features</a>
        <a href="dashboard/dashboard.html">Dashboard</a>
        <a href="support/support.html">Support</a>
      </nav>
      <div class="l-actions">
        <button class="btn ghost" type="button" data-auth-toggle="login">Log in</button>
        <button class="btn primary" type="button" data-auth-toggle="register">Get started</button>
      </div>
    </div>
  </header>
  ```
  And in `styles.css:1746`:
  ```css
  @media (max-width: 768px) {
    .landing-nav .l-links { display: none; }
  }
  ```
- **Consequence:** `index.html` completely lacks the `.nav-toggle` button in its markup, and `<nav class="l-links">` lacks the `data-nav-links` attribute. On all mobile viewports ($\le 768\text{px}$), `.l-links` is hidden by CSS, and users have zero ability to access the site links.

---

## 6. Authentication Modal and Form UX Audit

The authentication modal located in `index.html` (`#auth-modal`, lines 134–194) and the standalone auth pages were audited for accessibility, keyboard navigation, and form mechanics.

### 6.1 Modal Structure and Dimensions
- **Positioning:** `.modal-backdrop` uses `position: fixed; inset: 0; display: grid; place-items: center; z-index: 60;` (`styles.css:1262-1271`).
- **Dimensions:** `.modal` is sized to `width: min(460px, 100%); max-height: calc(100vh - 40px); overflow-y: auto;` (`styles.css:1274-1284`).
- **Short-Screen Scrolling:** Responsive scrolling is ensured via `max-height` and `overflow-y: auto`, preventing cut-off inputs on low-height screens (e.g. landscape mobile).

### 6.2 Confirmed Accessibility & Usability Defects

1. **Sub-Standard Touch Target Size on Password Toggle:**
   - **Location:** `styles.css:542` (`.password-field button, .password-field [data-toggle-password]`)
   - **Evidence:** `height: 28px; padding: 0 10px; font-size: 0.8rem;`
   - **Violation:** WCAG 2.1 Success Criterion 2.5.5 (Target Size) recommends a minimum interactive target size of $44 \times 44\text{px}$. A height of 28px makes toggling password visibility difficult on touchscreen devices.
2. **Sub-Standard Touch Target Size on Mobile Modal Close Button:**
   - **Location:** `styles.css:1800` (`@media (max-width: 640px) .modal-close`)
   - **Evidence:** `width: 32px; height: 32px;`
   - **Violation:** Below the required $44 \times 44\text{px}$ minimum target dimensions.
3. **Missing Keyboard Focus Trap in Auth Modal:**
   - **Location:** `script.js:296-352`
   - **Evidence:** While `toggleAuthModal(true)` shifts initial focus to the first input (`script.js:301-302`), there is no `keydown` listener trapping `Tab` and `Shift+Tab`. Pressing `Tab` repeatedly moves keyboard focus out of the modal dialog into background header links and buttons.
4. **Missing Focus Restoration upon Modal Close:**
   - **Location:** `script.js:296-306` (`toggleAuthModal`)
   - **Evidence:** `toggleAuthModal(false)` sets `authModal.setAttribute('aria-hidden', 'true')` but does not retain a reference to the element that triggered the modal (`document.activeElement`) and does not restore focus back to the triggering button. Keyboard users lose their cursor position on the page upon closing the modal.
5. **Escape Key Handler Ignores Visibility State:**
   - **Location:** `script.js:347-351`
   - **Evidence:**
     ```javascript
     document.addEventListener('keydown', (event) => {
       if (event.key === 'Escape' && authModal) {
         toggleAuthModal(false);
       }
     });
     ```
     The listener executes `toggleAuthModal(false)` on every Escape press across the entire document even when the modal is already hidden (`aria-hidden="true"`). While non-fatal, it lacks an `isOpen` check.

---

## 7. Reports and Existing Application UI Audit

The Reports & Analytics implementation (`reports-analytics/reports.html`, `reports.js`, `reports.css`) was evaluated alongside shared UI patterns across all 14 pages.

### 7.1 Reports Page Architecture
- **Period Selection:** Controlled via `<select id="period-month">` and `<select id="period-year">` (`reports.html:55-80`). Tied directly into `SpendSensePeriod` (`analytics-period.js`), ensuring date boundaries synchronize seamlessly between the dashboard, reports, and API queries.
- **Concurrent Section Orchestration:**
  - `reports.js:647-726` executes four independent API requests concurrently using `Promise.allSettled()`:
    1. `/analytics/spending-by-category`
    2. `/analytics/month-comparison`
    3. `/analytics/budget-alerts`
    4. `/analytics/budget-status`
  - Each task renders its section independently as soon as it resolves.
  - Partial API failures do **not** stall or crash sibling widgets. If `/analytics/budget-alerts` fails, it renders an isolated retry button while the spending doughnut chart and cash flow bar chart render normally.
- **Data Distinctions (Zero vs. Empty vs. Error):**
  - Legitimate zero spending displays an informative empty state: *"No expenses recorded this month yet"* (`reports.js:204-207`).
  - Legitimate zero cash flow renders: *"No cash flow activity"* (`reports.js:178`).
  - Network/server errors render an error badge with an inline retry button: *"Could not load spending data"* (`reports.js:193-197`).
- **Visualizations & Charts:**
  - Integrated with Chart.js 4.4.1 (doughnut chart for category distribution, bar chart for monthly income vs. expenses).
  - Includes pure CSS horizontal bar fallbacks (`buildBars()`, `reports.js:89-123`) if the CDN script fails to load or canvas is blocked.
  - Accessible hidden summaries (`aria-describedby`) update dynamically: e.g. `data-spending-summary` provides text alternatives for screen readers.
  - Dynamic theme recoloring: Listening to `spendsense:theme-change` (`reports.js:728-760`), charts update their grid, text, and border colors without requiring page reloads.

### 7.2 Shared UI Component Consistency Audit
- **Sidebar & Topbar:**
  - All 13 authenticated pages use consistent `.sidebar` markup with identical group headers (`Overview`, `Money`, `Insights`, `Account`).
  - Active link state correctly applied (`.sidebar-link.active`).
  - User chip hydrates identity (`data-user-name`, `data-user-email`, `data-user-avatar`) across all pages via `API.loadSessionUser()`.
- **Forms & Inputs:**
  - Consistent `.field` containers with `<label>`, `<input class="..." novalidate>`, and inline `.auth-message` / `.field-error` elements.
  - Consistent `.btn.primary`, `.btn.secondary`, `.btn.ghost`, `.btn.danger` tokens.
- **Tables & Mobile Stacking:**
  - Tables in `expenses.html`, `income.html`, and `categories.html` incorporate `data-label` attributes on every `<td>`.
  - At viewports $\le 640\text{px}$, CSS transforms `table`, `tbody`, `tr`, `td` into `display: block`, rendering each row as an individual card with uppercase field headers, eliminating horizontal scrolling.

---

## 8. Feature-by-Feature Requirements Audit

Every feature specified in Section 7 of the audit brief was audited across backend code, database schemas, API routes, automated tests, and frontend pages.

### 8.1 Summary Status Matrix

| # | Feature Requirement | Backend Status | Database Status | API Status | Frontend Status | Overall Status |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **1** | **Unified Transactions** | PARTIAL | COMPLETE (Union) | COMPLETE | MISSING | **PARTIAL** |
| **2** | **Financial Goals (Savings Goals)** | COMPLETE | COMPLETE | COMPLETE | MISSING | **PARTIAL** |
| **3** | **Recurring Payments (Expenses & Incomes)** | COMPLETE | COMPLETE | COMPLETE | PARTIAL | **PARTIAL** |
| **4** | **Financial Health & Insights** | COMPLETE | COMPLETE | COMPLETE | MISSING | **PARTIAL** |
| **5** | **CSV Import and Export** | COMPLETE | COMPLETE | COMPLETE | MISSING | **PARTIAL** |
| **6** | **Financial Calendar** | COMPLETE | COMPLETE | COMPLETE | MISSING | **PARTIAL** |
| **7** | **Debt and Loan Tracker** | MISSING | MISSING | MISSING | MISSING | **MISSING** |
| **8** | **Accessibility Improvements** | COMPLETE | N/A | N/A | DEFECTIVE | **DEFECTIVE** |
| **9** | **Deferred/Optional Modules** | COMPLETE | COMPLETE | COMPLETE | MISSING | **PARTIAL** |

---

### 8.2 Detailed Feature Breakdown

#### 1. Unified Transactions
- **Backend Implementation:** `App\Services\TransactionSearchService` queries both `expenses` and `incomes` tables using a SQL `UNION ALL` query (`TransactionSearchService.php:28-60`), projecting common columns (`id`, `type`, `amount`, `transaction_date`, `category_id`, `category_name`, `notes`, `created_at`). Soft-deleted records (`deleted_at IS NOT NULL`) are strictly excluded.
- **Database Support:** Supported via existing `expenses` and `incomes` relational tables with reporting indexes. (The historical flat `transactions` table was dropped in migration `2026_05_09_131005_drop_transactions_table`).
- **API Endpoints:**
  - `GET /api/transactions/search` (`TransactionSearchController@index`)
  - `GET /api/transactions/export` (`TransactionSearchController@export`, throttled 20/min)
- **Frontend Status:** **MISSING.**
  - The frontend has separate `expense-management/expenses.html` and `income-management/income.html` pages.
  - There is no unified transactions page or view combining both income and expenses into a single editable or filterable table.
  - The dashboard widget (`dashboard.html:134`) labeled "Recent transactions" calls only `/expenses` (`dashboard.js:353`), omitting income transactions entirely.
- **Usability:** Backend search/export API is fully usable, but end users have no frontend interface to view or search unified transactions.

#### 2. Financial Goals (Savings Goals)
- **Backend Implementation:**
  - Models: `App\Models\SavingsGoal`, `App\Models\SavingsGoalContribution`
  - Services: `App\Services\SavingsGoalService` (manages goal lifecycle, target amounts, target dates, archiving, and contributions), `App\Services\SavingsProgressService` (calculates progress percentages, paces, and projections).
  - Business Rule: Contributions are an isolated ledger; they never mutate or double-count against income or expense ledgers.
- **Database Support:** Migration `2026_10_20_000007_create_savings_goals_tables.php` creates `savings_goals` and append-only `savings_goal_contributions` tables with foreign keys and check constraints.
- **API Endpoints:**
  - `GET /api/savings-goals`
  - `POST /api/savings-goals` (idempotent)
  - `GET /api/savings-goals/{id}`
  - `PUT /api/savings-goals/{id}`
  - `POST /api/savings-goals/{id}/archive`
  - `POST /api/savings-goals/{id}/restore`
  - `POST /api/savings-goals/{id}/contributions` (idempotent)
  - `POST /api/savings-goals/{id}/corrections` (idempotent)
  - `GET /api/analytics/savings-progress`
- **Tests:** Covered in `tests/Feature/StageThreeSavingsGoalTest.php` and `StageFiveBoundaryTest.php`.
- **Frontend Status:** **MISSING.**
  - `savings-goals/savings-goals.html` is absent from the repository.
  - In `tools/legacy-site-verify.js:7`, navigation links with `data-nav="goals"` are actively flagged as a failure to maintain the 14-page classic profile.
- **Usability:** Completely inaccessible to end users via the browser.

#### 3. Recurring Payments
- **Backend Implementation:**
  - Models: `RecurringExpense`, `RecurringExpenseOccurrence`, `RecurringIncome`, `RecurringIncomeOccurrence`.
  - Services: `RecurringExpenseService`, `RecurringIncomeService`, `RecurrenceDateService`, `BillReminderService`.
  - Capabilities: Frequency calculations (daily, weekly, monthly, quarterly, yearly), occurrence scheduling, payment logging, occurrence skipping, overdue reminder generation, and calendar aggregation.
- **Database Support:** Migrations `2026_10_19_000001`, `2026_10_19_000002`, `2026_10_20_000004`, `2026_10_20_000005`.
- **API Endpoints:**
  - `GET/POST /api/recurring-incomes/*` (10 routes)
  - `GET/POST /api/recurring-expenses/*` (11 routes)
  - `GET/POST /api/bill-reminders/*` (3 routes)
- **Frontend Status:** **PARTIAL.**
  - `income-management/income.html` allows users to select a `frequency` dropdown (`one-time`, `daily`, `weekly`, `monthly`, etc.) and displays a recurring badge pill (`↻ Monthly`) in the income history table (`income.js:331-337`).
  - However, dedicated recurring expense management, recurrence rule configuration, and occurrence payment interfaces do not exist in the frontend. `recurring-expenses/recurring-expenses.html` was removed, and `data-nav="bills"` is prohibited by `tools/legacy-site-verify.js`.
- **Usability:** Partially usable for income frequency tagging; unusable for recurring bill schedules and payment workflows.

#### 4. Financial Health & Intelligence
- **Backend Implementation:**
  - Services: `SpendingInsightsService`, `CashFlowForecastService`, `CommitmentService`, `DataQualityService`, `BudgetPerformanceService`, `SpendingTrendService`, `NetWorthService`.
  - Algorithms: Trend detection, discretionary vs. non-discretionary commitments, horizon-based cash-flow projections (30, 60, 90 days), data quality anomaly detection.
- **API Endpoints:**
  - `GET /api/analytics/spending-insights`
  - `GET /api/analytics/cash-flow-forecast`
  - `GET /api/analytics/spending-trends`
  - `GET /api/analytics/income-analysis`
  - `GET /api/analytics/budget-performance`
  - `GET /api/analytics/commitments`
  - `GET /api/analytics/data-quality`
  - `GET/POST /api/net-worth/*` (7 routes)
- **Frontend Status:** **MISSING.**
  - Only basic cash flow and category breakdown are exposed on `reports-analytics/reports.html`.
  - No frontend pages exist for Net Worth tracking, Spending Insights, Cash Flow Forecasts, or Data Quality auditing. Separate insight pages were intentionally pruned in commit `5897bf9`.
- **Usability:** Backend intelligence endpoints are operational, but completely unrendered in the UI.

#### 5. CSV Import and Export
- **Backend Implementation:**
  - Services: `CsvImportService`, `ReportCsvService`, `TransactionSearchService`.
  - Security: Formula injection sanitization implemented in `App\Support\Csv::cell()` (`app/Support/Csv.php:12-35`).
  - Validation: Preview-first pattern via `POST /api/import/preview` returning mapped headers, row counts, and duplicate detection before committing with `POST /api/import`.
  - Streaming: Low-memory streaming response for transaction and report CSV downloads.
- **API Endpoints:**
  - `POST /api/import/preview`
  - `POST /api/import`
  - `GET /api/transactions/export`
  - `GET /api/reports/export`
  - `GET /api/export/all`
- **Frontend Status:** **MISSING.**
  - No "Import CSV" button or drag-and-drop modal exists on `expenses.html` or `income.html`.
  - No "Export to CSV" button exists on `reports.html`, `expenses.html`, or `income.html`.
  - `expense-management/import.html` was previously removed.
- **Usability:** Users cannot import financial statements or export reports from the browser.

#### 6. Financial Calendar
- **Backend Implementation:** `App\Services\BillCalendarService` projects scheduled recurring expenses across calendar days for any given month and year (`BillCalendarService.php:18-72`), returning due dates, amounts, categories, and paid statuses.
- **API Endpoints:** `GET /api/recurring-expenses/calendar` (`RecurringExpenseController@calendar`).
- **Frontend Status:** **MISSING.**
  - No calendar view, grid component, or date-picker agenda exists in the frontend.
- **Usability:** Entirely absent from the UI.

#### 7. Debt and Loan Tracker
- **Backend Implementation:** **MISSING.**
  - Neither a `Debt` nor a `Loan` Eloquent model exists in `app/Models/`.
  - No database migration creates loan accounts, interest rates, amortization schedules, or principal/interest payment allocation tables.
  - The only reference in the codebase is a string constant `'loan'` in `NetWorthEntry::LIABILITY_CATEGORIES` (`app/Models/NetWorthEntry.php:29`), which simply stores a static liability balance.
- **Frontend Status:** **MISSING.**
  - No debt payoff calculators, loan trackers, or liability management screens exist.
- **Usability:** Completely non-existent in backend and frontend.

#### 8. Accessibility Improvements
- **Implementation Status:** **DEFECTIVE / PARTIAL.**
  - Implemented: Semantic HTML landmarks (`<main>`, `<aside>`, `<nav>`, `<header>`), `:focus-visible` outline rings on buttons/inputs, `aria-label` on icons and form fields, responsive card conversion for mobile data tables, and screen-reader summaries for charts (`data-spending-summary`, `data-cashflow-summary`).
  - Defective:
    1. Touch targets: Password toggle button height is 28px (`styles.css:542`); modal close button is 32px (`styles.css:1800`).
    2. Focus trapping: `#auth-modal` does not trap focus.
    3. Focus restoration: Closing `#auth-modal` does not restore focus to the calling trigger.
    4. Mobile nav links on landing page are completely hidden without an accessible toggle mechanism.

#### 9. Deferred / Optional Modules
- **Subscriptions Tracker:**
  - Backend: COMPLETE (`Subscription` model, `SubscriptionService`, `SubscriptionController`, endpoints in `routes/api.php:240-244`). Prevents double-counting with bill schedules.
  - Frontend: MISSING (No subscriptions UI).
- **Notification Center:**
  - Backend: COMPLETE (`NotificationController`, `NotificationService`, merging budget alerts and bill reminders).
  - Frontend: COMPLETE (`notifications/notifications.html` and `notifications.js` fully render in-app alerts with filter tabs and mark-read controls).
- **Dashboard Layout Customization:**
  - Backend: COMPLETE (`DashboardPreference` model, `DashboardPreferenceController`).
  - Frontend: MISSING (Dashboard layout is statically hardcoded in `dashboard.html`).

---

## 9. Security, Data Integrity and Accessibility Audit

### 9.1 Security & Data Isolation
- **Tenant Isolation:** All database queries across all 18 controllers and 22 services strictly enforce user scoping using `auth()->id()` or `$request->user()->id`. Cross-user data leakage is guarded by Pest tests (`tests/Feature/AnalyticsTest.php`, `tests/Feature/StageOneDataSafetyTest.php`).
- **SQL Injection:** Eloquent ORM and Laravel query builder parameterization are used throughout. No raw unescaped SQL concatenations exist.
- **XSS Protection:** Frontend scripts exclusively utilize DOM text properties (`textContent`, `replaceChildren()`, `createElement()`) when inserting user-controlled content (descriptions, notes, categories). `innerHTML` is never used with unescaped API data.
- **CSRF Protection:** State-changing requests enforce Laravel Sanctum CSRF protection with `X-XSRF-TOKEN` cookie/header matching.
- **Rate Limiting:** Granular throttling configured:
  - Auth routes: `6 requests / minute`
  - CSV export and search: `20 requests / minute`
  - Full data export: `10 requests / minute`
  - CSV import preview: `20 requests / minute`
  - CSV import execution: `5 requests / minute`
- **CSV Formula Injection:** `App\Support\Csv::cell()` sanitizes formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`, `\n`) by prepending an apostrophe (`'`).
- **Financial Calculation Integrity:** Currency amounts avoid floating-point math through `App\Support\Money` string decimal representations and integer cents conversions.
- **Idempotency Guarantees:** Financial mutations (`POST /api/expenses`, `/incomes`, `/budgets`, `/recurring-*`, `/savings-goals/*`, `/net-worth/*`) require an `Idempotency-Key` header handled by `EnsureIdempotentRequest`. Retried requests replay the original response without executing duplicate database writes.

---

## 10. Existing Tests and Quality Baseline

### 10.1 Backend Test Results (`release-work\spendsense-backend`)
- **Execution Command:** `php vendor/bin/pest`
- **Duration:** 85.27 seconds
- **Assertions:** 2,055 assertions
- **Test Summary:**
  - **Passed:** 350 tests
  - **Skipped:** 14 tests (PostgreSQL-specific check constraint tests skipped as intended when executing against local SQLite)
  - **Failed:** 0 tests
  - **Status:** **GREEN / PASSING**

### 10.2 Frontend Test Results (`release-work\spendsense-frontend`)
- **Suite 1: Node Unit, Orchestration and Worker Tests:**
  - Command: `node tools/run-tests.js --suite=node`
  - Test Files Discovered: 8 test files (`analytics-period.test.js`, `api-client.test.js`, `date-format.test.js`, `prepare-deploy.test.js`, `reports-orchestration.test.js`, `theme-colors.test.js`, `transactions-client.test.js`, `worker-proxy.test.js`)
  - Assertions: 70 passed, 0 failed, 0 skipped
  - Status: **GREEN / PASSING**
- **Suite 2: Chrome DevTools Browser Regression Tests:**
  - Command: `node tools/run-tests.js --suite=browser`
  - Chrome Version: Google Chrome 156.0.8078.80
  - Test Files Discovered: 7 test files (`account-settings-browser.test.js`, `categories-browser.test.js`, `reports-browser.test.js`, `reports-period-browser.test.js`, `responsive-layout.test.js`, `theme-browser.test.js`, `transactions-browser.test.js`)
  - Assertions: 9 passed, 0 failed, 0 skipped
  - Status: **GREEN / PASSING**
- **Suite 3: Legacy Site Architecture Verification:**
  - Command: `node tools/legacy-site-verify.js`
  - Result: *Legacy site verification passed: 14 pages, one Reports item, no Goals/Bills/separate Insights, category CRUD present.*
  - Status: **GREEN / PASSING**
- **Suite 4: Deployment Build Preparation:**
  - Command: `node deploy/prepare-frontend-deploy.js --api-base-url https://spendsensehq.pages.dev --destination ...`
  - Result: 14 HTML pages, JS, CSS, and worker assets copied and validated cleanly.
  - Status: **GREEN / PASSING**

---

## 11. Requirement-to-File Mapping

| Requirement | Current Status | Evidence | Relevant Files | Remaining Work | Dependencies |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **Landing Page Mobile Navigation** | **DEFECTIVE** | `index.html:12-28` lacks `.nav-toggle` button and `[data-nav-links]`. Links hide at $\le 768\text{px}$. | `index.html`<br/>`styles.css`<br/>`script.js` | Add mobile hamburger button and `data-nav-links` attribute to `index.html`; wire drawer open/close CSS. | None |
| **Landing Page 320px Overflow** | **DEFECTIVE** | `.landing-nav .l-bar` has `gap: 28px` without wrap; `.l-container` has 56px padding. | `styles.css:1369-1374`<br/>`styles.css:1731-1748` | Add `flex-wrap: wrap` and reduce horizontal padding/gap under mobile media queries. | None |
| **Auth Modal Touch Targets** | **DEFECTIVE** | Password toggle is 28px (`styles.css:542`); modal close is 32px (`styles.css:1800`). | `styles.css:533-555`<br/>`styles.css:1800` | Increase interactive bounding box / touch target to $\ge 44 \times 44\text{px}$. | None |
| **Auth Modal Focus Management** | **DEFECTIVE** | No focus trap inside `#auth-modal`; no focus restoration on modal close. | `script.js:296-352`<br/>`index.html:134-194` | Implement `Tab` focus trap listener and restore focus to trigger element upon closing. | None |
| **Unified Transactions View** | **PARTIAL** | Backend has `TransactionSearchController` & `TransactionSearchService`. Frontend has no unified page. | Backend: `TransactionSearchService.php`<br/>Frontend: `dashboard/dashboard.js`, new UI | Add unified transactions UI or update dashboard to display union of income & expenses. | Backend `/transactions/search` |
| **Financial Goals (Savings Goals)** | **PARTIAL** | Backend has full models, services, migrations, and routes. Frontend has 0 pages. | Backend: `SavingsGoal.php`, `SavingsGoalService.php`<br/>Frontend: `tools/legacy-site-verify.js` | Create frontend savings goals UI if specification permits expanding beyond 14 pages. | Backend `/savings-goals` |
| **Recurring Payments** | **PARTIAL** | Backend has full bill schedule/reminders. Frontend has only income frequency dropdown. | Backend: `RecurringExpenseService.php`<br/>Frontend: `expense-management/expenses.html` | Expose recurring bills UI and recurrence management on frontend. | Backend `/recurring-expenses` |
| **Financial Health & Insights** | **PARTIAL** | Backend has 6 intelligence services. Frontend only shows basic cash flow and category charts. | Backend: `SpendingInsightsService.php`<br/>Frontend: `reports-analytics/reports.html` | Expose spending trends, commitments, and cash-flow forecast widgets in reports UI. | Backend `/analytics/*` |
| **CSV Import and Export** | **PARTIAL** | Backend has streaming CSV export and previewable import with formula protection. Frontend has no buttons. | Backend: `ImportController.php`, `ReportCsvService.php`<br/>Frontend: `reports.html`, `expenses.html` | Add "Export CSV" buttons to Reports/Expenses and "Import CSV" modal on Expenses page. | Backend `/transactions/export`, `/import` |
| **Financial Calendar** | **PARTIAL** | Backend `BillCalendarService` projects monthly calendar days. Frontend has 0 calendar UI. | Backend: `BillCalendarService.php`<br/>Frontend: New calendar component | Build calendar grid UI consuming `/api/recurring-expenses/calendar`. | Backend `/recurring-expenses/calendar` |
| **Debt and Loan Tracker** | **MISSING** | 0 dedicated models, migrations, or services exist in backend or frontend. | Backend: Needs new model, migration, service<br/>Frontend: Needs new UI | Design and implement complete debt/loan schema, payment schedule logic, and UI. | Database migration |
| **Password Reset Flow** | **DEFECTIVE** | `forgot-password.html` exists but displays "not yet available"; backend has no reset route. | Backend: `routes/api.php`<br/>Frontend: `auth.js:31-40` | Implement password reset token handling or remove misleading link if out of scope. | Mail service / auth token |

---

## 12. Confirmed Defects

1. **Landing Page Mobile Navigation Deadlock:**
   - *Impact:* Critical for mobile usability.
   - *Root Cause:* `index.html` omits `.nav-toggle` button and `[data-nav-links]` attribute; `styles.css:1746` hides `.landing-nav .l-links` at $\le 768\text{px}$.
   - *Result:* Mobile visitors cannot navigate to Features, Dashboard, or Support from the landing page.
2. **Horizontal Overflow at 320px Viewport:**
   - *Impact:* High visual defect.
   - *Root Cause:* `.landing-nav .l-bar` (`styles.css:1370`) has no `flex-wrap` and enforces `gap: 28px` alongside `56px` total padding on `.l-container`, exceeding 320px viewport width.
3. **WCAG Touch Target Size Non-Compliance:**
   - *Impact:* Accessibility violation (WCAG 2.1 SC 2.5.5).
   - *Root Cause:* Password visibility toggle button height is set to `28px` (`styles.css:542`); mobile modal close button is set to `32px \times 32px` (`styles.css:1800`).
4. **Modal Focus Trap and Focus Restoration Absence:**
   - *Impact:* Accessibility violation (WCAG 2.1 SC 2.4.3).
   - *Root Cause:* `script.js:296-352` opens `#auth-modal` without trapping keyboard `Tab` cycles or saving/restoring `document.activeElement`.
5. **Dashboard "Recent Transactions" Incompleteness:**
   - *Impact:* Data integrity / Functional discrepancy.
   - *Root Cause:* `dashboard/dashboard.js:353` queries only `api.get('/expenses')`. Income transactions are never displayed in the recent transactions card despite being logged.
6. **Password Reset Unavailability:**
   - *Impact:* Functional dead end.
   - *Root Cause:* `authentication/forgot-password.html` exists in the UI, but has no backend endpoint and always displays a warning that password reset is unsupported.

---

## 13. Missing and Partially Implemented Functionality

1. **Missing Frontend UI for Implemented Backend Capabilities:**
   - **CSV Export:** Backend has `/api/transactions/export` and `/api/reports/export`. Frontend has 0 export buttons.
   - **CSV Import:** Backend has `/api/import/preview` and `/api/import`. Frontend has 0 import forms.
   - **Savings Goals:** Backend has complete models, ledger, and calculations. Frontend has 0 pages.
   - **Recurring Expenses / Bills:** Backend has occurrence generator, reminder scheduler, and bill calendar. Frontend has 0 pages.
   - **Financial Health / Cash Flow Forecasting:** Backend has 6 intelligence services. Frontend reports page does not consume them.
2. **Missing Backend & Frontend Modules:**
   - **Debt and Loan Tracker:** No database tables, models, business rules, or UI exist anywhere in the repository.

---

## 14. Unverified Requirements

1. **PostgreSQL Constraint Tests in Host SQLite Environment:**
   - 14 tests in `tests/Feature/StageFiveBoundaryTest.php` asserting PostgreSQL-specific check constraints (`CHECK amount > 0`, etc.) were skipped when running against SQLite (`Tests: 14 skipped, 350 passed`). While verified passing in GitHub Actions CI (Run 42026278530), they cannot be verified locally without a live PostgreSQL instance.
2. **Live Cloudflare Pages Worker Production Origin Proxying:**
   - The Worker proxy was verified via simulated Node VM unit tests (`tests/worker-proxy.test.js: 70 assertions passing`), but live network requests against Cloudflare edge infrastructure require deployment credentials.

---

## 15. Dependencies and Implementation Risks

1. **Legacy Site Architecture Constraint (`tools/legacy-site-verify.js`):**
   - CI executes `node tools/legacy-site-verify.js`, which strictly asserts that the frontend contains exactly 14 pages and that navigation contains **no** `goals`, `bills`, or `insights` links.
   - *Risk:* Introducing separate pages for Savings Goals or Bills will fail CI unless `legacy-site-verify.js` and the specification are aligned.
2. **Root-Relative vs. Relative Path Discrepancy in `spendsense-frontend-main`:**
   - `spendsense-frontend-main` has 13 uncommitted files converting relative paths (`../styles.css`) to root-relative paths (`/styles.css`).
   - *Risk:* Root-relative paths fail when viewing the app via `file://` or under non-root subpaths, but are required when hosted under domain root. Changes must preserve deployment compatibility.
3. **Idempotency Key Collisions on Retries:**
   - The backend strictly enforces idempotency. When modifying frontend forms, ensure the automatic `Idempotency-Key` is retained on retries and regenerated only for fresh user submissions.

---

## 16. Recommended Implementation Order

To ensure architectural coherence and prevent regressions, subsequent implementation should follow this sequenced order:

1. **Batch A: UI/UX & Accessibility Fixes (Prompt 2):**
   - Fix landing page mobile navigation: Add `.nav-toggle` and `[data-nav-links]` to `index.html`.
   - Fix 320px overflow: Adjust `.landing-nav .l-bar` flex wrapping and container padding.
   - Fix touch targets: Expand password toggle and modal close buttons to $\ge 44 \times 44\text{px}$.
   - Fix modal accessibility: Implement `Tab` focus trap and focus restoration.
2. **Batch B: Core Data Completeness & Dashboard Reconciliation:**
   - Update Dashboard "Recent transactions" widget to incorporate both expenses and incomes (or consume `/api/transactions/search`).
   - Wire CSV Export buttons on `reports.html` and `expenses.html` to `/api/reports/export` and `/api/transactions/export`.
   - Expose CSV Import preview modal on `expenses.html` wired to `/api/import/preview` and `/api/import`.
3. **Batch C: Advanced Intelligence & Reporting Integration:**
   - Integrate Cash Flow Forecast and Spending Trends into `reports-analytics/reports.html` without violating the 14-page limit.
4. **Batch D: Standalone Feature Expansion (If Authorized):**
   - Savings Goals UI, Recurring Bills Calendar UI, and Debt Tracker (pending specification confirmation regarding the 14-page gate).

---

## 17. Explicit Confirmation of Read-Only Execution

**CONFIRMATION:**  
In strict compliance with prompt constraints:
- **No application code was modified.**
- **No CSS or frontend components were modified.**
- **No backend code, controllers, or services were modified.**
- **No database migrations or models were modified.**
- **No configuration or environment files were touched.**
- **No tests were modified.**
- **No packages or dependencies were installed or upgraded.**
- **No Git branches were switched, merged, rebased, committed, or pushed.**
- **Existing uncommitted user changes in `spendsense-frontend-main` were completely preserved.**

This completes the read-only repository audit and requirements reconciliation.

