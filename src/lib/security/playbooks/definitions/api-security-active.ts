// Playbook: `api_security_active`
//
// Trigger: serviceType=rest_api auf einer Host-Entity (via Rule 9 — siehe
// bootstrap.ts). Der Operator kann das Playbook auch manuell starten.
// Voraussetzung: Engagement hat Authorization mit Scope `active_safe`.
//
// Steps:
//   1. openapi_discovery   — holt OpenAPI-Doc, extrahiert Endpoints
//   2. api_auth_probe      — probt typische auth-pflichtige Pfade ohne Auth
//   3. api_cors_check      — testet CORS-Reflection / Wildcard / null-Origin
//   4. api_rate_limit_safe — 30 Requests in ~10s auf /api/health → 429?
//
// Alle Steps sind active_safe Tier (read-only Probes auf bekannten Pfaden,
// kein Param-Fuzzing, kein Auth-Brute, keine schreibenden Methoden).

import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [{ id: ctx.rootEntity.id, value: ctx.rootEntity.canonicalKey, kind: ctx.rootEntity.kind }];
}

export const apiSecurityActivePlaybook: Playbook = {
    key: "api_security_active",
    label: "API Security (Active-Safe)",
    description:
        "Automatischer Security-Pass für REST-API-Hosts: OpenAPI-Discovery + Endpoint-Auth-Probe " +
        "+ CORS-Reflection-Check + Rate-Limit-Probe. Alles active_safe Tier — keine Auth-Brute, " +
        "kein Param-Fuzzing. Wird via Rule getriggert wenn service_classify einen Host als " +
        "rest_api markiert.",
    acceptsRootEntityKinds: ["asset_domain", "asset_subdomain", "asset_url", "asset_host"],
    maxRequiredScope: "active_safe",
    steps: [
        {
            key: "openapi_discovery",
            label: "OpenAPI/Swagger-Doc-Discovery + Endpoint-Extraktion",
            workerKey: "openapi_discovery",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
        {
            key: "api_auth_probe",
            label: "Endpoint-Auth-Probe (typische API-Pfade ohne Credentials)",
            workerKey: "api_auth_probe",
            dependsOn: ["openapi_discovery"],
            targets: rootOnly,
            timeoutMs: 60_000,
        },
        {
            key: "api_cors_check",
            label: "CORS-Reflection / Wildcard / null-Origin",
            workerKey: "api_cors_check",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
        {
            key: "api_rate_limit_safe",
            label: "Rate-Limit-Probe (30 req/~10s auf /api/health o.ä.)",
            workerKey: "api_rate_limit_safe",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
    ],
};
