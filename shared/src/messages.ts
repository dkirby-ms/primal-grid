// --- Message type constants ---

export const MOVE = "move" as const;
export const GATHER = "gather" as const;
export const EAT = "eat" as const;
export const CRAFT = "craft" as const;
export const PLACE = "place" as const;
export const FARM_HARVEST = "farm_harvest" as const;
export const TAME = "tame" as const;
export const ABANDON = "abandon" as const;
export const SELECT_CREATURE = "select_creature" as const;
export const BREED = "breed" as const;

// --- Message payload interfaces ---

/** Direction-based movement: -1, 0, or 1 per axis. */
export interface MovePayload {
  /** Horizontal direction (-1 = left, 0 = none, 1 = right). */
  dx: number;
  /** Vertical direction (-1 = up, 0 = none, 1 = down). */
  dy: number;
}

/** Alias for move message sent from client to server. */
export type MoveMessage = MovePayload;

export interface GatherPayload {
  /** Tile X coordinate to gather from. */
  x: number;
  /** Tile Y coordinate to gather from. */
  y: number;
}

export interface CraftPayload {
  /** Recipe identifier to craft. */
  recipeId: string;
}

export interface PlacePayload {
  /** Item type to place. */
  itemType: number;
  /** Tile X coordinate to place at. */
  x: number;
  /** Tile Y coordinate to place at. */
  y: number;
}

export interface FarmHarvestPayload {
  /** Tile X coordinate of the farm plot. */
  x: number;
  /** Tile Y coordinate of the farm plot. */
  y: number;
}

export interface TamePayload {
  /** ID of the creature to tame. */
  creatureId: string;
}

export interface AbandonPayload {
  /** ID of the creature to abandon. */
  creatureId: string;
}

export interface SelectCreaturePayload {
  /** ID of the creature to select/deselect. */
  creatureId: string;
}

export interface BreedPayload {
  /** ID of the first creature. */
  creatureId1: string;
  /** ID of the second creature. */
  creatureId2: string;
}
