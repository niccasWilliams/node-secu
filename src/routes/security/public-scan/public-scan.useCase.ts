// Public-Scan-Use-Case — der End-to-End-Pfad für anonyme Free-Scans.
//
// LEGAL NOTE:
// Der User MUSS in der UI einen Consent-Toggle aktivieren, der bestätigt:
// "Ich darf diese Domain scannen — sie gehört mir oder ich habe Authorization."
// Wir scannen ausschließlich passive_only — kein Active-Scan auf fremde Domains
// ohne explizite verifizierte Authorization. §202c StGB konform.

import { database } from "@/db";
import { publicScanLeads, type PublicScanLead } from "@/db/individual/individual-schema";
import { assetService } from "@/lib/security/assets/asset.service";
import { scanOrchestrator } from "@/lib/security/scans/scan-orchestrator.service";
import { reportService } from "@/lib/security/reports/report.service";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { eq, gt, sql } from "drizzle-orm";
import crypto from "node:crypto";
import type { PublicScanInput } from "./public-scan.dto";

const RATE_LIMIT_PER_HOUR = Number(process.env.PUBLIC_SCAN_RATE_LIMIT_PER_HOUR ?? 5);

export const publicScanUseCase = {
    async run(input: PublicScanInput, callerIp: string) {
        const ipHash = hashIp(callerIp);

        // ── Rate-Limit per IP ──────────────────────────────────────────
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentCount = await database
            .select({ count: sql<number>`count(*)::int` })
            .from(publicScanLeads)
            .where(sql`${publicScanLeads.ipHash} = ${ipHash} AND ${publicScanLeads.createdAt} > ${oneHourAgo}`);
        const count = recentCount[0]?.count ?? 0;
        if (count >= RATE_LIMIT_PER_HOUR) {
            return {
                ok: false as const,
                reason: "rate_limited" as const,
                retryAfterSeconds: 3600,
            };
        }

        // ── Lead-Record erzeugen ───────────────────────────────────────
        const leadRow = await database.insert(publicScanLeads).values({
            domain: input.domain,
            ipHash,
            email: input.email ?? null,
            name: input.name ?? null,
            company: input.company ?? null,
            agreedToFollowup: input.agreedToFollowup ?? false,
            agreedAt: input.agreedToFollowup ? new Date() : null,
            consentText: "user_authorized_passive_scan_via_ui_consent_toggle",
            referrer: input.referrer,
            utmSource: input.utmSource,
            utmCampaign: input.utmCampaign,
            status: "new",
        }).returning();
        const lead: PublicScanLead = leadRow[0]!;

        await auditLogService.log({
            action: "public_scan.requested",
            actorIp: callerIp,
            targetType: "lead",
            targetId: lead.id,
            payload: { domain: input.domain, hasEmail: !!input.email },
        });

        // ── Asset find-or-create (kein Owner — public Scan) ────────────
        const asset = await assetService.findOrCreate({
            kind: "domain",
            value: input.domain,
            label: `public-scan:${input.domain}`,
            isOwnInfrastructure: false,
        });

        // ── Scan ausführen (passive_quick) ─────────────────────────────
        const scanResult = await scanOrchestrator.startScan({
            assetId: asset.id,
            scanType: "passive_quick",
            trigger: "public_free",
            publicLeadId: lead.id,
            actorIp: callerIp,
        });

        const summary = await reportService.buildScanSummary(scanResult.scan.id);

        return {
            ok: true as const,
            scanId: scanResult.scan.id,
            leadId: lead.id,
            domain: input.domain,
            counts: summary.counts,
            findings: {
                critical: summary.findings.critical.map(serializePublicFinding),
                high: summary.findings.high.map(serializePublicFinding),
                medium: summary.findings.medium.map(serializePublicFinding),
                low: summary.findings.low.map(serializePublicFinding),
                info: summary.findings.info.map(serializePublicFinding),
            },
            // CTA für Up-Sell
            offer: {
                message: "Want a deeper scan including active vulnerability checks (nuclei, nmap, CMS-scans)? Verify ownership first.",
                ctaPath: "/security/verify-ownership",
            },
        };
    },
};

function hashIp(ip: string): string {
    return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function serializePublicFinding(f: { id: number; title: string; description: string; severity: string; category: string; recommendation: string | null }) {
    return {
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        category: f.category,
        recommendation: f.recommendation,
    };
}
