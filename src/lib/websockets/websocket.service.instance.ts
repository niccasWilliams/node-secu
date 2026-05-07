import { WebsocketService } from "./websocket.service";
import { WebSocketServer } from "ws";

// Singleton-Instanz des WebsocketService
let websocketServiceInstance: WebsocketService | null = null;

// Funktion zum Initialisieren des WebsocketService
export function initializeWebsocketService(wss: WebSocketServer): WebsocketService {
  if (!websocketServiceInstance) {
    websocketServiceInstance = new WebsocketService(wss);
  }
  return websocketServiceInstance;
}

// Funktion zum Abrufen der WebsocketService-Instanz
export function getWebsocketService(): WebsocketService {
  if (!websocketServiceInstance) {
    throw new Error("WebsocketService ist nicht initialisiert. Bitte zuerst initializeWebsocketService aufrufen.");
  }
  return websocketServiceInstance;
}

// Optional: Direkter Export der Instanz (wenn sie existiert)
export const websocketService = () => websocketServiceInstance;