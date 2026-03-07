# Decision: Scoreboard UI Pattern (Gately)

**Date:** 2026-03-07
**Author:** Gately (Game Dev)
**Status:** IMPLEMENTED

## What

Client-side player display names + scoreboard overlay for Issue #9.

### Components Added:
1. **Name prompt modal** — DOM overlay after connect, sends `SET_NAME` to server
2. **HQ name labels** — PixiJS Text under each player's HQ marker (all players visible)
3. **Scoreboard overlay** — Tab key toggle, DOM table showing Name/Score/Territory
4. **`SET_NAME` message constant** — Added to `shared/src/messages.ts`

### Design Choices:
- **Scoreboard is DOM-based** (not PixiJS) — follows HudDOM pattern, easier to style, no canvas z-ordering issues
- **Territory count computed client-side** by iterating tiles where `ownerID === player.id` — no new server field needed
- **Scoreboard skips refresh when hidden** — only iterates state on `onStateChange` when panel is visible
- **Name label uses stroke outline** (`stroke: { color: '#000000', width: 3 }`) for readability against any biome

### Server Dependency:
- Server must handle `SET_NAME` message and set `displayName` on `PlayerState` schema
- If server hasn't implemented this yet, names will show as empty until the server side lands
- `SET_NAME` and `SetNamePayload` are exported from shared — server can import directly

### Files Changed:
- `shared/src/messages.ts` — `SET_NAME` constant + `SetNamePayload` interface
- `client/index.html` — Name prompt modal + scoreboard overlay HTML/CSS
- `client/src/main.ts` — Name prompt flow, scoreboard wiring
- `client/src/ui/Scoreboard.ts` — New scoreboard component
- `client/src/input/InputHandler.ts` — Tab key handler + `setScoreboard()`
- `client/src/renderer/GridRenderer.ts` — HQ name labels
