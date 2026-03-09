import { Client, Room } from '@colyseus/sdk';
import { SERVER_PORT } from '@primal-grid/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;

const TOKEN_KEY = 'primal-grid-token';

interface AuthResponse {
  user: { id: string; username: string; isGuest: boolean };
  token: { accessToken: string; expiresIn: number };
}

let room: Room | null = null;
let statusCallback: StatusCallback | null = null;

export function onConnectionStatus(cb: StatusCallback): void {
  statusCallback = cb;
}

function getServerUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string;
  }
  if (import.meta.env.PROD) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${location.host}`;
  }
  return `ws://localhost:${SERVER_PORT}`;
}

/** Derive an HTTP URL from the WebSocket server URL for auth API calls. */
function getHttpUrl(): string {
  const wsUrl = getServerUrl();
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://');
}

export function isDevMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('dev') === '1' || params.get('devmode') === '1';
}

// ---------------------------------------------------------------------------
// Auth helpers — silent guest flow, token persistence
// ---------------------------------------------------------------------------

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage full or blocked — continue without persistence
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore
  }
}

/** Create a guest session and return the JWT access token. */
async function createGuestSession(): Promise<string> {
  const url = `${getHttpUrl()}/auth/guest`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Guest auth failed: ${res.status}`);
  }
  const data: AuthResponse = await res.json() as AuthResponse;
  return data.token.accessToken;
}

/**
 * Ensure we have a valid token. On first visit, silently creates a guest
 * session. On return visit, reuses the stored token. If the server rejects
 * the token during room join, the caller will retry with a fresh guest token.
 */
async function ensureToken(): Promise<string> {
  const existing = loadToken();
  if (existing) {
    return existing;
  }
  console.log('[auth] No stored token — creating guest session');
  const token = await createGuestSession();
  saveToken(token);
  return token;
}

export async function connect(): Promise<Room> {
  const client = new Client(getServerUrl());
  statusCallback?.('connecting');
  console.log('[network] Connecting to server…');

  const token = await ensureToken();

  const joinOptions: Record<string, unknown> = { token };
  if (isDevMode()) {
    joinOptions.devMode = true;
    console.log('[network] Dev mode enabled — fog of war disabled');
  }

  try {
    room = await client.joinOrCreate('game', joinOptions);
    console.log('[network] Joined room:', room.roomId);
    statusCallback?.('connected');

    // Expose room reference for Playwright E2E testing (dev mode only)
    if (import.meta.env.DEV || isDevMode()) {
      (window as unknown as Record<string, unknown>).__ROOM__ = room;
    }

    room.onLeave(() => {
      console.log('[network] Left room');
      statusCallback?.('disconnected');
      room = null;
    });

    room.onError((code, message) => {
      console.error('[network] Room error:', code, message);
      statusCallback?.('error');
    });

    return room;
  } catch (err) {
    // If join failed, the token may be expired — clear and retry once
    const isRetryable =
      err instanceof Error &&
      (err.message.includes('token') || err.message.includes('401'));

    if (isRetryable && loadToken()) {
      console.log('[auth] Token rejected — refreshing guest session');
      clearToken();
      const freshToken = await createGuestSession();
      saveToken(freshToken);
      joinOptions.token = freshToken;

      try {
        room = await client.joinOrCreate('game', joinOptions);
        console.log('[network] Joined room (retry):', room.roomId);
        statusCallback?.('connected');

        if (import.meta.env.DEV || isDevMode()) {
          (window as unknown as Record<string, unknown>).__ROOM__ = room;
        }

        room.onLeave(() => {
          console.log('[network] Left room');
          statusCallback?.('disconnected');
          room = null;
        });
        room.onError((code, message) => {
          console.error('[network] Room error:', code, message);
          statusCallback?.('error');
        });

        return room;
      } catch (retryErr) {
        console.error('[network] Retry connection failed:', retryErr);
        statusCallback?.('disconnected');
        throw retryErr;
      }
    }

    console.error('[network] Connection failed:', err);
    statusCallback?.('disconnected');
    throw err;
  }
}

export function getRoom(): Room | null {
  return room;
}

export async function disconnect(): Promise<void> {
  if (room) {
    await room.leave();
    room = null;
  }
}
