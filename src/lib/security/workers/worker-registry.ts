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
// Phase 2.7 — OSINT-Identity-Layer
import { emailDnsSignalsWorker } from "./passive/email-dns-signals.worker";
import { emailGravatarWorker } from "./passive/email-gravatar.worker";
import { emailGithubCommitsWorker } from "./passive/email-github-commits.worker";
import { githubSecretScanWorker } from "./passive/github-secret-scan.worker";
import { emailHolehePassiveWorker } from "./passive/email-holehe-passive.worker";
import { emailBreachCheckWorker } from "./passive/email-breach-check.worker";
import { emailPatternInferenceWorker } from "./passive/email-pattern-inference.worker";
import { emailAliasCorrelateWorker } from "./passive/email-alias-correlate.worker";
import { domainCtEmailMiningWorker } from "./passive/domain-ct-email-mining.worker";
import { domainGithubPersonnelWorker } from "./passive/domain-github-personnel.worker";
import { usernameMultiplatformWorker } from "./passive/username-multiplatform.worker";
import { phoneNormalizeWorker } from "./passive/phone-normalize.worker";
import { socialAccountValidateWorker } from "./passive/social-account-validate.worker";
// Phase 4 — Service-Layer (passive_only — Service-Type-Klassifikation)
import { serviceClassifyWorker } from "./passive/service-classify.worker";
// Sprint 2 — Domain → Owner Worker (passive_only).
import { domainWhoisPassiveWorker } from "./passive/domain-whois-passive.worker";
import { domainImpressumExtractWorker } from "./passive/domain-impressum-extract.worker";
import { domainMicrosoftTenantWorker } from "./passive/domain-microsoft-tenant.worker";
import { domainHtmlPivotsExtractWorker } from "./passive/domain-html-pivots-extract.worker";
// Sprint 3 — GitHub-Brand-Discovery (passive_only).
import { domainGithubBrandWorker } from "./passive/domain-github-brand.worker";
import { githubReposPublicWorker } from "./passive/github-repos-public.worker";
import { githubEventsPublicWorker } from "./passive/github-events-public.worker";
// Phase 5 — Deep Tech-Detection (passive_only — Wappalyzer-equivalent)
import { techFingerprintWorker } from "./passive/tech-fingerprint.worker";
// Phase 3 — Active workers (require active_safe authorization)
import { tlsDeepWorker } from "./active/tls-deep.worker";
import { nucleiSafeWorker } from "./active/nuclei-safe.worker";
import { nmapTop1000Worker } from "./active/nmap-top1000.worker";
import { httpPathsProbeWorker } from "./active/http-paths-probe.worker";
// Phase 4 — API-Security-Worker (active_safe — Folge-Playbook bei serviceType=rest_api)
import { openapiDiscoveryWorker } from "./active/openapi-discovery.worker";
import { apiAuthProbeWorker } from "./active/api-auth-probe.worker";
import { apiCorsCheckWorker } from "./active/api-cors-check.worker";
import { apiRateLimitSafeWorker } from "./active/api-rate-limit-safe.worker";

const REGISTRY = new Map<WorkerJobKey, SecurityWorker>();

const BUILTIN_WORKERS: SecurityWorker[] = [
    dnsRecordsWorker,
    tlsCertWorker,
    httpHeadersWorker,
    subdomainPassiveWorker,
    wpPassiveCheckWorker,
    // Phase 2.7 — initial four
    emailDnsSignalsWorker,
    emailGravatarWorker,
    emailGithubCommitsWorker,
    githubSecretScanWorker,
    // Phase 2.7 — completion (Block A)
    emailHolehePassiveWorker,
    emailBreachCheckWorker,
    emailPatternInferenceWorker,
    emailAliasCorrelateWorker,
    domainCtEmailMiningWorker,
    domainGithubPersonnelWorker,
    usernameMultiplatformWorker,
    phoneNormalizeWorker,
    socialAccountValidateWorker,
    // Phase 4 — Service-Layer
    serviceClassifyWorker,
    // Sprint 2 — Domain → Owner
    domainWhoisPassiveWorker,
    domainImpressumExtractWorker,
    domainMicrosoftTenantWorker,
    domainHtmlPivotsExtractWorker,
    // Sprint 3 — GitHub-Brand-Discovery
    domainGithubBrandWorker,
    githubReposPublicWorker,
    githubEventsPublicWorker,
    // Phase 5 — Deep Tech-Detection
    techFingerprintWorker,
    // Phase 3 — Active workers
    tlsDeepWorker,
    nucleiSafeWorker,
    nmapTop1000Worker,
    httpPathsProbeWorker,
    // Phase 4 — API-Security-Worker
    openapiDiscoveryWorker,
    apiAuthProbeWorker,
    apiCorsCheckWorker,
    apiRateLimitSafeWorker,
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
