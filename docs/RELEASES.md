# SpendSense Frontend â€” Release & Versioning Guide

This document defines the semantic versioning strategy, release management process, cross-repository coordination, and hotfix workflows for the **SpendSense Frontend** web application.

---

## 1. Versioning Strategy

SpendSense follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) (`vMAJOR.MINOR.PATCH`):

| Component | Format | When to Increment | Compatibility |
|---|---|---|---|
| **MAJOR** | `v1.0.0` | Incompatible client changes, breaking HTML/URL structures, major redesigns dropping legacy browser support, or changes requiring incompatible API versions. | Breaking |
| **MINOR** | `v0.2.0` | Backward-compatible new UI features, new page views, theme additions, or non-breaking client-side workflow enhancements. | Backward-compatible |
| **PATCH** | `v0.2.1` | Backward-compatible UI bug fixes, layout corrections, accessibility enhancements, test runner improvements, or documentation updates. | Backward-compatible |

### Current Release Status: `v0.2.0` (Active Baseline)

* **`v0.1.0` (Initial Classic Site Baseline):** Completed 14-page vanilla JS interface, classic single-reports site structure, Cloudflare Pages hosting, and same-origin Pages Worker reverse proxy bridge.
* **`v0.2.0` (Current Governance & Production Readiness Baseline):** Multi-palette theme system (Slate, Emerald, Indigo, Amber), sidebar layout stabilization, automated test runner (`tools/run-tests.js`) with headless Chrome browser regression enforcement, comprehensive architecture/deployment documentation, and contributor governance infrastructure.

---

## 2. Cross-Repository Release Coordination

The SpendSense system is comprised of two distinct repositories:

1. **Frontend:** [`ThunderSkull7/spendsense-frontend`](https://github.com/ThunderSkull7/spendsense-frontend) (Static vanilla JS application hosted on Cloudflare Pages with Pages Worker reverse proxy)
2. **Backend:** [`ThunderSkull7/spendsense-backend`](https://github.com/ThunderSkull7/spendsense-backend) (Laravel REST API hosted on Render with PostgreSQL on Neon)

### Compatibility Matrix

| Frontend Version | Compatible Backend Version | Integration Contract |
|---|---|---|
| `v0.2.x` | `v0.2.x` | Stateful Sanctum session authentication, `/api/*` endpoints, `/user` hydration route, and standard error envelopes (`message`, `errors`). |
| `v0.1.x` | `v0.1.x` | Initial prototype endpoints and legacy reporting payloads. |

### Release Sequencing Rules

When releasing changes that span both repositories:

1. **Deploy Backend first:** Any backend API endpoints, parameters, or schema changes must be deployed and verified on Render before deploying frontend code that consumes them.
2. **Graceful UI degradation:** Frontend code should defensively check API responses and handle missing fields or unexpected network errors gracefully.
3. **Same-origin Worker Proxy:** Production deployments rely on the Cloudflare Pages Worker (`functions/api/[[path]].js` or generated `_worker.js`) to bridge browser requests to the Render API origin. Always verify that proxy routes match backend routes.

---

## 3. Creating Annotated Git Tags

All formal releases are marked by signed or annotated Git tags following the `vX.Y.Z` naming convention:

```bash
# 1. Ensure you are on the latest main branch
git checkout main
git pull --ff-only origin main

# 2. Verify that all CI checks are green
gh run list --branch main --limit 3

# 3. Create an annotated Git tag with a release summary
git tag -a v0.2.0 -m "Release v0.2.0: Multi-palette theme system, automated test discovery, and contributor governance"

# 4. Push the tag to GitHub (only when authorized)
git push origin v0.2.0
```

> [!CAUTION]
> **Do not push release tags without explicit review and authorization.**

---

## 4. Publishing GitHub Releases

GitHub Releases provide release notes, visual previews, and changelogs for users and contributors.

### Publishing via GitHub CLI (`gh`)

```bash
# Generate release notes from tag
gh release create v0.2.0 \
  --title "SpendSense Frontend v0.2.0 â€” Production Readiness & Governance" \
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
- Compatible with `spendsense-backend` version: `v0.2.x`

**Full Commit Changelog:** https://github.com/ThunderSkull7/spendsense-frontend/compare/v0.1.0...v0.2.0
```

---

## 5. Hotfix Procedure

When a critical UI rendering bug or client-side regression occurs in production:

1. **Branch from the current release tag:**
   ```bash
   git checkout -b fix/critical-ui-bug v0.2.0
   ```
2. **Apply the minimal fix:** Keep the modification isolated to the defect.
3. **Run automated regression tests:** Verify with `node tools/run-tests.js --suite=all`.
4. **Submit PR targeting `main`:** Ensure all GitHub Actions test and build verification checks pass.
5. **Merge and tag PATCH release:** Tag `v0.2.1` and publish release notes detailing the fix.
