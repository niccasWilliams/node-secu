// Finding-Service — persistiert Findings mit stabiler Deduplication.
// Zwei Scans desselben Assets mit identischer Lücke = ein Finding-Record,
// nur seenCount/lastSeenAt steigen.

import { database } from "@/db";
import { findings, type Finding, type NewFinding } from "@/db/individual/individual-schema";
import { and, eq, sql } from "drizzle-orm";
import type { FindingDraft } from "../workers/worker.types";
import { buildFindingFingerprint } from "./fingerprint";

export interface PersistedFinding extends Finding {
    isNew: boolean;
}

export const findingService = {
    /**
     * Upsert einer Finding-Draft.
     * - Neu (assetId, fingerprintHash) → INSERT, isNew=true
     * - Bekannt → UPDATE seenCount+1, lastSeenAt=now, isNew=false
     */
    async upsert(input: {
        assetId: number;
        scanId: number;
        scanJobId: number;
        draft: FindingDraft;
    }): Promise<PersistedFinding> {
        const fingerprintHash = buildFindingFingerprint(input.draft.fingerprintInputs);

        const existing = await database
            .select()
            .from(findings)
            .where(and(
                eq(findings.assetId, input.assetId),
                eq(findings.fingerprintHash, fingerprintHash),
            ))
            .limit(1);

        if (existing.length > 0) {
            const cur = existing[0]!;
            const updated = await database
                .update(findings)
                .set({
                    lastSeenAt: new Date(),
                    seenCount: cur.seenCount + 1,
                    scanId: input.scanId,
                    scanJobId: input.scanJobId,
                    // Falls Severity sich verändert hat (Re-Triage), übernehmen
                    severity: input.draft.severity,
                    // Re-open wenn vorher resolved und jetzt wieder gefunden
                    status: cur.status === "resolved" ? "open" : cur.status,
                    statusReason: cur.status === "resolved" ? "Re-detected after previous resolution" : cur.statusReason,
                    evidence: input.draft.evidence ?? {},
                    updatedAt: new Date(),
                })
                .where(eq(findings.id, cur.id))
                .returning();
            return { ...updated[0]!, isNew: false };
        }

        const draft: NewFinding = {
            assetId: input.assetId,
            scanId: input.scanId,
            scanJobId: input.scanJobId,
            fingerprintHash,
            severity: input.draft.severity,
            category: input.draft.category,
            title: input.draft.title,
            description: input.draft.description,
            evidence: input.draft.evidence ?? {},
            recommendation: input.draft.recommendation,
            cveIds: input.draft.cveIds ?? [],
            cvssScore: input.draft.cvssScore,
            status: "open",
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            seenCount: 1,
        };

        const inserted = await database.insert(findings).values(draft).returning();
        return { ...inserted[0]!, isNew: true };
    },

    /** Markiert alle Findings dieses Assets als resolved, die in diesem Scan NICHT mehr gesehen wurden. */
    async markStaleAsResolved(assetId: number, scanId: number): Promise<number> {
        const result = await database
            .update(findings)
            .set({
                status: "resolved",
                resolvedAt: new Date(),
                statusReason: "Auto-resolved: not detected in latest scan",
                updatedAt: new Date(),
            })
            .where(and(
                eq(findings.assetId, assetId),
                eq(findings.status, "open"),
                sql`${findings.scanId} != ${scanId}`,
            ))
            .returning();
        return result.length;
    },
};
