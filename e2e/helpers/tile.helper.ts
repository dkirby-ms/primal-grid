import type { Page } from '@playwright/test';

export interface E2ETileData {
  x: number;
  y: number;
  type: number;
  fertility: number;
  moisture: number;
  resourceType: number;
  resourceAmount: number;
  shapeHP: number;
  ownerID: string;
  isHQTerritory: boolean;
  structureType: string;
}

/**
 * Get a single tile by grid coordinates.
 * Uses linear indexing: index = y * mapWidth + x.
 */
export async function getTile(
  page: Page,
  x: number,
  y: number,
): Promise<E2ETileData | null> {
  return page.evaluate(
    ({ tx, ty }) => {
      const room = (window as unknown as { __ROOM__?: { state?: { tiles?: any; mapWidth?: number } } }).__ROOM__;
      if (!room?.state?.tiles || !room.state.mapWidth) return null;

      const idx = ty * room.state.mapWidth + tx;
      const tile = room.state.tiles[idx];
      if (!tile) return null;

      return {
        x: tile.x,
        y: tile.y,
        type: tile.type,
        fertility: tile.fertility,
        moisture: tile.moisture,
        resourceType: tile.resourceType,
        resourceAmount: tile.resourceAmount,
        shapeHP: tile.shapeHP,
        ownerID: tile.ownerID,
        isHQTerritory: tile.isHQTerritory,
        structureType: tile.structureType,
      };
    },
    { tx: x, ty: y },
  );
}

/**
 * Get all tiles matching a filter predicate.
 * The predicate runs inside page.evaluate so it must be self-contained.
 */
export async function getTilesWhere(
  page: Page,
  filter: {
    ownerID?: string;
    structureType?: string;
    isHQTerritory?: boolean;
    tileType?: number;
    hasResource?: boolean;
  },
): Promise<E2ETileData[]> {
  return page.evaluate((f) => {
    const room = (window as unknown as { __ROOM__?: { state?: { tiles?: any; mapWidth?: number } } }).__ROOM__;
    if (!room?.state?.tiles) return [];

    const results: any[] = [];
    const len = room.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const tile = room.state.tiles[i];
      if (!tile) continue;

      if (f.ownerID !== undefined && tile.ownerID !== f.ownerID) continue;
      if (f.structureType !== undefined && tile.structureType !== f.structureType) continue;
      if (f.isHQTerritory !== undefined && tile.isHQTerritory !== f.isHQTerritory) continue;
      if (f.tileType !== undefined && tile.type !== f.tileType) continue;
      if (f.hasResource === true && (tile.resourceType === -1 || tile.resourceAmount <= 0)) continue;
      if (f.hasResource === false && tile.resourceType !== -1 && tile.resourceAmount > 0) continue;

      results.push({
        x: tile.x,
        y: tile.y,
        type: tile.type,
        fertility: tile.fertility,
        moisture: tile.moisture,
        resourceType: tile.resourceType,
        resourceAmount: tile.resourceAmount,
        shapeHP: tile.shapeHP,
        ownerID: tile.ownerID,
        isHQTerritory: tile.isHQTerritory,
        structureType: tile.structureType,
      });
    }
    return results;
  }, filter);
}

/**
 * Count tiles owned by a player (or current session).
 */
export async function getOwnedTileCount(
  page: Page,
  ownerID?: string,
): Promise<number> {
  return page.evaluate((oid) => {
    const room = (window as unknown as { __ROOM__?: { sessionId?: string; state?: { tiles?: any } } }).__ROOM__;
    if (!room?.state?.tiles) return 0;

    const owner = oid || room.sessionId || '';
    let count = 0;
    const len = room.state.tiles.length;
    for (let i = 0; i < len; i++) {
      if (room.state.tiles[i]?.ownerID === owner) count++;
    }
    return count;
  }, ownerID);
}

/**
 * Get territory summary — count of owned tiles grouped by structure type.
 */
export async function getTerritoryStats(
  page: Page,
  ownerID?: string,
): Promise<{ total: number; hqTiles: number; structures: Record<string, number> }> {
  return page.evaluate((oid) => {
    const room = (window as unknown as { __ROOM__?: { sessionId?: string; state?: { tiles?: any } } }).__ROOM__;
    if (!room?.state?.tiles) return { total: 0, hqTiles: 0, structures: {} };

    const owner = oid || room.sessionId || '';
    let total = 0;
    let hqTiles = 0;
    const structures: Record<string, number> = {};

    const len = room.state.tiles.length;
    for (let i = 0; i < len; i++) {
      const tile = room.state.tiles[i];
      if (!tile || tile.ownerID !== owner) continue;
      total++;
      if (tile.isHQTerritory) hqTiles++;
      if (tile.structureType && tile.structureType !== '') {
        structures[tile.structureType] = (structures[tile.structureType] || 0) + 1;
      }
    }
    return { total, hqTiles, structures };
  }, ownerID);
}

/**
 * Wait until tile count for an owner reaches at least `minCount`.
 */
export async function waitForTileCount(
  page: Page,
  minCount: number,
  ownerID?: string,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    ({ min, oid }: { min: number; oid?: string }) => {
      const room = (window as unknown as { __ROOM__?: { sessionId?: string; state?: { tiles?: any } } }).__ROOM__;
      if (!room?.state?.tiles) return false;

      const owner = oid || room.sessionId || '';
      let count = 0;
      const len = room.state.tiles.length;
      for (let i = 0; i < len; i++) {
        if (room.state.tiles[i]?.ownerID === owner) count++;
      }
      return count >= min;
    },
    { min: minCount, oid: ownerID },
    { timeout },
  );
}

/**
 * Get resource tiles within a bounding box.
 */
export async function getResourceTilesInArea(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<E2ETileData[]> {
  return page.evaluate(
    ({ ax1, ay1, ax2, ay2 }) => {
      const room = (window as unknown as { __ROOM__?: { state?: { tiles?: any; mapWidth?: number } } }).__ROOM__;
      if (!room?.state?.tiles || !room.state.mapWidth) return [];

      const w = room.state.mapWidth;
      const results: any[] = [];

      for (let y = ay1; y <= ay2; y++) {
        for (let x = ax1; x <= ax2; x++) {
          const tile = room.state.tiles[y * w + x];
          if (tile && tile.resourceType !== -1 && tile.resourceAmount > 0) {
            results.push({
              x: tile.x,
              y: tile.y,
              type: tile.type,
              fertility: tile.fertility,
              moisture: tile.moisture,
              resourceType: tile.resourceType,
              resourceAmount: tile.resourceAmount,
              shapeHP: tile.shapeHP,
              ownerID: tile.ownerID,
              isHQTerritory: tile.isHQTerritory,
              structureType: tile.structureType,
            });
          }
        }
      }
      return results;
    },
    { ax1: x1, ay1: y1, ax2: x2, ay2: y2 },
  );
}
