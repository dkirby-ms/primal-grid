import Database from "better-sqlite3";
import crypto from "crypto";
import type { UserRepository, StoredUser } from "./UserRepository.js";

/**
 * SQLite implementation of UserRepository.
 * For development — swap to Postgres/Cosmos for production.
 */
export class SqliteUserRepository implements UserRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL DEFAULT '',
        is_guest INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
  }

  async findById(id: string): Promise<StoredUser | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as StoredUserRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  async findByUsername(username: string): Promise<StoredUser | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as StoredUserRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  async createUser(username: string, passwordHash: string, isGuest: boolean): Promise<StoredUser> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      "INSERT INTO users (id, username, password_hash, is_guest, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, username, passwordHash, isGuest ? 1 : 0, now, now);

    return {
      id,
      username,
      passwordHash,
      isGuest,
      createdAt: now,
      updatedAt: now,
    };
  }

  async upgradeGuest(id: string, username: string, passwordHash: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE users SET username = ?, password_hash = ?, is_guest = 0, updated_at = ? WHERE id = ? AND is_guest = 1"
    ).run(username, passwordHash, now, id);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  private mapRow(row: StoredUserRow): StoredUser {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      isGuest: row.is_guest === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface StoredUserRow {
  id: string;
  username: string;
  password_hash: string;
  is_guest: number;
  created_at: string;
  updated_at: string;
}
