import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Encoder } from "@colyseus/schema";
import { SERVER_PORT } from "@primal-grid/shared";
import { GameRoom } from "./rooms/GameRoom.js";

Encoder.BUFFER_SIZE = 768 * 1024; // 768 KB — needed for 128×128 map state sync

const app = express();

// Serve static client files (populated by Docker build)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../../public")));

app.get("/health", (_req, res) => res.sendStatus(200));

const httpServer = createServer(app);
const transport = new WebSocketTransport({ server: httpServer });

const server = new Server({ transport });

server.define("game", GameRoom);

const port = Number(process.env.PORT) || SERVER_PORT;
const clientUrl = "http://localhost:3000";
server.listen(port).then(() => {
  console.log(`[Primal Grid] Colyseus server listening on port ${port}`);
  console.log(`[Primal Grid] Client available at ${clientUrl}`);
});
