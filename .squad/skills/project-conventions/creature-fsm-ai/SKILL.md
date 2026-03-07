# Skill: Creature FSM AI (Priority-Chain Pattern)

## Pattern

Server-side creature AI using priority-ordered behavior chains instead of formal state machine classes. Each creature type defines a chain of conditions checked in priority order each tick. The first matching condition executes its behavior and sets `currentState` for client display.

## Structure

```
creatureAI.ts
├── tickCreatureAI(state)     # Entry point: drain hunger, check death, dispatch to type handler
├── stepHerbivore(creature)   # Priority: Flee > Eat > Seek Food > Idle/Wander
├── stepCarnivore(creature)   # Priority: Hunt/Attack > Idle/Wander
├── moveToward()              # Greedy Manhattan toward target
├── moveAwayFrom()            # Greedy Manhattan away from threat
├── findNearestOfType()       # Scan creatures by type within radius
└── findNearestResource()     # Scan tiles within radius for resources
```

## Key Decisions

- **No formal FSM class** — priority chains are simpler and more composable than transition tables for <10 states.
- **Pure function** — `tickCreatureAI(state)` takes GameState, no Room dependency. Fully testable.
- **One step per tick** — max 1 tile movement. No multi-step planning.
- **Greedy Manhattan** — try primary axis (larger delta) first, then secondary. No pathfinding.
- **Detection via linear scan** — iterate all creatures for nearest-of-type. Acceptable at <100 creatures. Spatial index needed beyond that.

## When to Use

- Adding new creature types: add a `stepNewType()` function with its own priority chain.
- Adding new behaviors: insert into the priority chain at the right position.
- Tuning: all thresholds in `CREATURE_AI` constants (shared package).

## Files

- `server/src/rooms/creatureAI.ts` — AI logic
- `shared/src/constants.ts` — `CREATURE_AI` constants
- `shared/src/data/creatures.ts` — `CREATURE_TYPES` with detectionRadius
