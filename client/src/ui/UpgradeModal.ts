import type { Room } from '@colyseus/sdk';
import { UPGRADE_OUTPOST, OUTPOST_UPGRADE } from '@primal-grid/shared';
import type { UpgradeOutpostPayload } from '@primal-grid/shared';

export class UpgradeModal {
  private modal: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private statusText: HTMLElement;
  private currentX: number = -1;
  private currentY: number = -1;
  private room: Room | null = null;

  constructor() {
    let modal = document.getElementById('upgrade-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'upgrade-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-panel">
          <h2>🏹 Upgrade Outpost</h2>
          <p id="upgrade-modal-description">Turns this outpost into a ranged tower that auto-attacks the closest enemy every ${OUTPOST_UPGRADE.ATTACK_COOLDOWN_TICKS} ticks.</p>
          <div class="upgrade-cost">
            💰 Cost: ${OUTPOST_UPGRADE.COST_WOOD} 🪵 + ${OUTPOST_UPGRADE.COST_STONE} 🪨<br>
            ⚔️ Damage: ${OUTPOST_UPGRADE.DAMAGE} &nbsp;|&nbsp; Range: ${OUTPOST_UPGRADE.ATTACK_RANGE} tiles &nbsp;|&nbsp; Rate: every ${OUTPOST_UPGRADE.ATTACK_COOLDOWN_TICKS} ticks
          </div>
          <p id="upgrade-modal-status" class="modal-status">Ready to upgrade this outpost.</p>
          <div class="modal-actions">
            <button id="upgrade-cancel-btn" class="modal-btn-cancel">Cancel</button>
            <button id="upgrade-confirm-btn" class="modal-btn-confirm">Upgrade</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    this.modal = modal;
    this.confirmBtn = document.getElementById('upgrade-confirm-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('upgrade-cancel-btn') as HTMLButtonElement;
    this.statusText = document.getElementById('upgrade-modal-status') as HTMLElement;

    this.confirmBtn.addEventListener('click', () => this.onConfirm());
    this.cancelBtn.addEventListener('click', () => this.hide());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('visible')) {
        this.hide();
      }
    });

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });
  }

  public setRoom(room: Room): void {
    this.room = room;
  }

  public show(x: number, y: number, canAfford: boolean): void {
    this.currentX = x;
    this.currentY = y;
    this.confirmBtn.disabled = !canAfford;
    this.statusText.textContent = canAfford
      ? 'Ready to upgrade this outpost.'
      : `Need ${OUTPOST_UPGRADE.COST_WOOD} wood and ${OUTPOST_UPGRADE.COST_STONE} stone to upgrade.`;
    this.statusText.classList.toggle('insufficient', !canAfford);
    this.modal.classList.add('visible');
  }

  public hide(): void {
    this.modal.classList.remove('visible');
    this.currentX = -1;
    this.currentY = -1;
  }

  private onConfirm(): void {
    if (!this.room || this.currentX < 0 || this.currentY < 0 || this.confirmBtn.disabled) return;

    const payload: UpgradeOutpostPayload = {
      x: this.currentX,
      y: this.currentY,
    };

    this.room.send(UPGRADE_OUTPOST, payload);
    this.hide();
  }
}
