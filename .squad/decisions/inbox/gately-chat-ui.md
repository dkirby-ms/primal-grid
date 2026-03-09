# Decision: Chat UI Architecture

**Author:** Gately (Game Dev)
**Date:** 2026-03-06
**Issue:** #30 — In-game chat

## Decision

Chat overlay is a DOM-based panel (`ChatPanel.ts`) following the same overlay-panel skill pattern as GameLog — not rendered in PixiJS canvas.

## Key Choices

- **Input isolation via `stopPropagation`:** Chat input catches all keydown events when focused so game controls (WASD, Space, etc.) don't fire while typing. InputHandler checks `chatPanel.isFocused` as an early-return guard.
- **Keybindings:** `C` toggles chat panel visibility, `Enter` focuses the chat input from game context, `Escape` blurs back to game controls.
- **Message protocol:** Client sends `room.send('chat', { text })`, expects server to broadcast `{ sender, text, timestamp }`. Pemulis owns the server handler (`pemulis-chat-protocol.md`).
- **History cap:** 100 messages max in DOM (pruned oldest-first). Separate from GameLog's 200-entry cap since chat messages are typically shorter.
- **Positioning:** Below game-log in the `#game-outer` flex column, same 800px width as game-log for visual alignment.

## Impact on Others

- **Pemulis:** Server must handle `"chat"` message type and broadcast `{ sender, text, timestamp }` — see his protocol decision.
- **Steeply:** ChatPanel needs tests for: message rendering, pruning, input focus/blur, toggle visibility.
