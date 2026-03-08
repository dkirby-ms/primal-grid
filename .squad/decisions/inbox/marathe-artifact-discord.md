# Decision: Direct Artifact Links in Discord E2E Notifications

**Date:** 2025-01-20  
**Author:** Marathe (DevOps / CI-CD)  
**Status:** Implemented  
**Commit:** e1cc5b6

## Context

Discord notifications from the E2E workflow previously included a generic "View Run" link that took users to the GitHub Actions run page, requiring multiple clicks to download the Playwright test report artifact. This slowed debugging when tests failed.

## Decision

Modified `.github/workflows/e2e.yml` to include direct artifact download links in Discord embeds.

## Implementation

### E2E Job Changes
- Added `id: upload-report` to the `upload-artifact` step (line 36)
- Exposed artifact ID as job output:
  ```yaml
  outputs:
    artifact-id: ${{ steps.upload-report.outputs.artifact-id }}
  ```

### Discord Notify Job Changes
- Added `ARTIFACT_ID: ${{ needs.e2e.outputs.artifact-id }}` env var
- Replaced "📦 Artifact" field with "📊 Test Report" field containing direct download link:
  ```bash
  REPORT_URL="https://github.com/${REPOSITORY}/actions/runs/${RUN_ID}/artifacts/${ARTIFACT_ID}"
  ```
- Added separate "🔗 Run" field for Actions run page link
- Removed dead PR event handling code (workflow now only triggers on push to uat/master)
- Removed unused env vars: `PR_NUMBER`, `PR_TITLE`, `EVENT_NAME`

## Rationale

- **One-click download:** Users can download reports directly from Discord without navigating through Actions UI
- **Faster debugging:** Reduces friction when investigating test failures
- **Code cleanup:** Removed dead PR handling logic since workflow simplified to push-only trigger
- **Maintained context:** Separate "Run" link still available for users who want full Actions page

## Pattern Established

GitHub Actions `upload-artifact@v4` exposes `artifact-id` output that can be used to construct direct download URLs:
```
https://github.com/{owner}/{repo}/actions/runs/{run_id}/artifacts/{artifact_id}
```

This pattern can be reused in other workflows that post notifications with artifact links.

## Validation

- YAML validated with Python `yaml.safe_load()` before commit
- Commit pushed to `dev` branch

## Related

- `.github/workflows/e2e.yml` (modified)
- `.squad/agents/marathe/history.md` (documented in Learnings)
