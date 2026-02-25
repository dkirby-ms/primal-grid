import { Application } from 'pixi.js';
import { GridRenderer } from './renderer/GridRenderer.js';
import { PlayerRenderer } from './renderer/PlayerRenderer.js';
import { CreatureRenderer } from './renderer/CreatureRenderer.js';
import { StructureRenderer } from './renderer/StructureRenderer.js';
import { Camera } from './renderer/Camera.js';
import { InputHandler } from './input/InputHandler.js';
import { ConnectionStatusUI } from './ui/ConnectionStatus.js';
import { HudRenderer } from './ui/HudRenderer.js';
import { CraftMenu } from './ui/CraftMenu.js';
import { connect, disconnect, onConnectionStatus } from './network.js';

const WIDTH = 800;
const HEIGHT = 600;

async function bootstrap(): Promise<void> {
  const app = new Application();

  await app.init({
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: 0x1a1a2e,
    antialias: true,
  });

  const el = document.getElementById('app');
  if (!el) throw new Error('Could not find #app element');
  el.appendChild(app.canvas);

  // --- Grid (renders immediately with default grass) ---
  const grid = new GridRenderer();
  app.stage.addChild(grid.container);

  // --- Connection status UI ---
  const statusUI = new ConnectionStatusUI(WIDTH);
  app.stage.addChild(statusUI.container);
  onConnectionStatus((s) => statusUI.update(s));

  // --- Camera ---
  const camera = new Camera(grid.container, WIDTH, HEIGHT, grid.getMapSize());
  app.ticker.add(() => camera.update());

  // --- Connect to Colyseus (non-blocking) ---
  connectToServer(app, grid);
}

async function connectToServer(app: Application, grid: GridRenderer): Promise<void> {
  try {
    const room = await connect();

    // Bind renderers to server state
    grid.bindToRoom(room);

    const players = new PlayerRenderer(room.sessionId);
    grid.container.addChild(players.container);
    players.bindToRoom(room);

    const creatures = new CreatureRenderer();
    grid.container.addChild(creatures.container);
    creatures.bindToRoom(room);

    // Structure renderer (walls, floors, workbenches, farm plots)
    const structures = new StructureRenderer();
    grid.container.addChild(structures.container);
    structures.bindToRoom(room);

    // HUD (fixed on screen, not in world space)
    const hud = new HudRenderer(room.sessionId);
    app.stage.addChild(hud.container);
    hud.bindToRoom(room);

    // Craft menu overlay (screen-fixed)
    const craftMenu = new CraftMenu(room);
    app.stage.addChild(craftMenu.container);

    // Feed inventory updates to craft menu for affordability display
    hud.onInventoryUpdate = (resources) => craftMenu.updateResources(resources);

    // Input handler (arrow keys + click + craft/build/harvest)
    const input = new InputHandler(room, grid.container);
    input.setCraftMenu(craftMenu);
    input.setHud(hud);
  } catch {
    console.warn('[main] Server unavailable — running in offline mode.');
  }
}

bootstrap().catch(console.error);

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    await disconnect();
  });
}

