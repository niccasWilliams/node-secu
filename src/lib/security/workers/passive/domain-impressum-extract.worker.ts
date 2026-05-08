// Sprint 2 #9 (OSINT-Engine, features.md §3.1 Mechanik #2/#11b/#11c/#11d) —
// Impressum-Crawler + DE-§5-Compliance-Audit + Cross-Domain-NER.
//
// Quellen:
//   - Crawl `/impressum`, `/imprint`, `/legal-notice`, `/legal`, `/kontakt`,
//     `/contact`, `/about`, `/datenschutz`, `/privacy`, `/datenschutzerklaerung`
//     (DE-Pflichtpfade lt. TMG §5 + DDG; englische Aliasse für DE-EN-Sites).
//   - Erst der Pfad mit Treffer (Status 200, HTML mit "Impressum"-Marker im Body
//     oder Meta-Title) wird vollständig geparst; weitere Pfade werden
//     übersprungen, um Unhöflichkeit gegenüber dem Ziel zu vermeiden.
//
// Capabilities:
//   - **Cloudflare-Email-Obfuscation Decoder** (Mechanik #11b, L1) via
//     `cf-email-decode.ts`. Live-Test fand Owner-Email NUR über diesen Pfad.
//   - **NER-light** (regex + Heuristiken) für Person-Namen (deutsche
//     Vertretungsformeln), Email, Telefon, Adresse, HRB-Nr, USt-IdNr.
//   - **Cross-Domain-Mentions** (Mechanik #11c) mit Provider-Filter
//     (`infrastructureProviderService.classifyDomain`) — Cloudflare/Google etc.
//     werden NICHT als Cross-Domain-Pivot gewertet.
//   - **DDG/TMG §5 Compliance-Audit** (Mechanik #11d, L11): Fehlende
//     Pflichtangaben → Findings der neuen Kategorie `compliance_imprint`.
//
// Provenance: Alle entdeckten Entities tragen `evidenceClass=organic` mit
// dem Original-Snippet aus dem Impressum-Body. confidenceContribution=0.6
// für Person/Org (Impressum ist starke Quelle, aber bei Holding-Strukturen
// ist die im Impressum genannte Person nicht zwingend Domain-Owner).
// confidenceContribution=0.85 für Email (Impressum-Email ist sehr eindeutig
// Owner-Email).

import { extractCloudflareEmails } from "../../osint/cf-email-decode";
import { httpFetch } from "../../osint/http-fetch";
import { infrastructureProviderService } from "../../osint/infrastructure-providers/provider.service";
import type {
    DiscoveredEntityDraft,
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

const CRAWL_PATHS = [
    "/impressum",
    "/imprint",
    "/legal-notice",
    "/legal",
    "/legal/imprint",
    "/de/impressum",
    "/en/imprint",
    "/kontakt",
    "/contact",
    "/about",
    "/about-us",
    "/datenschutz",
    "/datenschutzerklaerung",
    "/privacy",
    "/privacy-policy",
] as const;

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 800 * 1024;
const IMPRESSUM_MARKERS = [
    /impressum/i,
    /imprint/i,
    /angaben\s+gem(\.|äß)\s*§\s*5/i,
    /tmg\s*§\s*5/i,
    /legal\s+notice/i,
];

// Owner-Pflichtfelder TMG §5 / DDG §5 — fehlt eines davon, gibt's einen Finding.
interface ImpressumExtraction {
    sourceUrl: string;
    persons: string[];
    emails: string[];
    phones: string[];
    addresses: string[];
    hrbEntries: string[];
    ustIdEntries: string[];
    crossDomainMentions: string[];
    organizationName: string | null;
    bodyExcerpt: string;
}

export const domainImpressumExtractWorker: SecurityWorker = {
    jobKey: "domain_impressum_extract",
    requiredScope: "passive_only",
    description: "Crawl Impressum-Pfade + NER (Person/Email/Phone/Adresse/HRB/USt-IdNr) + Cross-Domain-Mentions + DDG/TMG-§5-Compliance-Audit.",
    defaultTimeoutMs: 60_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "domain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const target = ctx.target.value.toLowerCase().replace(/\.+$/, "");
        const findings: FindingDraft[] = [];
        const discovered: DiscoveredEntityDraft[] = [];
        const attempted: Array<{ url: string; status: number; matched: boolean; error?: string }> = [];

        let extraction: ImpressumExtraction | null = null;
        for (const path of CRAWL_PATHS) {
            if (ctx.abortSignal?.aborted) break;
            const url = `https://${target}${path}`;
            const res = await httpFetch<string>(url, {
                timeoutMs: FETCH_TIMEOUT_MS,
                signal: ctx.abortSignal,
                providerKey: "impressum_crawl",
                responseType: "text",
                maxRedirects: 5,
            });
            attempted.push({ url, status: res.status, matched: false, error: res.error });
            if (!res.success || !res.text) continue;
            const body = res.text.slice(0, MAX_BODY_BYTES);
            if (!IMPRESSUM_MARKERS.some((m) => m.test(body))) continue;
            attempted[attempted.length - 1].matched = true;
            extraction = await extract(target, url, body);
            break;
        }

        if (!extraction) {
            // Compliance-Finding: kein Impressum gefunden — DDG/TMG §5 verlangt es
            // für jede geschäftliche Website.
            findings.push({
                fingerprintInputs: ["compliance_imprint", "missing_imprint", target],
                severity: "medium",
                category: "compliance_imprint",
                title: "Kein Impressum gefunden",
                description: `Keine der Standard-Pfade (${CRAWL_PATHS.slice(0, 6).join(", ")}, ...) lieferte ein Impressum für ${target}. DE TMG §5 / DDG §5 verlangt für jede geschäftliche Website ein Impressum mit Pflichtangaben (Name + Anschrift + Email + Telefon + ggf. HRB/USt-IdNr).`,
                recommendation: "Impressum unter `/impressum` anlegen (oder gleichwertigem Pfad), Link aus dem Footer jeder Seite.",
                evidence: { attempted, target },
            });
            return {
                success: true,
                findings,
                discoveredEntities: [],
                rawOutput: { attempted, extraction: null },
                durationMs: Date.now() - start,
            };
        }

        // Compliance-Audit: §5-Pflichtfelder — was fehlt?
        const missing: string[] = [];
        if (extraction.persons.length === 0 && !extraction.organizationName) missing.push("Name (Vertretungsberechtigt oder Firmenname)");
        if (extraction.emails.length === 0) missing.push("Email-Adresse");
        if (extraction.phones.length === 0) missing.push("Telefonnummer");
        if (extraction.addresses.length === 0) missing.push("Postanschrift");
        // HRB/USt-IdNr nur wenn Gewerbe (heuristik via Organization mit Rechtsform).
        const hasLegalForm = !!extraction.organizationName && /\b(GmbH|UG|AG|KG|OHG|e\.K\.|GbR|SE)\b/i.test(extraction.organizationName);
        if (hasLegalForm && extraction.hrbEntries.length === 0) missing.push("HRB-Eintrag (für Gewerbeform)");

        if (missing.length > 0) {
            findings.push({
                fingerprintInputs: ["compliance_imprint", "incomplete_imprint", target, missing.join(",")],
                severity: missing.length >= 3 ? "medium" : "low",
                category: "compliance_imprint",
                title: `Impressum unvollständig: fehlt ${missing.length} Pflichtangabe(n)`,
                description: `DE TMG §5 / DDG §5 verlangt mindestens Name + Anschrift + Email + Telefon (+ HRB/USt-IdNr für Gewerbe). Auf ${extraction.sourceUrl} fehlen: ${missing.join("; ")}.`,
                recommendation: "Pflichtangaben ergänzen — insb. Telefon + ladungsfähige Anschrift + Vertretungsberechtigt.",
                evidence: { sourceUrl: extraction.sourceUrl, missing, snippet: extraction.bodyExcerpt },
            });
        }

        // Discovered Entities aus dem Impressum.
        for (const name of extraction.persons) {
            const emailHint = extraction.emails[0] ?? null;
            discovered.push({
                kind: "person",
                primaryValue: emailHint ?? name,
                displayName: name,
                discriminator: emailHint ? null : extraction.organizationName ?? target,
                data: {
                    sourceUrl: extraction.sourceUrl,
                    org: extraction.organizationName ?? null,
                    email: emailHint,
                    role: "impressum_listed",
                },
                relationshipToRoot: {
                    kind: "owns",
                    direction: "from_discovered_to_root",
                    confidence: 80,
                },
                source: "recon_impressum_ner",
                evidence: [{
                    source: "domain_impressum_extract:html_body",
                    snippet: `Person aus Impressum (${extraction.sourceUrl}): ${name}`,
                    confidenceContribution: 0.6,
                    evidenceClass: "organic",
                }],
            });
        }

        if (extraction.organizationName) {
            discovered.push({
                kind: "organization",
                primaryValue: extraction.organizationName,
                displayName: extraction.organizationName,
                data: {
                    sourceUrl: extraction.sourceUrl,
                    address: extraction.addresses[0] ?? null,
                    hrb: extraction.hrbEntries[0] ?? null,
                    ustId: extraction.ustIdEntries[0] ?? null,
                },
                relationshipToRoot: {
                    kind: "owns",
                    direction: "from_discovered_to_root",
                    confidence: 90,
                },
                source: "recon_impressum_ner",
                evidence: [{
                    source: "domain_impressum_extract:html_body",
                    snippet: `Organization aus Impressum: ${extraction.organizationName}`,
                    confidenceContribution: 0.7,
                    evidenceClass: "organic",
                }],
            });
        }

        for (const email of extraction.emails) {
            discovered.push({
                kind: "email_address",
                primaryValue: email,
                displayName: email,
                relationshipToRoot: {
                    kind: "owns_email",
                    direction: "from_root_to_discovered",
                    confidence: 90,
                },
                source: "recon_impressum_email",
                evidence: [{
                    source: "domain_impressum_extract:html_body",
                    snippet: `Email aus Impressum (${extraction.sourceUrl}): ${email}`,
                    confidenceContribution: 0.85,
                    evidenceClass: "organic",
                }],
            });
        }

        for (const phone of extraction.phones) {
            discovered.push({
                kind: "phone_number",
                primaryValue: phone,
                displayName: phone,
                relationshipToRoot: {
                    kind: "owns_phone",
                    direction: "from_root_to_discovered",
                    confidence: 85,
                },
                source: "recon_impressum_phone",
                evidence: [{
                    source: "domain_impressum_extract:html_body",
                    snippet: `Telefon aus Impressum (${extraction.sourceUrl}): ${phone}`,
                    confidenceContribution: 0.7,
                    evidenceClass: "organic",
                }],
            });
        }

        // Cross-Domain-Mentions — nur wenn keine bekannte Infrastructure-Domain.
        const filteredCrossDomains: Array<{ domain: string; isInfra: boolean }> = [];
        for (const cd of extraction.crossDomainMentions) {
            const cls = await infrastructureProviderService.classifyDomain(cd);
            filteredCrossDomains.push({ domain: cd, isInfra: cls.isInfra });
            if (cls.isInfra) continue;
            if (cd === target) continue;
            discovered.push({
                kind: "asset_domain",
                primaryValue: cd,
                displayName: cd,
                data: {
                    discoveredVia: "impressum_cross_mention",
                    sourceUrl: extraction.sourceUrl,
                    pivotRole: "pivot",
                },
                relationshipToRoot: {
                    kind: "linked_to",
                    direction: "from_root_to_discovered",
                    confidence: 60,
                },
                source: "recon_impressum_cross_domain",
                speculativeOverride: true,
                evidence: [{
                    source: "domain_impressum_extract:cross_domain",
                    snippet: `Cross-Domain im Impressum von ${target}: ${cd}`,
                    confidenceContribution: 0.4,
                    evidenceClass: "organic",
                }],
            });
        }

        return {
            success: true,
            findings,
            discoveredEntities: discovered,
            rawOutput: {
                sourceUrl: extraction.sourceUrl,
                attempted,
                personsFound: extraction.persons,
                emailsFound: extraction.emails,
                phonesFound: extraction.phones,
                addressesFound: extraction.addresses,
                hrbEntries: extraction.hrbEntries,
                ustIdEntries: extraction.ustIdEntries,
                organizationName: extraction.organizationName,
                crossDomainMentions: filteredCrossDomains,
                missingFields: missing,
            },
            durationMs: Date.now() - start,
        };
    },
};

async function extract(rootDomain: string, sourceUrl: string, html: string): Promise<ImpressumExtraction> {
    const text = htmlToText(html);
    return {
        sourceUrl,
        persons: extractPersons(text),
        emails: dedup([...extractEmails(text), ...extractCloudflareEmails(html).emails]),
        phones: extractPhones(text),
        addresses: extractAddresses(text),
        hrbEntries: extractHrb(text),
        ustIdEntries: extractUstId(text),
        crossDomainMentions: extractCrossDomains(text, rootDomain),
        organizationName: extractOrganization(text),
        bodyExcerpt: text.slice(0, 1200),
    };
}

function htmlToText(html: string): string {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#x?[0-9a-f]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function dedup(arr: string[]): string[] {
    return [...new Set(arr)];
}

function extractEmails(text: string): string[] {
    const re = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
    const out = new Set<string>();
    for (const m of text.matchAll(re)) {
        const e = m[0].toLowerCase();
        // Plausibilitätscheck — keine Bilddateien (ein häufiger Filename-Match).
        if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e)) continue;
        out.add(e);
    }
    return [...out];
}

function extractPhones(text: string): string[] {
    const out = new Set<string>();
    // International (DE/AT/CH) + nationale Formate. Bewusst konservativ
    // (mind. 9 Ziffern Pflicht), sonst kommen UStId/HRB-Nummern als "Telefon" rein.
    const patterns = [
        // +49 30 12345678 / +49 (0) 30 12345 / 0049 30 …
        /\+49\s*\(?0?\)?\s*\d{2,5}\s*[-\/.\s]?\s*\d{3,}\s*[-\/.\s]?\s*\d{2,}/g,
        /\+\d{1,3}\s*\(?\d{1,4}\)?\s*[-\/.\s]?\d{3,}\s*[-\/.\s]?\d{3,}/g,
        // 030 1234567 / 0511-1234567 — DE-Inland mit führender 0
        /\b0\d{2,4}\s*[-\/.\s]\s*\d{4,}\b/g,
    ];
    for (const re of patterns) {
        for (const m of text.matchAll(re)) {
            const cleaned = m[0].replace(/\s+/g, " ").trim();
            if (cleaned.replace(/\D/g, "").length >= 9) out.add(cleaned);
        }
    }
    return [...out];
}

// Street-Endungen, an denen der Straßenname endet. Suffix-Match (case-insensitive,
// am Ende eines einzelnen Tokens). "bleiche" für "Große Bleiche", "tor" für
// "Brandenburger Tor", etc.
const STREET_SUFFIXES = /(?:stra(?:ß|ss)e|weg|allee|platz|ring|gasse|damm|ufer|bleiche|markt|hof|chaussee|tor|str\.?)$/i;
const STREET_PREFIXES = /^(?:Am|Im|An\s+der|Zur|Auf\s+dem|In\s+der|Beim|Vor\s+dem)$/i;

function extractAddresses(text: string): string[] {
    const out = new Set<string>();
    // Strategie: PLZ + Ort als Anker (5 Ziffern + 1-2 capitalized Tokens),
    // dann RÜCKWÄRTS Hausnummer + Straße aus dem Vorspann picken.
    // Vorteil: keine Vorspann-Verwirrung mit Vor-/Nachnamen.
    const re = /(\d{1,4}[a-zA-Z]?(?:\s*-\s*\d{1,4}[a-zA-Z]?)?)\s*,?\s*(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+)?)/g;
    for (const m of text.matchAll(re)) {
        const houseNo = m[1];
        const plz = m[2];
        const cityRaw = m[3].trim();
        // Trailing Tokens abschneiden, die typische Impressum-Labels sind
        // (z.B. "Mainz Vertreten" → "Mainz"). PERSON_STOP_WORDS deckt das ab.
        const cityTokens: string[] = [];
        for (const t of cityRaw.split(/\s+/)) {
            if (PERSON_STOP_WORDS.has(t.toLowerCase())) break;
            cityTokens.push(t);
        }
        if (cityTokens.length === 0) continue;
        const city = cityTokens.join(" ");
        // Vorspann vor der Hausnummer = Straße. Rückwärts max 4 Tokens
        // (mehrwortige Straßen wie "Friedrich-Ebert-Anlage", "Große Bleiche").
        const before = text.slice(0, m.index ?? 0).trim();
        const tokens = before.split(/\s+/).slice(-4);
        // Nimm die LETZTE Token-Sequenz, die ein Street-Suffix oder -Prefix matched.
        let bestStart = -1;
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (STREET_SUFFIXES.test(tokens[i])) { bestStart = i; break; }
        }
        if (bestStart === -1) {
            // Kein Suffix-Match — versuche Prefix ("Am Markt", "Im Tal").
            for (let i = 0; i < tokens.length - 1; i++) {
                const phrase = tokens.slice(i).join(" ");
                if (STREET_PREFIXES.test(phrase)) { bestStart = i; break; }
            }
        }
        if (bestStart === -1) continue;
        // Straße kann Adjektiv-Prefix haben ("Große Bleiche", "Lange Reihe").
        // Erweitere bestStart um 1 wenn das Token davor ein Adjektiv-Capitalized ist.
        if (bestStart > 0 && /^[A-ZÄÖÜ]/.test(tokens[bestStart - 1])) {
            const candidate = tokens[bestStart - 1];
            // Nur erweitern wenn der Token kein typischer Vor-/Nachname-Marker ist
            // (Heuristik: Adjektive enden oft auf -e, -er, -en, -es).
            if (/(?:e|er|en|es|che|er|tes|ges)$/i.test(candidate) || /^Am$|^An$|^Im$/i.test(candidate)) {
                bestStart -= 1;
            }
        }
        const street = tokens.slice(bestStart).join(" ");
        out.add(`${street} ${houseNo}, ${plz} ${city}`);
    }
    return [...out];
}

function extractHrb(text: string): string[] {
    const out = new Set<string>();
    // HRB / HRA <Nummer> meist mit Amtsgericht-Prefix.
    const re = /(?:HRB|HRA)\s*[:#]?\s*(\d{2,8})/gi;
    for (const m of text.matchAll(re)) out.add(m[0].toUpperCase().replace(/\s+/g, " ").trim());
    return [...out];
}

function extractUstId(text: string): string[] {
    const out = new Set<string>();
    // DE: USt-IdNr DE\d{9}. AT: ATU + 8. CH: CHE-...
    const patterns = [
        /\bDE\s?\d{9}\b/g,
        /\bATU\s?\d{8}\b/g,
        /\bCHE-\s?\d{3}\.\d{3}\.\d{3}\b/g,
    ];
    for (const re of patterns) {
        for (const m of text.matchAll(re)) out.add(m[0].replace(/\s+/g, "").toUpperCase());
    }
    return [...out];
}

// Stop-Wörter, an denen der Person-Capture endet (typische Impressum-Labels
// die direkt an einen Namen anschließen, z.B. "Vertreten durch: Niclas Pilz Kontakt E-Mail: …").
const PERSON_STOP_WORDS = new Set([
    "kontakt", "email", "e-mail", "mail", "telefon", "tel", "tel.", "fax",
    "web", "www", "adresse", "anschrift", "verantwortlich", "vertreten",
    "vertretungsberechtigt", "geschäftsführer", "geschaeftsfuehrer",
    "inhaber", "inhaberin", "umsatzsteuer", "ust-idnr", "ustidnr",
    "registergericht", "registernummer", "hrb", "hra", "haftung", "haftungsausschluss",
    "datenschutz", "datenschutzbeauftragter", "berufsbezeichnung", "verbraucherstreitbeilegung",
    "streitschlichtung", "online-streitbeilegung", "online", "url",
]);

function extractPersons(text: string): string[] {
    const out = new Set<string>();
    // Deutsche Vertretungs-Formeln liefern hochpräzise Person-Namen.
    // "Vertretungsberechtigt(er Geschäftsführer)?: Niclas Pilz"
    // "Vertreten durch: Niclas Pilz"
    // "Geschäftsführer: Niclas Pilz" / "Geschäftsführerin: …"
    // "Inhaber(in)?: Niclas Pilz"
    // "Verantwortlich(er)? (im Sinne des § 18 MStV)?: Niclas Pilz"
    //
    // Capture greedy bis zu 5 Tokens, dann nachträglich Stop-Words abschneiden.
    const re = /(?:vertreten\s+durch|vertretungsberechtigt(?:er?)?(?:\s+gesch[äa]ftsf[üu]hrer(?:in)?)?|gesch[äa]ftsf[üu]hrer(?:in)?|inhaber(?:in)?|verantwortlich(?:er?)?(?:\s+im\s+sinne[^:]+)?)\s*[:\-–]\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-]+){1,5})/gi;
    for (const m of text.matchAll(re)) {
        const raw = m[1].trim().replace(/\s+/g, " ");
        const tokens: string[] = [];
        for (const t of raw.split(/\s+/)) {
            if (PERSON_STOP_WORDS.has(t.toLowerCase())) break;
            tokens.push(t);
        }
        if (tokens.length < 2 || tokens.length > 4) continue;
        const last = tokens[tokens.length - 1];
        if (/^(gmbh|ug|ag|kg|ohg|gbr|se)$/i.test(last)) continue;
        out.add(tokens.join(" "));
    }
    return [...out];
}

function extractOrganization(text: string): string | null {
    // Heuristik: Erste Zeile mit Rechtsform-Suffix nach den Worten "Impressum"
    // / "Angaben gem. §5". Bewusst tolerant.
    const block = text.slice(0, 2500);
    const re = /([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.\-&\s]{2,80}\s+(?:GmbH(?:\s*&\s*Co\.\s*KG)?|UG\s*\(haftungsbeschr[äa]nkt\)|UG|AG|KG|OHG|e\.K\.|e\.V\.|GbR|SE))\b/g;
    const matches = [...block.matchAll(re)];
    if (matches.length === 0) return null;
    return matches[0][1].replace(/\s+/g, " ").trim();
}

function extractCrossDomains(text: string, rootDomain: string): string[] {
    const out = new Set<string>();
    const re = /\b((?:[a-z0-9][a-z0-9-]{0,62}\.)+[a-z]{2,24})\b/gi;
    for (const m of text.matchAll(re)) {
        const cd = m[1].toLowerCase();
        if (cd === rootDomain) continue;
        if (cd.endsWith(`.${rootDomain}`)) continue;
        // Ignoriere offensichtliche Generic-TLD-Mentions ohne SLD (sollte regex eh ausschließen).
        if (cd.split(".").length < 2) continue;
        // Ignoriere offensichtliche False-Positives — Email-Domain leak (steht auch separat im Email-Set).
        if (/^(gmail|hotmail|yahoo|outlook|icloud|t-online|web|gmx|googlemail)\.[a-z.]+$/i.test(cd)) continue;
        out.add(cd);
    }
    return [...out];
}
