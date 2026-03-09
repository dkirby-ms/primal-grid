import Database from "better-sqlite3";
import crypto from "crypto";
import type { GameStatus, GameSessionInfo } from "@primal-grid/shared";

/** Persisted game session row from SQLite. */
interface GameSessionRow {
  id: string;
  name: string;
  host_id: string;
  host_name: string;
  status: string;
  player_count: number;
  max_players: number;
  map_size: number;
  map_seed: number;
  created_at: string;
  updated_at: string;
}

/**
 * SQLite repository for game session metadata.
 * Allows the lobby to survive server restarts.
 */
export class GameSessionRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host_id TEXT NOT NULL,
        host_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'waiting',
        player_count INTEGER NOT NULL DEFAULT 0,
        max_players INTEGER NOT NULL DEFAULT 8,
        map_size INTEGER NOT NULL DEFAULT 128,
        map_seed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
    `);
  }

  async create(
    name: string,
    hostId: string,
    hostName: string,
    maxPlayers: number,
    mapSize: number,
    mapSeed: number,
  ): Promise<GameSessionInfo> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO game_sessions (id, name, host_id, host_name, status, player_count, max_players, map_size, map_seed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'waiting', 1, ?, ?, ?, ?, ?)`
    ).run(id, name, hostId, hostName, maxPlayers, mapSize, mapSeed, now, now);

    return {
      id,
      name,
      hostId,
      hostName,
      status: "waiting",
      playerCount: 1,
      maxPlayers,
      mapSize,
      mapSeed,
      createdAt: Date.now(),
    };
  }

  async findById(id: string): Promise<GameSessionInfo | null> {
    const row = this.db.prepare("SELECT * FROM game_sessions WHERE id = ?").get(id) as GameSessionRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  async listActive(): Promise<GameSessionInfo[]> {
    const rows = this.db.prepare(
      "SELECT * FROM game_sessions WHERE status IN ('waiting', 'in_progress') ORDER BY created_at DESC"
    ).all() as GameSessionRow[];
    return rows.map((r) => this.mapRow(r));
  }

  async updateStatus(id: string, status: GameStatus): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE game_sessions SET status = ?, updated_at = ? WHERE id = ?"
    ).run(status, now, id);
  }

  async updatePlayerCount(id: string, count: number): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE game_sessions SET player_count = ?, updated_at = ? WHERE id = ?"
    ).run(count, now, id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM game_sessions WHERE id = ?").run(id);
  }

  /** Remove all ended games from the database. */
  async cleanupEnded(): Promise<void> {
    this.db.prepare("DELETE FROM game_sessions WHERE status = 'ended'").run();
  }

  close(): void {
    this.db.close();
  }

  private mapRow(row: GameSessionRow): GameSessionInfo {
    return {
      id: row.id,
      name: row.name,
      hostId: row.host_id,
      hostName: row.host_name,
      status: row.status as GameStatus,
      playerCount: row.player_count,
      maxPlayers: row.max_players,
      mapSize: row.map_size,
      mapSeed: row.map_seed,
      createdAt: new Date(row.created_at).getTime(),
    };
  }
}
