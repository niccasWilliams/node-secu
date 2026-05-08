// Sprint 3 (OSINT-Engine, features.md §3.3 #29a + Live-Test L13) — Brand-Variant-Helper.
//
// Liefert plausible Username-/Login-Suchstrings aus einer Quelle (SLD, Personen-
// Name, Firmen-Name, vorab bekannter Username). Wird von `domain_github_brand`
// konsumiert; perspektivisch auch von Sprint 7 npm/Mastodon/Bluesky-Workern.
//
// Bewusst kompakt: GitHub-Search-Quota ist 30/min auch mit Token. Wir wollen 5-8
// Queries/Domain, keine Variant-Explosion. Suffix-Listen sind bewusst klein.
//
// Public-Suffix-Awareness: kleine, harte Liste der DACH-/global-relevanten
// Multi-Label-TLDs. Reicht für den Customer-Cut DE-B2B-KMU; psl-Lib wäre
// Overengineering bis Sprint 5+ neue Cross-Domain-Anwendungen entstehen.
//
// Live-Test-Validierung: niccaswilliams.com → SLD "niccaswilliams" → exact-match
// gegen GitHub-User `niccasWilliams` (id 156859625). Genau dieser Pfad muss live
// bleiben und ist der Smoke-Anker der Sprint-3-Worker.

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
    "co.uk",
    "co.nz",
    "co.za",
    "co.jp",
    "co.in",
    "com.au",
    "com.br",
    "com.de",
    "com.mx",
    "com.tr",
    "com.cn",
    "or.at",
    "or.jp",
    "ne.jp",
    "ac.uk",
    "ac.at",
    "gov.uk",
]);

/**
 * Extrahiert das SLD aus einem Apex- oder Subdomain-Hostnamen.
 * Beispiele:
 *   "niccaswilliams.com"  → "niccaswilliams"
 *   "ACME.de"             → "acme"
 *   "shop.acme.co.uk"     → "acme"
 *   "x"                   → null  (kein TLD)
 */
export function extractSld(host: string): string | null {
    const lower = host.trim().toLowerCase();
    if (!lower || !lower.includes(".")) return null;
    const labels = lower.split(".");
    if (labels.length < 2) return null;

    const lastTwo = labels.slice(-2).join(".");
    if (labels.length >= 3 && MULTI_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
        return labels[labels.length - 3] || null;
    }
    return labels[labels.length - 2] || null;
}

/**
 * Slug-Normalisierung für freie Strings (Personen-/Firmen-Namen).
 *   "Niclas Pilz"          → "niclas pilz"
 *   "Foundry GmbH & Co."   → "foundry gmbh"
 *   "Müller & Söhne"       → "muller sohne"
 */
export function normalizeFreeText(input: string): string {
    return input
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ß/g, "ss")
        .toLowerCase()
        // Drop common Rechtsform-Suffixe — sonst tauchen sie als Username-Token auf.
        .replace(/\b(gmbh|ug|kg|ag|e\.k\.|ev|gbr|ohg|ltd|llc|inc|co|corp)\b\.?/g, " ")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Variants für GitHub-Login-Suchen aus einem SLD.
 * Maximal 4 Stück, weil wir pro Engagement diszipliniert mit der 30/min-Quota
 * umgehen müssen. Reihenfolge = Confidence-Reihenfolge (höchster zuerst).
 */
export function sldVariants(sld: string): string[] {
    const out = new Set<string>();
    const base = sld.toLowerCase().trim();
    if (!base) return [];
    out.add(base);
    if (base.includes("-")) out.add(base.replace(/-/g, ""));
    return [...out].slice(0, 4);
}

/**
 * Variants für Personen-Namen ("Niclas Pilz" → mehrere plausible Logins).
 * Bewusst klein: 4 Variants reichen für die übliche solo/Kleinteam-Heuristik.
 */
export function personNameVariants(fullName: string): string[] {
    const norm = normalizeFreeText(fullName);
    if (!norm) return [];
    const tokens = norm.split(" ").filter((t) => t.length > 0);
    if (tokens.length === 0) return [];

    const out = new Set<string>();
    if (tokens.length === 1) {
        out.add(tokens[0]);
    } else {
        const first = tokens[0];
        const last = tokens[tokens.length - 1];
        out.add(`${first}${last}`);          // niclaspilz
        out.add(`${first}-${last}`);         // niclas-pilz
        out.add(`${first[0]}${last}`);       // npilz
        out.add(`${first}.${last}`);         // niclas.pilz
    }
    return [...out].slice(0, 4);
}

/**
 * Variants für Firmen-Namen ("Geile Mukke" → "geilemukke", "geile-mukke").
 * Maximal 3 — bei mehr als zwei Tokens nehmen wir nur das erste/letzte Bigram,
 * sonst werden die Queries inflationär.
 */
export function companyNameVariants(company: string): string[] {
    const norm = normalizeFreeText(company);
    if (!norm) return [];
    const tokens = norm.split(" ").filter((t) => t.length > 0);
    if (tokens.length === 0) return [];

    const compact = tokens.join("");
    const dashed = tokens.join("-");
    const out = new Set<string>();
    out.add(compact);
    if (compact !== dashed) out.add(dashed);
    if (tokens.length >= 2 && tokens[0].length >= 3) out.add(tokens[0]);
    return [...out].slice(0, 3);
}
