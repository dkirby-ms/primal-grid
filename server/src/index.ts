import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Encoder } from "@colyseus/schema";
import { SERVER_PORT } from "@primal-grid/shared";
import { GameRoom } from "./rooms/GameRoom.js";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { LocalAuthProvider } from "./auth/LocalAuthProvider.js";
import { createAuthRouter } from "./auth/routes.js";
import { SqliteUserRepository } from "./persistence/SqliteUserRepository.js";
import { SqlitePlayerStateRepository } from "./persistence/SqlitePlayerStateRepository.js";
import { GameSessionRepository } from "./persistence/GameSessionRepository.js";

Encoder.BUFFER_SIZE = 768 * 1024; // 768 KB — needed for 128×128 map state sync

// Auth configuration
const JWT_SECRET = process.env.JWT_SECRET || "primal-grid-dev-secret-change-in-production";
const DB_PATH = process.env.DB_PATH || "primal-grid.db";

// Initialize persistence layer (SQLite for dev)
const userRepo = new SqliteUserRepository(DB_PATH);
const playerStateRepo = new SqlitePlayerStateRepository(DB_PATH);
const gameSessionRepo = new GameSessionRepository(DB_PATH);

// Initialize auth provider (local JWT — swap to Entra ID later)
const authProvider = new LocalAuthProvider(userRepo, JWT_SECRET);

const app = express();
app.use(cors());
app.use(express.json());

// Auth API routes
app.use("/auth", createAuthRouter(authProvider));

// Serve static client files (populated by Docker build)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../../public")));

app.get("/health", (_req, res) => res.sendStatus(200));

const httpServer = createServer(app);
const transport = new WebSocketTransport({ server: httpServer });

const server = new Server({ transport });

// Define room with auth + persistence injected via onCreate options
server.define("game", GameRoom).on("create", (room: GameRoom) => {
  room.authProvider = authProvider;
  room.playerStateRepo = playerStateRepo;
});

// Define lobby room with auth + game session repo
server.define("lobby", LobbyRoom).on("create", (room: LobbyRoom) => {
  room.authProvider = authProvider;
  room.gameSessionRepo = gameSessionRepo;
});

const port = Number(process.env.PORT) || SERVER_PORT;
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
server.listen(port).then(() => {
  console.log(`[Primal Grid] Colyseus server listening on port ${port}`);
  console.log(`[Primal Grid] Client available at ${clientUrl}`);
  console.log(`[Primal Grid] Auth endpoints available at /auth/{register,login,guest,upgrade}`);
  console.log(`[Primal Grid] Database: ${DB_PATH}`);
});
