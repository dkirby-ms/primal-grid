import { Client, Room } from '@colyseus/sdk';
import { SERVER_PORT } from '@primal-grid/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type StatusCallback = (status: ConnectionStatus) => void;

let room: Room | null = null;
let statusCallback: StatusCallback | null = null;

export function onConnectionStatus(cb: StatusCallback): void {
  statusCallback = cb;
}

export async function connect(): Promise<Room> {
  const client = new Client(`ws://localhost:${SERVER_PORT}`);
  statusCallback?.('connecting');
  console.log('[network] Connecting to server…');

  try {
    room = await client.joinOrCreate('game');
    console.log('[network] Joined room:', room.roomId);
    statusCallback?.('connected');

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
