// Worker-Registry — zentrale Registrierung aller Scan-Worker.
// Jeder Worker registriert sich mit einem WorkerJobKey. Der Orchestrator
// fragt die Registry: "welche Worker laufen für scanType X auf asset Y?".

import type { SecurityWorker, WorkerJobKey } from "./worker.types";
import type { Asset } from "@/db/individual/individual-schema";

import { dnsRecordsWorker } from "./passive/dns-records.worker";
import { tlsCertWorker } from "./passive/tls-cert.worker";
import { httpHeadersWorker } from "./passive/http-headers.worker";
// PHASE 2: import { nucleiWorker } from "./active/nuclei.worker";
// PHASE 2: import { nmapWorker } from "./active/nmap.worker";
// PHASE 3: import { sqlmapWorker } from "./active/sqlmap.worker";
// PHASE 3: import { hydraWorker } from "./active/hydra.worker";

const WORKERS: SecurityWorker[] = [
    dnsRecordsWorker,
    tlsCertWorker,
    httpHeadersWorker,
];

const REGISTRY = new Map<WorkerJobKey, SecurityWorker>();
for (const w of WORKERS) {
    REGISTRY.set(w.jobKey, w);
}

export function getWorker(jobKey: WorkerJobKey): SecurityWorker | undefined {
    return REGISTRY.get(jobKey);
}

export function listWorkers(): SecurityWorker[] {
    return [...REGISTRY.values()];
}

/** Liefert die Worker, die für den gegebenen Scan-Type ausgeführt werden sollen. */
export function workersForScanType(
    scanType: "passive_quick" | "passive_full" | "active_safe" | "active_intrusive" | "cve_match" | "monitor_diff",
    asset: Asset,
): SecurityWorker[] {
    const eligible = listWorkers().filter((w) => w.isApplicable(asset));
    switch (scanType) {
        case "passive_quick":
            return eligible.filter((w) => ["dns_records", "tls_cert", "http_headers"].includes(w.jobKey));
        case "passive_full":
            return eligible.filter((w) => w.requiredScope === "passive_only");
        case "active_safe":
            return eligible.filter((w) => w.requiredScope === "passive_only" || w.requiredScope === "active_safe");
        case "active_intrusive":
            return eligible;  // alles
        case "monitor_diff":
            return eligible.filter((w) => w.requiredScope === "passive_only");
        case "cve_match":
            // CVE-Matching ist kein Worker, sondern post-scan computed.
            return [];
        default:
            return [];
    }
}
