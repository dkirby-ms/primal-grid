import { describe, it, expect } from "vitest";
import { GameState, CreatureState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import {
  CREATURE_TYPES, CREATURE_RESPAWN,
} from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): any {
  const room = Object.create(GameRoom.prototype) as any;
  room.state = new GameState();
  room.generateMap(seed);
  return room;
}

function createRoomWithEcosystem(seed?: number): any {
  const room = createRoomWithMap(seed);
  room.spawnCreatures();
  return room;
}

// ═══════════════════════════════════════════════════════════════════
// Creature Systems Integration Tests (Wild Creatures Only)
// ═══════════════════════════════════════════════════════════════════

describe("Creature Systems Integration", () => {
  it("creatures spawn at ecosystem creation", () => {
    const room = createRoomWithEcosystem(12345);
    
    let herbivoreCount = 0;
    let carnivoreCount = 0;
    
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore") herbivoreCount++;
      if (c.creatureType === "carnivore") carnivoreCount++;
    });
    
    expect(herbivoreCount).toBeGreaterThan(0);
    expect(carnivoreCount).toBeGreaterThan(0);
  });

  it("creatures maintain population through respawning", () => {
    const room = createRoomWithEcosystem(42);
    
    // Remove some herbivores to trigger respawn
    const toRemove: string[] = [];
    let removeCount = 0;
    room.state.creatures.forEach((c: any) => {
      if (c.creatureType === "herbivore" && removeCount < 10) {
        toRemove.push(c.id);
        removeCount++;
      }
    });
    
    toRemove.forEach(id => room.state.creatures.delete(id));
    
    const sizeAfterRemoval = room.state.creatures.size;
    
    // Trigger respawn check
    room.state.tick = CREATURE_RESPAWN.CHECK_INTERVAL;
    room.tickCreatureRespawn();
    
    // Should have spawned creatures back to minimum population
    expect(room.state.creatures.size).toBeGreaterThan(sizeAfterRemoval);
  });
});
