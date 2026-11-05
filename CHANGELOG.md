# Changelog

All notable changes to the SpendSense Frontend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Multi-Palette Theme System:**
  - Implemented 4 cohesive theme palettes (Green, Blue, Red, Amber) with light/dark modes and near-black dark surfaces (PR #2, PR #3).
  - Centralized theme synchronization in `theme.js` persisting choices across sessions.
- **Contributor Experience & Governance Infrastructure:**
  - Added practical [CONTRIBUTING.md](CONTRIBUTING.md) guide detailing vanilla JS patterns, Node test runner commands, headless Chrome requirements, and branch/commit conventions.
  - Added responsible disclosure [SECURITY.md](SECURITY.md) policy with confidential reporting pathways.
  - Added [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) based on Contributor Covenant v2.1 with maintenance contact routing.
  - Added structured GitHub Issue Forms for bug reports (`bug_report.yml`) and feature requests (`feature_request.yml`).
  - Added standardized [Pull Request template](.github/pull_request_template.md).
- **Automated Test Discovery & CI Hardening:**
  - Implemented automated test discovery and suite separation (Node unit vs headless Chrome browser) via `tools/run-tests.js` (PR #10).
  - Enforced headless Chrome browser regression verification in GitHub Actions CI (PR #10).
  - Expanded Cloudflare Pages Worker reverse proxy integration test coverage for CORS preflight, session cookies, and network failure resiliency (PR #10).
  - Added dedicated deployment preparation regression verification in `tests/prepare-deploy.test.js` (PR #10).
- **Visual Application Showcase:**
  - Integrated high-fidelity visual showcase in `README.md` and `docs/screenshots/` featuring desktop and mobile responsive viewport captures (PR #9).
- **Comprehensive Technical Documentation:**
  - Added [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covering multi-page static architecture, state management, and Pages Worker proxy bridge.
  - Added [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) detailing local static server setup, Chrome binary discovery, and testing commands.
  - Added [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) documenting Cloudflare Pages atomic deployment pipeline and rollback procedures.
  - Added [docs/RELEASES.md](docs/RELEASES.md) establishing semantic versioning rules, tagging guidelines, and cross-repository release coordination.

### Changed
- Standardized local testing workflows around `node tools/run-tests.js`, eliminating shell-dependent wildcard globbing issues.
- Updated `README.md` with dynamic CI badges, release badge, and comprehensive project documentation links.
- Refined deployment documentation to describe CI-verified rollbacks without unverified time estimates.

### Fixed
- **Sidebar Layout:** Resolved fixed viewport height and flex scrolling behavior for desktop navigation sidebars (PR #2).
- **Theme Selector Runtime:** Fixed `settings.js` query selector to prevent matching the `html` root element when `data-theme-color` is set (PR #4).
- **Reports Loading Orchestration:** Resolved runtime loading stalls, preserved Chart canvas instances across refreshes, and enabled concurrent section execution (PR #5).
- **Reports Header Alignment:** Aligned reports header controls onto a single baseline and balanced card filter and table spacing (PR #8).

---

## [0.1.0] - 2026-10-24

> **Note:** `0.1.0` designates the initial historical development baseline commit (`2586369`) established during core implementation. It represents an internal development milestone rather than a published GitHub Release tag.

### Added
- **Core Multi-Page Interface:**
  - 14-page vanilla JavaScript (ES6+), HTML5, and CSS3 personal finance workspace.
  - Implemented interfaces for authentication, financial dashboard, expense ledger, income tracking, budget management, categories, reports, notifications, settings, and support.
- **Same-Origin Cloudflare Pages Worker Proxy:**
  - Implemented reverse proxy bridge in `functions/api/[[path]].js` routing `/api/*`, `/sanctum/*`, and `/user` requests to the Laravel API upstream on Render.
  - Preserved first-party session cookies and CSRF tokens across origins.
- **Production Build & Packaging Tooling:**
  - Added `deploy/prepare-frontend-deploy.js` producing sanitized, deployable copies with environment-specific API URL rewriting.
- **Automated Testing Suite:**
  - Implemented native Node.js test runner suite (`node:test`, `node:assert/strict`) covering API client behavior, date formatting, and transaction table filtering.
  - Added GitHub Actions CI pipeline running tests and deployment verification.
- **Cloudflare Pages Hosting:**
  - Configured atomic static hosting on Cloudflare Pages (`https://spendsensehq.pages.dev`).
