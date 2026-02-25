import { Application } from 'pixi.js';
import { GridRenderer } from './renderer/GridRenderer.js';
import { PlayerRenderer } from './renderer/PlayerRenderer.js';
import { CreatureRenderer } from './renderer/CreatureRenderer.js';
import { Camera } from './renderer/Camera.js';
import { InputHandler } from './input/InputHandler.js';
import { ConnectionStatusUI } from './ui/ConnectionStatus.js';
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
  connectToServer(grid);
}

async function connectToServer(grid: GridRenderer): Promise<void> {
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

    // Input handler (arrow keys + click)
    new InputHandler(room, grid.container);
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

