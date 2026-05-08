import WebSocket from "ws";
import { BaseWebSocketModule } from "./base.module";
import { dataStreamManager } from "@/lib/websockets/datastreams/dataStream.manager";
import { DataStreamKey, DataStreamPayload } from "@/lib/websockets/datastreams/dataStream.types";
import { permissionUseCase } from "@/routes/auth/roles/permissions/permission.useCase";
import { WsMessageType } from "../websocket.types";

interface DataStreamClient {
    ws: WebSocket;
    streams: Set<DataStreamKey>;
    userId?: number;
}

interface SubscribeMessage {
    type: WsMessageType.DATASTREAM_SUBSCRIBE;
    stream: DataStreamKey;
}

interface UnsubscribeMessage {
    type: WsMessageType.DATASTREAM_UNSUBSCRIBE;
    stream: DataStreamKey;
}

type DataStreamMessage = SubscribeMessage | UnsubscribeMessage;

export class DataStreamWebSocketModule extends BaseWebSocketModule<DataStreamClient> {
    private subscriptions = new Map<DataStreamKey, Set<DataStreamClient>>();

    constructor() {
        super("data-stream");
    }

    handleMessage(ws: WebSocket, message: DataStreamMessage, authenticatedUserId?: number): boolean {
        if (message?.type === WsMessageType.DATASTREAM_SUBSCRIBE) {
            void this.handleSubscribe(ws, message.stream, authenticatedUserId);
            return true;
        }

        if (message?.type === WsMessageType.DATASTREAM_UNSUBSCRIBE) {
            this.handleUnsubscribe(ws, message.stream);
            return true;
        }

        return false;
    }

    handleDisconnect(ws: WebSocket): void {
        const client = this.clients.find((c) => c.ws === ws);
        if (!client) return;

        client.streams.forEach((key) => {
            const subscribers = this.subscriptions.get(key);
            subscribers?.delete(client);
            if (subscribers && subscribers.size === 0) {
                this.subscriptions.delete(key);
            }
        });

        super.handleDisconnect(ws);
    }

    public broadcastToStream(stream: DataStreamKey, payload: DataStreamPayload): void {
        const subscribers = this.subscriptions.get(stream);
        if (!subscribers || subscribers.size === 0) {
            return;
        }

        const message = {
            type: WsMessageType.DATASTREAM_EVENT,
            stream,
            payload,
        };

        this.broadcast(Array.from(subscribers), message);
    }

    public getStreamClientCount(stream: DataStreamKey): number {
        return this.subscriptions.get(stream)?.size ?? 0;
    }

    private async handleSubscribe(ws: WebSocket, stream: DataStreamKey, authenticatedUserId?: number) {
        const streamMeta = dataStreamManager.getStream(stream);
        if (!streamMeta) {
            this.safeSend(ws, {
                type: WsMessageType.DATASTREAM_EVENT,
                stream,
                error: "STREAM_NOT_FOUND",
            });
            return;
        }

        if (streamMeta.permission) {
            if (!authenticatedUserId) {
                this.safeSend(ws, {
                    type: WsMessageType.DATASTREAM_EVENT,
                    stream,
                    error: "UNAUTHORIZED",
                });
                return;
            }

            try {
                await permissionUseCase.assertUserPermission(authenticatedUserId, streamMeta.permission);
            } catch (error) {
                console.error(`[DataStreamWebSocketModule] Permission denied for stream ${stream}`, error);
                this.safeSend(ws, {
                    type: WsMessageType.DATASTREAM_EVENT,
                    stream,
                    error: "FORBIDDEN",
                });
                return;
            }
        }

        // Dynamischer Auth-Check (z.B. für Pattern-Streams wie secu:engagement:42).
        if (streamMeta.authorize) {
            try {
                const allowed = await streamMeta.authorize({ userId: authenticatedUserId });
                if (!allowed) {
                    this.safeSend(ws, {
                        type: WsMessageType.DATASTREAM_EVENT,
                        stream,
                        error: "FORBIDDEN",
                    });
                    return;
                }
            } catch (error) {
                console.error(`[DataStreamWebSocketModule] Authorize hook threw for stream ${stream}`, error);
                this.safeSend(ws, {
                    type: WsMessageType.DATASTREAM_EVENT,
                    stream,
                    error: "FORBIDDEN",
                });
                return;
            }
        }

        let client = this.clients.find((c) => c.ws === ws);
        if (!client) {
            client = { ws, streams: new Set(), userId: authenticatedUserId };
            this.clients.push(client);
        }

        if (client.streams.has(stream)) {
            return;
        }

        client.streams.add(stream);

        if (!this.subscriptions.has(stream)) {
            this.subscriptions.set(stream, new Set());
        }
        this.subscriptions.get(stream)!.add(client);

        this.safeSend(ws, {
            type: WsMessageType.DATASTREAM_EVENT,
            stream,
            payload: {
                event: "subscribed",
                data: { stream },
            },
        });

        if (streamMeta.fetchInitialSnapshot) {
            Promise.resolve(
                dataStreamManager.getInitialSnapshot(stream, {
                    userId: authenticatedUserId,
                })
            )
                .then((snapshot) => {
                    if (snapshot === undefined) return;
                    this.safeSend(ws, {
                        type: WsMessageType.DATASTREAM_EVENT,
                        stream,
                        payload: {
                            event: "snapshot",
                            data: snapshot,
                        },
                    });
                })
                .catch((error) => {
                    console.error(`[DataStreamWebSocketModule] Failed to load initial snapshot for ${stream}`, error);
                });
        }
    }

    private handleUnsubscribe(ws: WebSocket, stream: DataStreamKey) {
        const client = this.clients.find((c) => c.ws === ws);
        if (!client || !client.streams.has(stream)) {
            return;
        }

        client.streams.delete(stream);
        const subscribers = this.subscriptions.get(stream);
        subscribers?.delete(client);

        if (subscribers && subscribers.size === 0) {
            this.subscriptions.delete(stream);
        }

        this.safeSend(ws, {
            type: WsMessageType.DATASTREAM_EVENT,
            stream,
            payload: {
                event: "unsubscribed",
                data: { stream },
            },
        });
    }
}
