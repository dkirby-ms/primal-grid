import type { Page } from '@playwright/test';

export interface RecordedMessage {
  direction: 'sent' | 'received';
  type: string;
  data: unknown;
  timestamp: number;
}

/**
 * Install a WebSocket message recorder on the page.
 * Hooks into `window.__ROOM__`'s Colyseus message handlers to record
 * sent and received messages for later assertion.
 *
 * Call this AFTER the room is connected (after joinGame / waitForPlayerCount).
 */
export async function installMessageRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as {
      __ROOM__?: any;
      __WS_MESSAGES__?: any[];
      __WS_RECORDER_INSTALLED__?: boolean;
    };

    if (win.__WS_RECORDER_INSTALLED__) return;
    win.__WS_MESSAGES__ = [];
    win.__WS_RECORDER_INSTALLED__ = true;

    const room = win.__ROOM__;
    if (!room) return;

    // Intercept outgoing messages by wrapping room.send
    const originalSend = room.send.bind(room);
    room.send = (type: string, data?: unknown) => {
      win.__WS_MESSAGES__!.push({
        direction: 'sent',
        type,
        data: data ?? null,
        timestamp: Date.now(),
      });
      return originalSend(type, data);
    };

    // Record incoming messages by listening on the room's onMessage
    room.onMessage('*', (type: string | number, message: unknown) => {
      win.__WS_MESSAGES__!.push({
        direction: 'received',
        type: String(type),
        data: message ?? null,
        timestamp: Date.now(),
      });
    });
  });
}

/**
 * Get all recorded WebSocket messages, optionally filtered.
 */
export async function getRecordedMessages(
  page: Page,
  filter?: { direction?: 'sent' | 'received'; type?: string },
): Promise<RecordedMessage[]> {
  return page.evaluate((f) => {
    const messages = (window as unknown as { __WS_MESSAGES__?: any[] }).__WS_MESSAGES__ || [];

    if (!f) return messages;

    return messages.filter((m: any) => {
      if (f.direction && m.direction !== f.direction) return false;
      if (f.type && m.type !== f.type) return false;
      return true;
    });
  }, filter);
}

/**
 * Clear the recorded message buffer.
 */
export async function clearRecordedMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __WS_MESSAGES__?: any[] }).__WS_MESSAGES__ = [];
  });
}

/**
 * Wait until a message of the specified type appears in the recording.
 */
export async function waitForMessage(
  page: Page,
  type: string,
  direction: 'sent' | 'received' = 'received',
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    ({ t, d }: { t: string; d: string }) => {
      const messages = (window as unknown as { __WS_MESSAGES__?: any[] }).__WS_MESSAGES__ || [];
      return messages.some((m: any) => m.type === t && m.direction === d);
    },
    { t: type, d: direction },
    { timeout },
  );
}

/**
 * Get the count of messages matching a filter.
 */
export async function getMessageCount(
  page: Page,
  filter?: { direction?: 'sent' | 'received'; type?: string },
): Promise<number> {
  const messages = await getRecordedMessages(page, filter);
  return messages.length;
}

/**
 * Send a game message through the room and record it.
 * Ensures the message recorder captures the outgoing message.
 */
export async function sendAndRecord(
  page: Page,
  type: string,
  data?: unknown,
): Promise<void> {
  await page.evaluate(
    ({ t, d }: { t: string; d: unknown }) => {
      const room = (window as unknown as { __ROOM__?: any }).__ROOM__;
      if (!room) throw new Error('Room not connected');
      room.send(t, d);
    },
    { t: type, d: data ?? null },
  );
}
