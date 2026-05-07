import WebSocket from "ws";

/**
 * Base interface for WebSocket modules
 * Each module handles a specific type of WebSocket communication (chat, workflows, terminals, etc.)
 */
export interface WebSocketModule<TClient = any, TMessage = any> {
  /**
   * Module name for identification
   */
  readonly name: string;

  /**
   * Initialize the module (called once when WebSocketService starts)
   */
  initialize?(): void;

  /**
   * Cleanup when shutting down
   */
  cleanup?(): void;

  /**
   * Handle incoming message from client
   * @returns true if message was handled by this module
   */
  handleMessage(
    ws: WebSocket,
    message: TMessage,
    authenticatedUserId?: number
  ): boolean;

  /**
   * Handle client disconnection
   */
  handleDisconnect?(ws: WebSocket): void;

  /**
   * Get all active clients managed by this module
   */
  getClients(): TClient[];

  /**
   * Remove a specific client from this module
   */
  removeClient(ws: WebSocket): void;
}

/**
 * Base class for WebSocket modules with common functionality
 */
export abstract class BaseWebSocketModule<TClient extends { ws: WebSocket }, TMessage = any>
  implements WebSocketModule<TClient, TMessage>
{
  protected clients: TClient[] = [];

  constructor(public readonly name: string) {}

  abstract handleMessage(
    ws: WebSocket,
    message: TMessage,
    authenticatedUserId?: number
  ): boolean;

  getClients(): TClient[] {
    return this.clients;
  }

  removeClient(ws: WebSocket): void {
    this.clients = this.clients.filter((client) => client.ws !== ws);
  }

  handleDisconnect(ws: WebSocket): void {
    this.removeClient(ws);
  }

  /**
   * Safely send a message to a WebSocket client
   */
  protected safeSend(ws: WebSocket, data: any): boolean {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(typeof data === "string" ? data : JSON.stringify(data));
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[${this.name}] Error sending message:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to multiple clients
   */
  protected broadcast(clients: TClient[], data: any): void {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    clients.forEach((client) => {
      this.safeSend(client.ws, serialized);
    });
  }

  /**
   * Remove dead connections (readyState !== OPEN)
   */
  protected cleanupDeadConnections(): void {
    this.clients = this.clients.filter(
      (client) => client.ws.readyState === WebSocket.OPEN
    );
  }
}
