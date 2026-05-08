// Phase 2.7 — email_pattern_inference Worker.
//
// Input:  asset_domain-Entity
// Output: Finding (category=exposure, severity=info) mit Liste von Email-Pattern-
//         Hypothesen + confidence-Werten. KEINE neuen Email-Entities — Operator
//         entscheidet manuell, ob er Pattern aktiv für Spear-Phishing-Tests nutzt.
//
// Quelle: Bestehende email_address-Entities zur Ziel-Domain in der DB. Heuristische
// Klassifikation der local-parts in bekannte Email-Pattern-Templates.

import { and, eq, like } from "drizzle-orm";
import { database } from "@/db";
import { entities } from "@/db/individual/individual-schema";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

type PatternKey =
    | "{first}.{last}"
    | "{f}.{last}"
    | "{first}{last}"
    | "{f}{last}"
    | "{first}_{last}"
    | "{first}-{last}"
    | "{first}"
    | "{last}"
    | "{first_initial}{last_initial}"
    | "other";

const NUMERIC_RE = /^\d+$/;

function classifyLocalPart(local: string): PatternKey {
    if (!local) return "other";
    const lower = local.toLowerCase();
    // Reine Funktions-Adressen ausschließen
    const funcSet = new Set(["info", "kontakt", "hello", "support", "noreply", "admin", "office", "mail", "webmaster", "postmaster", "team", "service", "sales", "press", "jobs"]);
    if (funcSet.has(lower)) return "other";
    if (NUMERIC_RE.test(lower)) return "other";

    if (lower.includes(".")) {
        const parts = lower.split(".");
        if (parts.length === 2) {
            const [a, b] = parts;
            if (a.length === 1) return "{f}.{last}";
            return "{first}.{last}";
        }
    }
    if (lower.includes("_")) {
        const parts = lower.split("_");
        if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
            return "{first}_{last}";
        }
    }
    if (lower.includes("-")) {
        const parts = lower.split("-");
        if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
            return "{first}-{last}";
        }
    }
    if (lower.length === 2) return "{first_initial}{last_initial}";
    if (lower.length <= 4) return "{first}";
    if (lower.length >= 6 && /^[a-z]+$/.test(lower)) {
        // Wenn das erste Zeichen wahrscheinlich Initial ist (1 Char + Name), aber das
        // können wir ohne Wörterbuch nicht zuverlässig — markiere als ambig.
        return "{first}{last}";
    }
    return "other";
}

export const emailPatternInferenceWorker: SecurityWorker = {
    jobKey: "email_pattern_inference",
    requiredScope: "passive_only",
    description: "Aggregiert vorhandene Email-Adressen einer Domain heuristisch zu Pattern-Hypothesen ({first}.{last}@, {f}{last}@, …) mit Confidence-Werten. Liefert nur ein Finding, keine neuen Entities.",
    defaultTimeoutMs: 10_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const domain = ctx.target.value.trim().toLowerCase();

        const rows = await database
            .select({ canonicalKey: entities.canonicalKey })
            .from(entities)
            .where(and(
                eq(entities.kind, "email_address"),
                like(entities.canonicalKey, `%@${domain}`),
            ))
            .limit(500);

        const locals = rows
            .map((r) => r.canonicalKey)
            .filter((k): k is string => !!k && k.includes("@"))
            .map((k) => k.split("@")[0]!)
            .filter((l) => l && l.length >= 2);

        if (locals.length < 3) {
            return {
                success: true,
                rawOutput: { domain, sampleSize: locals.length },
                findings: [],
                error: "skipped:insufficient_email_sample",
                durationMs: Date.now() - start,
            };
        }

        const counts = new Map<PatternKey, number>();
        for (const l of locals) {
            const key = classifyLocalPart(l);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        const total = locals.length;
        const distribution = [...counts.entries()]
            .map(([pattern, count]) => ({ pattern, count, confidence: Math.round((count / total) * 100) }))
            .sort((a, b) => b.count - a.count);

        const top = distribution.filter((d) => d.pattern !== "other" && d.confidence >= 15);
        const findings: FindingDraft[] = [];
        if (top.length > 0) {
            findings.push({
                fingerprintInputs: ["osint_email_pattern", domain, top.map((t) => t.pattern).join(",")],
                severity: "info",
                category: "exposure",
                title: `Email-Pattern-Inferenz für ${domain}`,
                description:
                    `Aus ${total} bekannten Email-Adressen der Domain ${domain} wurden folgende Pattern abgeleitet ` +
                    `(in Reihenfolge der Häufigkeit, hohe Confidence = sicherer):\n\n` +
                    top.map((t) => `  • ${t.pattern}@${domain} — Confidence ${t.confidence}% (${t.count}/${total})`).join("\n") +
                    `\n\nDieser Worker emittiert KEINE neuen Email-Entities. Verwende die Pattern bewusst und nur im Rahmen der Engagement-Authorization.`,
                evidence: { domain, sampleSize: total, distribution },
            });
        }

        return {
            success: true,
            rawOutput: { domain, sampleSize: total, distribution },
            findings,
            durationMs: Date.now() - start,
        };
    },
};
