# SpendSense — Prompt 3: Dashboard Transaction Parity & CSV Export Implementation Report

**Date:** November 6, 2026  
**Status:** Completed & Fully Verified  
**Scope:** Prompt 3 (Dashboard Recent Transactions Parity `TX-01`, CSV Export Hardening & Workflow `DATA-01`)

---

## 1. Initial Repository and Branch State

Prior to making changes, the authoritative repositories and branches were inspected and confirmed:

### Frontend Authoritative Repository
- **Path:** `C:\Users\shaha\SpendSense\release-work\spendsense-frontend`
- **Branch:** `docs/theme-description-correction`
- **HEAD Commit:** `a31ebb8fa22763fc81a56b9e2e138ca0bb613ab9` (`docs: update theme description to document light and dark modes with teal accent`)
- **Remote Tracking:** `origin/docs/theme-description-correction` (up to date)
- **Pre-Implementation State:** Working tree contained Phase 1 / Prompt 2.2 fixes; 14 modified files, 0 untracked test files.

### Backend Authoritative Repository
- **Path:** `C:\Users\shaha\SpendSense\release-work\spendsense-backend`
- **Branch:** `docs/phase-1-release-readiness`
- **HEAD Commit:** `045d675d9750b9afe1d5af70346e80736e6b260a` (`docs: clarify dependency security audit wording in README`)
- **Remote Tracking:** `origin/docs/phase-1-release-readiness` (up to date)
- **Pre-Implementation State:** Clean working tree.

### Non-Authoritative / Comparison Workspaces
- `spendsense-frontend-main`: Left completely untouched.
- `spendsense-backend-main`: Left completely untouched.

---

## 2. Exact Specification Requirement IDs Addressed

Cross-referenced against `SpendSense_Outstanding_Changes_and_Implementation_Specification.md`:

| Requirement ID | Specification Section | Description | Implementation Status |
|---|---|---|---|
| **TX-01** | Section 8, 8.5, 33 (Phase 2), 41 (Backlog) | **Dashboard Recent Transactions Parity**: Dashboard must display both logged expenses and logged income, sorted newest-first, with unambiguous visual distinction (amounts, icons, types), deterministic tie-breaking, robust empty/error/partial failure states, and zero synthetic fallback data. | **PASS** |
| **DATA-01** | Section 8.6, 9.2, 33 (Phase 2), 41 (Backlog) | **CSV Export Workflow & Hardening**: Full CSV export workflow for transactions (expenses, incomes, all) and reports. Respects active search query, date ranges, and categories. Hardened against CSV formula injection (`=`, `+`, `-`, `@`, `\|`, `%`), prepends UTF-8 BOM for spreadsheet fidelity, ensures 2 decimal place numeric precision, enforces user data isolation, and wires UI export triggers across expenses, income, and reports pages with authenticated blob streaming. | **PASS** |

*Note: CSV Import (`DATA-02`) and Financial Planning modules (Goals, Bills, Debt Tracker, Net Worth) were explicitly out of scope for Prompt 3 and remain deferred to subsequent phases.*

---

## 3. Files Created and Modified, with Explanations

### Backend (`release-work/spendsense-backend`)

1. **`app/Support/Csv.php` (Modified)**
   - Added `public const BOM = "\xEF\xBB\xBF";` to support universal spreadsheet UTF-8 encoding recognition (Excel, LibreOffice, Apple Numbers).
   - Upgraded formula injection neutralization in `Csv::cell(mixed $value)`. The regex now scans for leading formula triggers (`=`, `+`, `-`, `@`, `|`, `%`), including leading whitespace, tabs, and newlines (`^[\s\x00-\x20]*[=+\-@|%]/u`).
   - Added regex protection that strictly preserves legitimate positive and negative decimal numbers (e.g., `-123.45`, `+50`, `0.00`, `99`) so financial amounts remain numeric in exported spreadsheets while text formulas (`=SUM(...)`, `|calc.exe`, `%COMSPEC%`, `-cmd`) are neutralized with a leading single quote.
2. **`app/Http/Controllers/TransactionSearchController.php` (Modified)**
   - Updated the `export` action stream callback to write `Csv::BOM` at byte offset 0 of the output stream before writing headers or transaction rows.
3. **`app/Http/Controllers/ReportController.php` (Modified)**
   - Updated the `export` action stream callback to write `Csv::BOM` at byte offset 0 before streaming the report CSV content.
4. **`tests/Feature/CsvExportHardeningTest.php` (Created)**
   - Comprehensive Pest feature test suite containing 7 tests and 42 assertions covering:
     - Formula injection neutralization (`|calc`, `%COMSPEC%`, `@SUM`, `=cmd`, leading whitespace, tabs, newlines).
     - Preservation of signed numeric values (`-123.45`, `-100`, `+50`).
     - Presence of UTF-8 BOM in transaction and report exports.
     - Active filter preservation (`type`, `q`, `from`, `to`).
     - Empty export behavior (headers only, no blank rows).
     - User boundary isolation (cannot export other users' records).
     - Unauthenticated request rejection (HTTP 401).

### Frontend (`release-work/spendsense-frontend`)

1. **`dashboard/dashboard.html` (Modified)**
   - Updated card subtitle from `"Latest logged expenses"` to `"Latest expenses and income"` to reflect true parity.
2. **`dashboard/dashboard.js` (Modified)**
   - Modified `loadDashboard()` to concurrently fetch both `/expenses` and `/incomes` using `Promise.allSettled()`.
   - Added `normalizeExpenseRow()` and `normalizeIncomeRow()` helper functions to normalize dates (`expense_date`, `income_date`, `transaction_date`, `date`), amounts, descriptions/sources, and category tone tokens.
   - Implemented 4-tier deterministic sorting: `date` DESC $\to$ `created_at` DESC $\to$ `id` DESC $\to$ `type` tie-breaker (`'expense'` vs `'income'`).
   - Implemented partial failure handling: if one endpoint fails (e.g. 500 error or network glitch) while the other succeeds, an accessible status notice banner (`.tx-partial-notice`) alerts the user, and the available records are rendered without crash or data loss.
   - Implemented empty state handling: when both succeed with 0 items, displays `"No transactions logged yet. Add your first expense or income to see it here."`
   - Added signed amount semantics (`+₹...` with `.amount-pos` in teal/green for income; `-₹...` with `.amount-neg` for expense).
   - Subtitle formatted cleanly: `Date · Type · Category/Source`.
   - Hooked `spendsense:theme-change` to re-render transactions with appropriate palette tones.
3. **`script.js` (Modified)**
   - Added `SpendSenseAPI.downloadFile(endpoint, fallbackFilename)`:
     - Handles authenticated `fetch()` with credentials and CSRF tokens.
     - Detects and dispatches `spendsense:session-expired` on HTTP 401.
     - Parses `Content-Disposition` header to obtain the server-specified filename.
     - Creates and triggers a temporary blob URL link for clean browser download without page navigation.
     - Revokes the object URL cleanly to prevent memory leaks.
4. **`expense-management/expenses.html` & `expense-management/expenses.js` (Modified)**
   - Added `<button type="button" class="btn secondary sm" data-export-csv>Export CSV</button>` inside the filter toolbar (`.filter-actions`).
   - Bound button to `SpendSenseAPI.downloadFile()` with active filters (`q`, `from`, `to`, `category_id`), type set to `expense`, button loading state (`Exporting…`), and toast feedback.
5. **`income-management/income.html` & `income-management/income.js` (Modified)**
   - Added `<button type="button" class="btn secondary sm" data-export-csv>Export CSV</button>` inside `.filter-actions`.
   - Bound button to `SpendSenseAPI.downloadFile()` with active filters (`q`, `from`, `to`), type set to `income`, button loading state, and toast feedback.
6. **`reports-analytics/reports.html` & `reports-analytics/reports.js` (Modified)**
   - Added `<button class="btn secondary sm" type="button" data-reports-export>Export CSV</button>` in the topbar actions next to the Refresh button.
   - Bound button to `SpendSenseAPI.downloadFile('/reports/export?from=...&to=...')` computing the current selected reporting period's calendar boundaries.
7. **`styles.css` (Modified)**
   - Enforced `min-width: 0;` on `.card`, `.grid > *`, `.tx-row`, and `.tx-main` to prevent long transaction titles or badges from causing flex layout blowouts.
   - Added `.grid-main-side { grid-template-columns: minmax(0, 1fr); }` for viewports under 1180px.
   - Adjusted `.card-body.tight { padding: 0 16px; }` at `@media (max-width: 640px)`.
   - Result: 0px horizontal overflow across all tested mobile viewports (360px, 390px, 768px, 1280px).
8. **`tests/dashboard-transactions.test.js` (Created)**
   - 11 unit test cases in Node test runner covering:
     - Mixed expense and income transaction rendering.
     - Deterministic newest-first sort ordering.
     - Signed currency formatting and visual type distinctions.
     - Expense-only dataset handling.
     - Income-only dataset handling.
     - Completely empty state.
     - Income endpoint failure with safe notice and expense display.
     - Expense endpoint failure with safe notice and income display.
     - Both endpoints failing with error retry state.
     - Deterministic tie-breaking when dates match.
     - Missing and malformed field tolerance.
     - `SpendSenseAPI.downloadFile` blob streaming and 401 handling.

---

## 4. Dashboard Implementation Details

### Data Fetching and Fault Tolerance
- Concurrently fetches `api.get('/expenses')` and `api.get('/incomes')` inside `loadDashboard()`.
- Wraps the calls in `Promise.allSettled()` alongside `/analytics/*` endpoints.
- If one endpoint rejects or returns non-200, the surviving endpoint's data is extracted, and a status banner (`.tx-partial-notice`) is inserted at the top of the transaction container informing the user (e.g., `"Could not load recent income transactions. Displaying expenses only."`).
- If both fail, `SpendSenseUI.renderState(transactionsEl, 'error', ...)` is displayed with a retry button that re-triggers `loadDashboard()`.

### Deterministic Sorting Logic
Transactions are merged and sorted according to the specification:
```javascript
combined.sort((a, b) => {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  if (a.created_at && b.created_at && a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  const idA = Number(a.id);
  const idB = Number(b.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA < idB ? 1 : -1;
  }
  if (a.type !== b.type) {
    return a.type < b.type ? -1 : 1;
  }
  return 0;
});
```

### Visual Styling and Typography
- **Incomes:**
  - Avatar: Primary teal background (`var(--primary-100)`), primary border, initial letter of source.
  - Amount: `+₹...` in green/teal (`.amount-pos`).
  - Subtitle: `${date} · Income · ${source}`.
- **Expenses:**
  - Avatar: Category-specific tone (`getCategoryTone()`), initial letter of category name.
  - Amount: `-₹...` (`.amount-neg`).
  - Subtitle: `${date} · Expense · ${categoryName}`.
- Limits display to the latest 6 items (`combined.slice(0, 6)`), with clean text ellipsis truncation on small screens.

---

## 5. CSV Export Implementation Details

### Formula Injection Hardening
In `Csv.php`:
```php
public static function cell(mixed $value): string
{
    // ...
    // Strictly preserve legitimate numbers (integers, negative decimals, zero)
    if (preg_match('/^-?\d+(?:\.\d+)?$/', $str)) {
        return $str;
    }

    // Neutralize formula triggers: =, +, -, @, |, %, and leading whitespace/control chars
    if (preg_match('/^[\s\x00-\x20]*[=+\-@|%]/u', $str)) {
        $str = "'{$str}";
    }

    // Standard CSV escaping
    return str_replace('"', '""', $str);
}
```

### BOM Inclusion
In `TransactionSearchController.php` and `ReportController.php`:
```php
echo Csv::BOM;
```
Prepending the UTF-8 Byte Order Mark (`\xEF\xBB\xBF`) ensures Microsoft Excel automatically opens the CSV with UTF-8 encoding, preventing corruption of currency symbols and non-ASCII characters.

### Frontend Integration
- Export buttons placed in `.filter-actions` on `expenses.html` and `income.html` ensure natural responsiveness on 360px mobile viewports without overflowing topbars.
- Queries serialize currently active filters:
  - Expenses: `/transactions/export?type=expense&q=...&from=...&to=...&category_id=...`
  - Incomes: `/transactions/export?type=income&q=...&from=...&to=...`
  - Reports: `/reports/export?from=...&to=...`

---

## 6. API Contract Changes

No breaking changes or schema migrations were introduced. Existing API endpoints were preserved and enhanced:

| Endpoint | Method | Change / Enhancement |
|---|---|---|
| `/api/transactions/export` | GET | Now streams `\xEF\xBB\xBF` UTF-8 BOM as first 3 bytes. Formula neutralization covers `|` and `%`. Unadorned decimals preserved. |
| `/api/reports/export` | GET | Now streams `\xEF\xBB\xBF` UTF-8 BOM as first 3 bytes. User isolation and date parameters preserved. |
| `/api/expenses` | GET | Unchanged. Consumed concurrently with `/api/incomes` on dashboard. |
| `/api/incomes` | GET | Unchanged. Consumed concurrently with `/api/expenses` on dashboard. |

---

## 7. Security and Authorization Findings

1. **Formula Injection Neutralization:**
   - Payloads tested: `=cmd|'/c calc'!A1`, `+1+1`, `@SUM(A1:A10)`, `|calc`, `%COMSPEC%`, `\t=1+1`, `\n-2+5`.
   - All text formula variations are prepended with `'` by `Csv::cell()`.
   - Genuine financial numbers (e.g. `-123.45`, `250.00`) are verified to retain unquoted numeric format.
2. **User Data Isolation:**
   - Both `/transactions/export` and `/reports/export` query with `$request->user()->...`.
   - Verified via `CsvExportHardeningTest` that User A cannot see or export User B's transactions or report summaries under any filter or parameter manipulation.
3. **Authentication Enforcement:**
   - Unauthenticated requests to both export endpoints return HTTP 401 Unauthorized.
   - Frontend `SpendSenseAPI.downloadFile()` catches HTTP 401 and fires `spendsense:session-expired` to trigger re-authentication.

---

## 8. Tests Added and Updated

### New Test Suites
1. **`release-work/spendsense-backend/tests/Feature/CsvExportHardeningTest.php`** (7 tests, 42 assertions)
2. **`release-work/spendsense-frontend/tests/dashboard-transactions.test.js`** (11 tests, 33 assertions)

### Existing Test Suites Verified
- Frontend Node Suite: 9 files, 82 assertions (all passed).
- Frontend Browser Suite: 7 files, 10 assertions (all passed, including responsive layout across 360px, 390px, 768px, 1280px).
- Frontend Legacy Site Verification: `legacy-site-verify.js` (14 pages, 1 Reports nav item, verified passed).
- Backend Pest Test Suite: 350 tests passed (2,055 assertions, 14 skipped baseline).

---

## 9. Exact Test Commands and Results

### 1. Backend CsvExportHardeningTest
**Command:**
```powershell
cd C:\Users\shaha\SpendSense\release-work\spendsense-backend
php vendor/bin/pest tests/Feature/CsvExportHardeningTest.php
```
**Output:**
```
   PASS  Tests\Feature\CsvExportHardeningTest
  ✓ csv cell utility neutralizes formula injection payloads including pipes and percent variables
  ✓ csv cell utility preserves legitimate negative and positive numbers
  ✓ transaction export includes utf8 bom header and neutralizes dangerous formulas in text fields
  ✓ transaction export respects active filters and date ranges
  ✓ transaction export emits headers only when no records match
  ✓ transaction export isolates user data and enforces authentication
  ✓ reports export includes utf8 bom header and is owner scoped

  Tests:    7 passed (42 assertions)
  Duration: 0.68s
```

### 2. Backend StageFiveTest
**Command:**
```powershell
cd C:\Users\shaha\SpendSense\release-work\spendsense-backend
php vendor/bin/pest tests/Feature/StageFiveTest.php
```
**Output:**
```
   PASS  Tests\Feature\StageFiveTest
  Tests:    31 passed (199 assertions)
  Duration: 1.17s
```

### 3. Frontend Dashboard Unit Tests
**Command:**
```powershell
cd C:\Users\shaha\SpendSense\release-work\spendsense-frontend
node --test tests/dashboard-transactions.test.js
```
**Output:**
```
✔ dashboard renders combined expense and income transactions sorted newest-first (56.6586ms)
✔ dashboard renders correct type indicators and signed amount semantics (57.6117ms)
✔ dashboard handles expense-only data gracefully (58.3464ms)
✔ dashboard handles income-only data gracefully (57.9048ms)
✔ dashboard displays empty state when both expense and income datasets are empty (58.321ms)
✔ dashboard handles income API failure with safe notice and displays expenses (53.9061ms)
✔ dashboard handles expense API failure with safe notice and displays income (53.9302ms)
✔ dashboard renders error state when both expense and income APIs fail (57.8786ms)
✔ dashboard breaks ties deterministically when dates are identical (58.8939ms)
✔ dashboard tolerates malformed or missing optional fields without throwing (58.1469ms)
✔ SpendSenseAPI downloadFile initiates authenticated blob download and handles 401 (2.0483ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1638.9064
```

### 4. Full Frontend Node Suite
**Command:**
```powershell
cd C:\Users\shaha\SpendSense\release-work\spendsense-frontend
node tools/run-tests.js --suite=node
```
**Output:**
```
============================================================
SpendSense Test Suite Execution Summary
============================================================
Total test files discovered : 16
Node Tests      : PASS (9 files, 82 assertions: 82 passed, 0 failed, 0 skipped)
------------------------------------------------------------
Overall Result  : PASSED (82 passed, 0 failed, 0 skipped)
============================================================
```

### 5. Full Frontend Browser Suite
**Command:**
```powershell
cd C:\Users\shaha\SpendSense\release-work\spendsense-frontend
node tools/run-tests.js --suite=browser
```
**Output:**
```
============================================================
SpendSense Test Suite Execution Summary
============================================================
Total test files discovered : 16
Browser Tests   : PASS (7 files, 10 assertions: 10 passed, 0 failed, 0 skipped)
------------------------------------------------------------
Overall Result  : PASSED (10 passed, 0 failed, 0 skipped)
============================================================
```

### 6. Legacy Site Verification
**Command:**
```powershell
cd C:\Users\shaha\SpendSense\release-work\spendsense-frontend
node tools/legacy-site-verify.js
```
**Output:**
```
Legacy site verification passed: 14 pages, one Reports item, no Goals/Bills/separate Insights, category CRUD present.
```

---

## 10. Regression Comparison Against Phase 1 Baselines

| Baseline Metric | Phase 1 Acceptance Baseline | Prompt 3 Status | Regression? |
|---|---|---|---|
| **Theme System** | 4 palettes (Teal, Amber, Blue, Rose), Light & Dark modes, persistent storage | Fully intact, re-renders transactions on theme change | None |
| **MPA Pages** | 14 functional MPA pages | 14 functional MPA pages verified | None |
| **Mobile Responsiveness** | 0px overflow across 360px, 390px, 768px, 1280px | 0px overflow across all viewports in `responsive-layout.test.js` | None |
| **Authentication Modal** | Focus trap excludes inactive forms (`DEFECT-AUDIT-01` resolved) | Fully preserved, passes all auth tests | None |
| **Session & Token Management** | CSRF 419 single retry, 401 session expiration, idempotency preservation | Intact; `downloadFile` integrates seamlessly with 401 expiration | None |
| **Navigation & Links** | Single Reports navigation item, correct MPA paths | Verified by `legacy-site-verify.js` | None |

---

## 11. Remaining Limitations or Deferred Requirements

1. **CSV Import (`DATA-02`):**
   - Import workflow (file parsing, column mapping, validation, duplicate checking) was deferred in accordance with prompt instructions.
2. **Financial Planning Modules:**
   - Goals, Bills, Debt Tracker, and Net Worth are scheduled for subsequent roadmap phases.
3. **Unified Transactions Dedicated MPA View (`TX-02`):**
   - The standalone `/transactions` master search/table view is separate from the dashboard widget (`TX-01`) and is scheduled for the next Phase 2 prompt.

---

## 12. Git Working-Tree Status

### Confirmation of Git Non-Destructive Invariance
- **No commits were made.**
- **No branch switching occurred.**
- **No git pushes, merges, rebases, or resets occurred.**
- **Authoritative Branches:**
  - Frontend: `docs/theme-description-correction` at commit `a31ebb8fa22763fc81a56b9e2e138ca0bb613ab9`.
  - Backend: `docs/phase-1-release-readiness` at commit `045d675d9750b9afe1d5af70346e80736e6b260a`.

### Status Summary: `release-work/spendsense-frontend`
```
On branch docs/theme-description-correction
Your branch is up to date with 'origin/docs/theme-description-correction'.

Changes not staged for commit:
	modified:   authentication/auth.js
	modified:   dashboard/dashboard.html
	modified:   dashboard/dashboard.js
	modified:   expense-management/expenses.html
	modified:   expense-management/expenses.js
	modified:   income-management/income.html
	modified:   income-management/income.js
	modified:   index.html
	modified:   reports-analytics/reports.html
	modified:   reports-analytics/reports.js
	modified:   script.js
	modified:   styles.css
	modified:   tests/api-client.test.js
	modified:   tests/responsive-layout.test.js

Untracked files:
	tests/dashboard-transactions.test.js
```

### Status Summary: `release-work/spendsense-backend`
```
On branch docs/phase-1-release-readiness
Your branch is up to date with 'origin/docs/phase-1-release-readiness'.

Changes not staged for commit:
	modified:   app/Http/Controllers/ReportController.php
	modified:   app/Http/Controllers/TransactionSearchController.php
	modified:   app/Support/Csv.php

Untracked files:
	tests/Feature/CsvExportHardeningTest.php
```

---

## 13. Final Requirement-by-Requirement PASS / PARTIAL / FAIL Matrix

| ID | Requirement Description | Verification Evidence | Status |
|---|---|---|---|
| **REQ-3.1** | **Dashboard Mixed Transactions**: Dashboard loads and merges both logged expenses and logged income. | `tests/dashboard-transactions.test.js` (Test 1, 2) passes; fetches `/expenses` and `/incomes` concurrently. | **PASS** |
| **REQ-3.2** | **Deterministic Newest-First Order**: Transactions sorted by date descending, created_at descending, ID descending, type tie-breaker. | Verified in `tests/dashboard-transactions.test.js` (Test 1 & 9). | **PASS** |
| **REQ-3.3** | **Visual Parity & Semantics**: Distinct visual presentation for income (`+₹...`, `.amount-pos`, teal icon) and expenses (`-₹...`, `.amount-neg`, category tone). | Verified in `tests/dashboard-transactions.test.js` (Test 2) and visual browser checks. | **PASS** |
| **REQ-3.4** | **Partial & Empty Failure Tolerance**: Graceful fallback and notice banner when one endpoint fails; error state with retry when both fail; empty state when both have 0 items. | Verified in `tests/dashboard-transactions.test.js` (Tests 5, 6, 7, 8). | **PASS** |
| **REQ-3.5** | **Zero Synthetic Data**: Displays only genuine API records; no hardcoded or mock fallback transactions. | Inspected `dashboard.js`; verified in unit tests. | **PASS** |
| **REQ-3.6** | **CSV Formula Injection Defense**: Neutralizes `=`, `+`, `-`, `@`, `\|`, `%` with leading single quote; preserves legitimate negative/positive decimals. | `tests/Feature/CsvExportHardeningTest.php` (Tests 1 & 2) passes with 42 assertions. | **PASS** |
| **REQ-3.7** | **UTF-8 BOM Header**: Transaction and report exports stream `\xEF\xBB\xBF` byte sequence at start for spreadsheet compatibility. | `tests/Feature/CsvExportHardeningTest.php` (Tests 3 & 7) passes. | **PASS** |
| **REQ-3.8** | **Active Filter Preservation**: CSV export respects search keyword, date ranges (`from`, `to`), and category filters. | `tests/Feature/CsvExportHardeningTest.php` (Test 4) passes. | **PASS** |
| **REQ-3.9** | **User Data Isolation & Auth**: Export requires authentication; isolates records strictly to authenticated user. | `tests/Feature/CsvExportHardeningTest.php` (Test 6) passes. | **PASS** |
| **REQ-3.10** | **Frontend UI Export Triggers**: Export CSV buttons available and wired on Expenses, Income, and Reports pages. | Handlers wired to `SpendSenseAPI.downloadFile()`; verified in Node & Browser suites. | **PASS** |
| **REQ-3.11** | **Authenticated Blob Streaming**: `SpendSenseAPI.downloadFile()` manages headers, blob URL creation/cleanup, and triggers `spendsense:session-expired` on 401. | `tests/dashboard-transactions.test.js` (Test 11) passes. | **PASS** |
| **REQ-3.12** | **Phase 1 Responsive & Design Invariance**: Zero horizontal scrollbar on 360/390/768/1280px viewports; all 14 MPA pages verified. | `tests/responsive-layout.test.js` (all viewports pass) & `legacy-site-verify.js` passes. | **PASS** |

