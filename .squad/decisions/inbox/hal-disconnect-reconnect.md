# Decision: Reconnection on Disconnect (Grace Period)

**By:** Hal (Lead)
**Date:** 2026-03-10
**Status:** PROPOSED
**Issue:** Player refresh or network drop destroys all game state — territory, creatures, structures gone. Player dumped to lobby as a new player.

---

## Approach

Use Colyseus's built-in reconnection API (`allowReconnection()` server, `client.reconnect()` client). No custom plumbing — the framework handles session identity, state re-sync, and token management.

**Grace period: 60 seconds.** Long enough for a browser refresh, brief wifi drop, or laptop lid close. Short enough that abandoned slots don't linger. Configurable via constant for UAT tuning.

**Core insight:** Territory, creatures, and structures are already NOT cleaned up on disconnect (no removal code exists). We only need to stop deleting the player from `state.players` and stop tearing down their fog-of-war view during the grace period. The framework does the rest.

---

## What Happens During Grace Period

| Aspect | During Grace Period | On Timeout |
|---|---|---|
| Player in `state.players` | **Stays** (no delete) | Removed |
| Territory tiles | **Preserved** (already persist) | Preserved (no cleanup exists — separate issue) |
| Creatures | **Preserved** (already persist) | Preserved (no cleanup exists — separate issue) |
| Fog of war view | **Cleaned up** (no consumer) | Already cleaned |
| `sessionUserMap` | **Stays** (auto-save continues) | Removed |
| Lobby player count | **Stays** (slot reserved) | Decremented |
| Auto-save (30s tick) | **Continues** for this player | Stops |

**On reconnect success:** Re-initialize fog of war via `initPlayerView()`. Broadcast "PlayerName has reconnected" game log. Everything else is already in place.

---

## Server Changes

### File: `server/src/rooms/GameRoom.ts`

**1. Add reconnection constant (top of file, near AUTO_SAVE_INTERVAL_TICKS):**

```typescript
/** Grace period (seconds) for reconnection after non-consented disconnect. */
const RECONNECT_GRACE_SECONDS = 60;
```

**2. Restructure `onLeave()` to use `allowReconnection()`:**

Replace the current `onLeave()` (lines ~203–230) with:

```typescript
override async onLeave(client: Client, code: number) {
  const consented = code === CloseCode.CONSENTED;
  console.log(`[GameRoom] Client left: ${client.sessionId} (consented: ${consented})`);

  if (!consented) {
    try {
      // Clean up fog of war view immediately — no consumer during disconnect
      this.cleanupPlayerView(client.sessionId);

      // Hold the slot — player, territory, creatures, sessionUserMap all stay
      await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);

      // --- Client reconnected ---
      const player = this.state.players.get(client.sessionId);
      if (player) {
        const devMode = false; // reconnect always gets normal mode
        this.initPlayerView(client, player, devMode);
        client.send("game_log", { message: "Reconnected!", type: "info" });
        this.broadcast("game_log", {
          message: `${player.displayName || "A player"} reconnected`,
          type: "info",
        }, { except: client });
      }
      console.log(`[GameRoom] Client reconnected: ${client.sessionId}`);
      return;

    } catch {
      // Grace period expired or room disposing — fall through to cleanup
      console.log(`[GameRoom] Reconnection expired for ${client.sessionId}`);
    }
  }

  // --- Consented leave or grace period expired: full cleanup ---
  this.saveAndRemovePlayer(client);
}
```

**3. Extract cleanup into `saveAndRemovePlayer()` (new private method):**

```typescript
private saveAndRemovePlayer(client: Client): void {
  const userId = this.sessionUserMap?.get(client.sessionId);
  const player = this.state.players.get(client.sessionId);

  // Persist state before removal
  if (userId && player && this.playerStateRepo) {
    const serialized = serializePlayerState(player);
    const displayName = player.displayName;
    const repo = this.playerStateRepo;
    void repo.save(userId, displayName, serialized).catch((err: unknown) => {
      console.error(`[GameRoom] Failed to save state for ${client.sessionId}:`, err);
    });
  }

  // Clean up fog of war (idempotent — may already be cleaned in grace period path)
  this.cleanupPlayerView(client.sessionId);

  this.state.players.delete(client.sessionId);
  this.sessionUserMap?.delete(client.sessionId);

  if (this.gameId) {
    this.lobbyBridge?.notifyPlayerCountChanged(this.gameId, this.state.players.size);
  }
}
```

**4. Fix multi-tab guard for "close tab then reopen" scenario:**

In `onJoin()`, where the multi-tab guard loops over `sessionUserMap` (lines ~116–122), add a check: if the existing session's player is disconnected (in grace period), allow the new join and evict the old session.

```typescript
// Inside the existing userId duplicate check loop:
for (const [existingSessionId, existingUserId] of this.sessionUserMap) {
  if (existingUserId === authUser.id) {
    // If old session is in reconnection grace period, evict it
    const existingClient = this.clients.find(c => c.sessionId === existingSessionId);
    if (!existingClient) {
      // Client object not in active clients — they're disconnected, evict
      this.saveAndRemovePlayer({ sessionId: existingSessionId } as Client);
      break;
    }
    // Active duplicate — reject
    client.send("game_log", { message: "You are already in this game from another tab.", type: "error" });
    client.leave(4001);
    return;
  }
}
```

**No other server files change.**

---

## Client Changes

### File: `client/src/network.ts`

**1. Store reconnection token after joining game room:**

```typescript
const RECONNECT_TOKEN_KEY = 'primal-grid-reconnect-token';

// In joinGameRoom(), after successful join:
gameRoom = await client.joinById(roomId, joinOptions);
try {
  sessionStorage.setItem(RECONNECT_TOKEN_KEY, gameRoom.reconnectionToken);
} catch { /* sessionStorage may be unavailable */ }
```

Using `sessionStorage` (not `localStorage`): token is tab-scoped, survives refresh, dies on tab close. This is the correct semantic — closing the tab is a consented leave.

**2. Add reconnection function:**

```typescript
export async function reconnectGameRoom(): Promise<Room | null> {
  const token = sessionStorage.getItem(RECONNECT_TOKEN_KEY);
  if (!token) return null;

  const client = getClient();
  statusCallback?.('reconnecting');

  const MAX_ATTEMPTS = 5;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      gameRoom = await client.reconnect(token);
      console.log('[network] Reconnected to game room:', gameRoom.roomId);

      // Re-store fresh token (Colyseus may rotate it)
      try {
        sessionStorage.setItem(RECONNECT_TOKEN_KEY, gameRoom.reconnectionToken);
      } catch { /* ignore */ }

      // Re-attach onLeave/onError handlers
      gameRoom.onLeave((code) => {
        console.log('[network] Left game room, code:', code);
        if (code === 1000 || code === 4000) {
          // Consented leave — go to lobby
          statusCallback?.('disconnected');
          gameRoom = null;
          clearReconnectToken();
        } else {
          // Non-consented — attempt reconnection
          statusCallback?.('reconnecting');
          gameRoom = null;
          void reconnectGameRoom();
        }
      });

      gameRoom.onError((code, message) => {
        console.error('[network] Game room error:', code, message);
        statusCallback?.('error');
      });

      statusCallback?.('connected');
      return gameRoom;
    } catch (err) {
      console.warn(`[network] Reconnect attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt)); // 1s, 2s, 4s, 8s, 16s
      }
    }
  }

  // All attempts failed — clear token, go to lobby
  console.error('[network] Reconnection failed after all attempts');
  clearReconnectToken();
  statusCallback?.('disconnected');
  return null;
}

function clearReconnectToken(): void {
  try { sessionStorage.removeItem(RECONNECT_TOKEN_KEY); } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**3. Update `joinGameRoom()` onLeave handler to trigger reconnection instead of immediate lobby return:**

Replace the current `gameRoom.onLeave(() => { ... })` (lines ~198–202) with the same reconnection-aware handler from step 2. Extract the handler to avoid duplication:

```typescript
function attachGameRoomHandlers(room: Room): void {
  room.onLeave((code) => {
    console.log('[network] Left game room, code:', code);
    const consented = code === 1000 || code === 4000;
    if (consented) {
      statusCallback?.('disconnected');
      gameRoom = null;
      clearReconnectToken();
    } else {
      statusCallback?.('reconnecting');
      gameRoom = null;
      void reconnectGameRoom();
    }
  });

  room.onError((code, message) => {
    console.error('[network] Game room error:', code, message);
    statusCallback?.('error');
  });
}
```

**4. Export `reconnectGameRoom` for use in main.ts.**

### File: `client/src/network.ts` (type export)

**5. Add `'reconnecting'` to `ConnectionStatus` type:**

```typescript
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
```

### File: `client/src/ui/ConnectionStatus.ts`

**6. Add reconnecting state to UI:**

```typescript
const LABELS: Record<Status, string> = {
  connecting: '⏳ Connecting…',
  connected: '✅ Connected',
  disconnected: '❌ Disconnected',
  reconnecting: '🔄 Reconnecting…',
  error: '⚠️ Error',
};

const COLORS: Record<Status, string> = {
  connecting: '#f1c40f',
  connected: '#2ecc71',
  disconnected: '#e74c3c',
  reconnecting: '#f39c12',
  error: '#e67e22',
};
```

### File: `client/src/main.ts`

**7. Don't tear down the game session on non-consented leave:**

The current `room.onLeave()` in `setupGameSession()` (lines ~184–204) unconditionally tears down all game UI and returns to lobby. This must become conditional:

- **If reconnecting:** Show the reconnecting overlay, but do NOT tear down game renderers. The game world should stay visible (frozen) behind the overlay so the player sees continuity when they reconnect.
- **If reconnection fails or consented leave:** Then tear down and return to lobby.

This requires `setupGameSession()` to listen for the `'reconnecting'` and `'disconnected'` status transitions rather than using `room.onLeave()` directly. The network layer handles reconnection; main.ts only needs to react to final outcomes.

Suggested approach: have `setupGameSession()` subscribe to `onConnectionStatus()` and only tear down on `'disconnected'` (final). The `'reconnecting'` state leaves the game UI intact.

---

## What We Are NOT Doing

- **No territory cleanup on disconnect.** Territory already persists — fixing that is a separate issue (and desirable for reconnection). When we do add territory cleanup, it runs after grace period expiry, not during.
- **No creature pausing.** Creatures continue AI behavior during the 60s grace period. The player's pawns keep doing what they were doing. This is fine — the world is alive.
- **No event queuing.** We don't buffer game_log messages or chat during disconnect. The player misses what happened in those 60 seconds. Colyseus state sync handles the rest.
- **No cross-session reconnection.** If the room is disposed (game ends), reconnection fails and the player goes to lobby. No persistence of room identity across server restarts.
- **No localStorage for reconnect token.** sessionStorage is intentional — closing the tab should not hold a ghost slot for 60 seconds.
- **No reconnection for lobby room.** Lobby is stateless from the player's perspective — a fresh join is fine.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Browser refresh (F5) | sessionStorage preserved → auto-reconnect within 60s |
| Tab close + reopen | sessionStorage lost → fresh join via lobby. Multi-tab guard updated to evict grace-period ghosts. |
| Network drop (wifi) | Client detects disconnect → auto-reconnect with backoff |
| Game ends during grace period | `allowReconnection()` rejects (room disposing) → cleanup runs → client reconnect fails → lobby |
| Server restart | Room gone → client reconnect fails → lobby |
| Player clicks "Leave Game" button | Consented leave (code 1000/4000) → no grace period, immediate cleanup |
| Multi-tab: same user opens second tab | Multi-tab guard rejects second tab (existing session active) |
| Close tab, open new tab fast | Old session in grace period → multi-tab guard evicts ghost → new join succeeds |

---

## Assignment

### Pemulis (Server)
1. Add `RECONNECT_GRACE_SECONDS` constant
2. Restructure `onLeave()` with `allowReconnection()` and extract `saveAndRemovePlayer()`
3. Update multi-tab guard in `onJoin()` to evict disconnected sessions
4. Add server-side tests: grace period holds player, timeout cleans up, consented leave bypasses

### Gately (Client)
1. Add `'reconnecting'` to `ConnectionStatus` type and UI
2. Store/clear reconnection token in sessionStorage
3. Implement `reconnectGameRoom()` with exponential backoff
4. Update `joinGameRoom()` onLeave handler to use reconnection-aware logic
5. Update `setupGameSession()` to not tear down game UI during reconnection

### Steeply (QA)
1. E2E test: refresh browser mid-game → player state preserved
2. E2E test: consented leave → immediate cleanup, no reconnection
3. Manual test: network throttle / disconnect scenarios in UAT

---

## Implementation Order

1. **Server first** (Pemulis): `allowReconnection()` in `onLeave()` — this is safe to ship alone. Without client changes, the server just holds state for 60s then cleans up as before. No behavior change for current clients.
2. **Client second** (Gately): reconnection logic + UI. Once shipped, reconnection works end-to-end.
3. **QA third** (Steeply): verify the full flow.

Server and client work can proceed in parallel — server changes are backward-compatible.
