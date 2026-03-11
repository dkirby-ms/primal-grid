// --- Lobby message type constants ---

export const CREATE_GAME = "create_game" as const;
export const JOIN_GAME = "join_game" as const;
export const LEAVE_GAME = "leave_game" as const;
export const START_GAME = "start_game" as const;
export const GAME_LIST = "game_list" as const;
export const GAME_UPDATED = "game_updated" as const;
export const GAME_REMOVED = "game_removed" as const;
export const GAME_STARTED = "game_started" as const;
export const GAME_JOINED = "game_joined" as const;
export const LOBBY_ERROR = "lobby_error" as const;

// --- Game session status ---

export type GameStatus = "waiting" | "in_progress" | "ended";

// --- Lobby payload interfaces ---

/** Info about a game session shown in the lobby list. */
export interface GameSessionInfo {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  status: GameStatus;
  playerCount: number;
  maxPlayers: number;
  mapSize: number;
  mapSeed: number;
  createdAt: number;
}

/** Player info as shown in the lobby. */
export interface LobbyPlayerInfo {
  userId: string;
  displayName: string;
  isGuest: boolean;
  /** ID of game this player is currently in, if any. */
  activeGameId?: string;
}

/** Client → Server: create a new game. */
export interface CreateGamePayload {
  name: string;
  maxPlayers?: number;
  mapSize?: number;
  mapSeed?: number;
  /** Number of CPU-controlled opponents to add at room creation (0–7). */
  cpuPlayers?: number;
}

/** Client → Server: join an existing game. */
export interface JoinGamePayload {
  gameId: string;
}

/** Client → Server: leave current game. */
export interface LeaveGamePayload {
  gameId: string;
}

/** Server → Client: game list update. */
export interface GameListPayload {
  games: GameSessionInfo[];
}

/** Server → Client: a single game was updated. */
export interface GameUpdatedPayload {
  game: GameSessionInfo;
}

/** Server → Client: a game was removed from the list. */
export interface GameRemovedPayload {
  gameId: string;
}

/** Server → Client: game is ready to join (contains roomId). */
export interface GameJoinedPayload {
  gameId: string;
  roomId: string;
}

/** Server → Client: game has started (for players in the game). */
export interface GameStartedPayload {
  gameId: string;
  roomId: string;
}

/** Server → Client: error response. */
export interface LobbyErrorPayload {
  message: string;
}

/** Default lobby constants. */
export const LOBBY_DEFAULTS = {
  MAX_PLAYERS: 8,
  MIN_PLAYERS: 1,
  MAX_GAME_NAME_LENGTH: 32,
  MIN_GAME_NAME_LENGTH: 1,
  MAX_DISPLAY_NAME_LENGTH: 20,
  MIN_DISPLAY_NAME_LENGTH: 1,
} as const;
