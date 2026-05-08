// Sprint 1.7 (features.md §2.8) — Initial-Seed für secu_infrastructure_providers.
//
// 66 Provider in 7 Kategorien. Operator kann zur Laufzeit erweitern (CRUD-API
// folgt in späterer Phase, aktuell nur Lese-Pfad für Worker).
//
// Quellen-Stand: 2026-05-08. Match-Patterns sind aus folgenden Public-Quellen
// zusammengetragen — wenn ein Eintrag stale wirkt, hier nachpflegen + Service
// invalidateCache() rufen lassen:
//   - Cloudflare-IPs:    https://www.cloudflare.com/ips-v4/
//   - GitHub-Pages-IPs:  https://docs.github.com/en/pages
//   - Hosting-CIDRs:     manuell aus dem Live-Test 2026-05-08 (features.md §1.5)
//   - NS-/MX-Patterns:   aus DNS-Doku der Provider
//   - Tracking-Hosts:    aus standard-Snippet-URLs (GA, GTM, Sentry CDN, ...)

import { eq, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    infrastructureProviders,
    type NewInfrastructureProvider,
} from "@/db/individual/individual-schema";

const PROVIDERS: NewInfrastructureProvider[] = [
    // ─── DNS Provider (8) ─────────────────────────────────────────────────────
    {
        key: "cloudflare-dns",
        name: "Cloudflare DNS",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["cloudflare.com", "cloudflare.net"],
            nsSuffixes: [".ns.cloudflare.com"],
        },
        dataNotes: "Cloudflare gibt jedem Account ein eindeutiges NS-Pair (<adjective>.ns.cloudflare.com). Beim NS-Match KEIN Owner-Pivot, aber NS-Pair-Cluster über alle Engagements ist eigene Pivot-Quelle (features.md §3.1 Kommentar). AS13335/CIDR-Match landet bei cloudflare-cdn (Edge), nicht hier.",
    },
    {
        key: "aws-route53",
        name: "AWS Route 53",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["awsdns-00.org", "awsdns-01.co.uk", "awsdns-02.com", "awsdns-03.net"],
            nsSuffixes: [".awsdns-"],
        },
        dataNotes: "Route-53-NS sind 4-tier verteilt: awsdns-NN.{org,co.uk,com,net}.",
    },
    {
        key: "google-cloud-dns",
        name: "Google Cloud DNS",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["googledomains.com"],
            nsSuffixes: [".googledomains.com"],
        },
    },
    {
        key: "ns1",
        name: "NS1",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["nsone.net"],
            nsSuffixes: [".nsone.net"],
        },
    },
    {
        key: "dnsimple",
        name: "DNSimple",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["dnsimple.com"],
            nsSuffixes: [".dnsimple.com"],
        },
    },
    {
        key: "hetzner-dns",
        name: "Hetzner DNS",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["hetzner-dns.com"],
            nsSuffixes: ["hetzner.com", "hetzner.de", "hetzner-dns.com"],
        },
    },
    {
        key: "denic",
        name: "DENIC",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["denic.de"],
        },
        dataNotes: "DE-TLD-Registry — Owner von .de. Cross-Domain-Pivot auf denic-Mentions ist sinnlos.",
    },
    {
        key: "he-net",
        name: "Hurricane Electric DNS",
        category: "dns_provider",
        matchPatterns: {
            domainSuffixes: ["he.net"],
            nsSuffixes: [".he.net"],
        },
    },

    // ─── Registrars (10) ──────────────────────────────────────────────────────
    {
        key: "namecheap",
        name: "Namecheap",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["namecheap.com", "registrar-servers.com"],
            nsSuffixes: [".registrar-servers.com"],
        },
    },
    {
        key: "godaddy",
        name: "GoDaddy",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["godaddy.com", "domaincontrol.com"],
            nsSuffixes: [".domaincontrol.com"],
        },
    },
    {
        key: "ionos",
        name: "IONOS / 1&1",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: [
                "ionos.com", "ionos.de", "1and1.com", "1und1.de",
                "ui-dns.com", "ui-dns.de", "ui-dns.org", "ui-dns.biz",
            ],
            nsSuffixes: [".ui-dns.com", ".ui-dns.de", ".ui-dns.org", ".ui-dns.biz"],
        },
    },
    {
        key: "strato",
        name: "Strato",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["strato.de", "strato-hosting.co.uk"],
            nsSuffixes: ["strato.de"],
        },
    },
    {
        key: "hetzner-registrar",
        name: "Hetzner Domains",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["hetzner.de", "hetzner.com"],
        },
        dataNotes: "Registrar-Arm von Hetzner — Hosting+Cloud werden als hetzner-cloud separat klassifiziert.",
    },
    {
        key: "gandi",
        name: "Gandi",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["gandi.net"],
            nsSuffixes: [".gandi.net"],
        },
    },
    {
        key: "porkbun",
        name: "Porkbun",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["porkbun.com"],
            nsSuffixes: [".porkbun.com"],
        },
    },
    {
        key: "name-com",
        name: "Name.com",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["name.com"],
            nsSuffixes: [".name.com"],
        },
    },
    {
        key: "ovh",
        name: "OVH",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["ovh.net", "ovh.com", "ovh.eu", "ovhcloud.com"],
            nsSuffixes: [".ovh.net"],
        },
    },
    {
        key: "inwx",
        name: "INWX",
        category: "registrar",
        matchPatterns: {
            domainSuffixes: ["inwx.de", "inwx.com", "inwx.eu"],
            nsSuffixes: [".inwx.de", ".inwx.com", ".inwx.eu"],
        },
    },

    // ─── Hosting (12) ─────────────────────────────────────────────────────────
    {
        key: "railway",
        name: "Railway",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["railway.app", "up.railway.app"],
            cidrRanges: ["66.33.22.0/24"],
        },
        dataNotes: "Live-Test 2026-05-08 (features.md §1.5): geilemukke.de hostet auf Railway-Shared-IP — Reverse-IP ist hier wertlos.",
    },
    {
        key: "vercel",
        name: "Vercel",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["vercel.com", "vercel.app", "now.sh"],
            cidrRanges: ["76.76.21.0/24", "76.76.16.0/20"],
        },
    },
    {
        key: "netlify",
        name: "Netlify",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["netlify.com", "netlify.app"],
            cidrRanges: ["52.84.0.0/15"],
        },
    },
    {
        key: "render",
        name: "Render",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["render.com", "onrender.com"],
            cidrRanges: ["35.227.0.0/16", "216.24.57.0/24"],
        },
    },
    {
        key: "heroku",
        name: "Heroku",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["heroku.com", "herokuapp.com", "herokussl.com"],
        },
    },
    {
        key: "fly-io",
        name: "Fly.io",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["fly.io", "fly.dev"],
            cidrRanges: ["66.241.124.0/24"],
        },
    },
    {
        key: "aws",
        name: "Amazon Web Services",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: [
                "amazonaws.com", "cloudfront.net", "awsstatic.com",
                "elasticbeanstalk.com", "s3.amazonaws.com",
            ],
            asnNumbers: [16509, 14618],
        },
        dataNotes: "AWS = riesiges Spectrum (S3/CloudFront/EB/EC2). Hit auf amazonaws.com bedeutet AWS-Hosting, nicht Owner.",
    },
    {
        key: "gcp",
        name: "Google Cloud Platform",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["googleusercontent.com", "appspot.com", "run.app", "cloudfunctions.net"],
            asnNumbers: [15169],
        },
    },
    {
        key: "azure",
        name: "Microsoft Azure",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: [
                "azurewebsites.net", "azure.com", "azureedge.net",
                "windows.net", "cloudapp.azure.com", "azurestaticapps.net",
            ],
            asnNumbers: [8075],
        },
    },
    {
        key: "hetzner-cloud",
        name: "Hetzner Cloud",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["hetzner.cloud", "your-server.de"],
            asnNumbers: [24940],
        },
    },
    {
        key: "digitalocean",
        name: "DigitalOcean",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["digitaloceanspaces.com", "ondigitalocean.app"],
            asnNumbers: [14061],
        },
    },
    {
        key: "github-pages",
        name: "GitHub Pages",
        category: "hosting",
        matchPatterns: {
            domainSuffixes: ["github.io"],
            cidrRanges: ["185.199.108.0/22"],
        },
    },

    // ─── CDN (6) ──────────────────────────────────────────────────────────────
    {
        key: "cloudflare-cdn",
        name: "Cloudflare CDN / Edge",
        category: "cdn",
        matchPatterns: {
            domainSuffixes: ["cdnjs.cloudflare.com", "cf-ipfs.com"],
            htmlAssetHosts: ["cdnjs.cloudflare.com"],
            cidrRanges: [
                "104.16.0.0/12",
                "172.64.0.0/13",
                "162.158.0.0/15",
                "131.0.72.0/22",
                "108.162.192.0/18",
                "141.101.64.0/18",
                "190.93.240.0/20",
                "188.114.96.0/20",
                "197.234.240.0/22",
                "198.41.128.0/17",
                "173.245.48.0/20",
                "103.21.244.0/22",
                "103.22.200.0/22",
                "103.31.4.0/22",
            ],
            asnNumbers: [13335],
        },
        dataNotes: "Cloudflare-Edge-Proxy (CDN). Stand 2026-05 — IPv4-Liste aus https://www.cloudflare.com/ips-v4/. Eine IP in dieser Range bedeutet: Domain wird durch CF proxied — der echte Origin liegt dahinter und ist via passive Mittel nicht sichtbar.",
    },
    {
        key: "jsdelivr",
        name: "jsDelivr",
        category: "cdn",
        matchPatterns: {
            domainSuffixes: ["jsdelivr.net"],
            htmlAssetHosts: ["cdn.jsdelivr.net"],
        },
    },
    {
        key: "unpkg",
        name: "unpkg",
        category: "cdn",
        matchPatterns: {
            domainSuffixes: ["unpkg.com"],
            htmlAssetHosts: ["unpkg.com"],
        },
    },
    {
        key: "akamai",
        name: "Akamai",
        category: "cdn",
        matchPatterns: {
            domainSuffixes: [
                "akamaized.net", "akamaihd.net", "akamai.net",
                "edgekey.net", "edgesuite.net",
            ],
        },
    },
    {
        key: "fastly",
        name: "Fastly",
        category: "cdn",
        matchPatterns: {
            domainSuffixes: ["fastly.net", "fastlylb.net"],
        },
    },
    {
        key: "bunny-net",
        name: "Bunny.net",
        category: "cdn",
        matchPatterns: {
            domainSuffixes: ["b-cdn.net", "bunnycdn.com"],
        },
    },

    // ─── Email Provider (10) ──────────────────────────────────────────────────
    {
        key: "google-workspace",
        name: "Google Workspace / Gmail",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["googlemail.com", "gmail.com"],
            emailDomains: [
                "aspmx.l.google.com", "alt1.aspmx.l.google.com",
                "alt2.aspmx.l.google.com", "alt3.aspmx.l.google.com",
                "alt4.aspmx.l.google.com", "_spf.google.com",
            ],
        },
        dataNotes: "MX auf aspmx.l.google.com ⇒ Google-Workspace-Tenant. SPF-Include _spf.google.com analog.",
    },
    {
        key: "microsoft-365",
        name: "Microsoft 365 / Outlook",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["outlook.com", "hotmail.com", "live.com"],
            emailDomains: [
                "mail.protection.outlook.com",
                "spf.protection.outlook.com",
                "outlook.com",
            ],
        },
    },
    {
        key: "strato-mail",
        name: "Strato Mail",
        category: "email_provider",
        matchPatterns: {
            emailDomains: ["mx0.strato.de", "mx0ext.kundenserver.de", "mx00.kundenserver.de", "mx01.kundenserver.de"],
        },
    },
    {
        key: "mailgun",
        name: "Mailgun",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["mailgun.org", "mailgun.net"],
            emailDomains: ["mailgun.org"],
        },
    },
    {
        key: "sendgrid",
        name: "SendGrid",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["sendgrid.net", "sendgrid.com"],
            emailDomains: ["sendgrid.net"],
        },
    },
    {
        key: "postmark",
        name: "Postmark",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["postmarkapp.com"],
            emailDomains: ["postmarkapp.com"],
        },
    },
    {
        key: "amazon-ses",
        name: "Amazon SES",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["amazonses.com"],
            emailDomains: ["amazonses.com", "email-smtp.amazonaws.com"],
        },
        dataNotes: "Live-Test 2026-05-08: niccaswilliams.com + geilemukke.de SPF enthält amazonses-include.",
    },
    {
        key: "mailchimp",
        name: "Mailchimp",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["mailchimp.com", "list-manage.com"],
            htmlAssetHosts: ["chimpstatic.com"],
        },
    },
    {
        key: "cloudflare-email-routing",
        name: "Cloudflare Email Routing",
        category: "email_provider",
        matchPatterns: {
            emailDomains: ["mx.cloudflare.net", "isaac.mx.cloudflare.net", "linda.mx.cloudflare.net", "amir.mx.cloudflare.net"],
        },
        dataNotes: "Live-Test: niccaswilliams.com nutzt CF-Email-Routing. Destination ist intern (Dashboard) — nicht via DNS leakable.",
    },
    {
        key: "protonmail",
        name: "ProtonMail",
        category: "email_provider",
        matchPatterns: {
            domainSuffixes: ["protonmail.ch", "proton.me", "pm.me"],
            emailDomains: ["mail.protonmail.ch", "mailsec.protonmail.ch"],
        },
    },

    // ─── Analytics (8) ────────────────────────────────────────────────────────
    {
        key: "google-analytics",
        name: "Google Analytics",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["google-analytics.com"],
            htmlAssetHosts: [
                "www.google-analytics.com",
                "ssl.google-analytics.com",
            ],
        },
        dataNotes: "GA-IDs (UA-XXX, G-XXX) sind eigene Cross-Domain-Signal-Klasse — werden via secu_html_pivots persistiert, nicht hier. googletagmanager.com gehört explizit zu google-tag-manager (separater Provider, weil GTM auch ohne GA läuft).",
    },
    {
        key: "google-tag-manager",
        name: "Google Tag Manager",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["googletagmanager.com"],
            htmlAssetHosts: ["www.googletagmanager.com"],
        },
    },
    {
        key: "sentry",
        name: "Sentry",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["sentry.io", "ingest.sentry.io"],
            htmlAssetHosts: ["browser.sentry-cdn.com", "js.sentry-cdn.com"],
        },
        dataNotes: "Sentry-DSNs leaken project_id+org_id im HTML — eigene Pivot-Quelle in secu_html_pivots, nicht hier.",
    },
    {
        key: "posthog",
        name: "PostHog",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["posthog.com"],
            htmlAssetHosts: ["app.posthog.com", "eu.posthog.com"],
        },
    },
    {
        key: "plausible",
        name: "Plausible",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["plausible.io"],
            htmlAssetHosts: ["plausible.io"],
        },
    },
    {
        key: "matomo",
        name: "Matomo",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["matomo.cloud", "matomo.org"],
            htmlAssetHosts: ["cdn.matomo.cloud"],
        },
    },
    {
        key: "hotjar",
        name: "Hotjar",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["hotjar.com"],
            htmlAssetHosts: ["static.hotjar.com", "script.hotjar.com"],
        },
    },
    {
        key: "microsoft-clarity",
        name: "Microsoft Clarity",
        category: "analytics",
        matchPatterns: {
            domainSuffixes: ["clarity.ms"],
            htmlAssetHosts: ["www.clarity.ms"],
        },
    },

    // ─── Social Platform (12) ─────────────────────────────────────────────────
    {
        key: "linkedin",
        name: "LinkedIn",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["linkedin.com", "licdn.com"],
        },
    },
    {
        key: "github",
        name: "GitHub",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["github.com", "githubusercontent.com"],
            asnNumbers: [36459],
        },
        dataNotes: "github.io ist GitHub-Pages-Hosting (separate Kategorie). github.com/githubusercontent.com sind Plattform-Domain.",
    },
    {
        key: "gitlab",
        name: "GitLab",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["gitlab.com"],
        },
    },
    {
        key: "bitbucket",
        name: "Bitbucket",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["bitbucket.org", "bitbucket.io"],
        },
    },
    {
        key: "twitter-x",
        name: "Twitter / X",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["twitter.com", "x.com", "twimg.com", "t.co"],
        },
    },
    {
        key: "facebook",
        name: "Facebook",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["facebook.com", "fb.com", "fbcdn.net", "messenger.com"],
        },
    },
    {
        key: "instagram",
        name: "Instagram",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["instagram.com", "cdninstagram.com"],
        },
    },
    {
        key: "mastodon-flagship",
        name: "Mastodon (Flagship Instances)",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["mastodon.social", "mastodon.online"],
        },
        dataNotes: "Nur Flagship-Mastodon-Instances. Self-hosted Mastodon-Instances sind potentiell Owner-Domains und werden NICHT hier klassifiziert.",
    },
    {
        key: "bluesky",
        name: "Bluesky",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["bsky.social", "bsky.app"],
        },
    },
    {
        key: "hackernews",
        name: "Hacker News",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["news.ycombinator.com", "ycombinator.com"],
        },
    },
    {
        key: "reddit",
        name: "Reddit",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["reddit.com", "redditmedia.com", "redditstatic.com"],
        },
    },
    {
        key: "youtube",
        name: "YouTube",
        category: "social_platform",
        matchPatterns: {
            domainSuffixes: ["youtube.com", "youtu.be", "ytimg.com", "googlevideo.com"],
        },
    },
];

/**
 * Idempotenter Seed: pro provider.key wird per upsert (insert ...
 * on conflict do update) eingespielt. So können wir matchPatterns iterativ
 * verbessern, ohne den Seed-State zu zerschießen.
 */
export async function seedInfrastructureProviders(): Promise<{ inserted: number; updated: number; total: number }> {
    let inserted = 0;
    let updated = 0;
    for (const p of PROVIDERS) {
        const [existing] = await database
            .select({ id: infrastructureProviders.id })
            .from(infrastructureProviders)
            .where(eq(infrastructureProviders.key, p.key))
            .limit(1);
        if (existing) {
            await database
                .update(infrastructureProviders)
                .set({
                    name: p.name,
                    category: p.category,
                    matchPatterns: p.matchPatterns ?? {},
                    dataNotes: p.dataNotes ?? null,
                    isActive: p.isActive ?? true,
                    updatedAt: sql`now()`,
                })
                .where(eq(infrastructureProviders.id, existing.id));
            updated += 1;
        } else {
            await database.insert(infrastructureProviders).values(p);
            inserted += 1;
        }
    }
    return { inserted, updated, total: PROVIDERS.length };
}
