import { Room, Client } from "colyseus";
import { GameState } from "./GameState.js";
import { TICK_RATE } from "@primal-grid/shared";

export class GameRoom extends Room<GameState> {
  override onCreate(_options: Record<string, unknown>) {
    this.setState(new GameState());

    this.setSimulationInterval((deltaTime) => {
      this.state.tick += 1;
    }, 1000 / TICK_RATE);

    console.log("[GameRoom] Room created.");
  }

  override onJoin(client: Client) {
    console.log(`[GameRoom] Client joined: ${client.sessionId}`);
  }

  override onLeave(client: Client, consented: boolean) {
    console.log(
      `[GameRoom] Client left: ${client.sessionId} (consented: ${consented})`
    );
  }

  override onDispose() {
    console.log("[GameRoom] Room disposed.");
  }
}
