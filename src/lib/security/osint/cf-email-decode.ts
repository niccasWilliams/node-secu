// Sprint 1.5 (OSINT-Engine, features.md L1 / Mechanik #11b / R6) — Cloudflare
// Email-Obfuscation Decoder.
//
// Cloudflare's Email-Protect-Feature ersetzt JEDES `<a href="mailto:…">…</a>`
// auf einer geschützten Seite durch:
//
//   <a href="/cdn-cgi/l/email-protection#abcdef…"
//      data-cfemail="abcdef…"
//      class="__cf_email__">[email&#160;protected]</a>
//
// Der `data-cfemail`/Hash-Wert ist eine Hex-Sequenz: byte0 = XOR-Key,
// byte1..n = `email[i] XOR key` (single-byte XOR). Decoder ist 5 Zeilen.
//
// Live-Test 2026-05-08 (orvello.de) fand `support@orvello.de` 6× über genau diesen
// Mechanismus — ohne Decoder ist der Impressum-Crawl auf CF-geschützten Domains
// effektiv blind für Owner-Emails. Pflicht-Capability für jeden HTML-Crawler.
//
// Es werden ZWEI Quellen geparst:
//   - `data-cfemail="HEX"`-Attribute (klassisch im HTML-Body)
//   - `/cdn-cgi/l/email-protection#HEX`-Hrefs (manchmal von Cloudflare als
//     Hash-Suffix gerendert, z.B. wenn JS-Auto-Decode greift und den Originalton
//     im href belässt)

const CFEMAIL_DATA_ATTR = /\bdata-cfemail\s*=\s*["']?([0-9a-f]{4,})["']?/gi;
const CFEMAIL_HREF = /\/cdn-cgi\/l\/email-protection#([0-9a-f]{4,})/gi;

/** Decoded eine einzelne Cloudflare-Hex-Sequenz; null wenn invalid. */
export function decodeCfemail(hex: string): string | null {
    const cleaned = hex.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(cleaned) || cleaned.length < 4 || cleaned.length % 2 !== 0) return null;
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
        bytes.push(parseInt(cleaned.substr(i, 2), 16));
    }
    const key = bytes[0];
    const decoded: string[] = [];
    for (let i = 1; i < bytes.length; i++) {
        decoded.push(String.fromCharCode(bytes[i] ^ key));
    }
    const email = decoded.join("");
    // Plausibilitäts-Check — nicht jeder Hex-String ist eine Email.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return null;
    return email.toLowerCase();
}

export interface CfEmailExtractResult {
    /** Eindeutige decoded Emails, lowercased + trimmed. */
    emails: string[];
    /** Roh-Treffer-Anzahl (auch dupliziert + invalid) — Diagnose-Telemetrie. */
    rawMatchCount: number;
    /** Wie oft die invalid-Heuristik einen Hex-Block verworfen hat. */
    invalidMatchCount: number;
}

/**
 * Findet ALLE `data-cfemail="…"`- und `/cdn-cgi/l/email-protection#…`-Hits
 * in einem HTML-Body, decoded sie und gibt eindeutige Emails zurück.
 */
export function extractCloudflareEmails(html: string): CfEmailExtractResult {
    const emails = new Set<string>();
    let raw = 0;
    let invalid = 0;
    if (!html) return { emails: [], rawMatchCount: 0, invalidMatchCount: 0 };

    const tryAdd = (hex: string): void => {
        raw += 1;
        const decoded = decodeCfemail(hex);
        if (decoded) emails.add(decoded);
        else invalid += 1;
    };

    let m: RegExpExecArray | null;
    while ((m = CFEMAIL_DATA_ATTR.exec(html)) != null) tryAdd(m[1]);
    while ((m = CFEMAIL_HREF.exec(html)) != null) tryAdd(m[1]);

    return { emails: [...emails], rawMatchCount: raw, invalidMatchCount: invalid };
}
