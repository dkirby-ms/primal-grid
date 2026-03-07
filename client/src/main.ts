import { Application } from 'pixi.js';
import { GridRenderer } from './renderer/GridRenderer.js';
import { CreatureRenderer } from './renderer/CreatureRenderer.js';
import { Camera } from './renderer/Camera.js';
import { InputHandler } from './input/InputHandler.js';
import { ConnectionStatusUI } from './ui/ConnectionStatus.js';
import { HudDOM } from './ui/HudDOM.js';
import { GameLog } from './ui/GameLog.js';
import { HelpScreen } from './ui/HelpScreen.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { connect, disconnect, onConnectionStatus } from './network.js';
import { SET_NAME } from '@primal-grid/shared';

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

  // --- Connect to Colyseus (non-blocking) ---
  connectToServer(app, grid, camera);
}

/** Show the name prompt overlay and resolve with the entered name. */
function promptForName(): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('name-prompt-overlay')!;
    const input = document.getElementById('name-prompt-input') as HTMLInputElement;
    const btn = document.getElementById('name-prompt-submit')!;

    overlay.classList.add('visible');
    input.value = '';
    input.focus();

    const submit = () => {
      const name = input.value.trim() || 'Explorer';
      overlay.classList.remove('visible');
      resolve(name);
    };

    btn.addEventListener('click', submit, { once: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    }, { once: true });
  });
}

async function connectToServer(app: Application, grid: GridRenderer, camera: Camera): Promise<void> {
  try {
    const room = await connect();

    // Prompt for display name and send to server
    const displayName = await promptForName();
    room.send(SET_NAME, { name: displayName });

    // Bind renderers to server state
    grid.setLocalPlayerId(room.sessionId);
    grid.bindToRoom(room);

    const creatures = new CreatureRenderer();
    grid.container.addChild(creatures.container);
    creatures.bindToRoom(room);

    // Drive smooth creature movement from the app ticker
    app.ticker.add((ticker) => {
      creatures.tick(ticker.deltaTime);
    });

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

    // Scoreboard (Tab key overlay)
    const scoreboard = new Scoreboard(room.sessionId);
    scoreboard.bindToRoom(room);

    // Game log panel
    const gameLog = new GameLog();
    const logEl = document.getElementById('game-log');
    if (logEl) {
      gameLog.init(logEl);
      room.onMessage('game_log', (data: { message: string; type: string }) => {
        gameLog.addEntry(data.message, data.type);
      });
    }

    // Help screen overlay (screen-fixed, on top)
    const helpScreen = new HelpScreen(WIDTH, HEIGHT);
    app.stage.addChild(helpScreen.container);

    // Input handler (camera + keybindings)
    const input = new InputHandler(room, grid.container, app.canvas);
    input.setHud(hud);
    input.setHelpScreen(helpScreen);
    input.setScoreboard(scoreboard);
    input.setCamera(camera);
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

