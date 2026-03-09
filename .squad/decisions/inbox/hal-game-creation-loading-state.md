# Game Creation Loading State

**By:** Hal (Lead)
**Date:** 2025-07-24
**Status:** ACCEPTED

## Decision: Client-Only Loading State

**Go with the client-only approach.** No server changes, no new shared types, no new game status.

### Why

The problem is that *the creator* has no feedback. Other lobby users don't need to know a game is "spinning up" — they'll see it in the game list once `GAME_UPDATED` broadcasts. Adding a `"creating"` status to `GameStatus` would touch shared types, server logic, game list rendering, and introduce a transient state every client has to handle. That's a lot of surface area for a 2-second spinner.

This is a UX polish item. Treat it like one.

### What To Build

**One loading overlay on the create form. Three guard rails. Done.**

#### 1. Add `isCreatingGame` guard (LobbyScreen.ts)

```
private isCreatingGame = false;
```

- Set `true` at the top of `handleCreateGame()`, before `room.send(CREATE_GAME, ...)`.
- Set `false` in `GAME_JOINED` handler and `LOBBY_ERROR` handler.
- Early-return from `handleCreateGame()` if already `true` (prevents double-submit).

#### 2. Show loading state on the form (LobbyScreen.ts)

When `isCreatingGame` becomes `true`:
- Disable `#lobby-create-submit` button (set `disabled = true`).
- Change submit button text to `"Creating..."` (was `"Create Game"`).
- Disable `#lobby-create-cancel` button.
- Optionally add a CSS class `.creating` to `#lobby-create-form` for any visual treatment.

When `isCreatingGame` becomes `false`:
- Re-enable both buttons, restore button text.
- If it was a success (`GAME_JOINED`): hide the form as it does today.
- If it was an error (`LOBBY_ERROR`): keep form open so user can fix and retry.

#### 3. Add timeout safety net (LobbyScreen.ts)

Set a 15-second timeout when entering the creating state. If neither `GAME_JOINED` nor `LOBBY_ERROR` arrives in time:
- Reset `isCreatingGame = false`.
- Re-enable the form.
- Call `showNotification("Game creation timed out. Please try again.", "error")`.

This prevents the form from being permanently locked if the server drops the ball.

#### 4. CSS (client/index.html `<style>` block)

Minimal additions:
- `#lobby-create-submit:disabled` — dimmed appearance, `cursor: not-allowed`.
- `#lobby-create-cancel:disabled` — same treatment.
- Optionally a subtle pulse/animation on the submit button text while creating.

No spinner element, no overlay div, no new HTML structure. The button text change *is* the feedback.

### Files Changed

| File | What |
|---|---|
| `client/src/ui/LobbyScreen.ts` | `isCreatingGame` flag, disable/enable buttons, timeout, button text swap |
| `client/index.html` | `:disabled` styles for submit/cancel buttons |

That's it. Two files.

### What NOT To Do

- **No new `GameStatus` value** (no `"creating"`). The game doesn't exist in shared state until the server finishes creating it. Don't model half-created games.
- **No new message types.** No `GAME_CREATING`, no `GAME_CREATION_PROGRESS`. The existing `GAME_JOINED` and `LOBBY_ERROR` are sufficient signals.
- **No shared type changes.** `shared/src/lobbyTypes.ts` stays untouched.
- **No server changes.** `server/src/rooms/LobbyRoom.ts` stays untouched.
- **No spinner/overlay component.** Button text change + disabled state is sufficient for a form that's already on screen.
- **No analytics or telemetry** for creation time.
- **Don't change the form reset behavior** beyond what's described. The form should still reset and hide on successful creation (after `GAME_JOINED`).

### Assignment

- **Gately (UI):** Owns this. CSS disabled states, button text swap, form enable/disable logic.
- **Pemulis (Systems):** Not needed. No server or shared changes.

### Complexity

Small. One flag, two event handlers updated, a timeout, and two CSS rules.
