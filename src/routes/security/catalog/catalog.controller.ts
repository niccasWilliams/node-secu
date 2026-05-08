// Catalog-Controller — exposed System-Enums + Playbook/Worker-Display-Metadaten
// für ein Schema-driven Frontend. Alles, was im FE als Dropdown, Filter,
// Badge oder Picker rendert, kann direkt aus diesen Endpoints aufgebaut werden.
//
// Quelle der Wahrheit:
//   - Enum-Werte: zod-Enum-Schemas in security-response.dto.ts
//   - Display-Metas (Label, Color): vom ui()-Helper attached in den DTOs
//   - Playbooks: Playbook-Registry (runtime-gefüllt via bootstrap)
//   - Workers: Worker-Registry (runtime-gefüllt via bootstrap)

import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { listPlaybooks } from "@/lib/security/playbooks/playbook-registry";
import { listWorkers } from "@/lib/security/workers/worker-registry";
import type { UiMeta, UiOption } from "@/api-contract/ui-meta";
import {
    authorizationKindSchema,
    authorizationProofTypeSchema,
    authorizationScopeSchema,
    engagementEntityRoleSchema,
    engagementKindSchema,
    engagementStatusSchema,
    entityKindSchema,
    findingCategorySchema,
    findingStatusSchema,
    findingTriageReasonSchema,
    hintSlotSchema,
    playbookRunStatusSchema,
    ruleActionSchema,
    ruleTriggerSchema,
    severitySchema,
    workerProviderSchema,
    workerRunStatusSchema,
} from "../security-response.dto";

type ZodEnumLike = { _def?: { values?: readonly string[]; uiMeta?: UiMeta } };

function getMeta(schema: ZodEnumLike): UiMeta {
    return schema?._def?.uiMeta ?? {};
}

function getValues(schema: ZodEnumLike): string[] {
    return [...(schema?._def?.values ?? [])];
}

/**
 * Wandelt ein Zod-Enum + (optionale) ui()-Meta in einen Catalog-Eintrag.
 * Wenn keine UI-Options annotiert sind, fallback auf reine Werte ohne Display-Meta.
 */
function buildCatalogEnum(key: string, schema: ZodEnumLike): {
    key: string;
    label: string;
    values: string[];
    options: UiOption[];
} {
    const meta = getMeta(schema);
    const values = getValues(schema);
    const explicit = meta.options ?? [];

    // Keine x-ui Options → wir geben jeden Wert als Pseudo-Option mit dem Wert-String als Label zurück.
    const options: UiOption[] = explicit.length > 0
        ? explicit
        : values.map((v) => ({ value: v, label: v }));

    return {
        key,
        label: meta.label ?? key,
        values,
        options,
    };
}

const CATALOG_ENUM_DEFS: Record<string, ZodEnumLike> = {
    severity: severitySchema as ZodEnumLike,
    authorizationScope: authorizationScopeSchema as ZodEnumLike,
    authorizationKind: authorizationKindSchema as ZodEnumLike,
    authorizationProofType: authorizationProofTypeSchema as ZodEnumLike,
    engagementKind: engagementKindSchema as ZodEnumLike,
    engagementStatus: engagementStatusSchema as ZodEnumLike,
    entityKind: entityKindSchema as ZodEnumLike,
    engagementEntityRole: engagementEntityRoleSchema as ZodEnumLike,
    findingStatus: findingStatusSchema as ZodEnumLike,
    findingCategory: findingCategorySchema as ZodEnumLike,
    findingTriageReason: findingTriageReasonSchema as ZodEnumLike,
    playbookRunStatus: playbookRunStatusSchema as ZodEnumLike,
    workerRunStatus: workerRunStatusSchema as ZodEnumLike,
    workerProvider: workerProviderSchema as ZodEnumLike,
    ruleTrigger: ruleTriggerSchema as ZodEnumLike,
    ruleAction: ruleActionSchema as ZodEnumLike,
    hintSlot: hintSlotSchema as ZodEnumLike,
};

/** Best-effort Kategorie aus dem Playbook-Key (für FE-Gruppierung in der Picker-UI). */
function categoryForPlaybook(key: string): string {
    if (key.startsWith("osint_")) return "OSINT";
    if (key.startsWith("api_")) return "API-Security";
    if (key.startsWith("web_recon_")) return "Web-Recon";
    return "Sonstiges";
}

/** Best-effort Kategorie aus dem Worker-Key. */
function categoryForWorker(key: string): string {
    if (key.startsWith("dns_") || key === "subdomain_passive") return "DNS";
    if (key.startsWith("tls_") || key === "sslyze_deep") return "TLS";
    if (key.startsWith("http_")) return "HTTP";
    if (key.startsWith("api_")) return "API";
    if (key.startsWith("email_") || key === "email_holehe_passive") return "OSINT-Email";
    if (key.startsWith("github_")) return "OSINT-GitHub";
    if (key.startsWith("nuclei_") || key === "nmap_top1000" || key === "wpscan_aggressive") return "Active";
    return "Sonstiges";
}

class CatalogController {
    /**
     * GET /catalog/enums — alle System-Enums + Display-Meta in einer Antwort.
     */
    async listEnums(_req: Request, res: Response) {
        try {
            const enums: Record<string, ReturnType<typeof buildCatalogEnum>> = {};
            for (const [key, schema] of Object.entries(CATALOG_ENUM_DEFS)) {
                enums[key] = buildCatalogEnum(key, schema);
            }
            return responseHandler(res, 200, undefined, { enums });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * GET /catalog/playbooks — alle registrierten Playbooks mit FE-Display-Metadaten.
     */
    async listPlaybooks(_req: Request, res: Response) {
        try {
            const items = listPlaybooks().map((p) => ({
                key: p.key,
                label: p.label,
                description: p.description,
                category: categoryForPlaybook(p.key),
                danger: (p.maxRequiredScope === "passive_only"
                    ? "passive"
                    : p.maxRequiredScope) as "passive" | "active_safe" | "active_intrusive",
                expectedRuntimeSec: null,
                requiredScope: p.maxRequiredScope,
                acceptsRootEntityKinds: [...p.acceptsRootEntityKinds],
                stepCount: p.steps.length,
            }));
            return responseHandler(res, 200, undefined, { items });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * GET /catalog/workers — alle registrierten Workers mit FE-Display-Metadaten.
     */
    async listWorkers(_req: Request, res: Response) {
        try {
            const items = listWorkers().map((w) => ({
                jobKey: w.jobKey,
                label: w.jobKey
                    .split("_")
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(" "),
                description: w.description,
                category: categoryForWorker(w.jobKey),
                requiredScope: w.requiredScope,
                defaultTimeoutMs: w.defaultTimeoutMs,
                // SecurityWorker hat keinen statischen targetKinds-Slot —
                // isApplicable() ist runtime-basiert. Wir geben leeres Array zurück;
                // Frontend kann via worker.isApplicable über die Worker-Run-Listen-API
                // testen, ob ein Worker zu einer Entity passt.
                targetKinds: [] as string[],
            }));
            return responseHandler(res, 200, undefined, { items });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const catalogController = new CatalogController();
