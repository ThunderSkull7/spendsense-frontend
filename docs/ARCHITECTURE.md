# SpendSense Frontend — Architecture & Design

This document details the architecture, script hierarchy, module boundaries, theme engine, and same-origin reverse proxy infrastructure of the SpendSense frontend application.

---

## 1. System Overview & Multi-Page Architecture

SpendSense is built as a responsive, zero-dependency **Multi-Page Application (MPA)** using semantic HTML5, modern CSS3 variables, and vanilla JavaScript (ES2022+). Rather than relying on a heavy Single-Page Application (SPA) framework, each functional domain is served as an independent HTML page.

### Architectural Principles

1. **Zero Runtime Framework Overhead:** No virtual DOM, client-side bundler runtime, or hydration delay. Pages render natively with minimal Time-To-Interactive (TTI).
2. **Domain Isolation:** Each application section resides in its own directory with dedicated HTML, CSS, and JS files (e.g. `expense-management/`, `budget-planning/`, `reports-analytics/`).
3. **Shared Foundation:** Common utilities (theming, session handling, API client, date formatting, and transaction table filtering) are modularized in the root directory and shared across all pages.
4. **First-Party Security:** Relies on HTTP-only session cookies and CSRF tokens bridged through a same-origin Cloudflare Pages reverse proxy.

```mermaid
flowchart TD
    subgraph Browser["User Browser Context"]
        HTML["14 Static HTML Pages<br/>(Dashboard, Expenses, Incomes, Budgets, Reports, etc.)"]
        Theme["theme.js<br/>Theme Palette, Dark Mode, Shell User"]
        Script["script.js (API Client)<br/>XSRF-TOKEN, Idempotency, 419 Retry, 401 Session"]
        Period["analytics-period.js<br/>Calendar Boundary Normalization"]
        TxClient["transactions-client.js<br/>Filtering, Search & Pagination"]
        PageJS["Page Module (e.g. dashboard.js, expenses.js)"]
    end

    HTML --> Theme
    HTML --> Script
    HTML --> Period
    HTML --> TxClient
    HTML --> PageJS
    PageJS --> Script
    PageJS --> TxClient
    PageJS --> Period
```

---

## 2. Shared JavaScript Modules

| Module | Location | Purpose & Primary Responsibilities |
| :--- | :--- | :--- |
| **`theme.js`** | Root | Executed synchronously in `<head>` to prevent Flash of Unstyled Content (FOUC). Applies color palettes (`green`, `blue`, `red`, `amber`), toggles dark/light mode, replaces hardcoded currency symbols, and hydrates user identity (`.user-name`, `.user-email`). Safe storage fallback to memory if `localStorage` is blocked. |
| **`script.js`** | Root | Core HTTP communication layer. Configures API origin from `<meta name="api-base-url">`, manages Sanctum CSRF cookies (`fetchXSRFToken`), attaches UUIDv4 idempotency keys, transparently retries 419 token mismatches, and emits `spendsense:session-expired` on 401s. |
| **`analytics-period.js`** | Root | Synchronizes analytics and reporting boundaries (`start_date`, `end_date`, calendar month selectors) so the dashboard and reports pages query identical calendar intervals. |
| **`transactions-client.js`**| Root | Client-side filtering, case-insensitive substring searching, multi-column sorting, and boundary-inclusive date filtering for transaction ledgers. |

---

## 3. API Client & Authentication Handling (`script.js`)

The `API` singleton in `script.js` governs all backend network communication:

```mermaid
sequenceDiagram
    autonumber
    actor Page as Page Script (e.g. expenses.js)
    participant Client as API Client (script.js)
    participant Worker as Cloudflare Pages Worker
    participant Backend as Laravel Sanctum API

    Page->>Client: API.post('/expenses', payload)
    Client->>Client: Check isIdempotentEndpoint('/expenses') -> Attach Idempotency-Key
    Client->>Client: ensureCsrfToken() -> Check XSRF-TOKEN cookie

    Client->>Worker: fetch('/api/expenses', { method: 'POST', credentials: 'include', headers: { 'X-XSRF-TOKEN', 'Idempotency-Key' } })
    Worker->>Backend: Forward to Laravel Upstream

    alt Successful Mutation (201 Created)
        Backend-->>Worker: HTTP 201 Created
        Worker-->>Client: HTTP 201 Response
        Client-->>Page: Return { response, data, status: 201 }
    else Stale CSRF Token (419 Page Expired)
        Backend-->>Worker: HTTP 419 Page Expired
        Worker-->>Client: HTTP 419 Response
        Note over Client: Automatic 1-time CSRF Refresh
        Client->>Worker: GET /sanctum/csrf-cookie
        Worker->>Backend: Forward /sanctum/csrf-cookie
        Backend-->>Worker: Set-Cookie: XSRF-TOKEN=new_token
        Worker-->>Client: Set-Cookie: XSRF-TOKEN=new_token
        Note over Client: Retry original request with fresh token and SAME Idempotency-Key
        Client->>Worker: fetch('/api/expenses', retry)
        Worker->>Backend: Forward retry
        Backend-->>Worker: HTTP 201 Created
        Worker-->>Client: HTTP 201 Created
        Client-->>Page: Return { response, data, status: 201 }
    else Session Expired (401 Unauthorized)
        Backend-->>Worker: HTTP 401 Unauthorized
        Worker-->>Client: HTTP 401 Response
        Client->>Client: dispatchEvent('spendsense:session-expired')
        Client-->>Page: Redirect to authentication/login.html
    end
```

---

## 4. Cloudflare Pages & Worker Reverse Proxy (`_worker.js`)

Browsers reject cross-origin cookies under modern privacy defaults (`SameSite=Lax`, cross-site tracking prevention). If the frontend on `https://spendsensehq.pages.dev` communicated directly with `https://spendsense-api-t0up.onrender.com`, session cookies would fail.

### Worker Proxy Routing Logic

When deployed to Cloudflare Pages, `deploy/prepare-frontend-deploy.js` outputs a generated `_worker.js` that acts as a same-origin bridge:

```mermaid
flowchart TD
    Req[Incoming Client Request] --> IsProxyPath{URL path starts with<br/>/api/* or /sanctum/*<br/>or exact /user?}
    
    IsProxyPath -- No --> StaticAssets["env.ASSETS.fetch(request)<br/>Serve static HTML, CSS, JS"]
    IsProxyPath -- Yes --> IsPreflight{Request method ==<br/>OPTIONS?}
    
    IsPreflight -- Yes --> PreflightRes["Return 204 No Content<br/>CORS Headers matching Origin"]
    IsPreflight -- No --> ProxyUpstream["Forward to Render Upstream<br/>https://spendsense-api-t0up.onrender.com<br/>Delete Host header<br/>Preserve Cookies, X-XSRF-TOKEN, Body"]
    
    ProxyUpstream --> FetchSuccess{Upstream Fetch<br/>Successful?}
    FetchSuccess -- Yes --> ReturnResponse["Return upstream response<br/>Attach CORS & Set-Cookie headers"]
    FetchSuccess -- No (Network error) --> Return502["Catch error & return HTTP 502 Bad Gateway<br/>JSON error envelope + CORS headers"]
```

### Origin Validation
The Worker inspects the incoming `Origin` header:
- Production host: `https://spendsensehq.pages.dev` (allowed).
- Cloudflare Pages preview subdomains: `https://*.spendsensehq.pages.dev` (allowed).
- Localhost development: `http://localhost:*`, `http://127.0.0.1:*` (allowed).
- Unauthorized origins: Defaults strictly to `https://spendsensehq.pages.dev` to prevent cross-origin abuse.

---

## 5. Theme & State Management (`theme.js`)

- **Storage:** Persisted in `localStorage` under `spendsenseThemeColor`, `spendsenseThemeMode`, and `spendsenseCurrency`.
- **Fault-Tolerance:** If `localStorage` access is restricted (e.g. private browsing mode or iframe sandboxing), `theme.js` intercepts the error and seamlessly falls back to an in-memory `Map`.
- **Accents:** Exactly 4 palettes supported:
  - `green` (Emerald default: `#10B981`)
  - `blue` (Indigo: `#6366F1`)
  - `red` (Rose: `#FB7185`)
  - `amber` (Gold: `#F59E0B`)
- **Dark Mode:** Toggles `data-mode="dark"` on `document.documentElement`, altering CSS semantic tokens (`--bg`, `--surface`, `--text-primary`, `--border`).
- **Dynamic Currency Formatting:** A `TreeWalker` automatically traverses static text nodes upon page load, replacing hardcoded currency amounts with the user's selected symbol (₹ INR, $ USD, € EUR, £ GBP, etc.).
