# Decision: Phase 0 Server & Shared Package Setup

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active  

## Context

Phase 0 scaffolding requires the Colyseus server package and shared types package to be created as npm workspaces.

## Decisions

1. **Colyseus 0.15+ with WebSocketTransport**: Server uses `new Server({ transport: new WebSocketTransport() })`. GameRoom uses `setSimulationInterval` for the tick loop at `TICK_RATE` Hz.

2. **GameState Schema**: Minimal Colyseus `Schema` with a `tick` counter. Will be extended in Phase 1 with player/tile state. Uses `@type()` decorators requiring `experimentalDecorators: true`.

3. **Shared package is dependency-free**: `@primal-grid/shared` has zero runtime dependencies — only types, enums, constants, and message definitions. This keeps client bundles lean and avoids circular dependency issues.

4. **Message protocol convention**: Message types are string constants (`MOVE`, `GATHER`) with corresponding typed payload interfaces (`MovePayload`, `GatherPayload`). All message types live in `shared/src/messages.ts`.

5. **ESM + project references**: Both packages use `"type": "module"` and ES2022. Server tsconfig references shared via TypeScript project references for cross-package type checking.

## Implications

- Phase 1 will extend `GameState` with player maps and tile arrays.
- New message types should follow the pattern in `messages.ts`.
- All game constants belong in `shared/src/constants.ts` — no magic numbers in server or client code.
