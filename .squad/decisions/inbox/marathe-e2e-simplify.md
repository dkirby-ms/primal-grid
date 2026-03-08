# E2E Workflow Simplification

**Date:** 2025-01-20  
**Author:** Marathe  
**Status:** Implemented

## Decision

Simplified the E2E GitHub Actions workflow (`.github/workflows/e2e.yml`) to:
1. Only trigger on pushes to `uat` and `master` branches (removed PR trigger)
2. Remove automatic GitHub Pages deployment of test reports
3. Keep artifact uploads for manual report download

## Context

The E2E workflow was running on every PR and automatically deploying Playwright reports to GitHub Pages. User feedback indicated this was unnecessary overhead.

## Changes Made

- **Removed:** `pull_request` trigger from workflow
- **Removed:** Entire `deploy-report` job (lines 42-71) including:
  - GitHub Pages configuration
  - Artifact download/upload for Pages
  - Pages deployment step
- **Simplified:** `discord-notify` job to depend only on `e2e` job
- **Removed from Discord notification:**
  - DEPLOY_RESULT environment variable
  - PAGES_URL output reference
  - Pages URL field in Discord embed
- **Kept:** Playwright report artifact upload in `e2e` job for manual download

## Impact

- **Faster workflow:** Reduced job count from 3 to 2
- **No PR runs:** E2E only runs on actual deployments (uat/master pushes)
- **Simpler permissions:** No longer needs `pages: write` or `id-token: write`
- **Report access:** Teams can still download Playwright reports from workflow run artifacts

## Rationale

Running comprehensive E2E tests on every PR can be time-consuming and resource-intensive. Since the team has other testing layers (unit, integration), limiting E2E to deployment branches (uat/master) provides sufficient coverage while reducing CI load. GitHub Pages deployment added complexity without strong team usage—artifact downloads are sufficient for debugging failures.
