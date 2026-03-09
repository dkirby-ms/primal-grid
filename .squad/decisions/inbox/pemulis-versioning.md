## Versioning Baseline Established

**By:** Pemulis (Systems Dev)
**Date:** 2026-03-12
**Status:** IMPLEMENTED
**Files:** `package.json`, `.github/workflows/squad-promote.yml`, `.github/workflows/squad-release.yml`

**What:**
- Root `package.json` now has `"version": "0.1.0"` — the single source of truth for release versioning.
- `squad-promote.yml` (both dev→uat and uat→prod jobs) is hardened: if version is missing/undefined, falls back to short git SHA and logs a warning. PRs still get created with a meaningful identifier.
- `squad-release.yml` is hardened: if version is missing/undefined, the step fails with a clear error. Releases must have a real semver version — no `vundefined` tags.

**Why:** Both promote and release workflows were producing "vundefined" in PR titles and git tags because `package.json` had no `version` field. The hardening ensures this class of bug is caught immediately rather than silently producing bad artifacts.

**Design choices:**
- Promote workflows use a **soft fallback** (git SHA) because a promotion PR is still useful even without a version — it's a process step, not a release artifact.
- Release workflow uses a **hard fail** because git tags and GitHub releases with bad version strings pollute the release history and are painful to clean up.
- Starting at `0.1.0` per semver convention for pre-release software.
- No version bump automation added — version is bumped manually for now.

**Impact:** All future promote PRs and releases will have correct version identifiers. If someone removes the version field, promote still works (with SHA fallback) and release fails fast with a clear message.
