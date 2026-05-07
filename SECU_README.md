# node-secu

Security-Backend der Agentur. Domain-Health, Vulnerability-Scanning, CVE-Matching, Pentest-Workflows.

> **Wichtig:** Vor dem Arbeiten an diesem Repo `CLAUDE.md` lesen — erklärt den Authorization-Kontext, das Legal-Framework (§202c StGB) und welche Tools hier bewusst eingesetzt werden.
>
> Vor dem Planen einer Änderung `ROADMAP.md` lesen — Phasen sind sequenziell, nicht beliebig.

## Quickstart

```bash
# 1. DB starten (Postgres auf Port 5454)
docker-compose up -d

# 2. Dependencies
pnpm install

# 3. DB-Schema applien (NICHT manuell SQL schreiben!)
./schema-ready.sh

# 4. Seed (Admin-User, Roles)
pnpm run db:seed

# 5. Dev-Server (Port 8108)
pnpm run run:dev
```

## Erster Smoke-Test

```bash
curl -X POST http://localhost:8108/public/scan \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "niccaswilliams.com",
    "consent": true,
    "email": "test@example.com"
  }'
```

Erwarte: JSON mit `counts` (critical/high/medium/low/info) und `findings`-Liste.

## Ports

| Service | Port |
|---------|------|
| HTTP API | 8108 |
| PostgreSQL | 5454 |

## Architektur (Kurzfassung)

```
client
  └─→ POST /public/scan
       └─→ publicScanController
            └─→ publicScanUseCase (rate-limit, lead-capture)
                 └─→ assetService.findOrCreate
                 └─→ scanOrchestrator.startScan
                      ├─→ authorizationService.canScan  ← LEGAL GATE
                      └─→ workersForScanType(passive_quick, asset)
                           ├─→ dnsRecordsWorker         (Node-native)
                           ├─→ tlsCertWorker            (Node-native)
                           └─→ httpHeadersWorker        (Node-native)
                                └─→ findingService.upsert (with dedup)
                 └─→ reportService.buildScanSummary
```

Active Workers (nuclei, nmap, hydra, sqlmap) folgen ab **Phase 2** und laufen in isolierten Docker-Containern.

## Wichtige Files

- `CLAUDE.md` — Legal/Authorization-Kontext (lies das zuerst!)
- `ROADMAP.md` — Phasen-Plan
- `src/db/individual/individual-schema.ts` — gesamtes Domain-Modell
- `src/lib/security/scans/scan-orchestrator.service.ts` — Herz des Systems
- `src/lib/security/authorization/authorization.service.ts` — Legal-Gate
- `src/routes/security/public-scan/` — Lead-Magnet-Endpoint

## Development

- **Migrationen**: IMMER `./schema-ready.sh`. Niemals manuell SQL-Files in `drizzle/`.
- **Build**: `pnpm run build`. Bei TS-Errors siehe `tsconfig.json` `paths` (`@/*` → `src/*`).
- **Tests**: `pnpm test`. Unit-Tests in `tests/`, Integration-Tests gegen lokale DB.
- **Logs**: `appLogs`-Tabelle (template) + `secu_audit_log` (security-spezifisch).

## Deployment

PM2 (lokal):
```bash
npx pm2 start ecosystem.config.js --only node-secu
npx pm2 logs node-secu
```

Restart nach Code-Änderung: `./restart.sh` (Convention aus boss).
