## Automatic Patch Version Bump on UAT Promotion

**Author:** Pemulis (Systems Dev)
**Date:** 2025-07-18

### Decision

Each dev → UAT promotion automatically bumps the patch version in `package.json` using `npm version patch --no-git-tag-version`. The bump commit is pushed to `dev` before the promotion PR is created, so the PR title reflects the new version.

### Rationale

- **Traceability:** Every UAT release has a unique version number. No more guessing which build is deployed.
- **Simplicity:** `npm version patch` is a one-liner that handles JSON editing cleanly. No custom scripts, no jq gymnastics.
- **Manual override preserved:** Minor and major bumps are still manual — just run `npm version minor` or `npm version major` on `dev` before the next promotion.

### Impact

- **Workflow permissions:** `contents: write` is now required at the workflow level (was `contents: read`). This affects both jobs in `squad-promote.yml`, but `uat-to-prod` already needed write for pushing staging branches.
- **Commit noise:** One extra `chore: bump version` commit per promotion. Acceptable trade-off for automated versioning.
- **package-lock.json:** Also updated by `npm version` and included in the bump commit.
