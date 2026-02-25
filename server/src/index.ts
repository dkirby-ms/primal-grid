import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { Encoder } from "@colyseus/schema";
import { SERVER_PORT } from "@primal-grid/shared";
import { GameRoom } from "./rooms/GameRoom.js";

Encoder.BUFFER_SIZE = 128 * 1024; // 128 KB — needed for full map state with biome data

const transport = new WebSocketTransport();

const server = new Server({ transport });

server.define("game", GameRoom);

server.listen(SERVER_PORT).then(() => {
  console.log(`[Primal Grid] Colyseus server listening on port ${SERVER_PORT}`);
});
