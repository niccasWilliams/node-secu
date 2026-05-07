// server.websocket.ts
import { createServer } from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "path";
import { initializeWebsocketService } from "./lib/websockets/websocket.service.instance";

dotenv.config({ path: path.resolve(process.cwd(), `.env`) });

const server = createServer(); // kein Express nötig
const wss = new WebSocketServer({ server });

initializeWebsocketService(wss);

// Railway nutzt automatisch PORT aus env
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`✅ WebSocket Server läuft auf ws://localhost:${PORT} (Railway: wss://deine-domain)`);
});