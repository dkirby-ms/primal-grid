import type { Request, Response, NextFunction } from "express";
import type { AuthProvider, AuthUser } from "./AuthProvider.js";

/** Extends Express Request with authenticated user info. */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Express middleware that validates JWT from Authorization header.
 * Attaches decoded user to req.user if valid.
 */
export function authMiddleware(authProvider: AuthProvider) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    const result = await authProvider.validateToken(token);

    if (!result.valid || !result.user) {
      res.status(401).json({ error: result.error ?? "Invalid token" });
      return;
    }

    req.user = result.user;
    next();
  };
}
