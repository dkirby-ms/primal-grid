/** A cell offset relative to the shape origin. */
export interface Cell {
  dx: number;
  dy: number;
}

/** Definition of a polyomino shape for territory building. */
export interface ShapeDef {
  readonly id: string;
  readonly name: string;
  readonly cells: readonly Cell[];
  /** Pre-computed rotations (0°, 90°, 180°, 270°). */
  readonly rotations: readonly (readonly Cell[])[];
  readonly costResource: 'wood' | 'stone' | 'fiber' | 'berries';
  readonly costAmount: number;
}

/** Rotate a single cell 90° clockwise. */
export function rotateCell(dx: number, dy: number): Cell {
  return { dx: dy, dy: -dx };
}

/** Compute all 4 rotations, normalizing offsets to non-negative values. */
export function computeRotations(cells: readonly Cell[]): Cell[][] {
  const rotations: Cell[][] = [];
  let current = cells.map((c) => ({ dx: c.dx, dy: c.dy }));

  for (let r = 0; r < 4; r++) {
    const minDx = Math.min(...current.map((c) => c.dx));
    const minDy = Math.min(...current.map((c) => c.dy));
    const normalized = current.map((c) => ({
      dx: c.dx - minDx,
      dy: c.dy - minDy,
    }));
    rotations.push(normalized);
    current = normalized.map((c) => rotateCell(c.dx, c.dy));
  }

  return rotations;
}

function shape(id: string, name: string, cells: Cell[], costResource: ShapeDef['costResource'], costAmount: number): ShapeDef {
  return { id, name, cells, rotations: computeRotations(cells), costResource, costAmount };
}

export const SHAPE_CATALOG: Record<string, ShapeDef> = {
  tetra_i: shape("tetra_i", "Wooden Palisade", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 },
  ], 'wood', 8),
  tetra_o: shape("tetra_o", "Stone Pillar", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
  ], 'stone', 8),
  tetra_t: shape("tetra_t", "Watchtower", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 1, dy: 1 },
  ], 'wood', 8),
  tetra_s: shape("tetra_s", "Bramble Hedge", [
    { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
  ], 'fiber', 8),
  tetra_z: shape("tetra_z", "Berry Thicket", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
  ], 'berries', 8),
  tetra_l: shape("tetra_l", "Stone Rampart", [
    { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 },
  ], 'stone', 8),
  tetra_j: shape("tetra_j", "Timber Frame", [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 2 },
  ], 'wood', 8),
};
