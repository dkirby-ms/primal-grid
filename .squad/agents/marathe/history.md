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

## PR #52 Hygiene Fixes

**Date:** 2026-03-08  
**Context:** Code review hygiene issues flagged by @Copilot

### Issue 1: Workflow Permissions Scoped to Job Level

**Problem:** `.github/workflows/e2e.yml` had `pages: write` and `id-token: write` at workflow level (lines 9-12), but only the `deploy-report` job needs these permissions. The `e2e` and `discord-notify` jobs don't need them.

**Fix applied:**
- Kept `contents: read` at workflow level (all jobs need it)
- Moved `pages: write` and `id-token: write` to job-level permissions on `deploy-report` job only

**Rationale:** Principle of least privilege — each job should only have the minimum permissions it needs to operate. Reduces blast radius if a job is compromised.

### Issue 2: Documentation Accuracy — Branch Triggers

**Problem:** `.squad/decisions.md` lines 4764 and 4779 incorrectly stated E2E workflow triggers on `dev` branch, but actual workflow triggers on `uat` and `master`.

**Fix applied:**
- Line 4764: Changed "triggers on push/PR to `dev` branch" → "triggers on push/PR to `uat` and `master` branches"
- Line 4779: Changed "runs on every dev push" → "runs on every `uat` and `master` push"

**Rationale:** The user explicitly does NOT want E2E tests running on dev pushes to save cloud compute. Docs must accurately reflect this intentional design decision.

### Patterns Reinforced

- **Job-level permissions** — always scope permissions to the job that needs them, not workflow-level
- **Documentation accuracy** — decisions.md must reflect actual implementation, not aspirational/outdated state
- **Intentional compute optimization** — E2E tests are expensive; run them only on pre-production (uat) and production (master) branches


## 2026-03-08T15:55:37Z: E2E Workflow Permissions & Docs (PR #52 Review)

**Task:** Fix workflow permissions scope and decisions.md documentation mismatch  
**Status:** ✅ Completed  
**Files:** `.github/workflows/e2e.yml`, `.squad/decisions.md`

**Changes:**
- Scoped `pages:write` and `id-token:write` to `deploy-report` job only (least-privilege)
- Updated branch trigger documentation to reflect uat/master (not dev)
- Documented decision in decisions.md

**Key Pattern:** All GitHub Actions workflows should grant baseline `contents: read` at workflow level and add job-level `permissions:` blocks for jobs requiring elevated access.

**User Directive Captured:** E2E intentionally does NOT trigger on `dev` branch (cost optimization).

**Related:** Scribe merge of PR #52 review feedback batch (Pemulis + Steeply + Marathe).


---

## 2026-03-08: Lint Discipline Directive — Write Clean Code from the Start

**From:** saitcho (via Copilot)  
**Status:** BINDING — All agents must follow

Write lint-clean code from the start. No exceptions:
- **No `@typescript-eslint/no-explicit-any`** — Use proper types (`unknown`, interfaces, generics, or document exceptions)
- **No `@typescript-eslint/no-unused-vars`** — Don't import or declare unused things
- **Run linter before committing** — `npm run lint` is mandatory

Prevention (write clean first) > Cleanup (fix lint errors post-merge).

Valid exceptions (e.g., E2E browser-context code) require documented decision in decisions.md.

See: 2026-03-08: ESLint Override for E2E Browser Context Code

### 2025-01-20: E2E Workflow Simplification
- **Changed:** Simplified `.github/workflows/e2e.yml` to run only on push to uat/master branches, removed PR trigger
- **Removed:** `deploy-report` job that deployed Playwright reports to GitHub Pages (user feedback: Pages deployment not needed)
- **Kept:** Artifact upload in `e2e` job — reports still available as workflow artifacts for manual download
- **Updated:** `discord-notify` job now depends only on `e2e` job, removed all deploy-report references (DEPLOY_RESULT, PAGES_URL, Pages URL field logic)
- **Rationale:** Team prefers simpler workflow that doesn't auto-deploy reports to Pages; artifact download is sufficient for debugging
- **Validation:** YAML validated with Python yaml module before committing

### 2025-01-20: Direct Artifact Links in Discord Notifications
- **Task:** Added direct artifact download links to Discord notifications from E2E workflow
- **Changes made:**
  - Added `id: upload-report` to the `upload-artifact` step in the `e2e` job (line 36)
  - Exposed artifact ID as job-level output: `outputs.artifact-id: ${{ steps.upload-report.outputs.artifact-id }}`
  - Added `ARTIFACT_ID` env var to `discord-notify` job from job outputs
  - Replaced generic "📦 Artifact" link with "📊 Test Report" direct download link using format: `https://github.com/{REPOSITORY}/actions/runs/{RUN_ID}/artifacts/{ARTIFACT_ID}`
  - Added separate "🔗 Run" field linking to Actions run page for context
  - Removed dead PR event handling code (lines 74-78) since workflow now only triggers on push events
  - Removed unused env vars: `PR_NUMBER`, `PR_TITLE`, `EVENT_NAME`
- **Pattern:** GitHub Actions `upload-artifact@v4` exposes `artifact-id` output that can be used to construct direct download links
- **User benefit:** One-click artifact download from Discord without navigating through Actions UI
- **Commit:** e1cc5b6

### 2026-03-08: PR #57 Review Feedback — Date Placeholder & Configurable clientUrl
- **Task:** Address Copilot code review feedback on PR #57 (dev → uat)
- **Fix 1:** Replaced unexpanded `$(date)` shell expression in decision doc with actual ISO date `2026-03-08`
- **Fix 2:** Made `clientUrl` in `server/src/index.ts` configurable via `CLIENT_URL` env var, keeping `http://localhost:3000` as default for dev parity
- **Rationale:** Dev runs client on port 3000 (separate from server port 2567), so default stays as-is; production can override via env var
- **Validation:** `npx tsc --noEmit` passed clean
- **Commit:** 1d63354

---

## 2026-03-08: PR #57 Review Feedback — Date Placeholder & CLIENT_URL Configuration

**Task:** Address Copilot code review feedback on PR #57 (dev → uat)

**Fix 1: Decision Doc Date Placeholder**
- File: `.squad/decisions/inbox/marathe-server-log-client-url.md`
- Issue: Contained unexpanded shell expression `$(date)` instead of literal date
- Fixed: Replaced with actual ISO date `2026-03-08`
- Rationale: Decision docs are stored artifacts and must contain literal values, not expressions

**Fix 2: Configurable CLIENT_URL Environment Variable**
- File: `server/src/index.ts`
- Change: `clientUrl` in startup log now reads from `CLIENT_URL` env var
- Default: `http://localhost:3000` (preserves dev parity with client server port)
- Benefit: Production deployments can override via environment configuration
- Validation: `npx tsc --noEmit` passed, no type errors, backward compatible

**Commit:** 1d63354 on dev branch

**Decision documented:** In decisions.md as "Server Startup Log — Client URL Configuration"

---

## 2026-03-08: Discord Notifications for Deployment Workflows

**Task:** Add Discord notifications with changelog to UAT and production deployment workflows  
**Status:** ✅ Completed  
**Commit:** 984daef on dev branch

**Changes:**
- Added `discord-notify` job to `.github/workflows/deploy-uat.yml` (UAT environment)
- Added `discord-notify` job to `.github/workflows/deploy.yml` (production environment)
- Both jobs run with `if: always()` after deploy job completes (notify on success and failure)
- Jobs guarded with `if: ${{ env.DISCORD_WEBHOOK_URL != '' }}` for fork safety

**Notification Features:**
- Environment indicator: 🧪 UAT or 🎮 Production
- Deploy status: ✅ success (green 3066993) or ❌ failure (red 15158332)
- Changelog: Last 10 commits using `git log --pretty=format:'• %h %s (%an)'`
- Deployed URL: Azure Container App FQDN passed via job outputs
- Commit link: Short SHA with GitHub commit URL
- Actions run link: Direct link to workflow run for debugging

**Technical Implementation:**
- Pattern matches existing e2e.yml discord-notify (lines 73-153)
- Uses `jq` for safe JSON escaping of dynamic content (commit messages, URLs)
- Added job-level outputs to deploy job to pass FQDN to discord-notify job
- Changelog truncated to 1000 chars if too long (Discord embed field limit ~1024 chars)
- Uses `git clone --depth 50` in notification step for changelog generation
- Username: "Squad: Marathe" for Discord webhook attribution

**Patterns Established:**
- All deployment workflows should notify Discord on completion (success or failure)
- Changelogs provide valuable context about what changed in each deployment
- Job outputs pattern: Add `id:` to step, expose via `outputs:` at job level, consume in dependent job
- Always use `jq` for JSON construction in CI to avoid shell escaping issues

## 2026-03-08T23:42:16Z: Deployed URL as Markdown Link in Discord Notifications

**Task:** Fix #65 — Include deployed URL in Discord deploy notification  
**Status:** ✅ Completed  
**Branch:** `squad/65-deploy-url-discord-notify`  
**PR:** #66 (opened against dev)

### Changes

Reformatted deployed URL in Discord notifications as clickable markdown links:
- Pattern: `[🌐 Deployed to {ENV}]({FQDN})`
- Applied to both `.github/workflows/deploy-uat.yml` and `.github/workflows/deploy.yml`
- Both workflows already had discord-notify jobs from prior work (commit 984daef)

### Implementation

Modified the deployed URL field in the Discord embed to use markdown link syntax:
```
[🌐 Deployed to UAT](https://myapp-uat.azurecontainerapps.io)
[🌐 Deployed to Production](https://myapp.azurecontainerapps.io)
```

This enables one-click access to the deployed application directly from Discord without copy-pasting URLs.

### Coordination

Ralph (Work Monitor) simultaneously performed board hygiene on #65:
- Removed stale labels: squad:steeply, go:needs-research
- Created and applied go:in-progress label

### Next Steps

PR #66 pending review and merge into dev branch.

---
