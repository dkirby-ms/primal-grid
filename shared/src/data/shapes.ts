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

function shape(id: string, name: string, cells: Cell[]): ShapeDef {
  return { id, name, cells, rotations: computeRotations(cells) };
}

export const SHAPE_CATALOG: Record<string, ShapeDef> = {
  tetra_i: shape("tetra_i", "Tetra I", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 3, dy: 0 },
  ]),
  tetra_o: shape("tetra_o", "Tetra O", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
  ]),
  tetra_t: shape("tetra_t", "Tetra T", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 1, dy: 1 },
  ]),
  tetra_s: shape("tetra_s", "Tetra S", [
    { dx: 1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
  ]),
  tetra_z: shape("tetra_z", "Tetra Z", [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 2, dy: 1 },
  ]),
  tetra_l: shape("tetra_l", "Tetra L", [
    { dx: 0, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 },
  ]),
  tetra_j: shape("tetra_j", "Tetra J", [
    { dx: 1, dy: 0 }, { dx: 1, dy: 1 }, { dx: 1, dy: 2 }, { dx: 0, dy: 2 },
  ]),
};
