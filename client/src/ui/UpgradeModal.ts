import type { Room } from '@colyseus/sdk';
import { UPGRADE_OUTPOST, OUTPOST_UPGRADE } from '@primal-grid/shared';
import type { UpgradeOutpostPayload } from '@primal-grid/shared';

export class UpgradeModal {
  private modal: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private currentX: number = -1;
  private currentY: number = -1;
  private room: Room | null = null;

  constructor() {
    this.modal = document.getElementById('upgrade-modal')!;
    this.confirmBtn = document.getElementById('upgrade-confirm-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('upgrade-cancel-btn') as HTMLButtonElement;

    this.confirmBtn.addEventListener('click', () => this.onConfirm());
    this.cancelBtn.addEventListener('click', () => this.hide());

    // Close modal on Escape or click outside
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

  public show(x: number, y: number): void {
    this.currentX = x;
    this.currentY = y;
    this.modal.classList.add('visible');
  }

  public hide(): void {
    this.modal.classList.remove('visible');
    this.currentX = -1;
    this.currentY = -1;
  }

  private onConfirm(): void {
    if (!this.room || this.currentX < 0 || this.currentY < 0) return;
    
    const payload: UpgradeOutpostPayload = {
      x: this.currentX,
      y: this.currentY,
    };
    
    this.room.send(UPGRADE_OUTPOST, payload);
    this.hide();
  }
}
