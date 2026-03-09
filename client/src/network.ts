import { Client, Room } from '@colyseus/sdk';
import { SERVER_PORT } from '@primal-grid/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;

const TOKEN_KEY = 'primal-grid-token';

interface AuthResponse {
  user: { id: string; username: string; isGuest: boolean };
  token: { accessToken: string; expiresIn: number };
}

let lobbyRoom: Room | null = null;
let gameRoom: Room | null = null;
let colyseusClient: Client | null = null;
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
 * session. On return visit, reuses the stored token. Returns undefined if
 * auth is unavailable — the game remains playable without persistence.
 */
async function ensureToken(): Promise<string | undefined> {
  const existing = loadToken();
  if (existing) {
    return existing;
  }
  try {
    console.log('[auth] No stored token — creating guest session');
    const token = await createGuestSession();
    saveToken(token);
    return token;
  } catch (err) {
    console.warn('[auth] Guest auth unavailable — continuing without session persistence', err);
    return undefined;
  }
}

function getClient(): Client {
  if (!colyseusClient) {
    colyseusClient = new Client(getServerUrl());
  }
  return colyseusClient;
}

// ---------------------------------------------------------------------------
// Lobby connection — connects to the LobbyRoom
// ---------------------------------------------------------------------------

/**
 * Connect to the lobby. Returns the lobby Room for binding UI.
 * Identity (JWT) is established here.
 */
export async function connectToLobby(displayName?: string): Promise<Room> {
  const client = getClient();
  statusCallback?.('connecting');
  console.log('[network] Connecting to lobby…');

  const token = await ensureToken();

  const joinOptions: Record<string, unknown> = {};
  if (token) joinOptions.token = token;
  if (displayName) joinOptions.displayName = displayName;

  try {
    lobbyRoom = await client.joinOrCreate('lobby', joinOptions);
    console.log('[network] Joined lobby:', lobbyRoom.roomId);
    statusCallback?.('connected');

    lobbyRoom.onLeave(() => {
      console.log('[network] Left lobby');
      lobbyRoom = null;
    });

    lobbyRoom.onError((code, message) => {
      console.error('[network] Lobby error:', code, message);
    });

    return lobbyRoom;
  } catch (err) {
    // Token may be expired — clear and retry
    if (token && err instanceof Error && (err.message.includes('token') || err.message.includes('401'))) {
      console.log('[auth] Token rejected — refreshing guest session');
      clearToken();
      try {
        const freshToken = await createGuestSession();
        saveToken(freshToken);
        joinOptions.token = freshToken;
      } catch {
        delete joinOptions.token;
      }

      lobbyRoom = await client.joinOrCreate('lobby', joinOptions);
      console.log('[network] Joined lobby (retry):', lobbyRoom.roomId);
      statusCallback?.('connected');
      return lobbyRoom;
    }

    console.error('[network] Lobby connection failed:', err);
    statusCallback?.('error');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Game connection — joins a specific GameRoom by roomId
// ---------------------------------------------------------------------------

/**
 * Join a specific game room by its Colyseus roomId.
 * Called after receiving a GAME_JOINED event from the lobby.
 */
export async function joinGameRoom(roomId: string): Promise<Room> {
  const client = getClient();
  const token = loadToken();

  const joinOptions: Record<string, unknown> = {};
  if (token) joinOptions.token = token;
  if (isDevMode()) {
    joinOptions.devMode = true;
    console.log('[network] Dev mode enabled — fog of war disabled');
  }

  gameRoom = await client.joinById(roomId, joinOptions);
  console.log('[network] Joined game room:', gameRoom.roomId);

  if (import.meta.env.DEV || isDevMode()) {
    (window as unknown as Record<string, unknown>).__ROOM__ = gameRoom;
  }

  gameRoom.onLeave(() => {
    console.log('[network] Left game room');
    statusCallback?.('disconnected');
    gameRoom = null;
  });

  gameRoom.onError((code, message) => {
    console.error('[network] Game room error:', code, message);
    statusCallback?.('error');
  });

  return gameRoom;
}

/**
 * Legacy connect — directly joins a GameRoom (backwards compatibility).
 * Used when lobby is not available.
 */
export async function connect(): Promise<Room> {
  const client = getClient();
  statusCallback?.('connecting');
  console.log('[network] Connecting to server…');

  const token = await ensureToken();

  const joinOptions: Record<string, unknown> = {};
  if (token) joinOptions.token = token;
  if (isDevMode()) {
    joinOptions.devMode = true;
    console.log('[network] Dev mode enabled — fog of war disabled');
  }

  try {
    gameRoom = await client.joinOrCreate('game', joinOptions);
    console.log('[network] Joined room:', gameRoom.roomId);
    statusCallback?.('connected');

    if (import.meta.env.DEV || isDevMode()) {
      (window as unknown as Record<string, unknown>).__ROOM__ = gameRoom;
    }

    gameRoom.onLeave(() => {
      console.log('[network] Left room');
      statusCallback?.('disconnected');
      gameRoom = null;
    });

    gameRoom.onError((code, message) => {
      console.error('[network] Room error:', code, message);
      statusCallback?.('error');
    });

    return gameRoom;
  } catch (err) {
    if (token && err instanceof Error && (err.message.includes('token') || err.message.includes('401'))) {
      console.log('[auth] Token rejected — refreshing guest session');
      clearToken();
      try {
        const freshToken = await createGuestSession();
        saveToken(freshToken);
        joinOptions.token = freshToken;
      } catch {
        delete joinOptions.token;
      }

      gameRoom = await client.joinOrCreate('game', joinOptions);
      console.log('[network] Joined room (retry):', gameRoom.roomId);
      statusCallback?.('connected');
      return gameRoom;
    }

    console.error('[network] Connection failed:', err);
    statusCallback?.('disconnected');
    throw err;
  }
}

export function getLobbyRoom(): Room | null {
  return lobbyRoom;
}

export function getRoom(): Room | null {
  return gameRoom;
}

export async function leaveGame(): Promise<void> {
  if (gameRoom) {
    await gameRoom.leave();
    gameRoom = null;
  }
}

export async function disconnect(): Promise<void> {
  if (gameRoom) {
    await gameRoom.leave();
    gameRoom = null;
  }
  if (lobbyRoom) {
    await lobbyRoom.leave();
    lobbyRoom = null;
  }
}
