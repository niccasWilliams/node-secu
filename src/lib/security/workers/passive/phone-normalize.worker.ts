// Phase 2.7 — phone_normalize Worker.
//
// Input:  phone_number-Entity
// Output: KEINE neuen Entities, KEINE Findings — schreibt e164/region/type
//         in entities.data via entityDataPatch.
//
// Dependency: libphonenumber-js (pnpm add libphonenumber-js).
// Wenn das Paket fehlt, fällt der Worker auf eine konservative Plain-String-
// Normalisierung zurück (trim + Whitespace raus) und markiert es im rawOutput.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
} from "../worker.types";

interface PhoneInfo {
    e164?: string;
    region?: string;
    type?: "mobile" | "landline" | "voip" | "unknown";
    valid?: boolean;
}

async function normalizeWithLib(raw: string): Promise<PhoneInfo | null> {
    try {
        const lib = await import("libphonenumber-js");
        const parsed = lib.parsePhoneNumberFromString(raw);
        if (!parsed) return null;
        const t = parsed.getType?.();
        const type =
            t === "MOBILE" ? "mobile" :
            t === "FIXED_LINE" ? "landline" :
            t === "VOIP" ? "voip" :
            "unknown";
        return {
            e164: parsed.format("E.164"),
            region: parsed.country,
            type,
            valid: parsed.isValid(),
        };
    } catch {
        return null;
    }
}

export const phoneNormalizeWorker: SecurityWorker = {
    jobKey: "phone_normalize",
    requiredScope: "passive_only",
    description: "Normalisiert eine Telefonnummer auf E.164 + ermittelt Region und Typ (mobile/landline/voip). Patch via entityDataPatch.",
    defaultTimeoutMs: 3_000,

    isApplicable(target) {
        return target.kind === "phone_number";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const raw = ctx.target.value.trim();

        const info = await normalizeWithLib(raw);
        if (info) {
            return {
                success: true,
                rawOutput: { raw, ...info, normalizedVia: "libphonenumber-js" },
                findings: [],
                entityDataPatch: {
                    e164: info.e164,
                    region: info.region,
                    type: info.type,
                    valid: info.valid,
                    lastValidated: new Date().toISOString(),
                },
                durationMs: Date.now() - start,
            };
        }

        // Fallback ohne lib: konservativ (so wenig wie möglich verändern).
        const cleaned = raw.replace(/[\s\-().]/g, "");
        const e164 = cleaned.startsWith("+") ? cleaned : undefined;
        return {
            success: true,
            rawOutput: { raw, cleaned, normalizedVia: "fallback_plain" },
            findings: [],
            entityDataPatch: {
                e164,
                type: "unknown",
                lastValidated: new Date().toISOString(),
                normalizationFallback: true,
            },
            error: "skipped:libphonenumber_unavailable",
            durationMs: Date.now() - start,
        };
    },
};
