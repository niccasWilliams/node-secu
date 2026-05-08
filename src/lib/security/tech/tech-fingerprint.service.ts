// Tech-Fingerprint-Service — globale Tech-Stack-Information pro Entity.
//
// Worker liefern `TechDraft[]` zurück (z.B. der HTTP-Header-Worker via Server- oder
// X-Powered-By-Header). Der Service merged diese Drafts in `entities.data.tech` —
// dedupliziert nach (techName + version + detectionSource), sodass mehrere Runs
// keine Tech-Liste aufblähen.
//
// Playbook-Conditions lesen den Tech-Set über `getTechSet(entityId)`. Steps können
// damit auf z.B. "WordPress" reagieren, ohne den Worker-Output direkt zu kennen.

import { eq } from "drizzle-orm";
import { database } from "@/db";
import { entities } from "@/db/individual/individual-schema";
import type { TechDraft } from "../workers/worker.types";

export interface PersistedTechFingerprint {
    techName: string;
    version?: string;
    cpe?: string;
    detectionSource: TechDraft["detectionSource"];
    confidence: TechDraft["confidence"];
    evidence?: Record<string, unknown>;
    firstSeenAt: string;
    lastSeenAt: string;
}

interface EntityDataWithTech {
    tech?: PersistedTechFingerprint[];
    [k: string]: unknown;
}

export const techFingerprintService = {
    /**
     * Merged Tech-Drafts in `entities.data.tech`. Dedup-Key: techName+version+source.
     * Liefert das aktualisierte Tech-Array zurück.
     */
    async applyDrafts(entityId: number, drafts: TechDraft[]): Promise<PersistedTechFingerprint[]> {
        if (drafts.length === 0) return await this.list(entityId);

        const [row] = await database.select({ data: entities.data }).from(entities).where(eq(entities.id, entityId)).limit(1);
        if (!row) return [];

        const data = (row.data as EntityDataWithTech | null) ?? {};
        const existing = Array.isArray(data.tech) ? data.tech : [];
        const now = new Date().toISOString();

        const byKey = new Map<string, PersistedTechFingerprint>();
        for (const t of existing) {
            byKey.set(keyFor(t.techName, t.version, t.detectionSource), t);
        }

        for (const d of drafts) {
            const techName = d.techName.trim().toLowerCase();
            const version = d.version?.trim() || undefined;
            const k = keyFor(techName, version, d.detectionSource);
            const prev = byKey.get(k);
            const merged: PersistedTechFingerprint = {
                techName,
                version,
                cpe: d.cpe ?? prev?.cpe,
                detectionSource: d.detectionSource,
                confidence: d.confidence,
                evidence: d.evidence ?? prev?.evidence,
                firstSeenAt: prev?.firstSeenAt ?? now,
                lastSeenAt: now,
            };
            byKey.set(k, merged);
        }

        const newTech = [...byKey.values()];
        const newData: EntityDataWithTech = { ...data, tech: newTech };
        await database
            .update(entities)
            .set({ data: newData, lastSeenAt: new Date() })
            .where(eq(entities.id, entityId));
        return newTech;
    },

    async list(entityId: number): Promise<PersistedTechFingerprint[]> {
        const [row] = await database.select({ data: entities.data }).from(entities).where(eq(entities.id, entityId)).limit(1);
        const data = (row?.data as EntityDataWithTech | null) ?? {};
        return Array.isArray(data.tech) ? data.tech : [];
    },

    /** Schnelle Set-Sicht für Playbook-Conditions: enthält jeweils tech-name (lowercased). */
    async getTechSet(entityId: number): Promise<Set<string>> {
        const list = await this.list(entityId);
        return new Set(list.map((t) => t.techName.toLowerCase()));
    },
};

function keyFor(name: string, version: string | undefined, source: string): string {
    return `${name.toLowerCase()}::${version ?? ""}::${source}`;
}
