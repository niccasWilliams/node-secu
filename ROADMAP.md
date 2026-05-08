# node-secu — Roadmap (v2, 2026-05-08)

> Diese Roadmap ersetzt `ROADMAP.legacy.md`. Die alte Version war auf "Agentur-Kunden-Scanning + öffentlicher Lead-Funnel" zugeschnitten. Der tatsächliche Treiber ist jetzt: **Operator wird Pentester. node-secu ist sein Werkzeug dafür.** Multi-Tenant/Customer kommt später, ohne Rewrite.

---

## 0. Vision

node-secu ist die **Engagement-zentrische Pentest-Plattform** des Operators. Es konsolidiert alles, was im echten Pentest-Workflow zusammenfließen muss:

- **Technische Aufklärung** (Recon, Scanning, Vuln-Identification)
- **OSINT auf Menschen & Organisationen** (Mitarbeiter, Rollen, Beziehungen, Lieferketten)
- **Loot & Artifacts** (erbeutete Credentials, Sessions, Dokumente, Screenshots, Command-History)
- **Reporting** (technisch und business-orientiert)
- **Cloud-Steuerung** (steuerbare Worker mit frischen IPs, später Stealth-Setups)

Das Ergebnis ist eine **Engagement-Karte** — ein Graph, der Assets ↔ People ↔ Organisationen ↔ Findings ↔ Loot verbindet. Diese Karte wird später im node-amp-Frontend visualisiert, aber node-secu bleibt headless und eigenständig.

## 1. Designprinzipien (verbindlich)

1. **Engagement ist die operative Wurzel.** Jede Aktion (Scan, Finding, Notiz, Loot) gehört zu einem Engagement — auch wenn es nur "Mein Lab" oder "HTB Season 7" heißt.
2. **Identitäten sind global, Operationen engagement-lokal.** People, Organisationen, Domains, Hosts existieren **einmal** in der DB als globale `entities`. Eine Person kann in mehreren Engagements auftauchen, ohne dupliziert zu werden — so entsteht die "globale Karte" über Kunden/Lieferanten/Tochterfirmen-Netzwerke. Findings, Artifacts, Worker-Runs hingegen sind **engagement-lokal** (eine Domain hat in Engagement A andere Findings als in B).
3. **Beziehungen sind first-class und global.** "Person X arbeitet für Org Y", "Domain hostet auf IP Z" sind objektive Fakten — gehören in `entity_relationships` (global). Engagement-spezifische Annotationen (z.B. "in dieses Engagement im Scope") gehen in `engagement_entities`.
4. **Tech-aware Playbooks, keine Tool-Runner.** Tools werden nicht stumpf gekettet, sondern *intelligent eingesetzt*: Tech-Fingerprint vor Vuln-Scan, passende Templates statt "alle Templates", sinnvolle Profile pro Tool. Playbooks sind deklarative DAGs mit Conditions.
5. **Rule-Engine als Aufsatz, nicht als Ersatz.** Eine deklarative Regel-Maschine reagiert auf Entity-/Finding-Events und triggert Playbooks ("wenn neuer Subdomain mit WordPress entdeckt → wpscan-Playbook starten"). Liegt **über** den Playbooks, ersetzt sie nicht.
6. **Playbooks vor AI.** Phase 1-6 ist deterministisch. AI kommt erst (Phase 7), wenn das System sauber läuft. Hooks dürfen vorbereitet werden, aber keine LLM-Calls in der Hot-Path.
7. **Authorization-Gate ist heilig.** `authorizationService.canScan()` bleibt. Für Solo-Use → `internal_lab`-Records. Niemals "ignore-flag" einführen.
8. **Cloud-Worker sind first-class.** Lokale Worker für Dev/Lab, Cloud-Worker für reale Pentests. Eine Worker-Abstraktion, mehrere Provider-Backends.
9. **Worker-Interface clean genug für späteres Plugin-System.** Tools liegen Phase 2-4 im Monorepo (schneller, einfacher zu debuggen). Die Schnittstelle wird so gebaut, dass spätere Extraktion zu eigenständigen Packages trivial ist — aber kein Plugin-Loader-Overhead jetzt.
10. **Headless Backend, klare API.** Kein eigenes Frontend in Phase 1-7. Wenn ein UI gebraucht wird (Operator-Cockpit), kommt es später als separates Projekt oder als amp-Modul.
11. **UX für Dummies = API & Defaults für Dummies.** Selbst-erklärende Endpoint-Namen, sinnvolle Defaults, ein Playbook startet mit *einem* API-Call. Convenience-Endpoints (z.B. `POST /engagements/:id/quick-recon { domain }`) gehören dazu.

## 2. Phasenplan

### Phase 0 — Aufräumen & saubere Basis *(✅ ABGESCHLOSSEN 2026-05-08)*

**Goal:** Den scan-/asset-zentrischen Code-Stand löschen und eine klar leere, kompilierbare Basis hinterlassen, auf der Phase 1 das Engagement-Modell baut. Die App ist erst wenige Stunden alt, läuft nirgendwo produktiv, hat keine externen Konsumenten — kein Bedarf für Archivierung, `_legacy/`-Ordner oder Daten-Migration. Es geht um echtes Aufräumen, nicht um Konservieren.

**Was bleibt (selektiv, weil Phase 1+ sofort wiederverwendet):**

| Pfad                                          | Begründung                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/security/authorization/`             | Scope-Logik & `canScan()`-Vertrag bleiben — Persistenz wird abstrahiert   |
| `src/lib/security/audit/`                     | Audit-Log bleibt aktiv (FK auf `engagement_id` kommt in Phase 1)          |
| `src/lib/security/findings/fingerprint.ts`    | Reine SHA-256-Dedup-Utility, framework-frei, wird in Phase 2 weitergenutzt |
| `src/lib/security/workers/worker.types.ts`    | `SecurityWorker`-Contract — Basis für Phase 2/3                           |
| `src/lib/security/workers/worker-registry.ts` | Registry, wird in Phase 2 erweitert                                       |
| `src/lib/security/workers/passive/*`          | DNS-/TLS-/HTTP-Header-Worker — in Phase 2 sofort einsetzbar               |

**Was ersatzlos gelöscht wird:**

| Pfad                                                | Begründung                                                  |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `src/lib/security/assets/`                          | Wird durch `entities` ersetzt (Phase 1)                     |
| `src/lib/security/scans/`                           | Wird durch `playbook_runs` + `worker_runs` ersetzt          |
| `src/lib/security/cve/`                             | Stub, kommt frisch in Phase 5                               |
| `src/lib/security/reports/`                         | Stub, kommt frisch in Phase 6                               |
| `src/lib/security/findings/finding.service.ts`      | Asset-gebunden, wird in Phase 1 entity-basiert neu geschrieben |
| `src/routes/security/{assets,scans,findings,public-scan}/` | Public-Scan-Funnel verschiebt sich auf Phase 8         |

**Schema-Bereinigung** (`src/db/individual/individual-schema.ts`):

- **Löschen** (Tabellen + zugehörige Enums): `assets`, `assetAuthorizations`, `scans`, `scanJobs`, `findings`, `techFingerprints`, `cveRecords`, `cveMatches`, `scanPolicies`, `publicScanLeads`
- **Löschen** (nicht mehr benötigte Enums): `assetKindEnum`, `authorizationKindEnum`, `proofTypeEnum`, `scanTypeEnum`, `scanStatusEnum`, `scanTriggerEnum`, `jobStatusEnum`, `findingCategoryEnum`, `findingStatusEnum`, `policyTypeEnum`, `leadStatusEnum`
- **Behalten:** `securityAuditLog`-Tabelle, `severityEnum`, `authorizationScopeEnum` (in Phase 1 wiederverwendet, ggf. erweitert)

**Konkrete Tasks Phase 0:**

1. **Routes deregistrieren:** Die 4 `import`-Zeilen für `publicScanRouter`, `assetRouter`, `scanRouter`, `findingRouter` aus `src/individual-routes.ts` entfernen, samt ihrer `app.use(...)`-Registrierungen. Falls sinnvoll, ein einzeiliger Marker-Kommentar `// Phase 1+: engagement & playbook routes wired here` an die Stelle.
2. **Code löschen:** Die in der Tabelle oben gelisteten Verzeichnisse hart entfernen. Kein `_legacy/`, keine Auskommentierung.
3. **Schema bereinigen:** Tabellen + Enums wie oben gelistet aus `individual-schema.ts` entfernen. Zusätzlich:
   - Alle Type-Exports am Ende der Datei (`Asset`, `Scan`, `Finding`, `TechFingerprint`, `CveRecord`, `CveMatch`, `ScanPolicy`, `PublicScanLead`, `AssetAuthorization` + ihre `New*`-Varianten) entfernen — nur `SecurityAuditLog`/`NewSecurityAuditLog` bleibt.
   - Spalten-Kommentare in `securityAuditLog` aktualisieren: `action`-Beispiele → `"engagement.create"`, `"entity.create"`, `"playbook_run.start"`, `"auth.grant"`, `"auth.revoke"`; `targetType` → `"engagement" | "entity" | "playbook_run" | "worker_run" | "finding"`.
   - Imports aus dem Datei-Header (`pgEnum`, `index`, `uniqueIndex`, etc.) auf das reduzieren, was die verbleibenden Schemas tatsächlich brauchen.
4. **Authorization-Service abstrahieren:** Den Service so refaktorieren, dass die Scope-Logik (`passive_only` immer erlaubt; `active_safe` und `active_intrusive` mit dem Mapping aus CLAUDE.md §5) **in TypeScript** lebt — und die DB-Zugriffsschicht hinter ein Interface gepackt wird:
   ```ts
   interface AuthorizationResolver {
     resolveOwner(ref: { kind: string; id: string }): Promise<OwnerInfo | null>;
     getAuthorizations(ref: { kind: string; id: string }): Promise<AuthRecord[]>;
   }
   ```
   Phase 0 liefert dafür einen Stub (`NullAuthorizationResolver`) der schlicht `[]` zurückgibt → `canScan()` bleibt funktional: passive geht durch, aktiv blockt mit klarem Fehler `"no authorization wired yet — phase 1 will provide entity-based resolver"`. Phase 1 implementiert den Resolver gegen `entity_authorizations`.
5. **DB neu aufsetzen:** `pnpm run db:reset` einmal voll durchziehen — Schema neu, frische DB ohne tote Tabellen.
6. **Build & Smoke:** `pnpm run build` grün, `pnpm run run:dev` startet sauber, `GET /` antwortet mit Template-Healthcheck, keine 404/500 durch tote Routes.
7. **CLAUDE.md aktualisieren:** §4 (Filesystem-Map) auf den neuen, kleineren Stand zuschneiden — alle gelöschten Module raus. §10-Verweis auf diese ROADMAP belassen, kein `_legacy/` mehr erwähnen.

**Done-Definition Phase 0:**

- [x] Gelistete Verzeichnisse unter `src/lib/security/` und `src/routes/security/` sind entfernt
- [x] `individual-routes.ts` registriert keine alten Security-Routes mehr
- [x] `individual-schema.ts` enthält nur noch `securityAuditLog`-Tabelle + die zwei behaltenen Enums
- [x] `authorizationService.canScan()` funktioniert ohne DB-Zugriffe via `NullAuthorizationResolver` (passive ja, aktiv nein)
- [x] `pnpm run db:reset` läuft sauber durch
- [x] `pnpm run build` grün, `pnpm run run:dev` startet
- [x] `frontend-types.ts` regeneriert (`pnpm run types:generate`)
- [x] CLAUDE.md §4 spiegelt den neuen, schlanken Stand
- [x] Ein Commit: `chore(secu): phase 0 — clean slate for engagement pivot`

**Phase-0-Implementierungs-Notizen** (für Phase 1 relevant):

- `authorizationService.canScan()` nimmt jetzt einen `ScanTargetRef { kind, id }` statt einer `assetId: number` — Phase 1 ruft mit `{ kind: "entity", id: <entityId> }` auf.
- `AuthorizationResolver` ist über `setAuthorizationResolver(resolver)` injizierbar. Phase 1 registriert seinen entity-basierten Resolver beim App-Bootstrap.
- `WorkerContext` wurde von `asset: Asset` auf `target: WorkerTarget { id, value, kind }` umgestellt (nötig weil `Asset` weg ist). Die passiven Worker akzeptieren sowohl die alten kind-Werte (`"domain"`, `"subdomain"`, `"url"`) als auch die neuen Phase-1-Entity-Kinds (`"asset_domain"`, `"asset_subdomain"`, `"asset_url"`) — Phase 1 kann die alten Strings entfernen, sobald keine Test-Fixtures mehr darauf bauen.
- `domain-ownership.service.ts` wurde auf die framework-freien Helpers (`generateToken`, `verifyDnsTxt`) reduziert. Phase 1 ergänzt das Persistenz-Glue-Code (analog zur alten `runVerification`) gegen `entity_authorizations`.
- `worker-registry.ts` exportiert nur noch `getWorker`, `listWorkers`, `applicableWorkers(target)` — die alte `workersForScanType()`-Funktion wurde entfernt, da Worker-Auswahl in Phase 2 vollständig durch Playbook-Conditions getrieben wird.

**Bewusst NICHT in Phase 0:**

- Keine neuen Tabellen (`entities`, `engagements`, …) — das ist Phase 1
- Kein neuer Code unter `src/lib/security/engagements/` o.ä.
- Kein Refactor der behaltenen Module über die Auth-Service-Abstraktion hinaus
- Keine Daten-Migration (es gibt nichts zu migrieren)

---

### Phase 1 — Engagement-Datenmodell *(2–3 Wochen)*

**Goal:** Das Schema des alten "scan-zentrierten" Modells wird durch ein engagement-zentrisches Graphmodell ersetzt.

**Neue Tabellen** (alle in `secu_*`-Prefix, in `src/db/individual/individual-schema.ts`):

**Globale Identitäts-Schicht** (engagement-übergreifend):

- `entities` — id, kind (`asset_domain` | `asset_ip` | `asset_host` | `asset_url` | `person` | `organization` | `location` | `credential_ref` | `document`), display_name, canonical_key (für Dedup, z.B. lowercased domain oder normalisierte E-Mail), data (jsonb — kind-spezifisch), first_seen_at, last_seen_at. **Kein** engagement_id.
- `entity_relationships` — id, from_entity_id, to_entity_id, kind (`employs` | `subsidiary_of` | `supplies` | `resolves_to` | `runs_on` | `owns_credential` | `member_of` | `located_at` | …), data (jsonb), confidence (0-100), source (`manual` | `recon_<tool>` | `osint_<source>`), first_observed_at, last_observed_at. **Global**, weil objektive Fakten.
- `entity_tags` — id, entity_id, tag, color. Global.

**Engagement-Schicht** (operations-lokal):

- `engagements` — id, name, slug, kind (`solo_lab` | `ctf` | `bug_bounty` | `customer_pentest` | `internal`), status, owner_user_id, created_at, archived_at, scope_summary (text)
- `engagement_entities` — id, engagement_id, entity_id, role (`primary_target` | `in_scope` | `out_of_scope` | `pivot` | `context`), notes (text), added_at, added_by. Join-Tabelle die definiert welche globalen Entities Teil eines Engagements sind.
- `findings` — id, engagement_id, entity_id, fingerprint, severity, title, description, raw_data (jsonb), worker_run_id, status (`open` | `triaged` | `confirmed` | `false_positive` | `fixed`), discovered_at, resolved_at. Engagement-lokal.
- `artifacts` — id, engagement_id, entity_id (nullable), kind (`screenshot` | `file` | `command_output` | `pcap` | `credential_dump` | `note`), storage_ref, mime, sha256, size, captured_at, redacted (bool)
- `command_history` — id, engagement_id, entity_id (nullable), worker_run_id, raw_command (redacted), exit_code, started_at, finished_at
- `playbook_runs` — id, engagement_id, playbook_key, status, started_at, finished_at, params (jsonb), result_summary (jsonb), triggered_by (`manual` | `rule:<rule_id>` | `schedule`)
- `worker_runs` — id, playbook_run_id (nullable für ad-hoc), engagement_id, entity_id (target), worker_key, status, started_at, finished_at, provider (`local` | `hetzner` | `aws` | …), provider_instance_id, logs_ref, exit_code
- `audit_log` — bleibt, FK auf engagement_id

**Authorization** (existiert, wird gepatcht):

- `asset_authorizations` → umbenennen zu `entity_authorizations`, FK auf `entity_id` statt `asset_id`

**Bestehende Tabellen:** keine — Phase 0 hat das alte scan-/asset-zentrische Schema bereits ersatzlos entfernt. Phase 1 baut auf grüner Wiese, der `securityAuditLog` und die zwei behaltenen Enums bleiben unangetastet (FK auf `engagement_id` wird ergänzt).

**API-Endpoints (Phase 1):**

```
# Engagements
POST   /engagements
GET    /engagements
GET    /engagements/:id              # mit eingebettetem Graph-Snapshot
PATCH  /engagements/:id
DELETE /engagements/:id              # soft (archived_at)

# Entities — Global (engagement-übergreifend)
POST   /entities                     # globale Entity anlegen oder per canonical_key auffinden
GET    /entities?kind=person&q=...   # globale Suche (für "Person taucht auch hier auf")
GET    /entities/:id                 # inkl. aller Engagement-Verknüpfungen

# Engagement ↔ Entity
POST   /engagements/:id/entities     # Entity dem Engagement zuordnen (legt bei Bedarf neu an, sonst verlinkt)
GET    /engagements/:id/entities?kind=person
DELETE /engagements/:id/entities/:entity_id

# Beziehungen — global, aber im Kontext eines Engagements anlegbar
POST   /entities/:id/relationships
GET    /entities/:id/relationships
GET    /engagements/:id/graph        # cytoscape-/d3-kompatible JSON, Subgraph dieses Engagements

# Convenience (UX für Dummies)
POST   /engagements/:id/notes        # erzeugt artifact kind=note
POST   /engagements                  # mit body {kind:'solo_lab', primaryDomain:'example.com'} → legt Engagement + Domain-Entity + Verknüpfung in einem Call an
```

**Done-Definition Phase 1:**

- [x] Schema geschrieben — `engagements`, `entities`, `entity_relationships`, `entity_tags`, `engagement_entities`, `entity_authorizations`, `findings`, `artifacts`, `command_history`, `playbook_runs`, `worker_runs` + 13 Enums; `secu_audit_log` bekommt `engagement_id` FK
- [ ] Migrationen via `./schema-ready.sh` sauber durch  *(Operator-Action — Code ready, noch nicht ausgeführt)*
- [x] **Default-Seed:** Engagement "Mein Lab" (kind=`solo_lab`) mit `internal_lab`-Authorization auf 5 Lab-Assets, idempotent
- [x] Zusätzliche Seeds: ein `ctf` ("HTB-Demo Saison 1") und ein `customer_pentest` ("ACME GmbH — Q2 2026 Pentest") Demo-Engagement; ACME-Webziele mit `written_consent`×`active_safe`
- [x] Demo-Graph: 19 Entities (alle 10 `kind`-Typen vertreten), 17 Relationships; Carol Weber via `employs` (Tochter) **und** `works_with` (Mutter, former=true) — globale Identität bewiesen
- [x] Convenience-Endpoint `POST /engagements` mit `primaryDomain` legt Engagement + Domain-Entity + Verknüpfung in einem Call an; bei `solo_lab`/`internal` zusätzlich `internal_lab`-Auth (für `customer_pentest`/`ctf` bewusst kein Auto-Auth — schriftlicher Vertrag bzw. ToS unverhandelbar)
- [x] AuthorizationResolver gegen `entity_authorizations` implementiert (`entity-resolver.ts`) und beim App-Start via `bootstrapSecurityDomain()` aktiviert
- [x] Domain-Ownership Phase-1 Glue (`prepareDnsTxtAuthorization` + `runDnsTxtVerification`) gegen `entity_authorizations`
- [x] Routes hinter `AccessControl.isAuthUser()` mit Contract-Router + Zod-Validation; audit-log auf allen mutierenden Calls inkl. `engagementId`
- [ ] Integration-Tests gegen echte DB für CRUD + Graph-Query + Cross-Engagement-Identity-Lookup  *(offen — nach Migration nachziehen)*
- [ ] `frontend-types.ts` regeneriert 

**Phase-1-Implementierungs-Notizen:**

- Entity-Dedup über `(kind, canonical_key)` UNIQUE; `canonical-key.ts` normalisiert kind-spezifisch (Domain → lowercase/trim, URL via URL-API, Email lowercase, Person ohne Email → Hash+Discriminator).
- Relationship-Dedup über Triple `(from, to, kind)` UNIQUE; `relationshipService.upsert` merged `data` und touched `last_observed_at`.
- `engagementService.list` filtert standardmäßig archivierte Engagements (`archived_at IS NULL`); `archive()` macht Soft-Delete (status='archived' + archivedAt=now).
- `secu_findings` hat UNIQUE `(engagement_id, fingerprint)` — Re-Run eines Workers in Phase 2 dedupliziert automatisch.
- `worker_runs.provider`-Enum bereits inkl. `hetzner`/`aws`/`digitalocean`/`docker_host`/`tor_proxy` — Phase 3 muss kein Schema mehr anfassen.

**Bewusst NICHT in Phase 1:** Worker, Playbooks, Cloud-Provisioning, Reports.

---

### Phase 2 — Playbook-Engine + lokale Passive Worker *(3–4 Wochen)*

**Goal:** Eine deklarative Playbook-Engine die Worker tech-aware verkettet, und vier lokale passive Worker.

**Components:**

- **Playbook-DSL** (TS-Objekte mit Zod-Schema) — DAG mit Steps, Inputs, Outputs, **Conditions** (z.B. `when: ctx.tech.includes('wordpress')`), Dependencies, Tool-**Profilen** (jedes Tool kann mehrere Profile haben: `nuclei: cves-only | misconfigs | full`).
- **Playbook-Runner** — nimmt Playbook + Engagement + Target-Entity → erzeugt `playbook_run`, evaluiert Conditions pro Step gegen den aktuellen Engagement-Kontext (Findings, Tech-Fingerprint, Entity-Daten), feuert nur passende Steps.
- **Tech-Fingerprint-Service** — eigenes kleines Modul das aus DNS/HTTP-Header/TLS/HTML-Hints einen normalisierten `tech`-Set erzeugt, an Entity hängt, Playbooks lesen ihn.
- **WorkerRegistry** (existiert) — wird erweitert.
- **Vier Worker** (alle lokal): `dns_records`, `tls_cert`, `http_headers` (existieren) + `subdomain_passive` (subfinder).
- **Erstes Playbook `web_recon_passive`:** Domain → subfinder → für jeden Live-Subdomain: DNS + TLS + HTTP-Headers + Tech-Fingerprint → tech-aware Folge-Steps (z.B. nur bei `wordpress` einen passive WP-Versionscheck).

**Done-Definition Phase 2:**

- [x] Playbook startet via `POST /engagements/:id/playbooks/web_recon_passive { rootEntityId }`
- [x] Run-Status live abrufbar; Steps zeigen "skipped wegen condition" sauber an *(über `playbook_runs.resultSummary.steps[].runs[].status="skipped"` + `error`-Begründung wie `condition_false`/`no_targets`/`authorization_denied:*`)*
- [x] Tech-Fingerprint wird ans Entity geschrieben und beeinflusst sichtbar nachfolgende Steps *(`techFingerprintService.applyDrafts` schreibt nach `entities.data.tech`; `wp_passive_check`-Step liest `ctx.techByEntityId`)*
- [x] Findings idempotent (Fingerprint-Dedup) am richtigen Entity, Re-Run erzeugt keine Duplikate *(via `secu_findings`-UNIQUE `(engagement_id, fingerprint)` + `findingService.persistDraft` mit `onConflictDoNothing`)*

**Phase-2-Implementierungs-Notizen:**

- **Subdomain-Worker** nutzt **crt.sh** (Certificate Transparency Logs) statt subfinder-CLI — reines OSINT via HTTPS-Request, kein zusätzliches Binary, sauber für Solo-Lab und Cloud-Worker gleichermaßen. Subfinder bleibt als Phase-3-Active-Variante optional.
- **Worker-Result erweitert** um `discoveredEntities?: DiscoveredEntityDraft[]` — der Runner upsertet sie als globale Entities, verknüpft sie mit dem Engagement (`engagementEntities`, role=`in_scope`) und legt `entity_relationships` zur Wurzel-Entity an (z.B. `subdomain_of`, confidence 90).
- **Playbook-DSL** ist 100% TypeScript mit Funktionen für `targets()` und `when()` — bewusst nicht JSON-Logic. Phase 2.5 (Rule-Engine) baut deklarative Conditions oben drauf.
- **Authorization-Gate** wird vor jedem `worker.run()` aufgerufen (`authorizationService.canScan({kind:"entity", id}, worker.requiredScope)`). Passive Worker passieren immer; aktive Worker (Phase 3+) blocken automatisch ohne Code-Änderung am Runner.
- **Step-Status-Reporting:** `playbook_runs.resultSummary.steps[]` enthält pro Step alle Targets mit `status` (`completed | failed | skipped`), `findingsCreated`, `techDiscovered`, `discoveredEntities`. Ergänzend pro echtem Worker-Run eine Row in `secu_worker_runs`.
- **Routes** sitzen unter `/playbooks` (Registry-Liste) und `/engagements/:id/playbooks/...` (Start + Run-Status + Run-Liste). Eigener Top-Level-Router, der nicht in den `engagements`-Router gemountet wird, damit beide Pfad-Familien beieinander liegen.
- **Bekannter Pre-Existing-Bug außerhalb Phase 2:** `src/routes/auth/users/user/user.route.ts` (template-synced) referenziert via `typeRefExpr` noch den alten Typennamen `NodeTemplateUser`, der inzwischen `NodeSecuUser` heißt; daraus folgt ein TS2305-Error in `generated/api/base/{routes.app_info,routes.users}.ts`. Der Phase-2-Code selbst compiliert sauber (`tsc --noEmit` ohne Phase-2-Errors). Fix gehört zum Template-Sync, nicht in diese Phase.

---

### Phase 2.5 — Rule-Engine *(2 Wochen, nach Phase 2)*

**Goal:** Eine deklarative Regel-Maschine die auf Entity-/Finding-Events reagiert und Playbooks triggert. Sitzt **über** den Playbooks, ersetzt sie nicht.

**Components:**

- **`rules`-Tabelle** — id, name, scope (`global` | `engagement_kind:<kind>` | `engagement:<id>`), trigger (`entity.created` | `entity.updated` | `finding.created` | `playbook_run.completed` | `schedule:<cron>`), condition (jsonb — JSON-Logic / Zod-validiert), action (jsonb — `start_playbook` | `tag_entity` | `notify_boss` | `create_finding`), enabled, created_by
- **Event-Bus** (in-process für Phase 2.5; später extrahierbar) — jedes Service-Modul (entity-service, finding-service, playbook-runner) publiziert Events auf den Bus
- **Rule-Evaluator** — abonniert relevante Events, evaluiert Conditions deklarativ (kein eval/Function-Constructor — ausschließlich JSON-Logic), führt Action aus
- **Rule-Versioning + Audit:** jede Rule-Auslösung schreibt in `audit_log` mit rule_id, event_id, action_result. Wartbarkeit = Rückverfolgbarkeit.
- **Beispiel-Regeln im Seed:**
  - "Neuer `asset_domain` mit Tech `wordpress` → starte `web_recon_active` (sofern Authorization erlaubt)"
  - "Neues `finding` mit severity `critical` → notify_boss (Telegram)"
  - "Person mit E-Mail-Domain matching Engagement-Scope → tag `internal_employee`"

**Done-Definition Phase 2.5:**

- [x] Regeln per `POST /rules` deklarativ anlegbar (CRUD inkl. PATCH/DELETE, Zod-Validation, AccessControl-Gate)
- [x] Beim Anlegen einer WordPress-Subdomain triggert die Recon-Pipeline automatisch (Seed-Rule "WordPress subdomain → web_recon_passive", default disabled — Operator entscheidet bewusst per PATCH `enabled=true`)
- [x] Rule-Auslösung in `audit_log` nachvollziehbar (`rule.fired` mit ruleId, eventType, actionResult; `rule.condition_failed` bei Eval-Fehlern)
- [x] Drei Beispiel-Regeln im Seed (notify_boss critical, WP→recon disabled, ACME-Email→tag — überfüllt das "≥2"-Minimum)
- [x] Disable/Enable einer Rule wirkt sofort, kein Service-Neustart nötig (`ruleService.update`/`create`/`delete` invalidieren den In-Memory-Cache)
- [ ] Migration `0003_brainy_morlun.sql` via `./schema-ready.sh` ausführen *(Operator-Action — Code ready, DB war beim Build offline)*

**Phase-2.5-Implementierungs-Notizen:**

- **Event-Bus** (`src/lib/security/rules/event-bus.ts`) — node:events EventEmitter, fire-and-forget. Vier Topics: `entity.created`, `entity.updated`, `finding.created`, `playbook_run.completed`. `schedule` ist im Enum vorbereitet, aber vom Evaluator (noch) nicht abonniert — Phase-2.5+ kann cron-basiertes Feuern ergänzen.
- **JSON-Logic-Evaluator** (`json-logic.ts`) — minimaler Subset (`==`, `!=`, `<`/`>`/etc., `and`/`or`/`not`, `in`, `contains`, `var`, `missing`, `if`, `starts_with`/`ends_with`, `match`). Bewusst KEIN `eval`/Function-Constructor — auditierbar, sicher. Spec-konform erweiterbar ohne Migration (`condition` ist jsonb).
- **Cache-Layer im rule.service** — enabled rules werden nach erstem Zugriff im Speicher gehalten; CRUD-Touches invalidieren den Cache → Disable/Enable greift sofort. `recordFire` invalidiert NICHT (nur Telemetrie).
- **Action-Renderer** — Templates `{{path.to.value}}` für `notify_boss.message` und `create_finding.descriptionTemplate`; Pfade lesen aus dem Condition-Data-Snapshot (`engagement.id`, `entity.canonicalKey`, `finding.severity`, …).
- **Boss-Notify** spricht `BOSS_API_URL/notifications` mit Headern `x-app-id: node-secu`, `x-api-key: BOSS_API_KEY`. Skipped sauber wenn `BOSS_API_URL` fehlt; Fehler werden im Audit-Log markiert (success=false), brechen aber andere Rules NICHT ab.
- **Authorization-Hygiene:** Die WP→recon-Beispielregel ist `enabled=false` im Seed, damit beim ersten Start kein Auto-Scan auf nicht-autorisierte Subdomains feuert. Operator schaltet sie scharf, wenn er weiß was er tut.

---

### Phase 2.7 — OSINT-Identity-Enrichment-Layer *(Operator-Vertiefungsthema, 3–4 Wochen, vor Phase 3)*

> **Persönliches Vertiefungs-Thema des Operators.** Social-Engineering-Recherche ist das Herzstück realistischer Pentest-Vorarbeit. Diese Phase macht den Identity-Graph (Phase 1) zur **auto-anreichernden OSINT-Maschine** — aus minimalen Signalen (eine Email, ein Username, eine Domain) werden über deterministische Worker und Rule-Engine-Chains weitere Signale erschlossen. Cross-Identity-Hits ("dieselbe Person taucht in zwei Engagements auf") werden automatisch sichtbar. Tool-Stack ist bewusst lokal & passiv-only — Stealth-Scraping (LinkedIn/X) wartet auf Phase 3 mit IP-Rotation, Dark-Web-Crawling auf Phase 2.9 mit `tor_proxy`-Worker.

**Designentscheidungen (aus Operator-Klarstellung):**

1. **Eigene Entity-Kinds, nicht JSON-Blobs.** Email/Username/Phone/Social-Account werden first-class-Knoten im Graph — Begründung: dieselbe Email/Username kann zu mehreren Personen gehören, Cross-Person-Korrelationen sind das Kernfeature ("dieselbe Email taucht bei zwei Targets auf"). Passt zu Designprinzip §1.2 (Identitäten global).
2. **Authorization-Gate bleibt heilig (§1.7), aber operativ unsichtbar.** Alle Worker dieser Phase deklarieren `requiredScope: "passive_only"` → das `canScan()`-Gate lässt sie *immer* durch, kein Auth-Record nötig. Falls in Phase 2.8+ ein Worker tatsächlich Ziel-Server kontaktiert (SMTP-Verify, Phishing-Versand) → eigene aktive Worker-Klasse mit `active_safe`/`active_intrusive`.
3. **Voll-Auto-Chain mit Performance-Gate.** Rule-Engine (Phase 2.5) feuert auf jede neue Email/Username/Person — *aber* jeder Provider hat einen Concurrency-Limiter (`p-limit` pro provider-key) und ein Per-Engagement-Budget (default 1000 OSINT-Requests/h). 429-Backoff ist persistiert, parallele Engagements können sich nicht gegenseitig die Provider-Quotas killen.
4. **Drei-Tier-Quellenstrategie.** Tier 1: Free/Public (gravatar, GitHub-public, MX/DNS, RDAP, CT-Logs, Holehe-passive, Maigret/Sherlock/WhatsMyName). Tier 2 (Phase 2.8, opt-in): Paid Aggregators (Hunter, Apollo, Clearbit, HIBP, DeHashed, LeakCheck). Tier 3 (Phase 2.9): Dark-Web + Stealer-Logs. Phase 2.7 liefert nur Tier 1 — die Architektur ist aber so gebaut, dass 2.8/2.9 nur neue Provider-Adapter einklinken.

**Schema-Erweiterungen** (`src/db/individual/individual-schema.ts`):

- `secu_entity_kind` ENUM erweitern um: `email_address`, `username`, `phone_number`, `social_account` (via Postgres `ALTER TYPE ADD VALUE` — kein Table-Rewrite).
- `entities.data`-Schemas pro neuem Kind (typed in TS, jsonb in DB):
  - `email_address` → `{ local, domain, mxValid, mxHosts[], spfRecord?, dmarcPolicy?, dkimSelectorsFound[], gravatarHash, gravatarFound, gravatarProfileUrl?, pwnedSources[], lastValidated }`
  - `username` → `{ value, normalized, observedPlatforms[] }`
  - `phone_number` → `{ e164, region, type: 'mobile'|'landline'|'voip'|'unknown', carrier? }`
  - `social_account` → `{ platform, handle, profileUrl, verified, lastSeenAt, displayName?, bio?, followerCount? }`
- Neue Tabelle `secu_osint_provider_state` — id, provider_key (UNIQUE), request_count, window_start, last_429_at, paused_until, last_error. Pro Provider Rate-Limit-Bookkeeping, persistent über Restarts.
- Neue Tabelle `secu_signal_chain_log` — id, engagement_id, root_entity_id, signal_chain (jsonb mit array of {step, provider, foundEntityIds, ms}), started_at, finished_at. Auditierbare Chain-Spuren ("aus dieser Email haben wir über gravatar+github+holehe N Signale gefunden") — Vorarbeit für Phase 6 Reporting.
- Neue Spalte `secu_engagements.osint_budget_per_hour` (int, default 1000) — Operator-konfigurierbares Hard-Limit.
- `canonical-key.ts` erweitert: Email lowercased+trimmed, Username lowercased+platform-Hash-Discriminator wenn Plattform bekannt, Phone E.164, Social `{platform}:{handle.lower}`.

**Neue Worker** (alle `passive_only`, lokal):

| Worker-Key | Input-Kind | Output | Quelle |
|---|---|---|---|
| `email_dns_signals` | email_address | mxValid, mxHosts, SPF, DMARC, DKIM-Selektoren → Findings (`email_security`) | DNS via `node:dns/promises` |
| `email_gravatar` | email_address | social_account-Draft (gravatar-Profile-URL), avatar-URL, `data.gravatarFound=true` | `api.gravatar.com` (MD5(lowercased)) |
| `email_holehe_passive` | email_address | social_account-Drafts (Existenz auf Adobe/Spotify/Pinterest/Codecademy/etc.) | Eigenes TS-Subset von Holehe — nur ToS-konforme Endpoints, je mit `complianceNote` |
| `email_github_commits` | email_address | github-`social_account`, repo-Hits → context-Findings | `api.github.com/search/commits?q=author-email:...` (mit `GH_TOKEN` 5000/h, ohne 30/min) |
| `email_breach_check` | email_address | Findings (kategorie=`leak`), pwnedSources-Update | `BreachProvider`-Interface; Phase 2.7 nur HIBP-Adapter (skipped wenn `HIBP_API_KEY` fehlt) — DeHashed/LeakCheck-Adapter folgen in 2.8 |
| `email_pattern_inference` | asset_domain | Email-Pattern-Hypothesen (`{first}.{last}@`, `{f}{last}@`, …) mit confidence aus GitHub-Commit-Sample | Statistische Inferenz aus `email_github_commits`-Output über die Domain |
| `domain_ct_email_mining` | asset_domain | email_address-Entities aus RFC822-SAN-Records | `crt.sh` (existiert) — neuer Filter-Modus für RFC822-SANs |
| `domain_github_personnel` | asset_domain | person/email_address/username-Triples | `api.github.com/search/users?q=...@domain` + commits-Mining |
| `username_multiplatform` | username | social_account-Drafts (~3000 Plattformen) | Konsolidierte JSON-DB aus Maigret + Sherlock + WhatsMyName, eigener TS-Worker mit Per-Plattform-Concurrency-Cap |
| `phone_normalize` | phone_number | E.164 + Region + Type | `libphonenumber-js` |
| `social_account_validate` | social_account | profileUrl-Reachability + last-active-Hint + displayName/bio (wenn Plattform-API public) | HTTP HEAD/GET, ratelimited per platform |
| `email_alias_correlate` | email_address | `entity_relationships kind="alias_of"` zwischen Plus-Adressen / Lowercase-Varianten / Provider-Mappings (gmail.com↔googlemail.com) | Eigener Service, keine externe Quelle |
| `cross_engagement_identity_hit` | * (any) | Marker-Finding wenn Entity in ≥2 Engagements aktiv ist | Trigger via Rule, keine Quelle nötig |

**Neue Playbooks** (`src/lib/security/playbooks/definitions/`):

- `osint_email_passive` — Trigger: email_address. Steps:
  1. `email_dns_signals` (immer)
  2. parallel: `email_gravatar`, `email_github_commits`, `email_breach_check` (skip wenn provider-key fehlt)
  3. `email_alias_correlate` (lokal)
  4. Discovered usernames/socials → emit Events → Rule-Engine triggert Folge-Playbooks
- `osint_username_passive` — Trigger: username. Steps:
  1. `username_multiplatform` (parallel intern, ~3000 Plattformen mit Per-Plattform-Cap)
  2. `social_account_validate` (parallel über alle Hits)
- `osint_organization_recon` — Trigger: organization mit verlinkter `asset_domain` ODER asset_domain mit Engagement-Role `primary_target`. Steps:
  1. `domain_ct_email_mining` + `domain_github_personnel` parallel
  2. `email_pattern_inference` (auf den entdeckten Sample)
  3. Discovered emails → emit Events → `osint_email_passive` chain-läuft per-email
- `osint_person_full` — Manuell startbar (`POST /entities/:id/enrich/full`). Wenn Person verlinkte Emails/Usernames/Phones hat → triggert die jeweiligen Playbooks für alle Kinder-Entities, wartet auf Completion, generiert `signal_chain_log`.

**Concurrency- & Rate-Limit-Layer** (`src/lib/security/osint/`):

- `provider-limiter.ts` — Singleton-Map mit `p-limit`-Pool pro provider-key + Token-Bucket für rate (req/sec). Default-Limits:

| Provider | Concurrency | Rate | Notes |
|---|---|---|---|
| `gravatar` | 5 | unlimited | CDN, friendly |
| `github` (no token) | 1 | 30/min | unauthenticated |
| `github` (with `GH_TOKEN`) | 3 | 5000/h | scopes: `public_repo, read:user` |
| `crt.sh` | 1 | 10/min | sehr empfindlicher Server |
| `dns` | 50 | unlimited | lokaler Resolver |
| `hibp` | 1 | 1.5/sec | rate-limited paid API |
| `holehe-platform-X` | 1 pro Plattform | 5/min | jede Plattform eigenes Limit |
| `username-platform-X` | 1 pro Plattform | 10/min | aus konsolidierter DB |

- `provider-state.service.ts` — persistiert Counter + 429-Backoff in `secu_osint_provider_state`. Bei 429: `paused_until = now + min(2^retries * 60s, 1h)`. Worker-Runner respektiert `paused_until` → setzt `worker_run.status = "skipped"` mit `error: "provider_paused:..."`.
- `engagement-budget.service.ts` — pro Engagement Sliding-Window-Counter. Wenn Budget exceeded → Worker-Run skipped mit `error: "engagement_osint_budget_exceeded"` — Operator wird einmal pro Stunde via `notify_boss` informiert (damit nichts unbemerkt blockiert).

**Auto-Chain — Default-Seed-Rules** (alle `enabled=true` außer cross-engagement, das wird laut bei first-use):

| Rule | Trigger | Action |
|---|---|---|
| "Email entdeckt → passive Recon" | `entity.created` kind=`email_address` | `start_playbook osint_email_passive` |
| "Username entdeckt → cross-platform check" | `entity.created` kind=`username` | `start_playbook osint_username_passive` |
| "Domain als primary_target → Personnel-Mining" | `entity.created` + engagement_role=`primary_target` + kind=`asset_domain` | `start_playbook osint_organization_recon` |
| "Pwned-Finding → Person taggen" | `finding.created` category=`leak` | `tag_entity tag=compromised_credentials` (auf verlinkter Person, falls vorhanden) |
| "Cross-Engagement-Hit" | `entity.updated` (Entity in ≥2 aktiven Engagements) | `notify_boss` "🎯 cross-engagement identity hit: {{entity.displayName}}" |

**Done-Definition Phase 2.7:**

- [ ] Schema-Migration via `./schema-ready.sh` durch (4 neue Entity-Kinds, 2 neue Tabellen, 1 neue Spalte)
- [ ] `canonical-key.ts` erweitert + Tests für alle 4 neuen Kinds (Plus-Address-Konservativität, gmail/googlemail-Equivalence)
- [ ] 13 OSINT-Worker (Tabelle oben) implementiert, je mit Tests gegen Fixtures
- [ ] 4 Playbooks deklariert + Tests dass Conditions/DAG funktionieren + dass Discovered-Entities Events feuern
- [ ] Provider-Limiter mit Tests (p-limit + Token-Bucket + 429-Persistenz + paused_until-Honoring)
- [ ] Engagement-Budget mit Test dass Skipped-Runs sauber loggen
- [ ] 5 Default-Seed-Rules (Tabelle oben)
- [ ] API-Endpoint `POST /engagements/:id/entities/email { email, personId? }` legt email_address-Entity an + verlinkt zur Person + Auto-Chain greift sofort
- [ ] API-Endpoint `POST /entities/:id/enrich/full` triggert `osint_person_full` manuell und gibt Chain-Log-ID zurück
- [ ] API-Endpoint `GET /engagements/:id/signal-chains` listet Chain-Logs des Engagements
- [ ] `audit_log` enthält bei jedem OSINT-Worker-Run `osint.passive.{worker_key}` mit Provider-Quota-State
- [ ] Demo-Seed: ACME-Engagement bekommt eine reale Test-Domain (`example.com` o.ä.), nach `db:reset` läuft Auto-Chain durch und füllt Graph mit ≥10 entdeckten Email/Username/Social-Entities (deterministisch via gemockte Provider in Tests, real bei manuellem Run)
- [ ] `frontend-types.ts` regeneriert

**Phase-2.7-Implementierungs-Notizen:**

- **Username-Plattform-DB konsolidiert, kein Subprocess.** Maigret (~3000), Sherlock (~400), WhatsMyName (~600) werden NICHT als CLI-Subprocess eingebunden (zu fragil + Python-Dependency-Hell). Stattdessen: deren Plattform-DBs zu einer einzigen `data/osint/username-platforms.json` deduplizieren (~3500 unique Plattformen mit Feldern `name, urlPattern, successCriteria (status_code | regex | contains_text), errorCriteria, rateHint, complianceTag`). Eigener TS-Worker liest die Liste, fragt jede Plattform mit Per-Platform-Concurrency-Cap an. Updates der Liste sind ein Git-Submodul / Vendoring per script. Wartungsaufwand: sehr niedrig, weil Plattform-Patterns selten ändern.
- **Holehe-Subset:** Holehe (https://github.com/megadose/holehe) hat ~120 Module. Phase 2.7 portiert die ToS-konformen Top 30 (Adobe, Amazon, Spotify, Pinterest, Codecademy, …) — keine Module die bewusst Captcha probieren oder Brute-Force-Pattern triggern. Liste als YAML im Repo, jede mit `complianceNote`. Operator kann pro Engagement weitere ein/ausschalten via `engagements.osint_holehe_modules` (jsonb-Array, default `["*-curated"]`).
- **GitHub-OSINT-Token-Strategie:** ohne `GH_TOKEN` env nur 30 req/min — schnell rate-limited bei großen Domains. Token wird optional aus env gelesen, Worker emittiert `worker_run.skipped="github_token_missing"` mit klarer Operator-Anweisung. Token-Scope: nur `public_repo, read:user`, kein write. Doku in `CLAUDE.md` §6.
- **HIBP / Breach-Provider-Interface:** Phase 2.7 nur HIBP-Adapter, aber `BreachProvider`-Interface so designed dass DeHashed/LeakCheck/IPQS in Phase 2.8 nur neue Klassen sind. `BreachHit { source, breachName, breachDate, dataClasses[], severity }` ist provider-neutral.
- **MD5-Lowercase-Trim für Gravatar:** `crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex')` — Standard. Gravatar liefert `{ entry: [{ profileUrl, hash, requestHash, … }] }` JSON wenn Profil existiert, 404 wenn nicht.
- **Email-Normalisierung — bewusste Konservativität:** Plus-Adressen (`x+tag@gmail.com`) und Subdomain-Aliase werden NICHT zusammengezogen, sondern als separate Entities + `entity_relationships kind="alias_of"` modelliert. Begründung: für Gmail sind plus-tags semantisch identisch, aber für andere Provider nicht. gmail.com↔googlemail.com ist die einzige Hartcoded-Equivalence (per `email_alias_correlate`).
- **MX-Findings:** Email-Domain mit `null MX` (RFC 7505) → Auto-Finding kategorie=`email_security` severity=`info` "Domain accepts no email — likely typo or non-mailable". Sehr nützliches Pentest-Signal (Typo-Squatting-Detection). Email-Domain ohne MX und ohne A-Record → severity=`low` "Email-Domain unresolvable".
- **Cross-Identity-Hits sind Goldwert:** wenn `username_multiplatform` einen GitHub-Account findet, der schon in einem ANDEREN aktiven Engagement existiert → Rule-Engine `notify_boss` mit Subject "🎯 cross-engagement identity hit". Dieses Pattern ist *der* Business-Wert von "Identitäten global" (Designprinzip §1.2). Einzige Default-Rule die laut wird, weil sie Operator-Awareness braucht.
- **Concurrency-Modell ist Engagement-bewusst, nicht global:** `provider-limiter` ist global (schützt Provider-Quotas), `engagement-budget` ist per Engagement (schützt Operator-Geldbeutel + System-Performance). Beide gemeinsam verhindern dass 5 parallel laufende OSINT-Chains das System killen. Worker-Runs die rate-limited werden, gehen in Status `skipped` mit klarem `error`-String — der Runner zählt sie nicht als "failed" (kein Alarm).
- **Audit-Log explizit:** jeder OSINT-Worker-Run schreibt `osint.passive.{worker_key}` mit `targetType="entity"`, `targetId`, `metadata={provider, providerCounter, foundEntityIds[], findingIds[]}`. Operator kann post-hoc die komplette OSINT-Aktivität pro Engagement in einem SELECT abfragen.
- **Bewusst NICHT in Phase 2.7:**
  - LinkedIn / X(Twitter) / Reddit / Instagram-Scraping — braucht Stealth-Browser (Patchright/Camoufox) + residential IPs aus Phase 3
  - SMTP-Mailbox-Existenz-Check (würde echten Mailserver kontaktieren → kein passive_only mehr)
  - Paid-Provider-Adapter über HIBP hinaus (Hunter, Apollo, Clearbit, DeHashed, LeakCheck) — Phase 2.8
  - Dark-Web / Tor-Crawler / Stealer-Log-Marketplaces — Phase 2.9 (mit `tor_proxy`-Worker-Provider aus Phase 3)
  - Bilder-Reverse-Suche (TinEye, Yandex) — Phase 2.9
  - Phone-Reverse-Lookup paid (Whitepages/BeenVerified) — Phase 2.8
  - Phishing-Mail-Versand / Pretexting-Toolkit — eigene Phase mit `active_intrusive` + written_consent, frühestens Phase 4

**Phase 2.7+ — OSINT-Engine-Vertiefung** *(parallele Vertiefungs-Roadmap, kanonisch in `features.md`)*

Phase 2.7 hat den Worker-Layer aufgesetzt; der Live-Test 2026-05-08 (geilemukke/orvello/niccaswilliams) hat aber gezeigt, dass die Engine bei vielen Domains 0 Funde produziert, weil ihr Hints-API, WHOIS, Impressum-Crawl, Search-Engine, DE-Spezialquellen, Cross-Domain-Pivots und Speculative-Entities fehlen. Der vollständige Mechanik-Katalog (66 Mechaniken in 8 Sektionen) und die Sprint-Reihenfolge (Sprint 1 Foundation → Sprint 8 Person→Firma→Mehr Domains) leben in `features.md`. ROADMAP.md trackt nur den High-Level-Status:

- **Sprint 1.1 — Hints-API + Schema** *(✅ live 2026-05-08)*: Tabelle `secu_engagement_hints` mit 8-Slot-Enum, CRUD-Endpoints unter `/engagements/:id/hints`, Worker-Konsum-API `hintService.getBundle()`. Migration `0005_complex_weapon_omega.sql`. Audit-Log auf jeder Mutation.
- **Sprint 1.2-1.6** *(offen)*: Speculative-Entity-Felder + Confidence-Aggregator, Pivot-Budget-Enforcement im playbook-runner, `osint_pivot_light`-Mini-Playbook, Shared-Utils (UA-Rotation HTTP, CF-Email-Decoder, DNS-Verify, Hosting-Klassifikator), `findingCategoryEnum.compliance_imprint`.
- **Sprint 2+** *(offen)*: Domain→Owner-Worker (WHOIS/RDAP, Impressum mit DDG-§5-Compliance-Audit, DMARC-rua/ruf-Email-Extract, MS-Tenant, HTML-Pivots inkl. Webpack-Chunk-Hash) → Search-Engine + GitHub-Brand-Discovery → DE-Spezial (Handelsregister, Bundesanzeiger, Branchenbuch) → Cross-Domain-Pivot-Aktivierung → Email-Discovery-Vollausbau → Person-Multi-Plattform → Person→Firma→Mehr-Domains.

**Roadmap-Erweiterungen danach:**

- **Phase 2.8 — Paid-OSINT-Aggregator** *(1–2 Wochen, optional, opt-in pro Engagement)*: Adapter für Hunter, Apollo, Clearbit, FullContact, DeHashed, LeakCheck, IPQS. Operator-konfigurierte API-Keys pro Engagement (`engagements.osint_provider_keys` jsonb). Same Auto-Chain-Pattern wie 2.7, neue Provider-Klassen klinken sich ins `BreachProvider`-/`PersonEnrichmentProvider`-Interface ein. Provider-Limiter erweitert um die paid-Provider-Quotas. Cost-Tracking pro Run.
- **Phase 2.9 — Dark-Web + Stealer-Logs** *(3 Wochen, baut auf Phase 3 Cloud-Worker auf)*: Tor-Worker via existierenden `tor_proxy`-Provider (Schema bereits vorhanden), Ahmia-style Scrapy-Subset für ausgewählte Onion-Indizes, HudsonRock Cavalier free-Tier-Adapter, dehashed-Marketplace-Monitoring. Hard-Authorization: nur `customer_pentest` mit `written_consent` ODER `internal`/`solo_lab`. Dedizierte `dark_web_artifact`-Subkind in `secu_artifacts.kind` mit Verschlüsselung at-rest (Engagement-Schlüssel aus Phase 5).

---

### Phase 3 — Cloud-Worker-Layer *(Operator-Vertiefungsthema, 3–6 Wochen)*

> **Persönliches Vertiefungs-Thema des Operators.** Hier will er sich tief reinarbeiten — nicht nur "Worker läuft in der Cloud", sondern: realistische Pentest-Topologie inkl. DDoS-Resistenz, Stealth, RAT-Steuerung-Patterns. Diese Phase ist bewusst breiter angelegt; siehe Sektion 4 für die Brainstorm-Fragen, die parallel beantwortet werden müssen.

**Components:**

- **WorkerProvider-Interface** — `provision(workerSpec) → WorkerHandle`, `exec(handle, command) → Stream`, `terminate(handle)`. Adapter:
  - `LocalProvider` (Phase 2)
  - `HetznerProvider` (Phase 3 default)
  - `DockerHostProvider` (für eigenen Cluster)
  - Stub für `AwsProvider`, `DigitalOceanProvider`, `TorProxyProvider`
- **Lifecycle-Modi:**
  - `ephemeral` — VM hochziehen, Job, killen (default für Active-Scans)
  - `persistent` — pro Engagement eine Drop-Box-VM (für lange Beobachtung, Beacons, RAT-Tests)
  - `pool` — warmer Pool für schnelle Jobs
- **Provider-Registry** auf Engagement-Ebene konfigurierbar (welcher Provider, welche Region, welche IP-Range).
- **Telemetrie:** worker_runs.provider_instance_id, Cost-Tracking, IP-Tracking pro Run (für späteres Audit "von welcher IP hat dein Tool was gemacht").

**Done-Definition Phase 3:**

- [ ] `nmap_top1000`-Worker läuft sowohl `LocalProvider` als auch `HetznerProvider`, gleicher Output
- [ ] VM wird nach Run zuverlässig terminiert (kein Cost-Leak)
- [ ] Operator kann pro Playbook-Run wählen: Provider + Region
- [ ] Logs streamen live in `worker_runs.logs_ref` (S3/MinIO oder lokal)

---

### Phase 4 — Aktive Worker-Bibliothek *(laufend, ab Phase 3)*

Jeder Tool ist ein eigener Worker, isoliert in Docker, Authorization-Gate aktiv, Output strukturiert geparst.

| Domäne          | Worker-Keys                                                              |
| --------------- | ------------------------------------------------------------------------ |
| Recon-active    | `nmap_top1000`, `nmap_full`, `masscan`, `naabu`, `amass_active`          |
| Web-vuln        | `nuclei_safe`, `nuclei_full`, `wpscan`, `wpscan_aggressive`              |
| Web-fuzzing     | `ffuf_dirs`, `gobuster_vhost`, `katana_crawl`                            |
| Web-exploit     | `sqlmap`                                                                 |
| TLS             | `sslyze_deep`, `testssl`                                                 |
| Auth-resistance | `hydra_login`, `kerbrute`                                                |
| Hash/Cred       | `john_crack`, `hashcat_crack` (eigene Worker mit GPU-Provider)           |
| AD/Internal     | `crackmapexec`, `bloodhound_collector`, `impacket_*`, `responder` *(eigenes Cloud-Topology-Setup nötig — Drop-Box im Zielnetz, separater Plan)* |

**Pro Worker liefert die Phase:** Dockerfile, Worker-Adapter, Output-Parser, Finding-Mapper, Test gegen kontrollierte Test-Targets.

---

### Phase 5 — Findings, Knowledge-Base, Loot *(2–3 Wochen)*

- Finding-Service-Reife: Severity-Aggregation pro Engagement, Suppress-Listen, Notes pro Finding
- Loot-Storage: verschlüsselte Artifact-Ablage (S3-kompatibel mit clientseitiger Krypto, Schlüssel pro Engagement)
- Volltext-Suche über Notes/Commands/Findings (Postgres FTS5 oder Meilisearch)
- Command-History Replay — "was hat node-secu in diesem Engagement bisher gemacht"

---

### Phase 6 — Reporting *(2 Wochen)*

- Markdown-Generator pro Engagement: Executive-Summary + technische Findings + Graph-Snapshot
- PDF via Puppeteer/wkhtmltopdf
- Customer-Variante (geschönt) vs. Operator-Variante (alle Notes/Loot inkl.)

---

### Phase 6.5 — Advisory Output *(2–3 Wochen)*

**Goal:** Den Schritt vom *Findings-Bericht* zum *Beratungs-Output* machen. Der Operator will Pentest-Arbeit in Beratung umwandeln — das heißt mehr als Findings auflisten: priorisierte Maßnahmen, Roadmap für den Kunden, Risiko-Heatmap.

**Components:**

- **`advisory_recommendations`-Tabelle** — id, engagement_id, finding_ids (array), title, problem_summary, recommendation (markdown), effort (`xs` | `s` | `m` | `l` | `xl`), business_risk (`low` | `medium` | `high` | `critical`), priority_score (computed), status, target_date
- **Recommendation-Templates** — wiederverwendbare Bausteine pro Finding-Type (z.B. "Fehlender HSTS-Header" → Standard-Empfehlung mit Variation per Engagement-Kontext). Markdown mit Platzhaltern.
- **Risk-Heatmap-Generator** — aggregiert Findings + Recommendations zu einer Asset/Risk-Matrix (CSV + JSON für Frontend)
- **Maßnahmen-Roadmap** — gruppiert Recommendations nach effort × priority und schlägt eine 30/60/90-Tage-Roadmap für den Kunden vor
- **Report-Variante "Advisory"** — Executive-Summary fokussiert auf Geschäftsrisiko + Roadmap, Findings als Anhang

**Done-Definition Phase 6.5:**

- [ ] Aus einem fertigen Engagement lässt sich per `POST /engagements/:id/advisory/generate` ein Advisory-Output erzeugen
- [ ] Mindestens 10 Recommendation-Templates für die häufigsten Finding-Types
- [ ] Roadmap-Output ist strukturiert genug um direkt im amp-Frontend als Kunden-Roadmap angezeigt zu werden
- [ ] Heatmap-Daten als JSON für späteres Dashboard verfügbar

---

### Phase 7 — AI-Aufsatz *(erst wenn 1-6.5 stabil)*

- Triage: LLM filtert False-Positives auf Findings
- Playbook-Empfehlung: "Du bist hier — diese drei Folge-Playbooks ergeben Sinn"
- Report-Text-Generierung
- Anbindung über node-boss (`BOSS_API_URL`)

**Gate:** Erst wenn 30 Tage lang produktiv mit dem deterministischen System gearbeitet wurde.

---

### Phase 8 — Öffnung für Dritte *(später)*

- Multi-Tenant: weitere `owner_user_id`-Lanes
- API-Keys für externe Konsumenten (z.B. node-amp)
- Public-Passive-Scan-Funnel (aus alter Roadmap übernehmbar — `publicScanLeads` existiert teils)
- Customer-Authorization-Workflow (DNS-TXT, schriftlicher Auftrag)

---

## 3. Dauerhafte Querschnitts-Themen

- **Authorization-Gate:** unverhandelbar. Jeder neue Worker muss `requiredScope` deklarieren.
- **Audit-Log:** jeder Active-Scan-Trigger und jede Rule-Auslösung geht in `audit_log`. Wer-was-wann-warum.
- **Schema-Migrationen:** ausschließlich via `./schema-ready.sh`.
- **Tests:** echte DB > Mocks (siehe CLAUDE.md §9).
- **node-boss-Integration** *(ab Phase 2.5 minimal, ausgebaut in Phase 7):*
  - **Phase 2.5:** Rule-Action `notify_boss` postet kritische Findings als Telegram-Push an den Operator (via `BOSS_API_URL` + `x-app-id: node-secu` + `x-api-key: BOSS_API_KEY`).
  - **Phase 5:** lange laufende Active-Scans als boss-Workflows (Resilience gegen node-secu-Restarts).
  - **Phase 7:** AI-Triage von Findings über boss' Claude-Routing-Pipeline.
- **Worker-Schnittstelle stabil halten.** Auch wenn Phase 2-4 alle Worker im Monorepo liegen — Interface (`SecurityWorker`-Contract, Input-/Output-Schemas, Worker-Manifest) so designen dass spätere Plugin-Extraktion *nur* ein Move + Manifest-Datei ist. Kein Plugin-Loader-Code jetzt, aber keine Architektur-Schulden die ihn später blockieren.

## 4. Operator-Vertiefungs-Themen (parallel zu Phase 3)

Diese Themen will der Operator persönlich vertiefen, weil sie Architektur-Entscheidungen prägen. Jedes braucht eine eigene kurze Recherche-Session, bevor in Phase 3 die finale Provider-Architektur eingefroren wird.

### 4.1 Cloud-Worker-Topologie & DDoS-Resilienz
- Wann braucht ein Pentest **frische IPs**? (Bot-Detection, Rate-Limit-Bypass)
- Wann braucht es **stabile IPs**? (Whitelisted bei Kunden — viele Kunden whitelisten EINE IP)
- DDoS-Schutz: muss node-secu selbst gegen Backflow geschützt sein? (z.B. wenn Target zurückscannt)
- Multi-Provider-Strategie: Hetzner + AWS + DO für IP-Diversität, oder reicht Hetzner + ein Tor-Exit-Node-Pool?

### 4.2 Stealth & OPSEC
- Tor / Proxy-Chains für Recon-Phase
- User-Agent / Header-Rotation
- Timing-Jitter zwischen Requests
- TLS-Fingerprint-Spoofing (utls)
- DNS über DoH

### 4.3 RAT- / C2-Testing-Integration
- Wenn Pentest-Engagement ein RAT-/C2-Komponente erfordert (Sliver, Mythic, Havoc): wie wird das in node-secu integriert *ohne* dass node-secu selbst zur Malware wird?
- Cloud-Worker als **Listener**: VM hostet C2-Endpoint, node-secu steuert sie API-seitig, Operator-Identität bleibt verschleiert
- Persistente Drop-Box-VM pro Engagement: langlebig, IP-stabil, im Zielnetz erreichbar
- Logging: Was wird zentral gespeichert, was bleibt nur auf der Drop-Box?
- **Authorization:** RAT-Workflows brauchen `active_intrusive` + schriftlichen Vertrag. Hardcoded.

### 4.4 AD/Internal-Pentest-Setup
- Drop-Box-VM mit OpenVPN/Wireguard ins Kundennetz
- BloodHound-Integration: collector läuft auf Drop-Box, Daten werden via API zu node-secu zurückgepusht
- Impacket-Worker: brauchen Domain-Controller-Reachability — wie wird das pro Engagement konfiguriert?

### 4.5 Beweissicherung & Legal-Trail
- Welche Artifacts müssen zwingend gespeichert werden für späteren Bericht/Legal-Verteidigung?
- Verschlüsselte Ablage mit Engagement-Schlüssel — Schlüssel-Rotation, Recovery-Prozess?
- Tamper-Evident-Logging (Hash-Chain im audit_log)?

→ Sobald diese Themen entschieden sind, wird Phase 3 final spezifiziert. Bis dahin wird die `WorkerProvider`-Schnittstelle **bewusst minimal** gehalten, damit sie noch erweiterbar ist.

## 5. Was aus der alten Roadmap bleibt

- **Authorization-Modell** (Tabelle `assetAuthorizations`, `canScan()`-Gate, Scope-Mapping)  → übernehmen, aber gegen `entities` (FK statt asset_id) und Engagement-Kontext referenzieren
- **Tech-Fingerprint-Tabelle**  → wird Teil der Entity-Daten (jsonb in `entities.data`); Tech-Fingerprint-Service in Phase 2 explizit ausgebaut
- **Audit-Log**  → bleibt
- **Public-Scan-Funnel**  → später (Phase 8), Code aus legacy nutzbar
- **CVE-Matcher**  → Phase 5/6, nicht Phase 1

## 6. Was aus der alten Roadmap rausfliegt

- "Asset" als zentrale Wurzel-Entität (wird zu polymorpher Entity unter Engagement)
- Trennung "scan vs. scan_run" (wird zu `playbook_run` + `worker_run`)
- Customer-Onboarding-Flow als Phase-1-Treiber (wird Phase 8)
- Free-Public-Scan als Lead-Funnel (wird Phase 8 — niedrige Priorität bis Solo-Tooling steht)

---

## 7. Erster konkreter Schritt

Nach Approval dieser Roadmap: **Phase-0-Sprint** (2–3 Tage Aufräumen, siehe oben), dann **Phase-1-Sprint** mit:

1. `src/db/individual/individual-schema.ts` neu aufbauen (engagements + entities + entity_relationships + entity_tags + engagement_entities + findings + artifacts + command_history + playbook_runs + worker_runs + entity_authorizations)
2. `./schema-ready.sh` durchziehen
3. Seeds für drei Demo-Engagements (`solo_lab`, `ctf`, `customer_pentest`) inkl. Demo-Graph
4. CRUD-Routen unter `src/routes/security/engagements/` und `src/routes/security/entities/`
5. Graph-Endpoint mit JSON-Struktur die Cytoscape direkt frisst
6. AuthorizationResolver gegen `entity_authorizations` implementieren — der in Phase 0 vorbereitete Service-Vertrag wird nur noch gewired

Geschätzte Dauer: **2 Wochen Vollzeit-äquivalent**, parallelisierbar mit Phase-3-Recherche (Sektion 4).
