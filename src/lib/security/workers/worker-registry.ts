// Worker-Registry — zentrale Registrierung aller Scan-Worker.
//
// Phase 0: drei lokale passive Worker (DNS/TLS/HTTP-Header).
// Phase 2: + subdomain_passive (CT-Logs) + wp_passive_check; Registry hat nun
// eine `registerWorker()`-Funktion, damit Bootstrap-Code (oder spätere Plugins)
// dynamisch registrieren kann, ohne diese Datei anfassen zu müssen.

import type { SecurityWorker, WorkerJobKey, WorkerTarget } from "./worker.types";

import { dnsRecordsWorker } from "./passive/dns-records.worker";
import { tlsCertWorker } from "./passive/tls-cert.worker";
import { httpHeadersWorker } from "./passive/http-headers.worker";
import { subdomainPassiveWorker } from "./passive/subdomain-passive.worker";
import { wpPassiveCheckWorker } from "./passive/wp-passive-check.worker";

const REGISTRY = new Map<WorkerJobKey, SecurityWorker>();

const BUILTIN_WORKERS: SecurityWorker[] = [
    dnsRecordsWorker,
    tlsCertWorker,
    httpHeadersWorker,
    subdomainPassiveWorker,
    wpPassiveCheckWorker,
];

for (const w of BUILTIN_WORKERS) {
    REGISTRY.set(w.jobKey, w);
}

/**
 * Registriert (oder überschreibt) einen Worker. Wird aktuell intern für die
 * Built-in-Worker genutzt; offen exportiert, damit zukünftige Plugin-Bootstraps
 * die Registry erweitern können, ohne Source-Patches.
 */
export function registerWorker(worker: SecurityWorker): void {
    REGISTRY.set(worker.jobKey, worker);
}

export function getWorker(jobKey: WorkerJobKey): SecurityWorker | undefined {
    return REGISTRY.get(jobKey);
}

export function listWorkers(): SecurityWorker[] {
    return [...REGISTRY.values()];
}

/** Liefert alle in der Registry hinterlegten Worker, die für das Target anwendbar sind. */
export function applicableWorkers(target: WorkerTarget): SecurityWorker[] {
    return listWorkers().filter((w) => w.isApplicable(target));
}
