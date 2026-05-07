import { WebSocketServer, WebSocket } from "ws";

import { WebSocketModule } from "./modules/base.module";
import { WorkflowWebSocketModule } from "./modules/workflow.websocket.module";
import { WorkflowEventPayload, WorkflowQueueId } from "@/routes/app-features/workflow-queue/workflow-queue.types";
import { DataStreamWebSocketModule } from "./modules/data-stream.websocket.module";
import { dataStreamManager } from "@/lib/websockets/datastreams/dataStream.manager";
import "@/lib/websockets/datastreams/dataStream.bootstrap";


class WebsocketService {
  private wss: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // WebSocket Modules
  private modules: Map<string, WebSocketModule> = new Map();
  private workflowModule: WorkflowWebSocketModule;
  private dataStreamModule: DataStreamWebSocketModule;

  constructor(wss: WebSocketServer) {
    this.wss = wss;

    // Initialize WebSocket modules
    this.workflowModule = new WorkflowWebSocketModule();
    this.dataStreamModule = new DataStreamWebSocketModule();

    // Register modules
    this.modules.set(this.workflowModule.name, this.workflowModule);
    this.modules.set(this.dataStreamModule.name, this.dataStreamModule);

    dataStreamManager.setTransport((key, payload) => {
      this.dataStreamModule.broadcastToStream(key, payload);
    });

    // Initialize all modules
    this.modules.forEach((module) => {
      if (module.initialize) {
        module.initialize();
      }
    });

    console.log(
      `WebSocket-Server initialized with ${this.modules.size} modules:`,
      Array.from(this.modules.keys())
    );

    // Start heartbeat
    this.startHeartbeat();

    this.wss.on("connection", async (ws, req) => {
      console.log("Neue WebSocket-Verbindung von:", req.socket.remoteAddress);

      // JWT Token aus Query-Parameter holen
      const url = new URL(req.url || "", `ws://${req.headers.host}`);
      const token = url.searchParams.get("token");

      if (!token) {
        console.error("❌ No token provided in WebSocket connection");
        ws.close(1008, "Unauthorized: Missing token");
        return;
      }

      // Token verifizieren
      try {
        const { userController } = await import(
          "@/routes/auth/users/user/user.controller"
        );

        // Mock-Request für verifyToken
        const mockReq: any = {
          headers: {
            authorization: `Bearer ${token}`,
          },
          get: (headerName: string) => {
            return mockReq.headers[headerName.toLowerCase()];
          },
        };

        const { valid, userId: externalUserId } =
          await userController.verifyToken(mockReq);

        if (!valid || !externalUserId) {
          console.error("❌ Invalid token");
          ws.close(1008, "Unauthorized: Invalid token");
          return;
        }

        // Internen User holen
        const { userService } = await import(
          "@/routes/auth/users/user/user.service"
        );
        const user = await userService.getUserByExternalUserId(externalUserId);

        if (!user || !user.id) {
          console.error("❌ User not found");
          ws.close(1008, "Unauthorized: User not found");
          return;
        }

        // User auf WebSocket speichern
        (ws as any).userId = user.id;
        (ws as any).externalUserId = externalUserId;

        console.log(`✅ WebSocket authenticated: User ${user.id} (${user.email})`);
      } catch (error) {
        console.error("❌ WebSocket auth error:", error);
        ws.close(1011, "Authentication failed");
        return;
      }

      // Pong handler für heartbeat
      ws.on("pong", () => {
        // Connection ist alive
      });

      ws.on("message", async (message) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          const authenticatedUserId = (ws as any).userId;

          console.log(
            "📥 Incoming WebSocket message:",
            JSON.stringify(parsedMessage, null, 2)
          );

          // Delegiere an Module (z.B. Workflow-Modul)
          let handled = false;
          for (const module of this.modules.values()) {
            if (module.handleMessage(ws, parsedMessage, authenticatedUserId)) {
              handled = true;
              break;
            }
          }

          if (handled) {
            return;
          }

          console.log("⚠️ Unhandled WebSocket message:", parsedMessage);

          // generische Fehlermeldung zurückgeben
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Unhandled message type",
            })
          );
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            })
          );
        }
      });

      ws.on("close", () => {
        this.removeClient(ws);
        console.log("WebSocket-Verbindung geschlossen");
      });
    });
  }

  private removeClient(ws: WebSocket) {
    // Alle Module über Disconnect informieren
    this.modules.forEach((module) => {
      if (module.handleDisconnect) {
        module.handleDisconnect(ws);
      }
    });
  }

  // ========== Workflow Module Methods ==========

  /**
   * Send workflow event to all subscribed clients
   */
  public sendWorkflowEvent(
    workflowId: WorkflowQueueId,
    event: WorkflowEventPayload
  ): void {
    this.workflowModule.sendWorkflowEvent(workflowId, event);
  }

  /**
   * Get workflow client count
   */
  public getWorkflowClientCount(workflowId: WorkflowQueueId): number {
    return this.workflowModule.getWorkflowClientCount(workflowId);
  }

  /**
   * Get all active workflow IDs
   */
  public getActiveWorkflowIds(): WorkflowQueueId[] {
    return this.workflowModule.getActiveWorkflowIds();
  }

  public getDataStreamClientCount(stream: string): number {
    return this.dataStreamModule.getStreamClientCount(stream);
  }

  // ========== Heartbeat ==========
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, 30000); // alle 30 Sekunden
  }

  public stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export { WebsocketService };
