/**
 * Abstract auth provider interface.
 * Designed for swapping JWT issuer (e.g., local → Entra ID external identities).
 */

export interface AuthUser {
  id: string;
  username: string;
  isGuest: boolean;
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
}

export interface RegisterResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  token?: TokenPair;
  error?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
}

/**
 * Auth provider contract — implement this to swap auth backends.
 * Current: local JWT. Future: Entra ID external identities.
 */
export interface AuthProvider {
  /** Register a new user with username + password. */
  register(username: string, password: string): Promise<RegisterResult>;

  /** Authenticate and return a JWT. */
  login(username: string, password: string): Promise<LoginResult>;

  /** Create a guest session with a temporary JWT. */
  createGuestSession(): Promise<LoginResult>;

  /** Upgrade a guest account to a full account. */
  upgradeGuest(guestId: string, username: string, password: string): Promise<RegisterResult>;

  /** Validate a JWT and return the associated user. */
  validateToken(token: string): Promise<TokenValidationResult>;
}
