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
