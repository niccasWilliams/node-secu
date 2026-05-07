// Report-Service — generiert kunden-lesbare Reports aus Scan-Daten.
//
// PHASE 3 STUB. Implementation:
//  1. buildMarkdownReport(scanId): Findings nach Severity gruppiert,
//     mit plain-German Erklärungen (keine CVSS-Listen).
//  2. buildPdfReport(scanId): React-PDF Renderer (Library wie node-bill).
//  3. uploadToS3 + presigned URL für Email-Versand.
//
// Template-Struktur (Markdown):
// # Sicherheits-Bericht für example.com
// ## Executive Summary
//   - X kritische, Y hohe, Z mittlere Findings
//   - Top-3 Empfehlungen
// ## Detailbefunde nach Severity
// ## Anhang: technische Daten

import { database } from "@/db";
import { findings, scans, assets } from "@/db/individual/individual-schema";
import { and, eq, ne } from "drizzle-orm";

export const reportService = {
    /** Liefert ein einfaches strukturiertes Result aus dem letzten Scan — wird für JSON-API genutzt. */
    async buildScanSummary(scanId: number) {
        const scan = await database.query.scans.findFirst({ where: eq(scans.id, scanId) });
        if (!scan) throw new Error(`scan_${scanId}_not_found`);

        const asset = await database.query.assets.findFirst({ where: eq(assets.id, scan.assetId) });

        const allFindings = await database.select().from(findings).where(and(
            eq(findings.scanId, scanId),
            ne(findings.status, "false_positive"),
        ));

        const grouped = {
            critical: allFindings.filter((f) => f.severity === "critical"),
            high: allFindings.filter((f) => f.severity === "high"),
            medium: allFindings.filter((f) => f.severity === "medium"),
            low: allFindings.filter((f) => f.severity === "low"),
            info: allFindings.filter((f) => f.severity === "info"),
        };

        return {
            scan,
            asset,
            findings: grouped,
            counts: {
                critical: grouped.critical.length,
                high: grouped.high.length,
                medium: grouped.medium.length,
                low: grouped.low.length,
                info: grouped.info.length,
                total: allFindings.length,
            },
        };
    },

    async buildMarkdownReport(_scanId: number): Promise<string> {
        throw new Error("not_implemented_yet — see ROADMAP.md Phase 3");
    },

    async buildPdfReport(_scanId: number): Promise<{ s3Key: string; url: string }> {
        throw new Error("not_implemented_yet — see ROADMAP.md Phase 3");
    },
};
