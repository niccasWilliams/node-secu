import { dataStreamManager } from "./dataStream.manager";
import { DataStreamPayload, DataStreamRegistration } from "./dataStream.types";

export abstract class DataStreamAdapter<T = any> {
    protected constructor(private readonly registration: DataStreamRegistration) {
        dataStreamManager.registerStream(registration);
    }

    abstract initialize(): void | Promise<void>;

    protected async publish(data: T, meta?: Record<string, unknown>, event?: string): Promise<void> {
        const payload: DataStreamPayload = {
            data,
            meta,
            event,
        };
        dataStreamManager.broadcast(this.registration.key, payload);
    }

    protected get streamKey(): string {
        return this.registration.key;
    }
}
