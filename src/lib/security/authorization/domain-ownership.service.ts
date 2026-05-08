// Domain-Ownership-Service — DNS-TXT-Eigentumsnachweis.
//
// Phase 0: framework-freie Bausteine (Token-Generator + DNS-TXT-Lookup).
// Phase 1: Persistenz-Glue gegen entity_authorizations.
//
// Workflow:
//   1) `prepareDnsTxtAuthorization(entityId, scope)` — legt einen
//      entity_authorization-Record (kind=verified_ownership, proofType=dns_txt,
//      verificationToken=<random>, verifiedAt=null) an und liefert dem Caller
//      Token + DNS-Record-Host zur Anzeige im UI.
//   2) Der Operator/Kunde setzt _secu-verify.<domain> TXT auf den Token.
//   3) `runDnsTxtVerification(authorizationId)` resolved den Record und setzt
//      bei Match `verifiedAt = now()`.

import dns from "node:dns/promises";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import {
    entities,
    entityAuthorizations,
    type AuthorizationScope,
    type EntityAuthorization,
} from "@/db/individual/individual-schema";

const TOKEN_TXT_PREFIX = process.env.DOMAIN_PROOF_TXT_PREFIX || "secu-verify";

export const domainOwnershipService = {
    /** Generiert einen 32-char hex Token mit Prefix für Domain-Ownership-Proof. */
    generateToken(): string {
        return `${TOKEN_TXT_PREFIX}-${crypto.randomBytes(16).toString("hex")}`;
    },

    /** Resolved den DNS-TXT-Record `_<prefix>.<domain>` und prüft, ob der Token enthalten ist. */
    async verifyDnsTxt(
        domain: string,
        expectedToken: string,
    ): Promise<{ ok: boolean; foundRecords: string[]; recordHost: string; error?: string }> {
        const recordHost = `_${TOKEN_TXT_PREFIX}.${domain}`;
        try {
            const records = await dns.resolveTxt(recordHost);
            const flat = records.map((r) => r.join(""));
            const ok = flat.some((r) => r.includes(expectedToken));
            return { ok, foundRecords: flat, recordHost };
        } catch (err: unknown) {
            return {
                ok: false,
                foundRecords: [],
                recordHost,
                error: (err as NodeJS.ErrnoException).code ?? (err as Error).message,
            };
        }
    },

    /**
     * Legt einen verified_ownership-Authorization-Record an (proofType=dns_txt,
     * verifiedAt=null). Liefert Token + Host für die Anzeige im UI/an den Kunden.
     */
    async prepareDnsTxtAuthorization(input: {
        entityId: number;
        scope: AuthorizationScope;
        grantedBy?: number | null;
        expiresAt?: Date | null;
        notes?: string | null;
    }): Promise<{ authorizationId: number; token: string; recordHost: string }> {
        const [entity] = await database
            .select()
            .from(entities)
            .where(eq(entities.id, input.entityId))
            .limit(1);
        if (!entity) throw new Error("domain-ownership: entity not found");
        if (entity.kind !== "asset_domain" && entity.kind !== "asset_subdomain") {
            throw new Error(`domain-ownership: kind ${entity.kind} not supported (need asset_domain | asset_subdomain)`);
        }

        const token = domainOwnershipService.generateToken();
        const [row] = await database
            .insert(entityAuthorizations)
            .values({
                entityId: input.entityId,
                kind: "verified_ownership",
                scope: input.scope,
                proofType: "dns_txt",
                verificationToken: token,
                grantedBy: input.grantedBy ?? null,
                expiresAt: input.expiresAt ?? null,
                notes: input.notes ?? null,
            })
            .returning({ id: entityAuthorizations.id });

        return {
            authorizationId: row.id,
            token,
            recordHost: `_${TOKEN_TXT_PREFIX}.${entity.canonicalKey}`,
        };
    },

    /**
     * Resolved den DNS-TXT-Record für einen vorhandenen Authorization-Eintrag und
     * markiert ihn bei Erfolg als verifiziert. Idempotent: bereits verifizierte
     * Records werden nicht erneut markiert.
     */
    async runDnsTxtVerification(authorizationId: number): Promise<{
        ok: boolean;
        already: boolean;
        record?: EntityAuthorization;
        error?: string;
    }> {
        const [auth] = await database
            .select()
            .from(entityAuthorizations)
            .where(eq(entityAuthorizations.id, authorizationId))
            .limit(1);
        if (!auth) return { ok: false, already: false, error: "authorization not found" };
        if (auth.proofType !== "dns_txt" || !auth.verificationToken) {
            return { ok: false, already: false, error: "authorization is not a dns_txt proof" };
        }
        if (auth.revokedAt) return { ok: false, already: false, error: "authorization revoked" };
        if (auth.verifiedAt) return { ok: true, already: true, record: auth };

        const [entity] = await database
            .select()
            .from(entities)
            .where(eq(entities.id, auth.entityId))
            .limit(1);
        if (!entity) return { ok: false, already: false, error: "entity gone" };

        const result = await domainOwnershipService.verifyDnsTxt(entity.canonicalKey, auth.verificationToken);
        if (!result.ok) return { ok: false, already: false, error: result.error ?? "token not found in TXT" };

        const [updated] = await database
            .update(entityAuthorizations)
            .set({ verifiedAt: new Date() })
            .where(eq(entityAuthorizations.id, authorizationId))
            .returning();
        return { ok: true, already: false, record: updated };
    },
};
