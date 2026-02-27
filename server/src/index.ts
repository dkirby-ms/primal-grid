import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { Encoder } from "@colyseus/schema";
import { SERVER_PORT } from "@primal-grid/shared";
import { GameRoom } from "./rooms/GameRoom.js";

Encoder.BUFFER_SIZE = 256 * 1024; // 256 KB — needed for 64×64 map state sync

const app = express();

// Serve static client files (populated by Docker build)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../../public")));

const httpServer = createServer(app);
const transport = new WebSocketTransport({ server: httpServer });

const server = new Server({ transport });

server.define("game", GameRoom);

const port = Number(process.env.PORT) || SERVER_PORT;
server.listen(port).then(() => {
  console.log(`[Primal Grid] Colyseus server listening on port ${port}`);
});
