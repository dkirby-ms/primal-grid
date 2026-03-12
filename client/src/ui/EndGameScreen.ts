import type { GameEndedPayload } from '@primal-grid/shared';

const REASON_TEXT: Record<string, string> = {
  last_standing: 'Last player standing',
  time_up: 'Highest score — time expired',
  surrender: 'Opponent surrendered',
};

const AUTO_DISMISS_SECONDS = 60;

/**
 * Full-screen end-game results overlay.
 * Shows victory/defeat banner, winner info, final scoreboard, and
 * a "Return to Lobby" button with auto-dismiss countdown.
 */
export class EndGameScreen {
  private overlay: HTMLElement;
  private banner: HTMLElement;
  private winnerInfo: HTMLElement;
  private scoreboardBody: HTMLElement;
  private returnBtn: HTMLButtonElement;
  private countdownEl: HTMLElement;

  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private remainingSeconds = AUTO_DISMISS_SECONDS;
  private returnCallback: (() => void) | null = null;

  constructor() {
    this.overlay = document.getElementById('endgame-overlay')!;
    this.banner = document.getElementById('endgame-banner')!;
    this.winnerInfo = document.getElementById('endgame-winner-info')!;
    this.scoreboardBody = document.getElementById('endgame-scoreboard-body')!;
    this.returnBtn = document.getElementById('endgame-return-btn') as HTMLButtonElement;
    this.countdownEl = document.getElementById('endgame-countdown')!;

    this.returnBtn.addEventListener('click', () => {
      this.handleReturn();
    });
  }

  /** Register callback for returning to lobby. */
  onReturnToLobby(cb: () => void): void {
    this.returnCallback = cb;
  }

  /** Show end-game results screen. */
  show(isWinner: boolean, payload: GameEndedPayload, localSessionId: string): void {
    // Banner
    if (isWinner) {
      this.banner.textContent = '🏆 VICTORY!';
      this.banner.className = 'endgame-banner victory';
    } else {
      this.banner.textContent = '💀 DEFEATED';
      this.banner.className = 'endgame-banner defeat';
    }

    // Winner info
    const reasonText = REASON_TEXT[payload.reason] ?? payload.reason;
    this.winnerInfo.textContent = `Winner: ${payload.winnerName} — ${reasonText}`;

    // Scoreboard
    this.renderScoreboard(payload.finalScores, localSessionId);

    // Countdown
    this.remainingSeconds = AUTO_DISMISS_SECONDS;
    this.updateCountdown();
    this.startCountdown();

    this.overlay.classList.add('visible');
  }

  /** Hide overlay and clean up timer. */
  hide(): void {
    this.overlay.classList.remove('visible');
    this.stopCountdown();
  }

  /** Whether the overlay is currently visible. */
  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  private renderScoreboard(
    scores: Array<{ playerId: string; name: string; score: number }>,
    localSessionId: string,
  ): void {
    // Sort by score descending
    const sorted = [...scores].sort((a, b) => b.score - a.score);

    this.scoreboardBody.innerHTML = '';
    sorted.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      const isLocal = entry.playerId === localSessionId;
      if (isLocal) tr.className = 'endgame-local-player';

      const tdRank = document.createElement('td');
      tdRank.textContent = `#${idx + 1}`;
      tr.appendChild(tdRank);

      const tdName = document.createElement('td');
      tdName.textContent = isLocal ? `${entry.name} (you)` : entry.name;
      tr.appendChild(tdName);

      const tdScore = document.createElement('td');
      tdScore.textContent = String(entry.score);
      tr.appendChild(tdScore);

      this.scoreboardBody.appendChild(tr);
    });
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.countdownInterval = setInterval(() => {
      this.remainingSeconds--;
      this.updateCountdown();
      if (this.remainingSeconds <= 0) {
        this.handleReturn();
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private updateCountdown(): void {
    this.countdownEl.textContent = `Returning to lobby in ${this.remainingSeconds}s`;
  }

  private handleReturn(): void {
    this.hide();
    this.returnCallback?.();
  }
}
