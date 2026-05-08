// canonical-key — normalisiert Entity-Identifier auf eine deterministische Form,
// damit `(kind, canonical_key)` als globaler Dedup-Schlüssel funktioniert.

import crypto from "node:crypto";
import type { EntityKind } from "@/db/individual/individual-schema";

function stripTrailingDot(s: string) {
    return s.endsWith(".") ? s.slice(0, -1) : s;
}

function normalizeDomain(input: string): string {
    return stripTrailingDot(input.trim().toLowerCase());
}

function normalizeUrl(input: string): string {
    try {
        const u = new URL(input.trim());
        u.hostname = u.hostname.toLowerCase();
        // strip default port + trailing slash on path-empty
        if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
            u.port = "";
        }
        let s = u.toString();
        if (u.pathname === "/" && !u.search && !u.hash) s = s.replace(/\/$/, "");
        return s;
    } catch {
        return input.trim().toLowerCase();
    }
}

function normalizeIp(input: string): string {
    return input.trim();
}

function normalizeEmail(input: string): string {
    const lower = input.trim().toLowerCase();
    // gmail/googlemail-Equivalence: einzige hartcodierte Provider-Aliasing-Regel.
    // Plus-Adressen (foo+tag@gmail.com) bleiben bewusst eigene Entities (kind=email_address)
    // und werden später via entity_relationships kind="alias_of" verlinkt.
    return lower.replace(/@googlemail\.com$/, "@gmail.com");
}

function normalizeUsername(input: string): string {
    // Plattform-agnostisch: lowercased + getrimmt. Plattform-spezifische Quirks
    // (Twitter erlaubt _, GitHub nicht; Instagram dots; ...) werden NICHT hier
    // normalisiert — wir halten die canonical-key bewusst lossy-konservativ und
    // dedupen erst auf social_account-Ebene mit {platform}:{handle}.
    return input.trim().toLowerCase();
}

function normalizePhoneE164(input: string): string {
    // Erwartet bereits E.164 oder lokal — phone_normalize-Worker bereitet auf.
    // Hier nur trim + Whitespace raus, alles andere lassen wir dem Worker.
    const cleaned = input.trim().replace(/[\s\-().]/g, "");
    return cleaned.startsWith("+") ? cleaned : cleaned;
}

function normalizeSocial(input: string, discriminator: string | null | undefined): string {
    // primaryValue = handle, discriminator = platform
    const handle = input.trim().toLowerCase();
    const platform = (discriminator ?? "unknown").trim().toLowerCase();
    return `${platform}:${handle}`;
}

function fallbackHash(input: string): string {
    return crypto.createHash("sha256").update(input.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export type CanonicalKeyInput = {
    kind: EntityKind;
    /** Primärer Identifier — Domain, IP, URL, Email, Org-Name etc. */
    primaryValue: string;
    /** Optional: zusätzlicher Diskriminator, falls primaryValue nicht eindeutig (z.B. Personen-Name + Org). */
    discriminator?: string | null;
};

/**
 * Erzeugt den canonical_key für eine Entity. Kind-spezifisch normalisiert.
 * Idempotent: gleiche logische Identität → gleicher Key.
 */
export function buildCanonicalKey({ kind, primaryValue, discriminator }: CanonicalKeyInput): string {
    const v = primaryValue.trim();
    if (!v) throw new Error("canonical_key: primaryValue must not be empty");

    switch (kind) {
        case "asset_domain":
        case "asset_subdomain":
        case "asset_host":
            return normalizeDomain(v);
        case "asset_url":
            return normalizeUrl(v);
        case "asset_ip":
            return normalizeIp(v);
        case "person": {
            // Bevorzugt: Email — eindeutig genug. Sonst Name+Org als Hash.
            if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return normalizeEmail(v);
            const composite = discriminator ? `${v}||${discriminator}` : v;
            return `name:${fallbackHash(composite)}`;
        }
        case "organization":
            return v.toLowerCase();
        case "location":
            return v.toLowerCase();
        case "credential_ref":
            return fallbackHash(discriminator ? `${v}||${discriminator}` : v);
        case "document":
            return fallbackHash(discriminator ? `${v}||${discriminator}` : v);
        case "email_address":
            return normalizeEmail(v);
        case "username":
            return normalizeUsername(v);
        case "phone_number":
            return normalizePhoneE164(v);
        case "social_account":
            return normalizeSocial(v, discriminator);
        case "infrastructure_provider":
            // Sprint 1.7: canonical-key ist "provider:<provider.key>" — der Service
            // baut den value bewusst so, damit ein Provider engagement-übergreifend
            // exakt eine Entity-Zeile hat.
            return v.trim().toLowerCase();
        default:
            return v.toLowerCase();
    }
}
