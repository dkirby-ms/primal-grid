# Execution Plan: Four-Issue Initiative (Issues #19, #30, #31, #42)

**Date:** 2026-03-06  
**Author:** Hal (Lead)  
**Status:** PLAN — Ready for execution approval  

---

## Summary

This plan triages four issues into a phased execution sequence. **Critical path: #42 (auth + persistence) gates #30 and #31.** Issue #19 (rendering polish) can run in parallel. Estimated total scope: **5–7 days with two tracks running in parallel.**

**Track A (Parallel):**
- Pemulis: #42 server (JWT + persistence) — 3d critical
- Gately: #19 (grid rendering) — 2d
- Gately: #42 client (login UI) — 1d (waits for Pemulis server)

**Track B (Sequential, waits for #42):**
- Pemulis: #31 (game log server content) — 1d
- Gately: #31 (game log UI) — 1d
- Pemulis + Gately: #30 (chat) — 2d total

---

## Issue Triage

### Issue #19: Soften Grid Appearance (Rendering Polish)

**Owner:** Gately  
**Scope:** GridRenderer updates only  
**Effort:** 2 days  
**Priority:** Medium (polish, not blocking)  
**Dependencies:** None  

**Work breakdown:**
1. Rounded tile corners (PixiJS Graphics corner radius)
2. Per-tile noise variation (vertex color offset, Simplex noise seed per tile)
3. Optional biome transition softening (gradient blend edges)

**Rationale:** Pure rendering work. Zero game logic. Can run in parallel without contention. Gately picks this up while Pemulis does auth server work.

**Definition of done:**
- Rounded corners on all tile edges
- Noise visible on texture (no flat color blocks)
- Biome edges soften (no harsh lines)
- All HUD elements still readable
- No performance regression (canvas still 60fps)

---

### Issue #42: User Persistence and OAuth Login (CRITICAL PATH)

**Owners:** Pemulis (server), Gately (client)  
**Scope:** Auth + persistence  
**Effort:** 4 days total (Pemulis 3d, Gately 1d)  
**Priority:** CRITICAL (blocks #30, #31)  
**Dependencies:** None  

**Server work (Pemulis, 3 days):**
1. **JWT token generation** (~4h)
   - Add `@types/jsonwebtoken`, `jsonwebtoken` to dependencies
   - Create `auth/tokenIssuer.ts` with `issueToken(playerID)` and `verifyToken(token)` functions
   - Token payload: `{ playerID, iat, exp (24h) }`
   - Verification middleware for room join
   
2. **Database schema for user persistence** (~4h)
   - Add `users` table: `(playerID, username, passwordHash, createdAt, lastPlayed)`
   - Add `game_saves` table: `(playerID, roomID, gameState (JSON), lastSaved, autosaveAt)`
   - Use bcrypt for password hashing (existing dependency)
   - Migration script to initialize schema

3. **Auto-save on disconnect** (~4h)
   - On room `onLeave`, capture full GameState → `game_saves.gameState`
   - On room join, check for existing save; restore if found
   - Timestamp auto-save to avoid race conditions

4. **Login/signup API endpoints** (~4h)
   - POST `/auth/signup` — username + password → hash → insert user → issue token
   - POST `/auth/login` — username + password → verify → issue token + return playerID
   - POST `/auth/guest` — generate anonymous playerID (no password) + issue token
   - All endpoints return JWT for client-side persistence

5. **Guest upgrade path** (~2h)
   - Guest players have `guest=true` flag in token
   - Upgrade endpoint: POST `/auth/upgrade` (existing token + username + password) → convert guest→full user
   - Preserve game state on upgrade

**Client work (Gately, 1 day, starts after Pemulis #42 server lands):**
1. **Login form UI** (~3h)
   - HTML form with username/password fields
   - Separate "Guest Play" button
   - POST to `/auth/login` or `/auth/guest`
   - Store JWT in `localStorage`
   - Redirect to game on success
   
2. **Token refresh and persistence** (~2h)
   - On app load, check `localStorage` for JWT
   - If valid, auto-reconnect to Colyseus room (pass JWT in room options)
   - If expired or missing, show login screen
   
3. **Guest-to-authenticated flow** (~1h)
   - Guest players see "Upgrade Account" button in settings
   - Opens upgrade form (new username/password)
   - POST to `/auth/upgrade` with current JWT
   - Reload and reconnect

**Rationale:** User persistence enables trust and replayability. JWT-based auth is simple, stateless, and scales. Entra ID can be swapped later (just replace token issuer). **This blocks #30 and #31 because chat/logs need to know who sent messages.**

**Definition of done:**
- Token generation and verification working end-to-end
- Users can sign up, log in, and play
- Guest players can upgrade to full accounts
- Game state auto-saved on disconnect
- Colyseus room validates token on join
- No plaintext passwords in logs
- Manual test: sign up → play → disconnect → log back in → same game state

---

### Issue #31: Game Log Content and Style (Deferred Until #42)

**Owners:** Pemulis (server), Gately (client)  
**Scope:** Client handler for game_log, styled overlay  
**Effort:** 2 days total (Pemulis 1d, Gately 1d)  
**Priority:** Medium  
**Dependencies:** **#42 (recommended to start after #42 server lands)**  
**Blocker note:** Not strictly blocked by #42, but benefits from user context in logs ("Player X built a structure"). Safe to parallelize once #42 server work is in progress.

**Server work (Pemulis, 1 day):**
1. **Game log message categories** (~2h)
   - Define log event types: `BUILD_STRUCTURE`, `HARVEST_RESOURCE`, `CREATURE_TAMED`, `TERRITORY_CLAIMED`, `PLAYER_JOINED`, `PLAYER_DISCONNECTED`
   - Each event captures: timestamp, playerID, message, category
   - Broadcast via Colyseus `room.broadcast("game_log", { ... })`
   - Add to existing GameRoom broadcast logic (should already have log support from design)

2. **Content filtering and timestamps** (~2h)
   - Include human-readable player names in log messages
   - Filter out sensitive/spam events (keep only interesting gameplay)
   - Ensure timestamps are server-side authoritative

**Client work (Gately, 1 day):**
1. **Register game_log handler** (~1h)
   - Add listener in `RoomUpdateHandler.ts`: `room.onMessage("game_log", (msg) => { ... })`
   - Store log entries in client state (array, max 50 entries to prevent memory bloat)
   - Emit event for UI to consume

2. **Styled log overlay** (~3h)
   - HTML panel (similar to HUD side panel from Phase 4.5)
   - Display last N messages with colors by category
   - Auto-scroll to newest
   - Optional: scroll lock / pause button
   - Optional: filter by category (build, creature, resource, etc.)

**Rationale:** Provides narrative feedback. Shows what's happening in the world without spammy notifications. Pairs well with auth (#42) to show player names in logs.

**Definition of done:**
- Server broadcasts game_log events on gameplay
- Client receives and stores messages
- Overlay displays last 50 messages with timestamps and categories
- No duplicate messages on reconnect
- Filter toggle works (optional)

---

### Issue #30: In-Game Chat (Deferred Until #42)

**Owners:** Gately (client), Pemulis (server)  
**Scope:** Chat UI + message protocol  
**Effort:** 2 days total (Gately 1d, Pemulis 1d)  
**Priority:** Medium  
**Dependencies:** **#42 (HARD BLOCKER — needs user context)**  
**Blocker note:** Cannot implement chat without knowing "who sent this message". JWT auth (#42) is required.

**Server work (Pemulis, 1 day, starts after #42 server lands):**
1. **Chat message protocol** (~2h)
   - New Colyseus message: `send("chat", { playerID, username, message, timestamp })`
   - Sanitize message: strip HTML, max 256 chars, check for spam (rate limit: 5 msgs/10s per player)
   - Broadcast to all players in room (or public/team-scoped channels if desired)

2. **Message persistence** (~2h)
   - Store chat messages in `chat_messages` table: `(playerID, roomID, message, createdAt)`
   - Retrieve last N messages on room rejoin (context for newcomers)
   - Optional: censor profanity (can defer to Phase 6)

**Client work (Gately, 1 day):**
1. **Chat overlay UI** (~2h)
   - Input field at bottom of screen (or side panel if space)
   - Message list above (scrollable, max 100 visible)
   - Color-code by player (cycle through 5–8 player colors)
   - Show username + timestamp for each message

2. **Input handler** (~1h)
   - Enter key sends message
   - Shift+Enter for newline (optional)
   - Clear field after send
   - Disable during mute/disconnect states

**Rationale:** Enables multiplayer communication and trading negotiation. Deferred until auth is working because without JWT we can't verify who sent each message (prevent spoofing).

**Definition of done:**
- Player can send and receive chat messages
- Messages persist across disconnect and rejoin
- No XSS vulnerabilities (HTML stripped)
- Rate limiting prevents spam
- Names and timestamps displayed
- No performance degradation

---

## Execution Sequence

### Phase 1: Critical Path Setup (Week 1, Days 1–3)

**Parallel tracks:**

**Track A — Auth Backend (Pemulis, 3 days):**
- Day 1: JWT token generation + verification middleware
- Day 2: Database schema, user model, signup/login endpoints
- Day 3: Auto-save and guest upgrade logic, testing

**Track B — Rendering Polish (Gately, 2 days):**
- Day 1–2: Rounded corners, noise variation, biome softening in GridRenderer

**Dependency gate:** Pemulis #42 server completes before Gately #42 client starts.

### Phase 2: Auth Client + Prep Work (Week 1, Day 4)

**Gately:** Login form UI + token persistence (~1 day)
- Cannot start until Pemulis #42 server is deployed to test environment
- Parallel: Review #31 and #30 server requirements with Pemulis

**Pemulis:** Game log categorization + chat protocol design (~1 day)
- Begin work on #31 and #30 logic (can design without client ready)

### Phase 3: Game Features (Week 2, Days 1–2)

**Sequential blocks:**

1. **Game Log** (Pemulis 1d + Gately 1d):
   - Pemulis: Broadcast game_log events
   - Gately: Log overlay UI + message display

2. **Chat** (Pemulis 1d + Gately 1d):
   - Pemulis: Chat message protocol + sanitization
   - Gately: Chat UI + input handler

---

## Critical Dependencies

```
Issue #42 (auth + persistence)
├── [blocks] Issue #31 (game log client needs user context)
├── [blocks] Issue #30 (chat hard-blocks on auth)
└── [enables] Issue #19 (runs parallel, not blocked)
```

**Key constraint:** Gately is currently finishing Phase 4.5 HUD redesign (PR pending merge). **Assume Gately is free to pick up #19 after Phase 4.5 lands.**

---

## Team Allocation

| Member | Days 1–3 | Day 4 | Week 2 | Notes |
|--------|----------|-------|--------|-------|
| **Pemulis** | #42 server (3d) | #31 design | #31 server (1d), #30 server (1d) | Critical path — starts immediately |
| **Gately** | #19 (2d) | #42 client (1d) | #31 UI (1d), #30 UI (1d) | Parallel with Pemulis phase 1; waits for #42 server |
| **Steeply** | — | Integration tests for #42 | E2E tests for #31, #30 | Blocks on completed features |
| **Marathe** | — | — | Monitor deploy | Test environment ready for auth testing |

---

## Risk Mitigation

**Risk: Gately blocked if Phase 4.5 PR doesn't merge quickly**  
→ Mitigation: Gately picks up #42 client work in parallel if Phase 4.5 stalls. #19 can slip to Week 2 without blocking anything.

**Risk: JWT token payload doesn't scale to future Entra ID**  
→ Mitigation: Design token issuer as pluggable module. Entra ID swap only requires replacing `tokenIssuer.ts`. No changes to room join or client storage logic.

**Risk: Chat/log messages leak player IDs or timestamps**  
→ Mitigation: Pemulis sanitizes all messages server-side. Client-side HTML stripping redundant but safe.

**Risk: Auto-save on disconnect causes lag**  
→ Mitigation: Async auto-save (don't block room close). If save fails, log error but don't disconnect player.

---

## Definition of Done (Initiative Level)

- [ ] #19 complete: Rounded corners, noise, biome transitions visible and performant
- [ ] #42 complete: E2E auth flow works; users can sign up, log in, auto-save/restore
- [ ] #31 complete: Game log displays with player names and event categories
- [ ] #30 complete: Chat sends/receives; no XSS, rate-limited, persists across disconnect
- [ ] All 4 issues merged to `dev` branch
- [ ] Manual UAT passed (sign up → play → trigger events → see logs/chat → disconnect → rejoin → same state)
- [ ] >400 tests passing (maintain or improve from current)

---

## Next Steps

1. **Pemulis:** Begin #42 server work immediately (JWT + DB schema)
2. **Gately:** Finish Phase 4.5 HUD PR, then pick up #19 (2 parallel days)
3. **Hal:** Monitor dependencies; unblock Gately on #42 client once server lands
4. **Steeply:** Prep E2E test suite for #42 auth flow and #31/#30 feature tests
5. **Scribe:** Log this plan to `.squad/orchestration-log/` with daily status updates

---

## Reference: Issue Links

- [#19: Soften grid appearance](https://github.com/dkirby-ms/primal-grid/issues/19)
- [#30: In-game chat](https://github.com/dkirby-ms/primal-grid/issues/30)
- [#31: Game log content and style](https://github.com/dkirby-ms/primal-grid/issues/31)
- [#42: User persistence and OAuth login](https://github.com/dkirby-ms/primal-grid/issues/42)
