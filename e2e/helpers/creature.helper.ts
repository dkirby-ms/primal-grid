import type { Page } from '@playwright/test';

export interface E2ECreatureData {
  id: string;
  creatureType: string;
  x: number;
  y: number;
  health: number;
  hunger: number;
  currentState: string;
  ownerID: string;
  pawnType: string;
  targetX: number;
  targetY: number;
  buildProgress: number;
  buildMode: string;
  stamina: number;
}

/**
 * Get all creatures from the room state, optionally filtered.
 */
export async function getCreatures(
  page: Page,
  filter?: { creatureType?: string; ownerID?: string; pawnType?: string },
): Promise<E2ECreatureData[]> {
  return page.evaluate((f) => {
    const room = (window as unknown as { __ROOM__?: { state?: { creatures?: { forEach: (fn: (c: any, key: string) => void) => void } } } }).__ROOM__;
    if (!room?.state?.creatures) return [];

    const results: any[] = [];
    room.state.creatures.forEach((c: any) => {
      if (f?.creatureType && c.creatureType !== f.creatureType) return;
      if (f?.ownerID && c.ownerID !== f.ownerID) return;
      if (f?.pawnType && c.pawnType !== f.pawnType) return;
      results.push({
        id: c.id,
        creatureType: c.creatureType,
        x: c.x,
        y: c.y,
        health: c.health,
        hunger: c.hunger,
        currentState: c.currentState,
        ownerID: c.ownerID,
        pawnType: c.pawnType,
        targetX: c.targetX,
        targetY: c.targetY,
        buildProgress: c.buildProgress,
        buildMode: c.buildMode,
        stamina: c.stamina,
      });
    });
    return results;
  }, filter);
}

/**
 * Get a single creature by its id.
 */
export async function getCreatureById(
  page: Page,
  creatureId: string,
): Promise<E2ECreatureData | null> {
  return page.evaluate((id) => {
    const room = (window as unknown as { __ROOM__?: { state?: { creatures?: { forEach: (fn: (c: any, key: string) => void) => void } } } }).__ROOM__;
    if (!room?.state?.creatures) return null;

    let found: any = null;
    room.state.creatures.forEach((c: any, key: string) => {
      if (key === id || c.id === id) {
        found = {
          id: c.id,
          creatureType: c.creatureType,
          x: c.x,
          y: c.y,
          health: c.health,
          hunger: c.hunger,
          currentState: c.currentState,
          ownerID: c.ownerID,
          pawnType: c.pawnType,
          targetX: c.targetX,
          targetY: c.targetY,
          buildProgress: c.buildProgress,
          buildMode: c.buildMode,
          stamina: c.stamina,
        };
      }
    });
    return found;
  }, creatureId);
}

/**
 * Count creatures matching an optional filter.
 */
export async function getCreatureCount(
  page: Page,
  filter?: { creatureType?: string; ownerID?: string; pawnType?: string },
): Promise<number> {
  const creatures = await getCreatures(page, filter);
  return creatures.length;
}

/**
 * Get all player-owned pawns (builders, defenders, attackers).
 */
export async function getPlayerPawns(
  page: Page,
  ownerID?: string,
): Promise<E2ECreatureData[]> {
  return page.evaluate((oid) => {
    const room = (window as unknown as { __ROOM__?: { sessionId?: string; state?: { creatures?: { forEach: (fn: (c: any, key: string) => void) => void } } } }).__ROOM__;
    if (!room?.state?.creatures) return [];

    const owner = oid || room.sessionId || '';
    const results: any[] = [];
    room.state.creatures.forEach((c: any) => {
      if (c.pawnType && c.pawnType !== '' && c.ownerID === owner) {
        results.push({
          id: c.id,
          creatureType: c.creatureType,
          x: c.x,
          y: c.y,
          health: c.health,
          hunger: c.hunger,
          currentState: c.currentState,
          ownerID: c.ownerID,
          pawnType: c.pawnType,
          targetX: c.targetX,
          targetY: c.targetY,
          buildProgress: c.buildProgress,
          buildMode: c.buildMode,
          stamina: c.stamina,
        });
      }
    });
    return results;
  }, ownerID);
}

/**
 * Wait until a creature matching the filter appears in state.
 */
export async function waitForCreature(
  page: Page,
  filter: { creatureType?: string; ownerID?: string; pawnType?: string },
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (f: { creatureType?: string; ownerID?: string; pawnType?: string }) => {
      const room = (window as unknown as { __ROOM__?: { state?: { creatures?: { forEach: (fn: (c: any) => void) => void } } } }).__ROOM__;
      if (!room?.state?.creatures) return false;
      let found = false;
      room.state.creatures.forEach((c: any) => {
        if (f.creatureType && c.creatureType !== f.creatureType) return;
        if (f.ownerID && c.ownerID !== f.ownerID) return;
        if (f.pawnType && c.pawnType !== f.pawnType) return;
        found = true;
      });
      return found;
    },
    filter,
    { timeout },
  );
}

/**
 * Wait until a creature's state field matches an expected value.
 */
export async function waitForCreatureState(
  page: Page,
  creatureId: string,
  field: keyof E2ECreatureData,
  expected: string | number,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    ({ id, f, val }: { id: string; f: string; val: string | number }) => {
      const room = (window as unknown as { __ROOM__?: { state?: { creatures?: { forEach: (fn: (c: any, key: string) => void) => void } } } }).__ROOM__;
      if (!room?.state?.creatures) return false;
      let matched = false;
      room.state.creatures.forEach((c: any, key: string) => {
        if ((key === id || c.id === id) && c[f] === val) matched = true;
      });
      return matched;
    },
    { id: creatureId, f: field, val: expected },
    { timeout },
  );
}
