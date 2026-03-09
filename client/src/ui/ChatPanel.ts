/**
 * In-game chat overlay panel with scrollable message history,
 * text input, and Colyseus room integration.
 *
 * Follows the overlay-panel skill pattern (smart auto-scroll,
 * entry pruning, DOM-based rendering).
 */

import type { Room } from '@colyseus/sdk';

const MAX_MESSAGES = 100;
const AUTO_SCROLL_THRESHOLD_PX = 30;

interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export class ChatPanel {
  private container!: HTMLElement;
  private scrollArea!: HTMLElement;
  private inputField!: HTMLInputElement;
  private entryCount = 0;
  private userScrolledUp = false;
  private room: Room | null = null;
  private visible = false;

  /** Build DOM structure inside the given container and bind to room. */
  init(container: HTMLElement, room: Room): void {
    this.container = container;
    this.room = room;

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';

    const headerTitle = document.createElement('span');
    headerTitle.textContent = '💬 Chat';
    header.appendChild(headerTitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'chat-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close chat';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    container.appendChild(header);

    // Scrollable message area
    this.scrollArea = document.createElement('div');
    this.scrollArea.className = 'chat-scroll';
    container.appendChild(this.scrollArea);

    // Track scroll position for smart auto-scroll
    this.scrollArea.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.scrollArea;
      this.userScrolledUp =
        scrollHeight - scrollTop - clientHeight > AUTO_SCROLL_THRESHOLD_PX;
    });

    // Input area
    const inputRow = document.createElement('div');
    inputRow.className = 'chat-input-row';

    this.inputField = document.createElement('input');
    this.inputField.type = 'text';
    this.inputField.className = 'chat-input';
    this.inputField.placeholder = 'Type a message…';
    this.inputField.maxLength = 200;
    this.inputField.autocomplete = 'off';

    this.inputField.addEventListener('keydown', (e) => {
      // Stop all keyboard events from reaching the game when input is focused
      e.stopPropagation();

      if (e.key === 'Enter') {
        e.preventDefault();
        this.sendMessage();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.inputField.blur();
      }
    });

    inputRow.appendChild(this.inputField);
    container.appendChild(inputRow);

    // Listen for incoming chat messages from server
    room.onMessage('chat', (msg: ChatMessage) => {
      this.addMessage(msg.sender, msg.text, msg.timestamp);
    });

    this.addSystemMessage('Chat connected. Press Enter to type.');
  }

  /** Returns true when the chat input field has focus. */
  get isFocused(): boolean {
    return document.activeElement === this.inputField;
  }

  /** Focus the chat input field. */
  focus(): void {
    if (this.visible) {
      this.inputField.focus();
    }
  }

  /** Toggle panel visibility. */
  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'flex' : 'none';
    if (!this.visible) {
      this.inputField.blur();
    }
  }

  /** Show the panel. */
  show(): void {
    this.visible = true;
    this.container.style.display = 'flex';
  }

  /** Hide the panel. */
  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.inputField.blur();
  }

  /** Send the current input value to the server. */
  private sendMessage(): void {
    const text = this.inputField.value.trim();
    if (!text || !this.room) return;
    this.room.send('chat', { text });
    this.inputField.value = '';
  }

  /** Add a player chat message to the log. */
  private addMessage(sender: string, text: string, timestamp: number): void {
    const line = document.createElement('div');
    line.className = 'chat-entry';

    const ts = document.createElement('span');
    ts.className = 'chat-ts';
    ts.textContent = formatTimestamp(timestamp);

    const name = document.createElement('span');
    name.className = 'chat-sender';
    name.textContent = sender;

    const msg = document.createElement('span');
    msg.className = 'chat-msg';
    msg.textContent = text;

    line.appendChild(ts);
    line.appendChild(name);
    line.appendChild(msg);
    this.scrollArea.appendChild(line);
    this.entryCount++;

    this.pruneAndScroll();
  }

  /** Add a system/info message (no sender). */
  private addSystemMessage(text: string): void {
    const line = document.createElement('div');
    line.className = 'chat-entry chat-system';

    const msg = document.createElement('span');
    msg.className = 'chat-msg';
    msg.textContent = text;

    line.appendChild(msg);
    this.scrollArea.appendChild(line);
    this.entryCount++;

    this.pruneAndScroll();
  }

  /** Prune oldest entries and auto-scroll if following tail. */
  private pruneAndScroll(): void {
    while (this.entryCount > MAX_MESSAGES && this.scrollArea.firstChild) {
      this.scrollArea.removeChild(this.scrollArea.firstChild);
      this.entryCount--;
    }

    if (!this.userScrolledUp) {
      this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
    }
  }
}
