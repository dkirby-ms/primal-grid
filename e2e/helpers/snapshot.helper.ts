import type { Page } from '@playwright/test';

export interface GameSnapshot {
  tick: number;
  dayPhase: string;
  roundPhase: string;
  roundTimer: number;
  mapWidth: number;
  players: Array<{
    id: string;
    displayName: string;
    wood: number;
    stone: number;
    hqX: number;
    hqY: number;
    score: number;
    level: number;
    xp: number;
  }>;
  creatures: Array<{
    id: string;
    creatureType: string;
    x: number;
    y: number;
    health: number;
    currentState: string;
    ownerID: string;
    pawnType: string;
  }>;
  tileStats: {
    totalOwned: number;
    ownerCounts: Record<string, number>;
    structureCounts: Record<string, number>;
    resourceTileCount: number;
  };
}

export interface SnapshotDiff {
  tickDelta: number;
  dayPhaseChanged: boolean;
  playerChanges: Array<{
    id: string;
    displayName: string;
    changes: Record<string, { before: unknown; after: unknown }>;
  }>;
  creaturesAdded: string[];
  creaturesRemoved: string[];
  creatureChanges: Array<{
    id: string;
    changes: Record<string, { before: unknown; after: unknown }>;
  }>;
  tileStatChanges: Record<string, { before: unknown; after: unknown }>;
}

/**
 * Take a full game state snapshot suitable for later comparison.
 * Captures players, creatures, and aggregate tile statistics.
 * Does NOT capture every tile (too large) — uses aggregate stats instead.
 */
export async function takeSnapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => {
    const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
    if (!room?.state) {
      throw new Error('Room not connected — cannot take snapshot');
    }

    const s = room.state;

    const players: GameSnapshot['players'] = [];
    s.players?.forEach((p: any, key: string) => {
      players.push({
        id: key,
        displayName: p.displayName,
        wood: p.wood,
        stone: p.stone,
        hqX: p.hqX,
        hqY: p.hqY,
        score: p.score,
        level: p.level,
        xp: p.xp,
      });
    });

    const creatures: GameSnapshot['creatures'] = [];
    s.creatures?.forEach((c: any) => {
      creatures.push({
        id: c.id,
        creatureType: c.creatureType,
        x: c.x,
        y: c.y,
        health: c.health,
        currentState: c.currentState,
        ownerID: c.ownerID,
        pawnType: c.pawnType,
      });
    });

    const ownerCounts: Record<string, number> = {};
    const structureCounts: Record<string, number> = {};
    let totalOwned = 0;
    let resourceTileCount = 0;

    const len = s.tiles?.length ?? 0;
    for (let i = 0; i < len; i++) {
      const tile = s.tiles[i];
      if (!tile) continue;
      if (tile.ownerID && tile.ownerID !== '') {
        totalOwned++;
        ownerCounts[tile.ownerID] = (ownerCounts[tile.ownerID] || 0) + 1;
      }
      if (tile.structureType && tile.structureType !== '') {
        structureCounts[tile.structureType] = (structureCounts[tile.structureType] || 0) + 1;
      }
      if (tile.resourceType !== -1 && tile.resourceAmount > 0) {
        resourceTileCount++;
      }
    }

    return {
      tick: s.tick,
      dayPhase: s.dayPhase,
      roundPhase: s.roundPhase ?? 'playing',
      roundTimer: s.roundTimer ?? -1,
      mapWidth: s.mapWidth,
      players,
      creatures,
      tileStats: { totalOwned, ownerCounts, structureCounts, resourceTileCount },
    };
  }) as Promise<GameSnapshot>;
}

/**
 * Compare two snapshots and return a structured diff.
 * Useful for asserting what changed between two points in time.
 */
export function diffSnapshots(before: GameSnapshot, after: GameSnapshot): SnapshotDiff {
  const tickDelta = after.tick - before.tick;
  const dayPhaseChanged = before.dayPhase !== after.dayPhase;

  // Player changes
  const playerChanges: SnapshotDiff['playerChanges'] = [];
  const beforePlayers = new Map(before.players.map((p) => [p.id, p]));
  for (const ap of after.players) {
    const bp = beforePlayers.get(ap.id);
    if (!bp) continue;
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of ['wood', 'stone', 'score', 'level', 'xp'] as const) {
      if (bp[key] !== ap[key]) {
        changes[key] = { before: bp[key], after: ap[key] };
      }
    }
    if (Object.keys(changes).length > 0) {
      playerChanges.push({ id: ap.id, displayName: ap.displayName, changes });
    }
  }

  // Creature changes
  const beforeCreatures = new Map(before.creatures.map((c) => [c.id, c]));
  const afterCreatures = new Map(after.creatures.map((c) => [c.id, c]));

  const creaturesAdded = after.creatures
    .filter((c) => !beforeCreatures.has(c.id))
    .map((c) => c.id);
  const creaturesRemoved = before.creatures
    .filter((c) => !afterCreatures.has(c.id))
    .map((c) => c.id);

  const creatureChanges: SnapshotDiff['creatureChanges'] = [];
  for (const ac of after.creatures) {
    const bc = beforeCreatures.get(ac.id);
    if (!bc) continue;
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of ['x', 'y', 'health', 'currentState'] as const) {
      if (bc[key] !== ac[key]) {
        changes[key] = { before: bc[key], after: ac[key] };
      }
    }
    if (Object.keys(changes).length > 0) {
      creatureChanges.push({ id: ac.id, changes });
    }
  }

  // Tile stat changes
  const tileStatChanges: Record<string, { before: unknown; after: unknown }> = {};
  if (before.tileStats.totalOwned !== after.tileStats.totalOwned) {
    tileStatChanges['totalOwned'] = {
      before: before.tileStats.totalOwned,
      after: after.tileStats.totalOwned,
    };
  }
  if (before.tileStats.resourceTileCount !== after.tileStats.resourceTileCount) {
    tileStatChanges['resourceTileCount'] = {
      before: before.tileStats.resourceTileCount,
      after: after.tileStats.resourceTileCount,
    };
  }

  return {
    tickDelta,
    dayPhaseChanged,
    playerChanges,
    creaturesAdded,
    creaturesRemoved,
    creatureChanges,
    tileStatChanges,
  };
}

/**
 * Wait for a specific number of ticks to advance, then take a snapshot.
 */
export async function waitTicksAndSnapshot(
  page: Page,
  ticksToWait: number,
  timeout = 30_000,
): Promise<GameSnapshot> {
  const startTick = await page.evaluate(() => {
    const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
    return room?.state?.tick ?? 0;
  });

  await page.waitForFunction(
    ({ start, delta }: { start: number; delta: number }) => {
      const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
      return (room?.state?.tick ?? 0) >= start + delta;
    },
    { start: startTick, delta: ticksToWait },
    { timeout },
  );

  return takeSnapshot(page);
}

/**
 * Take two snapshots separated by a tick interval and return the diff.
 */
export async function snapshotAndDiff(
  page: Page,
  ticksBetween: number,
  timeout = 30_000,
): Promise<{ before: GameSnapshot; after: GameSnapshot; diff: SnapshotDiff }> {
  const before = await takeSnapshot(page);
  const after = await waitTicksAndSnapshot(page, ticksBetween, timeout);
  const diff = diffSnapshots(before, after);
  return { before, after, diff };
}
