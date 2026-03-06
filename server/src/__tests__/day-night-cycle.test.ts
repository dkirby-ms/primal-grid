import { describe, it, expect } from "vitest";
import { GameState } from "../rooms/GameState.js";
import { GameRoom } from "../rooms/GameRoom.js";
import { DAY_NIGHT } from "@primal-grid/shared";

// ── Helpers ─────────────────────────────────────────────────────────

function createRoomWithMap(seed?: number): GameRoom {
  const room = Object.create(GameRoom.prototype) as GameRoom;
  room.state = new GameState();
  room.generateMap(seed);
  room.broadcast = () => {};
  return room;
}

/** Advance one game tick and call the day/night cycle handler. */
function gameTick(room: GameRoom) {
  room.state.tick += 1;
  room.tickDayNightCycle();
}

/** Advance multiple game ticks. */
function advanceTicks(room: GameRoom, count: number) {
  for (let i = 0; i < count; i++) {
    gameTick(room);
  }
}

/** All valid day phase names. */
const VALID_PHASES = ["dawn", "day", "dusk", "night"];

// ── Day/Night Cycle Tests ───────────────────────────────────────────

describe("Day/Night Cycle (#10)", () => {
  describe("initial state", () => {
    it("dayTick starts at 0", () => {
      const room = createRoomWithMap(42);
      expect(room.state.dayTick).toBe(0);
    });

    it("dayPhase has a valid initial value", () => {
      const room = createRoomWithMap(42);
      expect(VALID_PHASES).toContain(room.state.dayPhase);
    });

    it("initial phase is dawn", () => {
      const room = createRoomWithMap(42);
      expect(room.state.dayPhase).toBe("dawn");
    });
  });

  describe("tick advancement", () => {
    it("dayTick increments after calling the day/night handler", () => {
      const room = createRoomWithMap(42);
      const initial = room.state.dayTick;
      gameTick(room);
      expect(room.state.dayTick).toBeGreaterThan(initial);
    });

    it("dayTick advances by 1 per game tick", () => {
      const room = createRoomWithMap(42);
      gameTick(room);
      expect(room.state.dayTick).toBe(1);
      gameTick(room);
      expect(room.state.dayTick).toBe(2);
      gameTick(room);
      expect(room.state.dayTick).toBe(3);
    });
  });

  describe("cycle wrapping", () => {
    it("dayTick wraps back to 0 after reaching CYCLE_LENGTH_TICKS", () => {
      const room = createRoomWithMap(42);
      advanceTicks(room, DAY_NIGHT.CYCLE_LENGTH_TICKS);
      expect(room.state.dayTick).toBe(0);
    });

    it("dayTick never exceeds CYCLE_LENGTH_TICKS - 1", () => {
      const room = createRoomWithMap(42);
      // Run through two full cycles plus some extra
      const totalTicks = DAY_NIGHT.CYCLE_LENGTH_TICKS * 2 + 10;
      for (let i = 0; i < totalTicks; i++) {
        gameTick(room);
        expect(room.state.dayTick).toBeLessThan(DAY_NIGHT.CYCLE_LENGTH_TICKS);
      }
    });
  });

  describe("phase transitions", () => {
    it("phase changes as dayTick advances through the cycle", () => {
      const room = createRoomWithMap(42);
      const phasesEncountered = new Set<string>();
      phasesEncountered.add(room.state.dayPhase);

      for (let i = 0; i < DAY_NIGHT.CYCLE_LENGTH_TICKS; i++) {
        gameTick(room);
        phasesEncountered.add(room.state.dayPhase);
      }

      // All four phases should appear during one full cycle
      for (const phase of VALID_PHASES) {
        expect(phasesEncountered).toContain(phase);
      }
    });

    it("phases occur in order: dawn → day → dusk → night", () => {
      const room = createRoomWithMap(42);
      const phaseOrder: string[] = [];
      let lastPhase = room.state.dayPhase;

      for (let i = 0; i < DAY_NIGHT.CYCLE_LENGTH_TICKS; i++) {
        gameTick(room);
        if (room.state.dayPhase !== lastPhase) {
          phaseOrder.push(room.state.dayPhase);
          lastPhase = room.state.dayPhase;
        }
      }

      // Should transition through day → dusk → night (dawn is the starting phase)
      expect(phaseOrder[0]).toBe("day");
      expect(phaseOrder[1]).toBe("dusk");
      expect(phaseOrder[2]).toBe("night");
    });
  });

  describe("full cycle", () => {
    it("returns to initial phase after exactly CYCLE_LENGTH_TICKS", () => {
      const room = createRoomWithMap(42);
      const initialPhase = room.state.dayPhase;
      advanceTicks(room, DAY_NIGHT.CYCLE_LENGTH_TICKS);
      expect(room.state.dayPhase).toBe(initialPhase);
    });

    it("state after two full cycles matches state after one full cycle", () => {
      const room1 = createRoomWithMap(42);
      const room2 = createRoomWithMap(42);

      advanceTicks(room1, DAY_NIGHT.CYCLE_LENGTH_TICKS);
      advanceTicks(room2, DAY_NIGHT.CYCLE_LENGTH_TICKS * 2);

      expect(room2.state.dayTick).toBe(room1.state.dayTick);
      expect(room2.state.dayPhase).toBe(room1.state.dayPhase);
    });
  });

  describe("phase validity", () => {
    it("dayPhase is always one of the defined phases throughout the cycle", () => {
      const room = createRoomWithMap(42);
      expect(VALID_PHASES).toContain(room.state.dayPhase);

      for (let i = 0; i < DAY_NIGHT.CYCLE_LENGTH_TICKS; i++) {
        gameTick(room);
        expect(VALID_PHASES).toContain(room.state.dayPhase);
      }
    });

    it("dayPhase is never empty or undefined", () => {
      const room = createRoomWithMap(42);
      expect(room.state.dayPhase).toBeTruthy();

      for (let i = 0; i < DAY_NIGHT.CYCLE_LENGTH_TICKS; i++) {
        gameTick(room);
        expect(room.state.dayPhase).toBeTruthy();
      }
    });
  });
});
