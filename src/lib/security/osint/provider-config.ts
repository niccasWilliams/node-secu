// Phase 2.7 — OSINT Provider-Konfiguration.
//
// Default-Limits pro Provider-Key. Hier zentral, damit Worker nicht jeder eigene
// Limits hardcoden. Pro Provider:
//   - concurrency:    max gleichzeitig laufende Requests
//   - ratePerMin:     Token-Bucket — Requests/Minute (Refill linear, Burst = ratePerMin)
//   - backoffBaseSec: Default-Backoff bei 429
//   - description:    Doku für Audit-Log
//   - requiresProxy:  Wenn true und kein OSINT_HTTP_PROXY env gesetzt → Worker
//                     skipped sauber statt mit Home-IP zu raussenden. Schutznetz
//                     für riskante Endpoints (Holehe, scraperhafte Plattformen).
//
// Erhöhungen sind ok, aber bewusst: jede Provider-API hat ihr eigenes Verhalten.
// 429-Handling persistiert pro Provider in `secu_osint_provider_state.paused_until`.
//
// Prefix-Matching: Wenn der exakte providerKey nicht in PROVIDER_LIMITS steht,
// wird über PROVIDER_PREFIX_LIMITS gematched (z.B. "holehe-spotify" → holehe-*).

export interface ProviderLimits {
    /** Max gleichzeitige Requests (Semaphore). */
    concurrency: number;
    /** Refill-Rate Tokens/Minute (Token-Bucket, Burst = ratePerMin). */
    ratePerMin: number;
    /** Default-Backoff in Sekunden bei 429 — wird mit min(2^retries, 60min) skaliert. */
    backoffBaseSec: number;
    /** Operator-lesbare Beschreibung — kommt ins Audit-Log. */
    description: string;
    /**
     * Wenn true, läuft der Worker NUR wenn OSINT_HTTP_PROXY gesetzt ist.
     * Schutznetz für Provider, bei denen wir bewusst die eigene IP nicht zeigen wollen
     * (Holehe-Plattformen, Username-Lookup-Plattformen — beides "scrape-ähnlich").
     */
    requiresProxy?: boolean;
}

const FALLBACK_LIMITS: ProviderLimits = {
    concurrency: 2,
    ratePerMin: 30,
    backoffBaseSec: 60,
    description: "default unspecified provider",
};

export const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
    gravatar: {
        concurrency: 8,
        ratePerMin: 600,
        backoffBaseSec: 30,
        description: "gravatar.com — public profile/avatar lookup via MD5(email)",
    },
    "github-public": {
        concurrency: 2,
        ratePerMin: 30,
        backoffBaseSec: 90,
        description: "api.github.com unauthenticated — 30/min hard cap",
    },
    "github-token": {
        concurrency: 5,
        ratePerMin: 80,
        backoffBaseSec: 60,
        description: "api.github.com with GH_TOKEN — 5000/h",
    },
    "github-search-code": {
        concurrency: 1,
        ratePerMin: 30,
        backoffBaseSec: 120,
        description: "api.github.com/search/code — 30/min selbst mit Token (eigene Quota)",
    },
    "github-search-users": {
        concurrency: 1,
        ratePerMin: 30,
        backoffBaseSec: 120,
        description: "api.github.com/search/users — 30/min Sub-Quota mit Token",
    },
    "github-search-commits": {
        concurrency: 1,
        ratePerMin: 30,
        backoffBaseSec: 120,
        description: "api.github.com/search/commits — 30/min Sub-Quota, cloak-preview Header",
    },
    "crt.sh": {
        concurrency: 1,
        ratePerMin: 10,
        backoffBaseSec: 180,
        description: "crt.sh — sehr empfindlicher CT-Log-Server, langsam halten",
    },
    "crt.sh-rfc822": {
        concurrency: 1,
        ratePerMin: 10,
        backoffBaseSec: 180,
        description: "crt.sh mit RFC822-SAN-Filter (Email-SANs aus Certs)",
    },
    dns: {
        concurrency: 50,
        ratePerMin: 6000,
        backoffBaseSec: 5,
        description: "lokaler DNS-Resolver",
    },
    hibp: {
        concurrency: 1,
        ratePerMin: 90,
        backoffBaseSec: 120,
        description: "haveibeenpwned.com Breach-API — paid, 1.5 req/s",
    },
};

/**
 * Prefix-Matching für Provider-Keys, die pro Plattform variieren — sonst müssten wir
 * 600+ Keys einzeln pflegen. Reihenfolge: längster Prefix zuerst.
 */
const PROVIDER_PREFIX_LIMITS: Array<{ prefix: string; limits: ProviderLimits }> = [
    {
        // Holehe-Plattform-Lookups: konservativ, mit Proxy, weil scraperhaft.
        prefix: "holehe-",
        limits: {
            concurrency: 1,
            ratePerMin: 5,
            backoffBaseSec: 300,
            description: "holehe-passive Plattform-Endpoint — pro Plattform 5/min",
            requiresProxy: true,
        },
    },
    {
        // WhatsMyName-Plattform-Lookups (verified-Tier).
        prefix: "whatsmyname-",
        limits: {
            concurrency: 1,
            ratePerMin: 10,
            backoffBaseSec: 180,
            description: "username-multiplatform via WhatsMyName — pro Plattform 10/min",
            requiresProxy: true,
        },
    },
    {
        // Username-Plattform-Lookups (candidate-Tier, opt-in pro Engagement).
        prefix: "uplat-candidate-",
        limits: {
            concurrency: 1,
            ratePerMin: 6,
            backoffBaseSec: 240,
            description: "username-multiplatform candidate-Tier — niedriger getaktet",
            requiresProxy: true,
        },
    },
    {
        // social_account_validate Plattform-spezifisch.
        prefix: "social-validate-",
        limits: {
            concurrency: 1,
            ratePerMin: 12,
            backoffBaseSec: 120,
            description: "social_account_validate per-platform HTTP-Reachability",
            requiresProxy: true,
        },
    },
];

export function getProviderLimits(providerKey: string): ProviderLimits {
    const exact = PROVIDER_LIMITS[providerKey];
    if (exact) return exact;
    for (const { prefix, limits } of PROVIDER_PREFIX_LIMITS) {
        if (providerKey.startsWith(prefix)) return limits;
    }
    return FALLBACK_LIMITS;
}

/** True wenn der Provider laut Konfig einen Proxy braucht. */
export function providerRequiresProxy(providerKey: string): boolean {
    return getProviderLimits(providerKey).requiresProxy === true;
}
