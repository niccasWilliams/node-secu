// Sprint 2 #7 (OSINT-Engine, features.md §3.1 Mechanik #10) — DNS-Pivot-Service.
//
// Zwei Aufgaben:
//   1. **Token-Erkennung** in DNS-TXT-Records (google-site-verification,
//      MS=ms..., apple-domain-verification, ...). Nur bekannte Token-Typen
//      werden als Pivot persistiert; Unbekanntes wird ignoriert (Worker
//      kann freie TXT-Records weiterhin als Finding melden).
//   2. **Idempotente Persistierung** in `secu_dns_verification_pivots` und
//      `secu_dns_ns_pivots` — der UNIQUE-Constraint `(entity, idType, idValue)`
//      fängt Re-Runs sauber ab.
//
// Cross-Engagement-Lookups passieren NICHT hier — der Sprint-5
// `cross_domain_pivot_lookup`-Worker liest die Tabellen direkt; dieser
// Service ist nur Schreibseite.

import { database } from "@/db";
import {
    dnsNsPivots,
    dnsVerificationPivots,
    type NewDnsNsPivot,
    type NewDnsVerificationPivot,
} from "@/db/individual/individual-schema";

/**
 * Bekannte Verification-Token-Patterns. Die Reihenfolge ist relevant — die
 * spezifischeren Patterns (z.B. mit `=`) müssen vor den generischen kommen,
 * weil ein TXT-Record auch zwei Patterns matchen kann (z.B.
 * `google-site-verification=ABC` würde `google-site-verification` als Substring
 * eines anderen Patterns falsch matchen).
 *
 * `extract` läuft pro TXT-Record und liefert ein `{ idType, idValue }` oder null.
 * Konvention: idValue ohne Provider-Präfix, case-preserved (Token sind case-
 * sensitive — Google-Site-Verifications haben Mixed-Case).
 */
type VerificationTokenMatcher = {
    idType: string;
    matcher: RegExp;
    /** Capture-Group-Index für den Token-Wert. */
    valueGroup: number;
};

const TOKEN_MATCHERS: ReadonlyArray<VerificationTokenMatcher> = [
    { idType: "google_site_verification", matcher: /^google-site-verification\s*=\s*([A-Za-z0-9_-]{20,})$/i, valueGroup: 1 },
    // Microsoft 365 / Entra-ID: `MS=msXXXXXXXX` (lower-case ms-Präfix Pflicht laut MS-Doku).
    { idType: "ms365", matcher: /^MS\s*=\s*(ms[A-Za-z0-9]{6,})$/, valueGroup: 1 },
    { idType: "apple_domain", matcher: /^apple-domain-verification\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "facebook_domain", matcher: /^facebook-domain-verification\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "atlassian_domain", matcher: /^atlassian-domain-verification\s*=\s*([A-Za-z0-9_/+=-]{16,})$/i, valueGroup: 1 },
    { idType: "github_domain", matcher: /^_github-pages-verification-code\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "adobe_idp", matcher: /^adobe-idp-site-verification\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "docusign", matcher: /^docusign\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "stripe_verification", matcher: /^stripe-verification\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "zoom_domain", matcher: /^ZOOM_verify_([A-Za-z0-9_-]{16,})$/, valueGroup: 1 },
    { idType: "webex_domain", matcher: /^webex-domain-verification\s*=\s*([A-Za-z0-9_-]{16,})$/i, valueGroup: 1 },
    { idType: "amazon_ses", matcher: /^amazonses:([A-Za-z0-9+/=]{16,})$/i, valueGroup: 1 },
    { idType: "yandex_verification", matcher: /^yandex-verification\s*[:=]\s*([A-Za-z0-9]{8,})$/i, valueGroup: 1 },
];

export interface ExtractedVerificationToken {
    idType: string;
    idValue: string;
}

export const dnsPivotService = {
    /**
     * Versucht jeden bekannten Token-Pattern auf ein TXT-Record. Liefert
     * den ersten Treffer oder null. Die TOKEN_MATCHERS-Reihenfolge bestimmt
     * Priority — keine Multi-Hits pro Record (TXT-Records enthalten i.d.R.
     * genau einen Verification-Token).
     */
    extractVerificationToken(txt: string): ExtractedVerificationToken | null {
        const trimmed = txt.trim().replace(/^"|"$/g, "");
        if (!trimmed) return null;
        for (const m of TOKEN_MATCHERS) {
            const match = trimmed.match(m.matcher);
            if (match) {
                const value = match[m.valueGroup]?.trim();
                if (value) return { idType: m.idType, idValue: value };
            }
        }
        return null;
    },

    /**
     * Idempotenter Insert in `secu_dns_verification_pivots`. UNIQUE
     * `(entityId, idType, idValue)` fängt Re-Runs ab. Wirft NICHT bei Konflikt.
     */
    async upsertVerification(input: NewDnsVerificationPivot): Promise<void> {
        await database
            .insert(dnsVerificationPivots)
            .values(input)
            .onConflictDoNothing();
    },

    /**
     * Cloudflare-NS-Pair aus einer NS-Liste extrahieren. Liefert das
     * sortierte Pair (z.B. "leonidas.ns.cloudflare.com|teagan.ns.cloudflare.com")
     * wenn ALLE NS-Hosts auf `.ns.cloudflare.com` enden — sonst null.
     * Cloudflare garantiert Pair-Eindeutigkeit pro Account, also taugt das
     * Pair als globaler Owner-Identifikator.
     */
    extractCloudflareNsPair(nsHosts: string[]): string | null {
        if (nsHosts.length === 0) return null;
        const cfHosts = nsHosts
            .map((h) => h.trim().toLowerCase().replace(/\.+$/, ""))
            .filter((h) => /\.ns\.cloudflare\.com$/.test(h));
        if (cfHosts.length === 0 || cfHosts.length !== nsHosts.length) return null;
        // Sortieren für deterministischen Pair-String — egal welche Reihenfolge
        // der Resolver liefert.
        const unique = [...new Set(cfHosts)].sort();
        if (unique.length < 2) return null;
        return unique.join("|");
    },

    async upsertNsPivot(input: NewDnsNsPivot): Promise<void> {
        await database
            .insert(dnsNsPivots)
            .values(input)
            .onConflictDoNothing();
    },

    /** Diagnose: alle bekannten Token-Type-Slugs für Reports/UIs. */
    knownVerificationTypes(): string[] {
        return TOKEN_MATCHERS.map((m) => m.idType);
    },
};
