// Tech-Pattern-Matcher — Unit Tests gegen einen Goldstandard-Set kuratierter
// Response-Snapshots. Phase 5 (FULL_SCAN.md §Phase 5 DoD: 90%+ correct
// frontend+backend identification auf 20 manuell gelabelten Targets).
//
// Diese Tests decken erstmal die "happy path"-Detection-Klassen ab — der
// echte Goldstandard-Set wandert in Phase 5 v2 in eine separate Fixture-Datei.

import {
    buildStructuredSlots,
    matchTechPatterns,
    type ResponseSnapshot,
} from "@/lib/security/tech/pattern-matcher";

function snap(partial: Partial<ResponseSnapshot>): ResponseSnapshot {
    return {
        url: "https://example.com",
        html: "",
        headers: {},
        cookieNames: [],
        scriptSrcs: [],
        metaGenerator: null,
        ...partial,
    };
}

describe("matchTechPatterns — frontend frameworks", () => {
    it("Next.js — html marker + script-src + cookie", () => {
        const out = matchTechPatterns(snap({
            html: '<div id="__next"><div id="__NEXT_DATA__">…</div></div>',
            scriptSrcs: ["/_next/static/chunks/main.js"],
            cookieNames: ["next-auth.session-token"],
        }));
        const next = out.find((m) => m.name === "next.js");
        expect(next).toBeDefined();
        expect(next!.confidence).toBe("high");
        expect(next!.matchedVia).toContain("html");
        expect(next!.matchedVia).toContain("scriptSrc");
        // Implies React
        expect(out.find((m) => m.name === "react" && m.fromImplies)).toBeDefined();
    });

    it("Astro — meta-generator with version", () => {
        const out = matchTechPatterns(snap({
            metaGenerator: "Astro v4.5.2",
        }));
        const astro = out.find((m) => m.name === "astro");
        expect(astro).toBeDefined();
        expect(astro!.version).toBe("4.5.2");
        expect(astro!.confidence).toBe("high");
    });

    it("Hugo — meta-generator", () => {
        const out = matchTechPatterns(snap({
            metaGenerator: "Hugo 0.124.1",
        }));
        const hugo = out.find((m) => m.name === "hugo");
        expect(hugo).toBeDefined();
        expect(hugo!.version).toBe("0.124.1");
    });

    it("Angular — ng-version attribute carries version", () => {
        const out = matchTechPatterns(snap({
            html: '<app-root ng-version="17.0.5"></app-root>',
        }));
        const ng = out.find((m) => m.name === "angular");
        expect(ng).toBeDefined();
        expect(ng!.version).toBe("17.0.5");
    });
});

describe("matchTechPatterns — backend / cms", () => {
    it("Express — connect.sid cookie + powered-by", () => {
        const out = matchTechPatterns(snap({
            cookieNames: ["connect.sid"],
            headers: { "x-powered-by": "Express" },
        }));
        const ex = out.find((m) => m.name === "express");
        expect(ex).toBeDefined();
        expect(ex!.confidence).toBe("high");
        // Implies node.js
        expect(out.find((m) => m.name === "node.js")).toBeDefined();
    });

    it("WordPress — meta-generator + html link", () => {
        const out = matchTechPatterns(snap({
            html: '<link rel="stylesheet" href="https://example.com/wp-content/themes/twenty/style.css">',
            metaGenerator: "WordPress 6.4.2",
        }));
        const wp = out.find((m) => m.name === "wordpress");
        expect(wp).toBeDefined();
        expect(wp!.version).toBe("6.4.2");
        expect(wp!.confidence).toBe("high");
        // Implies php
        expect(out.find((m) => m.name === "php")).toBeDefined();
    });

    it("Drupal — js-marker + meta-generator", () => {
        const out = matchTechPatterns(snap({
            html: "<script>jQuery.extend(Drupal.settings, {});</script>",
            metaGenerator: "Drupal 10",
        }));
        const dr = out.find((m) => m.name === "drupal");
        expect(dr).toBeDefined();
        expect(dr!.version).toBe("10");
    });

    it("ASP.NET — multiple specific cookies + headers", () => {
        const out = matchTechPatterns(snap({
            cookieNames: ["ASP.NET_SessionId", ".AspNetCore.Antiforgery"],
            headers: { "x-aspnet-version": "4.0.30319" },
        }));
        const asp = out.find((m) => m.name === "asp.net");
        expect(asp).toBeDefined();
        expect(asp!.confidence).toBe("high");
    });
});

describe("matchTechPatterns — edge / cdn", () => {
    it("Cloudflare — cf-ray header", () => {
        const out = matchTechPatterns(snap({
            headers: { "cf-ray": "abc123-DEN", "server": "cloudflare" },
        }));
        const cf = out.find((m) => m.name === "cloudflare");
        expect(cf).toBeDefined();
        expect(cf!.confidence).toBe("high");
    });

    it("Vercel — x-vercel-cache + server header", () => {
        const out = matchTechPatterns(snap({
            headers: { "x-vercel-cache": "HIT", "server": "Vercel" },
        }));
        const v = out.find((m) => m.name === "vercel");
        expect(v).toBeDefined();
    });

    it("AWS CloudFront — x-amz-cf-id", () => {
        const out = matchTechPatterns(snap({
            headers: { "x-amz-cf-id": "DEFhij" },
        }));
        expect(out.find((m) => m.name === "aws-cloudfront")).toBeDefined();
    });
});

describe("matchTechPatterns — web servers with version extraction", () => {
    it("nginx — server header carries version", () => {
        const out = matchTechPatterns(snap({
            headers: { "server": "nginx/1.24.0" },
        }));
        const n = out.find((m) => m.name === "nginx");
        expect(n).toBeDefined();
        expect(n!.version).toBe("1.24.0");
    });

    it("nginx — without version", () => {
        const out = matchTechPatterns(snap({
            headers: { "server": "nginx" },
        }));
        const n = out.find((m) => m.name === "nginx");
        expect(n).toBeDefined();
        expect(n!.version).toBeUndefined();
    });

    it("Apache + IIS — distinct detection", () => {
        const apOut = matchTechPatterns(snap({ headers: { "server": "Apache/2.4.52" } }));
        expect(apOut.find((m) => m.name === "apache")?.version).toBe("2.4.52");

        const iisOut = matchTechPatterns(snap({ headers: { "server": "Microsoft-IIS/10.0" } }));
        expect(iisOut.find((m) => m.name === "iis")?.version).toBe("10.0");
    });
});

describe("buildStructuredSlots", () => {
    it("groups matches into frontend/backend/edge/web_server slots", () => {
        const matched = matchTechPatterns(snap({
            html: '<div id="__next"></div>',
            scriptSrcs: ["/_next/static/chunks/main.js"],
            cookieNames: ["connect.sid"],
            headers: { "cf-ray": "x", "server": "nginx/1.24.0" },
        }));
        const slots = buildStructuredSlots(matched);
        expect(slots.frontend?.name).toBe("next.js");
        expect(slots.backend?.name).toBe("express");
        expect(slots.edge?.name).toBe("cloudflare");
        expect(slots.web_server?.name).toBe("nginx");
        expect(slots.web_server?.version).toBe("1.24.0");
    });

    it("higher-confidence direct match wins over implied match", () => {
        // React matches via implies-from-Next.js (low confidence) AND directly (high).
        const matched = matchTechPatterns(snap({
            html: '<div id="__next"></div>',
            scriptSrcs: ["/_next/static/x.js", "https://cdn/react@18.2.0/index.js"],
        }));
        const r = matched.find((m) => m.name === "react");
        // Direct script-src match should override the implies.
        expect(r?.fromImplies).toBeFalsy();
        expect(r?.confidence).toBe("high");
        expect(r?.version).toBe("18.2.0");
    });

    it("unrelated matches go to other[]", () => {
        const matched = matchTechPatterns(snap({
            scriptSrcs: ["https://www.googletagmanager.com/gtag/js?id=G-XYZ"],
        }));
        const slots = buildStructuredSlots(matched);
        expect(slots.frontend).toBeNull();
        expect(slots.other.find((o) => o.name === "google-analytics")).toBeDefined();
    });
});

describe("matchTechPatterns — no match cases", () => {
    it("empty snapshot → empty result", () => {
        expect(matchTechPatterns(snap({}))).toEqual([]);
    });

    it("ambiguous server header → no false positive", () => {
        const out = matchTechPatterns(snap({
            headers: { "server": "MyCustomServer/1.0" },
        }));
        // Should NOT match nginx/apache/caddy/iis
        expect(out.find((m) => ["nginx", "apache", "caddy", "iis"].includes(m.name))).toBeUndefined();
    });

    it("WordPress without meta-generator + without theme link → no match", () => {
        // Plain blog HTML that happens to contain word "wordpress" should not falsely match.
        const out = matchTechPatterns(snap({
            html: "<p>Wir empfehlen WordPress für Customer-CMS.</p>",
        }));
        expect(out.find((m) => m.name === "wordpress")).toBeUndefined();
    });
});
