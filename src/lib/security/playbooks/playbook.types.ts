// Playbook-DSL — typisierte Definition deklarativer Scan-DAGs.
//
// Ein Playbook ist eine Liste von Steps. Jeder Step bindet einen Worker, hat
// optional eine Condition (`when`), Abhängigkeiten zu vorherigen Steps und eine
// Target-Funktion, die auf Basis des Run-Kontexts (Wurzel-Entity, bisherige
// Findings, entdeckte Subdomains, Tech-Fingerprint, …) konkrete Worker-Targets
// liefert. Mehrere Targets pro Step → Fan-out (ein worker_run pro Target).
//
// Conditions sind reine Funktionen — bewusst nicht JSON-Logic, weil Phase 2
// Solo-Use und kein Plugin-Loader involviert ist. Phase 2.5 (Rule-Engine) baut
// die deklarative JSON-Logic darüber.

import type {
    SecurityWorker,
    WorkerJobKey,
    WorkerTarget,
} from "../workers/worker.types";
import type { Entity } from "@/db/individual/individual-schema";
import type { PersistedTechFingerprint } from "../tech/tech-fingerprint.service";

/** Snapshot eines Targets nach Persistierung (kennt seine Entity-ID). */
export interface PlaybookTarget extends WorkerTarget {
    /** Persistierte Entity-ID dieses Targets. */
    id: number;
}

/** Summary eines abgeschlossenen Steps — Input für nachfolgende Conditions / Target-Funktionen. */
export interface PlaybookStepOutput {
    stepKey: string;
    workerKey: WorkerJobKey;
    /** Pro Target genau ein Eintrag (Fan-out) — Index entspricht Target-Reihenfolge. */
    runs: Array<{
        targetEntityId: number;
        targetValue: string;
        status: "completed" | "failed" | "skipped";
        findingsCreated: number;
        techDiscovered: number;
        discoveredEntities: number;
        error?: string;
    }>;
}

/** Kontext, der einer Condition oder einer Target-Funktion übergeben wird. */
export interface PlaybookContext {
    engagementId: number;
    /** Wurzel-Entity, mit der das Playbook gestartet wurde (z.B. die Root-Domain). */
    rootEntity: Entity;
    /** Alle Outputs von Steps, die schon abgeschlossen sind. Key = step.key. */
    stepOutputs: Record<string, PlaybookStepOutput>;
    /**
     * Bisher entdeckte Entities — initial nur die Root-Entity, wächst wenn ein
     * Step neue Entities (Subdomains, IPs, …) zurückliefert.
     */
    discoveredEntities: Entity[];
    /** Tech-Fingerprint pro Entity-ID (lowercased techName-Set). */
    techByEntityId: Record<number, Set<string>>;
    /**
     * Volle Tech-Drafts pro Entity-ID — falls eine Condition Versionsinfo lesen will.
     * In Phase 2 nur ergänzt, wenn techByEntityId für die Condition nicht reicht.
     */
    techDetailsByEntityId: Record<number, PersistedTechFingerprint[]>;
}

export type PlaybookCondition = (ctx: PlaybookContext) => boolean | Promise<boolean>;

export type PlaybookTargetFn = (ctx: PlaybookContext) => PlaybookTarget[] | Promise<PlaybookTarget[]>;

export interface PlaybookStep {
    /** Eindeutiger Schlüssel im Playbook (z.B. "recon_subdomains"). */
    key: string;
    /** Anzeigename für API-Status. */
    label: string;
    /** Worker, der für diesen Step ausgeführt wird. */
    workerKey: WorkerJobKey;
    /** Step-Keys, die abgeschlossen sein müssen, bevor dieser Step läuft. */
    dependsOn?: string[];
    /**
     * Targets für diesen Step. Liefert keine → der Runner überspringt den Step
     * mit Status "skipped" und Grund "no_targets". Ein Step kann sich auf die
     * Wurzel-Entity beschränken oder per Fan-out alle entdeckten Subdomains
     * laufen lassen.
     */
    targets: PlaybookTargetFn;
    /** Optionaler tech-aware Gate. Liefert false → Step wird skipped. */
    when?: PlaybookCondition;
    /**
     * Optionaler "skipped"-Begründungstext, der im Status sichtbar wird, wenn
     * `when` false liefert. Default: "condition_false".
     */
    skipReason?: string;
    /** Optionales Tool-Profil, wird vom Worker via context.params gelesen. */
    profile?: string;
    /** Override des Worker-Default-Timeouts. */
    timeoutMs?: number;
}

export interface Playbook {
    /** Stabiler URL-Slug — wird in API-Pfaden genutzt. */
    key: string;
    /** Menschenlesbarer Titel. */
    label: string;
    /** Längere Beschreibung für Operator-UI / OpenAPI-Doku. */
    description: string;
    /** Welche Wurzel-Entity-Kinds das Playbook akzeptiert. */
    acceptsRootEntityKinds: string[];
    /** Reihenfolge ist nicht relevant — der Runner topologisch-sortiert über `dependsOn`. */
    steps: PlaybookStep[];
    /** Höchster benötigter Scope — vom Runner als Pre-Flight-Check genutzt (Best Effort). */
    maxRequiredScope: SecurityWorker["requiredScope"];
}

/** Hilfs-Result aus Worker-Sicht, an dem der Runner Statistiken zieht. */
export type StepRunStats = {
    findingsCreated: number;
    findingsDeduped: number;
    techDiscovered: number;
    discoveredEntities: number;
};
