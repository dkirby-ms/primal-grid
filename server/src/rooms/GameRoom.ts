import { Room, Client, CloseCode } from "colyseus";
import { GameState, PlayerState } from "./GameState.js";
import { generateProceduralMap } from "./mapGenerator.js";
import { TICK_RATE, DEFAULT_MAP_SIZE, DEFAULT_MAP_SEED, MOVE } from "@primal-grid/shared";
import type { MovePayload } from "@primal-grid/shared";

const PLAYER_COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45",
  "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

export class GameRoom extends Room {
  state = new GameState();

  override onCreate(options: Record<string, unknown>) {
    const seed = typeof options?.seed === "number" ? options.seed : DEFAULT_MAP_SEED;
    this.generateMap(seed);

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

  private generateMap(seed: number = DEFAULT_MAP_SEED) {
    generateProceduralMap(this.state, seed, DEFAULT_MAP_SIZE, DEFAULT_MAP_SIZE);
  }

  private findRandomWalkableTile(): { x: number; y: number } {
    const w = this.state.mapWidth;
    const h = this.state.mapHeight;
    for (let attempts = 0; attempts < 100; attempts++) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      if (this.state.isWalkable(x, y)) {
        return { x, y };
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.state.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }
}
