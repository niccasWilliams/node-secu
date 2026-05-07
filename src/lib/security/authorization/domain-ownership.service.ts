// Domain-Ownership-Service — verifiziert Domain-Eigentum via DNS-TXT.
//
// Flow:
// 1. User registriert Asset → wir generieren Token "secu-verify-<random>".
// 2. User legt TXT-Record an: _secu-verify.<domain> IN TXT "secu-verify-<random>".
// 3. User klickt "verify" → wir resolven, vergleichen Token, setzen verifiedAt.
//
// Token-Lebenszeit: 30 Tage. Nach Verify wird der Token nicht mehr nötig
// (Authorization bleibt gültig, aber wir prüfen nicht erneut, außer User verlangt Re-Verify).

import dns from "node:dns/promises";
import crypto from "node:crypto";
import { database } from "@/db";
import { assetAuthorizations, assets, type AssetAuthorization } from "@/db/individual/individual-schema";
import { eq } from "drizzle-orm";

const TOKEN_TXT_PREFIX = process.env.DOMAIN_PROOF_TXT_PREFIX || "secu-verify";

export const domainOwnershipService = {
    /** Generiert einen 32-char hex Token für Domain-Ownership-Proof. */
    generateToken(): string {
        return `${TOKEN_TXT_PREFIX}-${crypto.randomBytes(16).toString("hex")}`;
    },

    /**
     * Resolved den DNS-TXT-Record _secu-verify.<domain> und prüft, ob der Token enthalten ist.
     */
    async verifyDnsTxt(domain: string, expectedToken: string): Promise<{ ok: boolean; foundRecords: string[]; error?: string }> {
        const recordHost = `_${TOKEN_TXT_PREFIX}.${domain}`;
        try {
            const records = await dns.resolveTxt(recordHost);
            const flat = records.map((r) => r.join(""));
            const ok = flat.some((r) => r.includes(expectedToken));
            return { ok, foundRecords: flat };
        } catch (err: unknown) {
            return {
                ok: false,
                foundRecords: [],
                error: (err as Error).code ?? (err as Error).message,
            };
        }
    },

    /**
     * Verifiziert eine Authorization durch DNS-TXT-Lookup. Setzt verifiedAt bei Erfolg.
     */
    async runVerification(authorizationId: number): Promise<{ verified: boolean; error?: string }> {
        const auth = await database.query.assetAuthorizations.findFirst({
            where: eq(assetAuthorizations.id, authorizationId),
        });
        if (!auth) return { verified: false, error: "authorization_not_found" };
        if (auth.proofType !== "dns_txt") return { verified: false, error: "wrong_proof_type" };
        if (!auth.proofValue) return { verified: false, error: "no_token_set" };

        const asset = await database.query.assets.findFirst({ where: eq(assets.id, auth.assetId) });
        if (!asset) return { verified: false, error: "asset_not_found" };

        const result = await this.verifyDnsTxt(asset.value, auth.proofValue);

        await database
            .update(assetAuthorizations)
            .set({
                verifiedAt: result.ok ? new Date() : null,
                verificationAttempts: auth.verificationAttempts + 1,
                verificationError: result.error ?? null,
                updatedAt: new Date(),
            })
            .where(eq(assetAuthorizations.id, authorizationId));

        return { verified: result.ok, error: result.error };
    },
};
