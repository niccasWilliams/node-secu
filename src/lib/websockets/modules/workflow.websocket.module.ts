import WebSocket from "ws";
import { BaseWebSocketModule } from "./base.module";

import { WsMessageType } from "../websocket.types";
import { WorkflowQueueId } from "@/db/schema";
import { WorkflowEventPayload } from "@/routes/app-features/workflow-queue/workflow-queue.types";

/**
 * Workflow client information
 */
export interface WorkflowClient {
  ws: WebSocket;
  workflowId: WorkflowQueueId;
}

/**
 * Workflow join message structure
 */
export interface WorkflowJoinMessage {
  type: WsMessageType.WORKFLOW_JOIN | "join_workflow" | "workflow_join";
  workflowId: WorkflowQueueId;
}

/**
 * WebSocket module for workflow progress tracking
 */
export class WorkflowWebSocketModule extends BaseWebSocketModule<WorkflowClient> {
  private readonly WORKFLOW_KEEP_ALIVE_MS = 60 * 1000; // keep cached events for 1 minute
  private readonly MAX_CACHED_EVENTS = 50;
  private workflowEventCache: Map<WorkflowQueueId, WorkflowEventPayload[]> = new Map();
  private workflowKeepAliveTimers: Map<WorkflowQueueId, NodeJS.Timeout> = new Map();

  constructor() {
    super("workflow");
  }

  handleMessage(
    ws: WebSocket,
    message: any,
    authenticatedUserId?: number
  ): boolean {
    const { type } = message;

    // Handle workflow join messages
    if (
      (type === WsMessageType.WORKFLOW_JOIN ||
        type === "join_workflow" ||
        type === "workflow_join") &&
      typeof message.workflowId === "string"
    ) {
      this.addClient(ws, message.workflowId);
      return true;
    }

    return false;
  }

  /**
   * Add a client to a specific workflow channel
   */
  public addClient(ws: WebSocket, workflowId: WorkflowQueueId): void {
    // Check if already subscribed
    const existing = this.clients.find(
      (client) => client.ws === ws && client.workflowId === workflowId
    );

    if (existing) {
      console.log(`[${this.name}] Client already subscribed to workflow ${workflowId}`);
      return;
    }

    // Add new subscription
    this.clients.push({ ws, workflowId });

    console.log(
      `[${this.name}] Client joined workflow ${workflowId} (total: ${this.clients.length})`
    );

    // Send confirmation
    this.safeSend(ws, {
      type: WsMessageType.WORKFLOW_EVENT,
      workflowId,
      data: {
        type: "workflow_joined",
        workflowId,
      },
    });

    this.flushCachedEventsToClient(ws, workflowId);
  }

  /**
   * Send an event to all clients subscribed to a specific workflow
   */
  public sendWorkflowEvent(
    workflowId: WorkflowQueueId,
    event: WorkflowEventPayload
  ): void {
    this.cacheWorkflowEvent(workflowId, event);

    const payload = {
      type: WsMessageType.WORKFLOW_EVENT,
      workflowId,
      data: event,
    };

    const targetClients = this.clients.filter(
      (client) => client.workflowId === workflowId
    );

    if (targetClients.length === 0) {
      console.log(
        `[${this.name}] No clients subscribed to workflow ${workflowId} (cached for ${this.WORKFLOW_KEEP_ALIVE_MS}ms)`
      );
      return;
    }

    console.log(
      `[${this.name}] Broadcasting to ${targetClients.length} client(s) for workflow ${workflowId}`
    );

    this.broadcast(targetClients, payload);
  }

  /**
   * Remove all subscriptions for a specific workflow (e.g., when deleted)
   */
  public removeWorkflow(workflowId: WorkflowQueueId): void {
    const count = this.clients.filter(
      (client) => client.workflowId === workflowId
    ).length;

    this.clients = this.clients.filter(
      (client) => client.workflowId !== workflowId
    );

    console.log(
      `[${this.name}] Removed ${count} client(s) from workflow ${workflowId}`
    );

    this.clearWorkflowCache(workflowId);
  }

  /**
   * Get client count for a specific workflow
   */
  public getWorkflowClientCount(workflowId: WorkflowQueueId): number {
    return this.clients.filter((client) => client.workflowId === workflowId)
      .length;
  }

  /**
   * Get all active workflow IDs
   */
  public getActiveWorkflowIds(): WorkflowQueueId[] {
    return [...new Set(this.clients.map((client) => client.workflowId))];
  }

  handleDisconnect(ws: WebSocket): void {
    const removedCount = this.clients.filter((client) => client.ws === ws).length;
    super.handleDisconnect(ws);

    if (removedCount > 0) {
      console.log(
        `[${this.name}] Client disconnected, removed ${removedCount} subscription(s)`
      );
    }
  }

  private cacheWorkflowEvent(workflowId: WorkflowQueueId, event: WorkflowEventPayload) {
    const cachedEvents = this.workflowEventCache.get(workflowId) ?? [];
    cachedEvents.push(event);

    if (cachedEvents.length > this.MAX_CACHED_EVENTS) {
      cachedEvents.shift();
    }

    this.workflowEventCache.set(workflowId, cachedEvents);
    this.scheduleWorkflowCacheCleanup(workflowId);
  }

  private flushCachedEventsToClient(ws: WebSocket, workflowId: WorkflowQueueId): void {
    const cachedEvents = this.workflowEventCache.get(workflowId);
    if (!cachedEvents || cachedEvents.length === 0) {
      return;
    }

    console.log(
      `[${this.name}] Replaying ${cachedEvents.length} cached event(s) for workflow ${workflowId}`
    );

    cachedEvents.forEach((event) => {
      this.safeSend(ws, {
        type: WsMessageType.WORKFLOW_EVENT,
        workflowId,
        data: event,
      });
    });
  }

  private scheduleWorkflowCacheCleanup(workflowId: WorkflowQueueId): void {
    const existingTimer = this.workflowKeepAliveTimers.get(workflowId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.clearWorkflowCache(workflowId);
      console.log(
        `[${this.name}] Released cached workflow ${workflowId} after keep-alive window`
      );
    }, this.WORKFLOW_KEEP_ALIVE_MS);

    this.workflowKeepAliveTimers.set(workflowId, timer);
  }

  private clearWorkflowCache(workflowId: WorkflowQueueId): void {
    const timer = this.workflowKeepAliveTimers.get(workflowId);
    if (timer) {
      clearTimeout(timer);
      this.workflowKeepAliveTimers.delete(workflowId);
    }

    this.workflowEventCache.delete(workflowId);
  }
}
