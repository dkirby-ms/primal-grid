import { Router } from "express";
import type { AuthProvider } from "./AuthProvider.js";
import { authMiddleware, type AuthenticatedRequest } from "./middleware.js";

/**
 * Creates Express router for auth endpoints.
 * POST /auth/register — create account with username+password
 * POST /auth/login    — authenticate and get JWT
 * POST /auth/guest    — create guest session with temporary JWT
 * POST /auth/upgrade  — upgrade guest account to full account (requires auth)
 * POST /auth/refresh — exchange refresh token for new token pair
 */
export function createAuthRouter(authProvider: AuthProvider): Router {
  const router = Router();

  router.post("/register", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const result = await authProvider.register(username, password);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Auto-login after registration
    const loginResult = await authProvider.login(username, password);
    if (!loginResult.success) {
      res.status(500).json({ error: "Registration succeeded but login failed" });
      return;
    }

    res.status(201).json({
      user: loginResult.user,
      token: loginResult.token,
    });
  });

  router.post("/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const result = await authProvider.login(username, password);
    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      user: result.user,
      token: result.token,
    });
  });

  router.post("/guest", async (_req, res) => {
    const result = await authProvider.createGuestSession();
    if (!result.success) {
      res.status(500).json({ error: "Failed to create guest session" });
      return;
    }

    res.status(201).json({
      user: result.user,
      token: result.token,
    });
  });

  router.post("/upgrade", authMiddleware(authProvider), async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;
    if (!user?.isGuest) {
      res.status(400).json({ error: "Only guest accounts can be upgraded" });
      return;
    }

    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const result = await authProvider.upgradeGuest(user.id, username, password);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Issue new token with updated identity
    const loginResult = await authProvider.login(username, password);
    if (!loginResult.success) {
      res.status(500).json({ error: "Upgrade succeeded but re-login failed" });
      return;
    }

    res.json({
      user: loginResult.user,
      token: loginResult.token,
    });
  });

  router.post("/refresh", async (req, res) => {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    const result = await authProvider.refreshToken(refreshToken);
    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      user: result.user,
      token: result.token,
    });
  });

  return router;
}
