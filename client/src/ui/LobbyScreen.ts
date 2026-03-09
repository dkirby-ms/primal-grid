import { Room } from "@colyseus/sdk";
import type {
  GameSessionInfo,
  GameListPayload,
  GameUpdatedPayload,
  GameRemovedPayload,
  GameJoinedPayload,
  GameStartedPayload,
  LobbyErrorPayload,
  CreateGamePayload,
} from "@primal-grid/shared";
import {
  CREATE_GAME, JOIN_GAME, LEAVE_GAME, START_GAME,
  GAME_LIST, GAME_UPDATED, GAME_REMOVED, GAME_JOINED,
  GAME_STARTED, LOBBY_ERROR,
} from "@primal-grid/shared";

export type LobbyEvent =
  | { type: "join_game"; gameId: string; roomId: string }
  | { type: "game_started"; gameId: string; roomId: string }
  | { type: "error"; message: string };

type LobbyEventCallback = (event: LobbyEvent) => void;

/**
 * DOM-based lobby screen for creating, browsing, and joining games.
 * Shown before the gameplay canvas; hidden once a game is joined.
 */
export class LobbyScreen {
  private container: HTMLElement;
  private gameListBody: HTMLElement;
  private nameInput: HTMLInputElement;
  private room: Room | null = null;
  private games = new Map<string, GameSessionInfo>();
  private eventCallback: LobbyEventCallback | null = null;
  private currentGameId: string | null = null;
  private playerDisplayName = "";

  /** Returns the current display name entered by the player. */
  getDisplayName(): string {
    return this.playerDisplayName;
  }

  constructor() {
    this.container = document.getElementById("lobby-overlay")!;
    this.gameListBody = document.getElementById("lobby-game-list-body")!;
    this.nameInput = document.getElementById("lobby-name-input") as HTMLInputElement;

    this.setupCreateForm();
    this.setupNameInput();
  }

  /** Register callback for lobby events (join, start, error). */
  onEvent(cb: LobbyEventCallback): void {
    this.eventCallback = cb;
  }

  show(): void {
    this.container.classList.add("visible");
  }

  hide(): void {
    this.container.classList.remove("visible");
  }

  /** Show a connection error instead of the lobby UI. */
  showConnectionError(message: string): void {
    this.show();
    const lobbyContainer = document.getElementById("lobby-container");
    if (lobbyContainer) {
      lobbyContainer.textContent = '';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'text-align:center; padding:40px 20px;';

      const heading = document.createElement('h2');
      heading.style.cssText = 'color:#ff6b6b; margin-bottom:16px;';
      heading.textContent = '⚠️ Connection Error';
      wrapper.appendChild(heading);

      const msg = document.createElement('p');
      msg.style.cssText = 'color:#ccc; margin-bottom:24px;';
      msg.textContent = message;
      wrapper.appendChild(msg);

      const hint = document.createElement('p');
      hint.style.cssText = 'color:#888; font-size:0.9em;';
      hint.textContent = 'Close this tab and return to your existing session.';
      wrapper.appendChild(hint);

      lobbyContainer.appendChild(wrapper);
    }
  }

  /** Bind to a lobby room and listen for state updates. */
  bindToRoom(room: Room, displayName?: string): void {
    this.room = room;
    if (displayName) {
      this.playerDisplayName = displayName;
      this.nameInput.value = displayName;
    }

    room.onMessage(GAME_LIST, (data: GameListPayload) => {
      this.games.clear();
      for (const g of data.games) {
        this.games.set(g.id, g);
      }
      this.renderGameList();
    });

    room.onMessage(GAME_UPDATED, (data: GameUpdatedPayload) => {
      this.games.set(data.game.id, data.game);
      this.renderGameList();
    });

    room.onMessage(GAME_REMOVED, (data: GameRemovedPayload) => {
      this.games.delete(data.gameId);
      this.renderGameList();
    });

    room.onMessage(GAME_JOINED, (data: GameJoinedPayload) => {
      this.currentGameId = data.gameId;
      this.eventCallback?.({ type: "join_game", gameId: data.gameId, roomId: data.roomId });
    });

    room.onMessage(GAME_STARTED, (data: GameStartedPayload) => {
      this.eventCallback?.({ type: "game_started", gameId: data.gameId, roomId: data.roomId });
    });

    room.onMessage(LOBBY_ERROR, (data: LobbyErrorPayload) => {
      this.eventCallback?.({ type: "error", message: data.message });
      this.showNotification(data.message, "error");
    });
  }

  private setupNameInput(): void {
    this.nameInput.addEventListener("change", () => {
      const name = this.nameInput.value.trim();
      if (name && this.room) {
        this.playerDisplayName = name;
        this.room.send("set_name", { name });
      }
    });
  }

  private setupCreateForm(): void {
    const form = document.getElementById("lobby-create-form")!;
    const toggleBtn = document.getElementById("lobby-create-toggle")!;
    const cancelBtn = document.getElementById("lobby-create-cancel")!;
    const submitBtn = document.getElementById("lobby-create-submit")!;

    toggleBtn.addEventListener("click", () => {
      form.classList.toggle("visible");
      toggleBtn.style.display = form.classList.contains("visible") ? "none" : "";
    });

    cancelBtn.addEventListener("click", () => {
      form.classList.remove("visible");
      toggleBtn.style.display = "";
    });

    submitBtn.addEventListener("click", () => {
      this.handleCreateGame();
    });

    // Enter key in game name input
    const gameNameInput = document.getElementById("lobby-game-name") as HTMLInputElement;
    gameNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.handleCreateGame();
      }
    });
  }

  private handleCreateGame(): void {
    if (!this.room) return;

    // Ensure player has a name (fall back to placeholder)
    const name = this.nameInput.value.trim() || this.nameInput.placeholder || "Explorer";
    if (name !== this.playerDisplayName) {
      this.playerDisplayName = name;
      this.nameInput.value = name;
      this.room.send("set_name", { name });
    }

    const gameNameInput = document.getElementById("lobby-game-name") as HTMLInputElement;
    const maxPlayersInput = document.getElementById("lobby-max-players") as HTMLSelectElement;
    const mapSizeInput = document.getElementById("lobby-map-size") as HTMLSelectElement;

    const gameName = gameNameInput.value.trim() || gameNameInput.placeholder || "My Colony";

    const payload: CreateGamePayload = {
      name: gameName,
      maxPlayers: parseInt(maxPlayersInput.value, 10) || 8,
      mapSize: parseInt(mapSizeInput.value, 10) || 128,
    };

    this.room.send(CREATE_GAME, payload);

    // Reset form
    gameNameInput.value = "";
    const form = document.getElementById("lobby-create-form")!;
    const toggleBtn = document.getElementById("lobby-create-toggle")!;
    form.classList.remove("visible");
    toggleBtn.style.display = "";
  }

  private renderGameList(): void {
    this.gameListBody.innerHTML = "";

    if (this.games.size === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = `<td colspan="5" class="lobby-empty">No games available — create one!</td>`;
      this.gameListBody.appendChild(emptyRow);
      return;
    }

    // Sort: waiting first, then by creation time (newest first)
    const sorted = [...this.games.values()].sort((a, b) => {
      if (a.status === "waiting" && b.status !== "waiting") return -1;
      if (a.status !== "waiting" && b.status === "waiting") return 1;
      return b.createdAt - a.createdAt;
    });

    for (const game of sorted) {
      const row = document.createElement("tr");
      const statusIcon = game.status === "waiting" ? "🟢" : "🔵";
      const statusText = game.status === "waiting" ? "Waiting" : "In Progress";

      row.innerHTML = `
        <td class="lobby-game-name">${this.escapeHtml(game.name)}</td>
        <td>${this.escapeHtml(game.hostName || "Unknown")}</td>
        <td>${game.playerCount}/${game.maxPlayers}</td>
        <td>${statusIcon} ${statusText}</td>
        <td class="lobby-action-cell"></td>
      `;

      const actionCell = row.querySelector(".lobby-action-cell")!;
      if (game.status === "waiting" && game.playerCount < game.maxPlayers) {
        const joinBtn = document.createElement("button");
        joinBtn.className = "lobby-join-btn";
        joinBtn.textContent = "Join";
        joinBtn.addEventListener("click", () => {
          if (!this.room) return;
          // Ensure name is set (fall back to placeholder)
          const name = this.nameInput.value.trim() || this.nameInput.placeholder || "Explorer";
          if (name !== this.playerDisplayName) {
            this.playerDisplayName = name;
            this.nameInput.value = name;
            this.room.send("set_name", { name });
          }
          this.room.send(JOIN_GAME, { gameId: game.id });
        });
        actionCell.appendChild(joinBtn);
      }

      this.gameListBody.appendChild(row);
    }
  }

  /** Leave the current game and return to lobby view. */
  leaveCurrentGame(): void {
    if (this.room && this.currentGameId) {
      this.room.send(LEAVE_GAME, { gameId: this.currentGameId });
      this.currentGameId = null;
    }
  }

  private showNotification(msg: string, type: "error" | "info"): void {
    const el = document.getElementById("lobby-notification");
    if (!el) return;
    el.textContent = msg;
    el.className = `lobby-notification ${type} visible`;
    setTimeout(() => el.classList.remove("visible"), 3000);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
