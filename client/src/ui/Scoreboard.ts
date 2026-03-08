import type { Room } from '@colyseus/sdk';

interface PlayerRow {
  name: string;
  score: number;
  color: string;
}

/**
 * DOM-based scoreboard overlay, toggled with Tab.
 * Reads all player data + tile ownership from room state.
 */
export class Scoreboard {
  private overlay: HTMLElement;
  private tbody: HTMLElement;
  private visible = false;
  private room: Room | null = null;
  private localSessionId: string;

  constructor(localSessionId: string) {
    this.localSessionId = localSessionId;
    this.overlay = document.getElementById('scoreboard-overlay')!;
    this.tbody = document.getElementById('scoreboard-body')!;
  }

  public bindToRoom(room: Room): void {
    this.room = room;
    room.onStateChange((state: Record<string, unknown>) => {
      if (!this.visible) return;
      this.refresh(state);
    });
  }

  public toggle(): void {
    this.visible = !this.visible;
    if (this.visible) {
      this.overlay.classList.add('visible');
      // Force a refresh from the latest state snapshot
      if (this.room) {
        this.refresh(this.room.state as unknown as Record<string, unknown>);
      }
    } else {
      this.overlay.classList.remove('visible');
    }
  }

  public isOpen(): boolean {
    return this.visible;
  }

  private refresh(state: Record<string, unknown>): void {
    const players = state['players'] as
      | { forEach: (cb: (p: Record<string, unknown>, k: string) => void) => void }
      | undefined;
    if (!players || typeof players.forEach !== 'function') return;

    const rows: PlayerRow[] = [];
    players.forEach((player: Record<string, unknown>, key: string) => {
      const id = (player['id'] as string) ?? key;
      const name = (player['displayName'] as string) || 'Player';
      const score = (player['score'] as number) ?? 0;
      const color = (player['color'] as string) ?? '#cccccc';
      rows.push({ name: id === this.localSessionId ? `${name} (you)` : name, score, color });
    });

    // Sort by score descending
    rows.sort((a, b) => b.score - a.score);

    // Rebuild table body
    this.tbody.innerHTML = '';
    for (const row of rows) {
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      tdName.textContent = row.name;
      tdName.style.color = row.color;
      tdName.style.fontWeight = 'bold';
      tr.appendChild(tdName);

      const tdScore = document.createElement('td');
      tdScore.textContent = String(row.score);
      tr.appendChild(tdScore);

      this.tbody.appendChild(tr);
    }
  }
}
