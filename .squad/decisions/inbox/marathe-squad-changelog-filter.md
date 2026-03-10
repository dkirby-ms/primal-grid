# Decision: Filter squad: commits from deploy changelogs

**Author:** Marathe
**Date:** 2026-03-10
**Status:** Implemented

## Context

Deploy workflows (deploy-uat, deploy, squad-promote) generate changelogs from git history for Discord notifications and PR bodies. Internal `squad:` and `squad(agent):` commits (logs, decisions, history updates) were polluting these changelogs with noise players don't care about.

## Decision

Added `grep -v ' squad[:(]'` filter to all 4 changelog generation points, applied immediately after the `RAW_LOG` assignment and before the `FEATURES`/`OTHER` split. This strips any commit line containing ` squad:` or ` squad(` — covering both conventional commit formats used by squad agents.

## Affected Files

- `.github/workflows/deploy-uat.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/squad-promote.yml` (2 locations: dev→uat and uat→prod)

## Rollout

Cherry-picked directly to dev, uat, and prod per team policy (CI-only changes get cherry-picked).
