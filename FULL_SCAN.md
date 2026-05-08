# FULL_SCAN.md — Roadmap Phase 5–8

> **Zweck**: präziser Plan, wie node-secu von "Symptom-Detection" zu "interpretierbar guten Customer-Reports" wächst. Lesbar als Standalone-Dokument für eine frische Session.
>
> **Vorausgesetzt gelesen**: `CLAUDE.md` (Mission + Scope-Modell), `.claude/scan-operations.md` (operative Befehle).
>
> **Stand**: 2026-05-08. Phase 4 produktiv. Dieses Dokument plant Phase 5–8.

---

## 0. North Star

"Wirklich gute Analyse-Daten" heißt für uns konkret 4 Dinge — alles andere ist nice-to-have:

1. **Präziser Tech-Stack pro Host**: Frontend-Framework + Major-Version, Backend-Framework + Major-Version, Auth-Mechanismus, DB-Engine, CDN/Edge-Layer, Build-Tooling — nicht nur "Server: nginx".
2. **Stack-kontextualisierte Findings**: "CSP fehlt auf Next.js 14" ist anders kritisch als "CSP fehlt auf einem statischen Hugo-Blog". Reports sprechen die Sprache des Customer-Stacks.
3. **Confidence-Score + Interpretation-Note pro Finding**: jedes Finding trägt mit, ob es geprüft (verified PoC), wahrscheinlich (Pattern-Match), heuristisch (Indizien) oder kontextuell (info) ist. Plus eine Klartext-Note "warum dies kein false positive ist / unter welcher Bedingung das Finding gilt".
4. **Honeypot/Falle-Bewusstsein**: vor jedem aktiven Probe ein Reality-Check, dass der Target-Host ein echter Service ist, nicht ein Trap. Score wird in Findings durchgereicht.

Wenn ein Customer einen Report bekommt, soll er nicht denken "Liste von Symptomen die ein Tool gespuckt hat", sondern "jemand mit Verstand hat unser System verstanden".

---

## 1. Stand 2026-05-08 (Phase 4 deployed)

Solide funktionierend (siehe `scan-operations.md` für Details):
- DNS/TLS/HTTP-Header-Hygiene (passive_only)
- Subdomain-Discovery via subfinder + crt.sh
- Active-Safe Tier: testssl, nuclei (~13k Templates), nmap-top1000, http-paths-probe
- API-Discovery (OpenAPI/Swagger-JSON-Endpoints)
- 4 API-Security-Worker (auth-probe, cors-check, rate-limit-safe)
- 5-Bucket Service-Klassifikation (webserver / rest_api / spa / mailserver / tcp_only / unknown)
- 13 OSINT-Worker für Email/Username/Domain-Personnel
- Auto-Chain via Rule-Engine: discovered email → osint_email_passive; serviceType=rest_api → api_security_active

**Wo wir bisher zu grob sind** (priorisiert, evidenzbasiert aus Run #5+#6):

| # | Lücke | Konkretes Beispiel | Konsequenz |
|---|---|---|---|
| 1 | Tech-Detection nur via Server-Header + X-Powered-By | erkennt "nginx" und "Express", aber nicht Next.js@14 / Nest.js / Postgres-Engine | Tool-Auswahl bleibt generisch (13k Templates blind feuern statt 50 spezifische) |
| 2 | HTML-Body wird zu kurz inspiziert (4KB) | erkennt `id="root"` für SPA, übersieht `<meta name="generator" content="Drupal 10">` | CMS-Versionierung schlägt fehl |
| 3 | Cookie-Names werden gar nicht ausgewertet | sieht `connect.sid` aber nutzt es nicht als Express-Beweis | starkes Stack-Signal verloren |
| 4 | Kein Favicon-Hash, kein JARM, kein JA3 | gleiches Backend auf 5 IPs wird 5× analysiert ohne Cluster-Erkennung | redundante Findings, schlechter Report |
| 5 | OpenAPI-Parse oberflächlich (nur Pfade) | sieht 80 Endpoints aber nicht `info.x-generated-by: FastAPI 0.110` | exakte Backend-Identifikation entgeht uns |
| 6 | `/docs`, `/redoc`, `/swagger-ui/` als HTML-Pages werden ignoriert | nur die Plain-JSON-Variante wird geprobt | viele Apps haben nur die HTML-Page öffentlich |
| 7 | Frontend-Bundle-Inspection fehlt | Next.js-`/_next/static/.../page.js` enthält oft Sentry-DSN, embedded API-URLs, Sourcemap-Links | exakte Versions-Disclosure verpasst |
| 8 | Honeypot-Detection fehlt komplett | erkennt nicht, dass 100 offene Ports + Apache 2.0.43 ein Cowrie-Honeypot ist | Findings auf Trap-Hosts gelten als legitim → false positives |
| 9 | Confidence-Scoring fehlt | "BREACH-vulnerable" gleich gewichtet wie "robots.txt verrät 9 Pfade" | Customer kann nicht priorisieren |
| 10 | Interpretation-Notes fehlen | "Health-Endpoint leakt Backend-Details" — was bedeutet das in seinem Stack? | Report ist Datenbank-Dump statt Erklärung |
| 11 | Keine Reproducibility-Checks | ein Flake-200 wird genauso ernst genommen wie ein konsistenter Befund | unzuverlässige Befunde |
| 12 | Geo-/Zeit-Konsistenz wird nicht gemessen | Scanner steht in DE, Customer-Server liefert nur in EU 200 — wir interpretieren den 403 falsch | regionale false positives |

---

## 1.5 Run-#7-Validation (2026-05-08, 12:40 UTC) — was offen geblieben ist

Run #7 (web_recon_active gegen niccaswilliams.com nach Phase-4-Deploy + spawnTool-Hardening) lief in 190s sauber als `completed` durch. Dabei sind aber konkrete Probleme aufgefallen, die **vor** Phase 5 adressiert werden müssen — sonst baut Phase 5 auf einer unvollständig validierten Basis auf.

> **Status (2026-05-08, Phase 4.5 Trust-Layer)**: Punkte 1.5.1, 1.5.2 sind im Code adressiert (Trust-Gates im playbook-runner + worker-runner; rule.evaluated-Audit-Trail; nuclei-safe parst Templates-Loaded und failed bei <1000 oder verdächtig kurzen Runs). 1.5.3, 1.5.5, 1.5.6, 1.5.7 sind **Operator-Aktionen** und bleiben auf der Liste. 1.5.4 (Dangling-Subdomain-Detection) ist als Phase-5-Sub-Worker offen.

### 1.5.1 nuclei_safe lief in 2.2 Sekunden — verdächtig zu schnell ✅ Code-Fix

**Status (2026-05-08)**: behoben in `worker-runner.ts` + `nuclei-safe.worker.ts`.

Konkrete Änderungen:
- `WorkerResult.exitCode?: number | null` ergänzt (siehe `worker.types.ts`).
- `playbook-runner` + neuer Shared `worker-runner.ts` persistieren `exitCode` nach `secu_worker_runs.exit_code`.
- **Trust-Downgrade**: ein Worker, der `success=true` meldet aber gleichzeitig einen exit_code ≠ 0 oder NULL liefert, wird vom Runner zu `status=failed` heruntergestuft. Fehler-Tag: `worker_trust_downgrade:exit_code=<value>`. Damit kann genau der Run-#7-Fall (success=true, exit_code=NULL) nicht mehr passieren.
- `nuclei-safe`: parst aus stderr `Templates loaded for current scan: N`, persistiert `templatesLoaded` in `rawOutput`. Bei `templatesLoaded < NUCLEI_MIN_TEMPLATES` (default 1000) ODER `durationMs < 10s ohne Stats` → `success=false` mit erklärendem Error.
- `nuclei-safe` propagiert `result.exitCode` direkt in `WorkerResult` — kein Override mehr von success=false zu success=true bei nicht-leerem stdout.



`secu_worker_runs` für Run #7, worker_key=nuclei_safe (id=188): `status=completed, duration_ms=2245, exit_code=NULL, error=NULL`. Bei 13k aktivierten Templates erwartet man 3-10 Minuten gegen einen Live-Apex.

**Smoking gun: `exit_code=NULL`**. Dass die Row als `completed` markiert ist, exit_code aber NULL, heißt: spawn-tool.ts hat success=true mit fehlendem Code resolved — möglicher Pfad: `child.on("close", (code, signal) => finish(code, signal))` wurde vor `child.on("exit", ...)` gefeuert mit `code=null`, weil Prozess via Signal endete. Dann fällt isAllowedExit auf false, success=false. Aber laut DB ist success... eigentlich gibt's kein direktes success-Feld in secu_worker_runs, nur status. Status=completed kommt aus `result.success ? "completed" : "failed"` in playbook-runner. `result.success` wäre bei `exit_code=null` aber FALSE. Also stimmt was nicht.

Mögliche Ursachen:

| Hypothese | Diagnose-Schritt |
|---|---|
| nuclei exit code wird nicht korrekt persistiert | `nuclei-safe.worker.ts` Review: wie wird das spawnTool-Result auf WorkerResult gemappt? Setzt es success=true wenn stdout-Lines vorliegen, ignoriert exit_code? |
| nuclei findet keine matching templates für SPA-Stack | `nuclei -u https://niccaswilliams.com -silent -t ~/nuclei-templates/ -j 2>/dev/null \| wc -l` lokal manuell laufen lassen — Erwartung ≥10 Tests bei 13k Templates |
| spawn-Args sind kaputt (Templates-Pfad falsch resolved) | nuclei-safe.worker.ts ansehen: wo kommt `-t` her? Absolute Pfade oder relativ? |
| Templates-DB hat 0 anwendbare Templates für Plain-HTML-Apex | nuclei mit `-stats` und `-debug` lokal laufen, Template-Match-Count beobachten |

**Action vor Phase 5**: 
1. nuclei-safe.worker.ts Review (das war Phase-3-Code, nicht Phase-4 — aber jetzt wird's relevant).
2. nuclei muss `templatesExecuted: N`, `requestsFired: N` in rawOutput persistieren.
3. `secu_worker_runs.exit_code` muss bei NULL automatisch → status=failed gemappt werden, wenn `success=true` gemeldet wurde. Aktuell vertraut der Runner blind dem WorkerResult.success.

### 1.5.2 Rule fire_count = 0 für ALLE Rules trotz 8 entity.updated-Events ✅ Code-Fix

**Status (2026-05-08)**: Observability behoben in `rule-evaluator.ts`. Der `fire_count`-Bug war kein Bug — die Rules mit `condition` haben nicht gematched (richtig), und ohne Match wird `fire_count` per Definition nicht inkrementiert. Das zugrundeliegende Problem war fehlende Beobachtbarkeit: man sah die Evaluation nicht im Audit-Log.

Konkrete Änderung: pro Rule × Event, dessen Scope matched, schreibt der Evaluator jetzt einen `rule.evaluated`-Eintrag in `secu_audit_log` mit Payload `{eventType, ruleName, conditionResult, willFire, conditionError}`. Schreibe ich `void` (fire-and-forget), weil das im Hot-Path liegt — Persist-Fehler sind non-fatal. Bei Condition-Exception: action=`rule.condition_failed` mit `success=false`. Bei erfolgreichem Fire: zusätzlich `rule.fired` (existing).

Operator-Query für Run-#X:
```sql
SELECT action, payload, success FROM secu_audit_log
WHERE action LIKE 'rule.%'
  AND created_at > now() - interval '5 minutes'
ORDER BY created_at;
```



Run #7 hat via service_classify 8× `entity.data.serviceType` gepatched → `entity.updated`-Event publishes. Rule 8 (Service rest_api → api_security_active) hätte 8× evaluieren müssen, jedes Mal mit Condition-Result `false` (serviceType war "spa" oder "unknown", nicht "rest_api"). **Aber `secu_rules.fire_count = 0` und `last_fired_at = NULL` für ALLE 8 Rules**.

Mögliche Ursachen:
- `fire_count` wird nur bei Condition-Match incrementiert, nicht bei Evaluation. Per Definition vielleicht OK, aber dann fehlt komplette Observability über Rule-Evaluations.
- Rule-Evaluator hat das Update-Statement nicht oder es hängt in einer transaction.
- entity.updated-Events werden nicht oder nicht korrekt published vom entity.service.ts-patchData → Rules sehen sie nie.

**Test-Schritt**: in `secu_audit_log` nach action LIKE 'rule%' suchen — Run #7 hat 0 Treffer, was bedeutet **die Rule-Engine emittet gar keine Audit-Einträge**. Das ist der Observability-Bug. Rule-Engine muss MINDESTENS bei jedem Evaluation einen audit-log-Eintrag schreiben (action `rule.evaluated`, payload mit ruleId/conditionResult/triggerEvent).

**Action vor Phase 5**: Rule-Engine bekommt `rule.evaluated` Audit-Trail. fire_count nur incrementen wenn condition true UND action erfolgreich gestartet. Ohne diese Observability ist Phase-6-Auto-Routing blind.

### 1.5.3 niccaswilliams.com ist suboptimal als Validation-Target ✅ ersetzt durch geilemukke.de

**Status (2026-05-08)**: durch den Run #1 gegen geilemukke.de erledigt — die Domain hat genau die Diversität, die für Phase-4-Auto-Chain-Validation gebraucht wird:
- 5 Subdomains entdeckt (bills, email, picknick, williams, amp)
- 3× echtes `rest_api` (bills, picknick, amp) → Rule 7 fire_count=5 (mit dem Engagement-Lookup-Fix; siehe §1.5.2 + neuer Bugfix unten)
- 2× `api_security_active` Auto-Chain-Run produktiv ausgeführt (Runs #2, #3): alle 4 Worker (openapi_discovery, api_auth_probe, api_cors_check, api_rate_limit_safe) liefen completed durch.
- 1× `dangling_platform` (picknick) → echtes Subdomain-Takeover-Finding (high)
- 1× DNS-tot Subdomain (williams) → korrekt als `unknown` und in worker_runs als failed
- Apex hat MX → `mailserver`-Klassifikation (korrekt, kein Frontend, wie Operator bestätigt)

**Bonus-Bugfix**: bei der ersten Run-Validierung kam Rule 7 mit `fire_count=3` aber 0 Auto-Chain-Runs durch — Bug im rule-evaluator: bei `entity.updated`-Events war `data.engagement` null, damit failed `actStartPlaybook` mit `"no engagement in scope"`. Fix: `loadEngagementForEntity()` joined `secu_engagement_entities` zur jüngsten Engagement-Verlinkung der Entity. Nach Re-Trigger via Ad-hoc-Worker-API: 2 Auto-Chain-Runs erfolgreich gestartet.



Phase-4-Pipeline läuft sauber durch, aber liefert nur eingeschränkte Validation-Tiefe:
- 7 von 8 entdeckten Subdomains sind DNS-tot (Apex + 7 stale CT-Log-Subs) → die meisten active-Worker DNS-failen direkt. Echte Active-Worker-Tests sind also nur am Apex.
- Apex ist `spa` klassifiziert → Rule 8 (rest_api → api_security_active) feuert korrekt nicht. Aber: damit sind die 4 neuen API-Security-Worker (openapi_discovery, api_auth_probe, api_cors_check, api_rate_limit_safe) **nie produktiv getestet worden**.
- Domain hat keine CT-Email-SANs → domain_ct_email_mining fand 0 Emails → Rule 4 (email → osint_email_passive) bekam nie Material. Per-Email-Auto-Chain ist ungetestet.
- Domain hat keine Personnel-GitHub-Hits → Rule 5 (username → osint_username_passive) bekam nie Material.

**Action vor Phase 5**: zwei zusätzliche Test-Engagements anlegen, beide gegen eigene/ausdrücklich erlaubte Targets:
- Engagement gegen einen Host mit live REST-API + OpenAPI-Doc (z.B. eines der eigenen node-* Services in einer staging-Konfiguration). Validiert: Rule 8 → api_security_active komplett, alle 4 API-Security-Worker.
- Engagement gegen eine Domain mit bekannten CT-Email-SANs (z.B. eine Public-OSINT-Demo-Domain wie `example.com` falls erlaubt, oder eigene Mail-Domain mit Outbound-DKIM-Cert). Validiert: Rule 4 + osint_email_passive Chain inklusive Multi-Hop-Triggern.

### 1.5.4 service_classify "unknown"/Orphan-Detection ✅ Code-Fix (teilweise)

**Status (2026-05-08, Run #1 gegen geilemukke.de)**: drei service_classify-Bugs aufgedeckt + gefixt:

1. **GraphQL-False-Positive**: `probeGraphqlEndpoint()` triggerte bei jedem Express-Default-404 (`Cannot GET /graphql` enthält das Wort "graphql"). 2× false-positive `REST-API-Spezifikation öffentlich: /graphql` auf echten Node-Backends (bills/amp.geilemukke.de). **Fix**: GRAPHQL_STRONG_HINTS sind jetzt regex-basierte Strukturen (`"errors":[{...}]`, `"data":{...}`, `<title>GraphQL Playground`, `__schema`-introspection-Marker), kombiniert mit Status-Filter (200/400/405) und Express-404-Negative-Filter.

2. **Express-Default-404 als positives Signal**: Hosts wie bills/amp antworten mit `<pre>Cannot GET /</pre>` — das ist ein eindeutiges Express/Node-Backend-Signal, klassifiziert jetzt als `rest_api` mit `apiDocPath=null` (statt mit falschem GraphQL-Match). Beschreibung im Finding macht den Detection-Pfad explizit.

3. **Dangling-Platform-Detection**: neuer ServiceType `dangling_platform` für Subdomains, die auf leere Hosting-Platform-Slots zeigen (Render `Application not found`, Heroku `no such app`, Vercel `DEPLOYMENT_NOT_FOUND`, Netlify `Site Not Found`, Fly.io, GitHub-Pages, AWS-S3 NoSuchBucket). Erzeugt `high`-Severity Subdomain-Takeover-Risk-Finding. Auto-Chain Rule 7 (`rest_api → api_security_active`) feuert nicht bei `dangling_platform` — kein wasted Scan auf Orphans.

**Validation auf geilemukke.de (Run #1 + Re-Klassifikation via Ad-hoc-API)**:
- bills/amp = `rest_api` (korrekt, via Express-404)
- picknick = `dangling_platform` (Render-Orphan) + High-Finding
- email = `webserver` (Login-Redirect)
- Apex = `mailserver` (MX, kein HTTP)
- williams = `unknown` (DNS-tot)

**Offen (Phase 5.2)**: dedicated dangling-Subdomain-Worker (CNAME-Resolution-Check für Cases ohne Hosting-Platform-Default-Page).



7 Hosts → `serviceType: unknown`. Im Customer-Report wäre das Noise. Bessere Heuristik: wenn `hasA=false && hasAAAA=false && hasMx=false` → Service-Type ist `dangling` und Worker emittet stattdessen ein **Subdomain-Takeover-Risiko-Hinweis-Finding** (oder skipped die Klassifikation komplett).

Dangling-Subdomains sind eines der klassischen Customer-Wow-Findings (CNAME auf gelöschte AWS-S3-Buckets / abandoned Heroku-Apps / etc.). Aktuell ignorieren wir sie.

**Action**: kleiner Sub-Worker `dangling_subdomain_check` (passive_only) — zieht CNAME, prüft ob target reachable. Nicht volles Subdomain-Takeover-Tooling, aber Erkennung der Klasse.

### 1.5.5 Hard-Deadline-Timer im spawnTool ist live, aber unter Last ungetestet

Run #7 lief in 190s — vermutlich sind weder nuclei (2s Verdacht) noch nmap (20s) lange genug gelaufen, um den neuen 15s-Grace-Hard-Deadline auszulösen. Der Mechanismus selbst ist eingebaut, aber wir wissen nicht ob er bei einem ECHTEN Long-Running-Tool sauber feuert.

**Test-Schritt**: einen synthetischen Worker bauen der `sleep 9999` ausführt mit timeoutMs=10000. Erwartetes Verhalten: nach 10s SIGTERM, nach 13s SIGKILL, bei 25s spätestens hard-deadline-resolve. Result-Object muss `timedOut: true, error: "timeout after 10000ms"` enthalten.

**Action vor Phase 5**: Unit-Test (oder mindestens manueller Smoke-Test) für spawnTool-Timeout-Behavior schreiben. Ohne den Test kann das gleiche Hang-Symptom in Phase-5-Workers wieder auftreten ohne dass wir's merken.

### 1.5.6 Apex-Fix-Wirkung nur indirekt nachgewiesen

Apex-Redundanz-Fix (dns_records-Worker schreibt non-apex-Findings nicht mehr) wirkt — Run #7 hat 0 neue DNS-Findings produziert. Aber die alten 21 redundanten Findings aus Run #4 sind weiterhin in `secu_findings` und werden bei jedem zukünftigen Run als "bereits bekannt" mitgeschleppt.

**Action**: kein Code-Fix nötig, aber operative Entscheidung — sollen wir die historischen Run-#4-Findings cleanen für saubere Customer-Reports? Vorschlag:
```sql
DELETE FROM secu_findings 
WHERE engagement_id=4 
  AND category='dns' 
  AND entity_id != 20 
  AND title IN ('DNSSEC nicht aktiviert', 'Kein CAA-Record', 'Keine A/AAAA-Records');
```
21 Rows weg. Braucht User-OK für DB-Write.

### 1.5.7 Cleanup-Pflicht: Run #6 Worker-Run-Rows

Run #6 wurde manuell als `failed` markiert. Aber: wenn wir Run-Statistiken für Customer-Reports nutzen, fließen Run #5 + #6 als 2 zusätzliche failed-Runs ein. Sollten wir:
- die zwei Failed-Runs aus dem Engagement-Audit-Trail behalten (Forensik-Wert)? — pro
- oder löschen für saubere Customer-Sicht? — pro

Empfehlung: **behalten**, aber im Engagement-Report nur Run #7 referenzieren. Reporting-Logic in Phase 8 muss `latestSuccessfulRun` und `failedRunsBefore` getrennt darstellen.

---

## 1.6 Phase 4.5 — Trust-Layer + Ad-hoc-Worker-API (deployed 2026-05-08)

Bevor Phase 5 startet, ist eine kleine Zwischenphase live, die die in §1.5 identifizierten Trust-Lücken schließt und gleichzeitig die operative Bedienbarkeit erweitert. Drei zusammenhängende Änderungen:

### 1.6.1 Shared Worker-Runner (`src/lib/security/workers/worker-runner.ts`)

Die "ein Worker × ein Target"-Logik (canScan-Gate, OSINT-Budget, Findings/Tech/Discovered-Entities-Persistierung, Trust-Downgrade) sitzt jetzt in einer einzigen Funktion `executeWorker(input)`. Sowohl der Playbook-Runner als auch die neue Ad-hoc-API rufen sie auf — d.h. Trust-Gates und Persistenz-Verhalten sind garantiert identisch egal woher der Trigger kommt. Vorher waren die ~150 Zeilen Loop-Body zwischen Playbook und (geplant) Ad-hoc dupliziert; das hätte langfristig zu divergierender Trust-Logik geführt.

### 1.6.2 Trust-Gate (Code-Konvention)

Im `executeWorker` und damit in jedem Worker-Run gilt:

| Worker-Output | Persistierter Status |
|---|---|
| `success=true`, `exitCode === undefined` (Nicht-CLI-Worker, z.B. HTTP-Probes) | `completed` |
| `success=true`, `exitCode === 0` | `completed` |
| `success=true`, `exitCode === null` (Timeout / Signal-killed) | **`failed`** + `error="worker_trust_downgrade:exit_code=null"` |
| `success=true`, `exitCode !== 0` (z.B. CLI-Tool exit 1) | **`failed`** + `error="worker_trust_downgrade:exit_code=<value>"` |
| `success=false` | `failed` + Worker's `error` |

So kann nicht mehr passieren, dass nuclei in 2 Sekunden mit exit_code=NULL als "completed" markiert wird (siehe §1.5.1).

### 1.6.3 Ad-hoc-Worker-Trigger-API

Operator kann jeden registrierten Worker einzeln laufen lassen, ohne ein vollständiges Playbook starten zu müssen. Vier Endpoints unter `/workers` und `/engagements/:id/workers/...`:

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/workers?scope=…&targetKind=…` | Registry-Liste, optional gefiltert |
| `POST` | `/engagements/:id/workers/:workerKey/run` | Synchron 1× Worker gegen 1× Entity laufen lassen |
| `GET` | `/engagements/:id/workers/runs?workerKey=…&status=…&entityId=…&limit=…` | Worker-Run-Liste eines Engagements |
| `GET` | `/engagements/:id/workers/runs/:runId` | Einzelner Worker-Run (incl. exit_code, error, durationMs) |

**Beispiel — nuclei nachträglich auf eine Subdomain feuern:**
```bash
curl -sS -X POST \
  http://localhost:8108/engagements/4/workers/nuclei_safe/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entityId": 27, "timeoutMs": 600000}'
```

Response (200): kompletter `ExecuteWorkerOutput` inkl. `workerRunId`, `status`, `findingsCreated`, `exitCode`, optional `error`.

**Wann nutze ich das vs. `POST /engagements/:id/playbooks/:playbookKey`?**
- Ad-hoc ist: "nur diesen einen Worker, gegen genau diese Entity, jetzt sofort."
- Playbook ist: "die volle Pipeline mit allen Folge-Workern und Auto-Chain."

Use-Cases für Ad-hoc:
- Re-Run von `nuclei_safe` nach Template-Update.
- Trust-Re-Validierung wenn ein Run als `failed` markiert war (z.B. wegen Trust-Downgrade), aber inzwischen das Tool gefixed ist.
- Gezielte Forensik auf einer einzelnen Entity (z.B. `service_classify` neu ausführen nachdem manuell `entity.data.hasA` korrigiert wurde).
- Test-Drives einzelner Phase-5-Worker (`tech_fingerprint`, `favicon_fingerprint` etc.) ohne dass das ganze Playbook stehen muss.

**Authorization-Garantie**: derselbe `canScan()`-Gate wie via Playbook. Ein Operator kann via Ad-hoc-API also nicht mehr Rechte ausüben als das Engagement erlaubt.

---

## 2. Roadmap Phase 5–8

Jede Phase liefert ein in sich schlüssiges Inkrement, ist eigenständig deploybar und blockiert die nächste Phase nicht. Tools innerhalb einer Phase können parallel gebaut werden.

### Phase 5 — Deep Tech-Detection (passive_only)

**Ziel**: Stack-Identifikation präzise genug, dass Phase-6-Tool-Routing sinnvoll wird.

**Status (2026-05-08)**: `tech_fingerprint` ist deployed (siehe §1.6.1 + Pattern-Matcher unter `src/lib/security/tech/`). Die übrigen sechs Worker dieser Phase sind offen.

**Worker (alle passive_only — kein neuer AuthZ-Tier nötig)**:

| jobKey | Was es tut | Output | Status |
|---|---|---|---|
| `tech_fingerprint` ✅ | Wappalyzer-equivalent: Pattern-DB (~40 Patterns initial) matcht gegen HTTP-Header + Cookies + HTML-Body + JS-Bundle-URLs + Generator-Meta. Implies-Resolution (Next.js → React additiv). | `entity.data.tech` (deduped Array) **+** `entity.data.techStructured = { frontend, backend, cms, edge, web_server, language, other[] }` | deployed |
| `favicon_fingerprint` | mmh3-Hash der Favicon, Lookup gegen kuratierte Hash-DB (Shodan-Format-kompatibel) | `entity.data.faviconHash` + optional Tech-Hint via Lookup | offen |
| `tls_fingerprint_jarm` | JARM-Probe (10 spezifische TLS-Handshakes), 62-Char-Hash → Server-Stack-Identifikation auch wenn Header gestrippt | `entity.data.jarm` + Edge-Layer-Hinweis | offen |
| `frontend_bundle_inspect` | lädt erstes JS-Bundle (max 2MB), extrahiert: Build-Tool (webpack/vite/esbuild/parcel), embedded URLs, eingebettete CDN-Lib-Versionen, Sentry-DSN-Pattern, Sourcemap-URLs | Findings (info bei Disclosure, low bei Sourcemap-Public) + tech-Anreicherung | offen — Sourcemap-/Sentry-DSN-Detection bereits in `tech_fingerprint` als HTML-Body-Scan; Bundle-Loading + Build-Tool-Detection bleibt |
| `openapi_deep_inspect` | erweitert openapi_discovery: parst `info.x-*`, Auth-Schemes, Schema-Naming-Konventionen → Backend-Stack-Inferenz | tech-Anreicherung + Auth-Schema-Doc | offen |
| `docs_page_discovery` | HTTP-Probes auf `/docs`, `/redoc`, `/swagger-ui/`, `/api/docs`, `/graphql/playground`, `/admin/api-docs` (HTML-Pages, nicht JSON) | tech-Anreicherung + Spec-URL fürs openapi_deep_inspect | offen |
| `cookie_intel` | analysiert Set-Cookie-Names + Werte-Pattern: `connect.sid`/`JSESSIONID`/`csrftoken+sessionid`/`PHPSESSID`/etc. | tech-Anreicherung mit hoher Confidence | teilweise — Cookie-Names werden bereits in `tech_fingerprint` als Pattern-Source genutzt; offen ist Werte-Pattern-Analyse |

**Architektur-Entscheidungen**:
- Outputs landen primär in `entity.data.tech`, **nicht** in Findings. Tech-Stack ist Kontext, nicht Risiko.
- Findings nur für **Tech-bezogene Risiken**: Sourcemap-Disclosure, Sentry-DSN-im-Bundle, exposed Build-Manifest.
- `tech_fingerprint` läuft NACH http_headers + service_classify (depends-on). Kann andere Worker-Outputs nicht direkt lesen → eigene Probes.
- Pattern-DB als JSON-File im Repo (`src/lib/security/tech/patterns.json`), kein externes Service. ~3000 Patterns ist überschaubar.

**Definition of Done**:
- 20 manuell gelabelte Targets als Goldstandard. Auto-Output muss auf 90%+ Frontend-Framework + Backend-Framework korrekt identifizieren.
- Tech wird auf entity.data persistiert + ist via `secu_findings.evidence` referenzierbar.
- Existierende Worker (api_auth_probe, http_headers, etc.) lesen `entity.data.tech` und passen Heuristiken an (z.B. SPA-Skeleton-Detection statt blindem 200-OK-Reading).

**Mögliche Stolpersteine**:
- Wappalyzer-Patterns sind regex-basiert, regex-injections aus User-Input möglich → Worker muss Probes auf Public-Endpoints beschränken (kein Auth-Bypass-Versuch).
- Bundle-Inspect lädt 2MB pro Host — bei 50 Subdomains sind das 100MB. Throttling auf 1 concurrent + max Bundle-Size-Cap.

---

### Phase 6 — Stack-Aware Tool-Routing

**Ziel**: Statt 13k generic Templates feuern → stack-spezifische 50 Templates + Custom-Worker. 10× weniger false positives, 10× schneller, 10× klarerer Customer-Report.

**Worker**:

| jobKey | Scope | Trigger-Bedingung | Was es tut |
|---|---|---|---|
| `nuclei_stack_targeted` | active_safe | tech detected | nimmt detected stack, filtert Nuclei-Tags (`-tags next,react,…`), läuft nur diese |
| `next_recon` | active_safe | tech.frontend=next.js | Sourcemap-Discovery (`/_next/static/**/*.js.map`), getServerSideProps-Behavior, `/_next/data/`-Leaks, Image-Optimization-Endpoint-Probe |
| `spring_actuator_check` | active_safe | tech.backend=spring | Actuator-Endpoints (`/actuator/env`, `/heapdump`, `/loggers`, `/jolokia`) — RCE-Klasse |
| `laravel_debug_scanner` | active_safe | tech.backend=laravel | Debug-Mode-Detection (Whoops-Stacktraces, .env-Disclosure-Pattern) |
| `wordpress_deep` | active_safe | tech.cms=wordpress + wpscan installiert | Plugin/Theme/User-Enumeration via wpscan |
| `graphql_recon_safe` | active_safe | tech.api=graphql | Schema-Reconstruction via clairvoyance-Pattern (passiv, nicht via aktive Introspection), Query-Depth-Limit-Probe |
| `nestjs_recon` | active_safe | tech.backend=nest.js | Default-Route-Patterns, Common-Validation-Pipe-Bugs, Helmet-Config-Check |
| `fastapi_recon` | active_safe | tech.backend=fastapi | OpenAPI-Validierung (Pydantic-Type-Confusion), `/docs`-Default-Auth-Status |

**Auto-Routing**:
- Neue Rules in der Rule-Engine, Conditions wie `entity.data.tech.frontend == "next.js"` → start_playbook für Stack-spezifisches Folge-Playbook.
- Stack-spezifische Playbooks bündeln 1-3 Worker zu einem logischen Run.

**Definition of Done**:
- Pro Top-10-Stack (Next.js, Nest.js, FastAPI, Spring, Laravel, Rails, Express, Django, WordPress, Strapi) mind. 1 stack-spezifischer Worker existiert.
- Bei einem Test-Customer mit gepflanztem Stack-spezifischen Bug (z.B. Next.js Sourcemap public, Spring Actuator open) muss der entsprechende Worker den Bug finden.

**Mögliche Stolpersteine**:
- Stack-Detection ist nie 100% — Worker müssen `confidence:'low'`-Detections graceful handlen (entweder skip oder mit "spekulativ"-Tag im Finding).
- Nuclei-Tag-Mappings werden über Zeit drift'en. Pflegestrategie: einmal pro Quartal `nuclei -tl` ausführen und die Tag-Mapping-DB updaten.

---

### Phase 7 — API-Fuzzing-Layer (active_safe)

**Ziel**: aus OpenAPI-Spec automatisierte Tests generieren, die echte Bugs finden statt nur Header-Hygiene melden.

**Worker (alle active_safe, abhängig von explicit active_safe-Authorization)**:

| jobKey | Was es tut |
|---|---|
| `schemathesis_safe` | nimmt OpenAPI von openapi_discovery, läuft schemathesis im read-only-Modus (nur GET/HEAD), checkt Schema-Konformität der Responses, Type-Confusion via Boundary-Values, IDOR-Hinweise via ID-Permutation |
| `cors_per_endpoint` | erweitert api_cors_check um Per-Endpoint-Probe (statt nur Root) — manche Apps haben CORS-Misconfig nur auf bestimmten Routen |
| `auth_logic_probe` | für Endpoints mit `security: [bearer]` in OpenAPI: probieren ohne Token, mit invalid Token, mit expired Token, mit other-tenant-Token (wenn 2 Test-Accounts vorhanden) |
| `graphql_safe_probe` | wenn graphql detected: Schema-Inferenz + Query-Depth-Limit-Probe (max-depth 10, schauen ob Server reagiert) + Alias-Overloading-Check |
| `oss_fuzz_coverage_check` | für jede detected Library/Framework: Lookup gegen oss-fuzz/projects-Manifest. Lib gefuzzed = positiver Trust-Marker; Lib nicht gefuzzed + sicherheitsrelevante Rolle = Risiko-Hinweis |

**Architektur-Entscheidungen**:
- schemathesis läuft als CLI-Spawn (nicht Library-Embedded), via spawnTool.
- Rate-Limit fest verdrahtet: max 10 req/sec pro Host, hard-coded — kein Customer-Override.
- Read-only-Default: KEINE POST/PUT/PATCH/DELETE-Methoden ohne explicit active_intrusive Auth.
- `auth_logic_probe` braucht Test-Credentials. Engagement-Spec wird um `secu_engagement_test_accounts` Tabelle erweitert (separate Migration via schema-ready.sh).

**Definition of Done**:
- Bei einem Test-Customer mit absichtlich gepflanztem IDOR (Endpoint `/api/orders/{id}` ignoriert ownership-check) muss `auth_logic_probe` ihn finden.
- Bei einem Customer mit GraphQL-API ohne max-depth-Limit muss `graphql_safe_probe` das melden.
- Reports zeigen "diese Library wird in OSS-Fuzz kontinuierlich gefuzzed → Trust-Plus" als positive Note.

**Mögliche Stolpersteine**:
- schemathesis kann selbst mit `--phases=read-only` produktive Daten ändern, wenn die OpenAPI-Spec falsche Methoden deklariert (Spec sagt GET, Server akzeptiert auch POST). → Worker muss vor jedem Probe `OPTIONS` checken oder Methoden-Whitelist hart durchsetzen.
- IDOR-Detection braucht 2 Test-Accounts mit unterschiedlichen Daten. Wenn Customer nur 1 Account stellt → Worker skippt mit `skipReason: insufficient_test_accounts`.

---

### Phase 8 — Confidence + Reporting Layer

**Ziel**: aus Findings-Datenbank → Customer-lesbarer PDF/Markdown-Report mit Prio + Erklärungen.

**DB-Schema-Erweiterungen** (via schema-ready.sh, nicht manuell):
- `secu_findings.confidence`: `enum('verified', 'high', 'medium', 'low', 'speculative')`
- `secu_findings.interpretation_note`: text — Klartext "warum kein false positive / wann gültig"
- `secu_findings.honeypot_risk`: smallint 0-100 (gespiegelt von entity.data.honeypotScore zum Zeitpunkt der Discovery)
- `secu_findings.cvss_vector`: varchar (statt nur cvss_score)
- `secu_findings.proof_of_concept`: text (PoC-Snippet, optional)
- neue Tabelle `secu_reports`: pro Engagement N Reports, Markdown + Render-Cache

**Worker / Services**:
- `confidence_scorer`: nicht ein eigener Worker, sondern eine Pipeline-Stage NACH allen Workern. Nimmt finding draft, berechnet Confidence aus: Anzahl unabhängiger Bestätigungs-Quellen (Multi-Path-Triangulation), Reproducibility-Check-Ergebnis, Honeypot-Risk des Hosts, CVE-Match.
- `report_builder` Service: nimmt Engagement-ID, rendert Markdown nach Template. PDF via `puppeteer` oder `weasyprint`. Stack-Kontext aus `entity.data.tech` wird in jeden Finding-Block eingewoben.
- `cve_matcher`: detected Tech (z.B. `nginx@1.18.0`) → cve.org/NVD-Lookup → Findings für ungefixte CVEs auf detected Versions. **NICHT** als nur-CPE-Matching, sondern mit Kontext (CVE betrifft Modul X — ist Modul X auf diesem Host aktiv?).
- `oss_fuzz_lookup` Service (Phase 7 vorgezogen wenn schon nötig): Lookup-Cache gegen `github.com/google/oss-fuzz/tree/master/projects/`-Manifest.

**Report-Aufbau (Template-Sektionen)**:
1. **Executive Summary** (1 Seite): Stack-Identifikation, Risiko-Ampel, Top-3-Befunde
2. **Detected Tech-Stack**: Diagramm Frontend/Backend/Edge/DB/Auth, jeweils mit Version + Confidence
3. **Findings nach Severity**: pro Finding ein Block mit Title, Description, Interpretation-Note, Reproducibility-Status, Recommendation, optional PoC
4. **Coverage-Caveats**: was nicht gescannt wurde, warum (timeouts, geo-blocked, …)
5. **Honeypot/Reliability-Section**: pro Host wenn Score > 0, Erklärung
6. **Appendix — OSS-Fuzz Coverage**: Liste detected Libraries → ja/nein in OSS-Fuzz

**Definition of Done**:
- Ein generierter Report für niccaswilliams.com ist als PDF lesbar, würde von einem Customer ohne Erklärung verstanden, hat keine "Symptom-ohne-Kontext"-Bullets.
- Confidence-Score wird konsistent vergeben (manueller Review von 50 Findings, ≥80% stimmen mit menschlichem Urteil überein).
- Honeypot-Risk-Hosts werden im Report explizit markiert mit Caveat.

**Mögliche Stolpersteine**:
- CVE-Matching produziert massiv false positives bei zu loosem CPE-Matching. Strategie: nur CVEs mit `cvss >= 7.0` ODER explicit-affected-version-range → Findings.
- Interpretation-Notes manuell schreiben skaliert nicht — Templates pro Finding-Typ, vom Worker bei Generierung gefüllt.

---

## 3. Honeypot-Detection — Strategie

Honeypots versuchen Scanner zu täuschen mit:

| Honeypot-Frame | Symptom | Wer macht das (Beispiele) |
|---|---|---|
| **Banner-Spoofing** | SSH-Banner sagt "OpenSSH 5.3 (CVE-2010-XXX)", aber TLS/Verhalten modern | Cowrie, Kojoney2 |
| **Total-Open-Topology** | 100+ Ports antworten alle, alle mit Service-Banner | T-Pot, Honeyd |
| **Universal-200** | jeder HTTP-Pfad gibt 200 + plausibles HTML | Glastopf, Snare/Tanner |
| **Vulnerability-Theatre** | X-Powered-By + robots.txt mit `/admin` + verboseste Fehlermeldungen | Glastopf, HoneyDrive |
| **Auth-Acceptance** | SSH/FTP/Telnet akzeptiert beliebige Credentials | Cowrie default, Dionaea |
| **Fake-Database** | Postgres/Redis-Port antwortet mit "ich bin verwundbar"-Banner | Conpot, Dionaea |
| **JARM-Match** | TLS-Handshake-Hash matcht bekannte Honeypot-Stack-Hashes | T-Pot's TLS-Front |

**Worker `honeypot_score` (passive_only, läuft als Phase-5-Step)**:

Score 0-100, additiv gewichtet:

| Signal | Gewicht | Begründung |
|---|---|---|
| Port-Anomaly: >30 offene Ports | +25 | reale Hosts haben max ~20 |
| Banner-Inkonsistenz (Cert-Datum vs. Server-Header-Software-Alter > 10 Jahre) | +30 | TLS-Cert von 2024 + Apache 2.0.43 von 1999 = unmöglich |
| Universal-200: 5 random-uuid-Pfade → alle 200 mit gleicher Body-Length | +25 | Glastopf-Verdacht |
| JARM-Match gegen kuratierte Honeypot-JARM-DB | +40 | sehr starkes Signal |
| ASN-Reputation (SANS-ISC + Shadowserver Known-Honeypot-ASN) | +30 | Hoster ist Research-Network |
| rDNS-Pattern (`*.honey.*`, `*.research.*`, `*.sandbox.*`, `*.deceptive.*`) | +20 | offensichtliche Naming |
| Geo-Mismatch (Customer EU, IP in unerwartetes Land mit Crime-ASN) | +15 | nur Hint, nicht stark |
| Server-Date-Header drift > 1 Stunde | +10 | schlecht gewartet ODER fake |

**Score-Buckets**:
- **0-30**: green — alle Worker laufen normal
- **31-60**: yellow — Findings auf diesem Host bekommen `honeypot_risk: medium`, Report markiert
- **61-100**: red — aktive Worker (api_auth_probe, schemathesis, sqlmap) **stoppen** auf diesem Host. Reasoning: keine API-Auth-Probes auf einen Honeypot — wäre Bait und enthüllt unsere Methodik. Findings nur passive.

**Bewusst nicht im Score**:
- Hochpräzise Detection-Tools wie Honeyscore-API von Shodan ($) — wir wollen lokal entscheiden.
- DNS-Reputation-Listen (DNSBL) — zu viele false positives (real-Customer-VMs auf shared-Hosts landen oft drin).

---

## 4. False-Positive-Quellen außerhalb Honeypots

Diese Liste ist in Worker-Heuristiken einzubauen (siehe Phase 5 + 7 Worker-Specs):

| Quelle | Symptom | Korrektes Worker-Verhalten |
|---|---|---|
| **CDN-Edge-TCP-Wrapper** (Cloudflare/Fastly) | nmap meldet 100 Ports open, alle "tcpwrapped" | bereits behandelt: nmap_top1000 emittet `edge_sharing_pattern` info-finding statt 100 separate Port-Findings |
| **WAF-Lying-200** (Cloudflare WAF, Akamai, Imperva) | Status 200, Body "Access denied / blocked" | Worker muss Body-Inhalt parsen, nicht nur Status. Tokens: `access denied`, `blocked`, `cf-error`, `web application firewall` → downgrade zu info |
| **SPA-Catchall** | jeder Pfad 200 + index.html | Worker macht Negative-Control (random-uuid-Pfad probieren). Wenn auch 200 mit gleichem Body → Run für api_auth_probe als unzuverlässig markieren |
| **Geo-Fencing** | Server liefert in EU 200, in US 403 | Worker kann nicht selbst geo-rotieren, aber: Caveat in Report, dass Scanner aus DE läuft |
| **CDN-Cached-Errors** | 500-Response gecached, Service ist tatsächlich ok | Worker setzt `Cache-Control: no-cache` in Probes; trotzdem Caveat dass Cache CDN-seitig kontrolliert wird |
| **Tarpitting** | Server antwortet absichtlich langsam | Worker setzt `partial_scan_due_to_tarpit: true` flag; Report-Builder erwähnt im Coverage-Caveats-Sektion |
| **DPI/RST-Injection** durch ISP | Connection-Resets, "host not resolvable" | resolve-host Pre-Check fängt; bei wechselnden Failures pro Run → DPI-Verdacht im Audit-Log |
| **Reverse-Proxy-Header-Maskierung** | "Server: nginx" auf einem Java-Backend | Worker schaut auch auf Cookie-Names, Sourcemap, `/error`-Default-Pages, X-Custom-Headers — nicht nur Server-Header |
| **Kontextabhängige Findings** | "BREACH detected" — aber Page hat keine Secret-Tokens | Worker downgrade'd: BREACH ohne CSRF-Token/Auth-Cookie im Body = academic, nicht critical |
| **Public-OpenAPI-mit-leerem-paths** | `/openapi.json` existiert, aber `paths: {}` | nicht als "API exposed" werten |
| **401-mit-Information-Disclosure** | Status 401, Body enthält Stacktrace mit DB-Connection-String | Finding-Kategorie ist `exposure`, nicht `auth` — Auth funktioniert ja korrekt |
| **Self-Signed-Cert auf Staging** | testssl meldet INVALID, aber Hostname enthält `staging.` | downgrade — Staging ist nicht Production, Customer weiß das |

**Globale Regeln, die alle aktiven Worker einhalten müssen**:

1. **Reproducibility-Check**: kritische Probes (Findings mit severity ≥ medium) werden 2× mit 30s Abstand wiederholt. Nur wenn beide Ergebnisse übereinstimmen → Finding.
2. **Multi-Path-Triangulation**: severity ≥ high braucht ≥ 2 unabhängige Worker-Bestätigungen. Beispiel: BREACH-Finding nur valide wenn testssl ES sagt UND http_headers gzip-Compression detected hat.
3. **Negative-Control für api_auth_probe**: probiere zusätzlich einen random-uuid-Pfad. 200-OK auf den auch → SPA-Catchall-Verdacht, Run-Result als unzuverlässig markieren.
4. **Body-Content-Validation**: bei 200-OK-Findings nicht nur Status checken, sondern Body-Tokens für "blocked"/"denied"/"forbidden" suchen.
5. **Honeypot-Score-Gate**: Worker mit `honeypotScoreCap` Property — Worker definiert, ab welchem Score er nicht mehr läuft. api_auth_probe.honeypotScoreCap = 60, schemathesis.honeypotScoreCap = 50, dns_records.honeypotScoreCap = 100 (immer).

---

## 5. Interpretation-Pitfalls (kuratiert, treibt Worker-Verhalten)

Diese Liste ist konkret in Worker-Heuristiken zu implementieren, nicht nur Doku. Jeder neue Worker geht durch diese Checkliste:

| Pitfall | Symptom | Worker-Pflicht |
|---|---|---|
| **SPA-Skeleton** | jeder Pfad 200 + identical body length | Negative-Control mit random-uuid; bei Match: alle Auth-Probe-Findings nicht generieren |
| **WAF-Lying** | 200 + body "blocked" | Body-Token-Scan vor Severity-Zuweisung |
| **Edge-TCP-Wrapped** | nmap >50 ports open, alle tcpwrapped | bereits implementiert via edge_sharing_pattern |
| **CT-Stale-Subdomain** | crt.sh listet Sub, DNS löst nicht auf | dns_records skipt apex-checks für non-apex (Phase 4 ✓); dangling-detection für Phase 9 |
| **Academic-BREACH** | testssl-BREACH, Page ohne Secrets | downgrade zu low; reasoning in interpretation_note |
| **Empty-OpenAPI** | /openapi.json mit paths={} | kein "API exposed"-Finding |
| **Stacktrace-in-401** | 401 + Stacktrace im Body | Finding-Kategorie exposure, nicht auth |
| **Self-Signed-on-Staging** | invalid Cert, hostname enthält staging | downgrade zu info |
| **Mailserver-mit-A** | MX + A vorhanden | beide Pipelines laufen — Worker prüft beide Service-Types |
| **Reverse-Proxy-Header** | Server: nginx auf Java-Backend | Tech-Detection nutzt Cookies + Sourcemap + Default-Errors, nicht Server-Header allein |
| **Test-Account-Identical** | auth_logic_probe mit 2 Accounts → beide sehen dieselben Daten | korrekt: das ist KEIN IDOR, das sind shared resources. Worker checkt "user_a sees data of user_b" via gepflegte Account-IDs |
| **Region-Deflection** | Findings nur aus DE-Sicht valide | Coverage-Caveat im Report; in Phase 9: Multi-Region-Probe via Cloud-Functions |

---

## 6. Migrations + Schema-Erweiterungen

Nicht in dieser Roadmap sind kleine Cleanups, die in Phase 5 mitlaufen:

| Was | Wann |
|---|---|
| `secu_findings.confidence` enum | Phase 8 |
| `secu_findings.interpretation_note` text | Phase 8 |
| `secu_findings.honeypot_risk` smallint | Phase 8 |
| `secu_findings.cvss_vector` varchar(64) | Phase 8 |
| `secu_findings.proof_of_concept` text | Phase 8 |
| neue Tabelle `secu_engagement_test_accounts` | Phase 7 |
| neue Tabelle `secu_reports` | Phase 8 |
| neue Tabelle `secu_tech_patterns` (für Wappalyzer-DB-Versionierung) | Phase 5 — alternativ JSON-File im Repo, dann keine Tabelle |

Alle Migrations via `./schema-ready.sh`, niemals manuell.

---

## 7. Was wir bewusst NICHT bauen

| Nicht | Begründung |
|---|---|
| Eigenes Fuzzer-Backend (libFuzzer/AFL++) | Customer-Stack ist primär Web/JS — Fuzzer-Backends adressieren Native-Code. Niedrige Hit-Rate für unsere Customer-Klasse |
| Eigenes ClusterFuzz/OSS-Fuzz-Klon | Brauchst zehntausende CPU-Cores. Stattdessen Lookup gegen Public-OSS-Fuzz-Coverage |
| Path-Brute-Force als Default | active_intrusive Tier; ffuf nur bei explicit written_consent |
| Auth-Brute-Force als Default | active_intrusive Tier; hydra nur bei explicit written_consent + Customer's eigenen Login-Endpoint |
| Multi-Region-Scanning | Phase 9+; aktuell DE-only mit Coverage-Caveat |
| Eigene CVE-Datenbank | NVD/cve.org-Lookup reicht; eigene CVE-DB wäre 6 Monate Pflege |
| ML-basierte Findings-Klassifikation | Confidence-Score per Heuristik reicht; ML wäre Premature-Optimization |

---

## 8. Reihenfolge der Umsetzung — Empfehlung

Phasen sind technisch parallelisierbar, aber dieser Pfad maximiert Customer-Mehrwert pro investierter Stunde:

1. **Phase 5 zuerst, vollständig**. Tech-Detection ist der Hebel für alles weitere. Ohne Stack-Identifikation sind Phase 6+7 blind.
2. **Phase 8 confidence-Scoring + interpretation_note vor Phase 6**. Phase 6 produziert mehr Findings — die Confidence-Pipeline muss vorher stehen, sonst explodiert die false-positive-Rate.
3. **Phase 6 stack-aware Routing**. Greift sofort auf Phase-5-Output.
4. **Phase 7 API-Fuzzing**. Braucht Phase-5 (OpenAPI deep parse) + Phase-6 (Stack-Specific-Worker-Auswahl) + Phase-8 (confidence).
5. **Phase 8 Reporting** vollständig — PDF-Render, Templates pro Finding-Typ.

Pro Phase: `tech_fingerprint` zuerst, weil andere Phase-5-Worker dessen Output anreichern. Innerhalb Phase 7: `oss_fuzz_coverage_check` zuerst (passive, niedrigster Risk), dann `auth_logic_probe`, dann `schemathesis_safe`.

---

## 9. Glossary

| Begriff | Bedeutung im Kontext dieser Codebase |
|---|---|
| **Engagement** | ein Customer-Pentest-Auftrag mit Scope-Grenzen + Authorization |
| **Entity** | global identifizierbares Asset (Domain, Subdomain, IP, Email, Person, …) |
| **Worker** | Adapter um ein Tool / eine Probe-Logik. Hat jobKey + requiredScope |
| **Playbook** | Sequenz von Workern mit DAG-Dependencies |
| **Authorization-Scope** | passive_only / active_safe / active_intrusive — was darf der Worker auf diesem Asset |
| **Auto-Chain** | discovered Entity / serviceType-Update → Rule-Engine → automatisches Folge-Playbook |
| **Tech-Fingerprint** | strukturierte Identifikation des Tech-Stacks eines Hosts (entity.data.tech) |
| **Honeypot-Score** | 0-100, gibt an wie vertrauenswürdig die Daten dieses Hosts sind |
| **Confidence** | verified / high / medium / low / speculative — wie sicher ist dieses Finding |
| **Interpretation-Note** | Klartext "warum kein false positive / unter welcher Bedingung gültig" |
| **Reproducibility-Check** | Probe 2× mit Abstand, Finding nur wenn beide gleich |
| **Multi-Path-Triangulation** | severity ≥ high braucht ≥ 2 unabhängige Worker-Quellen |
| **JARM** | TLS-Handshake-Fingerprint, identifiziert Server-TLS-Stack |
| **OSS-Fuzz-Coverage** | "wird diese Library auf Google's OSS-Fuzz kontinuierlich gefuzzed" — Trust-Plus |

---

## 10. Wie diese Roadmap fortzuschreiben ist

Bei Abschluss einer Phase:
- Update `project_node_secu_coverage.md` in der Auto-Memory mit neuem Stand.
- Update `CLAUDE.md` Worker-Tabelle.
- Update `.claude/scan-operations.md` mit neuen DB-Queries / API-Calls.
- **Streiche abgeschlossene Phasen aus dieser Datei** (nicht "✅ done" markieren — wirklich entfernen, sonst wird sie unleserlich). Die Auto-Memory + git history hält die Historie.

Wenn eine Phase sich als zu groß erweist: split, nicht durchziehen. Pro Sub-Phase eigener DoD-Block.

Wenn eine Phase obsolet wird (z.B. Customer-Anforderung ändert sich): direkt löschen + Begründung in Auto-Memory.
