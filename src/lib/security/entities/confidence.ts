// Sprint 1.2 (OSINT-Engine, features.md §2.2 + §2.7) — Confidence-Aggregator.
//
// Der Service merged neue Worker-Belege in den `entity.data.provenance`-Block,
// rechnet die Aggregat-Confidence neu aus und entscheidet über `speculative`.
// Alle Worker-Discoveries laufen über `playbook-runner → executeWorker →
// persistDiscoveredEntities`; dort wird `confidenceService.aggregate()` für jede
// Discovery mit Evidence-Liste aufgerufen, und das Ergebnis als zusätzlicher
// `entityDataPatch` an `entityService.upsert()` weitergereicht.
//
// Aggregations-Regeln (kanonisch features.md §2.7):
//
//   1× organic-Quelle              → confidence ≈ 0.55 (Single-Source-Vorsicht)
//   2× organic, unabhängige Quellen → confidence ≈ 0.85
//   3+× organic, unabhängige Quellen → confidence → 1.0 asymptotisch
//   1× hint_seeded allein           → cap auf 0.7 (Operator-Bias-Risiko)
//   1× organic + 1× hint_seeded     → confidence = max(computed, 0.95)
//                                      ("Hint bestätigt durch organischen Treffer")
//
// Speculative-Schwelle: confidence < 0.6 → speculative=true (sonst false).
// Worker können den Default überschreiben indem sie in der Discovery-Draft
// `speculativeOverride: true|false` setzen — dann wird der computed Wert
// durch den Override ersetzt und im Provenance-Block als entsprechend markiert.
//
// "Independent sources" wird via `source`-String unterschieden — zwei Belege
// mit demselben source (z.B. zwei Crawls derselben /impressum) zählen für
// den Multi-Source-Boost als EINE Quelle (das spätere Snippet wird trotzdem
// in `evidence[]` aufgenommen, für Audit/Reporting).

import type {
    EntityConflict,
    EntityEvidenceClass,
    EntityEvidenceItem,
    EntityProvenance,
} from "@/db/individual/individual-schema";

/** Eingabe pro neuer Discovery — was der Worker an Belegen mitbringt. */
export interface NewEvidenceInput {
    source: string;
    workerKey?: string;
    workerRunId?: number;
    snippet?: string;
    /** 0.0..1.0 — Empfehlung pro Klasse: organic 0.5, hint_seeded 0.4. */
    confidenceContribution: number;
    evidenceClass: EntityEvidenceClass;
    hintRefs?: number[];
    /** Optional: Worker meldet einen Konflikt zu bestehender Claim (Service kann ihn auch erkennen). */
    conflict?: EntityConflict;
}

export interface AggregateInput {
    /** Vorhandener Provenance-Block (oder undefined wenn neue Entity). */
    current?: EntityProvenance;
    /** Neue Belege aus dem aktuellen Worker-Run (mind. 1 Eintrag). */
    newEvidence: NewEvidenceInput[];
    /** Worker kann Speculative-Default überschreiben. */
    speculativeOverride?: boolean;
}

export interface AggregateResult {
    provenance: EntityProvenance;
    /** Anzahl neu hinzugefügter Konflikt-Einträge (für Logging). */
    newConflictsAdded: number;
}

const SPECULATIVE_THRESHOLD = 0.6;
const HINT_ONLY_CAP = 0.7;
const HINT_BOOST_BLEND = 0.95;
const SINGLE_SOURCE_CONTRIB_MAX = 0.6;

export const confidenceService = {
    /**
     * Merged neue Belege in Provenance, recomputed Confidence + Speculative.
     * Wirft NICHT — leere `newEvidence` ergibt einen unveränderten Block (oder
     * einen frischen Block falls noch keiner existierte).
     */
    aggregate(input: AggregateInput): AggregateResult {
        const now = new Date().toISOString();
        const evidence: EntityEvidenceItem[] = [...(input.current?.evidence ?? [])];

        for (const item of input.newEvidence) {
            evidence.push({
                source: item.source,
                workerKey: item.workerKey,
                workerRunId: item.workerRunId,
                foundAt: now,
                snippet: item.snippet,
                confidenceContribution: clamp01(item.confidenceContribution),
                evidenceClass: item.evidenceClass,
                hintRefs: item.hintRefs && item.hintRefs.length > 0 ? item.hintRefs : undefined,
            });
        }

        const conflicts: EntityConflict[] = [...(input.current?.conflicts ?? [])];
        let newConflictsAdded = 0;
        for (const item of input.newEvidence) {
            if (item.conflict) {
                conflicts.push({ ...item.conflict, observedAt: now });
                newConflictsAdded += 1;
            }
        }

        const confidence = computeConfidence(evidence);
        const speculative = input.speculativeOverride ?? confidence < SPECULATIVE_THRESHOLD;

        return {
            provenance: {
                speculative,
                confidence,
                evidence,
                conflicts,
                recomputedAt: now,
            },
            newConflictsAdded,
        };
    },

    /**
     * Convenience: nimmt `entity.data` (jsonb) + neue Belege, liefert das
     * patch-Objekt das via `entityService.patchData()` rückgemerged werden kann.
     * Lässt alle anderen `data`-Felder unverändert.
     */
    buildDataPatch(
        currentData: Record<string, unknown> | null | undefined,
        newEvidence: NewEvidenceInput[],
        speculativeOverride?: boolean,
    ): { provenance: EntityProvenance; newConflictsAdded: number } {
        const currentProvenance = (currentData?.provenance as EntityProvenance | undefined) ?? undefined;
        const result = this.aggregate({
            current: currentProvenance,
            newEvidence,
            speculativeOverride,
        });
        return { provenance: result.provenance, newConflictsAdded: result.newConflictsAdded };
    },

    /** Test-/Diagnose-Helper. */
    _internals: {
        computeConfidence,
        SPECULATIVE_THRESHOLD,
        HINT_ONLY_CAP,
        HINT_BOOST_BLEND,
    },
};

function computeConfidence(evidence: EntityEvidenceItem[]): number {
    if (evidence.length === 0) return 0;

    // Pro Source-Bucket: höchster Beleg-Wert (mehrere Snippets aus derselben
    // Quelle multiplizieren NICHT — sonst würde ein Worker durch wiederholte
    // /impressum-Crawls die Confidence trivial hochjazzen).
    const bestPerSource = new Map<string, EntityEvidenceItem>();
    for (const e of evidence) {
        const cur = bestPerSource.get(e.source);
        if (!cur || cur.confidenceContribution < e.confidenceContribution) {
            bestPerSource.set(e.source, e);
        }
    }

    const items = [...bestPerSource.values()];
    const organicItems = items.filter((i) => i.evidenceClass === "organic");
    const hintItems = items.filter((i) => i.evidenceClass === "hint_seeded");

    // Single-Source-Cap: ohne Multi-Source-Bestätigung darf eine Einzelquelle
    // höchstens SINGLE_SOURCE_CONTRIB_MAX beitragen, egal was sie meldet.
    let combined = 0;
    if (items.length === 1) {
        combined = Math.min(items[0].confidenceContribution, SINGLE_SOURCE_CONTRIB_MAX);
    } else {
        // Probabilistic-OR: 1 - prod(1 - c_i)
        combined = 1;
        for (const i of items) combined *= 1 - clamp01(i.confidenceContribution);
        combined = 1 - combined;
    }

    if (organicItems.length === 0 && hintItems.length > 0) {
        combined = Math.min(combined, HINT_ONLY_CAP);
    }
    if (organicItems.length >= 1 && hintItems.length >= 1) {
        combined = Math.max(combined, HINT_BOOST_BLEND);
    }

    return Math.round(combined * 1000) / 1000;
}

function clamp01(n: number): number {
    if (Number.isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
