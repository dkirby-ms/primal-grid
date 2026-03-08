import { Client, Room } from '@colyseus/sdk';
import { SERVER_PORT } from '@primal-grid/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;

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

function isDevMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('dev') === '1' || params.get('devmode') === '1';
}

export async function connect(): Promise<Room> {
  const client = new Client(getServerUrl());
  statusCallback?.('connecting');
  console.log('[network] Connecting to server…');

  const joinOptions: Record<string, unknown> = {};
  if (isDevMode()) {
    joinOptions.devMode = true;
    console.log('[network] Dev mode enabled — fog of war disabled');
  }

  try {
    room = await client.joinOrCreate('game', joinOptions);
    console.log('[network] Joined room:', room.roomId);
    statusCallback?.('connected');

    // Expose room reference for Playwright E2E testing (dev mode only)
    if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev')) {
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
