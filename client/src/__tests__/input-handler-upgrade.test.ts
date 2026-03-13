import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/GridRenderer.js', () => ({
  TILE_SIZE: 32,
}));

const windowListeners: Record<string, EventListenerOrEventListenerObject[]> = {};

vi.stubGlobal('window', {
  addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    (windowListeners[type] ??= []).push(listener);
  }),
  removeEventListener: vi.fn(),
});

const { InputHandler } = await import('../input/InputHandler.js');

describe('InputHandler outpost upgrade flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(windowListeners)) {
      windowListeners[key] = [];
    }
  });

  function setup(placementMode: 'farm' | 'factory' | null = 'farm') {
    const canvasListeners: Record<string, (event: MouseEvent) => void> = {};
    const canvas = {
      style: {},
      addEventListener: vi.fn((type: string, listener: (event: MouseEvent) => void) => {
        canvasListeners[type] = listener;
      }),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })),
    } as unknown as HTMLCanvasElement;

    const worldContainer = {
      worldTransform: { tx: 0, ty: 0, a: 1, d: 1 },
    };

    const input = new InputHandler({} as never, worldContainer as never, canvas);

    const hud = {
      localSessionId: 'player-1',
      placementMode,
      sendPlaceBuilding: vi.fn(),
      cancelPlacementMode: vi.fn(),
      onPlacementModeChange: null,
    };

    const gridRenderer = {
      getTileData: vi.fn(),
      isValidPlacementTile: vi.fn(),
      showPlacementHighlights: vi.fn(),
      clearPlacementHighlights: vi.fn(),
    };

    const upgradeModal = {
      show: vi.fn(),
    };

    input.setHud(hud as never);
    input.setGridRenderer(gridRenderer as never);
    input.setUpgradeModal(upgradeModal as never);

    return { input, canvas, canvasListeners, hud, gridRenderer, upgradeModal };
  }

  it('opens the upgrade modal for owned unupgraded outposts even when resources are short', () => {
    const { input, canvasListeners, hud, gridRenderer, upgradeModal } = setup(null);

    input.updateResources(0, 0);
    gridRenderer.getTileData.mockReturnValue({
      owner: 'player-1',
      structure: 'outpost',
      upgraded: false,
    });

    canvasListeners.click({ button: 0, clientX: 16, clientY: 16 } as MouseEvent);

    expect(upgradeModal.show).toHaveBeenCalledWith(0, 0, false);
    expect(hud.sendPlaceBuilding).not.toHaveBeenCalled();
  });

  it('falls back to placement mode for tiles that are not upgradeable outposts', () => {
    const { input, canvasListeners, hud, gridRenderer, upgradeModal } = setup();

    input.updateResources(100, 100);
    gridRenderer.getTileData.mockReturnValue({
      owner: 'player-1',
      structure: 'farm',
      upgraded: false,
    });
    gridRenderer.isValidPlacementTile.mockReturnValue(true);

    canvasListeners.click({ button: 0, clientX: 48, clientY: 16 } as MouseEvent);

    expect(upgradeModal.show).not.toHaveBeenCalled();
    expect(hud.sendPlaceBuilding).toHaveBeenCalledWith(1, 0);
  });

  it('prioritizes placement mode over the upgrade modal on owned outposts', () => {
    const { input, canvasListeners, hud, gridRenderer, upgradeModal } = setup('farm');

    input.updateResources(100, 100);
    gridRenderer.getTileData.mockReturnValue({
      owner: 'player-1',
      structure: 'outpost',
      upgraded: false,
    });
    gridRenderer.isValidPlacementTile.mockReturnValue(true);

    canvasListeners.click({ button: 0, clientX: 16, clientY: 16 } as MouseEvent);

    expect(hud.sendPlaceBuilding).toHaveBeenCalledWith(0, 0);
    expect(upgradeModal.show).not.toHaveBeenCalled();
  });

  it('suppresses the native context menu so right-drag camera controls stay clean', () => {
    const { canvas, canvasListeners, upgradeModal } = setup(null);
    const registeredEvents = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      .map(([eventName]) => eventName);
    const preventDefault = vi.fn();

    canvasListeners.contextmenu({ preventDefault } as MouseEvent);

    expect(registeredEvents).toContain('click');
    expect(registeredEvents).toContain('contextmenu');
    expect(preventDefault).toHaveBeenCalled();
    expect(upgradeModal.show).not.toHaveBeenCalled();
  });
});
