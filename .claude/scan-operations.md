# Scan-Operations — wie man node-secu live steuert

> **Lies das BEVOR du irgendwas in dieser Codebase startest.** Hier steht, wie ein Scan in der Praxis ausgelöst wird, wo die Daten landen, und welche Befehle Claude direkt ausführen darf, um den State zu inspizieren. Spart 30 min Hochfahrzeit pro Session.

## TL;DR — Scan in 60 Sekunden

```bash
# 1. Sicherstellen, dass node-secu läuft
npx pm2 list | grep node-secu        # erwartet: status=online

# 2. Logs streamen (anderes Terminal)
npx pm2 logs node-secu --lines 50

# 3. Engagement + Root-Entity-ID kennen (Test-Engagement: id=4, entity 20 = niccaswilliams.com)
PGPASSWORD=example psql -h localhost -p 5454 -U postgres -d postgres -c \
  "SELECT id, name FROM secu_engagements; SELECT id, kind, canonical_key FROM secu_entities ORDER BY id;"

# 4. Scan starten — web_recon_active oder web_recon_passive
curl -s -X POST "http://localhost:8108/engagements/4/playbooks/web_recon_active" \
  -H "Content-Type: application/json" \
  -d '{"rootEntityId":20,"triggeredBy":"claude-session"}'
# → {"success":true,"data":{"runId":N,"status":"pending",...}}

# 5. Auf Abschluss warten + Status checken
PGPASSWORD=example psql -h localhost -p 5454 -U postgres -d postgres -c \
  "SELECT id, status, finished_at, EXTRACT(EPOCH FROM (finished_at-started_at))::int AS sec
   FROM secu_playbook_runs WHERE id=N;"
```

## Wieso lokal-HTTP-Auth funktioniert

`AUTH_MODE=williams` (lokale Env) zwingt das Auth-Middleware in den Skip-Modus — `⚠️ Auth middleware skipped due to local environment` im Startup-Log. Der `AccessControl.isAuthUser()`-Guard in `playbook.route.ts` lässt unauthenticated Requests durch. **In Production ist das anders konfiguriert** (echtes JWT). Lokal kannst du also direkt mit `curl` arbeiten.

## Architektur in einem Bild

```
HTTP POST /engagements/:id/playbooks/:key
   └─► playbook.controller.start
        └─► playbookRunner.startRun({engagementId, playbookKey, rootEntityId})
             ├─ writes secu_playbook_runs row (status=pending → running)
             ├─ topo-sort der Steps via dependsOn
             ├─ pro Step:
             │   ├─ resolve targets (rootOnly | rootPlusDiscoveredHosts | …)
             │   ├─ AuthZ-Gate (canScan(entity, requiredScope))
             │   ├─ runWorkerSafely → SecurityWorker.run(ctx)
             │   │    └─ liefert WorkerResult { findings, techFingerprints,
             │   │                              discoveredEntities, entityDataPatch }
             │   ├─ persist findings (deduped via fingerprint hash)
             │   ├─ persist tech fingerprints
             │   ├─ persist discovered entities + relationships
             │   ├─ patch source entity.data (entityDataPatch)
             │   └─ secuEventBus.publish("entity.created" | "entity.updated" | "finding.created")
             │        └─► rule-evaluator wertet Rules → kann weitere Playbooks triggern
             └─ finalStatus = "failed" iff (runnerFatalError ‖ alle Worker failed)
                              sonst "completed"
```

## Auto-Chain-Mechanik (Phase 4)

Sobald `web_recon_active` läuft, ergeben sich automatische Folge-Runs ohne Operator-Eingriff:

| Trigger-Event | Rule (in `secu_rules`) | Folge-Playbook |
|---|---|---|
| `entity.created` mit kind=email_address | id=4 (enabled) | `osint_email_passive` pro Email |
| `entity.created` mit kind=username | id=5 (enabled) | `osint_username_passive` pro Username |
| `entity.updated` mit `entity.data.serviceType=='rest_api'` | id=8 (enabled, Phase 4) | `api_security_active` pro Host |
| `finding.created` mit category=leak | id=7 (enabled) | tag entity als compromised_credentials |
| `finding.created` mit severity=critical | id=1 (enabled) | notify_boss → Telegram-Alert |

**Bewusst disabled:**
- id=2 (WordPress-Subdomain → web_recon_passive) — würde rekursive Runs auslösen
- id=6 (asset_domain → osint_organization_recon) — würde bei jeder Subdomain-Discovery feuern; Wildcard-Cert-Subdomains erzeugen sonst false-positive-Personen. Stattdessen: explizite OSINT-Steps direkt in `web_recon_active` auf Apex-Entity.

## Playbook-Inventar

| Key | Steps | Scope | Trigger |
|---|---|---|---|
| `web_recon_passive` | 10 (subdomains→dns→tls→headers→wp→service_classify→ct_email_mining→github_personnel→email_pattern_inference) | passive_only | manuell |
| `web_recon_active` | 13 (Passive + tls_deep + nmap_top1000 + nuclei_safe + http_paths_probe) | active_safe | manuell |
| `osint_email_passive` | 6 (dns_signals + gravatar + github_commits + holehe + breach + alias_correlate) | passive_only | Rule 4 |
| `osint_username_passive` | 2 (multiplatform + social_account_validate) | passive_only | Rule 5 |
| `osint_organization_recon` | 3 (ct_email_mining + github_personnel + email_pattern_inference) | passive_only | Rule 6 (DISABLED) — direkt im web_recon-Flow eingebaut |
| `api_security_active` | 4 (openapi_discovery + api_auth_probe + api_cors_check + api_rate_limit_safe) | active_safe | Rule 8 (auto bei rest_api) |
| `osint_pivot_light` (Sprint 1.4) | 5 (dns_records + tls_cert + http_headers + domain_whois_passive + domain_impressum_extract) | passive_only | Sprint-5-Rule (DISABLED bis Cross-Domain-Discovery aktiv) — manuell startbar |

## Worker-Inventar (28 Stand Sprint 2)

```
passive/ (23):
  dns-records (apex-aware + Sprint 2 #7: DMARC-rua-Email + DNS-Verifications-
    Pivot + Cloudflare-NS-Pair-Pivot + MX/SPF-Provider-Klassifikation),
  tls-cert (Sprint 2 #12: Validity-Gate + SAN-Discovery + Provider-Filter),
  http-headers, subdomain-passive (Sprint 2 #13: Multi-Source-Aggregator
    subfinder+crt.sh+HackerTarget+Wayback+DNS-BF + Live-Verify + Stale-Markierung),
  wp-passive-check, service-classify (Phase 4),
  email-{dns-signals,gravatar,github-commits,holehe-passive,breach-check,
        pattern-inference,alias-correlate}, github-secret-scan,
  domain-{ct-email-mining,github-personnel}, username-multiplatform,
  phone-normalize, social-account-validate,
  Sprint 2 NEU: domain-whois-passive (RDAP IANA-Bootstrap),
                domain-impressum-extract (DDG-§5-Compliance + Cross-Domain-NER + CF-Email-Decoder),
                domain-microsoft-tenant (M365 Entra-ID Tenant-Detect),
                domain-html-pivots-extract (Tracking-IDs + Build-Hashes → secu_html_pivots)

active/ (8):
  tls-deep (testssl), nuclei-safe (~13k templates), nmap-top1000,
  http-paths-probe, openapi-discovery (Phase 4), api-auth-probe (Phase 4),
  api-cors-check (Phase 4), api-rate-limit-safe (Phase 4)
```

Worker-Registry: `src/lib/security/workers/worker-registry.ts`. Bei neuem Worker: registrieren, jobKey in `worker.types.ts` ergänzen, scope-Begründung im Header dokumentieren.

## Operative Befehle (Claude darf das direkt ausführen)

### Logs streamen
```bash
npx pm2 logs node-secu --lines 50           # last 50 lines (one-shot)
npx pm2 logs node-secu --lines 200 --nostream | tail -100   # for grep
```

### Service neustarten
```bash
./restart.sh                # full restart via PM2
npx pm2 restart node-secu   # quick restart, nutzt cached dist
```

### Build (NICHT `npm run build` direkt — der `&&` failt wegen pre-existing template-errors)
```bash
npx tsc -p tsconfig.json; npx tsc-alias -p tsconfig.json; cp -r public dist/public
```
Die zwei Errors in `generated/api/base/routes.{app_info,users}.ts` (NodeTemplateUser fehlt) sind pre-existing Template-Bugs, blockieren aber den Emit nicht (kein `noEmitOnError` aktiv).

### DB-Inspektion
```bash
PGPASSWORD=example psql -h localhost -p 5454 -U postgres -d postgres
# Postgres läuft auf Port 5454, db=postgres, user=postgres, pwd=example.
```

### Wichtige DB-Queries
```sql
-- Alle Engagements + Entities
SELECT id, name, slug, kind, status FROM secu_engagements ORDER BY id;
SELECT id, kind, canonical_key FROM secu_entities ORDER BY id;

-- Letzte Playbook-Runs
SELECT id, playbook_key, status, started_at, finished_at,
       EXTRACT(EPOCH FROM (finished_at-started_at))::int AS sec
FROM secu_playbook_runs ORDER BY id DESC LIMIT 10;

-- Worker-Run-Aggregat pro Run
SELECT worker_key, status, COUNT(*)
FROM secu_worker_runs WHERE playbook_run_id=$RUN GROUP BY worker_key, status
ORDER BY worker_key;

-- Findings pro Engagement
SELECT category, severity, COUNT(*) FROM secu_findings WHERE engagement_id=$E
GROUP BY category, severity ORDER BY category, severity;

-- Findings sortiert nach Severity (Customer-Report-View)
SELECT severity, category, title, entity_id FROM secu_findings WHERE engagement_id=$E
ORDER BY array_position(ARRAY['critical','high','medium','low','info']::text[], severity::text), category;

-- Auto-Chain-Audit: welche Rules feuerten wann
SELECT id, name, fire_count, last_fired_at FROM secu_rules WHERE fire_count > 0 ORDER BY last_fired_at DESC;

-- Service-Classify-Ergebnisse pro Host (Phase 4)
SELECT id, canonical_key, data->>'serviceType' AS svc, data->'serviceSignals' AS sig
FROM secu_entities WHERE data ? 'serviceType' ORDER BY id;

-- Sprint 2 #7 — DNS-Verifications-Pivot (google_site_verification, ms365, …)
SELECT engagement_id, entity_id, id_type, id_value, source FROM secu_dns_verification_pivots
ORDER BY engagement_id, entity_id;

-- Sprint 2 #7 — DNS-NS-Pivot (Cloudflare-NS-Pair = pro CF-Account eindeutig)
SELECT engagement_id, entity_id, id_type, id_value, source FROM secu_dns_ns_pivots
ORDER BY engagement_id, entity_id;

-- Sprint 1.3 — Hop-Chain pro Engagement (welcher Run hat welchen ausgelöst)
SELECT id, playbook_key, hop_depth, parent_run_id, status, finished_at
FROM secu_playbook_runs WHERE engagement_id=$E ORDER BY id DESC LIMIT 20;

-- Sprint 1.2 — Speculative-Entities ausschließen vs. einschließen
SELECT id, kind, canonical_key,
       data->'provenance'->>'confidence' AS conf,
       data->'provenance'->>'speculative' AS spec
FROM secu_entities
WHERE data->'provenance' IS NOT NULL ORDER BY id;

-- Sprint 2 #11 — HTML-Pivots (Tracking-IDs + Build-Hashes)
SELECT engagement_id, entity_id, id_type, id_value, source_url FROM secu_html_pivots ORDER BY id;

-- Cross-Engagement-Pivot-Suche: gleiche Build-Hashes/Tracking-IDs in mehreren Engagements
SELECT id_type, id_value, COUNT(DISTINCT engagement_id) AS engagement_count, ARRAY_AGG(DISTINCT engagement_id) AS engagements
FROM secu_html_pivots GROUP BY id_type, id_value HAVING COUNT(DISTINCT engagement_id) > 1
ORDER BY engagement_count DESC, id_type;

-- Sprint 2 #13 — Stale vs Live Subdomains pro Engagement
SELECT data->>'parentDomain' AS root, COUNT(*) FILTER (WHERE data->>'resolves'='true') AS live,
       COUNT(*) FILTER (WHERE data->>'resolves'='false') AS stale
FROM secu_entities WHERE kind='asset_subdomain' GROUP BY data->>'parentDomain';
```

## HTTP-Endpoints für Run-Operations

```bash
# List registry (alle bekannten Playbooks)
curl http://localhost:8108/playbooks

# Start Run — body required
curl -X POST http://localhost:8108/engagements/$E/playbooks/$KEY \
  -H "Content-Type: application/json" \
  -d '{"rootEntityId":$N,"triggeredBy":"claude"}'
# → 202 mit {success:true, data:{runId,status,playbook}}
# (vor Phase-4-Fix: 202 wurde fälschlich als success:false markiert; in lib/communication.ts behoben)

# List Runs eines Engagements
curl http://localhost:8108/engagements/$E/playbooks/runs

# Single Run-Status mit Step-Summary + worker_runs
curl http://localhost:8108/engagements/$E/playbooks/runs/$RUN
```

## Test-Engagement (Production-Like)

- **engagement_id=4**, slug=`self-audit-niccaswilliams-com`
- **Root-Entity**: id=20, kind=asset_domain, canonical_key=`niccaswilliams.com`
- **Authorization**: id=10, kind=`own`, scope=`active_intrusive` (full power, ist eigene Domain)
- 7 Subdomains aus CT-Logs (alle ohne A/AAAA — passive-Erkennung von dangling Subs)

Für End-to-End-Tests immer hier loslaufen — niemals gegen fremde Domains scannen.

## Fehlerbilder + Sofort-Diagnose

| Symptom | Ursache | Fix |
|---|---|---|
| Run bleibt forever in `running` | App-Crash mitten im Run, kein Cleanup | `./restart.sh`; Run-Row manuell auf `failed` setzen oder löschen |
| `success:false` bei 202-Antwort | (vor Phase 4 fixed) `responseHandler` nahm nur 200/201/204 als success | `src/lib/communication.ts:82` — alle 2xx als success |
| Worker-Runs alle `failed` mit "host not resolvable" | DNS-Failure auf toter Subdomain | OK, `resolve-host.ts` Pre-Check; Run gilt trotzdem als completed wenn andere Worker durchkamen (Phase-4-Fix in playbook-runner.ts) |
| `unknown_playbook:xyz` in Audit-Log | Playbook nicht in `bootstrap.ts` registriert | dort `registerPlaybook(...)` ergänzen |
| Rule feuert nicht | Condition matchte nicht oder Rule ist disabled | `SELECT * FROM secu_rules WHERE name LIKE '%xyz%'`; Conditions sind json-logic mit dot-path-`var` |
| testssl/nuclei timeout | Tool-spezifische Limits | `defaultTimeoutMs` im Worker; Step-level `timeoutMs` in Playbook-Definition |

## Ein Scan-Run von innen nachverfolgen

Wenn ein Run gestartet wurde, kann man so live mitschauen:

```bash
# Terminal 1: Logs
npx pm2 logs node-secu --lines 100

# Terminal 2: Worker-Run-Status alle 5s
watch -n 5 "PGPASSWORD=example psql -h localhost -p 5454 -U postgres -d postgres -c \"SELECT worker_key, status, COUNT(*) FROM secu_worker_runs WHERE playbook_run_id=\$RUN GROUP BY worker_key, status ORDER BY worker_key;\""
```

Pro Step gibt's eine `[playbook-runner]`-Zeile in den Logs. Discovered entities feuern `[secu]`-Events, die wiederum vom Rule-Evaluator gepickt werden — dort steht dann z.B. `[rule-evaluator] firing rule "Service rest_api → api_security_active"`.

## Wo neue Playbooks/Worker hinkommen

```
neuer Worker  → src/lib/security/workers/{passive|active}/<name>.worker.ts
              → jobKey in src/lib/security/workers/worker.types.ts
              → registerWorker(...) in src/lib/security/workers/worker-registry.ts

neues Playbook → src/lib/security/playbooks/definitions/<name>.ts
              → registerPlaybook(...) in src/lib/security/bootstrap.ts

neue Auto-Chain-Rule → ensureRule({...}) in bootstrap.ts (idempotent für bestehende DBs)
                    → ALSO in src/db/individual/individual-seed.ts (für frische DBs)
```

## Was Claude NICHT machen darf

- **`canScan()` umgehen** — auch nicht "nur für Tests". Nutze stattdessen das Test-Engagement mit `internal_lab`-Authorization.
- **Manuell SQL-Migrationen schreiben** — IMMER `./schema-ready.sh` (db:generate + db:migrate).
- **Scan gegen fremde Domains** — nur eigene oder mit explizitem `written_consent`/`verified_ownership`.
- **Findings/Rules manuell in der DB löschen** ohne Audit-Trail. Stattdessen: `DELETE` über Service mit Audit-Log oder via API-Endpoint.
- **Auth-Middleware-Skip in Production aktivieren** — der `AUTH_MODE=williams`-Skip ist nur lokal.

## Hot-Reload-Status

`pnpm run run:dev` nutzt nodemon — Änderungen unter `src/` triggern automatisch Restart. Bei Änderungen an Workers/Playbooks reicht das. Bei Schema-Änderungen: `./schema-ready.sh` gefolgt von `./restart.sh`.

PM2 in der "production-like"-Umgebung (was hier lokal läuft) hat watch-Modus aktiv (`watching: enabled`) — d.h. Änderungen unter `dist/` lösen Restart aus. Workflow: `npx tsc -p tsconfig.json; npx tsc-alias -p tsconfig.json` → PM2 picked auto.

---

**Wenn du irgendwas in dieser Datei stale findest: update sie.** Insbesondere bei neuen Playbooks/Rules — der nächste Claude liest das als erstes.
