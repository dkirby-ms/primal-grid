// --- Message type constants ---

export const CRAFT = "craft" as const;
export const PLACE = "place" as const;
export const FARM_HARVEST = "farm_harvest" as const;
export const TAME = "tame" as const;
export const ABANDON = "abandon" as const;
export const BREED = "breed" as const;
export const CLAIM_TILE = "claim_tile" as const;
export const ASSIGN_PAWN = "assign_pawn" as const;

// --- Message payload interfaces ---

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

export interface BreedPayload {
  /** ID of the target creature to breed. Server auto-finds mate within 1 tile. */
  creatureId: string;
}

export interface ClaimTilePayload {
  x: number;
  y: number;
}

export interface AssignPawnPayload {
  creatureId: string;
  command: "idle" | "gather" | "guard" | "patrol";
  zoneX?: number;
  zoneY?: number;
}
