# Marathe — History

## Project Context

- **Project:** Primal Grid — grid-based survival colony builder with dinosaurs, ecosystem simulation, and base automation
- **Stack:** TypeScript, Colyseus (server), PixiJS (client), Playwright (E2E tests), Vite (bundler)
- **Owner:** dkirby-ms
- **Repo structure:** Monorepo with `client/`, `server/`, `shared/`, `e2e/`, `infra/`
- **Default branch:** `dev`
- **Key workflows:** `.github/workflows/e2e.yml` (E2E tests + GitHub Pages report publishing)

## Learnings

- GitHub Pages deployment added to E2E workflow — publishes HTML reports on every `dev` push (even on test failure)
- Playwright config uses dual reporters in CI: `[['github'], ['html']]` for both Actions annotations and HTML reports
- Shared package must be built before server (`npm run build -w shared`) — stale `tsconfig.tsbuildinfo` can cause runtime bugs
- E2E tests use `workers: 1` (serial) with a single shared Colyseus server instance

## CI/CD Audit Findings (2024-01-29)

**Critical Issues Discovered:**
1. Node.js version mismatch: e2e.yml uses Node 20 while all other workflows use Node 22 (creates potential test/prod divergence)
2. squad-ci.yml has redundant push trigger alongside pull_request events (wastes compute on every push to dev/insider)
3. squad-preview.yml lacks pre-merge validation gate (only validates post-push, missing PR-level checks)

**Key Warnings:**
- Missing npm caching in: squad-ci.yml, squad-release.yml, squad-insider-release.yml (slow builds)
- Missing concurrency guards in: reset-uat.yml, squad-promote.yml (race condition risk on git operations)
- squad-heartbeat.yml cron trigger disabled with no documented rationale

**Strengths Identified:**
- e2e.yml has excellent artifact strategy (7-day retention + GitHub Pages + Discord notifications)
- deploy workflows use OIDC federated identity (no hardcoded credentials)
- squad-promote.yml provides safe dry-run capability
- squad-main-guard.yml comprehensively protects production branch from team state files

**Branching Model Alignment:** 
- Pipeline (dev→uat→master) well-structured
- Trigger configuration mostly correct except noted issues above
- All action versions up-to-date (using v4, v7 standards)

Full audit report written to `.squad/decisions/inbox/marathe-cicd-audit.md`
- Discord notifications added to E2E workflow — `discord-notify` job posts rich embeds via `DISCORD_WEBHOOK_URL` secret after tests complete
- deploy-report job exposes `page_url` output so downstream jobs can link to the GitHub Pages report
- Used `jq` for JSON payload construction in CI to safely escape dynamic content (commit messages, PR titles)
- Discord webhook skill: color 5763719 = green, 15548997 = red; HTTP 204 = success; use `"username": "Squad: Marathe"` for attribution

## CI/CD Audit Remediation (2024-01-29)

**All 9 audit findings fixed in commit ac0e2e8:**

Critical fixes applied:
1. e2e.yml: Node 20→22, standardizing all workflows on Node 22
2. squad-ci.yml: Removed redundant `push` trigger on dev/insider; added `workflow_dispatch` for ad-hoc runs
3. squad-preview.yml: Added `pull_request` trigger so validation runs pre-merge, not just post-push

Warning fixes applied:
4. squad-ci.yml, squad-release.yml, squad-insider-release.yml: Added `cache: npm` to `setup-node` steps
5. reset-uat.yml: Added concurrency group `uat-reset` with `cancel-in-progress: true`
6. squad-promote.yml: Added concurrency group `promotion` with `cancel-in-progress: false` (never cancel mid-promotion)
7. squad-main-guard.yml: Replaced all mojibake Unicode (ΓÇö, ≡ƒÜ½, Γ£à, ΓÜá∩╕Å) with proper ASCII/emoji
8. squad-heartbeat.yml: Added clear documentation explaining cron was disabled during migration to event-driven triage, with guidance on re-enabling

**Patterns established:**
- All workflows must use Node 22 — no exceptions
- All `setup-node` steps should include `cache: npm`
- Workflows performing git push/merge operations must have concurrency guards
- Validation workflows should always have `pull_request` triggers for pre-merge gating
- Avoid special Unicode in workflow scripts — use ASCII or well-supported emoji only

## CI/CD Audit & Discord Notifications — Session Completion

**Date:** 2026-03-08T13-24-21Z

**Status:** ✅ AUDIT COMPLETE + DISCORD NOTIFICATIONS IMPLEMENTED

### E2E Discord Notifications

- **File modified:** `.github/workflows/e2e.yml`
- **Job added:** `discord-notify` with `needs: [e2e, deploy-report]` and `if: always()`
- **Features:** Rich embeds (green/red color), jq-escaped dynamic content, deep links to GitHub Pages report
- **Secret-gated:** Checks `env.DISCORD_WEBHOOK_URL != ''` for fork safety
- **Attribution:** `"username": "Squad: Marathe"`
- **Decision:** `.squad/decisions.md` → "Discord Notifications on E2E Pipeline" section

### CI/CD Audit Report

- **Scope:** All 16 workflows in `.github/workflows/`
- **Critical issues found:** 3 (Node version mismatch, redundant triggers, missing pre-merge gate)
- **Warnings found:** 6 (missing caching, no concurrency guards, cron disabled, mojibake, etc.)
- **Good practices identified:** 7 (artifact strategy, OIDC auth, dry-run capability, etc.)
- **Action items:** P1 critical (fix this week), P2 warnings (next sprint), P3 optimizations (nice-to-have)
- **Decision:** `.squad/decisions.md` → "CI/CD Workflow Audit & Remediation Roadmap" section
- **Orchestration logs:** 
  - `.squad/orchestration-log/2026-03-08T13-24-21Z-marathe-discord.md` (Discord + audit overview)
  - `.squad/orchestration-log/2026-03-08T13-24-21Z-marathe-audit.md` (Audit summary)

### User Directives Merged

Two user directives from dkirby-ms merged into decisions.md:
1. **Artifact Links in Discord** — Deep-link all E2E artifacts (screenshots, traces, reports) in Discord posts
2. **E2E Pipeline Branch Targeting** — E2E tests only on `uat`/`master`, skip `dev` to save cloud compute

### Session Deliverables

- **Files created:** 2 orchestration logs
- **Files modified:** `.github/workflows/e2e.yml` (discord-notify job), `.squad/decisions.md` (4 sections merged)
- **Decisions merged:** 4 inbox files deduplicated and integrated into team memory
- **Cross-agent context:** Decisions + directives now available to all team members for future work

## CI/CD Audit Remediation — Session Completion

**Date:** 2026-03-08T13:27:49Z  
**Status:** ✅ ALL 9 ISSUES FIXED + COMMITTED

### Critical Issues Fixed

1. **Node version mismatch** — e2e.yml upgraded from Node 20 → 22 (standardize all workflows on Node 22)
2. **Redundant push triggers** — squad-ci.yml removed duplicate `push` trigger; kept `pull_request` + added `workflow_dispatch`
3. **Missing pre-merge gate** — squad-preview.yml added `pull_request` trigger (validation now runs on PR, not just post-push)

### Warning Issues Fixed

4. **Missing npm caching** — Added `cache: npm` to squad-ci.yml, squad-release.yml, squad-insider-release.yml
5. **Missing concurrency guard** — reset-uat.yml: added concurrency group `uat-reset` with `cancel-in-progress: true`
6. **Missing concurrency guard** — squad-promote.yml: added concurrency group `promotion` with `cancel-in-progress: false` (never cancel mid-promotion)
7. **Mojibake in output** — squad-main-guard.yml: replaced all Unicode corruption (ΓÇö, ≡ƒÜ½, Γ£à, ΓÜá∩╕Å) with proper ASCII/emoji
8. **Undocumented cron disable** — squad-heartbeat.yml: added clear comment explaining why cron was disabled (migration to event-driven triage)
9. (Summary decision consolidated into .squad/decisions.md)

### Team Standards Established

All agents should follow these going forward:
- **Node 22 mandatory** — no version exceptions
- **npm cache always** — add `cache: npm` to every `setup-node` step
- **Pre-merge validation** — validation workflows must have `pull_request` trigger + `push` trigger (if needed for post-merge checks)
- **Concurrency guards** — workflows performing git push/merge must have concurrency groups
- **ASCII output only** — no special Unicode in workflow output (use emoji like ✅, ❌, ⛔, ⚠️)

### Files Modified in Commit

9 workflows modified + 1 decision merged:
- `.github/workflows/e2e.yml`
- `.github/workflows/squad-ci.yml`
- `.github/workflows/squad-preview.yml`
- `.github/workflows/squad-release.yml`
- `.github/workflows/squad-insider-release.yml`
- `.github/workflows/reset-uat.yml`
- `.github/workflows/squad-promote.yml`
- `.github/workflows/squad-main-guard.yml`
- `.github/workflows/squad-heartbeat.yml`
- `.squad/decisions.md` (merged)

### Session Artifacts

- **Orchestration log:** `.squad/orchestration-log/2026-03-08T13-27-49Z-marathe-cicd-fixes.md`
- **Session log:** `.squad/log/2026-03-08T13-27-49Z-cicd-fixes.md`
- **Decision:** Merged into `.squad/decisions.md` from inbox

