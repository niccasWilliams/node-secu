// Sprint 2 #10 (OSINT-Engine, features.md §3.1 Mechanik #8) — Microsoft
// Entra-ID / M365 Tenant-Detection.
//
// LOOKUP: GET https://login.microsoftonline.com/<domain>/.well-known/openid-configuration
//
// Response 200 = Domain ist als Federation-Tenant in Entra-ID registriert.
// Antwort enthält `issuer` URL mit Tenant-ID, `authorization_endpoint`, etc.
//
// Bedeutung als Owner-Signal:
//   - Domain mit M365-Tenant = ist mit hoher Wahrscheinlichkeit eine geschäftlich
//     genutzte Domain (Privatleute haben selten ein eigenes Entra-Tenant).
//   - Tenant-ID ist GLOBAL eindeutig pro Org → Cross-Domain-Pivot über alle
//     Domains derselben Org möglich (mehrere Domains können demselben Tenant
//     zugeordnet sein). Persistiert in `entity.data.microsoftTenant`.
//
// Bewusst KEIN OwnerHasMicrosoft-Finding: das ist Stack-Info, kein Sicherheits-
// Befund. Reports zeigen es im "Tech-Stack"-Block.

import { httpFetch } from "../../osint/http-fetch";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
} from "../worker.types";

interface OpenIdConfig {
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    /** Federation-Brand-Name (manchmal in Custom-Tenants). */
    cloud_instance_name?: string;
    /** Geo-Region — public/germany/usgov/china. */
    cloud_graph_host_name?: string;
    [k: string]: unknown;
}

const TENANT_ID_RE = /https?:\/\/sts\.windows\.net\/([a-f0-9-]{36})\/?/i;
const TENANT_ID_RE_2 = /\/([a-f0-9-]{36})\/v2\.0\/?$/i;

export const domainMicrosoftTenantWorker: SecurityWorker = {
    jobKey: "domain_microsoft_tenant",
    requiredScope: "passive_only",
    description: "Microsoft Entra-ID / M365 Tenant-Detection via openid-configuration. Extrahiert Tenant-ID + Tenant-Namespace (Cross-Domain-Identifier).",
    defaultTimeoutMs: 15_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "domain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const target = ctx.target.value.toLowerCase().replace(/\.+$/, "");
        const url = `https://login.microsoftonline.com/${encodeURIComponent(target)}/.well-known/openid-configuration`;

        const res = await httpFetch<OpenIdConfig>(url, {
            timeoutMs: 10_000,
            signal: ctx.abortSignal,
            providerKey: "microsoft_openid",
            headers: { "Accept": "application/json" },
        });

        // 400 mit AADSTS90002-Body = "Tenant nicht gefunden" — Domain hat keinen
        // Microsoft-Tenant. Das ist KEIN Worker-Fehler, sondern legitimes Negativ-
        // Signal.
        if (!res.success) {
            const isNotFound = res.status === 400 || res.status === 404;
            return {
                success: true,
                findings: [],
                rawOutput: {
                    target,
                    isMicrosoftTenant: false,
                    httpStatus: res.status,
                    httpError: isNotFound ? "tenant_not_found" : (res.error ?? `http_${res.status}`),
                },
                durationMs: Date.now() - start,
            };
        }

        const config = res.data;
        if (!config || typeof config !== "object" || !config.issuer) {
            return {
                success: true,
                findings: [],
                rawOutput: { target, isMicrosoftTenant: false, malformed: true, raw: config },
                durationMs: Date.now() - start,
            };
        }

        const tenantId = extractTenantId(config);
        const namespace = extractTenantNamespace(target, config);

        return {
            success: true,
            findings: [],
            // Tenant-ID + Issuer landen am Source-Entity (Domain) als Stack-Info.
            // Sprint 5 Cross-Domain-Pivot kann über `microsoftTenant.id` joinen.
            entityDataPatch: {
                microsoftTenant: {
                    id: tenantId,
                    namespace,
                    issuer: config.issuer,
                    authorizationEndpoint: config.authorization_endpoint,
                    cloudInstanceName: config.cloud_instance_name,
                    cloudGraphHostName: config.cloud_graph_host_name,
                    detectedAt: new Date().toISOString(),
                },
            },
            rawOutput: {
                target,
                isMicrosoftTenant: true,
                tenantId,
                namespace,
                issuer: config.issuer,
            },
            durationMs: Date.now() - start,
        };
    },
};

function extractTenantId(config: OpenIdConfig): string | null {
    if (config.issuer) {
        const m1 = TENANT_ID_RE.exec(config.issuer);
        if (m1) return m1[1].toLowerCase();
        const m2 = TENANT_ID_RE_2.exec(config.issuer);
        if (m2) return m2[1].toLowerCase();
    }
    if (config.authorization_endpoint) {
        const m = TENANT_ID_RE.exec(config.authorization_endpoint);
        if (m) return m[1].toLowerCase();
    }
    return null;
}

function extractTenantNamespace(target: string, config: OpenIdConfig): string | null {
    // Federation-Tenants haben oft `<orgname>.onmicrosoft.com` als sekundären
    // Namespace, der im issuer-URL nicht direkt steht. Wir können ihn nicht
    // ohne weiteres Lookup ableiten; das ist Sprint-2.8-Material (paid).
    // Best-effort: wenn `target` selbst auf .onmicrosoft.com endet, nutze ihn.
    if (target.endsWith(".onmicrosoft.com")) return target;
    void config;
    return null;
}
