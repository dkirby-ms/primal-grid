import { EventEmitter } from "events";

/**
 * Bridge for GameRoom → LobbyRoom lifecycle communication.
 *
 * A single instance is created at server startup and injected into both
 * LobbyRoom and GameRoom via the Colyseus `on("create")` hook. This lets
 * GameRoom report player-count changes and disposal without holding a
 * direct reference to the LobbyRoom instance.
 */
export class LobbyBridge extends EventEmitter {
  /** GameRoom reports its actual player count after a join or leave. */
  notifyPlayerCountChanged(gameId: string, count: number): void {
    this.emit("player_count_changed", gameId, count);
  }

  /** GameRoom reports it has been disposed (game over). */
  notifyGameEnded(gameId: string): void {
    this.emit("game_ended", gameId);
  }
}
