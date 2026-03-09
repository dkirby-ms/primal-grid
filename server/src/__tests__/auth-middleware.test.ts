import { describe, it, expect, vi, beforeEach } from "vitest";
import { authMiddleware } from "../auth/middleware.js";
import type { AuthProvider, TokenValidationResult, AuthUser } from "../auth/AuthProvider.js";
import type { Request, Response, NextFunction } from "express";

// ── Helpers ─────────────────────────────────────────────────────────

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

interface MockRequest {
  headers: Record<string, string>;
  user?: AuthUser;
}

function mockRequest(authHeader?: string): MockRequest {
  const req: MockRequest = { headers: {} };
  if (authHeader !== undefined) {
    req.headers.authorization = authHeader;
  }
  return req;
}

function mockAuthProvider(validateResult: TokenValidationResult): AuthProvider {
  return {
    register: vi.fn(),
    login: vi.fn(),
    createGuestSession: vi.fn(),
    upgradeGuest: vi.fn(),
    validateToken: vi.fn().mockResolvedValue(validateResult),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it("rejects request with no authorization header", async () => {
    const provider = mockAuthProvider({ valid: true, user: { id: "1", username: "u", isGuest: false } });
    const middleware = authMiddleware(provider);
    const req = mockRequest();
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing or invalid authorization header" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request with non-Bearer auth header", async () => {
    const provider = mockAuthProvider({ valid: true, user: { id: "1", username: "u", isGuest: false } });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Basic dXNlcjpwYXNz");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request with invalid token", async () => {
    const provider = mockAuthProvider({ valid: false, error: "Token expired" });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer invalid.token.here");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Token expired" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request when token is valid but user is missing", async () => {
    const provider = mockAuthProvider({ valid: true });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer some.token.here");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes valid request and attaches user to req", async () => {
    const user: AuthUser = { id: "user-123", username: "validuser", isGuest: false };
    const provider = mockAuthProvider({ valid: true, user });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer valid.token.here");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as MockRequest & { user: AuthUser }).user).toEqual(user);
  });

  it("calls validateToken with the token from the Bearer header", async () => {
    const provider = mockAuthProvider({ valid: true, user: { id: "1", username: "u", isGuest: false } });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer my-special-token-123");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(provider.validateToken).toHaveBeenCalledWith("my-special-token-123");
  });

  it("strips 'Bearer ' prefix correctly (7 chars)", async () => {
    const provider = mockAuthProvider({ valid: true, user: { id: "1", username: "u", isGuest: false } });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer abc");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(provider.validateToken).toHaveBeenCalledWith("abc");
  });

  it("defaults error message when provider returns no error string", async () => {
    const provider = mockAuthProvider({ valid: false });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer some.token");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid token" });
  });

  it("handles guest user tokens correctly", async () => {
    const guestUser: AuthUser = { id: "guest-1", username: "Guest_abc", isGuest: true };
    const provider = mockAuthProvider({ valid: true, user: guestUser });
    const middleware = authMiddleware(provider);
    const req = mockRequest("Bearer guest.token");
    const res = mockResponse();

    await middleware(req as unknown as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as MockRequest & { user: AuthUser }).user.isGuest).toBe(true);
  });
});
