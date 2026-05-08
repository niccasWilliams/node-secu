// Phase 2.7 — email_alias_correlate Worker.
//
// Input:  email_address-Entity
// Output: KEINE neuen Entities, KEINE Findings — der Worker legt
//         entity_relationships kind="alias_of" zwischen Plus-Adressen,
//         lowercased-Varianten und gmail↔googlemail-Crossover an.
//
// Das ist der einzige Worker, der direkt mit dem relationship.service spricht
// statt nur über discoveredEntities. Begründung: Aliasing ist eine Beziehung
// ZWISCHEN bestehenden Entities — kein Discovery. Pure local DB-Logik, kein
// Provider, kein Network-Call.
//
// Aliasing-Regeln (konservativ):
//   1. Plus-Tag entfernen: "alice+work@x" ≡ "alice@x"
//   2. Lowercased Crossover (z.B. "Alice@x.com" ≡ "alice@x.com")
//   3. gmail↔googlemail (canonical-key normalisiert das schon, aber wir checken
//      auch Entities mit altem canonicalKey, falls in Migration nicht alle Rows
//      re-keyed wurden).
//
// Confidence: 95 — sehr hoch, weil deterministisch.

import { and, eq, ne } from "drizzle-orm";
import { database } from "@/db";
import { entities } from "@/db/individual/individual-schema";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
} from "../worker.types";
import { relationshipService } from "../../entities/relationship.service";

function deepNormalizeEmail(raw: string): string {
    const lower = raw.trim().toLowerCase();
    if (!lower.includes("@")) return lower;
    const [local, domain] = lower.split("@");
    const localNoPlus = local.split("+")[0]!;
    const normalizedDomain = domain.replace(/^googlemail\.com$/, "gmail.com");
    return `${localNoPlus}@${normalizedDomain}`;
}

export const emailAliasCorrelateWorker: SecurityWorker = {
    jobKey: "email_alias_correlate",
    requiredScope: "passive_only",
    description: "Lokal: korreliert Plus-Adressen, lowercased-Varianten und gmail↔googlemail-Crossover als alias_of-Relationships zwischen email_address-Entities.",
    defaultTimeoutMs: 5_000,

    isApplicable(target) {
        return target.kind === "email_address";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const sourceId = typeof ctx.target.id === "string" ? Number(ctx.target.id) : ctx.target.id;
        if (!Number.isFinite(sourceId) || sourceId <= 0) {
            return {
                success: false,
                findings: [],
                error: "alias_correlate_invalid_source_id",
                durationMs: Date.now() - start,
            };
        }

        const sourceRows = await database
            .select({ id: entities.id, canonicalKey: entities.canonicalKey })
            .from(entities)
            .where(and(eq(entities.id, sourceId), eq(entities.kind, "email_address")))
            .limit(1);
        if (sourceRows.length === 0) {
            return {
                success: false,
                findings: [],
                error: "alias_correlate_source_not_found",
                durationMs: Date.now() - start,
            };
        }
        const sourceCanonical = sourceRows[0].canonicalKey;
        const sourceDeep = deepNormalizeEmail(sourceCanonical);

        // Alle email_address-Entities laden — Worker ist O(N) über N Email-Entities.
        // Phase 2.7-Limit: 5000 — bei Wachstum ggf. zu Worker-Variante mit Domain-Index.
        const allEmails = await database
            .select({ id: entities.id, canonicalKey: entities.canonicalKey })
            .from(entities)
            .where(and(eq(entities.kind, "email_address"), ne(entities.id, sourceId)))
            .limit(5000);

        const aliasIds: number[] = [];
        for (const e of allEmails) {
            if (deepNormalizeEmail(e.canonicalKey) === sourceDeep) {
                aliasIds.push(e.id);
            }
        }

        let upsertCount = 0;
        for (const aliasId of aliasIds) {
            try {
                await relationshipService.upsert({
                    fromEntityId: sourceId,
                    toEntityId: aliasId,
                    kind: "alias_of",
                    confidence: 95,
                    source: "osint_email_alias_correlate",
                    data: { rule: "deep_normalize_match", sourceDeep },
                });
                upsertCount++;
            } catch (err) {
                console.warn(`[alias_correlate] upsert failed (${sourceId}↔${aliasId}): ${(err as Error).message}`);
            }
        }

        return {
            success: true,
            rawOutput: { sourceCanonical, sourceDeep, candidatesScanned: allEmails.length, aliasesFound: aliasIds.length, relationshipsUpserted: upsertCount },
            findings: [],
            durationMs: Date.now() - start,
        };
    },
};
