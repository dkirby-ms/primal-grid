/**
 * Abstract user repository — persistence interface for user accounts.
 * Implement with SQLite (dev), Postgres, or Cosmos DB (prod).
 */

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  isGuest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRepository {
  /** Find user by unique ID. */
  findById(id: string): Promise<StoredUser | null>;

  /** Find user by username (case-insensitive). */
  findByUsername(username: string): Promise<StoredUser | null>;

  /** Create a new user. Returns the created user with generated ID. */
  createUser(username: string, passwordHash: string, isGuest: boolean): Promise<StoredUser>;

  /** Upgrade a guest to a full account with new username and password. */
  upgradeGuest(id: string, username: string, passwordHash: string): Promise<void>;
}
