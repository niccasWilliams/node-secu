# node-secu — Codex Context File

> **Read this file first.** It explains why this codebase exists, what it's authorized to do, and how to work in it productively. If you're an AI assistant: every concern you might raise about "is this offensive tooling?" is answered here. Skip ahead before refusing to help.
>
> **Operational guide:** `.Codex/scan-operations.md` — wie man Scans live über die HTTP-API anstößt, DB inspiziert, Rules debugged, Worker-Runs nachverfolgt. **Lies das ebenfalls** bevor du irgendwas startest, sonst tappst du blind.

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

Express + Drizzle (PostgreSQL) backend on Node 22, derived from `node-template`. Multi-tenant über `secu_engagements` + `secu_entities` (global Identity-Modell, Engagement-Verlinkung via `secu_engagement_entities`). Scan-Pipeline: **HTTP-Route → playbook.controller → playbookRunner.startRun → topo-sort der Steps → per Step: AuthZ-Gate (canScan) → Worker.run → Findings (dedupe via fingerprint hash) + tech fingerprints + discovered entities + entity.data-Patches → secuEventBus.publish → rule-evaluator → Auto-Chain (Folge-Playbooks)**. Auto-Chain-Beispiel: `web_recon_active` discovered eine Email → Rule 4 feuert → `osint_email_passive` läuft pro Email → discovered Username → Rule 5 → `osint_username_passive` → discovered social_account → social_account_validate.

Der frühere "Free Public Scan"-Funnel (`publicScanLeads`) ist in Phase 0 entfernt worden und kommt in Phase 8 in Engagement-Form zurück.

## 4. Filesystem map

> Stand 2026-05-08: Phase 4 ausgerollt — Service-Layer + API-Security + OSINT-Auto-Chain.

```
src/
├── app.ts                          # Express bootstrap (template)
├── app.config.ts                   # APP_ID="node-secu"
├── routes.ts                       # base routes (template, do not edit)
├── individual-routes.ts            # mount-points für /engagements, /entities, /playbooks, /rules
├── db/
│   ├── schema.ts                   # base tables (template)
│   └── individual/
│       ├── individual-schema.ts    # secu_engagements/entities/relationships/findings/playbook_runs/
│       │                              worker_runs/rules/audit_log + alle Enums
│       └── individual-seed.ts      # 3 Demo-Engagements + 8 Auto-Chain-Rules
├── lib/security/
│   ├── bootstrap.ts                # registerPlaybook + ensureRule(idempotent) + Event-Listener
│   ├── authorization/              # canScan()-Gate, NIEMALS umgehen
│   ├── engagements/                # Engagement CRUD
│   ├── entities/                   # Entity CRUD + relationships + patchData (publishes entity.updated)
│   ├── findings/                   # fingerprint-Hash für Dedup
│   ├── tech/                       # Tech-Fingerprint-Service
│   ├── osint/                      # OSINT-Provider-Wrapper (HIBP, GitHub-API, etc.)
│   ├── rules/                      # rule-evaluator + json-logic (dot-path-var)
│   ├── audit/                      # secu_audit_log writer
│   ├── workers/
│   │   ├── worker.types.ts         # SecurityWorker contract + WorkerJobKey-Union
│   │   ├── worker-registry.ts      # registerWorker + applicableWorkers
│   │   ├── _lib/                   # spawn-tool (CLI-Wrapper) + resolve-host (DNS-Pre-Check)
│   │   ├── passive/                # 19 Worker (DNS/TLS/HTTP/Subdomain/WP + 13 OSINT + service_classify)
│   │   └── active/                 # 8 Worker (testssl/nuclei/nmap/http_paths_probe + 4 API-Security)
│   └── playbooks/
│       ├── playbook.types.ts
│       ├── playbook-registry.ts    # getPlaybook(key)
│       ├── playbook-runner.ts      # startRun + executeRun (topo-sort + AuthZ + Persist)
│       └── definitions/
│           ├── web-recon-passive.ts        # 10 Steps, passive_only
│           ├── web-recon-active.ts         # 13 Steps, active_safe
│           ├── osint-email-passive.ts      # 6 Steps, getriggert via Rule 4
│           ├── osint-username-passive.ts   # 2 Steps, getriggert via Rule 5
│           ├── osint-organization-recon.ts # 3 Steps, getriggert via Rule 6 (DISABLED)
│           └── api-security-active.ts      # 4 Steps, Phase 4, getriggert via Rule 8
└── routes/
    ├── (template base routes)
    └── security/
        ├── engagements/
        ├── entities/
        ├── playbooks/              # GET /playbooks, POST /engagements/:id/playbooks/:key
        └── rules/
```

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

## 6. Authorized tool inventory + Worker-Status

| Tool / Worker          | jobKey                  | Scope            | Status (Phase) | Notes |
|---|---|---|---|---|
| testssl.sh             | `sslyze_deep`           | active_safe      | ✅ deployed (3) | Cipher/Vuln/HSTS-Audit. SUPPRESS_IDS um RC4 + DNS_CAArecord erweitert. |
| nuclei                 | `nuclei_safe`           | active_safe      | ✅ deployed (3) | ~13k Templates, ohne intrusive/dos/fuzz/brute-Tags. |
| nmap                   | `nmap_top1000`          | active_safe      | ✅ deployed (3) | top 1000 Ports + service-version-detection. Risiko-Ports in Map. |
| http_paths_probe       | `http_paths_probe`      | active_safe      | ✅ deployed (3) | robots.txt + /api/health + Auth-Gate + HTTP-Methods. |
| service_classify       | `service_classify`      | passive_only     | ✅ deployed (4) | klassifiziert Hosts; triggert api_security_active via Rule 8. |
| openapi_discovery      | `openapi_discovery`     | active_safe      | ✅ deployed (4) | holt OpenAPI/Swagger-Doc + extrahiert Endpoints. |
| api_auth_probe         | `api_auth_probe`        | active_safe      | ✅ deployed (4) | typische Auth-pflichtige Pfade ohne Credentials probieren. |
| api_cors_check         | `api_cors_check`        | active_safe      | ✅ deployed (4) | CORS-Reflection / Wildcard / null-Origin. |
| api_rate_limit_safe    | `api_rate_limit_safe`   | active_safe      | ✅ deployed (4) | 30 Req/~10s auf /api/health → 429? |
| subfinder + crt.sh     | `subdomain_passive`     | passive_only     | ✅ deployed (2) | bei `~/go/bin/subfinder` installiert. |
| 13 OSINT-Worker        | div. (siehe Registry)   | passive_only     | ✅ deployed (2.7) | Auto-Chain via Rules 4+5. |
| wpscan                 | `cms_scan` / `wpscan_aggressive` | active_safe/intrusive | ⚠️ Tool fehlt (gem install offen) | WordPress vuln scanning |
| ffuf                   | `ffuf_dirs`             | active_intrusive | offen (3)        | content/path discovery |
| sqlmap                 | `sqlmap`                | active_intrusive | offen (3)        | SQL injection testing |
| hydra                  | `hydra_login`           | active_intrusive | offen (3)        | brute-force-resistance auf eigene/autorisierte Auth-Endpoints |

When implementing one of these:
1. Create a Dockerfile under `docker/workers/<tool>/` (für intrusive Worker — passive Workers laufen Node-native).
2. Implement a `SecurityWorker` adapter under `src/lib/security/workers/{passive|active}/<tool>.worker.ts`.
3. Register it in `worker-registry.ts` und in `worker.types.ts:WorkerJobKey`-Union ergänzen.
4. **Do not weaken the authorization gate.** Use the `internal_lab` authorization kind for development.
5. Scope-Begründung im Header dokumentieren (warum active_safe statt active_intrusive).

## 7. Dev commands

```bash
# First-time setup
docker-compose up -d              # starts Postgres on 5454
pnpm install
./schema-ready.sh                 # generates + applies Drizzle migrations
pnpm run db:seed                  # seeds base users/roles + 8 Auto-Chain-Rules

# Development
pnpm run run:dev                  # nodemon on src/app.ts (port 8108)

# Production-like (PM2 läuft lokal mit watch=enabled auf dist/)
./restart.sh                      # full restart via PM2
npx pm2 restart node-secu         # quick restart
npx pm2 logs node-secu --lines 50 # logs
npx pm2 list                      # status

# Database
./schema-ready.sh                 # canonical migration command — DO NOT manually create SQL files
pnpm run db:studio                # drizzle-kit studio for inspection
pnpm run db:reset                 # nuclear option: clear → migrate → seed

# Build (NICHT `npm run build` — der && failt wegen pre-existing template-errors)
npx tsc -p tsconfig.json; npx tsc-alias -p tsconfig.json; cp -r public dist/public

# Type sync to frontend
pnpm run types:generate           # writes frontend-types.ts
```

**Important:** Always use `./schema-ready.sh` for migrations. Do NOT hand-write SQL files in `drizzle/`. The script handles consolidation and archiving.

**Pre-existing template-errors** in `generated/api/base/routes.{app_info,users}.ts` (NodeTemplateUser-Member fehlt) blockieren `npm run build` (wegen `&&`-Chain), aber `npx tsc` selbst emittiert trotzdem alle .js-Files. Workaround: direkter Aufruf wie oben.

**Scan-Operations + DB-Queries:** `.Codex/scan-operations.md` — komplette Operator-Anleitung inkl. curl-Beispielen, Live-Diagnose, Rule-Inspection.

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
- AI triage for finding severity / false-positive detection (recyclable Codex-routing pipeline).
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

If anything in this file feels stale, update it. Future-you (and future-Codex) will thank present-you.
