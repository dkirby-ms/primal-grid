# B6 — Worker Gather AI

**Author:** Pemulis (Systems Dev)
**Date:** 2025-01-20

## Decision

Workers with `command === "gather"` bypass the normal creature AI loop entirely — no hunger drain, no FSM state machine, no wild behavior. They run their own `tickWorkerGather()` which: gathers from current tile if owned + has resources, else moves toward nearest owned resource tile (radius 10), else wanders within territory.

## Rationale

- Workers are a game mechanic, not wildlife. Hunger/starvation would create frustrating UX — workers should just work until killed.
- The gather check is keyed on `ownerID !== "" && command === "gather"`, not `creatureType === "worker"`, so any owned creature given a gather command will use this path. Keeps system extensible.
- `wanderInTerritory()` constrains workers to owned tiles so they don't drift into the wild.

## Impact

- Only `creatureAI.ts` modified. No changes to GameState, GameRoom, or territory (avoids B2 conflicts).
- 238 passing tests unaffected. 2 pre-existing failures in creature-types.test.ts (worker has detectionRadius 0 and empty preferredBiomes — correct for non-wild creature, test is over-broad).
