# SpendSense Frontend - Release & Versioning Guide

This document defines the semantic versioning strategy, release management process, cross-repository coordination, and hotfix workflows for the **SpendSense Frontend** web application.

---

## 1. Versioning Strategy

SpendSense adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) (`vMAJOR.MINOR.PATCH`).

### Semantic Versioning Specification (Pre-1.0 Behavior)

Under **SemVer 2.0.0 Clause 4**:
> *"Major version zero (0.y.z) is for initial development. Anything MAY change at any time. The public API SHOULD NOT be considered stable."*

Accordingly, pre-1.0 versions do not provide strict contractual guarantees against breaking changes between arbitrary minor versions.

### SpendSense Compatibility Policy

To provide stability and predictability across frontend and backend integrations, the SpendSense project voluntarily adopts the following internal release conventions:

| Component | Format | When to Increment | Project Policy |
|---|---|---|---|
| **MAJOR** | `v1.0.0` | Formal public production release with stable HTML architecture, client storage schemas, and production deployments. | Breaking |
| **MINOR** | `v0.2.0` | Backward-compatible new UI features, new page views, theme additions, or non-breaking client-side workflow enhancements. | Planned backward-compatible |
| **PATCH** | `v0.2.1` | Backward-compatible UI bug fixes, layout corrections, accessibility enhancements, test runner improvements, or documentation updates. | Backward-compatible |

### Current Repository Status

* **Historical Baseline (`0.1.0`):** Initial historical development baseline commit (`2586369`) covering 14-page vanilla JS interface, classic single-reports site structure, Cloudflare Pages hosting, and same-origin Pages Worker reverse proxy bridge.
* **Active Working State (`[Unreleased]`):** Multi-palette theme system (Green, Blue, Red, Amber), sidebar layout stabilization, automated test runner (`tools/run-tests.js`) with headless Chrome browser regression enforcement, comprehensive architecture/deployment documentation, and contributor governance infrastructure.
* **Release Tags:** No Git release tags or GitHub Releases have been published yet. Formal tagging will commence when authorized.

---

## 2. Cross-Repository Release Coordination

The SpendSense system is comprised of two distinct repositories:

1. **Frontend:** [`ThunderSkull7/spendsense-frontend`](https://github.com/ThunderSkull7/spendsense-frontend) (Static vanilla JS application hosted on Cloudflare Pages with Pages Worker reverse proxy)
2. **Backend:** [`ThunderSkull7/spendsense-backend`](https://github.com/ThunderSkull7/spendsense-backend) (Laravel REST API hosted on Render with PostgreSQL on Neon)

### Compatibility Matrix

| Frontend Ref / Branch | Backend Ref / Branch | Compatibility Status | Integration Contract Notes |
|---|---|---|---|
| `main` branch (Active) | `main` branch (Active) | :white_check_mark: Verified Compatible | Currently verified compatible pairing: stateful Sanctum session cookies, `/api/*` routes, `/user` hydration route, and same-origin Pages Worker reverse proxy. |
| Historical baseline commit `2586369` | Historical baseline commit `a4b14e7` | :warning: Unverified (Historical Baseline) | Internal development baselines representing initial pre-release implementation. Their existence does not establish verified end-to-end cross-repository compatibility. |
| Arbitrary historical or cross-version pairings | Arbitrary historical or cross-version pairings | :warning: Unverified | Pre-1.0 versions do not formalize cross-version compatibility. Arbitrary historical or mismatched combinations remain unverified unless supported by explicit integration-test evidence. |

### Release Sequencing Rules

When releasing changes that span both repositories:

1. **Deploy Backend first:** Any backend API endpoints, parameters, or schema changes must be deployed and verified on Render before deploying frontend code that consumes them.
2. **Graceful UI degradation:** Frontend code should defensively check API responses and handle missing fields or unexpected network errors gracefully.
3. **Same-origin Worker Proxy:** Production deployments rely on the Cloudflare Pages Worker (`functions/api/[[path]].js` or generated `_worker.js`) to bridge browser requests to the Render API origin. Always verify that proxy routes match backend routes.

---

## 3. Creating Annotated Git Tags (Future-Facing Guide)

When a formal release is authorized, annotated Git tags should be created using the `vX.Y.Z` naming convention:

```bash
# 1. Ensure you are on the latest main branch
git checkout main
git pull --ff-only origin main

# 2. Verify that all CI checks are green
gh run list --branch main --limit 3

# 3. Create an annotated Git tag with a release summary (illustrative example)
# NOTE: Do not execute until an official release is authorized.
git tag -a v0.2.0 -m "Release v0.2.0: Multi-palette theme system, automated test discovery, and contributor governance"

# 4. Push the tag to GitHub (only when explicitly authorized)
git push origin v0.2.0
```

> [!CAUTION]
> **Do not create or push release tags without explicit review and authorization.**

---

## 4. Publishing GitHub Releases (Future-Facing Guide)

GitHub Releases provide release notes, visual previews, and changelogs for users and contributors.

### Publishing via GitHub CLI (`gh`)

```bash
# Illustrative command for future release publication
gh release create v0.2.0 \
  --title "SpendSense Frontend v0.2.0 - Production Readiness & Governance" \
  --notes-file docs/release-notes-v0.2.0.md \
  --verify-tag
```

### Release Notes Template

```markdown
## Highlights
- Brief summary of user-facing improvements, new views, or visual enhancements.

## What's Changed
### Added
- Feature 1 or new view component
- Feature 2 or new theme palette

### Changed
- UI styling refinement or responsive layout improvement

### Fixed
- Browser-specific rendering bug or interaction fix

## Cross-Repository Compatibility
- Verified compatible with `spendsense-backend` reference: [specify commit/tag]

*(Full commit comparison link will be available once formal release tags are published.)*
```

---

## 5. Hotfix Procedure

When a critical UI rendering bug or client-side regression occurs in production:

1. **Branch from the current stable commit or tag:**
   ```bash
   git checkout -b fix/critical-ui-bug main
   ```
2. **Apply the minimal fix:** Keep the modification isolated to the defect.
3. **Run automated regression tests:** Verify with `node tools/run-tests.js --suite=all`.
4. **Submit PR targeting `main`:** Ensure all GitHub Actions test and build verification checks pass.
5. **Merge and tag PATCH release (when authorized):** Tag `v0.2.1` and publish release notes detailing the fix.
