import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { SERVER_PORT } from "@primal-grid/shared";
import { GameRoom } from "./rooms/GameRoom.js";

const transport = new WebSocketTransport();

const server = new Server({ transport });

server.define("game", GameRoom);

server.listen(SERVER_PORT).then(() => {
  console.log(`[Primal Grid] Colyseus server listening on port ${SERVER_PORT}`);
});
