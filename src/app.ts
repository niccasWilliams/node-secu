import express from "express";
import morgan from "morgan";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import registerRoutes from "./routes";
import { customMorganFormat } from "./util/moganFormat";
import { initializeWebsocketService } from "./lib/websockets/websocket.service.instance";
import helmet from "helmet";
import { validateEnvironmentVariables } from "./util/env-validator";


// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), `.env`) });

// Validate environment variables
validateEnvironmentVariables();

const app = express();




// 🌐 Umgebungserkennung: live oder lokal
const isProduction = process.env.HOST_NAME !== "localhost";
const HOST_NAME = process.env.HOST_NAME || "localhost";
const PORT = process.env.NODE_PORT ? parseInt(process.env.NODE_PORT, 10) : undefined;
if(!PORT) throw new Error("NODE_PORT is not defined or invalid");
const PUBLIC_URL = process.env.PUBLIC_URL || `http://${HOST_NAME}:${PORT}`;



const allowedOrigins = isProduction
  ? [
    `https://${process.env.FRONTEND_HOST_NAME}`,
    `http://${process.env.FRONTEND_HOST_NAME}`
  ]
  : ["http://localhost:3000"];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  allowedHeaders: "Content-Type, Authorization",
};

console.log(`🌐 Public URL: ${PUBLIC_URL}`);
app.use(cors(corsOptions));


const imgSrcUrls = ["'self'", "data:"];
try {
  const parsedUrl = new URL(process.env.PUBLIC_URL || "");
  imgSrcUrls.push(parsedUrl.origin);
} catch {
  console.warn("⚠️ Ungültiger PUBLIC_URL Wert – wird aus CSP ausgeschlossen.");
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: imgSrcUrls,
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
      },
    },
  })
);


app.use('/public', express.static(path.resolve(__dirname, '../../public')));

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(customMorganFormat));

// Routen registrieren
registerRoutes(app);



// Server & WebSocket
const server = createServer(app);
const wss = new WebSocketServer({ server });
initializeWebsocketService(wss);



const startServer = () => {
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️  Port ${PORT} belegt — versuche alten Prozess zu beenden...`);
      import("node:child_process").then(({ execSync }) => {
        try {
          const pids = execSync(`lsof -i :${PORT} -t 2>/dev/null`).toString().trim();
          if (pids) {
            for (const pid of pids.split("\n")) {
              if (pid && Number(pid) !== process.pid) {
                process.kill(Number(pid), "SIGTERM");
              }
            }
            console.log("  Alter Prozess beendet, starte neu in 1s...");
            setTimeout(() => startServer(), 1000);
            return;
          }
        } catch { /* lsof nicht verfügbar oder kein Prozess */ }
      });
      return;
    }
    console.error("Server error:", err);
    process.exit(1);
  });

  server.listen(PORT, isProduction ? undefined : HOST_NAME, async () => {
    if (!isProduction) console.warn("⚠️ WARNING: Auth middleware skipped due to local environment");
    console.log(`🟢 API läuft auf: http://${HOST_NAME}:${PORT}`);
    console.log(`🟢 WebSocket läuft auf: ${isProduction ? "wss" : "ws"}://${HOST_NAME}:${PORT}`);
  });
};

startServer();

// ─── Graceful Shutdown ───────────────────────────────────────────────────
// Ensures the port is released when the process is terminated (nodemon restart, Ctrl+C, etc.)
function gracefulShutdown(signal: string) {
  console.log(`\n🔴 ${signal} received — shutting down...`);
  server.close(() => {
    console.log("🔴 Server closed.");
    process.exit(0);
  });
  // Force exit if server doesn't close within 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
// nodemon sends SIGUSR2 before restart
process.once("SIGUSR2", () => {
  gracefulShutdown("SIGUSR2 (nodemon)");
});
