import { Room, Client, CloseCode } from "colyseus";
import { GameState, TileState, PlayerState } from "./GameState.js";
import { TICK_RATE, DEFAULT_MAP_SIZE, TileType, MOVE } from "@primal-grid/shared";
import type { MovePayload } from "@primal-grid/shared";

const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

export class GameRoom extends Room {
  state = new GameState();

  override onCreate(_options: Record<string, unknown>) {
    this.generateMap();

    this.setSimulationInterval((_deltaTime) => {
      this.state.tick += 1;
    }, 1000 / TICK_RATE);

    this.onMessage(MOVE, (client, message: MovePayload) => {
      this.handleMove(client, message);
    });

    console.log("[GameRoom] Room created.");
  }

  override onJoin(client: Client) {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];

    const spawn = this.findRandomWalkableTile();
    player.x = spawn.x;
    player.y = spawn.y;

    this.state.players.set(client.sessionId, player);
    console.log(`[GameRoom] Client joined: ${client.sessionId} at (${spawn.x}, ${spawn.y})`);
  }

  override onLeave(client: Client, code: number) {
    this.state.players.delete(client.sessionId);
    const consented = code === CloseCode.CONSENTED;
    console.log(
      `[GameRoom] Client left: ${client.sessionId} (consented: ${consented})`
    );
  }

  override onDispose() {
    console.log("[GameRoom] Room disposed.");
  }

  private handleMove(client: Client, message: MovePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const { dx, dy } = message;
    // Validate direction values are -1, 0, or 1
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return;
    if (dx < -1 || dx > 1 || dy < -1 || dy > 1) return;
    if (dx === 0 && dy === 0) return;

    const newX = player.x + dx;
    const newY = player.y + dy;

    if (this.state.isWalkable(newX, newY)) {
      player.x = newX;
      player.y = newY;
    }
  }

  private generateMap() {
    const size = DEFAULT_MAP_SIZE;
    this.state.mapWidth = size;
    this.state.mapHeight = size;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tile = new TileState();
        tile.x = x;
        tile.y = y;
        tile.type = this.chooseTileType(x, y, size);
        this.state.tiles.push(tile);
      }
    }
  }

  /** Simple deterministic tile generation — mostly grass, with water/rock/sand clusters. */
  private chooseTileType(x: number, y: number, size: number): TileType {
    // Water pond in upper-left quadrant
    if (x >= 4 && x <= 8 && y >= 4 && y <= 8) return TileType.Water;
    // Sand beach around the pond
    if (x >= 3 && x <= 9 && y >= 3 && y <= 9) return TileType.Sand;

    // Rock formation in lower-right
    if (x >= 22 && x <= 26 && y >= 22 && y <= 26) return TileType.Rock;

    // Second small water feature
    if (x >= 18 && x <= 20 && y >= 6 && y <= 8) return TileType.Water;
    if (x >= 17 && x <= 21 && y >= 5 && y <= 9) return TileType.Sand;

    // Scattered rocks along edges
    if ((x === 0 || x === size - 1 || y === 0 || y === size - 1) &&
        (x + y) % 7 === 0) {
      return TileType.Rock;
    }

    return TileType.Grass;
  }

  private findRandomWalkableTile(): { x: number; y: number } {
    const size = DEFAULT_MAP_SIZE;
    // Try random positions
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      if (this.state.isWalkable(x, y)) {
        return { x, y };
      }
    }
    // Fallback: find first walkable tile
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.state.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }
}
