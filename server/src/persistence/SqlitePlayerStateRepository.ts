import Database from "better-sqlite3";
import type { PlayerStateRepository, SavedPlayerState } from "./PlayerStateRepository.js";

/**
 * SQLite implementation of PlayerStateRepository.
 * For development — swap to Postgres/Cosmos for production.
 */
export class SqlitePlayerStateRepository implements PlayerStateRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS player_states (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        game_state TEXT NOT NULL DEFAULT '{}',
        saved_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async save(userId: string, displayName: string, gameState: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO player_states (user_id, display_name, game_state, saved_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         game_state = excluded.game_state,
         saved_at = excluded.saved_at`
    ).run(userId, displayName, gameState, now);
  }

  async load(userId: string): Promise<SavedPlayerState | null> {
    const row = this.db.prepare(
      "SELECT * FROM player_states WHERE user_id = ?"
    ).get(userId) as SavedPlayerStateRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  async delete(userId: string): Promise<void> {
    this.db.prepare("DELETE FROM player_states WHERE user_id = ?").run(userId);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  private mapRow(row: SavedPlayerStateRow): SavedPlayerState {
    return {
      userId: row.user_id,
      displayName: row.display_name,
      gameState: row.game_state,
      savedAt: row.saved_at,
    };
  }
}

interface SavedPlayerStateRow {
  user_id: string;
  display_name: string;
  game_state: string;
  saved_at: string;
}
