import { Room } from "@colyseus/sdk";
import type {
  GameSessionInfo,
  PreGamePlayerInfo,
  GamePlayersPayload,
  GameStartedPayload,
} from "@primal-grid/shared";
import {
  SET_READY,
  LEAVE_GAME,
  START_GAME,
  GAME_PLAYERS,
  GAME_STARTED,
} from "@primal-grid/shared";

type WaitingRoomEvent =
  | { type: "leave" }
  | { type: "game_started"; gameId: string; roomId: string };

type WaitingRoomEventCallback = (event: WaitingRoomEvent) => void;

/**
 * Pre-game waiting room UI. Shown after creating/joining a game
 * that hasn't started yet (GAME_JOINED with no roomId).
 */
export class WaitingRoom {
  private overlay: HTMLElement;
  private titleEl: HTMLElement;
  private settingsEl: HTMLElement;
  private playerListEl: HTMLElement;
  private readyBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private leaveBtn: HTMLButtonElement;

  private room: Room | null = null;
  private gameId: string | null = null;
  private isHost = false;
  private isReady = false;
  private players: PreGamePlayerInfo[] = [];
  private eventCallback: WaitingRoomEventCallback | null = null;

  constructor() {
    this.overlay = document.getElementById("waiting-room-overlay")!;
    this.titleEl = document.getElementById("waiting-room-title")!;
    this.settingsEl = document.getElementById("waiting-room-settings")!;
    this.playerListEl = document.getElementById("waiting-room-player-list")!;
    this.readyBtn = document.getElementById("waiting-room-ready-btn") as HTMLButtonElement;
    this.startBtn = document.getElementById("waiting-room-start-btn") as HTMLButtonElement;
    this.leaveBtn = document.getElementById("waiting-room-leave-btn") as HTMLButtonElement;

    this.readyBtn.addEventListener("click", () => this.toggleReady());
    this.startBtn.addEventListener("click", () => this.sendStartGame());
    this.leaveBtn.addEventListener("click", () => this.handleLeave());
  }

  onEvent(cb: WaitingRoomEventCallback): void {
    this.eventCallback = cb;
  }

  /**
   * Show the waiting room for a specific game.
   * @param room  The lobby room (for sending messages)
   * @param gameId  The game session ID
   * @param gameInfo  Game session info (from lobby game list), may be null
   * @param isHost  Whether the local player is the game host
   */
  show(room: Room, gameId: string, gameInfo: GameSessionInfo | null, isHost: boolean): void {
    this.room = room;
    this.gameId = gameId;
    this.isHost = isHost;
    this.isReady = false;
    this.players = [];

    // Title
    const gameName = gameInfo?.name ?? "Game";
    this.titleEl.textContent = `⏳ ${gameName}`;

    // Settings summary
    if (gameInfo) {
      this.settingsEl.innerHTML = "";
      const addStat = (label: string, value: string) => {
        const span = document.createElement("span");
        span.textContent = `${label}: ${value}`;
        this.settingsEl.appendChild(span);
      };
      addStat("Map", `${gameInfo.mapSize}×${gameInfo.mapSize}`);
      addStat("Players", `${gameInfo.maxPlayers} max`);
    } else {
      this.settingsEl.textContent = "";
    }

    // Reset ready button
    this.readyBtn.textContent = "Ready";
    this.readyBtn.classList.remove("ready");

    // Host vs non-host controls
    if (isHost) {
      this.readyBtn.style.display = "none";
      this.startBtn.style.display = "";
      this.startBtn.disabled = true;
    } else {
      this.readyBtn.style.display = "";
      this.startBtn.style.display = "none";
    }

    this.renderPlayerList();

    // Register lobby message handlers
    room.onMessage(GAME_PLAYERS, (data: GamePlayersPayload) => {
      if (data.gameId === this.gameId) {
        this.players = data.players;
        this.renderPlayerList();
        this.updateStartButton();
      }
    });

    room.onMessage(GAME_STARTED, (data: GameStartedPayload) => {
      if (data.gameId === this.gameId) {
        this.hide();
        this.eventCallback?.({
          type: "game_started",
          gameId: data.gameId,
          roomId: data.roomId,
        });
      }
    });

    this.overlay.classList.add("visible");
  }

  hide(): void {
    this.overlay.classList.remove("visible");
    this.room = null;
    this.gameId = null;
    this.players = [];
  }

  private renderPlayerList(): void {
    this.playerListEl.innerHTML = "";

    if (this.players.length === 0) {
      const li = document.createElement("li");
      li.className = "waiting-room-empty";
      li.textContent = "Waiting for players…";
      this.playerListEl.appendChild(li);
      return;
    }

    for (const player of this.players) {
      const li = document.createElement("li");
      li.className = "waiting-room-player";

      const nameSpan = document.createElement("span");
      nameSpan.className = "waiting-room-player-name";
      nameSpan.textContent = player.displayName;
      li.appendChild(nameSpan);

      const statusSpan = document.createElement("span");
      statusSpan.className = "waiting-room-player-status";
      statusSpan.textContent = player.isReady ? "✅" : "⬜";
      li.appendChild(statusSpan);

      this.playerListEl.appendChild(li);
    }
  }

  private updateStartButton(): void {
    if (!this.isHost) return;
    this.startBtn.disabled = this.players.length < 1;
  }

  private toggleReady(): void {
    if (!this.room) return;
    this.isReady = !this.isReady;
    this.readyBtn.textContent = this.isReady ? "Not Ready" : "Ready";
    this.readyBtn.classList.toggle("ready", this.isReady);
    this.room.send(SET_READY, { ready: this.isReady });
  }

  private sendStartGame(): void {
    if (!this.room || !this.gameId) return;
    this.room.send(START_GAME, { gameId: this.gameId });
    this.startBtn.disabled = true;
    this.startBtn.textContent = "Starting…";
  }

  private handleLeave(): void {
    if (this.room && this.gameId) {
      this.room.send(LEAVE_GAME, { gameId: this.gameId });
    }
    this.hide();
    this.eventCallback?.({ type: "leave" });
  }
}
