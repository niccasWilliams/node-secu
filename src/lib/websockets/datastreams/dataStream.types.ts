import { AppPermissionValue } from "@/routes/auth/roles/permissions/permission.service";

export type DataStreamKey = string;

export interface DataStreamContext {
    userId?: number;
}

export interface DataStreamPayload {
    data: any;
    event?: string;
    meta?: Record<string, unknown>;
}

export type DataStreamSnapshotResolver = (context: DataStreamContext) => Promise<any> | any;

export interface DataStreamRegistration {
    key: DataStreamKey;
    description?: string;
    permission?: AppPermissionValue;
    fetchInitialSnapshot?: DataStreamSnapshotResolver;
}

export type DataStreamTransport = (key: DataStreamKey, payload: DataStreamPayload) => void;
