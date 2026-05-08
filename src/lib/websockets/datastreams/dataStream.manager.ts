import { DataStreamContext, DataStreamKey, DataStreamPatternRegistration, DataStreamPayload, DataStreamRegistration, DataStreamSnapshotResolver, DataStreamTransport } from "./dataStream.types";

class DataStreamManager {
    private streams = new Map<DataStreamKey, DataStreamRegistration>();
    private patterns: DataStreamPatternRegistration[] = [];
    private transport?: DataStreamTransport;

    registerStream(registration: DataStreamRegistration): void {
        if (this.streams.has(registration.key)) {
            console.warn(`[DataStreamManager] Stream ${registration.key} already registered. Overwriting metadata.`);
        }
        this.streams.set(registration.key, registration);
    }

    /**
     * Pattern-Registrierung für dynamische Stream-Keys. Wird genutzt für
     * topic-artige Streams wie `secu:engagement:42` — der Manager matched
     * den Key beim Subscribe gegen alle Patterns und delegiert an die Factory.
     */
    registerStreamPattern(pattern: DataStreamPatternRegistration): void {
        this.patterns.push(pattern);
    }

    listStreams(): DataStreamRegistration[] {
        return Array.from(this.streams.values());
    }

    getStream(key: DataStreamKey): DataStreamRegistration | undefined {
        const exact = this.streams.get(key);
        if (exact) return exact;
        for (const pattern of this.patterns) {
            if (pattern.matcher(key)) {
                return pattern.factory(key);
            }
        }
        return undefined;
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
