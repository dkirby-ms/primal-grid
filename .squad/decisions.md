# Hal Outpost Design (already merged)

---

# Pemulis Resource Tuning (already merged)

---

## 2026-01-24: Outpost Upgrade System — Design Spec

**Author:** Hal  
**Issue:** #154  
**Date:** 2026-01-24  
**Status:** Design Complete, Ready for Implementation  

### Overview

Players can upgrade outposts by spending wood and stone. Upgraded outposts gain ranged attack capability that automatically targets and damages nearby enemies. This is a late-game defensive investment — expensive but powerful.

### Design Decisions

**1. Single-Tier Upgrade (v1)**
- Outposts have one upgrade level only — regular → upgraded
- Simplest implementation that delivers core value
- Can add tiers later if demand exists

**2. Upgrade Cost: 40W + 30S**
- Significant late-game investment (~4x farm cost)
- Strategic decision point, not spam-able

**3. Attack Range: 5 tiles (Manhattan distance)**
- Matches defender pawn detection radius
- Positions upgraded outposts as "automated defender"
- Enemies can still approach from blind spots

**4. Damage: 12 per attack**
- Lower than pawns (20–25 damage) — outposts are stationary
- Kills swarm in 2 hits, scouts in 2 hits, raiders in 4 hits
- Effective for defense without replacing mobile units

**5. Attack Interval: 8 ticks (2 seconds at 4 ticks/sec)**
- Consistent with TILE_ATTACK_COOLDOWN_TICKS
- Responsive but not machine-gun rate

**6. Target Priority: Closest enemy**
- Simplest algorithm — no state inspection
- Works well for area denial
- Predictable behavior for players

**7. Upgrade Trigger: Right-click owned outpost**
- Two-step flow: right-click → confirm modal
- Fits "interact with structure" pattern
- Keeps HUD clean

**8. Visual Distinction: 🗼 → 🏹**
- Clear signal that upgraded outpost has ranged attack
- Minimal rendering change: check `tile.upgraded` flag

### Constants

Add to `shared/src/constants.ts`:

```typescript
export const OUTPOST_UPGRADE = {
  COST_WOOD: 40,
  COST_STONE: 30,
  ATTACK_RANGE: 5,
  DAMAGE: 12,
  ATTACK_COOLDOWN_TICKS: 8,
} as const;
```

### Schema & Implementation

- **TileState:** Add `upgraded: boolean = false` field
- **Server Handler:** Validate ownership, upgrade status, resources; deduct cost; set flag
- **Combat Loop:** New `tickOutpostAttacks()` function that targets closest enemy within range
- **Client Rendering:** Update STRUCTURE_ICONS mapping; check `tile.upgraded` for icon selection
- **Client UI:** Right-click handler opens upgrade modal; confirm sends UPGRADE_OUTPOST message
- **Message Protocol:** Define UPGRADE_OUTPOST and UpgradeOutpostPayload

### Scope

**In Scope (v1):** Single-tier, fixed cost, ranged attack (5 tiles, 12 damage, 8 tick interval), closest-enemy targeting, icon change, right-click UI.

**Deferred (v2+):** Multi-tier upgrades, target priority options, attack visual effects, upgrade progress, sound, structure damage, upgrade other buildings, downgrade mechanics.

### Sign-off

This design delivers a simple, effective outpost upgrade system that adds strategic depth without feature creep. All implementation questions answered. Ready to ship.

— Hal

---

## 2026-03-12: Soft-Preference Anti-Clustering for All Pawn Types

**Author:** Pemulis  
**Date:** 2026-03-12  
**Status:** Implemented  

### Context

PR #134 added `getReservedTiles()` to prevent builders from targeting the same tile. Clustering persisted because:
1. Builders picked adjacent tiles (not just the same tile)
2. `moveToward()` let pawns stack on the same tile
3. Attackers all targeted the same enemy
4. Explorers converged on the same frontier

### Decision

All pawn anti-clustering uses **soft preferences**, never hard blocks:
- Target reservation: deprioritize (don't exclude) nearby targets when better options exist
- Movement: prefer unoccupied tiles but always fall back to any valid tile
- This prevents deadlocks in narrow corridors or small territories

### Implications

- Any new pawn type should follow this pattern: check `hasFriendlyPawnAt()` during movement, add target-spreading to selection logic
- `moveToward()` now has different behavior for pawns vs wildlife — wildlife takes first valid move, pawns try unoccupied first
- Performance: O(P) per pawn per movement candidate where P = same-owner pawns. Negligible for max ~13 pawns per player

---

## 2026-03-11T12:57:00Z: User Directive — No Autonomous Production Promotions

**Author:** Copilot  
**Date:** 2026-03-11  
**Source:** User request  

**Directive:** Never initiate PRs into uat or prod autonomously. Promotion PRs are human-initiated only.

**Reason:** Ensures human oversight on deployment decisions. Captured for team memory.

---

## 2026-03-09T23:43:26Z: Prod Default Branch & Squad File Policy

---

## 2026-03-10T12:14Z: Filter CI, Chore & Squad Commits from Changelogs

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-10  
**Status:** Accepted

**Directive Source:** User request  
> Filter `ci:`, `chore:`, and `squad:` prefixed commits from player-facing Discord changelogs. Only feat/fix and other meaningful commits should appear.

**Decision:**

All `git log` commands in deployment/promotion workflows now exclude `ci:`, `chore:`, and `squad:` prefixed commits from Discord changelogs.
## 2026-03-10T18:23:36Z: Window Event Mocks Must Capture Callbacks

**Author:** Steeply (Tester)  
**Date:** 2026-03-10  
**Context:** PR #103 review revealed that `window.addEventListener` was mocked as a no-op `vi.fn()`, silently hiding the entire `pageUnloading` code path from test coverage.

**Decision:** In client-side tests that import modules registering `window.addEventListener` callbacks at module load time, the mock must capture callbacks by event name so they can be invoked in tests. A no-op mock is not acceptable — it creates invisible coverage gaps.

**Pattern:**
```typescript
const windowEventCallbacks: Record<string, Array<(...args: unknown[]) => void>> = {};
vi.stubGlobal('window', {
  addEventListener: vi.fn((event: string, cb) => {
    if (!windowEventCallbacks[event]) windowEventCallbacks[event] = [];
    windowEventCallbacks[event].push(cb);
  }),
  // ...
});
```

Reset `windowEventCallbacks` in `beforeEach` to avoid cross-test leakage.

---

## 2026-03-10T18:23:36Z: PR #103 Rejected — pageUnloading One-Way Flag Bug

**Author:** Hal (Lead)  
**Date:** 2026-03-10  
**Status:** Pending remediation  
**PR:** #103  
**Issue:** #101

### Context

PR #103 introduced a `pageUnloading` flag to distinguish browser refresh (preserve reconnect token) from genuine disconnects (clear token). The `onLeave` condition `consented || !pageUnloading` is logically correct, but the flag is never reset after being set to `true`.

### Problems Found

1. **One-way flag:** `pageUnloading = true` in `beforeunload` is never reset. If navigation is cancelled (e.g., by a future `beforeunload` prompt), all subsequent non-consented disconnects silently skip token clearing and `'disconnected'` emission, stranding the user.
2. **Zero test coverage:** Mock `window.addEventListener` is a no-op `vi.fn()`, preventing the `beforeunload` handler from registering. The central mechanism of the fix is untested.

### Required Fixes

1. Add `window.addEventListener('pageshow', () => { pageUnloading = false; })` to reset the flag after cancelled navigation or BFCache restore.
2. Add tests that set `pageUnloading = true` before firing `onLeave` and verify token preservation.
3. Add test that verifies `pageshow` resets the flag.

### Ownership

- **pageUnloading reset fix:** New implementer (Pemulis and Gately locked out per reviewer protocol)
- **Test coverage:** Steeply (Tester)

### Impact

Anyone working on `client/src/network.ts` reconnection logic must understand that `pageUnloading` guards the token lifecycle during browser refresh. Tests must exercise this path.

---

## 2026-03-10T18:23:36Z: Reconnect Handler Registration Gap

**Author:** Hal (Lead)  
**Date:** 2026-03-10  
**Context:** PR #103 / Issue #101 — Browser refresh drops user session  
**Status:** Implemented with Combined Fix (Option C)

### Problem

After browser refresh, the reconnect succeeds at the transport level (server logs confirm "Client dropped" → "Client reconnected"), but the browser console shows:

```
@colyseus/sdk: onMessage() not registered for type 'game_log'
```

The user reports the session appears dropped despite successful reconnection.

### Root Cause Analysis

There is a race condition between the Colyseus SDK completing the reconnect and the client registering `onMessage` handlers.

**Bootstrap reconnect flow (`main.ts:72-78`):**

1. `loadReconnectToken()` — finds saved token ✅
2. `reconnectGameRoom()` → `client.reconnect(token)` — transport reconnects
3. **Server `onReconnect()` fires** → immediately sends `client.send("game_log", { message: "Reconnected!" })` (`GameRoom.ts:228`)
4. **SDK receives `game_log` message** → no handler registered → **warning logged** ⚠️
5. `client.reconnect()` Promise resolves → returns Room object
6. `attachGameRoomHandlers(room)` runs → registers `onDrop`, `onReconnect`, `onLeave`, `onError` — **but NOT `onMessage`**
7. `reconnectGameRoom()` returns room to `main.ts`
8. `setupGameSession()` → `bindGameRoom(room)` → **`onMessage('game_log', ...)` finally registered** (too late)

The console output confirms this timing — the SDK warning appears *between* the "Reconnection attempt 1/5" log (step 2) and the "Reconnected to game room" log (step 5):

```
network.ts:210 [network] Reconnection attempt 1/5…
@colyseus/sdk: onMessage() not registered for type 'game_log'.    ← during client.reconnect()
network.ts:212 [network] Reconnected to game room: iAwP_PDDM     ← after promise resolves
```

This proves the `game_log` message arrives *during* the `client.reconnect()` call, before the Promise resolves — so even registering handlers immediately after `client.reconnect()` resolves would still be too late.

### What Gets Sent During `onReconnect` (Server-Side)

`GameRoom.ts:223-234`:
- `this.initPlayerView(client, player, devMode)` — restores fog-of-war visibility
- `client.send("game_log", { message: "Reconnected!" })` — direct to client
- `this.broadcast("game_log", { message: "X reconnected" })` — to all other clients

All three happen synchronously in `onReconnect`, which fires as part of the reconnect handshake — before the client SDK resolves its `client.reconnect()` Promise.

### Impact Assessment

**What's lost:** The "Reconnected!" toast in the game log. This is cosmetic — the actual game state (player position, resources, territory, creatures) is synchronized via Colyseus Schema, which works independently of `onMessage`.

**Why "session appears dropped":** Two possible explanations:

1. **Console noise misleads the user.** The SDK warning suggests something is broken, even though the session is functional.
2. **Camera centering may be delayed.** `bindGameRoom()` uses `r.onStateChange.once(...)` to center the camera on the player's HQ (`main.ts:166-170`). After a bootstrap reconnect, the full state may have already been synced during `client.reconnect()`. The `.once()` handler would fire on the *next* game tick rather than immediately — a brief moment where the player sees the wrong viewport, creating the impression of a dropped session.

### Secondary Issue: Duplicate Handlers on In-Session Reconnect

During in-session reconnects (network drops), `bindGameRoom()` is called again on the *same* Room object via the `onConnectionStatus('connected')` callback (`main.ts:216-222`). Colyseus `onMessage` is additive — each call adds another listener. After N reconnects, there are N duplicate `game_log` handlers, causing duplicate log entries. This doesn't cause the reported bug but is a code quality issue.

### Fix Implemented (Option C: Combined Fix)

1. **Server:** Defer `game_log` in `GameRoom.onReconnect()` by one tick — eliminates the primary race.
2. **Client:** In `bindGameRoom()`, replace `r.onStateChange.once(...)` with an immediate check: if the player's state already exists, center the camera immediately instead of waiting for the next state change.
3. **Client:** Clean up duplicate handler registration — `bindGameRoom()` should remove previous `onMessage` listeners before adding new ones (or use a flag to skip re-registration on the same Room).

**Files changed:**
- `server/src/rooms/GameRoom.ts` — defer `game_log` in `onReconnect` (1 change)
- `client/src/main.ts` — fix `onStateChange.once` to handle pre-synced state; deduplicate handlers (2 changes)

### Results

- No `onMessage() not registered` warning in console after browser refresh reconnect ✅
- Camera centers on player HQ immediately after reconnect ✅
- No duplicate `game_log` entries after in-session reconnects ✅
- All 692 tests pass ✅
- 2 regression tests added by Steeply confirm `onLeave` behavior ✅

---

## 2026-03-10T16:34:04Z: Single-Layer Reconnection Strategy (Issue #101)

**Author:** Gately (Game Dev)  
**Date:** 2026-03-10  
**Status:** Implemented  
**PR:** #103

### Context

The Colyseus SDK 0.17 has built-in auto-reconnection (15 retries, exponential backoff) via `onDrop`/`onReconnect` handlers. Our custom `onLeave` handler was also calling `reconnectGameRoom()`, creating an infinite drop→reconnect→drop loop after browser refresh.

### Decision

1. **SDK handles in-session transient disconnects.** The `onDrop`/`onReconnect` callbacks update UI status. `onLeave` means the session is truly over — clear the reconnect token and return to lobby.
2. **`reconnectGameRoom()` is bootstrap-only.** It's called once on page load when a sessionStorage token exists, creating a fresh connection from scratch. It is never called from `onLeave`.
3. **Reset client singleton after failed bootstrap reconnect.** `resetClient()` clears `colyseusClient` before falling through to lobby to avoid stale WebSocket state.

### Impact

- No duplicate reconnection attempts — eliminates the infinite loop
- Cleaner separation: SDK owns transport-level reconnection, our code owns application-level session recovery (bootstrap)
- `onLeave` with non-consented codes now clears the token and emits `'disconnected'`, which triggers the lobby return flow in `main.ts`
- All 692 tests pass; 2 regression tests added by Steeply confirm `onLeave` behavior

---

## 2026-03-10T15:16:56Z: User Directive — PR Review Comments Visibility

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-10  
**Status:** Active

### Directive

After any code review, **Hal must post the review feedback as a comment on the PR** (using `gh pr comment`). Reviews should not only happen internally — they must be visible on the PR itself.

### Rationale

Transparency with the team and stakeholders. All review feedback is recorded on the PR where the work lives, making decision-making visible and reviewable.

---

## 2026-03-10T11:42:00Z: Discord Webhook Identity Handoff — Marathe → Joelle

**Author:** Hal (Lead)  
**Date:** 2026-03-10  
**Status:** Accepted

**Context:**

Joelle joined the team as Community/DevRel specialist and owns Discord deployment notifications — tone, formatting, and community voice. However, three GitHub Actions workflows still hardcoded `"username": "Squad: Marathe"` in Discord webhook payloads:

1. `.github/workflows/deploy.yml` (line 169) — production deployments
2. `.github/workflows/deploy-uat.yml` (line 169) — UAT deployments
3. `.github/workflows/e2e.yml` (line 95) — E2E test results

This meant Joelle's first community announcement shipped as Marathe instead of her own identity.

**Root Cause:**

When Joelle was added, the deploy workflows were not updated to reflect the ownership transfer. The changelog mechanics (commit fetching, sorting, filtering) remain Marathe's domain as CI/CD infrastructure, but the **Discord identity** is Joelle's.

**Decision:**

### Change webhook username from "Squad: Marathe" to "Squad: Joelle" in:
- `deploy.yml` line 169
- `deploy-uat.yml` line 169
- `e2e.yml` line 95

### Ownership split:
- **Joelle owns:** Discord identity, message tone, changelog formatting/curation, what goes in the message
- **Marathe owns:** CI/CD mechanics (workflow structure, changelog generation scripts, build/deploy logic)

### Rationale:
1. **Charter alignment:** Joelle's charter explicitly lists "Discord deployment notifications" as owned by her
2. **Community voice:** Deployment announcements are player-facing communications — Joelle's domain
3. **Clear boundary:** The infrastructure (workflow YAML, bash scripts) stays with Marathe; the community identity and voice belongs to Joelle
4. **Consistency:** All deployment/test notifications come from the same community voice

### Future Pattern:
If new Discord notifications are added:
- Workflow mechanics → Marathe (or relevant CI/CD owner)
- Discord identity/message content → Joelle
- Joelle may request changes to Marathe's changelog scripts if the format doesn't serve community needs

### Implementation:
Update all three workflows to use `"username": "Squad: Joelle"`. No other changes needed — the changelog generation logic, embed structure, and webhook mechanics remain Marathe's work.

---

## 2026-03-10T01:49:40Z: Changelog Sorting & Merge Commit Exclusion

**Author:** Marathe (DevOps / CI-CD)  
**Date:** 2026-03-10  
**Status:** Accepted

**Directive Source:** User request by dkirby-ms (2026-03-10T01:49:40Z)
> Discord notification changelogs should always sort with features/bugfix commits first, chores or non-gameplay related things after. Merge commits should not be included in the changelog at all.

**Decision:**

1. **Exclude merge commits** — all `git log` commands in deployment/promotion workflows now use `--no-merges`.
2. **Sort by significance** — `feat` and `fix` prefixed commits appear first, followed by everything else (`chore`, `refactor`, `ci`, `docs`, `squad`, etc.).
3. **Pure bash** — sorting uses `grep -iE` to partition lines, no external dependencies.

**Affected Workflows:**

- `deploy-uat.yml` (Discord changelog)
- `deploy.yml` (Discord changelog)
- `squad-promote.yml` (PR body changelog, both dev→uat and uat→prod)

**Implementation Pattern:**

```bash
RAW_LOG=$(git log --no-merges --pretty=format:'• %h %s (%an)' ... | head -N)
FEATURES=$(echo "$RAW_LOG" | grep -iE '^• [a-f0-9]+ (feat|fix)' || true)
OTHER=$(echo "$RAW_LOG" | grep -viE '^• [a-f0-9]+ (feat|fix|ci:|chore:|squad:)' || true)
CHANGELOG=$(printf '%s\n%s' "$FEATURES" "$OTHER" | sed '/^$/d' | head -N)
```

**Rationale:** CI housekeeping and version bumps aren't player-relevant. Only feat/fix and other meaningful commits should appear in player-facing notifications.

---

## 2026-03-10T01:40:18Z: Issue Lifecycle & Promotion Pipeline Labels

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-10  
**Status:** Accepted

**Directive Source:** User request  
> Issues should stay open until the fix reaches prod. When a fix merges to dev, label the issue to indicate it's ready for UAT testing. Remove stale workflow labels (e.g., `go:needs-research`) at that point.

**Decision:**

1. Issues remain open throughout the promotion pipeline (dev → UAT → prod).
2. When a fix merges to dev, apply a label indicating readiness for UAT testing.
3. Remove stale/intermediate workflow labels (`go:needs-research`, etc.) at promotion milestones.
4. Close the issue only after the fix reaches prod.

**Rationale:** Provides visibility into promotion pipeline status without prematurely closing issues. User request — captured for team memory.

---

## 2026-03-10: Discord Webhook Identity Handoff: Marathe → Joelle

**Author:** Hal (Lead)  
**Date:** 2026-03-10  
**Status:** Recommendation

### Context

Joelle joined the team as Community/DevRel specialist (`.squad/agents/joelle/charter.md`) and owns Discord deployment notifications — tone, formatting, and community voice. However, three GitHub Actions workflows still hardcode `"username": "Squad: Marathe"` in Discord webhook payloads:

1. `.github/workflows/deploy.yml` (line 169) — production deployments
2. `.github/workflows/deploy-uat.yml` (line 169) — UAT deployments
3. `.github/workflows/e2e.yml` (line 95) — E2E test results

This means Joelle's first community announcement shipped as Marathe instead of her own identity — the onboarding issue dkirby-ms noted.

### Decision

**Change webhook username from "Squad: Marathe" to "Squad: Joelle"** in:
- `deploy.yml` line 169
- `deploy-uat.yml` line 169
- `e2e.yml` line 95

**Ownership split:**
- **Joelle owns:** Discord identity, message tone, changelog formatting/curation, what goes in the message
- **Marathe owns:** CI/CD mechanics (workflow structure, changelog generation scripts, build/deploy logic)

**Rationale:**
1. Charter alignment: Joelle's charter explicitly lists "Discord deployment notifications" as owned by her
2. Community voice: Deployment announcements are player-facing communications — Joelle's domain
3. Clear boundary: The infrastructure (workflow YAML, bash scripts) stays with Marathe; the community identity and voice belongs to Joelle
4. Consistency: All deployment/test notifications should come from the same community voice

### Future Pattern

If new Discord notifications are added:
- Workflow mechanics → Marathe (or relevant CI/CD owner)
- Discord identity/message content → Joelle
- Joelle may request changes to Marathe's changelog scripts if the format doesn't serve community needs

### Related Files
- `.squad/agents/joelle/charter.md` — Joelle's ownership of Discord notifications
- `.squad/agents/marathe/charter.md` — Marathe's CI/CD infrastructure domain
- `.github/workflows/deploy.yml`
- `.github/workflows/deploy-uat.yml`
- `.github/workflows/e2e.yml`
OTHER=$(echo "$RAW_LOG" | grep -viE '^• [a-f0-9]+ (feat|fix)' || true)
CHANGELOG=$(printf '%s\n%s' "$FEATURES" "$OTHER" | sed '/^$/d' | head -N)
```

**Rationale:**

Features and bugfixes are what stakeholders care about most. Putting them first surfaces the signal. Excluding merge commits removes noise from fast-forward and squash-merge workflows.

---

## 2026-03-10T00:42Z: Production Launch — v0.1.0

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-10  
**Status:** LIVE  

**Decision:** Primal Grid v0.1.0 is live on prod. First production deployment.

**Rationale:** Milestone marker — the team has a live baseline to iterate on.

---

## 2026-03-09T23:43:26Z: Prod Default Branch & Squad File Policy

**Author:** Pemulis (Systems Dev)  
**Date:** 2026-03-09  
**Status:** IMPLEMENTED  
**Commit:** 356fcf9 — "ci: simplify uat-to-prod promotion to direct PR"

**Decision:** 
1. Default branch is **`prod`** (not `master` as previously assumed)
2. **`.squad/` files are allowed in prod** — no stripping required during promotion workflows

**Rationale:**
- User confirmed `.squad/` metadata should persist through all branch tiers for complete audit trail and decision history
- Simplified workflow: direct PR from `uat` → `prod` now mirrors `dev` → `uat` pattern (consistent architecture)
- No staging branches or file stripping needed — proper permissions are configured

**Impact:**
- Promotion workflow simplified: −42 lines, +11 lines
- UAT→prod pipeline now follows uniform pattern with dev→uat
- Squad history and decisions fully traceable through prod branch

---

## 2026-03-09: Automatic Patch Version Bump on UAT Promotion

**Author:** Pemulis (Systems Dev)  
**Date:** 2026-03-09  
**Status:** IMPLEMENTED  
**Commit:** 3de1bdc — "feat(ci): auto-bump patch version on dev-to-uat promotion"

**Decision:** Each dev → UAT promotion automatically bumps the patch version in `package.json` using `npm version patch --no-git-tag-version`. The bump commit is pushed to `dev` before the promotion PR is created, so the PR title reflects the new version.

**Rationale:**
- **Traceability:** Every UAT release has a unique version number. No more guessing which build is deployed.
- **Simplicity:** `npm version patch` is a one-liner that handles JSON editing cleanly. No custom scripts, no jq gymnastics.
- **Manual override preserved:** Minor and major bumps are still manual — just run `npm version minor` or `npm version major` on `dev` before the next promotion.

**Impact:**
- **Workflow permissions:** `contents: write` is now required at the workflow level (was `contents: read`). This affects both jobs in `squad-promote.yml`, but `uat-to-prod` already needed write for pushing staging branches.
- **Commit noise:** One extra `chore: bump version` commit per promotion. Acceptable trade-off for automated versioning.
- **package-lock.json:** Also updated by `npm version` and included in the bump commit.

**DevOps Note:** Pattern aligns with versioning baseline established 2026-03-09. All promotion workflows now use soft fallback (git SHA) if version missing; release workflows use hard fail. Consistent across CI/CD.

---

## 2026-03-08: Copilot Coding Agent Instructions Document

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-08  
**Status:** IMPLEMENTED  
**Files:** `.github/copilot-instructions.md`

**What:** Created comprehensive guidance document for GitHub Copilot coding agent when autonomous on issues. Covers:
- Project architecture (client/server/shared monorepo)
- Build system + shared/ incremental build gotcha (tsconfig.tsbuildinfo deletion)
- Colyseus schema patterns & state management
- All game systems (creature AI FSM, stamina, territory, resources, map gen, builders)
- Testing patterns (mock room creation, tick helpers)
- Coding conventions (strict TS, underscore prefix, no `any`)
- Explicit "do not" list (no Fiber/Berries, don't remove shapeHP, per-creature timers, etc.)

**Why:** Copilot agent works autonomously. Without context, it lacks critical knowledge about build gotchas, design decisions, patterns that caused bugs before. Document prevents regressions.

**Impact:** Documentation-only. 287 tests pass. Enables confident autonomous agent work.

---

## 2026-03-05: Biome Contiguity via Noise Tuning + Cellular Automata

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-05  
**Status:** IMPLEMENTED  
**Commit:** feat(mapgen): smoother biome regions via noise tuning + cellular automata

**Context:** Biomes appeared pixelated — many isolated single-tile patches, noisy transitions. Root cause: noise parameters generated too much high-frequency detail; no post-processing smoothing.

**Decision:**

1. **Noise Parameter Tuning** (`shared/src/constants.ts`):
   - `ELEVATION_SCALE`: 0.08 → 0.045 (larger elevation zones)
   - `MOISTURE_SCALE`: 0.06 → 0.035 (larger moisture zones)
   - `ELEVATION_OCTAVES`: 4 → 3 (less fine detail)
   - `MOISTURE_OCTAVES`: 3 → 2 (less fine detail)

2. **Cellular Automata Smoothing** (`server/src/rooms/mapGenerator.ts`):
   - `smoothBiomes()` function, called post-generation
   - 2 passes, Moore neighborhood (8 neighbors), majority threshold 5
   - Water and Rock protected (never flipped) — gameplay barriers
   - Fertility and resources recalculated for changed tiles

**Alternatives Considered:**
- Gaussian blur on noise pre-biome assignment: Would smooth elevation/moisture but not directly address biome boundary noise from aliasing. Extra buffer pass needed.
- Larger scale values only: Reduces high-freq noise but doesn't eliminate isolated patches at biome boundaries.
- Voronoi-based biome assignment: More natural regions but requires rewriting entire biome system. Overkill.

**Consequences:**
- Biome regions visibly larger, more contiguous
- 287 existing tests pass unchanged — smoothing is deterministic, seeded
- Slight increase in map generation time (2 extra O(W×H) passes) — negligible on 64×64
- New biome types auto-participate in smoothing unless explicitly protected

**Impact:** Maps are more visually cohesive. Biomes feel like connected ecosystems vs. scattered noise.

---

## 2026-03-06T14:40Z: User Directive — Single Persistent UAT with Manual Deployment

**By:** dkirby-ms (via Copilot)  
**Status:** DECISION — User-confirmed UAT architecture  

**What:** 
- Single persistent UAT Container App (always exists, like prod)
- No per-PR containers or ephemeral infra
- Manual deployment: code pushed to UAT only when public testing is needed
- Feature branch testing happens locally via `npm run dev`

**Why:** User request — simplifies infra, reduces cost, keeps explicit control over what gets publicly tested. Per-PR containers add complexity and ongoing cleanup burden.

---

## 2026-03-06T14:42Z: User Directive — Protected Branch Gating for UAT Deployment

**By:** dkirby-ms (via Copilot)  
**Status:** DECISION — User-confirmed deployment gate  

**What:**
- Dedicated pre-prod branch (e.g., `uat` or `pre-prod`) with branch protections enabled
- Can only be merged into via PR, not direct push
- UAT deployment triggers on merge to this branch
- Mirrors master→prod pattern for consistency

**Why:** User request — adds a governance gate before code hits UAT. PR requirement ensures code review and CI checks pass. Mirrors prod deployment model (protected master branch → auto-deploy on merge).

---

## 2026-03-06T15:05: UAT Deployment Plan — Protected Branch + Auto-Deploy Implementation

**By:** Hal (Lead) + Pemulis (Systems Dev)  
**Status:** ACCEPTED  

**Architecture:**
- Shared ACR + Container Apps Environment (prod and UAT coexist)
- UAT Container App: `primal-grid-uat`, scale-to-zero (minReplicas: 0, maxReplicas: 3)
- Prod Container App: `primal-grid`, always-on (minReplicas: 1)
- Same log analytics workspace (shared)

**Implementation:**
1. **Bicep changes:** infra/main.bicep parameterized with `environment` param; new infra/main-uat.bicepparam
2. **Workflow:** .github/workflows/deploy-uat.yml with push trigger (primary) + workflow_dispatch (fallback)
3. **Branch protection:** `uat` branch requires PR, CI checks pass before merge
4. **Deployment flow:** feature/* → PR to uat → merge → auto-deploy to UAT → PR to master → merge → auto-deploy to prod

**Cost:** +~$1-2/month for UAT (scale-to-zero acceptable; cold starts ~10-20s)

**Success criteria:** UAT deployable via PR merge, scales to zero, manual fallback available for emergency overrides.

**Next steps:** One-time Azure deployment (az deployment group create), branch creation, protection rules, test PR.


---

## 2026-03-07T14:00Z: UAT Branch Auto-Reset Workflow

**By:** Pemulis (Systems Dev)  
**Date:** 2025-01-21  
**Status:** Implemented

**Context:** After UAT code is promoted to master (via merge), the UAT branch can diverge if we continue pushing experimental code. Need automated sync.

**Decision:** Created `.github/workflows/reset-uat.yml` that:
1. Triggers on any push to master (keeps UAT in sync always)
2. Supports manual runs via `workflow_dispatch`
3. Uses `--force-with-lease` for safety (prevents overwriting concurrent UAT changes)
4. Configures git user as github-actions bot

**Workflow Sequence:**
1. Code merged from UAT to master (via PR)
2. Push to master triggers: `deploy.yml` (prod) + `reset-uat.yml` (reset UAT branch)
3. Push to UAT (from reset) triggers: `deploy-uat.yml` (redeploy UAT)

**Rationale:** Automation prevents manual reset mistakes. `--force-with-lease` is safer than `--force` — fails if someone else pushed to uat, alerting maintainers.

**Risk Mitigation:** Small window for concurrent pushes; `--force-with-lease` detects and fails. GitHub Actions notifications alert on workflow failure. Manual override via `workflow_dispatch` available.


---

## 2026-03-11: Player Display Names & Scoreboard (Issue #9)

### Decision 1: Player Display Name Schema & Message Protocol (Pemulis)

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-11  
**Issue:** #9  
**Status:** IMPLEMENTED  

**What:**
- `PlayerState.displayName` is a `@type("string")` Colyseus schema field, default `""`. Synced to all clients automatically.
- `SET_NAME` message (`"set_name"`) with `SetNamePayload { name: string }` is the client→server protocol for setting names.
- Server validates: trims whitespace, caps at 20 characters, rejects empty strings.
- Server broadcasts `game_log` with `"{name} has joined"` on successful name set.

**Why:**
- Schema field (not a side-channel) so scoreboard/nameplate rendering on any client can read `player.displayName` directly from synced state.
- 20-char limit prevents layout-breaking names in UI. Trim + empty-check prevents blank names.
- Broadcast on name-set gives all players feedback when someone identifies themselves.

**Impact:**
- Client team needs to: (1) send `SET_NAME` message after joining, (2) read `player.displayName` from schema for scoreboard/nameplates.
- Any future rename feature reuses the same message — handler is idempotent.

---

### Decision 2: Scoreboard UI Pattern (Gately)

**Date:** 2026-03-11  
**Author:** Gately (Game Dev)  
**Status:** IMPLEMENTED  

**What:**
Client-side player display names + scoreboard overlay for Issue #9.

**Components Added:**
1. **Name prompt modal** — DOM overlay after connect, sends `SET_NAME` to server
2. **HQ name labels** — PixiJS Text under each player's HQ marker (all players visible)
3. **Scoreboard overlay** — Tab key toggle, DOM table showing Name/Score/Territory
4. **`SET_NAME` message constant** — Added to `shared/src/messages.ts`

**Design Choices:**
- **Scoreboard is DOM-based** (not PixiJS) — follows HudDOM pattern, easier to style, no canvas z-ordering issues
- **Territory count computed client-side** by iterating tiles where `ownerID === player.id` — no new server field needed
- **Scoreboard skips refresh when hidden** — only iterates state on `onStateChange` when panel is visible
- **Name label uses stroke outline** (`stroke: { color: '#000000', width: 3 }`) for readability against any biome

**Server Dependency:**
- Server handles `SET_NAME` message and sets `displayName` on `PlayerState` schema
- `SET_NAME` and `SetNamePayload` exported from shared — server imports directly

**Files Changed:**
- `shared/src/messages.ts` — `SET_NAME` constant + `SetNamePayload` interface
- `server/src/rooms/GameState.ts` — `displayName` field on `PlayerState`
- `server/src/rooms/GameRoom.ts` — `SET_NAME` message handler
- `shared/src/types.ts` — Type definitions
- `client/index.html` — Name prompt modal + scoreboard overlay HTML/CSS
- `client/src/main.ts` — Name prompt flow, scoreboard wiring
- `client/src/ui/HudDOM.ts` — Scoreboard component
- `client/src/input/InputHandler.ts` — Tab key handler + `setScoreboard()`
- `client/src/renderer/GridRenderer.ts` — HQ name labels
- `server/src/__tests__/player-names.test.ts` — Integration tests (15 tests, all pass)

---

## 2026-03-07T01:03:00Z: User Directive — Camera Restriction to Explored Areas

**By:** dkirby-ms (via Copilot)  
**What:** Camera should be restricted to explored areas. Before a player has discovered an area of the map, it shouldn't be possible to scroll over to it (it would just be a black screen anyway). Camera bounds must update as the player's explored area expands.  
**Why:** User request — captured for team memory. Affects both fog of war rendering and InputHandler/Camera system.

---


## 2026-03-07T01:14:00Z: User Directive — Watchtower Destruction & Shared Alliance Vision

**By:** dkirby-ms (via Copilot)  
**Status:** DECISION — User-confirmed future feature flags  

**What:**
1. **Destructible Watchtowers:** Watchtowers are a structure that can be destroyed in future versions. Not part of MVP fog of war, but design must accommodate graceful vision loss when watchtower is removed.
2. **Shared Team Vision (Alliances):** Allied players share visibility when alliance system is implemented. Each player sees all tiles visible to any ally.

**Why:** User decisions on Hal's fog of war open questions (#1 and #3). Establish future compatibility constraints.

**Impact:**
- Watchtower destruction: Natural fallout of tickVisibility() — when structure is deleted, its 8-tile radius drops from visibility on next tick. Client's ExploredTileCache preserves terrain data. No special logic needed.
- Alliance vision: Requires `tickVisibility()` to union allied player visibility sets and call `view.add()` for ally tiles. Multiplies StateView mutations by alliance size. Benchmarking required before 8-player testing.

---

## 2026-03-07T01:14:30Z: User Directive — Explored Tiles Show Structure Silhouettes

**By:** dkirby-ms (via Copilot)  
**Status:** DECISION — User-confirmed UI detail  

**What:** Explored tiles (fog state) should show structure silhouettes — a faded/greyed building outline so the player knows "something was built there" without revealing current owner or live state.

**Why:** User decision on Hal's fog of war open question #4. Adds atmospheric detail to explored tiles beyond bare terrain.

**Implementation:**
- Client-side only. ExploredTileCache must cache `structureType` alongside terrain data (type, x, y, fertility, moisture).
- FogManager renders dimmed structure icon when tile is in explored state.
- Shows last-known structure (not current server state) — correct fog of war semantics.
- No server changes beyond StateView filtering.

**Interpretation:** "Show structures that were visible when the tile was last seen" (achievable client-side). NOT "always show current structures" (would require server-side explored state tracking, contradicts no-new-APIs design).

---

## 2026-03-07: Review — Fog of War Game Mechanics Design (Hal)

**Reviewer:** Steeply (Tester)  
**Date:** 2026-03-07  
**Verdict:** APPROVE WITH NOTES  
**Full Review:** .squad/decisions/inbox/steeply-fog-review.md (290 lines)

**Executive Summary:**
Hal's fog of war game mechanics design is well-structured and fully testable with existing infrastructure. No architectural blockers. Edge case coverage planned (40 test cases, 4 phases). Performance estimate revised: 4-8ms typical (not 12ms), with potential 15-20ms spike on day/night phase transitions.

**Edge Cases Identified:** 14 high/medium items
- E1: Map edge visibility clamping
- E3: Creature death visibility loss (1-tick delay acceptable)
- E5: Player disconnect cleanup (onLeave must delete playerViews + visibleTiles)
- E6: Minimum radius floor at night (per-source application verified)
- E11: ExploredTileCache consistency (cache on onAdd, not onRemove)
- E14: Tile access pattern breaking change (index-based → coordinate-based)

**Required Before Implementation:**
1. onLeave cleanup specification (E5)
2. Tick ordering verification: tickVisibility() MUST be last (I1)
3. Full regression test on 331 existing tests after @view() decorators (T1)
4. Player displayName constant clamping (currently undefined)

**Test Plan:** 40 test cases
- Phase 1 (Schema + StateView): 8 tests
- Phase 2 (Visibility Engine): 22 tests
- Phase 3 (Client Logic): 6 tests
- Phase 4 (Integration): 4 tests

**Recommended Optimizations:**
- Tick ordering comment in GameRoom.ts
- Day/night transition stagger (2 ticks) to avoid CPU spike
- Camera center-lock when viewport > explored area
- Performance benchmark test (T40) for baseline

**Reviewer Confidence:** "Zero trust in happy paths." All edge cases identified and testable.

---

## 2026-03-07: Review — Fog of War Systems Integration (Pemulis)

**Reviewer:** Pemulis (Systems Dev)  
**Date:** 2026-03-07  
**Verdict:** APPROVE WITH NOTES  
**Full Review:** .squad/decisions/inbox/pemulis-fog-review.md (275 lines)

**Executive Summary:**
Both Hal's game mechanics and Gately's client rendering designs are architecturally sound and compatible with existing simulation. StateView mechanism correctly applied. Creature AI, territory, builder systems are unaffected. All risks are implementation refinements, not blockers.

**Critical Findings:**

1. **@view() Decorator Simplification:** Skip field-level @view() decorators in Phase 1. Element-level `view.add/remove` is sufficient for two-tier visibility. Only add decorators if three-tier filtering (visible/explored/hidden with numeric tags) becomes necessary.

2. **Owned-Tile Cache → Phase 2:** Performance analysis shows full 16K tile scan per player per tick is unacceptable (131K iterations for 8 players). With owned-tile cache: ~5,600 iterations/tick. **Required from Phase 2 onward.** Trivial to implement: `Map<sessionId, Set<number>>` updated in tickClaiming(), spawnHQ(), builder build-complete.

3. **Tile Access Pattern Breaking Change:** With StateView filtering active, `state.tiles.at(y * mapWidth + x)` returns wrong tile. GridRenderer already uses per-tile `x`/`y` fields (safe). Must audit and migrate CreatureRenderer, InputHandler for index-based accesses.

4. **Watchtower Constants Required:** Add to shared/src/constants.ts:
   - COST_WOOD: 15, COST_STONE: 10
   - BUILD_TIME_TICKS: 24
   - VISION_RADIUS: 8
   - MAX_PER_PLAYER: 3

**Performance Assessment:**
- Typical visibility tick: 4-8ms (8 players, late game)
- Day/night transition spike: 15-20ms (all players' radii change simultaneously)
- Memory: ~1 MB (8 players' visibility sets) — negligible
- Tick budget: 250ms at 4 Hz — safe

**Integration Safety:**
- Creature AI unaffected (operates on full server state)
- Builder pathfinding unaffected (uses server-authoritative data)
- Territory barriers unaffected (wildlife still blocked)
- Tick ordering safe if visibility runs last (code comment recommended)

**Must-Fix Before Implementation:**
1. Skip @view() field decorators (simplification)
2. Merge owned-tile cache into Phase 2
3. Add WATCHTOWER constants
4. Add minimum camera bounds padding (5×5 explored area bad UX at low zoom)

**Should-Fix:**
5. Watchtower max-per-player validation
6. Document "explored shows last-known structures" semantics
7. Consider batch fog overlay rendering (single Graphics vs. per-tile)

**User Decision Compatibility:**
- **Destructible Watchtowers:** Automatically handled by tickVisibility() — no special logic needed
- **Alliance Shared Vision:** Requires multiplying view.add() calls by alliance size. Benchmarking needed before 8-player test.
- **Structure Silhouettes:** Client-side caching of structureType. Shows last-known structures. No server changes.

**Reviewer Confidence:** "Architecturally sound. Creature AI, territory, builder systems verified as unaffected."


## 2026-03-07: Fog of War — Game Mechanics Design (Hal)

**Author:** Hal (Lead)  
**Date:** 2026-03-07  
**Status:** DESIGN — Comprehensive game mechanics specification  
**Depends on:** Per-Player State Filtering (hal-colyseus-filter-design.md)  
**Implements:** #16 (Fog of War)

### Overview

Complete fog of war system with 5 vision sources, 3 fog states (unexplored/explored/visible), day/night modifiers, and watchtower structure.

**Vision Sources:**
1. **Territory Edge Visibility** — 3-tile radius from owned territory perimeter (not interior)
2. **HQ Bonus Visibility** — 5-tile radius from HQ center (larger than territory edge)
3. **Pawn Builder Visibility** — 4-tile radius from each builder position (mobile scouts)
4. **Allied Creature Vision** — Tamed creatures provide vision using their detectionRadius (4 tiles for herbivores, 6 for carnivores)
5. **Watchtower (Observation Post)** — 8-tile radius, new structure type; costs 15W/10S, takes 24 ticks to build, max 3 per player

**Fog States:**
- **Unexplored (black):** Tile not sent to client; no data visible
- **Explored (dimmed):** Tile sent once, now removed from view; terrain visible, no live data
- **Visible (clear):** Tile actively in player's StateView; all real-time data sent

**Day/Night System:**
- Day: Full visibility radius
- Dawn/Dusk: −1 radius penalty
- Night: −2 radius penalty (minimum radius floor of 1)
- Minimum radius: No source drops below radius 1 (always see tile you're on + neighbors)

**Implementation Plan:**
- Phase 1: Add @view() decorators to TileState fields
- Phase 2: Implement tickVisibility() with visibility computation
- Phase 3: Add owned-tile index cache optimization
- Phase 4: Client-side rendering and camera bounds

---

## 2026-03-07: Per-Player State Filtering Design (Hal)

**Author:** Hal (Lead)  
**Date:** 2026-03-07  
**Status:** DESIGN — Server-side filtering foundation  
**Implements:** #32 (Per-Player State Filtering)  
**Blocks:** #16 (Fog of War implementation)

### Critical Finding

The issue title references `.filter()`, but that API is deprecated in Colyseus ≥ 0.16. Current stack (0.17, @colyseus/schema 4.0.16) uses **StateView + @view()** decorator pattern.

### Architecture

**StateView mechanism:**
1. `@view()` decorator marks Schema fields as visibility-controlled
2. Adding `@view()` to any field sets `hasFilters = true` globally on TypeContext, activating per-client encoding
3. `client.view = new StateView()` assigns per-client view in onJoin
4. `view.add(schemaInstance)` makes instance visible; `view.remove()` hides it
5. Built-in `$filter` on ArraySchema/MapSchema checks `view.isChangeTreeVisible()` (O(1) WeakSet lookup)

**Schema changes:**
- **TileState static fields** (always sent when tile in view): type, x, y, fertility, moisture
- **TileState dynamic fields** (only sent when actively visible, marked with @view()): resourceType, resourceAmount, resourceAmount, shapeHP, ownerID, claimProgress, claimingPlayerID, isHQTerritory, structureType
- **GameState:** No @view() on collections; element-level filtering via StateView

**Server data structures (in GameRoom):**
- `playerViews: Map<sessionId, StateView>` — per-client view
- `visibleTiles: Map<sessionId, Set<number>>` — visible tile indices per player

**Visibility tick function:**
```
tickVisibility():
  For each player:
    Compute newVisibleSet from territory, HQ, pawns, creatures, watchtowers
    Diff against previousVisibleSet
    view.add/remove() as needed
    Update creature visibility
```

---

## 2026-03-07: Review — Per-Player State Filtering (Pemulis)

**Reviewer:** Pemulis (Systems Dev)  
**Date:** 2026-03-07  
**Design:** hal-colyseus-filter-design.md  
**Verdict:** APPROVE WITH NOTES

### Summary

Hal's design is architecturally correct. StateView + @view() pattern matches @colyseus/schema@4.0.16 source code exactly. No simulation-breaking issues.

### Key Findings

✅ **Colyseus API Accuracy:** Verified against installed schema source code. All API claims confirmed correct.

✅ **Creature AI Compatible:** No race conditions. Tick ordering correct (tickVisibility runs last after all game systems).

⚠️ **Issue #1 — Performance (Phase 2):** Owned-tile index cache should be merged into Phase 2. Without cache, full 16K tile scan per player costs 3.5-4.5ms per tick, creating CPU spikes. Cache is trivial to add (update in tickClaiming() and spawnHQ()).

⚠️ **Issue #2 — UX Gap:** Player-spawned pawns should get immediate `view.add()` in handleSpawnPawn() to avoid 1-second visibility lag. One line of code.

⚠️ **Issue #3 — Client Breaking Change:** ArraySchema index-based access will break. Client accesses tiles via `state.tiles.at(y * mapWidth + x)`, but with filtering, indices don't correspond to coordinates anymore. Client must switch to coordinate-based access (Map<number, TileState>, sparse array, or iterate+match). MUST communicate to Gately before implementation.

### Verdict

Architecturally correct. Three items are implementation refinements, not blockers.

---

## 2026-03-07: Review — Per-Player State Filtering (Steeply)

**Reviewer:** Steeply (Tester)  
**Date:** 2026-03-07  
**Design:** hal-colyseus-filter-design.md  
**Verdict:** APPROVE WITH NOTES

### Summary

Design is solid and well-researched. StateView + @view() is the correct API. Architecture is testable with existing infrastructure. Several edge cases and one high-risk item need attention.

### Testability

✅ **StateView works in test context:** No Colyseus server dependency needed. `new StateView()` works standalone. Object.create(GameRoom.prototype) pattern continues to work.

✅ **Existing 318 tests should not break:** @view() only affects encoding (which tests don't call), not schema field access.

### Edge Cases Identified

- **No reconnection handling:** If allowReconnection() ever added, visibility state must be rebuilt
- **Mid-game join timing:** onJoin runs ~1.6ms for visibility scan; acceptable but should document
- **Creature spawn visibility gap:** New creatures aren't visible until next tickVisibility() (up to 4 ticks / 1 second)
- **Night→Day bulk operation:** Radius expansion for all players can spike 64K tile operations; consider staggering per-player updates
- **Tile ownership change lag:** Claimer can't see their own claim progress for up to 1 second; consider forcing view.add() on ownership change

### New Risks

- **R10 (Tick ordering fragility):** tickVisibility MUST be last. Add code comment to prevent future developers breaking this.
- **R11 (@view() global activation):** hasFilters flag is global. Verify empirically with full test suite after adding @view() decorators.

### Test Plan

30+ new tests recommended:
- Phase 1 (Schema + StateView): 8 tests (decorator compatibility, view.add/remove, player management)
- Phase 2 (Visibility engine): 18+ tests (territory visibility, creatures, day/night, multi-player, timing)

### Verdict

Approve with conditions:
1. Add R10 (tick ordering) as code comment where tickVisibility added
2. Document reconnection stance explicitly
3. Show `computeInitialVisibility()` implementation
4. Run full 318-test suite as regression gate after @view() decorators
5. Implement creature spawn visibility immediately on spawn (don't wait for next tick)
6. Implement tile ownership change visibility immediately
7. Stagger per-player visibility updates for day/night transitions (optional, nice-to-have)

---

## 2026-03-07: Fog of War — Client Rendering & Camera Design (Gately)

**Author:** Gately (Game Dev/Frontend)  
**Date:** 2026-03-07  
**Status:** DESIGN — Client-side rendering specification  
**Depends on:** hal-colyseus-filter-design.md (server-side StateView filtering)  
**Implements:** #16 (Fog of War — client rendering), User directive (camera restriction)

### Overview

Client-side architecture for fog rendering, tile visibility state tracking, and camera bounds. Zero new server APIs beyond Hal's StateView filtering.

### Tile Visibility Derivation

Client derives visibility state from Colyseus sync lifecycle (no explicit server field):
- Tile appears in state → **Visible**
- Tile removed from state → **Explored** (cache terrain data before removal)
- Tile never received → **Unexplored** (default)
- Tile re-appears → **Visible** again

### ExploredTileCache

Client-side memory of terrain data for tiles no longer in StateView.

**Interface:**
```
cacheTile(tile) — store terrain data when server sends tile
has(x, y) — check if tile was ever seen
get(x, y) — retrieve cached terrain data
keys() — all explored tile indices (for bounds computation)
```

**Memory cost:** Full 128×128 explored = 16,384 tiles × 40 bytes = ~655 KB. Negligible.

### FogManager

Centralized coordinator for tile visibility, fog overlays, and camera bounds.

**Responsibilities:**
1. Track per-tile fog state (unexplored / explored / visible)
2. Manage fog overlay PixiJS Container (black for unexplored, dimmed for explored)
3. Compute explored bounding box for camera bounds
4. Provide `isExplored(x, y)` and `isVisible(x, y)` API

**Fog overlays:**
- Unexplored: Solid black
- Explored: Dimmed terrain (alpha 0.3 or similar)
- Visible: Normal brightness (no overlay)

### Camera Bounds Integration

Camera bounds are dynamically clamped to explored bounding box (computed from ExploredTileCache.keys()). Updates as player explores new areas.

### Integration with Existing Systems

- **GridRenderer:** Render visible tiles normally, explored tiles dimmed, skip unexplored
- **CreatureRenderer:** No changes needed; StateView ensures server only sends visible creatures
- **InputHandler:** Clamp camera bounds to explored bounding box
- **Tile access pattern change:** ⚠️ BREAKING CHANGE — must switch from index-based (`state.tiles.at(y * mapWidth + x)`) to coordinate-based access. Use ExploredTileCache or maintain coordinate-based tile Map.

### Verdict

Design is complete and reactive. Ready for implementation once Hal's StateView filtering is in place.


---

## 2026-03-07: Fog of War — Phase A Implementation Complete

**By:** Pemulis, Gately, Steeply  
**Date:** 2026-03-07  
**Status:** DECISION — Phase A fog of war system delivered and tested

**What was implemented:**

1. **Server visibility computation** (Pemulis):
   - `server/src/rooms/visibility.ts` with `computeVisibleTiles(state, playerId): Set<number>`
   - Three vision sources: HQ center (radius 5), territory edge tiles (radius 3), pawn builders (radius 4)
   - Manhattan distance for circle fill; day/night modifiers applied
   - StateView integration: `initPlayerView()` in onJoin, `cleanupPlayerView()` in onLeave, `tickFogOfWar()` every 2 ticks
   - Constants: FOG_OF_WAR + WATCHTOWER blocks in shared/constants.ts
   - Types: FogState enum in shared/types.ts (Unexplored=0, Explored=1, Visible=2)

2. **Client fog rendering** (Gately):
   - `client/src/renderer/ExploredTileCache.ts` — caches tileType + structureType on tile onAdd, retains after removal
   - GridRenderer fog overlay layer with three visual states: black (unexplored), dimmed (explored), transparent (visible)
   - Camera bounds clamping with 2-tile padding, 10-tile minimum extent, smooth lerp
   - No changes to CreatureRenderer or InputHandler

3. **Test coverage** (Steeply):
   - 26 tests in server/src/__tests__/fog-of-war.test.ts
   - Full coverage: HQ vision, edge detection, pawn vision, day/night modifiers, StateView lifecycle, multi-player scenarios, edge cases
   - All 372 tests passing (26 new + 346 existing)
   - Key finding: Object.create(GameRoom.prototype) pattern requires manual playerViews initialization in tests

**Design decisions:**

1. **Manhattan distance** (not Euclidean) — matches grid-based world
2. **Cache-on-onAdd** for ExploredTileCache — prevents data loss
3. **No owned-tile cache** — deferred to Phase 2 (not critical for 64×64)
4. **No `@view()` decorators** — element-level add/remove sufficient for two-tier visibility
5. **Tick interval 2** for visibility updates — balances responsiveness vs. CPU cost
6. **StateView assignment in onJoin** — after spawnHQ() to ensure HQ exists

**Rationale:**

Manhattan distance is standard for grid-based games. Cache-on-onAdd prevents losing terrain data when tile exits StateView. Two-tier visibility (visible vs. not visible) doesn't need per-field filtering; element-level visibility is cleaner. Staggered updates prevent CPU spike on large player bases. Test suite validated all edge cases and integration points.

**Integration notes:**

- Server filters tiles per player via StateView; client receives only visible + explored tiles
- Client ExploredTileCache preserves terrain after visibility loss (fog semantics)
- No client-side code changes needed for server deployment — fog rendering automatically activates once StateView filtering lands
- Camera bounds accessible via grid.exploredCache for HUD features (e.g., explored tile count)

**Performance:** 372 tests pass with zero lint errors. No breaking changes to existing systems.

**Next phase (Phase B):**
- Alliance shared vision union semantics
- Watchtower destruction + vision loss mechanics
- Owned-tile cache optimization for 128×128 maps
- Day/night transition staggering (CPU mitigation)
# Decision: @view() Decorator Required for StateView Filtering

**Author:** Pemulis (Systems Dev)  
**Date:** 2025-07-25  
**Status:** Implemented  
**Affects:** Server (GameState schema), all team members working with Colyseus state sync

## Context

The Phase A fog-of-war implementation wired StateView correctly (view.add/remove, client.view assignment, tickFogOfWar) but tiles were not being filtered per-player. Players could see the entire map.

## Decision

Added `@view()` decorator to the `tiles` field in `GameState`. This reverses the earlier decision of "NO @view() field decorators."

## Why

In Colyseus 0.17, `@view()` on a collection field is the **required activation mechanism** for element-level StateView filtering. Without it:
- `encoder.context.hasFilters` stays `false`
- `SchemaSerializer` ignores `client.view` entirely
- Full state is broadcast to all clients

The earlier "no @view" decision was based on a misunderstanding — `@view()` on the field doesn't filter the field itself, it enables per-element filtering within the collection via `view.add(item)` / `view.remove(item)`.

## Impact

- **Gately (Client):** No client changes needed. The fog overlay code already reacts to which tiles exist in Colyseus state. With filtering active, `state.tiles.forEach` only iterates visible tiles, and the fog system handles the rest.
- **Server:** Non-@view fields (players, creatures, tick, etc.) are still sent to all clients via the shared encoding pass. Only tiles are per-client filtered.
- **Tests:** All 372 tests pass unchanged. Test code accesses state directly, not through the encoding pipeline.

## Future Considerations

If creatures or players need per-client filtering (e.g., hiding enemy pawns in fog), add `@view()` to `creatures` MapSchema and manage creature visibility in the StateView alongside tiles.

# Decision: Issue Closure — master Merge Only

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-07  
**Status:** Active  
**Affects:** All squad agents, issue workflow

## Summary

Issues are closed only when merged to `master`, not when merged to `dev` or `uat`.

## Rationale

- `dev` is for integration testing
- `uat` is for user acceptance testing
- `master` is production-ready (or ready for release)
- Early closure gives false confidence

## Impact

- **All agents:** Do not auto-close issues on `dev`/`uat` merges
- **Merge commits:** When merging to `master`, use "Closes #N" in commit message
- **Release discipline:** Issues map to production deployments

# Decision: Branching Strategy — dev as Top-Line Integration

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-07  
**Status:** Active  
**Affects:** All squad agents, PR workflow

## Summary

Added `dev` branch as the top-line development integration point. Feature branches now merge into `dev` first, then `dev` merges into `uat` for staging before `master`.

## Changes

- Feature branches target `dev` (not `uat` directly)
- `dev` is the primary integration branch for squad work
- After `dev` stabilization, merge to `uat` for staging validation
- Only merge to `master` after `uat` validation

## Impact

- **All agents:** Update PR base branch to `dev` for feature work
- **Copilot:** Route PRs to `dev` by default
- **Merge timing:** Issues are closed only when merged to `master` (see next decision)

# Decision: Combat System Open Questions — Resolved

**Author:** dkirby-ms (via Copilot)  
**Date:** 2026-03-07  
**Status:** Resolved  
**Affects:** Pemulis (combat implementation), Issues #17, #18

## Questions & Answers

1. **Should destroying an enemy base award resources?**
   - **YES.** Base destruction grants resources to the attacking player.
   - Amounts are per-base-type in ENEMY_BASE_TYPES registry (fortress > hive > raider_camp).

2. **When do enemy bases spawn?**
   - **Night phase only.** Enemy bases spawn during the night phase of the day/night cycle.
   - Server guard: `state.dayPhase !== DayPhase.Night` in tickEnemyBaseSpawning.

3. **WAVE_SPAWNER vs. ENEMY_SPAWNING constant naming?**
   - **Use ENEMY_SPAWNING.** Replace all WAVE_SPAWNER references with the new ENEMY_SPAWNING constant group.
   - Old WAVE_SPAWNER is removed from the codebase.

## Implementation Notes

- Pemulis incorporated all three decisions into the combat system implementation.
- All 384 tests pass; 139 combat .todo() tests await Steeply's test implementation.

## Cross-Agent Updates

- **Gately (UI):** Needs rendering for new creature types. Update HUD spawn buttons.
- **Steeply (Testing):** 139 .todo() tests in combat modules.
- **Hal (Lead):** Docs should reference ENEMY_SPAWNING (not WAVE_SPAWNER).

# Decision: Combat System Implementation — Pemulis

**Author:** Pemulis (Systems Dev)  
**Date:** 2026-03-07  
**Status:** IMPLEMENTED  
**Closes:** #17 (Enemy Bases & Mobiles), #18 (Defender & Attacker Pawns)

## Summary

Implemented complete server-side combat system following Hal's architecture (steps 1-9). 5 new AI modules (enemyBaseAI, enemyMobileAI, combat, defenderAI, attackerAI). All 384 tests pass.

## Design Decisions

1. **WAVE_SPAWNER → ENEMY_SPAWNING** — Single constant group. Old WAVE_SPAWNER removed.
2. **Base destruction awards resources** — Per-base-type amounts (fortress > hive > raider_camp).
3. **Enemy bases spawn at night only** — `state.dayPhase !== DayPhase.Night` guard in tickEnemyBaseSpawning.
4. **Combat cooldowns are module-level Maps** — In combat.ts (not schema fields). Cleaned up on creature death.
5. **PAWN_TYPES registry** — Centralizes pawn config (builder, defender, attacker). Flat PAWN constants retained for backward compat.
6. **isTileOpenForCreature updated** — Enemy mobiles + attackers can walk any tile; defenders restricted to own territory.

## Deliverables

**New modules (5):**
- enemyBaseAI.ts — Base state machine, spawn scheduling, resource rewards
- enemyMobileAI.ts — Mobile patrolling, targeting, movement
- combat.ts — Combat resolution, damage, cooldown tracking
- defenderAI.ts — Defender state machine, territory protection
- attackerAI.ts — Attacker state machine, enemy hunting

**Modified (8):**
- GameRoom.ts, creatureAI.ts, visibility.ts
- constants.ts, types.ts, messages.ts (and 2 test files)

**Lines:** 1,311 across 13 files.

**Test Status:** 384 pass, 0 fail, 139 .todo() (Steeply's work).

## Cross-Agent Impact

- **Gately (UI):** Render new creature types (icons/colors). Add defender/attacker spawn buttons to HUD.
- **Steeply (Testing):** Implement 139 .todo() combat tests.
- **Hal (Lead):** Update docs to reference ENEMY_SPAWNING.

## Branch & Merge

- **Branch:** squad/17-18-combat-system
- **Status:** Pushed to origin. Ready for Gately & Steeply review before merging to dev.
# Decision: Registry-Driven Rendering for Combat Entities

**Author:** Gately (Game Dev)
**Date:** 2026-03-05
**Scope:** Client rendering, all future entity types

## Decision

All combat entity rendering (icons, colors, HP bar max values, costs) is driven by the shared type registries (`ENEMY_BASE_TYPES`, `ENEMY_MOBILE_TYPES`, `PAWN_TYPES`) rather than hardcoded client-side constants. The renderer uses `isEnemyBase()`, `isEnemyMobile()`, and `isPlayerPawn()` type helpers from shared to dispatch rendering logic.

## Rationale

- Adding a new enemy type or pawn type only requires updating the shared registry — the renderer automatically picks up the icon, color, and health values.
- Reduces risk of client/server drift on display values.
- Follows the existing pattern where `CREATURE_TYPES` drives wildlife rendering.

## Impact

- **Pemulis:** If you add new enemy/pawn types to the registries, the renderer will handle them automatically as long as they follow the `enemy_base_*`, `enemy_*`, or `pawn_*` naming conventions.
- **Hal:** Future entity types should include `icon` and `color` fields in their registry definitions.

# Decision: Grave Marker System Architecture

**Author:** Pemulis (Systems Dev)
**Date:** 2026-03-12
**Affects:** Steeply (client rendering), Gately (creature AI), all agents

## Context

Grave markers needed a server-side representation so the client can render death locations and they decay over time.

## Decision

Grave markers are **CreatureState entities** (not a new schema type). This lets the existing Colyseus sync pipeline deliver them to clients with zero protocol changes.

### Key Design Choices

1. **`creatureType = "grave_marker"`** — New type guard `isGraveMarker()` in `shared/src/types.ts`. All combat/AI loops now explicitly skip this type.
2. **`pawnType` stores original creature type** — e.g. `"enemy_raider"`, `"pawn_defender"`. Client can use this to render type-specific grave icons.
3. **`spawnTick` field on CreatureState** — New schema field. Used for decay timing. Available for any future time-since-spawn logic.
4. **`nextMoveTick = Number.MAX_SAFE_INTEGER`** — Natural exclusion from creature AI without special-casing the AI loop.
5. **`tickCombat` now takes `nextCreatureId` counter** — Same mutable `{ value: number }` pattern used by `tickCreatureAI`. Tests updated.
6. **Enemy bases excluded** — They're structures, not creatures. No grave marker on base destruction.

### For Steeply (Client)

- Filter for `creatureType === "grave_marker"` in creature rendering
- Use `pawnType` field to determine which icon/sprite to show
- Grave markers are stationary (`nextMoveTick = MAX`) and have `currentState = "idle"`
- They auto-remove server-side after ~2 minutes (480 ticks)

### Constants

- `GRAVE_MARKER.DECAY_TICKS = 480` in `shared/src/constants.ts`

# Decision: Combat Visual Feedback — Client Architecture

**Author:** Gately (Game Dev)
**Date:** 2026-03-07
**Status:** IMPLEMENTED
**Affects:** Client rendering, CreatureRenderer, main.ts

## Context

Combat system exists server-side but had no visual feedback on the client. Players couldn't see damage being dealt or identify dead units.

## Decision

1. **CombatEffects as standalone manager** — HP delta detection lives in a separate class (`CombatEffects.ts`), not baked into CreatureRenderer. Injected via `setCombatEffects()`.

2. **HP delta detection** — No explicit damage events from server. CombatEffects tracks previous HP per creature ID and triggers effects when `current < previous`.

3. **Z-ordering** — Effects container layered above creatures in grid container: `grid → creatures → effects`. Ensures floating numbers render on top.

4. **Grave markers via PixiJS Graphics** — No emoji for tombstones. Uses rounded rect + cross etching + shadow for a clean, non-emoji visual. Fades in to alpha 0.65. Skips all living-creature logic (no HP bar, no indicator, no health opacity).

## Rationale

- Standalone effects manager keeps CreatureRenderer focused on creature lifecycle. Easy to extend with new effects (shield flashes, heal numbers, etc.) without touching creature code.
- HP delta detection is reliable since Colyseus state sync guarantees health updates arrive.
- Graphics-based tombstones avoid cross-platform emoji rendering inconsistencies and look more game-like.

## Impact

- **Pemulis (Server):** No server changes required. Grave markers already use `creatureType: 'grave_marker'` in shared types.
- **Future work:** CombatEffects can be extended for heal effects (green `+N`), shield indicators, or area-of-effect visuals.

# Decision: Grave Marker Test Coverage & Combat Helper Fix

**Author:** Steeply (Tester)
**Date:** 2026-03-10
**Status:** Active

## Context

Grave marker system was implemented by Pemulis/Gately (combat.ts Phase 3, graveDecay.ts). Tests were needed to validate spawning, properties, decay, and inertness.

## Decision

1. **Separate test file** for grave markers: `server/src/__tests__/grave-marker.test.ts` (25 tests) rather than appending to the 2200+ line combat-system.test.ts.
2. **Fixed `runCombat` helper** in existing combat-system.test.ts — `tickCombat` signature changed to 4 args (added `nextCreatureId`). All 111 existing combat tests were broken by this change; now fixed.
3. **No client-side tests** for CombatEffects — only `camera-zoom.test.ts` exists as client test infrastructure. CombatEffects HP delta rendering would require heavy PixiJS mocking. Recommend adding client test infrastructure if visual regression testing becomes a priority.

## Impact

- All team members: `tickCombat` now requires a `{ value: number }` counter as 4th argument. Any new tests calling it directly must pass this.
- `EnemyBaseTracker` mock must use `spawnedMobileIds` (not `spawnedMobiles`).

# Decision: Combat Test Patterns — Steeply

**Date:** 2026-03-10
**Affects:** All agents writing combat-related tests

## Combat Cooldown Tick Values

Tests calling `tickCombat()` must set `room.state.tick` to at least:
- `ATTACK_COOLDOWN_TICKS` (4) for creature-vs-creature combat
- `TILE_ATTACK_COOLDOWN_TICKS` (8) for mobile tile attacks

The cooldown system uses module-level Maps with `?? 0` default, so tick=0 always fails the cooldown check. Use `FIRST_COMBAT_TICK` and `FIRST_TILE_TICK` helper constants.

## Room Mock Initialization

Any test using `tickEnemyBaseSpawning()`, `tickCreatureAI()`, or `tickCombat()` via the GameRoom must initialize:
```typescript
(room as any).nextCreatureId = 0;
(room as any).creatureIdCounter = { value: 0 };
(room as any).enemyBaseState = new Map();
(room as any).attackerState = new Map();
```

## Pair-Based Combat

Combat resolution is pair-based, not AoE. A single defender adjacent to 3 mobs will exchange damage with ALL three in the same tick (each as a separate pair). Tests should not assume 1:1 engagement per tick.

# Decision: Issue Closure — Directive Rescinded

**Author:** dkirby-ms (via Copilot)
**Date:** 2026-03-07
**Status:** RESCINDED
**Affected Decision:** "Issue Closure — master Merge Only"

## Update

The previous directive **"Only close GitHub issues when merged to master, not dev or uat"** is hereby **rescinded**.

## New Guidance

Issues may be closed at any time based on project workflow needs. No waiting required for master merge. The rule was creating confusion and friction.

## Impact

- **All agents:** Issues can be closed on `dev`, `uat`, or `master` merges as appropriate
- **Commit messages:** "Closes #N" syntax is valid on any branch merge
- **Release discipline:** If master-only closure is needed for a specific workflow, re-open the issue explicitly
# Decision: Dev Mode via URL Parameter

**Author:** Pemulis
**Date:** 2026-03-12
**Status:** Implemented

## Context

Need a quick way to disable fog of war during development/debugging without UI changes.

## Decision

- `?dev=1` or `?devmode=1` URL parameter activates dev mode.
- Client passes `{ devMode: true }` in Colyseus join options.
- Server stores `devMode` flag per-player in the `playerViews` map and bypasses fog-of-war filtering — all tiles and creatures are added to the player's StateView.
- No client-side fog rendering changes needed; the fog system is purely server-driven via StateView.

## Impact

- **Gately (client):** No fog rendering changes needed, but be aware that `?dev=1` will show the full map with no fog overlays.
- **Steeply (tests):** The `onJoin` signature now accepts an optional `options` parameter. Existing tests that call `onJoin(client)` without options are unaffected (devMode defaults to false).
- **Not a production feature** — no auth or validation. Purely a dev tool.


# Decision: Enemy Base Spawn Interval Alignment Bug

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-12  
**Status:** BUG REPORT — needs fix  

## Problem

`ENEMY_SPAWNING.BASE_SPAWN_INTERVAL_TICKS` (480) is identical to `DAY_NIGHT.CYCLE_LENGTH_TICKS` (480). The base spawn check uses `tick % 480 === 0`, which always fires when `dayTick` is 0 — the start of the **dawn** phase (0%). Since `tickEnemyBaseSpawning` gates on `dayPhase === DayPhase.Night` (65–100%), the two conditions **never overlap**. Enemy bases can never spawn.

## Recommended Fix

Change `BASE_SPAWN_INTERVAL_TICKS` to a value that doesn't divide evenly into the cycle length. For example:
- `120` (check 4x per cycle, guaranteeing a night-phase hit)
- `200` (check ~2.4x per cycle, staggered)

Alternatively, decouple the spawn check from modulo arithmetic entirely — use a `nextBaseSpawnTick` counter that only advances during night ticks.

## Impact

This explains why no enemy bases (and therefore no enemy mobiles) appear at night.

## Affected Agents

- **Pemulis (Systems Dev):** Fix BASE_SPAWN_INTERVAL_TICKS
- **Gately (Game Dev):** Be aware of spawn behavior once fixed
- **Steeply (Tester):** Add regression tests for base spawns in night phase once fix is deployed
# Decision: Enemy entities bail out of generic creature AI immediately

**Date:** 2026-03-08
**Author:** Pemulis (Systems Dev)
**Status:** Implemented

## Context

Enemy bases and enemy mobiles were being processed through the generic creature AI pipeline (hunger, stamina, exhaustion recovery) before reaching their specialized step functions. This caused a bug where exhausted enemy bases stopped spawning mobiles.

## Decision

Enemy entities (`isEnemyBase`, `isEnemyMobile`) now exit the `tickCreatureAI()` loop at the very top — immediately after the `nextMoveTick` timer check. They call their own step functions (`stepEnemyBase`, `stepEnemyMobile`) and return. No generic creature logic (hunger, stamina, exhaustion, FSM routing) ever runs for them.

The client-side renderer also guards against showing the 💤 exhausted indicator for enemy entities.

## Rationale

Enemy entities are a fundamentally different AI domain. Mixing them into the generic creature pipeline creates ordering bugs (like exhaustion blocking spawning) and makes the code harder to reason about. Early bailout is the cleanest separation.

## Impact

- `creatureAI.ts`: Enemy base/mobile processing moved to top of loop
- `CreatureRenderer.ts`: Exhausted indicator guarded for enemy types
- If new enemy entity types are added, they must also be routed early in `tickCreatureAI()`


# Decision: Enemy entities bail out of generic creature AI immediately

**Date:** 2026-03-08
**Author:** Pemulis (Systems Dev)
**Status:** Implemented

## Context

Enemy bases and enemy mobiles were being processed through the generic creature AI pipeline (hunger, stamina, exhaustion recovery) before reaching their specialized step functions. This caused a bug where exhausted enemy bases stopped spawning mobiles.

## Decision

Enemy entities (`isEnemyBase`, `isEnemyMobile`) now exit the `tickCreatureAI()` loop at the very top — immediately after the `nextMoveTick` timer check. They call their own step functions (`stepEnemyBase`, `stepEnemyMobile`) and return. No generic creature logic (hunger, stamina, exhaustion, FSM routing) ever runs for them.

The client-side renderer also guards against showing the 💤 exhausted indicator for enemy entities.

## Rationale

Enemy entities are a fundamentally different AI domain. Mixing them into the generic creature pipeline creates ordering bugs (like exhaustion blocking spawning) and makes the code harder to reason about. Early bailout is the cleanest separation.

## Impact

- `creatureAI.ts`: Enemy base/mobile processing moved to top of loop
- `CreatureRenderer.ts`: Exhausted indicator guarded for enemy types
- If new enemy entity types are added, they must also be routed early in `tickCreatureAI()`

---

## 2026-03-07T23:57: tickCombat() Memory Leak Fix — attackerState Cleanup Convention

**By:** Pemulis (Systems Dev)  
**Status:** IMPLEMENTED — Commit ccd2a84  

**Decision:** Pass `attackerState` Map as 5th parameter to `tickCombat()` and delete entries in Phase 3 (pawn death cleanup).

**Rationale:**
- Centralizes all per-creature Map cleanup in Phase 3 death loop
- Avoids split cleanup logic across GameRoom + combat.ts
- Establishes convention: all new `Map<creatureId, ...>` must be cleaned up in Phase 3

**Impact:**
- `tickCombat()` signature: 4 → 5 parameters
- All call sites (GameRoom, test helpers) updated
- Prevents memory leaks when new per-creature state Maps are added

**Convention Going Forward:** Combat-related per-creature state Maps must be passed to `tickCombat()` and cleaned up in Phase 3 death handling.


---

## 2026-03-10: Playwright E2E Testing Framework for Multiplayer

**By:** Steeply (Tester)  
**Date:** 2026-03-10  
**Status:** IMPLEMENTED (PR #52, draft) — Phase 1 complete

### Summary

Established the Playwright E2E testing framework at `e2e/` with custom fixtures, state helpers, and CI workflow for multiplayer Canvas-based testing.

### Implementation Details

#### 1. Browser Contexts for Multi-Player Simulation

- One browser, multiple contexts (not separate browser instances)
- Each context = one player with isolated session
- Custom Playwright fixtures for `playerOne` / `playerTwo` with automatic join flow
- `workers: 1` — all tests share a single Colyseus server to prevent race conditions

#### 2. State-Based Assertions (Primary Strategy)

- Expose `window.__ROOM__` in dev mode for `page.evaluate()` access to Colyseus `room.state`
- Assert on deserialized game state (players, creatures, tiles), not pixels
- Use `page.waitForFunction()` to wait for server state sync before asserting
- DOM selectors: HUD/scoreboard/prompt (20%), visual regression sparingly (10%)

#### 3. Client Code Changes (Complete)

Added to `client/src/network.ts` after room join:
```typescript
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev')) {
  (window as any).__ROOM__ = room;
}
```
Also gated `window.__PIXI_APP__` in `client/src/main.ts` for renderer access.

#### 4. Dual webServer Config

Playwright config starts both Colyseus server (port 2567) and Vite dev client (port 3000). All test URLs use `?dev=1` to disable fog of war.

#### 5. CI Workflow

New `.github/workflows/e2e.yml` triggers on push/PR to `uat` and `master` branches. Runs alongside Vitest, no failures.

#### 6. Phase 1 Tests (Complete)

- ✅ `join-flow.spec.ts` — 4 P0 tests (join, two-player room, spawn pawn)
- ✅ Custom fixture at `e2e/fixtures/game.fixture.ts`
- ✅ State helper at `e2e/helpers/state.helper.ts`
- ✅ Player helper at `e2e/helpers/player.helper.ts`
- ✅ All 520 unit tests pass
- ✅ All 4 E2E tests pass

### Team Impact

- **Gately/Pemulis:** Code changes done — `window.__ROOM__` and `window.__PIXI_APP__` now dev-mode accessible
- **Hal:** Can implement Phase 2 tests (P1/P2 mechanics) — use `e2e/fixtures/game.fixture.ts`
- **CI/CD:** E2E workflow integrated, runs on every `uat` and `master` push
- **Test Performance:** Serial execution by design — slower than unit tests but reliable for multiplayer

### Files Modified

- `client/src/main.ts` — gated `window.__PIXI_APP__`
- `client/src/network.ts` — gated `window.__ROOM__`
- `package.json`, `package-lock.json` — Playwright + dependencies

### Next Phase

Phase 2: Territory, resource income, day/night (P1 tests). Phase 3: Conflict/combat (P2 tests).

---

# Decision: E2E helper type interfaces for `window.__ROOM__`

**Author:** Pemulis  
**Date:** 2026-03-08  
**Scope:** e2e/helpers/

## Context

Fixed all 8 `@typescript-eslint/no-explicit-any` lint errors across 4 files. The E2E helpers (`player.helper.ts`, `state.helper.ts`) access `window.__ROOM__` inside Playwright's `page.evaluate` / `page.waitForFunction` callbacks. These need TypeScript types for the Colyseus room state shape as exposed on `window`.

## Decision

- **Client files** (`main.ts`, `network.ts`): Used `(window as unknown as Record<string, unknown>)` for assigning dev-mode globals (`__PIXI_APP__`, `__ROOM__`). These are write-only contexts so a generic record type is sufficient.
- **E2E helpers**: Defined local `E2ERoom` and `E2EPlayerData` interfaces in each helper file to type the `window.__ROOM__` shape. These are lightweight compile-time-only types that mirror the fields actually accessed by the test helpers.
- Chose **file-local interfaces** over a shared type file because there are only 2 consumers and the types are minimal. If more E2E helpers emerge that access `__ROOM__`, consolidate into `e2e/helpers/e2e-types.ts`.

## Impact

Parker and Dallas should be aware: if new E2E helpers need `window.__ROOM__`, reuse the `E2ERoom`/`E2EPlayerData` pattern or factor into a shared type.

---

# Decision: GitHub Pages for Playwright E2E Reports

**Date:** 2026-03-08
**Author:** Pemulis (Systems Dev)
**Status:** Accepted

## Context

E2E test reports were only available as workflow artifacts, which expire after 7 days and require downloading a zip to view. We needed a more accessible way to review test results, especially for failing tests on the `dev` branch.

## Decision

- Configured the Playwright reporter in CI to emit both `github` (for inline annotations) and `html` (for the full report).
- Added a `deploy-report` job to `.github/workflows/e2e.yml` that publishes the HTML report to GitHub Pages on every push to `dev`.
- The deploy job uses `if: always()` so reports are published even when tests fail — seeing failing reports is the primary use case.
- The existing artifact upload is preserved for PR runs where Pages deployment is skipped.

## Consequences

- The repo's GitHub Pages must be configured to use GitHub Actions as the source (Settings → Pages → Source → GitHub Actions).
- Pages deployments are scoped to pushes to `dev` only; PR runs still get artifact uploads.
- A `concurrency` group prevents overlapping Pages deployments.

---

# Decision: Colyseus Client-Side State Access Patterns in E2E Tests

**Author:** Steeply (Tester)
**Date:** 2026-03-08
**Context:** Phase 2 E2E smoke tests (Issue #50)

## Decision

When accessing Colyseus room state in `page.evaluate()` calls within Playwright tests:

- **Players** (MapSchema): Use `.forEach((player, key) => ...)` and `.size` — NOT bracket access
- **Tiles** (ArraySchema): Use bracket notation `tiles[index]` — NOT `.get()` or `.at()`
- **Scalar fields** (tick, dayPhase, mapWidth): Direct property access `room.state.tick`

## Rationale

Colyseus deserializes state differently on the client vs server. The server-side `ArraySchema.at()` method is not available on the client-side deserialized object. The `.get()` method also doesn't exist. Only bracket notation works for array-type schemas on the client.

## Impact

All future E2E tests that read tile data must use this pattern. This is not obvious from the server-side test code, which exclusively uses `.at()`.

---

## 2026-03-08: CI/CD Audit Remediation Complete

**Author:** Marathe (DevOps/CI-CD)  
**Date:** 2026-03-08  
**Status:** Implemented  

### Context

A comprehensive audit of all 16 GitHub Actions workflows identified 3 critical issues and 6 warnings. All 9 findings have been fixed.

### Decisions Made

#### Standards established (all team members should follow):

1. **Node 22 is the standard** — all workflows must use `node-version: 22`. No exceptions.
2. **Always cache npm** — every `setup-node` step should include `cache: npm`.
3. **Pre-merge validation required** — any workflow that validates a branch must have a `pull_request` trigger, not just `push`. Validation after push is too late.
4. **Concurrency guards on git operations** — workflows that push, merge, or reset branches must use concurrency groups to prevent race conditions.
5. **ASCII-safe output** — workflow scripts should use ASCII or well-supported emoji (✅, ❌, ⛔, ⚠️). Avoid special Unicode that may render as mojibake in different environments.

### Files Changed

- `.github/workflows/e2e.yml` — Node 20→22
- `.github/workflows/squad-ci.yml` — removed push trigger, added workflow_dispatch, added npm cache
- `.github/workflows/squad-preview.yml` — added pull_request trigger
- `.github/workflows/squad-release.yml` — added npm cache
- `.github/workflows/squad-insider-release.yml` — added npm cache
- `.github/workflows/reset-uat.yml` — added concurrency guard
- `.github/workflows/squad-promote.yml` — added concurrency guard
- `.github/workflows/squad-main-guard.yml` — fixed mojibake
- `.github/workflows/squad-heartbeat.yml` — documented disabled cron

### Impact

- Faster CI runs (npm caching)
- No more wasted compute (redundant push triggers removed)
- Safer git operations (concurrency guards)
- Pre-merge validation on preview branch (catches issues before they land)
- Readable error messages in squad-main-guard

---

## 2026-03-08: User Directive — E2E Should NOT Trigger on Dev

**By:** saitcho (via Copilot)  
**Date:** 2026-03-08T14:05:00Z  
**Status:** DECISION — Confirmed user intent  

**What:** E2E workflow should NOT trigger on push/PR to `dev` branch. Only trigger on `uat` and `master`.

**Why:** Intentional cost optimization. E2E test suite consumes significant cloud compute. Running on every dev push wastes resources. Dev is for feature iteration, not full validation.

**Implementation:** `.github/workflows/e2e.yml` branch triggers set to `[uat, master]` only.

---

## 2026-03-08: E2E Workflow Permissions Scoping (Least-Privilege Pattern)

**By:** Marathe (DevOps/CI-CD)  
**Date:** 2026-03-08  
**Status:** IMPLEMENTED  

**What:** Workflow permissions in `.github/workflows/e2e.yml` scoped to job-level (least-privilege) instead of workflow-level.

**Before:**
```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```
All jobs had all three permissions.

**After:**
```yaml
permissions:
  contents: read
```
Workflow-level baseline. Job-level `permissions:` added to `deploy-report` only:
```yaml
deploy-report:
  permissions:
    pages: write
    id-token: write
```

**Rationale:**
- `contents: read` — all jobs need this (checkout, downloads)
- `pages: write` — ONLY `deploy-report` needs this (publishes to GitHub Pages)
- `id-token: write` — ONLY `deploy-report` needs this (OIDC token for Pages)

The `e2e` job (tests, artifacts) and `discord-notify` job (webhook) don't need elevated perms.

**Pattern:** Going forward, ALL GitHub Actions workflows should grant only baseline `contents: read` at workflow level and add job-level `permissions:` blocks for jobs that need elevated access. Reduces blast radius if a job is compromised.

**Decisions.md Correction:** Also updated lines documenting E2E branch triggers to reflect `uat`/`master`, not `dev`.

---

## 2026-03-08T16:58: User Directive — Lint-Clean Code from the Start

**By:** saitcho (via Copilot)  
**Status:** BINDING DIRECTIVE — All Agents  

**What:** Agents must write lint-clean code from the start. No exceptions:
- **No `@typescript-eslint/no-explicit-any`** — Use proper types (`unknown`, interfaces, generics, or relax rules with documented rationale)
- **No `@typescript-eslint/no-unused-vars`** — Don't import or declare things you don't use
- **Run the linter before committing** — `npm run lint` is mandatory in the commit workflow

**Why:** User request. The team keeps shipping `no-explicit-any` and `no-unused-vars` errors in every PR. This is a recurring problem and must stop. Prevention (write clean code first) is far better than cleanup (fixing lint errors post-merge).

**Scope:** Applies to all agents (Copilot, Hal, Gately, Pemulis, Steeply, Marathe).

**Note:** Valid exceptions (e.g., E2E tests with browser-context type erasure) require documented decision in decisions.md. See 2026-03-08: ESLint Override for E2E Browser Context Code.

---

## 2026-03-08: ESLint Override for E2E Browser Context Code

**Author:** Steeply (Tester)  
**Date:** 2026-03-08  
**Status:** Implemented  

### Problem

E2E test helpers use Playwright's `page.evaluate()` to extract game state from the browser's runtime context. The Colyseus state objects in the browser don't have compile-time TypeScript types, so helper functions that process this data must use `any` types.

34 of 47 lint errors were `@typescript-eslint/no-explicit-any` violations in:
- `e2e/helpers/creature.helper.ts` (13 errors)
- `e2e/helpers/snapshot.helper.ts` (5 errors)
- `e2e/helpers/tile.helper.ts` (8 errors)
- `e2e/helpers/websocket.helper.ts` (8 errors)

### Decision

**Add an ESLint override for `e2e/**/*.ts` that disables `@typescript-eslint/no-explicit-any`.**

```javascript
overrides: [
  {
    files: ['e2e/**/*.ts'],
    rules: {
      // E2E tests use page.evaluate() which returns untyped browser-context data
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
```

### Rationale

1. **Inherent Type Erasure:** Browser runtime state has no compile-time types. TypeScript cannot infer types for data extracted from `page.evaluate()`.
2. **Standard Practice:** Relaxing `no-explicit-any` for E2E test code is industry-standard. The helpers are isolated to `e2e/` and don't affect production code quality.
3. **Pragmatic:** Alternative would be to add hundreds of type assertions (`as SomeType`) throughout helpers, which provides no safety benefit and clutters the code.

### Impact

- **Scope:** Only affects `e2e/` directory. Production code in `client/`, `server/`, `shared/` still enforces strict `no-explicit-any`.
- **Developer Experience:** Removes friction for writing E2E helpers that extract browser-context state.
- **Code Quality:** No degradation. The helpers already use defensive checks (null guards, property existence checks) to handle untyped data safely.

### Result

Zero ESLint errors. E2E tests continue to pass unchanged.

---

## 2026-03-08: Tick-Tolerant E2E Assertions

**Author:** Steeply (Tester)  
**Date:** 2026-03-08  
**Status:** STANDARD PATTERN — All E2E Tests  

### Decision

E2E tests must not use exact equality (`toBe`) for resource values that can be modified by game ticks (HQ income, pawn upkeep). Use inequality checks (`toBeLessThan`, `toBeGreaterThan`) or tolerance ranges instead.

When testing negative outcomes (e.g., "spawn should fail"), always verify the precondition (e.g., "resources are actually insufficient") before sending the command.

Replace all `waitForTimeout()` usage with `expect.poll()` or `waitForFunction()` — fixed-duration waits are inherently nondeterministic.

### Rationale

HQ income fires every 40 ticks and pawn upkeep every 60 ticks. A spawn happening near those boundaries shifts resource values, making exact assertions flaky. Inequality checks assert the game invariant (resources decreased) without coupling to tick timing.

### Scope

Applies to all E2E tests in `e2e/tests/`. See pattern in `e2e/tests/multiplayer.spec.ts` (spawn resource assertions).

---

## 2026-03-08T18:09Z: User Directive — E2E Workflow Trigger Restriction

**By:** saitcho (via Copilot)  
**Date:** 2026-03-08  
**Status:** CAPTURED — Awaiting implementation

### Decision

E2E GitHub Actions workflow should only trigger on pushes to `uat` and `master` branches. Remove `pull_request` event trigger entirely.

### Rationale

E2E tests are comprehensive but resource-intensive. Running on every PR is unnecessary overhead. Testing should focus on deployment branches (uat/master) where integration is complete. Development testing happens via unit/integration suites.

### Implementation Notes

- Workflow: `.github/workflows/e2e.yml`
- Related: 2026-01-20 E2E Workflow Simplification and Direct Artifact Links decisions (already implemented)

---

## 2026-03-08: Builder Traversal — Builders Walk Through Own Structures

**Date:** 2026-03-08  
**Author:** Pemulis (Systems Dev)  
**Status:** IMPLEMENTED (PR #55, Pemulis) + TESTED (PR #57, Steeply)

### Decision

Builders (pawn_builder creatures) can traverse structures on their owner's territory without pathfinding obstruction. Implementation in `isTileOpenForCreature()` checks both `creature.creatureType === "pawn_builder"` AND `tile.ownerID === creature.ownerID`.

### Rationale

Built outpost/farm tiles receive `shapeHP = BLOCK_HP` (100), making them unwalkable to standard pathing. When builders construct outposts in sequence, they wall themselves off and oscillate. Allowing builder traversal of own structures is gameplay-appropriate (construction units navigate their own constructions) and combat-safe (attackers/defenders still blocked).

### Scope

- Only builders get traversal privilege
- Enemy structures remain blocking
- Defenders, attackers, wildlife, carnivores unaffected

### Testing

Validated by Steeply in PR #57:
1. `isTileOpenForCreature` builder structure traversal test
2. `move_to_site` FSM blocked-path reset (prevents oscillation)
3. `findBuildSite` HQ-distance tiebreaker (outward expansion bias)

Result: 528 tests passing.

---

## 2026-03-08: Server Startup Log — Client URL Configuration

**Date:** 2026-03-08  
**Author:** Marathe (DevOps Engineer)  
**Status:** IMPLEMENTED (commit 1d63354)

### Decision

Server startup log now includes the client application URL (e.g., `http://localhost:3000`) for developer convenience. Client URL is configurable via `CLIENT_URL` environment variable; defaults to `http://localhost:3000`.

### Rationale

When developers start the server, they immediately see where to access the application without referencing config files. Configurability via env var allows production deployments to override default (e.g., DNS name, port mapping).

### Implementation

File: `server/src/index.ts`
- Reads `process.env.CLIENT_URL` with fallback to `http://localhost:3000`
- Logged alongside Colyseus server address on startup
- No behavioral changes; purely informational

### Impact

- **Scope:** Startup logging only
- **Backward Compatible:** Yes (default preserves existing behavior)
- **Testing:** No new tests required (logging enhancement)

---

## Remove Pawn Wood Upkeep System

**Date:** 2026-03-08
**Author:** Pemulis (Systems Dev)
**Status:** IMPLEMENTED

### Decision

Wood upkeep for pawns (builders, defenders, attackers) has been completely removed as a gameplay mechanic. Pawns no longer consume wood to stay alive and no longer take damage or die from upkeep failure.

### What Changed

- `tickPawnUpkeep()` removed from GameRoom and game loop
- `upkeep` field removed from `PawnTypeDef` interface and all `PAWN_TYPES` entries
- `BUILDER_UPKEEP_WOOD`, `UPKEEP_INTERVAL_TICKS`, `UPKEEP_DAMAGE` constants removed from `PAWN`
- 8 upkeep tests removed (pawnBuilder, combat-system, gameLog)
- Client-side `upkeep` log type config left intact (harmless, no events sent)

### What's NOT Affected

- Wild creature hunger system (herbivores/carnivores)
- Wood as building resource
- Any other resource mechanics

### Impact

- **Balance:** Pawns are now permanent once spawned (until killed). Economy pressure from wood upkeep is gone — may need rebalancing elsewhere.
- **Client:** `GameLog.ts` still has `upkeep` type styling — can be cleaned up later if desired.
- **Tests:** 515 tests passing after removal.

---
# Discord Notifications for Deployment Workflows

**Date:** 2026-03-08  
**Author:** Marathe (DevOps/CI-CD)  
**Status:** Implemented

## Decision

Add Discord notifications with changelog to both UAT and production deployment workflows to provide immediate visibility into deployment status and changes.

## Context

Previously, deployment workflows (`.github/workflows/deploy-uat.yml` and `.github/workflows/deploy.yml`) completed silently without team notification. This made it difficult to track:
- When deployments occurred
- Whether deployments succeeded or failed
- What changes were included in each deployment
- Where to access the deployed application

The E2E workflow already had excellent Discord notifications (lines 73-153 in e2e.yml) that could serve as a pattern.

## Implementation

Added `discord-notify` job to both deployment workflows with the following features:

### Notification Content
- **Environment indicator:** 🧪 UAT or 🎮 Production
- **Deploy status:** ✅ success (green 3066993) or ❌ failure (red 15158332)
- **Changelog:** Last 10 commits with format `• <hash> <message> (<author>)`
- **Deployed URL:** Azure Container App FQDN
- **Commit info:** Short SHA with GitHub commit link
- **Actions run link:** Direct link to workflow run

### Technical Details
- Runs with `if: always()` to notify on both success and failure
- Guarded with `if: ${{ env.DISCORD_WEBHOOK_URL != '' }}` for fork safety
- Uses `jq` for safe JSON escaping of dynamic content
- Changelog generated via `git log --pretty=format:'• %h %s (%an)' HEAD~10..HEAD`
- Changelog truncated to 1000 chars if too long (Discord field limit ~1024 chars)
- FQDN passed from deploy job to discord-notify job via job outputs
- Username: "Squad: Marathe" for webhook attribution

### Code Pattern
```yaml
outputs:
  fqdn: ${{ steps.get-url.outputs.fqdn }}

discord-notify:
  needs: deploy
  runs-on: ubuntu-latest
  if: always()
  env:
    DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
    DEPLOY_RESULT: ${{ needs.deploy.result }}
    DEPLOY_URL: ${{ needs.deploy.outputs.fqdn }}
```

## Consequences

### Positive
- Immediate visibility into all deployments (UAT and production)
- Clear changelog helps team understand what changed in each deployment
- Failure notifications ensure rapid response to deployment issues
- Consistent notification pattern across E2E, UAT, and production workflows

### Neutral
- Adds ~10 seconds to workflow runtime for git clone and notification posting
- Requires `DISCORD_WEBHOOK_URL` secret to be configured (already exists in repo)

### Negative
- None identified

## Alternatives Considered

1. **No changelog** — Simpler but provides less context about what was deployed
2. **Full git diff** — Too verbose for Discord, would exceed field limits
3. **Email notifications** — Less immediate and harder to integrate with team chat workflow
4. **Slack instead of Discord** — Team already uses Discord; no reason to change

## Related Decisions

- E2E Discord Notifications (2026-03-08T13:24:21Z) — Established the pattern used here
- Direct Artifact Links in Discord Notifications (2025-01-20) — Deep-linking pattern

## Files Modified

- `.github/workflows/deploy-uat.yml` — Added discord-notify job
- `.github/workflows/deploy.yml` — Added discord-notify job
- `.squad/agents/marathe/history.md` — Documented learnings

## Commit

984daef — "Add Discord notifications with changelog to deployment workflows"

---

## 2026-03-10: GitHub Actions Secret Masking & Job Output Patterns

**Date:** 2026-03-10  
**Author:** Hal (Lead)  
**Context:** Issue #65 / PR #66 review — Discord deploy notifications missing URLs due to secret redaction  
**Status:** BINDING — All future CI/CD work must follow this pattern

### Problem

GitHub Actions secret masking is **overly aggressive**. When a job outputs a value that matches any substring of known secrets in the vault, the output is redacted from logs and becomes unusable downstream.

In PR #66, the deploy job tried to output the Azure Container App FQDN via `${{ needs.deploy.outputs.fqdn }}`. GitHub's secret redaction detected this as a potential secret match and masked it, breaking the Discord notification's URL field.

### Decision

**For static infrastructure endpoints:** Hardcode the values directly in workflow YAML instead of relying on job outputs.

#### When to Hardcode
- Infrastructure endpoints (API URLs, CDN URLs, custom domains)
- Environment names and flags (prod/uat/dev)
- Build configuration that's known at workflow definition time

#### When to Use Job Outputs
- Generated values (commit SHA, build artifact paths, feature flags computed at runtime)
- Values that are legitimately unknown until the job runs
- Values that will never match secret patterns (e.g., short hashes, structured data)

#### If You Need Dynamic URLs
If a value must be truly dynamic:
1. **Do NOT** try to pass it through job outputs (secret redaction will get you)
2. **Instead:** Use GitHub repository variables or environment-level configuration as the source of truth
3. Reference the variable directly in dependent jobs

### Examples

#### ✅ Correct: Hardcoded Infrastructure URLs
```yaml
env:
  DEPLOY_URL: "https://gridwar.kirbytoso.xyz"  # Known at workflow definition time
  API_ENDPOINT: "https://api.example.com"      # Static infrastructure
```

#### ❌ Wrong: Dynamic Output with Potential Masking
```yaml
- id: get-url
  run: echo "fqdn=$AZURE_FQDN" >> $GITHUB_OUTPUT  # Will be masked if AZURE_FQDN is in secrets
  
# Later job:
env:
  DEPLOY_URL: ${{ needs.build.outputs.fqdn }}  # May be empty due to masking
```

#### ✅ Correct: Dynamic Value from Repository Variable
```yaml
env:
  DEPLOY_URL: ${{ vars.PRODUCTION_DEPLOY_URL }}  # Set as repo variable, not secret
```

### Files Modified
- `.github/workflows/deploy-uat.yml` — hardcoded UAT URL
- `.github/workflows/deploy.yml` — hardcoded production URL

### For Future Reference
If another workflow needs to expose a runtime value:
1. Evaluate whether it's actually needed downstream
2. If yes, check if it could be a static value instead
3. If it must be dynamic, use repository variables (vars.*, not secrets.*)
4. Document why the dynamic approach is necessary

### Related Issues
- Issue #65: Discord deploy notifications showed `Deployed URL: https://` with no actual URL
- PR #66: fix: include deployed URL in Discord notification (closes #65)

---

## 2026-03-10: Viewport Culling for Tile Rendering
## 2026-03-10: Viewport Culling for Tile Rendering (Camera Performance)

**Date:** 2026-03-10  
**Author:** Steeply (Tester)  
**Issue:** #29 — Bug: Scrolling around the map is laggy  
**PR:** #60  
**Status:** IMPLEMENTED

### Context

The 128×128 map creates 49,152 Graphics objects (3 per tile: terrain, territory overlay, fog overlay). All were permanently `visible = true` in the PixiJS stage tree, causing the renderer to process every object every frame regardless of whether they were on-screen.

### Decision

Implement **differential viewport culling** rather than PixiJS's built-in `cullable` property:

- `Camera.getViewportTileBounds()` computes the visible tile range from camera position, scale, and viewport size (with 2-tile padding).
- `GridRenderer.updateCulling()` uses a `lastCullBounds` cache to only toggle visibility on tiles entering/leaving the viewport boundary (~80 tiles per frame instead of scanning all 16,384).
- Tiles start `visible = false` in `buildGrid()` and are shown by the first culling pass.

### Why Not PixiJS `cullable`?

PixiJS 8's built-in culling still iterates all objects each frame to check bounds. With 49,152 objects, the culling check itself is expensive. Manual differential culling is O(viewport_border) per frame, not O(all_tiles).

### Impact

- At 1× zoom: ~400 objects rendered per frame (was ~49,152)
- Per-frame culling work: ~80 border tiles (differential), not 16,384
- Scrolling/camera panning is now smooth and responsive

### For Future Work

If the map grows beyond 128×128, consider chunked containers (e.g., 16×16 tile chunks) where entire chunks can be culled as a unit, reducing even the border-tile overhead.

---

## 2026-03-09: User Directive — JWT Auth for MVP

**Date:** 2026-03-09T01:11:15Z  
**By:** Dale Kirby (via Copilot)  
**Status:** ACCEPTED  

Use basic JWT tokens for auth MVP. Entra ID external identities integration deferred (future swap via AuthProvider interface).

---

## 2026-03-09: Status Panel UX Redesign (PR #68)

**By:** Gately (Game Dev)  
**Date:** 2026-03-09  
**PR:** #68  
**Status:** MERGED to dev  

### Changes

1. **Removed Level/XP from HUD** — Confusing to testers (no gameplay purpose yet, no unlocks/gating)
2. **Renamed headers:** "Inventory" → "Resources", "Creatures" → "Wildlife" (clearer in context)
3. **Reordered sections by importance:** Resources > Territory > Builders > Combat > Time of Day > Wildlife

### Impact

- `HudDOM.updateLevelDisplay()` and `onLevelChange` callback removed
- `xpForNextLevel` no longer imported in client code
- Stat-bar CSS classes removed (re-add if progression re-implemented)

---

## 2026-03-09: Initiative Triage & Execution Plan (Issues #19, #30, #31, #42)

**Author:** Hal (Lead)  
**Date:** 2026-03-09  
**Status:** ACTIVE PLAN  

### Execution Plan Summary

**Wave 1 (Parallel Start — Immediate)**
| Issue | Lead | Support | Notes |
|-------|------|---------|-------|
| #42 Auth/JWT | Pemulis | Steeply (tests) | JWT-only scope. Entra ID deferred. SQLite for dev. |
| #31 Game Log | Gately | Pemulis (log enrichment) | Establishes overlay panel pattern for #30. |
| #19 Rounded Tiles | Gately or @copilot | — | Gately picks up after PR #68 merges. @copilot is fallback. |

**Wave 2 (After #31)**
| Issue | Lead | Support |
|-------|------|---------|
| #30 Chat | Gately (UI) | Pemulis (server protocol) |

### Key Corrections from Prior Triage

1. **#30 does NOT depend on #42** — Players already have display names from join prompt
2. **#31 does NOT depend on #42** — Game log events are system events
3. **#42 is independent** (blocks #41 godmode only)

### Scope Boundaries (v1 only)

**#19:** Rounded corners + per-tile noise in GridRenderer (no biome transitions, no animated effects)  
**#30:** Text broadcast chat, server sanitization, scrollable overlay (no commands, DMs, channels, persistence, auth-linked identity)  
**#31:** `game_log` handler, styled overlay, event categories with color (no filtering/search, no export, no click-to-locate)  
**#42:** JWT token issuance, basic username/password + guest play with upgrade path, SQLite for dev (no OAuth providers, no Entra ID in v1, no game state persistence)

### Risks & Mitigations

- **Gately bottleneck:** Three issues route through Gately. Mitigation: #19 is small, #30 waits for #31 pattern, @copilot fallback for #19
- **#42 scope creep:** Mitigation: JWT-only, no OAuth, no game state persistence in v1
- **Overlay pattern divergence:** Mitigation: Hal reviews #31 PR specifically for reusability before #30 starts

### Assignments

| Member | Issues | Role |
|--------|--------|------|
| **Gately** | #19, #31, #30 | UI/rendering lead. Starts after PR #68. |
| **Pemulis** | #42, #31, #30 | Backend lead for auth. Server support for log/chat. |
| **Steeply** | #42 | Test coverage for auth flows. |
| **Hal** | All | Scope/review. Enforce boundaries. |

---

## 2026-03-09: Auth Provider Abstraction & Persistence Repository Pattern

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-09  
**Issue:** #42  
**Status:** DECISION  

### Design

1. **AuthProvider interface** abstracts JWT issuance/validation
   - Current: `LocalAuthProvider` (jsonwebtoken + bcryptjs)
   - Future: Drop-in Entra ID external identities replacement
   
2. **Repository pattern** for persistence
   - `UserRepository` and `PlayerStateRepository` interfaces
   - SQLite implementation for dev
   - Swap to Postgres/Cosmos by implementing interface
   
3. **Player state restoration** on rejoin
   - **Persists:** score, level, XP, displayName
   - **Does not persist:** resources, territory (map-seed-dependent)
   
4. **onLeave remains synchronous** for test compatibility (critical for Object.create mocking)

### Why

- Entra ID swap was explicit requirement from Dale. Interface design = zero GameRoom changes on backend swap.
- Repository pattern is standard for swappable storage. SQLite for dev avoids external dependencies.
- Territory restoration deferred (would require map-seed matching or spatial migration logic).

---


## 2026-03-12: GitHub Auto-Close Issue Process Fix

**Author:** Hal (Lead)  
**Date:** 2026-03-12  
**Status:** REQUIRES IMPLEMENTATION  
**Affects:** All squad agents, PR workflow  

### Problem Statement

Four issues (#19, #31, #42, #74) had PRs merged to `dev` but remained OPEN on GitHub. Root cause: PRs used `(#N)` reference syntax in titles or only in commit messages, not GitHub's required auto-close syntax `Closes #N` in the **pull request body**.

GitHub auto-closes issues only when:
1. The PR body contains `Closes #N`, `Fixes #N`, `Resolves #N`, etc. **(ALWAYS WORKS)**
2. The merge commit message contains these keywords **(ONLY works with non-squash merges)**

When PRs are squash+merged on `dev`, GitHub only reads the PR body, not the commit message. Two PRs (#71, #76) had "Closes #N" only in the commit, causing auto-close to fail.

### Evidence

| PR  | Issue | PR Body Has "Closes" | Commit Has "Closes" | Result |
|-----|-------|----------------------|---------------------|--------|
| #70 | #42   | ✓ Yes                | N/A                 | ✓ Closed auto |
| #71 | #19   | ✗ No                 | ✓ Yes               | ✗ Stayed open |
| #72 | #31   | ✓ Yes                | N/A                 | ✓ Closed auto |
| #76 | #74   | ✗ No                 | ✓ Yes               | ✗ Stayed open |

### Root Cause

Instructions in `.squad/copilot-instructions.md` say "Reference the issue: `Closes #{issue-number}`" but did not specify *where* this must appear. Squad agents interpreted this as "anywhere" and some placed it only in commit messages.

### Decision

**All PRs for issue work MUST include `Closes #N` in the pull request body.** Commit messages should also follow the convention (for master-to-uat-to-prod workflows where merge commits matter), but the PR body is the single source of truth for GitHub auto-close on squash merges.

**Files Updated:**
1. `.squad/copilot-instructions.md` — PR Guidelines section updated to emphasize PR BODY as the only reliable place
2. `.squad/routing.md` — Rules section updated with explicit requirement

### Rationale

- **Clarity:** Removing ambiguity about where close keywords must appear prevents future failures
- **Reliability:** PR body syntax works for all merge strategies (squash, rebase, merge commit)
- **Process:** Single rule (PR body) is easier to enforce than dual locations (body + commit)
- **GitHub native:** We rely on GitHub's auto-close feature; we must follow GitHub's rules

### Success Criteria

- [ ] Zero issues stay open after PRs merge to dev for 2 weeks (validation period)
- [ ] All new issue-work PRs include `Closes #N` in body
- [ ] Squad agents acknowledge updated instructions

---

---

## 2026-03-09: Chat Message Protocol

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-09  
**Issue:** #30 — In-Game Chat  
**Status:** IMPLEMENTED

### What

Added a `"chat"` message type to the Colyseus message protocol:

- **Client → Server:** `{ text: string }` (message type: `"chat"`)
- **Server → All Clients (broadcast):** `{ sender: string, text: string, timestamp: number }`
- **Max length:** 200 characters (`CHAT_MAX_LENGTH` constant in shared)

### Key Decisions

1. **No schema storage:** Chat is ephemeral. Server validates and broadcasts but does not persist messages in `GameState`. Client manages its own display history. This avoids state bloat — Colyseus syncs schema to all clients, and chat history would grow unbounded.

2. **HTML stripping for sanitization:** `/<[^>]*>/g` regex strips all HTML tags. Sufficient for plain-text chat in a game context. Not a full XSS sanitizer — but the broadcast payload is plain text, not rendered as HTML.

3. **Sender from `displayName`:** Falls back to `"Unknown"` if player hasn't set a name yet. Uses the server-side player state as the source of truth (client can't spoof sender).

4. **Timestamp from `Date.now()`:** Server-authoritative timestamp prevents client clock manipulation.

### Impact

- **Gately:** Client should listen for `"chat"` broadcasts and render them. `ChatBroadcastPayload` interface is in `shared/src/messages.ts`. Use `CHAT_MAX_LENGTH` for client-side input validation.
- **Steeply:** Test coverage for `handleChat` (validation, sanitization, broadcast) would be valuable.

---

## 2026-03-09: Chat UI Architecture

**Author:** Gately (Game Dev)  
**Date:** 2026-03-09  
**Issue:** #30 — In-game chat

### Decision

Chat overlay is a DOM-based panel (`ChatPanel.ts`) following the same overlay-panel skill pattern as GameLog — not rendered in PixiJS canvas.

### Key Choices

- **Input isolation via `stopPropagation`:** Chat input catches all keydown events when focused so game controls (WASD, Space, etc.) don't fire while typing. InputHandler checks `chatPanel.isFocused` as an early-return guard.
- **Keybindings:** `C` toggles chat panel visibility, `Enter` focuses the chat input from game context, `Escape` blurs back to game controls.
- **Message protocol:** Client sends `room.send('chat', { text })`, expects server to broadcast `{ sender, text, timestamp }`. Pemulis owns the server handler.
- **History cap:** 100 messages max in DOM (pruned oldest-first). Separate from GameLog's 200-entry cap since chat messages are typically shorter.
- **Positioning:** Below game-log in the `#game-outer` flex column, same 800px width as game-log for visual alignment.

### Impact on Others

- **Pemulis:** Server must handle `"chat"` message type and broadcast `{ sender, text, timestamp }`.
- **Steeply:** ChatPanel needs tests for: message rendering, pruning, input focus/blur, toggle visibility.


---

## 2026-03-09: Versioning Baseline Established

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-12  
**Status:** IMPLEMENTED

### What

- Root `package.json` now has `"version": "0.1.0"` — the single source of truth for release versioning.
- `squad-promote.yml` (both dev→uat and uat→prod jobs) is hardened: if version is missing/undefined, falls back to short git SHA and logs a warning. PRs still get created with a meaningful identifier.
- `squad-release.yml` is hardened: if version is missing/undefined, the step fails with a clear error. Releases must have a real semver version — no `vundefined` tags.

### Why

Both promote and release workflows were producing "vundefined" in PR titles and git tags because `package.json` had no `version` field. The hardening ensures this class of bug is caught immediately rather than silently producing bad artifacts.

### Design Choices

- **Soft fallback (promote):** git SHA used as PR identifier if version missing. Promotion is a process step; useful even without a version string.
- **Hard fail (release):** semver is required. git tags and GitHub releases with bad version strings pollute release history and are painful to clean up.
- **Starting version:** 0.1.0 per semver convention for pre-release software.
- **Version bumping:** Manual for now. No automation added.

### Impact

All future promote PRs and releases will have correct version identifiers. If someone removes the version field, promote still works (with SHA fallback) and release fails fast with a clear message.

**User Directive Captured:** Auto-increment version on each UAT release. Under review for future implementation.

---

## 2026-03-09: User Directive — Auto-Increment Version on UAT Release

**From:** dkirby-ms (via Copilot)  
**Date:** 2026-03-09T23:29:07Z  
**Status:** PROPOSED

For each release to UAT, the version in package.json should be auto-incremented.

**Captured by:** Scribe for team memory. Requires design review by Pemulis and DevOps.

---

## 2026-03-XX: Reconnection on Disconnect (Grace Period)

**By:** Hal (Lead)  
**Date:** 2026-03-10  
**Status:** PROPOSED

### Context

Player refresh or network drop destroys all game state — territory, creatures, structures gone. Player dumped to lobby as a new player.

### Approach

Use Colyseus's built-in reconnection API (`allowReconnection()` server, `client.reconnect()` client). No custom plumbing — the framework handles session identity, state re-sync, and token management.

**Grace period: 60 seconds.** Long enough for a browser refresh, brief wifi drop, or laptop lid close. Short enough that abandoned slots don't linger.

### Key Insight

Territory, creatures, and structures are already NOT cleaned up on disconnect (no removal code exists). We only need to stop deleting the player from `state.players` and stop tearing down their fog-of-war view during the grace period. The framework does the rest.

### Server Changes (Pemulis)

1. Add `RECONNECT_GRACE_SECONDS = 60` constant
2. Restructure `onLeave()` to use `allowReconnection()`
3. Extract `saveAndRemovePlayer()` private method
4. Update multi-tab guard in `onJoin()` to evict disconnected sessions

### Client Changes (Gately)

1. Add `'reconnecting'` to `ConnectionStatus` type and UI
2. Store/clear reconnection token in sessionStorage
3. Implement `reconnectGameRoom()` with exponential backoff
4. Update `joinGameRoom()` onLeave handler to trigger reconnection
5. Update `setupGameSession()` to not tear down game UI during reconnection

### What We Are NOT Doing

- **No territory cleanup on disconnect.** Territory persists — fixing cleanup is separate.
- **No creature pausing.** Creatures continue AI during grace period.
- **No event queuing.** Player misses events during disconnect.
- **No cross-session reconnection.** If room disposed, reconnection fails.
- **No localStorage for reconnect token.** sessionStorage only (closing tab should not hold a ghost slot).

### Implementation Order

1. **Server first** (Pemulis): `allowReconnection()` safe to ship alone. No behavior change for current clients.
2. **Client second** (Gately): reconnection logic + UI.
3. **QA third** (Steeply): verify full flow.

---

## 2026-03-XX: Game Creation Loading State

**By:** Hal (Lead)  
**Date:** 2025-07-24  
**Status:** ACCEPTED

### Decision

Client-only approach. No server changes, no new shared types, no new game status.

### Why

Adding a `"creating"` status to `GameStatus` would touch shared types, server logic, game list rendering. That's too much surface area for a 2-second spinner.

### Implementation

**One loading overlay on the create form. Three guard rails.**

1. **Add `isCreatingGame` guard flag** (LobbyScreen.ts)
   - Set `true` before `room.send(CREATE_GAME, ...)`, `false` in success/error handlers
   - Early-return to prevent double-submit

2. **Disable form elements while creating**
   - Disable submit button (set `disabled = true`)
   - Change button text to "Creating..."
   - Disable cancel button

3. **Add timeout safety net** (15 seconds)
   - If neither `GAME_JOINED` nor `LOBBY_ERROR` arrives, reset form
   - Show error notification

4. **CSS** (minimal)
   - `:disabled` styles for submit/cancel buttons

### Files Changed

| File | What |
|---|---|
| `client/src/ui/LobbyScreen.ts` | `isCreatingGame` flag, button disable/enable, timeout, text swap |
| `client/index.html` | `:disabled` styles |

### Assignment

- **Gately (UI):** CSS disabled states, button text swap, form logic
- **Pemulis:** Not needed

---

## 2026-03-XX: Client Auth Token Storage & Silent Guest Flow

**Author:** Gately  
**Date:** 2026-03-XX  
**Issue:** #77  
**Status:** IMPLEMENTED

### Decision

- **Token key:** `primal-grid-token` in localStorage
- **Auth URL:** Derived from WS URL by replacing `ws://` → `http://` (same host:port)
- **Flow:** Auto-guest on first visit, reuse token on return, silent refresh on expiry
- **No UI:** Guest auth is completely invisible to the user

### Impact

- Future login/register UI should use the same `saveToken()` / `clearToken()` helpers in `client/src/network.ts`
- Account upgrade flow (`POST /auth/upgrade`) should replace the stored token with the new one
- All auth-related client logic lives in `client/src/network.ts`

---

## 2026-03-12: CORS + Auth Graceful Degradation

**By:** Pemulis (Systems Dev)  
**Date:** 2026-03-12  
**Context:** PR #78 review feedback

### Decisions

1. **CORS via `cors` npm package** on Express server — permissive (`cors()` with defaults). Needed for dev mode where Vite (port 3000) makes `fetch()` calls to Colyseus (port 2567). In production, same-origin serves both, so CORS headers are harmless but unused.

2. **Auth is always optional on the client.** If `ensureToken()` fails for any reason (network, CORS, server down), the client joins the room without a token. If a token-bearing join fails, the client retries without auth. The game must never crash due to auth infrastructure being unavailable.

### Impact

All agents touching `connect()` or adding auth endpoints should respect this pattern — auth failures are warnings, never errors.


---

## 2026-03-10: Custom Domain & Managed Certificate in Bicep

**By:** Marathe (DevOps / CI-CD)  
**Date:** 2026-03-10  
**Status:** IMPLEMENTED

### Decisions

Custom domain binding and managed TLS certificates are now declared in `infra/main.bicep` via a `customDomainName` parameter. Each environment provides its own domain in the `.bicepparam` file.

### Rationale

- Manual custom domain configuration was being blown away on every redeployment because it wasn't in the Bicep template.
- Declaring it in IaC ensures custom domains and certs survive redeployments and are version-controlled.

### Implementation Details

- New parameter: `customDomainName` (string, required)
- New resource: `Microsoft.App/managedEnvironments/managedCertificates@2024-03-01` (child of managed environment, CNAME validation)
- Container App ingress gets `customDomains` array with `bindingType: 'SniEnabled'`
- Container App depends on the certificate resource for correct deployment ordering
- Prod: `gridwar.kirbytoso.xyz`, UAT: `gridtest.kirbytoso.xyz`

### Impact

- All deploy workflows will now provision/maintain the custom domain and cert automatically
- No more manual Azure portal configuration after deployments
- DNS records (CNAME + TXT verification) must already exist at the registrar before deployment

---

## 2026-03-10: Issue Lifecycle & UAT Readiness Tagging

**By:** dkirby-ms (User Directive)  
**Date:** 2026-03-10  
**Captured by:** Copilot

### Decision

Issues stay **open until the fix reaches production**. When a fix merges to `dev`:
1. Label the issue to indicate it's ready for UAT testing (e.g., `stage: uat-ready`)
2. Remove workflow-stage labels that are no longer relevant (e.g., `go:needs-research`, `go:in-progress`)

This applies to all squad work, not just individual issues.

### Rationale

Provides visibility into the promotion pipeline (dev → UAT → prod) without prematurely closing issues. Stakeholders can track where a fix is in the release cycle.

### Impact

- All squad agents closing PRs should label related issues `stage: uat-ready` instead of closing them
- Issues closed only after reaching prod

---

## 2026-03-10T15-14-07Z: Filter squad: commits from deploy changelogs

**Author:** Marathe (DevOps / CI-CD)  
**Date:** 2026-03-10  
**Status:** Implemented

### Context

Deploy workflows (deploy-uat, deploy, squad-promote) generate changelogs from git history for Discord notifications and PR bodies. Internal `squad:` and `squad(agent):` commits (logs, decisions, history updates) were polluting these changelogs with noise players don't care about.

### Decision

Added `grep -v ' squad[:(]'` filter to all 4 changelog generation points, applied immediately after the `RAW_LOG` assignment and before the `FEATURES`/`OTHER` split. This strips any commit line containing ` squad:` or ` squad(` — covering both conventional commit formats used by squad agents.

### Affected Files

- `.github/workflows/deploy-uat.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/squad-promote.yml` (2 locations: dev→uat and uat→prod)

### Rollout

Cherry-picked directly to dev, uat, and prod per team policy (CI-only changes get cherry-picked).

---

## 2026-03-10T15-14-07Z: Browser Refresh Reconnect Pattern

**Author:** Pemulis (Systems Dev)  
**Date:** 2026-03-10  
**Status:** Implemented  
**Issue:** #101

### Decision

On page load, `bootstrap()` checks `sessionStorage` for a Colyseus reconnect token before connecting to the lobby. If a token exists (from a prior game session in the same tab), it attempts `reconnectGameRoom()` first. Success skips the lobby entirely; failure falls through to normal lobby flow.

### Details

- Uses SDK 0.17.34's `onDrop`/`onReconnect` lifecycle hooks for proper status updates during SDK-managed reconnection
- A `pageUnloading` flag (via `beforeunload`) prevents wasted reconnection attempts when the page is being torn down
- Token persisted in `sessionStorage` under key `primal-grid-reconnect-token` — tab-scoped, survives refresh, cleared on tab close

### Impact

Anyone working on `client/src/main.ts` bootstrap flow or `client/src/network.ts` connection handlers should be aware of this pattern. The lobby is no longer the guaranteed first screen after page load.

---

## 2026-03-12T00:00:00Z: CPU Opponent Architecture

**Author:** Pemulis (Systems Dev)  
**Date:** 2026-03-12  
**Context:** Issue #105 — Computer controlled player-opponents

### Decision

CPU opponents are first-class `PlayerState` entries added at `GameRoom.onCreate()` time. They use synthetic session IDs (`cpu_0` through `cpu_6`), receive income/scoring from existing tick functions for free, and make strategic decisions via a flat priority-based AI loop in `cpuPlayerAI.ts`. Tactical behavior is delegated entirely to existing pawn AIs (builder, defender, attacker, explorer).

### Key Design Points

1. **`spawnPawnCore()` is now a public method on GameRoom** — extracted from `handleSpawnPawn` so CPU AI can spawn pawns without a Client reference. Any future system that needs to spawn pawns programmatically should use this method.
2. **`cpuPlayerIds` Set on GameRoom** — tracks which session IDs are CPU-controlled. Must be null-guarded (`?.`) in methods that tests invoke via `Object.create()`.
3. **`CreateGamePayload.cpuPlayers`** — new optional field in the lobby payload. LobbyRoom passes it through to GameRoom options.
4. **Room auto-disposal** — `checkCpuOnlyRoom()` runs after every human player removal. If only CPU players remain, the room calls `this.disconnect()`.
5. **CPU players skip StateView** — no `initPlayerView()` call, zero rendering cost.

### Impact

- **Gately (Frontend):** The client's create-game UI should expose a `cpuPlayers` number input (0–7) in the lobby.
- **Steeply (Testing):** 20 new tests cover CPU AI decisions, spawn mechanics, and room cleanup. Existing 716 tests pass with no regressions.
- **All:** New shared constant `CPU_PLAYER` in `constants.ts`. New pawn type names in `CPU_PLAYER.NAMES`.

---

## 2026-03-10T00:00:00Z: Performance Test Threshold Policy

**Author:** Steeply (Tester)  
**Date:** 2026-03-10  
**Issue:** #104  
**PR:** #106

### Decision

Performance tests in CI use a **two-tier threshold** pattern:

1. **Ideal threshold** — the expected runtime on a fast machine. Exceeding this emits a `console.warn` so regressions are visible in logs.
2. **Hard ceiling** — 5x the ideal threshold. Only this value is asserted with `expect()`. Failing this means an actual algorithmic regression, not environment variance.

### Rationale

CI runners vary in speed (shared VMs, load spikes, cold caches). Hard-asserting tight thresholds creates flaky tests that erode trust in the suite. The goal of perf tests in CI is to catch algorithmic regressions (O(n²) → O(n³)), not to benchmark absolute speed. The warn-at-ideal / fail-at-ceiling pattern gives us both visibility and stability.

### Applies To

All timing-based performance assertions in the test suite.

---

## 2026-03-11T00:57:00Z: Help Screen Implementation (Issue #113)

**Author:** Gately (Game Dev)  
**Date:** 2026-03-11  
**Issue:** #113  
**Status:** Completed  
**PR:** #114 (targeting dev)

### Summary

Enhanced in-game help screen with comprehensive gameplay section and created full HOW-TO-PLAY.md guide for new players. Help system now covers controls, mechanics, strategy, and FAQs.

### Impact

- **Players:** Improved onboarding with accessible in-game + written documentation
- **Documentation:** HOW-TO-PLAY.md now canonical source for gameplay questions
- **README:** Updated with link to new guide for discoverability

### Test Coverage

- 738 tests passing, no regressions detected

### Notes

Standard feature delivery. No cross-agent dependencies. Lead to review PR #114.


---

## 2026-03-11T12-02-00Z: Stage Label Lifecycle: dev→uat

**Author:** Marathe (DevOps / CI-CD)  
**Date:** 2026-03-11  
**PR:** #129  
**Issue:** #122

### Decision

`squad-stage-label.yml` now manages the full stage label lifecycle for dev→uat promotion:

1. **PR merged to `dev`** → linked issues get `stage:ready-for-uat`
2. **PR merged to `uat`** → linked issues swap `stage:ready-for-uat` → `stage:live-uat`

The UAT job scans both PR body and commit messages for issue references, since promotion PRs created by `squad-promote.yml` carry issue references in commit messages, not the PR body.

### Impact

- **Steeply / Hal:** Issues will now automatically reflect UAT status — no manual label changes needed after promotion merges.
- **Future:** If we add uat→prod promotion, the same pattern can be extended with a `stage:live-prod` label and a third job.

---

## 2026-03-11T12-02-00Z: Anticipatory Test Pattern for Bug Fixes

**Author:** Steeply (Tester)  
**Context:** Bugs #126 (map size timeout) and #128 (phantom buildings)

### Decision

When bugs are filed and implementation is in-flight, Steeply writes anticipatory test cases against the *server state model* to establish the expected behavior contract. These tests validate that the underlying data layer is correct — if they pass, the bug is in a higher layer (rendering, serialization, networking). If they fail after a fix, the fix changed server-side behavior and needs test updates.

### Files

- `server/src/__tests__/phantom-buildings.test.ts` (20 tests, bug #128)
- `server/src/__tests__/map-size-timeout.test.ts` (43 tests, bug #126)

### Impact

- **Gately/Pemulis:** If your fixes change `generateMap`, `tickFogOfWar`, `computeVisibleTiles`, or `TileState.structureType` behavior, re-run these tests and flag failures for Steeply to adjust.

---

## 2026-03-11T11-52-40Z: User Directive — Prior Session Lockouts Dropped

**Author:** Copilot (via session user request)  
**Date:** 2026-03-11  
**What:** All pending issues from the previous session are dropped. This includes PR #103 remediation (pageUnloading one-way flag bug) and any associated lockouts. The team starts fresh with the current open issue backlog.  
**Why:** User request — captured for team memory

---

## 2026-03-11T12-10-00Z: Pawn Target Reservation

**Author:** Pemulis (Systems Dev)  
**Date:** 2026-03-11  
**Context:** Issue #127 — Builder pawns clustering together  
**PR:** #133

### Decision

Builder pawns now reserve their target tiles — `findBuildSite()` skips tiles already targeted by other same-owner builders. This prevents multiple builders from converging on the same destination.

### Rationale

The clustering was caused by deterministic scoring without coordination. All builders evaluated the same game state with the same function and picked the same tile. Adding a reservation set is the minimal fix — no schema changes, no new network messages, no performance cost.

### Impact

- **Defenders and attackers** should use the same pattern if they ever independently select targets from a shared pool.
- **CPU player AI** benefits automatically since CPU builders use the same `stepBuilder()` code path.
- The reservation is soft (based on `targetX/targetY` fields already in CreatureState) — no new schema fields were needed.

---

## 2026-03-11T12-10-00Z: Centralized Changelog Generation Script

**Author:** Marathe (DevOps / CI-CD)  
**Date:** 2026-03-11  
**PR:** #132  
**Issue:** #120

### Decision

Changelog generation is now centralized in `.github/scripts/generate-changelog.sh` and shared across all deploy and promotion workflows. The inline grep-based changelog logic that was duplicated in `deploy-uat.yml`, `deploy.yml`, and `squad-promote.yml` has been replaced with calls to this shared script.

### Rules

1. **All changelog generation must use the shared script** — no inline commit-log parsing in workflows.
2. **Discord changelogs** (`--format discord`) exclude maintenance/CI/chore/squad commits — only player-facing changes shown.
3. **PR/markdown changelogs** (`--format markdown`) include all categories, ordered by priority.
4. **Conventional commit prefixes are required** for proper classification. Commits without prefixes fall back to keyword matching, which is less reliable.
5. **Squad-internal commits** (`squad:`, `squad(...):`) are always excluded from all changelog output.

### Impact

- Any new workflow that generates changelogs should call `.github/scripts/generate-changelog.sh` instead of writing inline logic.
- Commit message conventions matter more now — `feat:`, `fix:`, `chore:` prefixes directly affect changelog quality.

---

## 2026-03-11T12-43-00Z: Builder Reservation Logic

**Author:** Hal (Lead)  
**Date:** 2026-03-11  
**Status:** Accepted  
**PRs:** #133 (closed), #134 (approved)

### Decision

Builder pawns now reserve their target tiles using the pattern from PR #134:
1. Check `creatureType` (or `pawnType`)
2. **Check `currentState`** (`move_to_site`, `building`) — crucial to filter out idle pawns
3. Use integer tile indices (`Set<number>`) instead of strings

### Rationale

Two PRs (#133, #134) implemented competing solutions for preventing multiple builders from targeting the same tile. PR #134's approach is state-aware and handles idle pawns correctly.

### Consequences
- PR #133 has been closed (superseded by #134)
- Future pawn logic should follow this state-aware pattern when coordinating target selection
- The pattern is safe for defenders and attackers if they ever independently select from a shared pool

## 2026-03-11T15-44-00Z: Minimum Outpost Spacing

**Author:** Gately (Game Dev)  
**Date:** 2026-03-11  
**PR:** #140  
**Issue:** #139  

### Context

Builders placed outposts on every claimed tile, visually cluttering the map.

### Decision

Added `MIN_OUTPOST_SPACING = 4` (Manhattan distance) in `shared/src/constants.ts`. The `hasNearbyOutpost()` function in `builderAI.ts` checks proximity before placing an outpost structure. Tiles are still claimed — only the outpost icon is suppressed when too close.

### Impact

- **Rendering:** Fewer outpost markers on map — cleaner visuals
- **Client:** No changes needed — already renders based on `structureType`
- **Balance:** Spacing of 4 tiles means roughly 1 outpost per ~20 tiles of territory. Tunable via constant.

---

---

## Territory Color Rendering: Local Gold + Dynamic Player Colors

**Author:** Gately (Game Dev)  
**Date:** 2026-03-12  
**PR:** #142  

### Decision

Territory borders and HQ fills use a two-tier color scheme:
- **Local player:** Always gold (`0xffd700`) — special "your territory" highlight
- **Other players:** Their actual assigned color from `playerColors` map (populated from server state sync)
- **Fallback:** Red (`#e6194b`) if a player's color is missing (defensive)

### Rationale

Previously, all non-local territory was hard-coded red. This made multiplayer unreadable — you couldn't tell which opponent owned which territory. The `playerColors` map was already populated and used correctly for claiming animations, just not for owned territory rendering.

### Implications

- Any new territory visual (influence zones, contested tiles, etc.) should use `playerColors.get(ownerID)` for non-local players, not a hard-coded color.
- Gold is reserved for local player territory rendering. Don't assign gold as a player color on the server side.

---

## Decision: Explicit Map Setup in Tests

**Date:** 2024-10-24
**Status:** Proposed
**Author:** Hal (Lead)

## Context
Tests relying on `generateMap(seed)` were flaky because specific tile properties (like `shapeHP` or `TileType`) at specific coordinates depended on random generation logic, which changes with algorithm tweaks.

## Decision
When testing game logic (like building placement or pathfinding) that depends on specific tile states, tests MUST explicitly set the tile properties rather than hoping a seeded map provides them.

## Consequences
- Tests become deterministic and resilient to map generation changes.
- Reduces "flaky" failures in CI.

---

## HUD Performance: Full Tile Scan for Cap Bonus

**Author:** Hal  
**Date:** 2026-03-12  
**Status:** Accepted (with risk)  
**PR:** #148  

### Context
PR #148 implements building spawn cap bonuses. To display the bonus in the HUD (`HudDOM.ts`), the client iterates over all map tiles (`128x128 = 16,384`) on every Colyseus state change to count the player's buildings.

### Decision
Accepted this O(N) approach for now to keep implementation simple and stateless.

### Risks
- **Performance:** Iterating 16k schema objects on the main thread every state patch could cause frame drops on lower-end devices or if the update rate is high.
- **Mitigation:** If performance becomes an issue, we will refactor to:
  1. Maintain a `buildingCount` in the `Player` schema (server-side tracking).
  2. Or cache the value in `HudDOM` and only update when `tiles` change specifically (using `tiles.onAdd`/`onRemove`).

---

## Building Cap Bonus — Global Per-Type Pattern

**Author:** Gately  
**Date:** 2026-03-14  
**Status:** Implemented (PR #148)

### Decision

Building cap bonuses apply **globally to all pawn types equally** (not per-type). The effective cap is `baseCap + totalBuildingBonus` where bonus sums across all buildings regardless of type.

### Implications

- Any new building type that grants cap bonus should add an entry to `BUILDING_CAP_BONUS` in `shared/src/constants.ts`
- `getBuildingCapBonus()` in GameRoom.ts handles the server-side sum; client mirrors it by iterating tiles
- Both server (`spawnPawnCore`) and client (`updateSpawnButton` + HUD display) must use the same formula
- Starting cap (13 total across types) is unchanged — progression through buildings is optional

---

## Explorer AI: Frontier Ray Scanning

**Author:** Pemulis  
**Date:** 2026-03-12  
**Status:** Implemented  
**PR:** #149  
**Issue:** #147

### Context

Explorers scored only the 4 adjacent tiles. Deep inside owned territory, all neighbors are owned and score equally — resulting in random wandering that doesn't explore.

### Decision

Added a **frontier ray scan** to explorer scoring: for each candidate direction, cast a ray of up to `PAWN_TYPES.explorer.visionRadius` (6) tiles and count unclaimed tiles. This bonus steers explorers through owned territory toward the frontier.

Scoring weights:
- Unclaimed adjacent tile: +3 (was +2)
- Owned adjacent tile: +1
- Unclaimed tiles along ray: +1 each (0-6 range)
- Away from same-owner explorers: +2 (was +1)

### Implications

- `countFrontierInDirection()` is exported from `explorerAI.ts` for direct testing
- Performance: O(4 × scan_radius) per explorer per tick — negligible for max 3 explorers per player
- If future pawn types need frontier awareness, reuse `countFrontierInDirection`

---

## Footer: Build-Time Injection via Vite

**Author:** Hal (Lead)  
**Date:** 2026-03-14  
**Status:** Implemented (PR #151, merged to dev)  
**Issue:** #150

### Decision

Footer UI is populated at build time via Vite `define` plugin:
- **Version:** Injected from root `package.json` version field
- **Date:** Injected from build timestamp (ISO 8601)
- **Issues link:** Hardcoded to GitHub issues page

### Implementation

- Footer `<div id="footer">` in `client/index.html` (no additional markup)
- Vite `define` config in `vite.config.ts` exposes `__VERSION__` and `__BUILD_DATE__`
- Footer populated in `client/src/main.ts` on app startup
- CSS styling: flex, bottom-aligned, minimal footprint

### Rationale

- **Build-time injection:** Avoids runtime lookups; version/date are immutable per build
- **Vite integration:** Standard approach for frontend metadata; no extra API/config needed
- **Non-intrusive:** Footer uses document flow; no changes to game canvas or HUD layout

### Implications

- Deployments include updated footer automatically
- Version in footer always matches package.json of that build
- Future additions (commit hash, branch name) reuse same pattern

---

## 2026-03-14: Food HUD Display — Client Decision

**Author:** Gately (Game Dev)  
**Context:** Issue #21 — Food resource client-side implementation


Food is displayed as a simple count in the inventory section using the 🍖 emoji, following the exact same pattern as wood (🪵) and stone (🪨). No food upkeep rate display in HUD for now — just the raw count. The starvation state is communicated purely through spawn button disabling (all buttons disabled when food ≤ 0).


- Keeping the food display consistent with wood/stone avoids visual clutter and complexity
- Players learn food's role through gameplay (watching it decrease as they spawn units)
- Spawn button disabling is the clearest feedback for "you can't do this"
- A food upkeep rate indicator or starvation warning overlay could be added later if playtesting shows players don't understand the mechanic


- If we add a "food upkeep rate" indicator later, it should go below the food count in the inventory section or as a tooltip
- Any future resource types should follow this same pattern: emoji + name + count span with `id="inv-{resource}"`

---

## 2026-03-14: Food Economy Design

**Author:** Hal (Lead)  
**Status:** Proposed  
**Issue:** #21 — New resource type: food  

---


Food is the third resource. It acts as a **unit allowance**: every pawn consumes food each income tick. Farms switch from producing wood/stone to producing food. This creates a clear build decision: farms feed your army, factories fund your economy.

---


| Constant | Value |
|---|---|
| Starting wood | 25 |
| Starting stone | 15 |
| HQ income (per 10s tick) | 2W, 2S |
| Farm cost | 12W, 6S |
| Farm income | 1W, 1S |
| Factory cost | 20W, 12S |
| Factory income | 2W, 1S |
| Builder spawn | 10W, 5S |
| Defender spawn | 15W, 10S |
| Attacker spawn | 20W, 15S |
| Explorer spawn | 12W, 8S |

Income tick interval: 40 ticks (10 seconds at 4 ticks/sec).

---



| Resource | Old | New |
|---|---|---|
| Wood | 25 | 25 (unchanged) |
| Stone | 15 | 15 (unchanged) |
| Food | — | **50** |

Rationale: 50 food gives ~4 income ticks of runway with 2 builders before needing farms.


| Pawn Type | Food/tick | Rationale |
|---|---|---|
| Builder | 1 | Cheap utility unit |
| Explorer | 1 | Cheap scout |
| Defender | 2 | Combat unit, moderate upkeep |
| Attacker | 3 | Strongest unit, highest upkeep |


One-time wood/stone costs reduced slightly since food adds ongoing cost:

| Pawn Type | Old Cost | New Cost |
|---|---|---|
| Builder | 10W, 5S | **8W, 4S** |
| Defender | 15W, 10S | **12W, 8S** |
| Attacker | 20W, 15S | **16W, 12S** |
| Explorer | 12W, 8S | **10W, 6S** |


| Source | Wood | Stone | Food |
|---|---|---|---|
| HQ (per income tick) | 2 | 2 | **2** |


| Building | Cost | Income (OLD) | Income (NEW) |
|---|---|---|---|
| Farm | 12W, 6S | 1W, 1S | **0W, 0S, 2 food** |
| Factory | 20W, 12S | 2W, 1S | **2W, 1S, 0 food** |

Farms now **exclusively produce food**. Factories remain the resource engine. Clear role split.


| Base Type | Old Reward | New Reward |
|---|---|---|
| Raider Camp | 15W, 10S | 15W, 10S, **5 food** |
| Hive | 10W, 5S | 10W, 5S, **5 food** |
| Fortress | 25W, 20S | 25W, 20S, **10 food** |


When `player.food <= 0`:
1. **Cannot spawn new units** (spawn blocked)
2. **One random pawn takes 5 HP damage per income tick** (starvation damage)
3. Food can go negative (debt accrues from upkeep)

Constant: `STARVATION_DAMAGE_PER_TICK = 5`

---


**Early game (0 farms, 2 builders):**  
HQ income: 2 food/tick. Upkeep: 2 food/tick. Break-even. Starting 50 food provides buffer.

**Mid game (3 farms, 2 builders + 1 defender + 1 attacker + 1 explorer):**  
Income: 2 + 6 = 8 food/tick. Upkeep: 2 + 2 + 3 + 1 = 8 food/tick. Balanced.

**Late game (max army: 5B + 3D + 2A + 3E = 20 food/tick):**  
Needs: (20 − 2) / 2 = 9 farms. Significant investment — correct tension.

---



```typescript
// Add Food to ResourceType enum
export enum ResourceType {
  Wood = 0,
  Stone = 1,
  Food = 2,
}

// Add food to IPlayerState
export interface IPlayerState {
  // ... existing fields ...
  food: number;
}
```


```typescript
// Add to TERRITORY
STARTING_FOOD: 50,

// Add foodUpkeep to PawnTypeDef interface
export interface PawnTypeDef {
  // ... existing fields ...
  readonly foodUpkeep: number;
}

// Update PAWN_TYPES entries with new costs + foodUpkeep
builder:  { cost: { wood: 8, stone: 4 },  foodUpkeep: 1, ... },
defender: { cost: { wood: 12, stone: 8 }, foodUpkeep: 2, ... },
attacker: { cost: { wood: 16, stone: 12 }, foodUpkeep: 3, ... },
explorer: { cost: { wood: 10, stone: 6 }, foodUpkeep: 1, ... },

// Add HQ_FOOD to STRUCTURE_INCOME
HQ_FOOD: 2,

// Update BUILDING_INCOME types to include food
export const BUILDING_INCOME: Record<string, { wood: number; stone: number; food: number }> = {
  farm:    { wood: 0, stone: 0, food: 2 },
  factory: { wood: 2, stone: 1, food: 0 },
};

// Update EnemyBaseTypeDef.reward to include food
reward: { wood: number; stone: number; food: number };

// Update ENEMY_BASE_TYPES rewards
enemy_base_raider:   { ..., reward: { wood: 15, stone: 10, food: 5 } },
enemy_base_hive:     { ..., reward: { wood: 10, stone: 5,  food: 5 } },
enemy_base_fortress: { ..., reward: { wood: 25, stone: 20, food: 10 } },

// New constant
export const STARVATION = {
  DAMAGE_PER_TICK: 5,
} as const;
```


```typescript
// Add to PlayerState class
@type("number")
food: number = 0;
```

---



```typescript
player.food = TERRITORY.STARTING_FOOD;
```


1. After granting HQ wood/stone, also grant HQ food:
   ```typescript
   player.food += STRUCTURE_INCOME.HQ_FOOD;
   ```

2. Building income loop — farm now gives food, not wood/stone:
   ```typescript
   player.food += count * income.food;
   ```

3. **NEW: Deduct food upkeep** — after income, iterate all pawns and deduct:
   ```typescript
   let totalUpkeep = 0;
   this.state.creatures.forEach((c) => {
     if (c.ownerID === playerId && c.pawnType !== "") {
       const def = PAWN_TYPES[c.pawnType];
       if (def) totalUpkeep += def.foodUpkeep;
     }
   });
   player.food -= totalUpkeep;
   ```

4. **NEW: Starvation check** — if `player.food <= 0`, deal 5 HP to one random pawn:
   ```typescript
   if (player.food <= 0) {
     // Find random pawn owned by player, deal STARVATION.DAMAGE_PER_TICK
   }
   ```


Add food check — block spawning if `player.food <= 0`:
```typescript
if (player.food <= 0) return null;
```


Where enemy base rewards are granted, also add:
```typescript
player.food += reward.food;
```

---



Add food display next to wood/stone in inventory section:
```html
<span class="inv-count" id="inv-food">0</span>
```
Use 🍖 or 🌾 emoji as icon.


1. Add `invFood` DOM element reference and `currentFood` field
2. In `bindToRoom()`, listen for `player.food` changes and update display
3. In spawn button validation (`updateSpawnButton()`), also check `currentFood > 0`
4. Show food cost breakdown on spawn buttons is NOT needed (food is upkeep, not spawn cost) — but show current food upkeep rate somewhere in HUD


Update button labels to still show wood/stone cost (unchanged UX — food is ongoing, not per-spawn):
```
🔨 Spawn Builder (8W, 4S)
🛡 Spawn Defender (12W, 8S)
⚔ Spawn Attacker (16W, 12S)
🔭 Spawn Explorer (10W, 6S)
```

Add a tooltip or subtitle showing food upkeep: `+1 🍖/tick`

---


- `Food` resource type in enum, schema, constants
- `food` field on PlayerState (server + client sync)
- Starting food amount (50)
- HQ passive food income (2/tick)
- Farm produces food (2/tick), no longer wood/stone
- Food upkeep per unit per income tick
- Starvation mechanic (block spawn + pawn damage at food ≤ 0)
- Rebalanced pawn spawn costs (wood/stone)
- Food in enemy base rewards
- HUD display of food count
- Spawn button disable when food ≤ 0

- Food as tile resource (harvestable from map) — not needed, farms are enough
- Granary building (food storage bonus) — future feature
- Food trading between players — future multiplayer feature
- Food-specific research/upgrades — future progression feature
- CPU player food AI — CPU already uses `spawnPawnCore`, food check is automatic

---

## 2026-03-14: Food Economy Implementation Notes

**Author:** Pemulis  
**Status:** Implemented  
**Issue:** #21


The starvation check subtracts HP but does not handle death inline — existing creature death logic in the tick loop handles removal when health <= 0. This keeps death handling in one place.

Per the design spec, food debt accrues from upkeep. The starvation check fires when `player.food <= 0`, not just `== 0`. This means large armies can rack up food debt that must be repaid before spawning resumes.

Added `food` to `SerializedPlayerState` and the serde functions. Reconnecting players restore their food balance. Legacy saves without food deserialize with `food: 0` (safe — triggers starvation on next tick, which is correct behavior for a returning player who had no food field).

The pawnBuilder test referenced legacy `PAWN.BUILDER_COST_WOOD` (10) which diverged from actual `PAWN_TYPES.builder.cost.wood` (now 8). Updated test to use `PAWN_TYPES` directly.

- `player.food` is now synced via Colyseus schema — listen for changes like wood/stone
- Spawn buttons should disable when `player.food <= 0` (server blocks it anyway)
- BUILDING_INCOME type now includes `food: number` — update any client references
- Spawn costs changed: builder 8W/4S, defender 12W/8S, attacker 16W/12S, explorer 10W/6S

---

## 2026-03-12: Sprint Round 2 — Triage & Implementation

**Author:** Hal  
**Status:** Approved  
**Issues:** #161, #156, #154

### Decision: #161 Deferred

**Issue:** #161 (Outpost UI Expansion)  
**Label Applied:** `squad:hal`, `epic`, `p2`, `backlog`  
**Rationale:** Scope exceeds current sprint capacity. Deferred to backlog for future consideration after P1 core features stabilize.

### Decision: #156 Approved (Partial)

**Issue:** #156 (Resource Tuning & Balanced Costs)  
**Label Applied:** `go:yes`, `p1`  
**Scope:** Unit cost differentiation + expensive farms system  
**Owner:** Pemulis (Systems Dev) & Gately (Game Dev)  
**Status:** Implementation complete. PR #164 (Pemulis server-side) and PR #165 (Gately client-side) in review queue.  
**Rationale:** Core to P1 progression. Resource economy stability unblocks other features.

### Decision: #154 Outpost Upgrade Implementation

**Issue:** #154 (Outpost Upgrade System)  
**Status:** Parallel implementation in progress  
**Server-side (Pemulis):** Foundation complete. Branch `squad/154-outpost-upgrades`, PR #164 ready.  
**Client-side (Gately):** Rendering, modal UI, fog-of-war integration. PR #165 ready.  
**Next:** Await Hal's review on both PRs. Merge to dev upon approval.

### Cross-Agent Notes

- Pemulis (Systems) and Gately (Game Dev) coordinating on shared outpost schema
- Hal (Lead) reviewing both PRs in parallel; blockers to be noted in PR comments
- No decision conflicts detected; implementation proceeding autonomously per charter
# Epic #161 Decomposition: Game Start, End, Win/Loss Conditions

**Author:** Hal (Lead)
**Date:** 2026-03-16
**Epic:** [Feature] Games need a start and end. There should be win and loss conditions and game-ending events.
**Status:** Decomposition Complete — Ready for Implementation

---

## Architecture Assessment

The lobby/game lifecycle is already 60% built. Key infrastructure that exists:

- **LobbyRoom** handles CREATE_GAME, JOIN_GAME, START_GAME — full pre-game flow ✅
- **LobbyGameEntry** has `status: "waiting" | "in_progress" | "ended"` ✅
- **LobbyBridge** already notifies lobby when GameRoom disposes (`game_ended` event) ✅
- **GameState** has `roundPhase` ("playing") and `roundTimer` (-1) — **unused but ready** ✅
- **Reconnection** with 60s grace period ✅
- **Client** has lobby UI with game list, create, join, start ✅

**What's missing:**
- No win/loss condition checking in simulation loop
- No `winnerId` or `endReason` on GameState
- No GAME_ENDED message from GameRoom to clients
- No end-game UI (victory/defeat screen)
- No client-side "return to lobby" flow after game ends
- `roundTimer` never decremented
- `roundPhase` hardcoded to "playing", never transitions

**Design decision:** The lobby already IS the pre-game phase. No need for a PRE_GAME state inside GameRoom. Players wait in the lobby, host starts, everyone joins GameRoom and gameplay begins immediately. This keeps the existing architecture intact.

---

## Win/Loss Conditions (Simplest Viable Set)

1. **Elimination:** A player loses all territory outside their 3×3 HQ zone → functionally dead (can't spawn pawns, no income, no expansion). Mark as eliminated.
2. **Last Standing (multiplayer):** Last non-eliminated human player wins.
3. **Time Limit:** If `gameDuration > 0`, countdown from configured minutes. When timer hits 0, highest score wins.
4. **Solo Survival:** Single-player game with CPU enemies — survive the full timer duration to win.

**What we're NOT building:** Matchmaking, ranked play, ELO, spectator mode, replays, achievements, leaderboards. All deferred.

---

## Sub-Issues

### Sub-Issue 1: Game Lifecycle Schema & End-Game Messages

**Title:** `[#161] Add game lifecycle schema fields and end-game message protocol`
**Owner:** Pemulis (Systems/Backend)
**Priority:** P1 — Foundation, must be first
**Dependencies:** None
**Estimate:** ~0.5 day

**What to build:**

1. **shared/src/types.ts** — Add:
   ```typescript
   enum GameEndReason {
     LastStanding = "last_standing",
     TimeUp = "time_up",
     Surrender = "surrender",
   }
   ```

2. **shared/src/messages.ts** — Add message constants and payload:
   ```typescript
   const GAME_ENDED = "game_ended"
   const PLAYER_ELIMINATED = "player_eliminated"

   interface GameEndedPayload {
     winnerId: string
     winnerName: string
     reason: GameEndReason
     finalScores: Array<{ playerId: string; name: string; score: number }>
   }

   interface PlayerEliminatedPayload {
     playerId: string
     playerName: string
   }
   ```

3. **shared/src/lobbyTypes.ts** — Add to `CreateGamePayload`:
   ```typescript
   gameDuration?: number  // minutes, 0 = no limit, default 10
   ```

4. **server/src/rooms/GameState.ts** — Add schema fields:
   ```typescript
   @type("string") winnerId: string = ""
   @type("string") endReason: string = ""
   // roundPhase already exists — will use "playing" | "ended"
   // roundTimer already exists — will decrement from gameDuration
   ```

5. **server/src/rooms/LobbyState.ts** — Add to `LobbyGameEntry`:
   ```typescript
   @type("number") gameDuration: number = 10
   ```

6. **server/src/rooms/GameState.ts** — Add to `PlayerState`:
   ```typescript
   @type("boolean") isEliminated: boolean = false
   ```

**Definition of done:** Schema compiles, shared types exported, no runtime changes yet. All existing tests pass.

---

### Sub-Issue 2: Win/Loss Condition Engine & Game End Flow

**Title:** `[#161] Implement win/loss detection and game end flow on server`
**Owner:** Pemulis (Systems/Backend)
**Priority:** P2
**Dependencies:** Sub-Issue 1
**Estimate:** ~1.5 days

**What to build:**

1. **GameRoom.ts** — New `tickGameEndConditions()` added to simulation loop (after combat, before fog-of-war):

   ```
   Elimination check (every 10 ticks, not every tick):
   - For each non-eliminated human player:
     - Count tiles where ownerID === player.id AND !isHQTerritory
     - If count === 0 AND player has no living pawns → mark eliminated
     - Broadcast PLAYER_ELIMINATED to all clients
     - Log to game_log

   Victory check (after elimination):
   - Count non-eliminated human players
   - If exactly 1 remains → that player wins (LastStanding)
   - If 0 remain (simultaneous elimination) → highest score wins

   Time limit check:
   - If roundTimer > 0: decrement each tick
   - If roundTimer hits 0: highest-score non-eliminated player wins (TimeUp)
   ```

2. **GameRoom.ts** — New `endGame(winnerId, reason)` method:
   ```
   - Set state.roundPhase = "ended"
   - Set state.winnerId = winnerId
   - Set state.endReason = reason
   - Build finalScores array from all players
   - Broadcast GAME_ENDED to all clients
   - Notify lobby via LobbyBridge.notifyGameEnded()
   - Stop simulation interval (clearInterval or skip ticks)
   - Set auto-dispose timer (60 seconds — give clients time to see results)
   ```

3. **GameRoom.ts** — Gate actions behind game phase:
   ```
   In handleSpawnPawn, handlePlaceBuilding, handleUpgradeOutpost:
   - If state.roundPhase !== "playing" → reject with error message
   - If player.isEliminated → reject with error message
   ```

4. **GameRoom.ts** — Initialize round timer from options:
   ```
   In onCreate(options):
   - state.roundTimer = (options.gameDuration || 10) * 60 * TICK_RATE
   - If gameDuration === 0: state.roundTimer = -1 (no limit)
   ```

5. **LobbyRoom.ts** — Pass `gameDuration` through to GameRoom options in `handleCreateGame`.

**Key files to modify:** `server/src/rooms/GameRoom.ts`, `server/src/rooms/LobbyRoom.ts`
**Key files to read:** `server/src/rooms/combat.ts` (elimination check pattern), `shared/src/constants.ts` (tick rates)

**Definition of done:**
- Solo game with timer: game ends at 0, player wins if alive
- 2-player game: eliminate opponent → victory
- 2-player game with timer: timer expires → highest score wins
- Actions rejected after game ends
- Eliminated players can't act
- Lobby shows game as ended
- All existing tests pass + new unit tests for endGame logic

---

### Sub-Issue 3: End-Game UI & Return to Lobby

**Title:** `[#161] Build end-game results screen and lobby return flow`
**Owner:** Gately (Game Dev/UI)
**Priority:** P3
**Dependencies:** Sub-Issues 1, 2
**Estimate:** ~1 day

**What to build:**

1. **client/src/ui/EndGameScreen.ts** — New DOM overlay (follows HudDOM pattern):
   ```
   - Full-screen semi-transparent overlay (z-index above game)
   - Victory banner ("VICTORY!") or defeat banner ("DEFEATED")
   - Winner name and reason (e.g., "Last player standing" / "Highest score — time expired")
   - Final scoreboard table: rank, name, score, territory count
   - Highlight current player's row
   - "Return to Lobby" button
   - Auto-dismiss timer (60s countdown matching server dispose)
   ```

2. **client/src/main.ts** — Handle GAME_ENDED message:
   ```
   room.onMessage(GAME_ENDED, (payload: GameEndedPayload) => {
     const isWinner = payload.winnerId === currentPlayerId
     endGameScreen.show(isWinner, payload)
   })
   ```

3. **client/src/main.ts** — Handle PLAYER_ELIMINATED message:
   ```
   room.onMessage(PLAYER_ELIMINATED, (payload) => {
     if (payload.playerId === currentPlayerId) {
       // Show "You have been eliminated" notification in game log
       // Optionally dim/grey the game view
     }
   })
   ```

4. **client/src/main.ts** — "Return to Lobby" flow:
   ```
   endGameScreen.onReturnToLobby(() => {
     leaveGame()                    // Disconnect from GameRoom
     endGameScreen.hide()
     setGameUIVisible(false)
     connectToLobbyAndShow()        // Reconnect to lobby
   })
   ```

5. **client/src/main.ts** — Handle server-side disposal:
   ```
   If GameRoom disconnects (onLeave with non-consent code) while game ended:
   - Auto-return to lobby (same flow as above)
   ```

**Styling:** Match existing HUD DOM panel style (dark background, light text, consistent with side panel). Minimal CSS — functional, not fancy.

**Definition of done:**
- Victory screen shows on win with correct stats
- Defeat screen shows on loss
- Return to Lobby button works (disconnects, reconnects to lobby)
- Eliminated player sees notification
- Auto-return to lobby when server disposes room

---

### Sub-Issue 4: Round Timer HUD Display

**Title:** `[#161] Display round timer countdown in game HUD`
**Owner:** Gately (Game Dev/UI)
**Priority:** P3 (can be done in parallel with Sub-Issue 2)
**Dependencies:** Sub-Issue 1 (schema fields only)
**Estimate:** ~0.5 day

**What to build:**

1. **client/src/ui/HudDOM.ts** — Add timer display:
   ```
   - New element in HUD panel showing remaining time (MM:SS format)
   - Reads from state.roundTimer (convert ticks to seconds: roundTimer / TICK_RATE)
   - Hidden when roundTimer === -1 (no limit)
   - Flash/highlight when < 60 seconds remaining
   - Show "∞" or hide entirely for unlimited games
   ```

2. **client/src/ui/HudDOM.ts** — Update on state change:
   ```
   - Listen to state.roundTimer changes
   - Update display each tick (or throttle to 1/sec for performance)
   ```

**Definition of done:**
- Timer visible during timed games
- Timer hidden during unlimited games
- Timer counts down correctly
- Visual urgency indicator under 60 seconds

---

### Sub-Issue 5: Game Lifecycle Integration Tests

**Title:** `[#161] Integration tests for game lifecycle: start → play → win/loss → end → lobby`
**Owner:** Steeply (Tester)
**Priority:** P4
**Dependencies:** Sub-Issues 2, 3
**Estimate:** ~1 day

**What to build:**

1. **Unit tests** (server-side, Vitest):
   - `tickGameEndConditions()` correctly detects elimination
   - `tickGameEndConditions()` correctly detects last-standing victory
   - `tickGameEndConditions()` correctly handles time-up with score comparison
   - `endGame()` sets correct state fields
   - `endGame()` broadcasts GAME_ENDED message
   - Actions rejected when `roundPhase === "ended"`
   - Actions rejected for eliminated players
   - Round timer decrements correctly
   - Edge case: simultaneous elimination → highest score wins
   - Edge case: all players leave → game disposes cleanly

2. **Integration tests** (E2E or server-integration):
   - Full lifecycle: create game → start → eliminate opponent → victory screen
   - Timer game: create timed game → timer expires → highest score wins
   - Lobby return: after game ends → player returns to lobby → can create new game
   - Lobby state: ended game no longer appears in lobby game list (or appears as "ended")

**Test file locations:** Follow existing patterns in `server/src/rooms/__tests__/` and `e2e/`

**Definition of done:**
- All new tests pass
- All existing tests still pass
- Coverage for happy paths and edge cases listed above

---

## Dependency Graph

```
Sub-Issue 1 (Schema)
    ├──→ Sub-Issue 2 (Win/Loss Engine)
    │        └──→ Sub-Issue 3 (End-Game UI)
    │                 └──→ Sub-Issue 5 (Tests)
    └──→ Sub-Issue 4 (Timer HUD) ──→ Sub-Issue 5 (Tests)
```

## Priority Order

| Order | Sub-Issue | Owner | Blocked By |
|-------|-----------|-------|------------|
| 1 | Schema & Messages | Pemulis | — |
| 2 | Win/Loss Engine | Pemulis | #1 |
| 3 | Timer HUD | Gately | #1 (can parallel with #2) |
| 4 | End-Game UI | Gately | #1, #2 |
| 5 | Integration Tests | Steeply | #2, #3, #4 |

**Critical path:** 1 → 2 → 4 → 5 (~4 days)
**Parallel track:** 1 → 3 (Gately starts timer HUD while Pemulis builds engine)

## Scope Fence

**Explicitly deferred (do NOT build):**
- Matchmaking / ranked play / ELO ratings
- Spectator mode for eliminated players
- Game replays or history
- Achievement system
- Leaderboard persistence across games
- Multiple game modes (capture the flag, king of the hill, etc.)
- Pre-game phase inside GameRoom (lobby handles this)
- Surrender button (can be added later trivially)
- Configurable victory conditions per game (v1 = score + elimination, always)

**Future considerations (noted, not planned):**
- Surrender button (trivial: send message → mark eliminated → check victory)
- Post-game stats persistence (needs DB schema, separate issue)
- Game mode selection in lobby (needs UI + server routing, separate epic)
# Lobby Improvements — Decomposition

**Author:** Hal  
**Date:** 2026-03-16  
**Requested by:** dkirby-ms  
**Status:** Scoped, ready for implementation

---

## Problem Statement

The lobby flow skips the "waiting" phase entirely. When a player creates a game, the GameRoom is spawned immediately and simulation starts ticking — there is never a window for other players to discover, browse, or join a game before it begins. The game browser table exists and renders both "waiting" and "in_progress" statuses, but no game ever sits in "waiting" because room creation is instant.

The user wants:
1. A game browser where players can see waiting and in-progress games
2. The ability to join a game **before** it starts
3. A pre-game lobby showing players in the room and their ready state
4. A richer game creation experience

## What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `shared/src/lobbyTypes.ts` | ✅ Complete | Full message protocol (CREATE_GAME, JOIN_GAME, LEAVE_GAME, START_GAME, GAME_LIST, etc.), GameStatus type ("waiting" / "in_progress" / "ended"), GameSessionInfo, LobbyPlayerInfo |
| `server/src/rooms/LobbyRoom.ts` | ✅ Solid | Handles create/join/leave/start. Tracks games (MapSchema), players (MapSchema). Bridge for GameRoom lifecycle events. START_GAME handler exists but game is already running by the time it's called. |
| `server/src/rooms/LobbyState.ts` | ✅ Complete | LobbyGameEntry (id, name, host, status, playerCount, maxPlayers, mapSize, gameDuration), LobbyPlayer (displayName, userId, isGuest, activeGameId) |
| `server/src/rooms/LobbyBridge.ts` | ✅ Complete | EventEmitter for GameRoom → LobbyRoom (player_count_changed, game_ended) |
| `client/src/ui/LobbyScreen.ts` | ✅ Functional | DOM-based game list table with Join buttons for waiting games, Create Game form (name, max players, map size, CPU count), status icons (🟢 waiting, 🔵 in-progress), sorted waiting-first |
| `client/src/network.ts` | ✅ Complete | connectToLobby(), joinGameRoom(), reconnection logic |
| `client/src/main.ts` | ✅ Functional | Lobby → game transition. Both join_game and game_started events immediately call joinGameRoom() |

## What's Missing

1. **Deferred GameRoom creation** — `handleCreateGame` calls `matchMaker.createRoom()` immediately. Must defer until START_GAME.
2. **Pre-game player tracking** — No server-side list of which players are in a waiting game (only playerCount, no identity).
3. **Ready state** — No concept of player readiness. No SET_READY message, no ready tracking.
4. **Pre-game player list broadcast** — No message type to push player list updates to waiting room participants.
5. **Waiting room UI** — Client has no screen between "join" and "play". The join_game event immediately transitions to game.
6. **Game browser filtering** — No filter/tabs for "Waiting" vs "In Progress" games (both render, but no way to filter).

## Decomposition

### Issue 1: Backend — Pre-game waiting phase with deferred room creation
**Owner:** Pemulis  
**Estimated effort:** 2–3 days  
**Dependencies:** None (foundation issue)

**Scope:**
- **Shared types** (`shared/src/lobbyTypes.ts`):
  - Add `SET_READY` message constant
  - Add `GAME_PLAYERS` message constant (server → client: player list updates for a waiting game)
  - Add `PreGamePlayerInfo` interface: `{ userId, displayName, isReady }`
  - Add `GamePlayersPayload` interface: `{ gameId, players: PreGamePlayerInfo[] }`
  - Add `SetReadyPayload` interface: `{ ready: boolean }`

- **LobbyState** (`server/src/rooms/LobbyState.ts`):
  - Add `LobbyWaitingPlayer` schema class: `{ userId, displayName, isReady }` — nested in a per-game collection
  - Or: track waiting players server-side only (not in Colyseus schema) and broadcast via messages. **Recommended: message-based** — avoids schema bloat, keeps LobbyState lean.

- **LobbyRoom** (`server/src/rooms/LobbyRoom.ts`):
  - `handleCreateGame`: Do NOT call `matchMaker.createRoom()`. Create LobbyGameEntry in "waiting" status only. Track creator in a per-game player map. Send `GAME_JOINED` with `gameId` (no `roomId` yet — client uses this to show waiting room). Broadcast `GAME_UPDATED` to all lobby clients.
  - `handleJoinGame`: Add joiner to per-game player map. Broadcast `GAME_PLAYERS` to all players in that game. Broadcast `GAME_UPDATED` (playerCount change) to all lobby clients.
  - `handleLeaveGame`: Remove player from per-game player map. If host leaves and no players remain, remove the game. Broadcast `GAME_PLAYERS` and `GAME_UPDATED`.
  - New `handleSetReady`: Toggle isReady for a player in a waiting game. Broadcast `GAME_PLAYERS`.
  - `handleStartGame`: NOW call `matchMaker.createRoom()`. On success, send `GAME_STARTED` with `{ gameId, roomId }` to all players in the game. Transition status to "in_progress". Clean up per-game player map.
  - Add `SET_READY` message handler registration.
  - Private `waitingPlayers` map: `Map<gameId, Map<sessionId, PreGamePlayerInfo>>`.

- **GameJoinedPayload** update: `roomId` becomes optional (undefined during waiting phase, present only when game actually starts).

**Out of scope:** Any GameRoom.ts changes. The GameRoom keeps its current behavior — it starts simulation on create. The change is that create is deferred.

**Risks:** Race condition if host disconnects between START_GAME and room creation. Mitigation: wrap in try/catch, clean up on failure.

---

### Issue 2: Frontend — Pre-game waiting room UI
**Owner:** Gately  
**Estimated effort:** 2 days  
**Dependencies:** Issue 1 (needs GAME_PLAYERS message and deferred creation flow)

**Scope:**
- **New waiting room panel** (could be a new section in `LobbyScreen.ts` or a separate `WaitingRoom.ts`):
  - Shown when player receives `GAME_JOINED` (with no roomId) after creating or joining a waiting game
  - Displays: game name, game settings summary (map size, max players, CPU count, duration)
  - Player list: names + ready indicator (✅ / ⬜)
  - Host controls: "Start Game" button (enabled when at least 1 player, or optionally when all non-host players are ready)
  - Non-host controls: "Ready" / "Not Ready" toggle button
  - "Leave" button → sends LEAVE_GAME, returns to game browser
  - Listens for `GAME_PLAYERS` to update player list in real time
  - Listens for `GAME_STARTED` to transition: call `joinGameRoom(roomId)`, hide waiting room, show game

- **LobbyScreen updates:**
  - `onEvent` callback: distinguish between `GAME_JOINED` (waiting phase → show waiting room) vs `GAME_STARTED` (game phase → join GameRoom)
  - The `join_game` LobbyEvent should carry enough info to render the waiting room (game name, settings)

- **HTML/CSS additions** (`client/index.html`):
  - Waiting room container (hidden by default)
  - Player list element
  - Ready toggle button
  - Start Game button (host only)
  - Leave button

**Out of scope:** Chat in waiting room. Animated transitions. Settings editing after creation.

---

### Issue 3: Frontend — Game browser status filters
**Owner:** Gately  
**Estimated effort:** 0.5 day  
**Dependencies:** None (independent enhancement, but more useful after Issue 1 lands)

**Scope:**
- Add filter tabs or toggle buttons above the game list: **All** | **Waiting** | **In Progress**
- Default to "All" (current behavior)
- Filter `renderGameList()` output based on selected tab
- Persist filter selection in component state (not localStorage)
- Show count badges on tabs: e.g., "Waiting (3)" "In Progress (2)"
- Minor: Improve empty state text per filter ("No waiting games — create one!" vs "No games in progress")

**Out of scope:** Search by name. Sorting controls. Pagination.

---

### Issue 4: Tests — Pre-game lobby flow
**Owner:** Steeply  
**Estimated effort:** 1.5 days  
**Dependencies:** Issues 1 + 2 (needs both backend and frontend)

**Scope:**
- **Server unit tests** (extend `server/src/__tests__/game-lifecycle.test.ts` or new file):
  - Create game → verify LobbyGameEntry in "waiting", no GameRoom created
  - Join waiting game → verify player added, GAME_PLAYERS broadcast
  - Set ready → verify ready state updated, GAME_PLAYERS broadcast
  - Start game → verify GameRoom created, GAME_STARTED sent, status transitions to "in_progress"
  - Leave waiting game → verify player removed, game removed if host + empty
  - Reject: join full game, join started game, non-host start, start without game
  - Edge case: host disconnects from waiting game

- **Client integration tests** (if existing test infrastructure supports):
  - Waiting room renders on GAME_JOINED (no roomId)
  - Player list updates on GAME_PLAYERS
  - Ready toggle sends SET_READY
  - Start button visible only to host
  - Transition to game on GAME_STARTED

**Out of scope:** E2E multi-browser tests. Performance/load testing.

---

## Dependency Graph

```
Issue 1 (Backend: pre-game phase)
  │
  ├──► Issue 2 (Frontend: waiting room)  ──┐
  │                                         ├──► Issue 4 (Tests)
  └──► Issue 3 (Frontend: browser filters) ─┘
                                           (independent, parallelizable)
```

Issue 3 is fully independent — can ship before, during, or after the others.
Issues 1 and 2 are sequential (2 depends on 1).
Issue 4 depends on both 1 and 2.

## Explicit Scope Fence

**In scope:**
- Game browser showing waiting + in-progress games with filtering
- Join flow for games that haven't started
- Pre-game waiting room with player list and ready states
- Host-controlled game start

**Out of scope (do NOT implement):**
- Matchmaking or auto-join
- Ranked play or ELO
- Spectator mode
- Chat in waiting room (use existing in-game chat)
- Game settings editing after creation
- Password-protected games
- Kick/ban in waiting room
- Map preview in waiting room
- Team assignment / color selection pre-game

## Architecture Decisions

**L1: Message-based player tracking (not schema)**  
Track waiting room players via server-side Map + GAME_PLAYERS broadcasts, not Colyseus schema fields. Keeps LobbyState lean. Schema changes are expensive to migrate.

**L2: Deferred room creation (not paused simulation)**  
Don't create the GameRoom until START_GAME. Simpler than adding a pause/resume phase to GameRoom. GameRoom remains unchanged.

**L3: Ready state is advisory**  
The host can start regardless of ready states. Ready indicators help coordination but don't gate the start button. Keeps UX simple — no griefing via "never ready" players.

**L4: GAME_JOINED payload change**  
`roomId` becomes optional in GameJoinedPayload. Presence of `roomId` distinguishes "you're in the waiting room" (no roomId) from legacy/future direct-join flows.

---


---

## Deferred Room Creation for Lobby Waiting Phase

**Author:** Pemulis
**Date:** 2026-03-15
**Status:** Implemented

### Decision

`matchMaker.createRoom()` is no longer called in `handleCreateGame`. Game creation stores configuration in a `pendingGameOptions` map and tracks players in a `waitingPlayers` map. The Colyseus GameRoom is only instantiated when the host sends `START_GAME`.

### Rationale

Previously, creating a game immediately spawned a GameRoom, meaning games could never sit in "waiting" status for other players to discover and join. Deferring room creation allows a true pre-game lobby phase where players gather, see each other's names, and toggle ready status before the simulation starts.

### Impact

- **Shared types:** `GameJoinedPayload.roomId` is now optional (`string | undefined`). Client code must handle the undefined case — Gately's client PR will address this.
- **New messages:** `SET_READY` (client→server), `GAME_PLAYERS` (server→client). Both use message-based communication, not Colyseus schema, keeping `LobbyState` lean.
- **Player tracking:** `waitingPlayers` is a `Map<gameId, Map<sessionId, PreGamePlayerInfo>>`. Cleaned up on game start or removal.
- **GameRoom unchanged:** No modifications to GameRoom.ts. It still receives the same options on creation.
- **Ready state is advisory:** Host can start the game regardless of player ready states.

---

## CPU Players Participate in Elimination & Victory

**Author:** Pemulis  
**Date:** 2026-03-16  
**Status:** Implemented  

### Context
In 1-human + N-CPU games, four interrelated bugs caused immediate game-over:
1. Victory condition only counted human players → 1 human always = "last standing"
2. No grace period → players eliminated before spawning pawns (~2.5s after start)
3. CPU players were immune to elimination (immortal)
4. `getHighestScorePlayer` excluded CPUs from tiebreaker

### Decision
- **CPU players are full participants** in elimination and victory checks — same rules as humans.
- **Elimination grace period of 40 ticks (~10 seconds)** added via `ELIMINATION_GRACE_TICKS` constant. No elimination checks run before this threshold.
- **`getHighestScorePlayer` is player-type-agnostic** — a CPU can win if it has the highest score.

### Impact
- **Gately:** End-game UI should handle CPU winners (display name will be the CPU's `displayName`).
- **Steeply:** Game lifecycle tests updated. Grace period constant must be mirrored in tests as `ELIMINATION_GRACE_TICKS = 40`.
- **Hal:** If CPU AI complexity changes, the grace period may need tuning.

---

## Game-End Condition Test Coverage

**Author:** Steeply  
**Date:** 2026-03-15  
**Status:** Tests landed

### Decision

Added 6 tests for the CPU-inclusion and grace period game-end fixes. All tests use `room.state.tick = ELIMINATION_GRACE_TICKS` (40) to bypass grace period and hit elimination check interval. Tests are forward-compatible — they document the NEW behavior where CPU players participate in elimination/victory logic.

### Note for team

The existing test "does NOT eliminate CPU players" (line ~208) still passes because it sets tick=10 (within grace period), so elimination never fires. This test now documents **grace period behavior** rather than CPU-skip behavior. If the team wants to explicitly remove or rename that test to avoid confusion, that's a cleanup task.

### Coverage added

1. Single human + CPUs with territory → game continues
2. Human eliminated, CPUs alive → game continues
3. CPU with 0 tiles/pawns → eliminated
4. Grace period blocks elimination at tick 10, allows at tick 40
5. CPU can be the winner (LastStanding)
6. Human wins after all CPUs eliminated

---

## Lobby Host-Leave Gap (Observed in Testing)

**Author:** Steeply
**Date:** 2026-03-15
**Status:** Observation — No Code Change

When the host leaves a waiting game that still has other players, the game persists in "waiting" status but nobody can start it (only the original host can call START_GAME). The remaining players are stranded — they can leave, but cannot start.

Options for Pemulis/Hal to consider:
1. Transfer host role to next player
2. Cancel the game and notify remaining players
3. Leave as-is (players can leave and re-create)

No tests were blocked by this — just flagging the behavioral gap.
