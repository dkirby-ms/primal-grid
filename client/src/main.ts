declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

import { Application } from 'pixi.js';
import { Room } from '@colyseus/sdk';
import { GridRenderer } from './renderer/GridRenderer.js';
import { CreatureRenderer } from './renderer/CreatureRenderer.js';
import { CombatEffects } from './renderer/CombatEffects.js';
import { Camera } from './renderer/Camera.js';
import { InputHandler } from './input/InputHandler.js';
import { ConnectionStatusUI } from './ui/ConnectionStatus.js';
import { HudDOM } from './ui/HudDOM.js';
import { GameLog } from './ui/GameLog.js';
import { ChatPanel } from './ui/ChatPanel.js';
import { HelpScreen } from './ui/HelpScreen.js';
import { Scoreboard } from './ui/Scoreboard.js';
import { LobbyScreen } from './ui/LobbyScreen.js';
import { WaitingRoom } from './ui/WaitingRoom.js';
import { UpgradeModal } from './ui/UpgradeModal.js';
import { EndGameScreen } from './ui/EndGameScreen.js';
import { connectToLobby, joinGameRoom, leaveGame, disconnect, onConnectionStatus, isDevMode, getRoom, loadReconnectToken, reconnectGameRoom, resetClient } from './network.js';
import type { GameLogPayload, GameEndedPayload, PlayerEliminatedPayload } from '@primal-grid/shared';
import { GAME_ENDED, PLAYER_ELIMINATED, JOIN_GAME } from '@primal-grid/shared';

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

  // Expose PixiJS app for Playwright E2E testing (dev mode only)
  if (import.meta.env.DEV || isDevMode()) {
    (window as unknown as Record<string, unknown>).__PIXI_APP__ = app;
  }

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

    // Viewport culling: only render tiles visible in the camera
    const vp = camera.getViewportTileBounds();
    grid.updateCulling(vp.minX, vp.minY, vp.maxX, vp.maxY);

    // Push explored bounds to camera each frame for smooth lerp
    const cache = grid.exploredCache;
    if (cache.size > 0 && cache.hasBoundsChanged) {
      const b = cache.bounds;
      camera.setExploredBounds(b.minX, b.minY, b.maxX, b.maxY);
      cache.acknowledgeBoundsChange();
    }
  });

  // --- Lobby screen ---
  const lobbyScreen = new LobbyScreen();

  // --- Reconnect after browser refresh if token exists ---
  if (loadReconnectToken()) {
    const room = await reconnectGameRoom();
    if (room) {
      lobbyScreen.hide();
      setGameUIVisible(true);
      setupGameSession(app, grid, camera, room, lobbyScreen);
      return;
    }
    // Force fresh client for lobby — previous reconnect attempts
    // may have left the Client instance in a bad state.
    resetClient();
  }

  // --- Connect to lobby ---
  connectToLobbyAndShow(app, grid, camera, lobbyScreen);
}

async function connectToLobbyAndShow(
  app: Application,
  grid: GridRenderer,
  camera: Camera,
  lobbyScreen: LobbyScreen,
): Promise<void> {
  try {
    const lobby = await connectToLobby();

    // Hide game UI, show lobby
    setGameUIVisible(false);
    lobbyScreen.bindToRoom(lobby);
    lobbyScreen.show();

    // Auto-join if ?join=<gameId> is present in the URL
    const joinParam = new URLSearchParams(window.location.search).get("join");
    if (joinParam) {
      // Clean the URL so reloads don't re-trigger auto-join
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("join");
      window.history.replaceState({}, "", cleanUrl.toString());

      lobby.send(JOIN_GAME, { gameId: joinParam });
    }

    const waitingRoom = new WaitingRoom();

    waitingRoom.onEvent(async (wrEvent) => {
      if (wrEvent.type === "leave") {
        // Player left waiting room — return to lobby
        lobbyScreen.show();
      } else if (wrEvent.type === "game_started") {
        // Game started — join the game room
        try {
          const gameRoom = await joinGameRoom(wrEvent.roomId, lobbyScreen.getDisplayName());
          setGameUIVisible(true);
          setupGameSession(app, grid, camera, gameRoom, lobbyScreen);
        } catch (err) {
          console.error('[main] Failed to join game room from waiting room:', err);
          lobbyScreen.show();
        }
      }
    });

    lobbyScreen.onEvent(async (event) => {
      if (event.type === "join_game") {
        // Has roomId — join game immediately (existing flow)
        try {
          const gameRoom = await joinGameRoom(event.roomId, lobbyScreen.getDisplayName());
          lobbyScreen.hide();
          setGameUIVisible(true);
          setupGameSession(app, grid, camera, gameRoom, lobbyScreen);
        } catch (err) {
          console.error('[main] Failed to join game room:', err);
        }
      } else if (event.type === "waiting") {
        // No roomId — show waiting room
        lobbyScreen.hide();
        waitingRoom.show(lobby, event.gameId, event.gameInfo, event.isHost);
      } else if (event.type === "error") {
        console.warn('[main] Lobby error:', event.message);
      }
    });
  } catch (err) {
    console.error('[main] Lobby connection failed:', err);
    const message = err instanceof Error ? err.message : "Connection failed";
    lobbyScreen.showConnectionError(message);
  }
}

/** Bind all renderers and UI to an active game room. */
function setupGameSession(
  app: Application,
  grid: GridRenderer,
  camera: Camera,
  room: Room,
  lobbyScreen: LobbyScreen,
): void {
  // Set up local player identity
  grid.setLocalPlayerId(room.sessionId);

  // Create persistent renderers (survive reconnection)
  const creatures = new CreatureRenderer();
  grid.container.addChild(creatures.container);

  const combatEffects = new CombatEffects();
  grid.container.addChild(combatEffects.container);
  creatures.setCombatEffects(combatEffects);

  const creatureTicker = (ticker: { deltaTime: number }) => {
    creatures.tick(ticker.deltaTime);
  };
  app.ticker.add(creatureTicker);

  const hud = new HudDOM(room.sessionId);
  const scoreboard = new Scoreboard(room.sessionId);
  const gameLog = new GameLog();
  const logEl = document.getElementById('game-log');
  if (logEl) gameLog.init(logEl);
  const chatPanel = new ChatPanel();
  const upgradeModal = new UpgradeModal();
  const endGameScreen = new EndGameScreen();

  // Wire return-to-lobby flow
  endGameScreen.onReturnToLobby(async () => {
    await leaveGame();
    setGameUIVisible(false);
    connectToLobbyAndShow(app, grid, camera, lobbyScreen);
  });

  const helpScreen = new HelpScreen(WIDTH, HEIGHT);
  app.stage.addChild(helpScreen.container);

  let input: InputHandler | null = null;

  let boundRoomId: string | null = null;

  /** Bind (or re-bind) all room listeners to a given room. */
  function bindGameRoom(r: Room): void {
    grid.bindToRoom(r);
    creatures.bindToRoom(r);
    hud.bindToRoom(r);
    scoreboard.bindToRoom(r);

    // Center camera: if state is already synced (bootstrap reconnect),
    // center immediately; otherwise wait for the first state update.
    const localPlayer = r.state.players?.get(r.sessionId);
    if (localPlayer) {
      camera.centerOnHQ(localPlayer.hqX, localPlayer.hqY);
    } else {
      r.onStateChange.once(() => {
        const p = r.state.players?.get(r.sessionId);
        if (p) camera.centerOnHQ(p.hqX, p.hqY);
      });
    }

    // Only register message handlers once per room to avoid duplicates
    // when bindGameRoom is re-called for in-session reconnects on the
    // same Room object.
    if (r.roomId !== boundRoomId) {
      boundRoomId = r.roomId;

      if (logEl) {
        r.onMessage('game_log', (data: GameLogPayload) => {
          gameLog.addEntry(data.message, data.type);
        });
      }

      r.onMessage(GAME_ENDED, (data: GameEndedPayload) => {
        const isWinner = data.winnerId === r.sessionId;
        endGameScreen.show(isWinner, data, r.sessionId);
      });

      r.onMessage(PLAYER_ELIMINATED, (data: PlayerEliminatedPayload) => {
        if (data.playerId === r.sessionId && logEl) {
          gameLog.addEntry(`💀 You have been eliminated!`, 'death');
        }
      });

      const chatEl = document.getElementById('chat-panel');
      if (chatEl) chatPanel.init(chatEl, r);
    }

    // (Re)create input handler bound to new room
    if (input) input.dispose();
    input = new InputHandler(r, grid.container, app.canvas);
    input.setHud(hud);
    input.setHelpScreen(helpScreen);
    input.setScoreboard(scoreboard);
    input.setCamera(camera);
    input.setChatPanel(chatPanel);
    input.setGridRenderer(grid);
    input.setUpgradeModal(upgradeModal);
    
    // Wire up HUD to notify InputHandler of resource changes
    hud.onResourcesChange = (wood, stone) => input?.updateResources(wood, stone);
    
    // Wire up upgrade modal with room
    upgradeModal.setRoom(r);
  }

  // Initial bind
  bindGameRoom(room);

  // Subscribe to connection status for reconnection handling
  const unsubscribe = onConnectionStatus((status) => {
    if (status === 'disconnected') {
      // Final disconnect — tear down game session and return to lobby
      endGameScreen.hide();
      if (input) input.dispose();
      input = null;
      app.ticker.remove(creatureTicker);
      if (creatures.container.parent) {
        creatures.container.parent.removeChild(creatures.container);
      }
      if (combatEffects.container.parent) {
        combatEffects.container.parent.removeChild(combatEffects.container);
      }
      if (helpScreen.container.parent) {
        helpScreen.container.parent.removeChild(helpScreen.container);
      }

      setGameUIVisible(false);
      lobbyScreen.leaveCurrentGame();
      lobbyScreen.show();
      unsubscribe();
    } else if (status === 'connected') {
      // Reconnection succeeded — re-bind to new room
      const newRoom = getRoom();
      if (newRoom) {
        bindGameRoom(newRoom);
      }
    }
    // 'reconnecting' — keep game UI frozen (do nothing)
  });
}

/** Toggle visibility of game-specific UI elements. */
function setGameUIVisible(visible: boolean): void {
  const gameWrapper = document.getElementById('game-wrapper');
  const gameLog = document.getElementById('game-log');
  const chatPanel = document.getElementById('chat-panel');
  const helpHint = document.getElementById('help-hint');

  const display = visible ? '' : 'none';
  if (gameWrapper) gameWrapper.style.display = visible ? 'flex' : 'none';
  if (gameLog) gameLog.style.display = display;
  if (chatPanel) chatPanel.style.display = display;
  if (helpHint) helpHint.style.display = display;
}

bootstrap().catch(console.error);

// Populate app footer with version, build date, and issues link
(function initFooter() {
  const footer = document.getElementById('app-footer');
  if (!footer) return;
  const version =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const buildDate =
    typeof __BUILD_DATE__ !== 'undefined'
      ? new Date(__BUILD_DATE__).toLocaleDateString()
      : '';
  const dateStr = buildDate ? ` · Built ${buildDate}` : '';
  footer.innerHTML =
    `v${version}${dateStr} · <a href="https://github.com/dkirby-ms/primal-grid/issues" target="_blank" rel="noopener">Report an Issue</a>`;
})();

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    await disconnect();
  });
}
