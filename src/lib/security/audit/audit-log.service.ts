// Audit-Log-Service — schreibt eine Spur in secu_audit_log für jede sicherheits-
// relevante Aktion. Wichtig für: Compliance, Forensik, "wer hat den Scan gestartet".

import { database } from "@/db";
import { securityAuditLog, type NewSecurityAuditLog } from "@/db/individual/individual-schema";
import crypto from "node:crypto";

export const auditLogService = {
    async log(input: {
        action: string;
        actorUserId?: number | null;
        actorIp?: string | null;
        targetType?: string;
        targetId?: number;
        payload?: Record<string, unknown>;
        success?: boolean;
        errorMessage?: string;
    }): Promise<void> {
        const entry: NewSecurityAuditLog = {
            action: input.action,
            actorUserId: input.actorUserId ?? null,
            actorIpHash: input.actorIp ? hashIp(input.actorIp) : null,
            targetType: input.targetType,
            targetId: input.targetId,
            payload: input.payload ?? {},
            success: input.success ?? true,
            errorMessage: input.errorMessage,
        };
        // Fire-and-forget — Audit-Failures sollen nie eine User-Action blockieren.
        try {
            await database.insert(securityAuditLog).values(entry);
        } catch (err) {
            console.error("[audit-log] failed to persist", { action: input.action, error: (err as Error).message });
        }
    },
};

function hashIp(ip: string): string {
    // SHA-256 first 16 bytes — genug für Rate-Limiting/Korrelation, kein Reverse möglich.
    return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
