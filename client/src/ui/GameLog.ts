const MAX_ENTRIES = 50;

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  spawn:  { icon: '🔨', color: '#7ecfff' },
  death:  { icon: '💀', color: '#ff6b6b' },
  combat: { icon: '⚔️', color: '#ffaa44' },
  info:   { icon: 'ℹ️', color: '#888' },
};

/**
 * Scrolling game-log panel that displays server events.
 */
export class GameLog {
  private container!: HTMLElement;
  private entryCount = 0;

  /** Attach to the log container element. */
  init(container: HTMLElement): void {
    this.container = container;
    this.addEntry('Game log initialized', 'info');
  }

  /** Append a log entry, auto-scroll, and cap at MAX_ENTRIES. */
  addEntry(message: string, type: string): void {
    const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG['info'];

    const line = document.createElement('div');
    line.className = 'log-entry';

    const prefix = document.createElement('span');
    prefix.className = 'log-prefix';
    prefix.style.color = cfg.color;
    prefix.textContent = cfg.icon;

    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = ` ${message}`;

    line.appendChild(prefix);
    line.appendChild(text);
    this.container.appendChild(line);
    this.entryCount++;

    // Evict oldest entries beyond the cap
    while (this.entryCount > MAX_ENTRIES) {
      this.container.removeChild(this.container.firstChild!);
      this.entryCount--;
    }

    // Auto-scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }
}
