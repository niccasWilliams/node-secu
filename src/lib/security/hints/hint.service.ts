// Hint-Service — Sprint 1 (features.md §2.1).
//
// Operator hinterlegt strukturiertes Vorwissen pro Engagement. OSINT-Worker
// konsumieren die Hints als Seed-Material und tragen die referenzierten
// Hint-IDs in `evidence[].hintRefs` zurück (features.md §2.2 + §2.7).
//
// Modell: pro Hint eine Zeile. Slot-Enum klassifiziert die Semantik (owner_name,
// owner_city, …). Mehrere Hints im gleichen Slot sind erlaubt.

import { and, asc, eq } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementHints,
    type EngagementHint,
    type EngagementHintSlot,
} from "@/db/individual/individual-schema";

export type HintInput = {
    slot: EngagementHintSlot;
    value: string;
    source?: string | null;
    notes?: string | null;
};

export type HintPatch = {
    value?: string;
    source?: string | null;
    notes?: string | null;
};

/** Worker-facing Snapshot: alle Hints eines Engagements gruppiert nach Slot. */
export type EngagementHintBundle = {
    [Slot in EngagementHintSlot]: EngagementHint[];
};

function emptyBundle(): EngagementHintBundle {
    return {
        owner_name: [],
        owner_city: [],
        owner_company: [],
        owner_known_email: [],
        owner_known_username: [],
        owner_alt_domain: [],
        industry: [],
        free_text: [],
    };
}

export const hintService = {
    async list(engagementId: number): Promise<EngagementHint[]> {
        return database
            .select()
            .from(engagementHints)
            .where(eq(engagementHints.engagementId, engagementId))
            .orderBy(asc(engagementHints.slot), asc(engagementHints.createdAt));
    },

    async getById(hintId: number): Promise<EngagementHint | null> {
        const [row] = await database
            .select()
            .from(engagementHints)
            .where(eq(engagementHints.id, hintId))
            .limit(1);
        return row ?? null;
    },

    /** Engagement+ID-Pair-Lookup — verhindert Cross-Engagement-Mutationen via /:id/hints/:hintId. */
    async getInEngagement(engagementId: number, hintId: number): Promise<EngagementHint | null> {
        const [row] = await database
            .select()
            .from(engagementHints)
            .where(and(
                eq(engagementHints.id, hintId),
                eq(engagementHints.engagementId, engagementId),
            ))
            .limit(1);
        return row ?? null;
    },

    async createMany(
        engagementId: number,
        items: HintInput[],
        createdBy: number | null,
    ): Promise<EngagementHint[]> {
        if (items.length === 0) return [];
        const rows = items.map((it) => ({
            engagementId,
            slot: it.slot,
            value: it.value.trim(),
            source: it.source?.trim() || null,
            notes: it.notes?.trim() || null,
            createdBy,
        }));
        return database.insert(engagementHints).values(rows).returning();
    },

    async patch(hintId: number, patch: HintPatch): Promise<EngagementHint | null> {
        const update: Partial<typeof engagementHints.$inferInsert> = { updatedAt: new Date() };
        if (patch.value !== undefined) update.value = patch.value.trim();
        if (patch.source !== undefined) update.source = patch.source?.trim() || null;
        if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;

        const [updated] = await database
            .update(engagementHints)
            .set(update)
            .where(eq(engagementHints.id, hintId))
            .returning();
        return updated ?? null;
    },

    async remove(hintId: number): Promise<boolean> {
        const deleted = await database
            .delete(engagementHints)
            .where(eq(engagementHints.id, hintId))
            .returning({ id: engagementHints.id });
        return deleted.length > 0;
    },

    /**
     * Worker-facing Bundle: ein Engagement-Snapshot zum Seeden von OSINT-Workern.
     * Worker, die einen Hint genutzt haben, MÜSSEN die `id` des konsumierten Hints
     * in ihre `evidence[].hintRefs` aufnehmen — sonst ist die `evidenceClass`-
     * Klassifizierung (organic vs hint_seeded, features.md §2.7) nicht haltbar.
     */
    async getBundle(engagementId: number): Promise<EngagementHintBundle> {
        const rows = await this.list(engagementId);
        const bundle = emptyBundle();
        for (const row of rows) {
            bundle[row.slot].push(row);
        }
        return bundle;
    },
};
