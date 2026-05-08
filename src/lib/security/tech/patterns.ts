// Tech-Detection-Patterns — Phase 5 (FULL_SCAN.md §Phase 5).
//
// Wappalyzer-equivalent Pattern-Catalog. Bewusst KLEIN gehalten (kein Clone der
// 3000+ Wappalyzer-Patterns) — wir starten mit dem Stack-Set, das die Agentur
// bei realen Customers tatsächlich sieht: ~35 Tech-Identifikatoren in den
// Slots, die für Customer-Reports relevant sind (frontend / backend / cms /
// edge / web_server / language / analytics / auth).
//
// Format ist bewusst TypeScript statt JSON: einmaliger Import-Cost gegen
// Type-Safety bei Erweiterung. Wenn der Katalog mal auf >200 Einträge wächst
// → Split in JSON + Generator-Step.
//
// Pattern-Quellen pro Tech:
//   - html         Body-Regex (z.B. `id="__next"` für Next.js)
//   - headers      Response-Header (Name + optional Value-Regex)
//   - cookies      Set-Cookie-Names (z.B. `connect.sid` → Express)
//   - scriptSrc    `<script src="...">` URLs (z.B. `/_next/static/...` → Next.js)
//   - metaGenerator `<meta name="generator" content="...">` (CMS-Typisch)
//
// Confidence-Hierarchie:
//   high    → spezifischer Marker (Cookie-Name, Build-Bundle-Pfad, X-Powered-By)
//   medium  → allgemeines DOM-Indiz (z.B. `data-reactroot`)
//   low     → schwaches Signal (z.B. ein bestimmtes class-Prefix)

export type TechCategory =
    | "frontend"
    | "backend"
    | "cms"
    | "edge"
    | "web_server"
    | "language"
    | "analytics"
    | "auth"
    | "build_tool"
    | "database_hint";

export interface PatternRule {
    /** Für versionsfähige Patterns: Index der Capture-Group, die Version enthält. */
    versionGroup?: number;
    /** Confidence dieser einen Match-Quelle. */
    confidence: "high" | "medium" | "low";
}

export interface HtmlPattern extends PatternRule {
    regex: RegExp;
}

export interface HeaderPattern extends PatternRule {
    /** Header-Name lowercased. */
    name: string;
    /** Optional: Value-Regex. Wenn fehlt, reicht das Vorhandensein des Headers. */
    valueRegex?: RegExp;
}

export interface CookiePattern extends PatternRule {
    /** Cookie-Name (case-sensitive — manche Stacks haben CamelCase). */
    name: string;
}

export interface ScriptSrcPattern extends PatternRule {
    /** Wird gegen den `src`-Wert im `<script>`-Tag geprüft. */
    regex: RegExp;
}

export interface MetaGeneratorPattern extends PatternRule {
    regex: RegExp;
}

export interface TechPatternSpec {
    /** Stable lowercase Identifier — wird als techName persistiert. */
    name: string;
    /** Display-Name (für Reports später). */
    displayName: string;
    category: TechCategory;
    /** Wenn dieses Tech matched, gelten diese ebenfalls als matched (additiv). */
    implies?: string[];
    html?: HtmlPattern[];
    headers?: HeaderPattern[];
    cookies?: CookiePattern[];
    scriptSrc?: ScriptSrcPattern[];
    metaGenerator?: MetaGeneratorPattern[];
}

export const TECH_PATTERNS: TechPatternSpec[] = [
    // ─── Frontend Frameworks ────────────────────────────────────────────────
    {
        name: "next.js",
        displayName: "Next.js",
        category: "frontend",
        implies: ["react"],
        html: [
            { regex: /id="__next"/, confidence: "high" },
            { regex: /id="__NEXT_DATA__"/, confidence: "high" },
        ],
        scriptSrc: [
            { regex: /\/_next\/static\//, confidence: "high" },
        ],
        headers: [
            { name: "x-nextjs-cache", confidence: "high" },
            { name: "x-nextjs-page", confidence: "high" },
            { name: "x-nextjs-prerender", confidence: "high" },
        ],
        cookies: [
            { name: "next-auth.session-token", confidence: "high" },
            { name: "__Secure-next-auth.session-token", confidence: "high" },
        ],
    },
    {
        name: "nuxt",
        displayName: "Nuxt.js",
        category: "frontend",
        implies: ["vue"],
        html: [
            { regex: /id="__nuxt"/, confidence: "high" },
            { regex: /id="__NUXT_DATA__"/, confidence: "high" },
            { regex: /window\.__NUXT__/, confidence: "high" },
        ],
        scriptSrc: [
            { regex: /\/_nuxt\//, confidence: "high" },
        ],
    },
    {
        name: "react",
        displayName: "React",
        category: "frontend",
        html: [
            { regex: /data-reactroot/, confidence: "medium" },
            { regex: /react(?:-dom)?(?:\.production)?(?:\.min)?\.js/, versionGroup: 0, confidence: "low" },
        ],
        scriptSrc: [
            { regex: /react@(\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "vue",
        displayName: "Vue.js",
        category: "frontend",
        html: [
            { regex: /id="app"\s+data-v-app/, confidence: "high" },
        ],
        scriptSrc: [
            { regex: /vue@(\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "angular",
        displayName: "Angular",
        category: "frontend",
        html: [
            { regex: /ng-version="(\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
            { regex: /<app-root/, confidence: "medium" },
        ],
    },
    {
        name: "svelte",
        displayName: "Svelte",
        category: "frontend",
        scriptSrc: [
            { regex: /\/_app\/immutable\//, confidence: "high" }, // SvelteKit
        ],
        html: [
            { regex: /class="svelte-/, confidence: "medium" },
        ],
    },
    {
        name: "astro",
        displayName: "Astro",
        category: "frontend",
        html: [
            { regex: /class="astro-/, confidence: "high" },
            { regex: /<astro-island/, confidence: "high" },
        ],
        metaGenerator: [
            { regex: /^Astro v?(\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "gatsby",
        displayName: "Gatsby",
        category: "frontend",
        implies: ["react"],
        html: [
            { regex: /id="___gatsby"/, confidence: "high" },
        ],
        metaGenerator: [
            { regex: /^Gatsby (\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "hugo",
        displayName: "Hugo",
        category: "frontend",
        metaGenerator: [
            { regex: /^Hugo (\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "jekyll",
        displayName: "Jekyll",
        category: "frontend",
        metaGenerator: [
            { regex: /^Jekyll v?(\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },

    // ─── Backend Frameworks ─────────────────────────────────────────────────
    {
        name: "express",
        displayName: "Express",
        category: "backend",
        implies: ["node.js"],
        cookies: [
            { name: "connect.sid", confidence: "high" },
        ],
        headers: [
            { name: "x-powered-by", valueRegex: /^Express/i, confidence: "high" },
        ],
    },
    {
        name: "nest.js",
        displayName: "NestJS",
        category: "backend",
        implies: ["node.js"],
        // Nest exposes very few markers by default — usually inherited from Express
        // setup; rely on /docs default-routes + custom-header probes (Phase 6).
        headers: [
            { name: "x-powered-by", valueRegex: /Nest/i, confidence: "high" },
        ],
    },
    {
        name: "fastapi",
        displayName: "FastAPI",
        category: "backend",
        implies: ["python"],
        // Default-Docs at /docs + /redoc + OpenAPI at /openapi.json (handled by openapi_discovery).
        headers: [
            { name: "server", valueRegex: /^uvicorn/i, confidence: "medium" }, // Uvicorn often → FastAPI
        ],
    },
    {
        name: "django",
        displayName: "Django",
        category: "backend",
        implies: ["python"],
        cookies: [
            { name: "csrftoken", confidence: "medium" },
            { name: "sessionid", confidence: "medium" },
        ],
        headers: [
            { name: "x-frame-options", valueRegex: /^DENY$/i, confidence: "low" }, // Django Default
        ],
    },
    {
        name: "rails",
        displayName: "Ruby on Rails",
        category: "backend",
        implies: ["ruby"],
        cookies: [
            { name: "_session_id", confidence: "medium" },
        ],
        headers: [
            { name: "x-powered-by", valueRegex: /Phusion Passenger/i, confidence: "high" },
        ],
        html: [
            { regex: /<meta name="csrf-param"/, confidence: "high" },
        ],
    },
    {
        name: "spring",
        displayName: "Spring Boot",
        category: "backend",
        implies: ["java"],
        cookies: [
            { name: "JSESSIONID", confidence: "medium" },
        ],
        headers: [
            { name: "x-application-context", confidence: "high" },
        ],
    },
    {
        name: "laravel",
        displayName: "Laravel",
        category: "backend",
        implies: ["php"],
        cookies: [
            { name: "laravel_session", confidence: "high" },
            { name: "XSRF-TOKEN", confidence: "medium" }, // also used by other PHP fws
        ],
    },
    {
        name: "asp.net",
        displayName: "ASP.NET",
        category: "backend",
        cookies: [
            { name: "ASP.NET_SessionId", confidence: "high" },
            { name: ".AspNetCore.Antiforgery", confidence: "high" },
        ],
        headers: [
            { name: "x-aspnet-version", confidence: "high" },
            { name: "x-powered-by", valueRegex: /ASP\.NET/i, confidence: "high" },
        ],
    },
    {
        name: "strapi",
        displayName: "Strapi",
        category: "cms",
        implies: ["node.js"],
        headers: [
            { name: "x-powered-by", valueRegex: /Strapi/i, confidence: "high" },
        ],
    },

    // ─── CMS ────────────────────────────────────────────────────────────────
    {
        name: "wordpress",
        displayName: "WordPress",
        category: "cms",
        implies: ["php"],
        html: [
            { regex: /<link[^>]+wp-content\/themes\//, confidence: "high" },
            { regex: /\/wp-includes\/js\/wp-emoji/, confidence: "high" },
        ],
        metaGenerator: [
            { regex: /^WordPress (\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "drupal",
        displayName: "Drupal",
        category: "cms",
        implies: ["php"],
        html: [
            { regex: /Drupal\.settings/, confidence: "high" },
            { regex: /\/sites\/(?:default|all)\/(?:modules|themes)\//, confidence: "high" },
        ],
        metaGenerator: [
            { regex: /^Drupal (\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
        headers: [
            { name: "x-generator", valueRegex: /^Drupal\s+(\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "joomla",
        displayName: "Joomla",
        category: "cms",
        implies: ["php"],
        metaGenerator: [
            { regex: /^Joomla! - Open Source Content Management/, confidence: "high" },
        ],
    },
    {
        name: "ghost",
        displayName: "Ghost",
        category: "cms",
        implies: ["node.js"],
        metaGenerator: [
            { regex: /^Ghost (\d+\.\d+(?:\.\d+)?)/, versionGroup: 1, confidence: "high" },
        ],
        html: [
            { regex: /class="gh-[a-z-]+"/, confidence: "medium" },
        ],
    },
    {
        name: "typo3",
        displayName: "TYPO3",
        category: "cms",
        implies: ["php"],
        metaGenerator: [
            { regex: /^TYPO3/, confidence: "high" },
        ],
    },

    // ─── Edge / CDN ─────────────────────────────────────────────────────────
    {
        name: "cloudflare",
        displayName: "Cloudflare",
        category: "edge",
        headers: [
            { name: "cf-ray", confidence: "high" },
            { name: "cf-cache-status", confidence: "high" },
            { name: "server", valueRegex: /^cloudflare$/i, confidence: "high" },
        ],
    },
    {
        name: "fastly",
        displayName: "Fastly",
        category: "edge",
        headers: [
            { name: "x-served-by", valueRegex: /cache-/, confidence: "high" },
            { name: "x-fastly-request-id", confidence: "high" },
        ],
    },
    {
        name: "vercel",
        displayName: "Vercel",
        category: "edge",
        headers: [
            { name: "x-vercel-cache", confidence: "high" },
            { name: "x-vercel-id", confidence: "high" },
            { name: "server", valueRegex: /^Vercel$/i, confidence: "high" },
        ],
    },
    {
        name: "netlify",
        displayName: "Netlify",
        category: "edge",
        headers: [
            { name: "x-nf-request-id", confidence: "high" },
            { name: "server", valueRegex: /^Netlify$/i, confidence: "high" },
        ],
    },
    {
        name: "akamai",
        displayName: "Akamai",
        category: "edge",
        headers: [
            { name: "x-akamai-request-id", confidence: "high" },
            { name: "x-akamai-transformed", confidence: "high" },
            { name: "akamai-x-cache", confidence: "high" },
        ],
    },
    {
        name: "aws-cloudfront",
        displayName: "AWS CloudFront",
        category: "edge",
        headers: [
            { name: "x-amz-cf-id", confidence: "high" },
            { name: "x-amz-cf-pop", confidence: "high" },
            { name: "via", valueRegex: /CloudFront/i, confidence: "high" },
        ],
    },

    // ─── Web Server ─────────────────────────────────────────────────────────
    {
        name: "nginx",
        displayName: "nginx",
        category: "web_server",
        headers: [
            { name: "server", valueRegex: /^nginx(?:\/(\d+\.\d+(?:\.\d+)?))?/i, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "apache",
        displayName: "Apache",
        category: "web_server",
        headers: [
            { name: "server", valueRegex: /^Apache(?:\/(\d+\.\d+(?:\.\d+)?))?/i, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "caddy",
        displayName: "Caddy",
        category: "web_server",
        headers: [
            { name: "server", valueRegex: /^Caddy/i, confidence: "high" },
        ],
    },
    {
        name: "iis",
        displayName: "IIS",
        category: "web_server",
        headers: [
            { name: "server", valueRegex: /Microsoft-IIS\/(\d+\.\d+)/i, versionGroup: 1, confidence: "high" },
        ],
    },

    // ─── Language Hints ─────────────────────────────────────────────────────
    {
        name: "node.js",
        displayName: "Node.js",
        category: "language",
        // Selten direkt detected; meist via Express/Nest/Strapi-implies.
        headers: [
            { name: "x-powered-by", valueRegex: /Node\.js/i, confidence: "medium" },
        ],
    },
    {
        name: "php",
        displayName: "PHP",
        category: "language",
        headers: [
            { name: "x-powered-by", valueRegex: /PHP\/?(\d+\.\d+(?:\.\d+)?)?/i, versionGroup: 1, confidence: "high" },
            { name: "set-cookie", valueRegex: /PHPSESSID=/, confidence: "high" },
        ],
    },
    {
        name: "python",
        displayName: "Python",
        category: "language",
        headers: [
            { name: "server", valueRegex: /Python\/(\d+\.\d+)/i, versionGroup: 1, confidence: "high" },
        ],
    },
    {
        name: "ruby",
        displayName: "Ruby",
        category: "language",
        headers: [
            { name: "server", valueRegex: /Ruby/i, confidence: "medium" },
        ],
    },
    {
        name: "java",
        displayName: "Java",
        category: "language",
        cookies: [
            { name: "JSESSIONID", confidence: "medium" }, // overlaps with spring; OK
        ],
    },

    // ─── Analytics ──────────────────────────────────────────────────────────
    {
        name: "google-analytics",
        displayName: "Google Analytics",
        category: "analytics",
        scriptSrc: [
            { regex: /googletagmanager\.com\/gtag\/js/, confidence: "high" },
            { regex: /google-analytics\.com\/analytics\.js/, confidence: "high" },
        ],
    },
    {
        name: "plausible",
        displayName: "Plausible",
        category: "analytics",
        scriptSrc: [
            { regex: /plausible\.io\/js\/(?:script|plausible)/, confidence: "high" },
        ],
    },
    {
        name: "matomo",
        displayName: "Matomo",
        category: "analytics",
        html: [
            { regex: /var _paq\s*=/, confidence: "high" },
        ],
    },

    // ─── Auth ───────────────────────────────────────────────────────────────
    {
        name: "auth0",
        displayName: "Auth0",
        category: "auth",
        scriptSrc: [
            { regex: /auth0\.com\/js\/lock/, confidence: "high" },
        ],
    },
];
