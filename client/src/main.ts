import { Application, Text } from 'pixi.js';
import { GridRenderer } from './renderer/GridRenderer.js';
import { CreatureRenderer } from './renderer/CreatureRenderer.js';
import { Camera } from './renderer/Camera.js';
import { InputHandler } from './input/InputHandler.js';
import { ConnectionStatusUI } from './ui/ConnectionStatus.js';
import { HudDOM } from './ui/HudDOM.js';
import { HelpScreen } from './ui/HelpScreen.js';
import { connect, disconnect, onConnectionStatus } from './network.js';

const WIDTH = 600;
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
  app.ticker.add(() => {
    camera.update();
    grid.tick();
  });

  // --- Help hint (bottom-right corner) ---
  const helpHint = new Text({
    text: 'Press ? for help',
    style: { fontSize: 11, fill: '#888888', fontFamily: 'monospace' },
  });
  helpHint.position.set(WIDTH - helpHint.width - 12, HEIGHT - 24);
  app.stage.addChild(helpHint);

  // --- Connect to Colyseus (non-blocking) ---
  connectToServer(app, grid, camera);
}

async function connectToServer(app: Application, grid: GridRenderer, camera: Camera): Promise<void> {
  try {
    const room = await connect();

    // Bind renderers to server state
    grid.bindToRoom(room);

    const creatures = new CreatureRenderer();
    grid.container.addChild(creatures.container);
    creatures.bindToRoom(room);

    // Center camera on local player's HQ once state has synced
    room.onStateChange.once(() => {
      const localPlayer = room.state.players?.get(room.sessionId);
      if (localPlayer) {
        camera.centerOnHQ(localPlayer.hqX, localPlayer.hqY);
      }
    });

    // HUD (DOM-based side panel)
    const hud = new HudDOM(room.sessionId);
    hud.bindToRoom(room);

    // Help screen overlay (screen-fixed, on top)
    const helpScreen = new HelpScreen(WIDTH, HEIGHT);
    app.stage.addChild(helpScreen.container);

    // Input handler (click + build)
    const input = new InputHandler(room, grid.container, app.canvas);
    input.setHud(hud);
    input.setHelpScreen(helpScreen);
    input.setCamera(camera);
    input.setGridRenderer(grid);

    // Wire level changes → update input + HUD carousel
    hud.onLevelChange = (level: number) => {
      input.updateShapeKeys(level);
    };

    // Update shape ghost preview every frame
    app.ticker.add(() => {
      input.updatePreview();
    });
  } catch (err) {
    console.error('[main] Post-connect error:', err);
  }
}

bootstrap().catch(console.error);

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    await disconnect();
  });
}

