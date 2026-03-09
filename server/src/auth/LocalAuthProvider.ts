import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type {
  AuthProvider,
  AuthUser,
  TokenPair,
  RegisterResult,
  LoginResult,
  TokenValidationResult,
} from "./AuthProvider.js";
import type { UserRepository } from "../persistence/UserRepository.js";

const BCRYPT_ROUNDS = 10;
const DEFAULT_TOKEN_EXPIRY = 86400; // 24 hours in seconds

interface JwtPayload {
  sub: string;
  username: string;
  isGuest: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Local JWT auth provider — issues and validates JWTs directly.
 * Designed to be swapped for Entra ID external identities later.
 */
export class LocalAuthProvider implements AuthProvider {
  private readonly jwtSecret: string;
  private readonly tokenExpiry: number;
  private readonly userRepo: UserRepository;

  constructor(userRepo: UserRepository, jwtSecret: string, tokenExpiry = DEFAULT_TOKEN_EXPIRY) {
    this.userRepo = userRepo;
    this.jwtSecret = jwtSecret;
    this.tokenExpiry = tokenExpiry;
  }

  async register(username: string, password: string): Promise<RegisterResult> {
    const normalized = username.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 20) {
      return { success: false, error: "Username must be 3-20 characters" };
    }
    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters" };
    }

    const existing = await this.userRepo.findByUsername(normalized);
    if (existing) {
      return { success: false, error: "Username already taken" };
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.userRepo.createUser(normalized, passwordHash, false);

    return {
      success: true,
      user: { id: user.id, username: user.username, isGuest: false },
    };
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const normalized = username.trim().toLowerCase();
    const user = await this.userRepo.findByUsername(normalized);
    if (!user) {
      return { success: false, error: "Invalid credentials" };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return { success: false, error: "Invalid credentials" };
    }

    const authUser: AuthUser = { id: user.id, username: user.username, isGuest: user.isGuest };
    const token = this.issueToken(authUser);

    return { success: true, user: authUser, token };
  }

  async createGuestSession(): Promise<LoginResult> {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const guestUsername = `Guest_${guestId.slice(-6)}`;

    const user = await this.userRepo.createUser(guestUsername, "", true);
    const authUser: AuthUser = { id: user.id, username: user.username, isGuest: true };
    const token = this.issueToken(authUser);

    return { success: true, user: authUser, token };
  }

  async upgradeGuest(guestId: string, username: string, password: string): Promise<RegisterResult> {
    const normalized = username.trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 20) {
      return { success: false, error: "Username must be 3-20 characters" };
    }
    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters" };
    }

    const guest = await this.userRepo.findById(guestId);
    if (!guest || !guest.isGuest) {
      return { success: false, error: "Guest account not found" };
    }

    const existing = await this.userRepo.findByUsername(normalized);
    if (existing) {
      return { success: false, error: "Username already taken" };
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.userRepo.upgradeGuest(guestId, normalized, passwordHash);

    return {
      success: true,
      user: { id: guestId, username: normalized, isGuest: false },
    };
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      return {
        valid: true,
        user: {
          id: decoded.sub,
          username: decoded.username,
          isGuest: decoded.isGuest,
        },
      };
    } catch {
      return { valid: false, error: "Invalid or expired token" };
    }
  }

  private issueToken(user: AuthUser): TokenPair {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      isGuest: user.isGuest,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiry,
    });

    return { accessToken, expiresIn: this.tokenExpiry };
  }
}
