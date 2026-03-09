/**
 * Styled game-log overlay panel with categorised events, timestamps,
 * auto-scroll, and scroll-back support.
 *
 * Built as a reusable panel pattern — #30 (chat) will extract
 * the shared scroll / render / prune logic from this implementation.
 */

const MAX_ENTRIES = 200;
const AUTO_SCROLL_THRESHOLD_PX = 30;

interface CategoryStyle {
  dot: string;
  color: string;
}

/**
 * Maps server event types to visual categories.
 *
 * 🟢 Territory (claims, losses)
 * 🔴 Combat   (attacks, deaths)
 * 🟡 Resources(harvests, depletions)
 * 🔵 Creatures(spawns, migrations, taming)
 * ⚪ System   (join/leave, time of day)
 */
const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  // 🟢 Territory
  territory: { dot: '🟢', color: '#4caf50' },
  claim:     { dot: '🟢', color: '#4caf50' },

  // 🔴 Combat
  combat:    { dot: '🔴', color: '#f44336' },
  death:     { dot: '🔴', color: '#ef5350' },
  attack:    { dot: '🔴', color: '#f44336' },

  // 🟡 Resources
  resource:  { dot: '🟡', color: '#ffc107' },
  harvest:   { dot: '🟡', color: '#ffc107' },
  deplete:   { dot: '🟡', color: '#ffc107' },

  // 🔵 Creatures
  creature:  { dot: '🔵', color: '#42a5f5' },
  spawn:     { dot: '🔵', color: '#42a5f5' },
  tame:      { dot: '🔵', color: '#42a5f5' },
  migrate:   { dot: '🔵', color: '#42a5f5' },

  // ⚪ System (default / fallback)
  system:    { dot: '⚪', color: '#9e9e9e' },
  info:      { dot: '⚪', color: '#9e9e9e' },
};

const DEFAULT_STYLE: CategoryStyle = { dot: '⚪', color: '#9e9e9e' };

function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Scrolling game-log panel that displays categorised server events
 * with timestamps, smart auto-scroll, and message pruning.
 */
export class GameLog {
  private scrollArea!: HTMLElement;
  private entryCount = 0;
  private userScrolledUp = false;

  /** Attach to the log container element and build internal DOM. */
  init(container: HTMLElement): void {
    // Header
    const header = document.createElement('div');
    header.className = 'game-log-header';
    header.textContent = '📜 Game Log';
    container.appendChild(header);

    // Scrollable message area
    this.scrollArea = document.createElement('div');
    this.scrollArea.className = 'game-log-scroll';
    container.appendChild(this.scrollArea);

    // Track scroll position for smart auto-scroll
    this.scrollArea.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.scrollArea;
      this.userScrolledUp =
        scrollHeight - scrollTop - clientHeight > AUTO_SCROLL_THRESHOLD_PX;
    });

    this.addEntry('Game log initialized', 'info');
  }

  /** Append a categorised, timestamped log entry. */
  addEntry(message: string, type: string): void {
    const style = CATEGORY_STYLES[type] ?? DEFAULT_STYLE;

    const line = document.createElement('div');
    line.className = 'log-entry';

    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = formatTimestamp();

    const dot = document.createElement('span');
    dot.className = 'log-dot';
    dot.textContent = style.dot;

    const msg = document.createElement('span');
    msg.className = 'log-msg';
    msg.style.color = style.color;
    msg.textContent = message;

    line.appendChild(ts);
    line.appendChild(dot);
    line.appendChild(msg);
    this.scrollArea.appendChild(line);
    this.entryCount++;

    // Prune oldest entries beyond the cap
    while (this.entryCount > MAX_ENTRIES && this.scrollArea.firstChild) {
      this.scrollArea.removeChild(this.scrollArea.firstChild);
      this.entryCount--;
    }

    // Auto-scroll only when user is following the tail
    if (!this.userScrolledUp) {
      this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
    }
  }
}
