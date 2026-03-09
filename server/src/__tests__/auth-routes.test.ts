import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthRouter } from "../auth/routes.js";
import type {
  AuthProvider,
  RegisterResult,
  LoginResult,
  TokenValidationResult,
} from "../auth/AuthProvider.js";
import type { Request, Response, NextFunction } from "express";

// ── Mock Helpers ────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: Record<string, unknown> | null;
  status: (code: number) => MockResponse;
  json: (data: Record<string, unknown>) => void;
}

function mockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      res.body = data;
    },
  };
  return res;
}

interface TestAuthProvider extends AuthProvider {
  register: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  createGuestSession: ReturnType<typeof vi.fn>;
  upgradeGuest: ReturnType<typeof vi.fn>;
  validateToken: ReturnType<typeof vi.fn>;
}

function mockAuthProvider(): TestAuthProvider {
  return {
    register: vi.fn(),
    login: vi.fn(),
    createGuestSession: vi.fn(),
    upgradeGuest: vi.fn(),
    validateToken: vi.fn(),
  };
}

/**
 * Extract route handler from the Express router.
 * Router stores routes in the stack; we match by path + method.
 */
interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => void }>;
  };
  handle?: (req: Request, res: Response, next: NextFunction) => void;
  regexp?: RegExp;
  name?: string;
}

function getHandler(
  router: ReturnType<typeof createAuthRouter>,
  method: string,
  path: string
): ((req: Request, res: Response, next: NextFunction) => void) | undefined {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method]
    ) {
      // Return the last handler in the route stack (skip middleware)
      const handlers = layer.route.stack;
      return handlers[handlers.length - 1].handle;
    }
  }
  return undefined;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Auth Routes", () => {
  let provider: TestAuthProvider;

  beforeEach(() => {
    provider = mockAuthProvider();
  });

  // ── POST /register ────────────────────────────────────────────────

  describe("POST /register", () => {
    it("returns 400 when username is missing", async () => {
      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/register");
      const req = { body: { password: "password123" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Username and password are required" });
    });

    it("returns 400 when password is missing", async () => {
      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/register");
      const req = { body: { username: "testuser" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Username and password are required" });
    });

    it("returns 400 when registration fails", async () => {
      provider.register.mockResolvedValue({
        success: false,
        error: "Username already taken",
      } satisfies RegisterResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/register");
      const req = { body: { username: "taken", password: "password123" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Username already taken" });
    });

    it("returns 201 with user and token on successful registration", async () => {
      provider.register.mockResolvedValue({
        success: true,
        user: { id: "u1", username: "newuser", isGuest: false },
      } satisfies RegisterResult);
      provider.login.mockResolvedValue({
        success: true,
        user: { id: "u1", username: "newuser", isGuest: false },
        token: { accessToken: "jwt.token", expiresIn: 86400 },
      } satisfies LoginResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/register");
      const req = { body: { username: "newuser", password: "password123" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty("user");
      expect(res.body).toHaveProperty("token");
    });

    it("returns 500 when registration succeeds but auto-login fails", async () => {
      provider.register.mockResolvedValue({
        success: true,
        user: { id: "u1", username: "newuser", isGuest: false },
      } satisfies RegisterResult);
      provider.login.mockResolvedValue({
        success: false,
        error: "Unexpected error",
      } satisfies LoginResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/register");
      const req = { body: { username: "newuser", password: "password123" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Registration succeeded but login failed" });
    });
  });

  // ── POST /login ───────────────────────────────────────────────────

  describe("POST /login", () => {
    it("returns 400 when credentials are missing", async () => {
      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/login");
      const req = { body: {} } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 on invalid credentials", async () => {
      provider.login.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      } satisfies LoginResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/login");
      const req = { body: { username: "wrong", password: "wrong" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Invalid credentials" });
    });

    it("returns 200 with user and token on successful login", async () => {
      provider.login.mockResolvedValue({
        success: true,
        user: { id: "u1", username: "user", isGuest: false },
        token: { accessToken: "jwt.token", expiresIn: 86400 },
      } satisfies LoginResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/login");
      const req = { body: { username: "user", password: "password" } } as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("user");
      expect(res.body).toHaveProperty("token");
    });
  });

  // ── POST /guest ───────────────────────────────────────────────────

  describe("POST /guest", () => {
    it("returns 201 with guest user and token", async () => {
      provider.createGuestSession.mockResolvedValue({
        success: true,
        user: { id: "g1", username: "Guest_abc", isGuest: true },
        token: { accessToken: "guest.jwt", expiresIn: 86400 },
      } satisfies LoginResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/guest");
      const req = {} as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty("user");
      expect(res.body).toHaveProperty("token");
    });

    it("returns 500 when guest creation fails", async () => {
      provider.createGuestSession.mockResolvedValue({
        success: false,
        error: "DB error",
      } satisfies LoginResult);

      const router = createAuthRouter(provider);
      const handler = getHandler(router, "post", "/guest");
      const req = {} as Request;
      const res = mockResponse();

      await handler!(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /upgrade ─────────────────────────────────────────────────

  describe("POST /upgrade", () => {
    it("returns 400 when user is not a guest", async () => {
      provider.validateToken.mockResolvedValue({
        valid: true,
        user: { id: "u1", username: "regular", isGuest: false },
      } satisfies TokenValidationResult);

      const router = createAuthRouter(provider);
      // The upgrade route has middleware, so we need to test it differently.
      // The first handler in the stack is the middleware, the second is the route handler.
      const stack = (router as unknown as { stack: RouteLayer[] }).stack;
      const upgradeRoute = stack.find(
        (l) => l.route?.path === "/upgrade" && l.route?.methods?.post
      );
      expect(upgradeRoute).toBeDefined();

      // Simulate passing through middleware by setting req.user directly
      const req = {
        body: { username: "newname", password: "password123" },
        user: { id: "u1", username: "regular", isGuest: false },
        headers: { authorization: "Bearer valid.token" },
      } as unknown as Request;
      const res = mockResponse();

      // Get the last handler (after middleware)
      const handlers = upgradeRoute!.route!.stack;
      const routeHandler = handlers[handlers.length - 1].handle;
      await routeHandler(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Only guest accounts can be upgraded" });
    });

    it("returns 400 when upgrade credentials are missing", async () => {
      const router = createAuthRouter(provider);
      const stack = (router as unknown as { stack: RouteLayer[] }).stack;
      const upgradeRoute = stack.find(
        (l) => l.route?.path === "/upgrade" && l.route?.methods?.post
      );

      const req = {
        body: {},
        user: { id: "g1", username: "Guest_abc", isGuest: true },
        headers: { authorization: "Bearer valid.token" },
      } as unknown as Request;
      const res = mockResponse();

      const handlers = upgradeRoute!.route!.stack;
      const routeHandler = handlers[handlers.length - 1].handle;
      await routeHandler(req, res as unknown as Response, vi.fn());

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "Username and password are required" });
    });
  });

  // ── Route registration ────────────────────────────────────────────

  describe("route registration", () => {
    it("registers all four auth routes", () => {
      const router = createAuthRouter(provider);
      const stack = (router as unknown as { stack: RouteLayer[] }).stack;
      const routes = stack
        .filter((l) => l.route)
        .map((l) => ({ path: l.route!.path, methods: Object.keys(l.route!.methods) }));

      expect(routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "/register" }),
          expect.objectContaining({ path: "/login" }),
          expect.objectContaining({ path: "/guest" }),
          expect.objectContaining({ path: "/upgrade" }),
        ])
      );
    });

    it("all routes use POST method", () => {
      const router = createAuthRouter(provider);
      const stack = (router as unknown as { stack: RouteLayer[] }).stack;
      for (const layer of stack) {
        if (layer.route) {
          expect(layer.route.methods.post).toBe(true);
        }
      }
    });
  });
});
