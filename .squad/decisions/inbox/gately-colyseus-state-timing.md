# Decision: Never access room.state collections synchronously after joinOrCreate

**Date:** 2026-02-25
**Author:** Gately (Game Dev)
**Status:** Active

## Context

During Phase A UAT, the client crashed silently after a successful server connection. Root cause: Colyseus SDK 0.17 resolves `joinOrCreate` when `JOIN_ROOM` arrives, but the reflected schema initializes all fields to `undefined`. The actual `ROOM_STATE` data arrives later as a separate websocket message.

Accessing `room.state.players.get(sessionId)` synchronously after `await connect()` threw a TypeError because `players` was `undefined`.

## Decision

**All post-connect code that reads `room.state` collections must use `room.onStateChange.once()` or `room.onStateChange()` callbacks.** Never access `room.state.players`, `room.state.creatures`, `room.state.tiles`, etc. synchronously after `joinOrCreate` resolves.

## Implications

- Any future one-shot initialization that needs server state (camera centering, initial UI setup) must be deferred into an `onStateChange.once()` callback.
- The existing `bindToRoom()` pattern (registering `onStateChange` listeners) is already correct — callbacks only fire after state arrives.
- Catch blocks in network code should always capture and log the error object — never use bare `catch {}`.
