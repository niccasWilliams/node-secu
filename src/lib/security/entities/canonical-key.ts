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
    return input.trim().toLowerCase();
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
        default:
            return v.toLowerCase();
    }
}
