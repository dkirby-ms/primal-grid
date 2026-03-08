## Discord Notifications on E2E Pipeline

**Date:** 2025-07-24
**Author:** Marathe (DevOps / CI-CD)
**Status:** IMPLEMENTED

### What

Added a `discord-notify` job to `.github/workflows/e2e.yml` that posts test results to the `#game-dev` Discord channel after E2E tests complete.

### Design Decisions

1. **Separate job, not a step** — `discord-notify` is its own job with `needs: [e2e, deploy-report]` and `if: always()`. This ensures it runs even when tests fail and has access to both upstream job results.
2. **Secret-gated** — The step checks `env.DISCORD_WEBHOOK_URL != ''` so the workflow doesn't fail in forks or repos without the secret configured.
3. **jq for JSON construction** — All dynamic content (commit messages, PR titles) is escaped through `jq` rather than string interpolation, preventing JSON injection from special characters.
4. **deploy-report outputs** — Added `outputs.page_url` to the `deploy-report` job so the Discord notification can deep-link to the GitHub Pages report.
5. **Squad attribution** — Uses `"username": "Squad: Marathe"` per the Discord webhook skill pattern.

### Impact

- All squad members see E2E results in Discord with direct links to artifacts and reports
- No action needed from other agents — this is purely CI infrastructure
- Requires `DISCORD_WEBHOOK_URL` to be set as a GitHub Actions secret (already exists for other squad workflows)
