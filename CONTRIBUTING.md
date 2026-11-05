# Contributing to SpendSense Frontend

Thank you for your interest in contributing to the **SpendSense Frontend**! This repository hosts the responsive, accessible vanilla JavaScript, HTML5, and CSS3 web application for SpendSense, backed by the [spendsense-backend](https://github.com/ThunderSkull7/spendsense-backend) API.

This guide outlines our development workflow, standards, testing expectations, and contribution process.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it to understand our community standards and expectations.

---

## Reporting Issues & Requesting Features

- **Bug Reports:** If you discover a layout issue, browser bug, or interaction error, please open an issue using the [Bug Report template](https://github.com/ThunderSkull7/spendsense-frontend/issues/new?template=bug_report.yml).
- **Feature Requests:** To propose new UI features, visualization components, or user experience enhancements, open an issue using the [Feature Request template](https://github.com/ThunderSkull7/spendsense-frontend/issues/new?template=feature_request.yml).
- **Security Vulnerabilities:** **Do not open public GitHub issues for security vulnerabilities.** Please review our [Security Policy](SECURITY.md) for instructions on confidential disclosure.

---

## Getting Started

### 1. Prerequisites

Ensure your local development environment meets the following requirements:

- **Node.js:** v24 or later (required for the native Node.js test runner `--test`).
- **Web Browser:** Google Chrome (required for running headless browser regression tests) or any modern Chromium/WebKit/Gecko browser for manual testing.
- **Git:** v2.30 or later.
- **Backend API (Optional):** A running instance of [spendsense-backend](https://github.com/ThunderSkull7/spendsense-backend) at `http://127.0.0.1:8002` if testing live API authentication and endpoints.

### 2. Fork and Clone

1. Fork the repository to your GitHub account.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/spendsense-frontend.git
   cd spendsense-frontend
   ```
3. Add the upstream repository as a remote:
   ```bash
   git remote add upstream https://github.com/ThunderSkull7/spendsense-frontend.git
   git fetch upstream
   ```

### 3. Local Development Server

Because SpendSense is built entirely with native vanilla JavaScript, HTML, and CSS, **no build step, transpiler, or `npm install` is required**.

Start any standard static HTTP server from the repository root:

- **Using Node `npx serve`:**
  ```bash
  npx serve -l 8000 .
  ```
- **Using Python 3:**
  ```bash
  python -m http.server 8000
  ```
- **Using PHP:**
  ```bash
  php -S 127.0.0.1:8000
  ```

Open your browser to `http://127.0.0.1:8000`.

> [!TIP]
> In local development, the `<meta name="api-base-url">` tag in each HTML page points to `http://127.0.0.1:8002`. **Do not modify this URL in the source files.** The deployment script (`deploy/prepare-frontend-deploy.js`) automatically configures the production origin during deployment builds.

---

## Branching Conventions

Always create a dedicated feature branch from the latest upstream `main` branch:

```bash
git checkout main
git pull upstream main
git checkout -b <type>/<descriptive-kebab-case-name>
```

### Branch Prefix Types

- `feat/`: New user interface feature or component (e.g., `feat/budget-chart-tooltip`)
- `fix/`: Bug fix or layout rendering correction (e.g., `fix/safari-date-picker`)
- `docs/`: Documentation, screenshots, or governance updates (e.g., `docs/contributor-guide`)
- `test/`: New automated test cases or test runner improvements (e.g., `test/worker-cookie-proxy`)
- `refactor/`: Code reorganization without behavioral or visual changes (e.g., `refactor/theme-toggle-module`)
- `chore/`: Tool configuration, GitHub Actions, or deployment scripts (e.g., `chore/actions-runner-bump`)

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short description in imperative present tense>

[optional body explaining motivation and context]

[optional footer with issue reference, e.g., Closes #15]
```

### Examples

- `feat(ui): add keyboard navigation for modal dialogs`
- `fix(analytics): correct month-boundary calculation in transaction filter`
- `docs(development): update headless chrome discovery instructions`
- `test(browser): add responsive layout assertions for mobile viewport`
- `refactor(api): streamline csrf token header attachment`

Keep commits focused, atomic, and logically grouped.

---

## Code Quality & Engineering Standards

### 1. Vanilla JavaScript Principles

- **No Heavy Frameworks:** Write clean, modular modern JavaScript (ES6+).
- **Encapsulation:** Avoid creating unnecessary globals in the `window` scope. Encapsulate page logic in dedicated helper namespaces (e.g., `API`, `Theme`, `TransactionsClient`).
- **Strict Equality:** Always use `===` and `!==`.
- **Defensive Error Handling:** Handle network exceptions gracefully and present user-friendly error messages rather than unhandled promise rejections.

### 2. Semantic HTML & Accessibility (a11y)

- Use semantic HTML tags (`<main>`, `<nav>`, `<section>`, `<article>`, `<button>`).
- Ensure all interactive elements have accessible names and support keyboard interaction (`Tab`, `Enter`, `Escape`).
- Maintain sufficient color contrast ratios in both light and dark themes.

### 3. Styling & Responsive Design

- Write pure CSS3 using standard CSS custom properties (`var(--...)`) defined in `styles.css`.
- Support responsive viewport breakpoints across mobile (< 640px), tablet (640px - 1024px), and desktop (> 1024px).
- Respect user operating system preferences (`prefers-color-scheme`, `prefers-reduced-motion`).

---

## Testing Guidelines

SpendSense uses the native Node.js test runner (`node:test` and `node:assert/strict`) orchestrating unit, integration, and browser tests via `tools/run-tests.js`.

### Running Tests Locally

1. **Run Node unit, orchestration, and Worker proxy tests (fast):**
   ```bash
   node tools/run-tests.js --suite=node
   ```

2. **Verify Google Chrome detection for browser tests:**
   ```bash
   node tools/run-tests.js --check-chrome
   ```

3. **Run headless Chrome browser regression tests:**
   ```bash
   node tools/run-tests.js --suite=browser
   ```

4. **Run the entire test suite (all test files sequentially):**
   ```bash
   node tools/run-tests.js --suite=all
   ```

5. **Run legacy site structure verification:**
   ```bash
   node tools/legacy-site-verify.js
   ```

6. **Verify frontend deployment build script:**
   ```bash
   node deploy/prepare-frontend-deploy.js --api-base-url https://spendsensehq.pages.dev --destination ./dist-test
   ```

> [!NOTE]
> If Google Chrome is not installed on your local machine, browser tests will gracefully skip during local runs. However, all Node tests and browser tests are strictly enforced and must pass in GitHub Actions CI.

---

## Submitting a Pull Request

1. **Verify all checks locally:**
   - [ ] All Node tests pass: `node tools/run-tests.js --suite=node`
   - [ ] Browser tests pass: `node tools/run-tests.js --suite=browser`
   - [ ] Build preparation succeeds: `node deploy/prepare-frontend-deploy.js`
   - [ ] Legacy site structure verified: `node tools/legacy-site-verify.js`
2. **Push your branch to your fork:**
   ```bash
   git push origin <type>/<descriptive-name>
   ```
3. **Open a Pull Request:**
   - Target the `main` branch of `ThunderSkull7/spendsense-frontend`.
   - Provide a clear, detailed PR title using Conventional Commits syntax.
   - Complete all sections of the [Pull Request template](.github/pull_request_template.md).
   - Link any related issue(s) (e.g., `Fixes #23`).
4. **Address Review Feedback:**
   - Participate in discussions and address feedback collaboratively.

Thank you for helping make SpendSense responsive, accessible, and fast!
