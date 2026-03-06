# Decision: UAT Branch Auto-Reset Workflow

**Date:** 2025-01-21  
**Decided by:** Pemulis (Systems Dev)  
**Status:** Implemented

## Context

After UAT code is promoted to master (via merge), the UAT branch can diverge from master if we continue to push experimental code to UAT. To prevent this, we need an automated way to reset UAT to match master after each master push.

## Decision

Created `.github/workflows/reset-uat.yml` that:

1. **Triggers on any push to master** — No `paths-ignore`. The goal is to keep UAT in sync with master at all times, even for doc changes.
2. **Supports manual runs** via `workflow_dispatch` for emergency resets.
3. **Uses `contents: write` permission** to allow force-pushing to the uat branch.
4. **Fetches both branches explicitly** (`git fetch origin master:master` and `git fetch origin uat:uat`) to ensure we have the latest state.
5. **Uses `--force-with-lease`** instead of `--force` for safety — this prevents accidentally overwriting changes if someone else pushed to uat.
6. **Configures git user as github-actions bot** for proper commit attribution.
7. **Adds step summary** showing the master commit that was reset to and noting that UAT will redeploy.

## Workflow Sequence

1. Code is merged from UAT to master (via PR)
2. Push to master triggers:
   - `deploy.yml` → deploys to production
   - `reset-uat.yml` → resets UAT branch to master
3. Push to UAT (from reset) triggers:
   - `deploy-uat.yml` → redeploys UAT with the new master code

This creates a controlled loop: master push → reset UAT → deploy UAT. The reset workflow itself only triggers on master pushes, so there's no infinite loop.

## Alternatives Considered

- **paths-ignore like deploy.yml**: Decided against this. The point is to keep UAT synchronized with master at all times, regardless of what changed.
- **Using `--force` instead of `--force-with-lease`**: `--force-with-lease` is safer — it will fail if someone else pushed to uat in the meantime, preventing accidental overwrites.
- **Manual reset only**: Would require remembering to reset after every master push. Automation is better.

## Risks and Mitigations

- **Risk:** Someone pushes experimental code to UAT between the master push and the reset completing.
  - **Mitigation:** The window is very small (seconds), and `--force-with-lease` will detect this and fail, alerting us.
- **Risk:** The workflow fails due to permissions or git errors.
  - **Mitigation:** GitHub Actions will send failure notifications, and we have `workflow_dispatch` for manual recovery.

## Maintenance Notes

- The workflow uses `${{ secrets.GITHUB_TOKEN }}` which is automatically provided by GitHub Actions with appropriate permissions.
- If UAT divergence becomes a problem (e.g., we want to keep long-lived feature branches in UAT), we may need to revisit this approach.
