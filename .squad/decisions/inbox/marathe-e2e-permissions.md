# E2E Workflow Permissions Scoping

**Date:** 2026-03-08  
**Agent:** Marathe (DevOps/CI-CD)  
**Context:** PR #52 code review hygiene fixes

## Decision

Workflow permissions in `.github/workflows/e2e.yml` have been scoped to job-level instead of workflow-level.

### Before

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

All three permissions were granted to ALL jobs in the workflow (`e2e`, `deploy-report`, `discord-notify`).

### After

**Workflow-level:**
```yaml
permissions:
  contents: read
```

**Job-level (deploy-report only):**
```yaml
jobs:
  deploy-report:
    permissions:
      pages: write
      id-token: write
```

## Rationale

**Security principle:** Least privilege — each job should only have the minimum permissions it needs to operate.

- `contents: read` — needed by all jobs (checkout, artifact downloads)
- `pages: write` — ONLY needed by `deploy-report` job (publishes to GitHub Pages)
- `id-token: write` — ONLY needed by `deploy-report` job (OIDC token for Pages deployment)

The `e2e` job (runs tests, uploads artifacts) and `discord-notify` job (sends webhook) don't need write permissions to Pages or ID tokens.

## Pattern for All Workflows

Going forward, all GitHub Actions workflows should:
1. Grant only `contents: read` at workflow level (baseline for most jobs)
2. Add job-level `permissions:` blocks for jobs that need elevated permissions
3. Document WHY each permission is needed in comments if non-obvious

This reduces the blast radius if a job is compromised or has a security vulnerability.

## Related

- `.squad/decisions.md` line 4764, 4779 — also fixed branch trigger documentation (`uat`/`master`, not `dev`)
- User directive: E2E tests intentionally skip `dev` branch to save cloud compute
