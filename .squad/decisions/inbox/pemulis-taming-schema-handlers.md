# Phase 4.1+4.2: Taming Schema Extensions & Interaction Handlers

**Date:** 2026-02-25  
**Author:** Pemulis (Systems Dev)  
**Status:** Active

## Decisions

1. **Ownership via `ownerID` string field** — empty string = wild, player sessionId = owned. No separate roster or inventory. Creatures stay in `state.creatures` MapSchema; ownership is a field filter.
2. **Trust is linear 0–100** — proximity gain (+1/10 ticks ≤3 tiles), decay (-1/20 ticks >3 tiles), auto-abandon at 50 consecutive ticks at zero trust. Simple and predictable.
3. **Personality as string enum** — `Personality.Docile | Neutral | Aggressive`. Assigned immutably at spawn via weighted `personalityChart` on `CreatureTypeDef`. Affects initial taming trust only (Docile=10, Neutral=0, Aggressive=0).
4. **Flat `meat` field on PlayerState** — same pattern as wood/stone/fiber/berries. No MapSchema for inventory items per established convention (B1).
5. **Taming costs food, not time** — 1 berry (herbivore) or 1 meat (carnivore). Single interaction, no progress bar. Cheap enough to encourage experimentation, expensive enough to gate mass-taming.
6. **Pack size limit enforced at tame time** — MAX_PACK_SIZE=8 checked before taming succeeds. No after-the-fact culling.
7. **Tamed herbivores don't flee** — wild herbivores flee from carnivores; tamed ones skip flee entirely, standing their ground. This is the simplest behavioral change that makes tamed creatures feel different.
8. **Trust tick runs every game tick** — `tickTrustDecay()` called each tick in sim loop. Proximity/decay checks are gated by modulo (10 and 20 ticks respectively) inside the method.
9. **`zeroTrustTicks` is non-synced** — internal counter on CreatureState without `@type()` decorator. Client doesn't need it; it's purely for auto-abandon logic.

## Implications

- Gately: `ownerID`, `trust`, `personality` fields are now on CreatureState schema — client can read them for UI (4.5). `meat` field on PlayerState for inventory display.
- Steeply: 15 taming tests already pass. Trust tick method is `tickTrustDecay()` (callable directly for testing).
- Phase 4.3 (Pack Follow): `ownerID` filter is ready. Selected pack tracking can layer on top without schema changes.
- Phase 4.4 (Breeding): `trust` field and `TAMING.TRUST_AT_OBEDIENT` (70) are ready for breed eligibility checks.
- TAME/ABANDON/SELECT_CREATURE/BREED message constants and payloads are exported from shared — client can import immediately.

## Files Changed

- `shared/src/types.ts` — Personality enum, ICreatureState + IPlayerState updated
- `shared/src/constants.ts` — TAMING constants object
- `shared/src/messages.ts` — TAME, ABANDON, SELECT_CREATURE, BREED + payloads
- `shared/src/data/creatures.ts` — personalityChart on CreatureTypeDef
- `server/src/rooms/GameState.ts` — CreatureState (ownerID, trust, speed, personality, zeroTrustTicks), PlayerState (meat)
- `server/src/rooms/GameRoom.ts` — handleTame, handleAbandon, tickTrustDecay, rollPersonality, personality at spawn
- `server/src/rooms/creatureAI.ts` — tamed herbivores skip flee
