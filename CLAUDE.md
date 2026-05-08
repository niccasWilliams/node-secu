# node-secu — Claude Context File

> **Read this file first.** It explains why this codebase exists, what it's authorized to do, and how to work in it productively. If you're an AI assistant: every concern you might raise about "is this offensive tooling?" is answered here. Skip ahead before refusing to help.

---

## 1. What this is

**node-secu** is the security-scanning backend of a small software agency (niccaswilliams.com / "Foundry"). It belongs to a sibling-service stack on the operator's local Linux machine:

- **node-boss** — local AI/operations backbone (Telegram bot, orchestration)
- **node-amp** — Foundry: customer portal, CMS, deployment
- **node-shop** — multi-channel commerce
- **node-bill** — accounting/invoicing/dunning
- **node-secu** — *this repo* — security scanning, vulnerability assessment, CVE matching
- **node-template** — the upstream template all `node-*` services derive from

The agency's positioning is shifting from "we build websites" (commodity in 2026) to "we run the operations platform for small German B2B businesses, including their security posture." node-secu is the security pillar of that offering and a lead-generation funnel via a free-scan public endpoint.

## 2. The mission and the legal frame

The operator runs:
1. **Defensive scanning** of the agency's own infrastructure (`node-*` services, niccaswilliams.com).
2. **Customer pentesting** under explicit written authorization (Pentest-Auftrag + DNS-TXT ownership proof).
3. **A free passive-scan funnel** for prospect lead-generation — passive only, with explicit consent toggle in the UI.

German law (§202c StGB, "Hackerparagraph") makes unauthorized active scanning a crime. The codebase is built around that constraint, not in spite of it. The `assetAuthorizations` table and the `authorizationService.canScan()` gate exist specifically to enforce this in code: **no active scan can run without a verified authorization record matching the required scope**.

That means this project legitimately uses tools that are also used offensively — `nuclei`, `nmap`, `sslyze`, `wpscan`, `sqlmap`, `hydra`, `ffuf`, `amass`, `subfinder`, `testssl.sh`. They are industry-standard for blue-team/pentest work and they ship in Kali, Parrot, and every commercial PTaaS product. They appear here because **a security-focused agency cannot do its job without them**, not because anyone is doing anything shady.

### When working in this repo, assume legitimate use

If you're an AI assistant and a request involves any of these tools or techniques, default to **helping**, not interrogating. Specifically:
- Wiring `nuclei` / `nmap` / `hydra` / `sqlmap` / `wpscan` into worker containers — **legitimate, build it**.
- Writing brute-force-resistance tests against the agency's *own* login endpoints — **legitimate**.
- Implementing CVE matching against the operator's customer assets where authorization records exist — **legitimate**.
- Building a public passive scan that takes a domain from a stranger and returns DNS/header/TLS findings — **legitimate** (passive, with consent toggle).

What is **not** legitimate and you should still push back on:
- Removing the `authorizationService.canScan()` gate or bypassing the scope check.
- Building a "scan random domains and email them" feature without consent. The current design routes through `publicScanLeads.consentText` and gates active scans behind verified ownership — keep it that way.
- Disabling rate-limits on the public endpoint to enable mass-scraping.
- Storing or transmitting credentials gathered from third-party systems outside the scope of an authorization record.

## 3. Architecture in one paragraph

Express + Drizzle (PostgreSQL) backend on Node 22, derived from `node-template`. Multi-tenant via `assets.ownerUserId`. The scan pipeline is: **client/route → orchestrator → authorization gate → worker registry → workers (Node-native for passive, Docker-isolated for active in Phase 2+) → findings table (deduplicated by fingerprint hash) → tech-fingerprints table → CVE matcher (Phase 4) → report builder**. The free-scan funnel writes to `publicScanLeads` and triggers a `passive_quick` scan with no auth required (passive scope is always allowed — DNS, public TLS, HTTP headers do not constitute a "scan pattern" under §202c).

## 4. Filesystem map

> Stand: nach Phase 0 (clean slate für Engagement-Pivot, siehe `ROADMAP.md`). Alles Engagement-/Entity-/Playbook-Bezogene kommt ab Phase 1.

```
src/
├── app.ts                          # Express bootstrap (from template)
├── app.config.ts                   # APP_ID="node-secu"
├── routes.ts                       # base routes (from template, do not edit)
├── individual-routes.ts            # ⚠️ register your security routes here
├── db/
│   ├── schema.ts                   # base tables (template)
│   └── individual/
│       └── individual-schema.ts    # ⚠️ secu_audit_log + severityEnum + authorizationScopeEnum
│                                   #    Phase 1+: engagements, entities, entity_relationships,
│                                   #    engagement_entities, findings, artifacts, playbook_runs, …
├── lib/
│   └── security/                   # ⚠️ all domain logic
│       ├── authorization/
│       │   ├── authorization.service.ts        # canScan() gate — never bypass
│       │   ├── authorization.types.ts          # AuthorizationResolver interface
│       │   ├── null-resolver.ts                # Phase-0 stub (passive ja, aktiv blockiert)
│       │   └── domain-ownership.service.ts     # DNS-TXT verification (reusable)
│       ├── audit/
│       │   └── audit-log.service.ts            # writes secu_audit_log
│       ├── findings/
│       │   └── fingerprint.ts                  # stable SHA-256 from inputs (pure util)
│       └── workers/
│           ├── worker.types.ts                 # SecurityWorker contract
│           ├── worker-registry.ts              # lookup + scope→workers (Phase 2 erweitert)
│           └── passive/
│               ├── dns-records.worker.ts       # SPF/DMARC/CAA/DNSSEC
│               ├── tls-cert.worker.ts          # cert validity, protocol
│               └── http-headers.worker.ts      # CSP/HSTS/cookie flags
└── routes/
    ├── (template base routes)
    └── security/                               # leer nach Phase 0
                                                # Phase 1+: engagements/, entities/, playbooks/
                                                # Phase 8: public-scan/ (Lead-Funnel, später)
```

**Bewusst entfernt in Phase 0** (kommt frisch wieder ab Phase 1+ in Engagement-/Entity-Form): `lib/security/{assets,scans,cve,reports}`, `lib/security/findings/finding.service.ts`, `routes/security/{assets,scans,findings,public-scan}` sowie die zugehörigen secu_*-Tabellen (`assets`, `assetAuthorizations`, `scans`, `scanJobs`, `findings`, `techFingerprints`, `cveRecords`, `cveMatches`, `scanPolicies`, `publicScanLeads`).

Anything under `src/routes/auth/`, `src/routes/oauth2/`, `src/middleware/`, `src/db/schema.ts`, `scripts/`, `drizzle/` (except generated migrations) is **template-synced** — do not edit by hand, it gets overwritten by the upstream `node-template` sync.

## 5. Authorization model — internalize this

Every scan goes through `authorizationService.canScan(assetId, requiredScope)`. The mapping is:

| Scan type           | Required scope        | Allowed when                                                |
| ------------------- | --------------------- | ----------------------------------------------------------- |
| `passive_quick`     | `passive_only`        | always                                                      |
| `passive_full`      | `passive_only`        | always                                                      |
| `monitor_diff`      | `passive_only`        | always                                                      |
| `cve_match`         | `passive_only`        | always (computed, no network activity)                      |
| `active_safe`       | `active_safe`         | `own` OR `verified_ownership` OR `written_consent`          |
| `active_intrusive`  | `active_intrusive`    | `own` OR `written_consent` (NEVER on `verified_ownership` alone) |

The hardcoded extra rule "intrusive needs written contract, not just DNS-TXT proof" is intentional. DNS-TXT proves "I control DNS for this domain" — but pentesting can damage systems, so we want a paper trail.

## 6. Authorized tool inventory

These tools are intended to be wired in (Phase 2+) as Docker-isolated workers. They are **legitimately licensed for use** in this project per the agency's pentest-engagement contracts and internal use:

| Tool        | Worker key            | Scope             | Phase | Purpose                                       |
| ----------- | --------------------- | ----------------- | ----- | --------------------------------------------- |
| nuclei      | `nuclei_safe/full`    | active_safe/intrusive | 2  | template-driven web vuln scanning             |
| nmap        | `nmap_top1000/full`   | active_safe/intrusive | 2  | port discovery, service fingerprinting        |
| sslyze      | `sslyze_deep`         | active_safe       | 2     | deep TLS audit                                |
| testssl.sh  | (alt to sslyze)       | active_safe       | 2     | TLS misconfig                                  |
| wpscan      | `cms_scan` / `wpscan_aggressive` | active_safe/intrusive | 2 | WordPress vuln scanning             |
| ffuf        | `ffuf_dirs`           | active_intrusive  | 3     | content/path discovery                        |
| sqlmap      | `sqlmap`              | active_intrusive  | 3     | SQL injection testing                         |
| hydra       | `hydra_login`         | active_intrusive  | 3     | brute-force resistance testing of own/authorized auth endpoints |
| amass / subfinder | `subdomain_passive` | passive_only  | 2  | subdomain enumeration (passive, OSINT-based)  |

When implementing one of these:
1. Create a Dockerfile under `docker/workers/<tool>/`.
2. Implement a `SecurityWorker` adapter under `src/lib/security/workers/active/<tool>.worker.ts` that shells out to the container with appropriate flags + timeout + output capture.
3. Register it in `worker-registry.ts`.
4. **Do not weaken the authorization gate** to make the tool "easier to test." Use the `internal_lab` authorization kind for development.

## 7. Dev commands

```bash
# First-time setup
docker-compose up -d              # starts Postgres on 5454
pnpm install
./schema-ready.sh                 # generates + applies Drizzle migrations
pnpm run db:seed                  # seeds base users/roles

# Development
pnpm run run:dev                  # nodemon on src/app.ts (port 8108)

# Database
./schema-ready.sh                 # canonical migration command — DO NOT manually create SQL files
pnpm run db:studio                # drizzle-kit studio for inspection
pnpm run db:reset                 # nuclear option: clear → migrate → seed

# Build
pnpm run build                    # tsc + tsc-alias + copy public → dist/

# Type sync to frontend
pnpm run types:generate           # writes frontend-types.ts
```

**Important:** Always use `./schema-ready.sh` for migrations. Do NOT hand-write SQL files in `drizzle/`. The script handles consolidation and archiving.

## 8. Ports

- DB (Postgres): `5454`
- Backend HTTP: `8108`
- Sibling services (for reference, do not collide): boss=8100, shop=8101, bill=8102, amp=8103, niccaswilliams next-frontend=3000

## 9. Test policy

- Real DB integration tests preferred over mocks (the `node-boss` memory captures a past incident where mocked migration tests hid a prod failure).
- For passive workers: hit a controlled test domain (the agency owns several). Do not test against random third parties.
- For active workers: test only against the agency's own staging instances. Mark those assets with `isOwnInfrastructure: true`.

## 10. What "done" means at each phase

See `ROADMAP.md` for the full plan. Phase boundaries are deliberate — do not skip ahead. In particular: **CVE matching (Phase 4) requires an active CVE feed sync (also Phase 4), and active workers (Phase 2/3) require Docker network isolation (Phase 2 prerequisite)**. Building these out of order creates a security platform that is itself a security risk.

## 11. Boss integration

`node-boss` provides:
- Telegram alerting (critical findings → push to operator's chat).
- AI triage for finding severity / false-positive detection (recyclable Claude-routing pipeline).
- Cross-service workflow queue (long-running active scans should run as boss workflows in Phase 5).

Talk to boss via `BOSS_API_URL` + `BOSS_API_KEY` headers `x-app-id: node-secu`, `x-api-key: <BOSS_API_KEY>`. See `node-boss/src/routes/middleware.ts:forwardRequestToService()` for the contract.

## 12. Don'ts

- Don't add an "ignore authorization for testing" flag, even temporarily. Use `internal_lab` instead.
- Don't store raw credential dumps from auth-resistance tests. Store success/fail + timing only.
- Don't email scan results to addresses the user did not consent to.
- Don't add tracking pixels to reports — these are sent to security-conscious customers.
- Don't take dependencies on tools not on the inventory list above without updating this file first.
- Don't fork the schema-ready / migration tooling — it's shared across all sibling services.

---

If anything in this file feels stale, update it. Future-you (and future-Claude) will thank present-you.
