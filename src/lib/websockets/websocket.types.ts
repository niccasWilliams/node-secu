import { WebSocket } from "ws";

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum WsMessageType {
  WORKFLOW_JOIN = "workflow_join",
  WORKFLOW_EVENT = "workflow_event",
  DATASTREAM_SUBSCRIBE = "datastream_subscribe",
  DATASTREAM_UNSUBSCRIBE = "datastream_unsubscribe",
  DATASTREAM_EVENT = "datastream_event",
}

// ============================================================================
// CLIENT TYPES
// ============================================================================

export interface WorkflowClient {
  ws: WebSocket;
  workflowId: number;
}

// ============================================================================
// WEBSOCKET MESSAGE PAYLOADS
// ============================================================================

// Client → Server: Workflow beitreten
export interface WsWorkflowJoinPayload {
  type: WsMessageType.WORKFLOW_JOIN;
  workflowId: number;
}

// Server → Client (oder auch Client → Server, je nach Design):
export type WorkflowEventType = "update" | "log" | "status";

export interface WorkflowEventPayload {
  type: WsMessageType.WORKFLOW_EVENT;
  workflowId: number;
  eventType: WorkflowEventType;
  data: any;
}

// Optional: Union für alle Workflow-Nachrichten
export type WsWorkflowMessage = WsWorkflowJoinPayload | WorkflowEventPayload;

export interface WsDataStreamSubscribePayload {
  type: WsMessageType.DATASTREAM_SUBSCRIBE;
  stream: string;
}

export interface WsDataStreamUnsubscribePayload {
  type: WsMessageType.DATASTREAM_UNSUBSCRIBE;
  stream: string;
}

export interface WsDataStreamEventPayload {
  type: WsMessageType.DATASTREAM_EVENT;
  stream: string;
  payload?: {
    event?: string;
    data: any;
    meta?: Record<string, unknown>;
  };
  error?: string;
}
