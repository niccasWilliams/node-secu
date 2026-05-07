// Scan-Orchestrator — der Herzschlag des Scan-Systems.
//
// Verantwortlich für:
//  1. Scan-Record erzeugen
//  2. Authorization-Gate prüfen
//  3. Worker auswählen (passend zu scanType + asset.kind)
//  4. Worker sequenziell oder parallel ausführen
//  5. Findings persistieren (mit Dedup)
//  6. Tech-Fingerprints persistieren
//  7. Stale Findings auto-resolven
//  8. Summary aggregieren
//
// Phase 1: alles synchron. Phase 2 (siehe ROADMAP): Worker laufen in Background-Queue,
// Long-Running Scans (active) gehen in BullMQ/Workflow-Queue.

import { database } from "@/db";
import {
    scans,
    scanJobs,
    techFingerprints,
    assets,
    type Asset,
    type Scan,
    type NewScan,
    type NewScanJob,
} from "@/db/individual/individual-schema";
import { eq } from "drizzle-orm";
import { workersForScanType, getWorker } from "../workers/worker-registry";
import type { SecurityWorker, FindingDraft, TechDraft } from "../workers/worker.types";
import { findingService } from "../findings/finding.service";
import { authorizationService } from "../authorization/authorization.service";
import { auditLogService } from "../audit/audit-log.service";

export type SecuScanType = NewScan["scanType"];
export type SecuScanTrigger = NewScan["trigger"];

export interface StartScanInput {
    assetId: number;
    scanType: SecuScanType;
    trigger: SecuScanTrigger;
    triggeredByUserId?: number | null;
    publicLeadId?: number | null;
    actorIp?: string;
}

export interface ScanResult {
    scan: Scan;
    blocked?: boolean;
    blockReason?: string;
    summary: {
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        lowCount: number;
        infoCount: number;
        jobsTotal: number;
        jobsCompleted: number;
        jobsFailed: number;
    };
}

export const scanOrchestrator = {
    async startScan(input: StartScanInput): Promise<ScanResult> {
        const asset = await database.query.assets.findFirst({ where: eq(assets.id, input.assetId) });
        if (!asset) throw new Error(`asset_${input.assetId}_not_found`);

        const requiredScope = scopeForScanType(input.scanType);
        const decision = await authorizationService.canScan(input.assetId, requiredScope);

        const scanRow = await database.insert(scans).values({
            assetId: input.assetId,
            scanType: input.scanType,
            trigger: input.trigger,
            triggeredByUserId: input.triggeredByUserId ?? null,
            publicLeadId: input.publicLeadId ?? null,
            authorizationId: decision.authorization?.id ?? null,
            status: decision.allowed ? "running" : "blocked",
            startedAt: decision.allowed ? new Date() : null,
            errorMessage: decision.allowed ? null : `blocked: ${decision.reason}`,
        }).returning();
        const scan = scanRow[0]!;

        await auditLogService.log({
            action: "scan.start",
            actorUserId: input.triggeredByUserId ?? null,
            actorIp: input.actorIp,
            targetType: "scan",
            targetId: scan.id,
            payload: { assetId: asset.id, scanType: input.scanType, allowed: decision.allowed, reason: decision.reason },
            success: decision.allowed,
        });

        if (!decision.allowed) {
            return {
                scan,
                blocked: true,
                blockReason: decision.reason,
                summary: zeroSummary(),
            };
        }

        const workers = workersForScanType(input.scanType, asset);
        const summary = zeroSummary();
        summary.jobsTotal = workers.length;

        // Sequenziell ausführen — passive Workers sind alle <30s, da reicht das.
        // Phase 2: parallelisieren mit Promise.all + p-limit.
        for (const worker of workers) {
            const jobResult = await this.runJob(scan, asset, worker);
            if (jobResult.success) summary.jobsCompleted += 1;
            else summary.jobsFailed += 1;

            for (const draft of jobResult.findings) {
                bumpSummary(summary, draft);
            }
        }

        // Stale Findings auto-resolven (nur bei full re-scans)
        if (input.scanType === "passive_full" || input.scanType === "active_safe" || input.scanType === "active_intrusive") {
            await findingService.markStaleAsResolved(asset.id, scan.id);
        }

        const finalStatus = summary.jobsFailed === 0
            ? "completed"
            : summary.jobsCompleted === 0
                ? "failed"
                : "partial";

        const updated = await database.update(scans).set({
            status: finalStatus,
            completedAt: new Date(),
            progressPercent: 100,
            summary,
            updatedAt: new Date(),
        }).where(eq(scans.id, scan.id)).returning();

        return { scan: updated[0]!, summary };
    },

    /** Führt einen einzelnen Worker-Job aus und persistiert Ergebnis + Findings. */
    async runJob(scan: Scan, asset: Asset, worker: SecurityWorker): Promise<{ success: boolean; findings: FindingDraft[] }> {
        const jobRow = await database.insert(scanJobs).values({
            scanId: scan.id,
            jobKey: worker.jobKey,
            status: "running",
            startedAt: new Date(),
        } satisfies NewScanJob).returning();
        const job = jobRow[0]!;

        let findings: FindingDraft[] = [];
        let tech: TechDraft[] = [];
        let success = false;
        let error: string | undefined;
        let rawOutput: unknown;
        let durationMs = 0;

        try {
            const result = await worker.run({
                asset,
                scanId: scan.id,
                scanJobId: job.id,
                timeoutMs: worker.defaultTimeoutMs,
            });
            success = result.success;
            findings = result.findings;
            tech = result.techFingerprints ?? [];
            rawOutput = result.rawOutput;
            error = result.error;
            durationMs = result.durationMs;
        } catch (err) {
            error = (err as Error).message;
            durationMs = 0;
        }

        // Findings persistieren
        for (const f of findings) {
            await findingService.upsert({
                assetId: asset.id,
                scanId: scan.id,
                scanJobId: job.id,
                draft: f,
            });
        }

        // Tech-Fingerprints persistieren (upsert by assetId+techName+version)
        for (const t of tech) {
            await this.upsertTechFingerprint(asset.id, scan.id, t);
        }

        await database.update(scanJobs).set({
            status: success ? "completed" : "failed",
            completedAt: new Date(),
            durationMs,
            rawOutput,
            findingsCount: findings.length,
            error,
            updatedAt: new Date(),
        }).where(eq(scanJobs.id, job.id));

        return { success, findings };
    },

    async upsertTechFingerprint(assetId: number, scanId: number, t: TechDraft): Promise<void> {
        const existing = await database.query.techFingerprints.findFirst({
            where: (tf, { and, eq }) => and(
                eq(tf.assetId, assetId),
                eq(tf.techName, t.techName),
                t.version ? eq(tf.version, t.version) : undefined as any,
            ),
        });
        if (existing) {
            await database.update(techFingerprints).set({
                lastDetectedAt: new Date(),
                currentlyPresent: true,
                scanId,
                evidence: t.evidence,
                updatedAt: new Date(),
            }).where(eq(techFingerprints.id, existing.id));
            return;
        }
        await database.insert(techFingerprints).values({
            assetId,
            scanId,
            techName: t.techName,
            version: t.version,
            cpe: t.cpe,
            detectionSource: t.detectionSource,
            confidence: t.confidence,
            evidence: t.evidence,
        });
    },
};

function scopeForScanType(scanType: SecuScanType): "passive_only" | "active_safe" | "active_intrusive" {
    switch (scanType) {
        case "passive_quick":
        case "passive_full":
        case "monitor_diff":
        case "cve_match":
            return "passive_only";
        case "active_safe":
            return "active_safe";
        case "active_intrusive":
            return "active_intrusive";
        default:
            return "passive_only";
    }
}

function zeroSummary() {
    return { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0, jobsTotal: 0, jobsCompleted: 0, jobsFailed: 0 };
}

function bumpSummary(s: ReturnType<typeof zeroSummary>, draft: FindingDraft) {
    switch (draft.severity) {
        case "critical": s.criticalCount += 1; break;
        case "high": s.highCount += 1; break;
        case "medium": s.mediumCount += 1; break;
        case "low": s.lowCount += 1; break;
        case "info": s.infoCount += 1; break;
    }
}
