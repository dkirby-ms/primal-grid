/**
 * Abstract player state repository — persistence interface for game state.
 * Implement with SQLite (dev), Postgres, or Cosmos DB (prod).
 */

export interface SavedPlayerState {
  userId: string;
  /** Player display name. */
  displayName: string;
  /** Serialized game state (resources, territory info, stats). */
  gameState: string;
  savedAt: string;
}

export interface PlayerStateRepository {
  /** Save player state (upsert — create or update). */
  save(userId: string, displayName: string, gameState: string): Promise<void>;

  /** Load most recent player state. Returns null if no save exists. */
  load(userId: string): Promise<SavedPlayerState | null>;

  /** Delete all saved state for a user. */
  delete(userId: string): Promise<void>;
}
