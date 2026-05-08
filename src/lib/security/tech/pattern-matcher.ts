// Tech-Pattern-Matcher — Phase 5.
//
// Nimmt eine Pattern-DB + ein zerlegtes Web-Response-Set und liefert TechDrafts.
// Implies-Relations werden transitiv aufgelöst (Next.js implies React →
// React-Match wird mitgeneriert, sofern nicht bereits höher-confident gematched).
//
// Der Matcher ist absichtlich pure: kein I/O, kein Network, keine DB. Damit
// kann er trivial unit-testet werden.

import type { TechDraft } from "../workers/worker.types";
import type {
    HeaderPattern,
    HtmlPattern,
    PatternRule,
    TechPatternSpec,
} from "./patterns";
import { TECH_PATTERNS } from "./patterns";

export interface ResponseSnapshot {
    /** URL der Response (für evidence). */
    url: string;
    /** HTML-Body (truncated to maxBytes — siehe Worker). */
    html: string;
    /** Headers, lowercased keys. */
    headers: Record<string, string>;
    /** Cookie-Names aus Set-Cookie (case-preserved). */
    cookieNames: string[];
    /** `<script src="...">` URLs aus dem Body. */
    scriptSrcs: string[];
    /** Inhalt des `<meta name="generator" content="...">`-Tags, falls vorhanden. */
    metaGenerator: string | null;
}

export interface MatchedTech {
    name: string;
    displayName: string;
    category: TechPatternSpec["category"];
    version?: string;
    confidence: "high" | "medium" | "low";
    /** Welche Pattern-Quellen haben gematched (z.B. ["html", "scriptSrc"]). */
    matchedVia: string[];
    /** Beweise pro Source — wird zur entity.evidence durchgereicht. */
    evidence: Record<string, unknown>;
    /** True wenn dieser Match transitiv aus implies kommt. */
    fromImplies?: boolean;
}

/** Pattern-DB durchlaufen + alle Matches sammeln. */
export function matchTechPatterns(
    snapshot: ResponseSnapshot,
    patterns: TechPatternSpec[] = TECH_PATTERNS,
): MatchedTech[] {
    const out = new Map<string, MatchedTech>();

    for (const spec of patterns) {
        const matched = matchOne(spec, snapshot);
        if (matched) out.set(spec.name, matched);
    }

    // Implies-Resolution — transitiv. Implied tech gets confidence=low,
    // weil es ein abgeleitetes Signal ist, kein direkter Match.
    const queue = [...out.values()];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        const spec = patterns.find((p) => p.name === cur.name);
        if (!spec?.implies) continue;
        for (const implied of spec.implies) {
            if (out.has(implied)) continue;
            const impliedSpec = patterns.find((p) => p.name === implied);
            if (!impliedSpec) continue;
            const m: MatchedTech = {
                name: impliedSpec.name,
                displayName: impliedSpec.displayName,
                category: impliedSpec.category,
                confidence: "low",
                matchedVia: [`implied_by:${cur.name}`],
                evidence: { impliedFrom: cur.name },
                fromImplies: true,
            };
            out.set(implied, m);
            queue.push(m);
        }
    }

    return [...out.values()];
}

/** Versucht alle Pattern-Quellen einer Tech und merged das Ergebnis. */
function matchOne(spec: TechPatternSpec, snap: ResponseSnapshot): MatchedTech | null {
    const matchedVia: string[] = [];
    const evidence: Record<string, unknown> = {};
    const confidences: PatternRule["confidence"][] = [];
    let version: string | undefined;

    if (spec.html) {
        for (const p of spec.html) {
            const m = snap.html.match(p.regex);
            if (m) {
                matchedVia.push("html");
                evidence.html = { pattern: p.regex.source, match: m[0].slice(0, 200) };
                confidences.push(p.confidence);
                if (p.versionGroup != null && m[p.versionGroup]) version = version ?? m[p.versionGroup];
                break; // first match per source
            }
        }
    }

    if (spec.headers) {
        for (const p of spec.headers) {
            const m = matchHeader(p, snap.headers);
            if (m) {
                matchedVia.push("header");
                evidence.header = { name: p.name, value: m.value };
                confidences.push(p.confidence);
                if (p.versionGroup != null && m.version) version = version ?? m.version;
                break;
            }
        }
    }

    if (spec.cookies) {
        for (const p of spec.cookies) {
            if (snap.cookieNames.includes(p.name)) {
                matchedVia.push("cookie");
                evidence.cookie = { name: p.name };
                confidences.push(p.confidence);
                break;
            }
        }
    }

    if (spec.scriptSrc) {
        for (const p of spec.scriptSrc) {
            for (const src of snap.scriptSrcs) {
                const m = src.match(p.regex);
                if (m) {
                    matchedVia.push("scriptSrc");
                    evidence.scriptSrc = { src, pattern: p.regex.source };
                    confidences.push(p.confidence);
                    if (p.versionGroup != null && m[p.versionGroup]) version = version ?? m[p.versionGroup];
                    break;
                }
            }
            if (matchedVia.includes("scriptSrc")) break;
        }
    }

    if (spec.metaGenerator && snap.metaGenerator) {
        for (const p of spec.metaGenerator) {
            const m = snap.metaGenerator.match(p.regex);
            if (m) {
                matchedVia.push("metaGenerator");
                evidence.metaGenerator = { content: snap.metaGenerator };
                confidences.push(p.confidence);
                if (p.versionGroup != null && m[p.versionGroup]) version = version ?? m[p.versionGroup];
                break;
            }
        }
    }

    if (matchedVia.length === 0) return null;

    return {
        name: spec.name,
        displayName: spec.displayName,
        category: spec.category,
        version,
        confidence: bestConfidence(confidences),
        matchedVia,
        evidence,
    };
}

function matchHeader(
    pattern: HeaderPattern,
    headers: Record<string, string>,
): { value: string; version?: string } | null {
    const v = headers[pattern.name.toLowerCase()];
    if (v == null) return null;
    if (!pattern.valueRegex) return { value: v };
    const m = v.match(pattern.valueRegex);
    if (!m) return null;
    const version = pattern.versionGroup != null ? m[pattern.versionGroup] : undefined;
    return { value: v, version };
}

function bestConfidence(c: PatternRule["confidence"][]): PatternRule["confidence"] {
    if (c.includes("high")) return "high";
    if (c.includes("medium")) return "medium";
    return "low";
}

/**
 * Mappt MatchedTech in TechDraft (Persistenz-Format).
 * `wappalyzer` als detectionSource ist im Schema gewhitelistet (siehe TechDraft).
 */
export function toTechDrafts(matched: MatchedTech[]): TechDraft[] {
    return matched.map((m) => ({
        techName: m.name,
        version: m.version,
        detectionSource: "wappalyzer",
        confidence: m.confidence,
        evidence: {
            displayName: m.displayName,
            category: m.category,
            matchedVia: m.matchedVia,
            ...m.evidence,
            ...(m.fromImplies ? { fromImplies: true } : {}),
        },
    }));
}

export interface TechStructuredSlots {
    frontend: { name: string; version?: string; confidence: string } | null;
    backend: { name: string; version?: string; confidence: string } | null;
    cms: { name: string; version?: string; confidence: string } | null;
    edge: { name: string; version?: string; confidence: string } | null;
    web_server: { name: string; version?: string; confidence: string } | null;
    language: { name: string; version?: string; confidence: string } | null;
    /** Alle weiteren Treffer in flacher Liste (analytics, auth, build_tool, db_hint). */
    other: Array<{ name: string; version?: string; category: string; confidence: string }>;
}

/**
 * Slot-orientierte Sicht auf die Matches — direkter Input für Phase-6-Conditions
 * ("entity.data.techStructured.frontend.name == 'next.js'").
 *
 * Pro Slot wird der confidence-stärkste Match gewählt; bei Gleichstand bevorzugt
 * Direkt-Match vor Implies-Match. Mehrere Treffer im gleichen Slot
 * (z.B. nginx + apache → cache-fronted) bedeuten Konflikt → höhere Confidence
 * gewinnt.
 */
export function buildStructuredSlots(matched: MatchedTech[]): TechStructuredSlots {
    const out: TechStructuredSlots = {
        frontend: null,
        backend: null,
        cms: null,
        edge: null,
        web_server: null,
        language: null,
        other: [],
    };
    const order: Record<string, number> = { high: 3, medium: 2, low: 1 };

    for (const m of matched) {
        const slot = m.category;
        const projection = { name: m.name, version: m.version, confidence: m.confidence };
        if (slot === "frontend" || slot === "backend" || slot === "cms" || slot === "edge" || slot === "web_server" || slot === "language") {
            const cur = out[slot];
            if (cur == null) {
                out[slot] = projection;
                continue;
            }
            // Höhere Confidence übersteuert.
            if (order[m.confidence] > order[cur.confidence]) {
                out[slot] = projection;
                continue;
            }
            // Gleiche Confidence: Direktmatch schlägt Implies.
            if (order[m.confidence] === order[cur.confidence] && !m.fromImplies && cur.confidence === m.confidence) {
                out[slot] = projection;
            }
        } else {
            out.other.push({ name: m.name, version: m.version, category: m.category, confidence: m.confidence });
        }
    }
    return out;
}
