import { TileState, GameState } from "./GameState.js";
import { TileType, ResourceType, NOISE_PARAMS, RESOURCE_REGEN, WATER_GENERATION, isWaterTile } from "@primal-grid/shared";

// --- Simplex noise implementation (inline, no deps) ---

const GRAD2: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/** Create a seeded permutation table for noise generation. */
function createPermTable(seed: number): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const j = ((s >>> 0) % (i + 1));
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

/** 2D simplex noise, returns value in approximately [0, 1]. */
function simplex2D(perm: Uint8Array, x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);

  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;
  const gi0 = perm[ii + perm[jj]] % 8;
  const gi1 = perm[ii + i1 + perm[jj + j1]] % 8;
  const gi2 = perm[ii + 1 + perm[jj + 1]] % 8;

  let n0 = 0, n1 = 0, n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (GRAD2[gi0][0] * x0 + GRAD2[gi0][1] * y0); }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (GRAD2[gi1][0] * x1 + GRAD2[gi1][1] * y1); }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (GRAD2[gi2][0] * x2 + GRAD2[gi2][1] * y2); }

  return Math.min(1, Math.max(0, (70 * (n0 + n1 + n2) + 1) / 2));
}

/** Fractal Brownian motion — layer multiple octaves of simplex noise. */
function fbm(perm: Uint8Array, x: number, y: number, octaves: number, scale: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxAmplitude = 0;

  for (let o = 0; o < octaves; o++) {
    value += amplitude * simplex2D(perm, x * frequency, y * frequency);
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxAmplitude;
}

/** Determine biome from elevation and moisture values. */
function determineBiome(elevation: number, moisture: number): TileType {
  const p = NOISE_PARAMS;
  if (elevation < p.WATER_LEVEL) return TileType.ShallowWater;
  if (elevation > p.ROCK_LEVEL) return TileType.Rock;
  if (elevation > p.HIGHLAND_LEVEL) return TileType.Highland;
  if (moisture > p.SWAMP_MOISTURE && elevation < p.SWAMP_ELEVATION) return TileType.Swamp;
  if (moisture > p.FOREST_MOISTURE) return TileType.Forest;
  if (moisture < p.DESERT_MOISTURE) return TileType.Desert;
  if (moisture < p.SAND_MOISTURE) return TileType.Sand;
  return TileType.Grassland;
}

/** Calculate tile fertility based on biome and moisture. */
function calculateFertility(type: TileType, moisture: number): number {
  switch (type) {
    case TileType.ShallowWater:
    case TileType.DeepWater:
    case TileType.Rock:
      return 0;
    case TileType.Highland:
      return 0.1 + moisture * 0.1;
    case TileType.Forest:
      return 0.7 + moisture * 0.3;
    case TileType.Swamp:
      return 0.4 + moisture * 0.2;
    case TileType.Grassland:
      return 0.5 + moisture * 0.4;
    case TileType.Sand:
      return 0.1 + moisture * 0.1;
    case TileType.Desert:
      return 0.05;
    default:
      return 0;
  }
}

/** Determine resource type for a tile based on biome. Returns -1 for none. */
function assignResource(biome: TileType, rng: () => number): { type: number; amount: number } {
  switch (biome) {
    case TileType.Forest:
      return { type: ResourceType.Wood, amount: Math.floor(rng() * RESOURCE_REGEN.MAX_AMOUNT) + 1 };
    case TileType.Grassland:
      return { type: ResourceType.Wood, amount: Math.floor(rng() * RESOURCE_REGEN.MAX_AMOUNT) + 1 };
    case TileType.Highland:
      return { type: ResourceType.Stone, amount: Math.floor(rng() * RESOURCE_REGEN.MAX_AMOUNT) + 1 };
    default:
      return { type: -1, amount: 0 };
  }
}

/** Generate a procedural tile map using dual-layer simplex noise. */
export function generateProceduralMap(
  state: GameState,
  seed: number,
  width: number,
  height: number,
): void {
  state.mapWidth = width;
  state.mapHeight = height;
  state.mapSeed = seed;

  const elevPerm = createPermTable(seed);
  const moistPerm = createPermTable(seed + 31337);

  // Seeded RNG for resource assignment
  let rngState = seed + 99991;
  const rng = (): number => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) | 0;
    return (rngState >>> 0) / 4294967296;
  };

  const p = NOISE_PARAMS;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const elevation = fbm(elevPerm, x, y, p.ELEVATION_OCTAVES, p.ELEVATION_SCALE);
      const moisture = fbm(moistPerm, x, y, p.MOISTURE_OCTAVES, p.MOISTURE_SCALE);

      const biome = determineBiome(elevation, moisture);
      const fertility = calculateFertility(biome, moisture);

      const tile = new TileState();
      tile.x = x;
      tile.y = y;
      tile.type = biome;
      tile.fertility = Math.round(fertility * 100) / 100;
      tile.moisture = Math.round(moisture * 100) / 100;

      const resource = assignResource(biome, rng);
      tile.resourceType = resource.type;
      tile.resourceAmount = resource.amount;

      state.tiles.push(tile);
    }
  }

  // Cellular automata smoothing — eliminate isolated single-tile biome patches
  smoothBiomes(state, width, height, rng);

  // Second pass: classify water tiles as shallow or deep based on distance to land
  classifyWaterDepth(state, width, height);
}

/** Run cellular automata smoothing passes to create contiguous biome regions. */
function smoothBiomes(
  state: GameState,
  width: number,
  height: number,
  rng: () => number,
): void {
  const PASSES = 2;
  const MAJORITY_THRESHOLD = 5;
  // Water and Rock are terrain barriers — never smoothed
  const PROTECTED = new Set<TileType>([TileType.ShallowWater, TileType.DeepWater, TileType.Rock]);

  for (let pass = 0; pass < PASSES; pass++) {
    // Snapshot current biome types so reads don't see writes from this pass
    const snapshot = new Array<TileType>(width * height);
    for (let i = 0; i < width * height; i++) {
      snapshot[i] = state.tiles[i].type;
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const current = snapshot[idx];
        if (PROTECTED.has(current)) continue;

        // Count biome types in Moore neighborhood (8 neighbors)
        const counts = new Map<TileType, number>();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nType = snapshot[ny * width + nx];
            counts.set(nType, (counts.get(nType) || 0) + 1);
          }
        }

        // Find the majority biome among neighbors
        let majorityType = current;
        let majorityCount = 0;
        for (const [type, count] of counts) {
          if (count > majorityCount) {
            majorityCount = count;
            majorityType = type;
          }
        }

        // Flip if majority is different and meets threshold
        if (majorityType !== current && majorityCount >= MAJORITY_THRESHOLD) {
          const tile = state.tiles[idx];
          tile.type = majorityType;

          // Recalculate fertility and resources for new biome
          tile.fertility = Math.round(calculateFertility(majorityType, tile.moisture) * 100) / 100;
          const resource = assignResource(majorityType, rng);
          tile.resourceType = resource.type;
          tile.resourceAmount = resource.amount;
        }
      }
    }
  }
}

/**
 * Classify water tiles as ShallowWater or DeepWater based on distance to
 * the nearest non-water tile. Runs as a second pass after generation and
 * smoothing. Uses BFS from all land-edge tiles inward.
 */
function classifyWaterDepth(
  state: GameState,
  width: number,
  height: number,
): void {
  const radius = WATER_GENERATION.SHALLOW_RADIUS;
  const total = width * height;

  // Distance grid: Infinity for water, 0 for non-water
  const dist = new Float32Array(total);
  dist.fill(Infinity);

  const queue: number[] = [];

  // Seed BFS from all non-water tiles
  for (let i = 0; i < total; i++) {
    if (!isWaterTile(state.tiles[i].type)) {
      dist[i] = 0;
      queue.push(i);
    }
  }

  // BFS outward — only expand into water tiles up to radius distance
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;
    const nextDist = dist[idx] + 1;
    if (nextDist > radius) continue;

    const neighbors: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (nextDist < dist[ni]) {
        dist[ni] = nextDist;
        queue.push(ni);
      }
    }
  }

  // Classify: ≤ radius → ShallowWater, > radius → DeepWater
  for (let i = 0; i < total; i++) {
    const tile = state.tiles[i];
    if (!isWaterTile(tile.type)) continue;
    tile.type = dist[i] <= radius ? TileType.ShallowWater : TileType.DeepWater;
  }
}
