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
    /**
     * Optionaler dynamischer Auth-Check zusätzlich zu `permission`. Wird beim
     * Subscribe aufgerufen — wenn er false zurückgibt, wird der Subscribe abgelehnt.
     * Sinnvoll bei Pattern-Streams, wo der Key (z.B. `secu:engagement:42`)
     * dynamisch ist und die Authorization vom Key-Suffix abhängt.
     */
    authorize?: (context: DataStreamContext) => Promise<boolean> | boolean;
}

/**
 * Pattern-Registrierung für dynamische Stream-Keys (z.B. `secu:engagement:42`,
 * `secu:run:7`). Beim Subscribe matched der DataStreamManager den eingehenden
 * Key gegen alle Patterns; das erste Match liefert die Registration.
 *
 * `factory` darf den Key parsen und stream-spezifische Snapshot-/Authorize-Hooks
 * bauen — der Manager memoized das Ergebnis NICHT, der Caller muss selbst cachen
 * wenn nötig.
 */
export interface DataStreamPatternRegistration {
    /** Anzeigename für Debugging/Listing. */
    name: string;
    /** Test ob ein eingehender Key zu diesem Pattern gehört. */
    matcher: (key: DataStreamKey) => boolean;
    /** Liefert die Registration für einen konkreten matched Key. */
    factory: (key: DataStreamKey) => DataStreamRegistration;
}

export type DataStreamTransport = (key: DataStreamKey, payload: DataStreamPayload) => void;
