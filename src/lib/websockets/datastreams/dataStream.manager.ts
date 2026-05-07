import { DataStreamContext, DataStreamKey, DataStreamPayload, DataStreamRegistration, DataStreamSnapshotResolver, DataStreamTransport } from "./dataStream.types";

class DataStreamManager {
    private streams = new Map<DataStreamKey, DataStreamRegistration>();
    private transport?: DataStreamTransport;

    registerStream(registration: DataStreamRegistration): void {
        if (this.streams.has(registration.key)) {
            console.warn(`[DataStreamManager] Stream ${registration.key} already registered. Overwriting metadata.`);
        }
        this.streams.set(registration.key, registration);
    }

    listStreams(): DataStreamRegistration[] {
        return Array.from(this.streams.values());
    }

    getStream(key: DataStreamKey): DataStreamRegistration | undefined {
        return this.streams.get(key);
    }

    async getInitialSnapshot(key: DataStreamKey, context: DataStreamContext): Promise<any> {
        const registration = this.streams.get(key);
        if (!registration?.fetchInitialSnapshot) return undefined;
        try {
            const data = await registration.fetchInitialSnapshot(context);
            return data
        } catch (error) {
            console.error(`[DataStreamManager] Failed to get initial snapshot for ${key}:`, error);
            throw error;
        }
    }

    setTransport(transport: DataStreamTransport): void {
        this.transport = transport;
    }

    broadcast(key: DataStreamKey, payload: DataStreamPayload): void {
        if (!this.transport) {
            console.warn(`[DataStreamManager] No data stream transport configured. Dropping event for ${key}.`);
            return;
        }

        this.transport(key, payload);
    }
}

export const dataStreamManager = new DataStreamManager();
