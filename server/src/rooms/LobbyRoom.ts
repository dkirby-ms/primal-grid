import { Room, Client, matchMaker } from "colyseus";
import type { AuthProvider, AuthUser } from "../auth/AuthProvider.js";
import type { GameSessionRepository } from "../persistence/GameSessionRepository.js";
import type { LobbyBridge } from "./LobbyBridge.js";
import { LobbyState, LobbyGameEntry, LobbyPlayer } from "./LobbyState.js";
import {
  CREATE_GAME, JOIN_GAME, LEAVE_GAME, START_GAME,
  GAME_LIST, GAME_JOINED, GAME_STARTED,
  GAME_UPDATED, GAME_REMOVED, LOBBY_ERROR,
  LOBBY_DEFAULTS, DEFAULT_MAP_SIZE,
} from "@primal-grid/shared";
import type {
  CreateGamePayload, JoinGamePayload,
  GameSessionInfo,
} from "@primal-grid/shared";

/** Maps Colyseus sessionId → authenticated user info. */
interface LobbySession {
  userId: string;
  displayName: string;
  isGuest: boolean;
}

/**
 * LobbyRoom — coordination layer where players create, browse, and join games.
 *
 * All players connect here first. Identity (JWT auth) is established in the lobby.
 * Game creation spawns a new GameRoom instance; clients then joinById.
 */
export class LobbyRoom extends Room {
  state = new LobbyState();

  /** Injected by server setup. */
  authProvider?: AuthProvider;
  /** Injected by server setup. */
  gameSessionRepo?: GameSessionRepository;
  /** Injected by server setup — receives lifecycle events from GameRooms. */
  lobbyBridge?: LobbyBridge;

  /** Maps sessionId → user info for connected lobby clients. */
  private sessions = new Map<string, LobbySession>();
  /** Maps gameId → Colyseus roomId for active GameRoom instances. */
  private gameRoomIds = new Map<string, string>();

  override async onCreate(_options: Record<string, unknown>) {
    // Load persisted active games on startup
    if (this.gameSessionRepo) {
      const active = await this.gameSessionRepo.listActive();
      for (const game of active) {
        // Ended or stale games from a previous server run — mark them ended
        if (game.status === "in_progress") {
          await this.gameSessionRepo.updateStatus(game.id, "ended");
          continue;
        }
        this.addGameToState(game);
      }
    }

    this.registerMessageHandlers();
    this.registerBridgeListeners();
    console.log("[LobbyRoom] Lobby created.");
  }

  override async onJoin(client: Client, options?: Record<string, unknown>) {
    let authUser: AuthUser | undefined;
    const token = typeof options?.token === "string" ? options.token : undefined;

    if (this.authProvider && token) {
      const result = await this.authProvider.validateToken(token);
      if (result.valid && result.user) {
        authUser = result.user;
      }
    }

    const userId = authUser?.id ?? client.sessionId;

    // Reject if this user already has an active lobby session (multi-tab guard)
    for (const [, existingSession] of this.sessions) {
      if (existingSession.userId === userId) {
        throw new Error("Already connected in another tab");
      }
    }

    const displayName = typeof options?.displayName === "string"
      ? options.displayName.trim().slice(0, LOBBY_DEFAULTS.MAX_DISPLAY_NAME_LENGTH)
      : "";

    const session: LobbySession = {
      userId,
      displayName: displayName || authUser?.username || "",
      isGuest: authUser?.isGuest ?? true,
    };
    this.sessions.set(client.sessionId, session);

    // Add to lobby state
    const lobbyPlayer = new LobbyPlayer();
    lobbyPlayer.userId = session.userId;
    lobbyPlayer.displayName = session.displayName;
    lobbyPlayer.isGuest = session.isGuest;
    this.state.players.set(client.sessionId, lobbyPlayer);

    // Send current game list to joining client
    const games: GameSessionInfo[] = [];
    this.state.games.forEach((entry) => {
      games.push(this.entryToInfo(entry));
    });
    client.send(GAME_LIST, { games });

    console.log(`[LobbyRoom] Player joined lobby: ${session.displayName || client.sessionId}`);
  }

  override onLeave(client: Client) {
    // Clean up game membership before removing the player
    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (lobbyPlayer?.activeGameId) {
      this.handleLeaveGame(client);
    }

    this.sessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  override async onDispose() {
    console.log("[LobbyRoom] Lobby disposed.");
  }

  private registerMessageHandlers() {
    this.onMessage(CREATE_GAME, (client, payload: CreateGamePayload) => {
      void this.handleCreateGame(client, payload);
    });

    this.onMessage(JOIN_GAME, (client, payload: JoinGamePayload) => {
      void this.handleJoinGame(client, payload);
    });

    this.onMessage(LEAVE_GAME, (client) => {
      this.handleLeaveGame(client);
    });

    this.onMessage(START_GAME, (client) => {
      void this.handleStartGame(client);
    });

    this.onMessage("set_name", (client, payload: { name: string }) => {
      this.handleSetName(client, payload);
    });
  }

  private registerBridgeListeners() {
    if (!this.lobbyBridge) return;

    this.lobbyBridge.on("player_count_changed", (gameId: string, count: number) => {
      const entry = this.state.games.get(gameId);
      if (!entry) return;
      entry.playerCount = count;
      if (this.gameSessionRepo) {
        void this.gameSessionRepo.updatePlayerCount(gameId, count);
      }
      this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });
    });

    this.lobbyBridge.on("game_ended", (gameId: string) => {
      this.onGameEnded(gameId);
    });
  }

  private async handleCreateGame(client: Client, payload: CreateGamePayload) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return this.sendError(client, "Not authenticated");

    // Prevent creating a game while already in one
    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (lobbyPlayer?.activeGameId) return this.sendError(client, "Already in a game");

    // Validate name
    const name = typeof payload.name === "string"
      ? payload.name.trim().slice(0, LOBBY_DEFAULTS.MAX_GAME_NAME_LENGTH)
      : "";
    if (name.length < LOBBY_DEFAULTS.MIN_GAME_NAME_LENGTH) {
      return this.sendError(client, "Game name is required");
    }

    const maxPlayers = Math.min(
      Math.max(payload.maxPlayers ?? LOBBY_DEFAULTS.MAX_PLAYERS, LOBBY_DEFAULTS.MIN_PLAYERS),
      LOBBY_DEFAULTS.MAX_PLAYERS
    );
    const mapSize = Math.min(
      Math.max(payload.mapSize ?? DEFAULT_MAP_SIZE, 32),
      256
    );
    const mapSeed = payload.mapSeed ?? Math.floor(Math.random() * 999999);

    // Persist game session
    let gameInfo: GameSessionInfo;
    if (this.gameSessionRepo) {
      gameInfo = await this.gameSessionRepo.create(
        name, session.userId, session.displayName, maxPlayers, mapSize, mapSeed,
      );
    } else {
      // In-memory fallback (testing)
      gameInfo = {
        id: crypto.randomUUID(),
        name,
        hostId: session.userId,
        hostName: session.displayName,
        status: "waiting",
        playerCount: 1,
        maxPlayers,
        mapSize,
        mapSeed,
        createdAt: Date.now(),
      };
    }

    // Create the Colyseus GameRoom
    const gameRoom = await matchMaker.createRoom("game", {
      gameId: gameInfo.id,
      gameName: name,
      mapSize,
      seed: mapSeed,
      maxPlayers,
      hostId: session.userId,
    });

    this.gameRoomIds.set(gameInfo.id, gameRoom.roomId);

    // Add to lobby state for all clients to see
    this.addGameToState(gameInfo);

    // Tell the creator they can now join
    client.send(GAME_JOINED, { gameId: gameInfo.id, roomId: gameRoom.roomId });

    // Update lobby player's active game
    if (lobbyPlayer) lobbyPlayer.activeGameId = gameInfo.id;

    console.log(`[LobbyRoom] Game created: "${name}" (${gameInfo.id}) by ${session.displayName}`);
  }

  private async handleJoinGame(client: Client, payload: JoinGamePayload) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return this.sendError(client, "Not authenticated");

    // Prevent joining multiple games simultaneously
    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (lobbyPlayer?.activeGameId) return this.sendError(client, "Already in a game");

    const gameId = payload.gameId;
    const entry = this.state.games.get(gameId);
    if (!entry) return this.sendError(client, "Game not found");
    if (entry.status !== "waiting") return this.sendError(client, "Game already started");
    if (entry.playerCount >= entry.maxPlayers) return this.sendError(client, "Game is full");

    const roomId = this.gameRoomIds.get(gameId);
    if (!roomId) return this.sendError(client, "Game room not available");

    // Tell the joiner the roomId (count will be updated by bridge event)
    client.send(GAME_JOINED, { gameId, roomId });

    // Update lobby player's active game
    if (lobbyPlayer) lobbyPlayer.activeGameId = gameId;

    console.log(`[LobbyRoom] ${session.displayName} joined game "${entry.name}"`);
  }

  private handleLeaveGame(client: Client) {
    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (!lobbyPlayer || !lobbyPlayer.activeGameId) return;

    const gameId = lobbyPlayer.activeGameId;
    const entry = this.state.games.get(gameId);
    if (entry && entry.playerCount > 0) {
      entry.playerCount -= 1;

      // If host left and game hasn't started, remove it
      const session = this.sessions.get(client.sessionId);
      if (entry.status === "waiting" && session?.userId === entry.hostId && entry.playerCount === 0) {
        this.removeGame(gameId);
      } else {
        if (this.gameSessionRepo) {
          void this.gameSessionRepo.updatePlayerCount(gameId, entry.playerCount);
        }
        this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });
      }
    }

    lobbyPlayer.activeGameId = "";
  }

  private async handleStartGame(client: Client) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return this.sendError(client, "Not authenticated");

    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (!lobbyPlayer?.activeGameId) return this.sendError(client, "Not in a game");

    const gameId = lobbyPlayer.activeGameId;
    const entry = this.state.games.get(gameId);
    if (!entry) return this.sendError(client, "Game not found");
    if (entry.hostId !== session.userId) return this.sendError(client, "Only the host can start");
    if (entry.status !== "waiting") return this.sendError(client, "Game already started");

    // Transition to in_progress
    entry.status = "in_progress";
    if (this.gameSessionRepo) {
      await this.gameSessionRepo.updateStatus(gameId, "in_progress");
    }

    const roomId = this.gameRoomIds.get(gameId);
    this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });

    // Notify all players in this game
    if (roomId) {
      this.broadcast(GAME_STARTED, { gameId, roomId });
    }

    console.log(`[LobbyRoom] Game "${entry.name}" started by ${session.displayName}`);
  }

  private handleSetName(client: Client, payload: { name: string }) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return;

    const name = typeof payload.name === "string"
      ? payload.name.trim().slice(0, LOBBY_DEFAULTS.MAX_DISPLAY_NAME_LENGTH)
      : "";
    if (name.length < LOBBY_DEFAULTS.MIN_DISPLAY_NAME_LENGTH) return;

    session.displayName = name;
    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (lobbyPlayer) lobbyPlayer.displayName = name;
  }

  /** Called by GameRoom when a game ends (room disposed). */
  onGameEnded(gameId: string) {
    const entry = this.state.games.get(gameId);
    if (entry) {
      entry.status = "ended";
      if (this.gameSessionRepo) {
        void this.gameSessionRepo.updateStatus(gameId, "ended");
      }
    }
    this.removeGame(gameId);
  }

  private removeGame(gameId: string) {
    this.state.games.delete(gameId);
    this.gameRoomIds.delete(gameId);
    this.broadcast(GAME_REMOVED, { gameId });
    if (this.gameSessionRepo) {
      void this.gameSessionRepo.delete(gameId);
    }
  }

  private addGameToState(info: GameSessionInfo) {
    const entry = new LobbyGameEntry();
    entry.id = info.id;
    entry.name = info.name;
    entry.hostId = info.hostId;
    entry.hostName = info.hostName;
    entry.status = info.status;
    entry.playerCount = info.playerCount;
    entry.maxPlayers = info.maxPlayers;
    entry.mapSize = info.mapSize;
    entry.mapSeed = info.mapSeed;
    entry.createdAt = info.createdAt;
    this.state.games.set(info.id, entry);
  }

  private entryToInfo(entry: LobbyGameEntry): GameSessionInfo {
    return {
      id: entry.id,
      name: entry.name,
      hostId: entry.hostId,
      hostName: entry.hostName,
      status: entry.status as GameSessionInfo["status"],
      playerCount: entry.playerCount,
      maxPlayers: entry.maxPlayers,
      mapSize: entry.mapSize,
      mapSeed: entry.mapSeed,
      createdAt: entry.createdAt,
    };
  }

  private sendError(client: Client, message: string) {
    client.send(LOBBY_ERROR, { message });
  }
}
