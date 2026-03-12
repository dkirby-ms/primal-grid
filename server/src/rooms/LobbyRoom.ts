import { Room, Client, matchMaker } from "colyseus";
import type { AuthProvider, AuthUser } from "../auth/AuthProvider.js";
import type { GameSessionRepository } from "../persistence/GameSessionRepository.js";
import type { LobbyBridge } from "./LobbyBridge.js";
import { LobbyState, LobbyGameEntry, LobbyPlayer } from "./LobbyState.js";
import {
  CREATE_GAME, JOIN_GAME, LEAVE_GAME, START_GAME, SET_READY,
  GAME_LIST, GAME_JOINED, GAME_STARTED, GAME_PLAYERS,
  GAME_UPDATED, GAME_REMOVED, LOBBY_ERROR,
  LOBBY_DEFAULTS, DEFAULT_MAP_SIZE, CPU_PLAYER,
} from "@primal-grid/shared";
import type {
  CreateGamePayload, JoinGamePayload,
  GameSessionInfo, PreGamePlayerInfo, GamePlayersPayload,
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
  /** Maps gameId → (sessionId → player info) for players in waiting games. */
  private waitingPlayers = new Map<string, Map<string, PreGamePlayerInfo>>();
  /** Maps gameId → creation options, stored until room is actually created on start. */
  private pendingGameOptions = new Map<string, Record<string, unknown>>();

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

    this.onMessage(SET_READY, (client, payload: { ready: boolean }) => {
      this.handleSetReady(client, payload);
    });

    this.onMessage("set_name", (client, payload: { name: string }) => {
      this.handleSetName(client, payload);
    });
  }

  registerBridgeListeners() {
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
    const cpuPlayers = Math.min(
      Math.max(typeof payload.cpuPlayers === "number" ? Math.floor(payload.cpuPlayers) : 0, 0),
      7
    );
    const gameDuration = typeof payload.gameDuration === "number"
      ? Math.max(Math.floor(payload.gameDuration), 0)
      : 10;

    // Persist game session
    let gameInfo: GameSessionInfo;
    if (this.gameSessionRepo) {
      gameInfo = await this.gameSessionRepo.create(
        name, session.userId, session.displayName, maxPlayers, mapSize, mapSeed,
      );
      gameInfo.cpuPlayers = cpuPlayers;
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
        cpuPlayers,
      };
    }

    // Store creation options for deferred room creation on start
    this.pendingGameOptions.set(gameInfo.id, {
      gameId: gameInfo.id,
      gameName: name,
      mapSize,
      seed: mapSeed,
      maxPlayers,
      hostId: session.userId,
      cpuPlayers,
      gameDuration,
    });

    // Track the creator in the waiting players map
    const playerMap = new Map<string, PreGamePlayerInfo>();
    playerMap.set(client.sessionId, {
      userId: session.userId,
      displayName: session.displayName,
      isReady: false,
    });
    this.waitingPlayers.set(gameInfo.id, playerMap);

    // Add to lobby state for all clients to see
    this.addGameToState(gameInfo);
    // Set gameDuration on the lobby entry (not part of GameSessionInfo)
    const lobbyEntry = this.state.games.get(gameInfo.id);
    if (lobbyEntry) lobbyEntry.gameDuration = gameDuration;

    // Tell the creator they've joined the waiting game (no roomId yet)
    client.send(GAME_JOINED, { gameId: gameInfo.id });

    // Update lobby player's active game
    if (lobbyPlayer) lobbyPlayer.activeGameId = gameInfo.id;

    // Broadcast updated game list entry to all lobby clients
    if (lobbyEntry) {
      this.broadcast(GAME_UPDATED, { game: this.entryToInfo(lobbyEntry) });
    }

    // Send initial player list to the creator
    this.broadcastGamePlayers(gameInfo.id);

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

    // Add joiner to the waiting players map
    const playerMap = this.waitingPlayers.get(gameId);
    if (!playerMap) return this.sendError(client, "Game not available");

    playerMap.set(client.sessionId, {
      userId: session.userId,
      displayName: session.displayName,
      isReady: false,
    });

    // Update player count in lobby state
    entry.playerCount = playerMap.size;
    if (this.gameSessionRepo) {
      void this.gameSessionRepo.updatePlayerCount(gameId, entry.playerCount);
    }

    // Tell the joiner they've joined (no roomId during waiting phase)
    client.send(GAME_JOINED, { gameId });

    // Update lobby player's active game
    if (lobbyPlayer) lobbyPlayer.activeGameId = gameId;

    // Broadcast player list to all participants in this game
    this.broadcastGamePlayers(gameId);

    // Broadcast updated game entry to all lobby clients
    this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });

    console.log(`[LobbyRoom] ${session.displayName} joined game "${entry.name}"`);
  }

  private handleLeaveGame(client: Client) {
    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (!lobbyPlayer || !lobbyPlayer.activeGameId) return;

    const gameId = lobbyPlayer.activeGameId;
    const entry = this.state.games.get(gameId);

    // Remove from waiting players map if game is still in waiting phase
    const playerMap = this.waitingPlayers.get(gameId);
    if (playerMap) {
      playerMap.delete(client.sessionId);

      // If host left and no players remain, remove the game entirely
      const session = this.sessions.get(client.sessionId);
      if (entry && entry.status === "waiting" && session?.userId === entry.hostId && playerMap.size === 0) {
        this.waitingPlayers.delete(gameId);
        this.pendingGameOptions.delete(gameId);
        this.removeGame(gameId);
        lobbyPlayer.activeGameId = "";
        return;
      }

      // Update player count and broadcast
      if (entry) {
        entry.playerCount = playerMap.size;
        if (this.gameSessionRepo) {
          void this.gameSessionRepo.updatePlayerCount(gameId, entry.playerCount);
        }
        this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });
      }

      // Broadcast updated player list to remaining participants
      this.broadcastGamePlayers(gameId);
    } else if (entry && entry.playerCount > 0) {
      // Game is in_progress — decrement count via existing logic
      entry.playerCount -= 1;
      if (this.gameSessionRepo) {
        void this.gameSessionRepo.updatePlayerCount(gameId, entry.playerCount);
      }
      this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });
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

    // NOW create the Colyseus GameRoom
    const roomOptions = this.pendingGameOptions.get(gameId);
    if (!roomOptions) return this.sendError(client, "Game configuration not found");

    let gameRoom;
    try {
      gameRoom = await matchMaker.createRoom("game", roomOptions);
    } catch (err) {
      console.error(`[LobbyRoom] Failed to create GameRoom:`, err);
      return this.sendError(client, "Failed to create game room. Please try again.");
    }

    this.gameRoomIds.set(gameId, gameRoom.roomId);

    // Transition to in_progress
    entry.status = "in_progress";
    if (this.gameSessionRepo) {
      await this.gameSessionRepo.updateStatus(gameId, "in_progress");
    }

    this.broadcast(GAME_UPDATED, { game: this.entryToInfo(entry) });

    // Notify all players in this game with the roomId so they can join the GameRoom
    const playerMap = this.waitingPlayers.get(gameId);
    if (playerMap) {
      for (const [sessionId] of playerMap) {
        const playerClient = this.clients.find((c) => c.sessionId === sessionId);
        if (playerClient) {
          playerClient.send(GAME_STARTED, { gameId, roomId: gameRoom.roomId });
        }
      }
    }

    // Clean up waiting state
    this.waitingPlayers.delete(gameId);
    this.pendingGameOptions.delete(gameId);

    console.log(`[LobbyRoom] Game "${entry.name}" started by ${session.displayName}`);
  }

  private handleSetReady(client: Client, payload: { ready: boolean }) {
    const session = this.sessions.get(client.sessionId);
    if (!session) return this.sendError(client, "Not authenticated");

    const lobbyPlayer = this.state.players.get(client.sessionId);
    if (!lobbyPlayer?.activeGameId) return this.sendError(client, "Not in a game");

    const gameId = lobbyPlayer.activeGameId;
    const entry = this.state.games.get(gameId);
    if (!entry || entry.status !== "waiting") return;

    const playerMap = this.waitingPlayers.get(gameId);
    if (!playerMap) return;

    const playerInfo = playerMap.get(client.sessionId);
    if (!playerInfo) return;

    playerInfo.isReady = !!payload.ready;

    // Broadcast updated player list to all participants
    this.broadcastGamePlayers(gameId);
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

  /** Send GAME_PLAYERS to all participants currently in a waiting game. */
  private broadcastGamePlayers(gameId: string) {
    const playerMap = this.waitingPlayers.get(gameId);
    if (!playerMap) return;

    const players: PreGamePlayerInfo[] = Array.from(playerMap.values());

    // Append synthetic CPU player entries so they appear in the waiting room
    const options = this.pendingGameOptions.get(gameId);
    const cpuCount = typeof options?.cpuPlayers === "number" ? options.cpuPlayers : 0;
    for (let i = 0; i < cpuCount; i++) {
      players.push({
        userId: `${CPU_PLAYER.SESSION_PREFIX}${i}`,
        displayName: CPU_PLAYER.NAMES[i] ?? `CPU ${i + 1}`,
        isReady: true,
        isCPU: true,
      });
    }

    const payload: GamePlayersPayload = { gameId, players };

    for (const [sessionId] of playerMap) {
      const playerClient = this.clients.find((c) => c.sessionId === sessionId);
      if (playerClient) {
        playerClient.send(GAME_PLAYERS, payload);
      }
    }
  }

  private removeGame(gameId: string) {
    this.state.games.delete(gameId);
    this.gameRoomIds.delete(gameId);
    this.waitingPlayers.delete(gameId);
    this.pendingGameOptions.delete(gameId);
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
    entry.cpuPlayers = info.cpuPlayers ?? 0;
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
      cpuPlayers: entry.cpuPlayers,
    };
  }

  private sendError(client: Client, message: string) {
    client.send(LOBBY_ERROR, { message });
  }
}
