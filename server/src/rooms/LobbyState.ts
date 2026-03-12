import { Schema, type, MapSchema } from "@colyseus/schema";

/** A single game session entry visible in the lobby. */
export class LobbyGameEntry extends Schema {
  @type("string")
  id: string = "";

  @type("string")
  name: string = "";

  @type("string")
  hostId: string = "";

  @type("string")
  hostName: string = "";

  @type("string")
  status: string = "waiting";

  @type("number")
  playerCount: number = 0;

  @type("number")
  maxPlayers: number = 8;

  @type("number")
  mapSize: number = 128;

  @type("number")
  mapSeed: number = 0;

  @type("number")
  createdAt: number = 0;

  @type("number")
  gameDuration: number = 10;

  @type("number")
  cpuPlayers: number = 0;
}

/** A connected player in the lobby. */
export class LobbyPlayer extends Schema {
  @type("string")
  displayName: string = "";

  @type("string")
  userId: string = "";

  @type("boolean")
  isGuest: boolean = true;

  /** Game ID the player is currently in (empty = in lobby). */
  @type("string")
  activeGameId: string = "";
}

/** Root lobby state synced to all connected lobby clients. */
export class LobbyState extends Schema {
  @type({ map: LobbyGameEntry })
  games = new MapSchema<LobbyGameEntry>();

  @type({ map: LobbyPlayer })
  players = new MapSchema<LobbyPlayer>();
}
