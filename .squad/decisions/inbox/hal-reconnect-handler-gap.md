# Decision: Reconnect Handler Registration Gap

**Author:** Hal (Lead)  
**Date:** 2025-07-22  
**Context:** PR #103 / Issue #101 — Browser refresh drops user session  
**Status:** Proposed  

## Problem

After browser refresh, the reconnect succeeds at the transport level (server logs confirm "Client dropped" → "Client reconnected"), but the browser console shows:

```
@colyseus/sdk: onMessage() not registered for type 'game_log'
```

The user reports the session appears dropped despite successful reconnection.

## Root Cause Analysis

### The Handler Registration Gap

There is a race condition between the Colyseus SDK completing the reconnect and the client registering `onMessage` handlers. Here is the exact sequence:

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

This proves the `game_log` message arrives *during* the `client.reconnect()` call, before the Promise resolves — so even registering handlers immediately after `client.reconnect()` resolves (where `attachGameRoomHandlers` runs) would still be too late.

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

## Fix Options

### Option A: Server-Side Deferral (Simplest)

In `GameRoom.onReconnect()`, defer `game_log` sends by one server tick:

```typescript
override onReconnect(client: Client) {
  const player = this.state.players.get(client.sessionId);
  if (player) {
    const devMode = false;
    this.initPlayerView(client, player, devMode);
    // Defer game_log to allow client handlers to register
    this.clock.setTimeout(() => {
      client.send("game_log", { message: "Reconnected!", type: "info" });
      this.broadcast("game_log", {
        message: `${player.displayName || "A player"} reconnected`,
        type: "info",
      }, { except: client });
    }, 0);
  }
  console.log(`[GameRoom] Client reconnected: ${client.sessionId}`);
}
```

**Pros:** One-line change, fixes the immediate symptom.  
**Cons:** Band-aid — if other systems (combat, spawns) send `game_log` during the same tick, those are still missed. Fragile timing dependency.

### Option B: Client-Side Early Handler Registration (Robust)

Move `onMessage` handler registration into `attachGameRoomHandlers()` using a message buffer pattern:

1. `attachGameRoomHandlers()` registers `onMessage('game_log', ...)` and `onMessage('chat', ...)` that push to a buffer array.
2. Export a `flushMessageBuffer(handlers)` function.
3. `bindGameRoom()` calls `flushMessageBuffer()` to replay buffered messages and replace the buffer handlers with real UI handlers.

**Pros:** Catches all messages regardless of timing. Clean architecture.  
**Cons:** Still has the gap between `client.reconnect()` resolving and `attachGameRoomHandlers()` running. Messages arriving *during* `client.reconnect()` are still missed.

### Option C: Combined Fix (Recommended)

1. **Server:** Defer `game_log` in `onReconnect` by one tick (Option A) — eliminates the primary race.
2. **Client:** In `bindGameRoom()`, replace `r.onStateChange.once(...)` with an immediate check: if the player's state already exists, center the camera immediately instead of waiting for the next state change.
3. **Client:** Clean up duplicate handler registration — `bindGameRoom()` should remove previous `onMessage` listeners before adding new ones (or use a flag to skip re-registration on the same Room).

**Files changed:**
- `server/src/rooms/GameRoom.ts` — defer `game_log` in `onReconnect` (1 change)
- `client/src/main.ts` — fix `onStateChange.once` to handle pre-synced state; deduplicate handlers (2 changes)

## Recommendation

**Go with Option C (combined fix).** The server-side deferral eliminates the race condition for the most common case, and the client-side camera fix addresses the likely UX cause of "session appears dropped."

## Who Implements

**Pemulis and Gately are locked out** of this PR cycle (previous rejection).  
**Steeply** is the tester — not an implementer.  
**Marathe** (DevOps) and **Joelle** (DevRel) don't fit this domain.

**Recommended:** Route to **@copilot** (Coding Agent). This is a well-scoped bug fix across 2 files — squarely in @copilot's 🟢 capability zone. The fix has clear acceptance criteria:

1. No `onMessage() not registered` warning in console after browser refresh reconnect
2. Camera centers on player HQ immediately after reconnect
3. No duplicate `game_log` entries after in-session reconnects

Mark the PR as 🟡 **needs review** since it touches reconnect logic (a previously problematic area). Hal reviews before merge.

If @copilot is not auto-assignable or the user prefers hands-on, **dkirby-ms** can implement — the changes are surgical and well-specified above.

## Test Requirements (Steeply)

After the fix is implemented, Steeply should add:
1. **Server test:** Verify `game_log` is not sent synchronously in `onReconnect` (mock `client.send`, advance clock, then assert)
2. **Client test:** Verify `onMessage('game_log', ...)` doesn't fire duplicate handlers after re-bind
3. **Client test:** Verify camera centers immediately when state is pre-synced (bootstrap reconnect path)
