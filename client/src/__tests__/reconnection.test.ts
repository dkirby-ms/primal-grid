/**
 * Client-side reconnection lifecycle tests.
 * Validates token persistence, exponential backoff, token rotation,
 * and bootstrap-independent reconnection.
 * Issue #101 — Browser refresh drops user session.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Global stubs (Node.js environment — no browser APIs)
// ---------------------------------------------------------------------------

const sessionStore: Record<string, string> = {};
const localStore: Record<string, string> = {};

vi.stubGlobal('sessionStorage', {
  getItem: vi.fn((key: string) => sessionStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete sessionStore[key]; }),
});

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => localStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStore[key]; }),
});

vi.stubGlobal('window', {
  location: { search: '', protocol: 'http:', host: 'localhost:3000' },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

vi.stubGlobal('fetch', vi.fn());

// ---------------------------------------------------------------------------
// Mock Colyseus SDK
// ---------------------------------------------------------------------------

let leaveHandler: ((code: number) => void) | null = null;

function makeMockRoom(token = 'mock-reconnect-token') {
  leaveHandler = null;
  return {
    reconnectionToken: token,
    roomId: 'room-1',
    sessionId: 'sess-1',
    onDrop: vi.fn(),
    onReconnect: vi.fn(),
    onLeave: vi.fn((cb: (code: number) => void) => { leaveHandler = cb; }),
    onError: vi.fn(),
    leave: vi.fn().mockResolvedValue(undefined),
  };
}

const mockClient = {
  reconnect: vi.fn(),
  joinOrCreate: vi.fn(),
  joinById: vi.fn(),
};

vi.mock('@colyseus/sdk', () => ({
  Client: function Client() { return mockClient; },
  Room: function Room() {},
}));

vi.mock('@primal-grid/shared', () => ({
  SERVER_PORT: 3000,
}));

// ---------------------------------------------------------------------------
// Tests — reimport network module per test for clean module-level state
// ---------------------------------------------------------------------------

describe('Client reconnection lifecycle (#101)', () => {
  let net: typeof import('../network.js');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Reset storage state
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    for (const k of Object.keys(localStore)) delete localStore[k];

    // Default mock setup
    const defaultRoom = makeMockRoom();
    mockClient.joinById.mockResolvedValue(defaultRoom);
    mockClient.reconnect.mockResolvedValue(defaultRoom);

    net = await import('../network.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Token persistence ---

  describe('Token persistence', () => {
    it("saves reconnect token to sessionStorage under 'primal-grid-reconnect-token' on join", async () => {
      const room = makeMockRoom('join-token-abc');
      mockClient.joinById.mockResolvedValue(room);

      await net.joinGameRoom('room-1');

      expect(sessionStorage.setItem).toHaveBeenCalledWith(
        'primal-grid-reconnect-token',
        'join-token-abc',
      );
      expect(sessionStore['primal-grid-reconnect-token']).toBe('join-token-abc');
    });

    it("reads token from sessionStorage when attempting reconnection", async () => {
      sessionStore['primal-grid-reconnect-token'] = 'stored-token';
      const room = makeMockRoom('fresh');
      mockClient.reconnect.mockResolvedValue(room);

      await net.reconnectGameRoom();

      expect(sessionStorage.getItem).toHaveBeenCalledWith('primal-grid-reconnect-token');
      expect(mockClient.reconnect).toHaveBeenCalledWith('stored-token');
    });
  });

  // --- Token lifecycle ---

  describe('Token lifecycle', () => {
    it("clears token on consented leave (code 1000)", async () => {
      const room = makeMockRoom();
      mockClient.joinById.mockResolvedValue(room);
      await net.joinGameRoom('room-1');
      expect(sessionStore['primal-grid-reconnect-token']).toBe('mock-reconnect-token');

      leaveHandler?.(1000);

      expect(sessionStore['primal-grid-reconnect-token']).toBeUndefined();
    });

    it("clears token on consented leave (code 4000)", async () => {
      const room = makeMockRoom();
      mockClient.joinById.mockResolvedValue(room);
      await net.joinGameRoom('room-1');

      leaveHandler?.(4000);

      expect(sessionStore['primal-grid-reconnect-token']).toBeUndefined();
    });

    it("clears token on unexpected disconnect (SDK handles retries, no duplicate reconnect)", async () => {
      const room = makeMockRoom();
      mockClient.joinById.mockResolvedValue(room);

      await net.joinGameRoom('room-1');
      expect(sessionStore['primal-grid-reconnect-token']).toBe('mock-reconnect-token');

      // Non-consented disconnect — onLeave means SDK gave up.
      // Token should be cleared and reconnectGameRoom() should NOT be called.
      leaveHandler?.(1006);
      expect(sessionStore['primal-grid-reconnect-token']).toBeUndefined();
      expect(mockClient.reconnect).not.toHaveBeenCalled();
    });

    it("onLeave with non-consented code emits disconnected and clears token", async () => {
      const room = makeMockRoom();
      mockClient.joinById.mockResolvedValue(room);
      await net.joinGameRoom('room-1');

      const statuses: string[] = [];
      net.onConnectionStatus((s) => statuses.push(s));

      leaveHandler?.(1006);

      expect(statuses).toContain('disconnected');
      expect(sessionStore['primal-grid-reconnect-token']).toBeUndefined();
    });

    it("onLeave does NOT call reconnectGameRoom for non-consented disconnects", async () => {
      const room = makeMockRoom();
      mockClient.joinById.mockResolvedValue(room);
      await net.joinGameRoom('room-1');
      mockClient.reconnect.mockClear();

      leaveHandler?.(1006);

      // reconnectGameRoom() calls client.reconnect — should NOT be invoked
      expect(mockClient.reconnect).not.toHaveBeenCalled();
    });

    it("clears token on explicit leaveGame()", async () => {
      const room = makeMockRoom();
      mockClient.joinById.mockResolvedValue(room);
      await net.joinGameRoom('room-1');
      expect(sessionStore['primal-grid-reconnect-token']).toBe('mock-reconnect-token');

      await net.leaveGame();

      expect(sessionStore['primal-grid-reconnect-token']).toBeUndefined();
    });
  });

  // --- reconnectGameRoom() ---

  describe('reconnectGameRoom()', () => {
    it("returns null when no token is stored (no reconnection attempted)", async () => {
      const result = await net.reconnectGameRoom();

      expect(result).toBeNull();
      expect(mockClient.reconnect).not.toHaveBeenCalled();
    });

    it("uses stored token for reconnection", async () => {
      sessionStore['primal-grid-reconnect-token'] = 'my-token';
      const room = makeMockRoom('new-token');
      mockClient.reconnect.mockResolvedValue(room);

      const result = await net.reconnectGameRoom();

      expect(result).not.toBeNull();
      expect(mockClient.reconnect).toHaveBeenCalledWith('my-token');
    });

    it("attempts 5 reconnections with exponential backoff (1s, 2s, 4s, 8s delays)", async () => {
      vi.useFakeTimers();
      sessionStore['primal-grid-reconnect-token'] = 'token';
      mockClient.reconnect.mockRejectedValue(new Error('refused'));

      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      const promise = net.reconnectGameRoom();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeNull();
      expect(mockClient.reconnect).toHaveBeenCalledTimes(5);

      // Verify the backoff delay values
      const delays = setTimeoutSpy.mock.calls
        .map((call) => call[1])
        .filter((d): d is number => typeof d === 'number' && d >= 1000);
      expect(delays).toEqual([1000, 2000, 4000, 8000]);

      setTimeoutSpy.mockRestore();
    });

    it("clears token after all 5 reconnection attempts fail", async () => {
      vi.useFakeTimers();
      sessionStore['primal-grid-reconnect-token'] = 'doomed';
      mockClient.reconnect.mockRejectedValue(new Error('fail'));

      const promise = net.reconnectGameRoom();
      await vi.runAllTimersAsync();
      await promise;

      expect(sessionStore['primal-grid-reconnect-token']).toBeUndefined();
    });

    it("succeeds on first attempt without any delays", async () => {
      sessionStore['primal-grid-reconnect-token'] = 'token';
      const room = makeMockRoom('fresh');
      mockClient.reconnect.mockResolvedValue(room);

      const result = await net.reconnectGameRoom();

      expect(result).not.toBeNull();
      expect(mockClient.reconnect).toHaveBeenCalledTimes(1);
    });

    it("succeeds after partial failures (retries work)", async () => {
      vi.useFakeTimers();
      sessionStore['primal-grid-reconnect-token'] = 'token';
      const room = makeMockRoom('rotated');
      mockClient.reconnect
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce(room);

      const promise = net.reconnectGameRoom();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).not.toBeNull();
      expect(mockClient.reconnect).toHaveBeenCalledTimes(3);
    });
  });

  // --- Token rotation ---

  describe('Token rotation', () => {
    it("saves fresh reconnectionToken after successful reconnect", async () => {
      sessionStore['primal-grid-reconnect-token'] = 'old-token';
      const freshRoom = makeMockRoom('rotated-fresh-token');
      mockClient.reconnect.mockResolvedValue(freshRoom);

      await net.reconnectGameRoom();

      expect(sessionStore['primal-grid-reconnect-token']).toBe('rotated-fresh-token');
    });
  });

  // --- Bootstrap independence ---

  describe('Bootstrap independence', () => {
    it("reconnects using stored token without lobby flow", async () => {
      // Token in sessionStorage as if left from a previous page load
      sessionStore['primal-grid-reconnect-token'] = 'bootstrap-token';
      const room = makeMockRoom('post-reconnect');
      mockClient.reconnect.mockResolvedValue(room);

      // Call reconnectGameRoom directly — no connectToLobby / joinGameRoom
      const result = await net.reconnectGameRoom();

      expect(result).not.toBeNull();
      expect(mockClient.reconnect).toHaveBeenCalledWith('bootstrap-token');
    });
  });

  // --- getRoom() ---

  describe('getRoom()', () => {
    it("returns the reconnected room after successful reconnect", async () => {
      sessionStore['primal-grid-reconnect-token'] = 'token';
      const room = makeMockRoom('fresh');
      mockClient.reconnect.mockResolvedValue(room);

      await net.reconnectGameRoom();
      const result = net.getRoom();

      expect(result).not.toBeNull();
      expect(result).toBe(room);
    });

    it("returns null after all reconnection attempts fail", async () => {
      vi.useFakeTimers();
      sessionStore['primal-grid-reconnect-token'] = 'token';
      mockClient.reconnect.mockRejectedValue(new Error('fail'));

      const promise = net.reconnectGameRoom();
      await vi.runAllTimersAsync();
      await promise;

      expect(net.getRoom()).toBeNull();
    });
  });
});
