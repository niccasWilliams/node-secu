# Node-Template — Langzeit-Plan

> Referenz-Dokument für alle geplanten Verbesserungen am node-template.
> Wird in zukünftigen Sessions als Kontext genutzt.

---

## Phase 1: Repos aufräumen (aktuell)

### 1.1 node-ruleregistry APP_ID Fix
- [x] `app.config.ts`: APP_ID → `"node-ruleregistry"`
- [x] Bill-spezifische Konstanten entfernen (KLEINUNTERNEHMER, USTVA)
- [ ] AMP Manifest Kommentar korrigieren

### 1.2 AMP Manifest Upgrade (node-template)
Manifest auf next-template Format bringen mit 4 Secret-Tiers:

**Klar (sofort umsetzbar):**
- `railway_reference`: DATABASE_URL
- `auto_generate`: API_KEY, DATA_ENCRYPTION_KEY, JWT_SECRET, CRON_JOB_SECRET, Peppers
- `amp_managed`: AMP_URL, AMP_API_KEY, AMP_API_KEY, TEMPLATE_SYNC_TOKEN, AWS_*, DZ_*, EMAIL_FROM
- `customer_managed` (ohne group, auto-filled): HOST_NAME, PUBLIC_URL
- `capabilities`: logs=true, idm=true, rest=false

**Offen (spätere Phase):**
- FRONTEND_API_KEY + FRONTEND_HOST_NAME → siehe Phase 4 (Multi-App)

**Erledigt (Phase 3.3):**
- ENTITLEMENTS_SYNC_API_KEY → `amp_managed`, gesetzt durch Connection Orchestrator bei Provisioning
- SHOP_API_URL + SHOP_API_KEY → nicht mehr noetig, AMP registriert Apps direkt beim Shop via B2B API

### 1.3 .env.sample für node-template
- Generische Version basierend auf node-bill .env.sample
- Ohne app-spezifische Vars
- Mit guter Dokumentation pro Sektion

### 1.4 Manifest-Sync zu bill + ruleregistry
- Gleiche Manifest-Struktur in beide Apps übernehmen
- App-spezifische Secrets ergänzen (bill: SHOP_*, ruleregistry: CHD_*, LLM_*)

### 1.5 OAuth2 Zentralisierung (DONE)
- [x] OAuth2 Base-Files im Template (8 Dateien: Schema, Services, Controller, Routes, DTO, Scopes, UseCase, Token-Service)
- [x] Individual-Config-Pattern: `oauth2-scopes.config.ts` + `oauth2-tenant.config.ts` in allen 3 Repos
- [x] Runtime Tenant-Support: Alle Base-Files pruefen `OAUTH2_TENANT_CONFIG` und handeln bedingt
- [x] `getManagingCompanyIdFromRequest` extrahiert → `src/util/individual/tenant-utils.ts`
- [x] Alle 8 synced Base-Files identisch zwischen Template und node-bill (verifiziert)
- [x] JWT backward-compat fuer legacy "NodeBill" Issuer
- [x] node-ruleregistry: Individual-Configs erstellt, bekommt Base-Files per Sync
- [x] Base-Tests aus node-bill ins Template kopiert
- [x] `.templatesyncignore` in allen 3 Repos aktualisiert
- [x] `file-type` Dependency in Template und node-bill hinzugefuegt
- [x] **Schema-Sync** — `managingCompanyId` auf `.notNull().default(0)` geaendert. FK nur per Migration in node-bill. Schema aus `.templatesyncignore` entfernt.
- [x] **Cost-Center-Policy-Validation** — `resolveCostCenterPolicy`, `validateCostCenterIdsBelongToCompany`, `normalizeCostCenterList`, `parseStoredCostCenters` im Base-UseCase. Bedingt aktiv via `hasCostCenterFields()` + `OAUTH2_TENANT_CONFIG.resourceFields`. Dynamic Import fuer `companyCostCenterService`.
- [ ] **node-ruleregistry Sync ausfuehren** — Hat nur Individual-Configs, braucht noch tatsaechlichen Template-Sync fuer Base-Files.

**Individual-Config Uebersicht (alle 3 Repos):**
```
src/routes/oauth2/individual/
├── oauth2-scopes.config.ts      → App-spezifische Scopes (Enum, Descriptions, Groups)
└── oauth2-tenant.config.ts      → enabled: false (Template/ruleregistry) | true (node-bill)

src/util/individual/
└── tenant-utils.ts               → getManagingCompanyIdFromRequest (no-op | real)
```

---

## Phase 2: Template-Sync + Boss/AMP Integration

### 2.1 Template-Sync Infrastruktur (DONE)

Vollstaendig implementiert — identisch zum next-template Pattern.

**Sync-Workflow** (`template-sync.yml`):
- [x] Woechentlicher Pull via `AndreasAugustin/actions-template-sync@v2` (Montag 03:00 UTC)
- [x] Manuell auslösbar via `workflow_dispatch`
- [x] Automatischer Post-Sync Fix: `pnpm run post-sync-fix` stellt App-Config wieder her
- [x] Automatischer Commit + Push zum Sync-Branch

**Push-Notification** (`notify-parent-on-update.yml`):
- [x] Benachrichtigt AMP bei Push/Merge auf `main` via `POST {AMP_URL}/apps/git-push`
- [x] Extrahiert `APP_ID` aus `src/app.config.ts`, sendet commitSha + Metadata
- [x] x-api-key Auth via `AMP_API_KEY` Secret

**Post-Sync Fix** (`scripts/post-sync-fix.ts`):
- [x] Liest `.setup-config.json` (appName, dbPort, nodePort, databaseUrl)
- [x] Stellt nach Sync wieder her: `package.json` Name, `docker-compose.yml` Ports, `drizzle.config.ts` DB-URL, `.env` Ports
- [x] Registriert als `pnpm run post-sync-fix`

**Sync-Protection** (`.templatesyncignore`):
- [x] Schuetzt Individual-Dateien (`src/db/individual/*`, `src/routes/*/individual-*`)
- [x] Schuetzt App-Config (`.env`, `drizzle.config.ts`, `docker-compose.yml`, `.setup-config.json`)
- [x] Schuetzt OAuth2-Individual (`src/routes/oauth2/individual/*`)
- [x] Schuetzt Entitlements-Individual (`src/lib/entitlements/individual/*`)
- [x] Schuetzt Tenant-Utils (`src/util/individual/*`)
- [x] Dokumentation: `TEMPLATE_SYNC.md` mit vollstaendigem Workflow-Guide

**File-Inventar:**
```
.github/workflows/
├── template-sync.yml             → Woechentlicher Pull + Auto-Fix + PR
└── notify-parent-on-update.yml   → Push-Notification an AMP

scripts/
└── post-sync-fix.ts              → Stellt App-Config nach Sync wieder her

.setup-config.json                → App-spezifische Werte (Name, Ports, DB-URL)
.templatesyncignore               → Schuetzt Individual-Dateien vor Ueberschreibung
TEMPLATE_SYNC.md                  → Workflow-Dokumentation
```

**Operativer Rollout (pro Child-Repo):**
- [ ] GitHub Secret `TEMPLATE_SYNC_TOKEN` setzen (PAT mit `repo` + `workflow` Scope)
- [ ] GitHub Secrets `AMP_URL` + `AMP_API_KEY` setzen (fuer Push-Notification)
- [ ] `.setup-config.json` committed (ohne diese Datei scheitert der Post-Sync Fix)
- [ ] Erster Sync: Manueller Workflow-Trigger oder naechster Montag 03:00 UTC

### 2.2 AMP Service Registration + Discovery (DONE)

Vollstaendig implementiert — AMP kann node-template Apps automatisch erkennen und verwalten.

**Discovery-Endpoint** (`src/routes/amp-proxy/amp-proxy.route.ts`):
- [x] `GET /api/amp-proxy/_discover` — Liefert AMP-Manifest
- [x] Auth: `x-api-key` Header oder Bearer Token gegen `APP_API_KEY`
- [x] AMP's taeglicher Discovery-Job ruft diesen Endpoint auf allen aktiven Apps auf

**AMP-Manifest** (`src/routes/amp-proxy/amp.manifest.ts`):
- [x] `appId` dynamisch aus `APP_ID` (app.config.ts)
- [x] Capabilities: `logs=true`, `idm=true` (erweiterbar pro App)
- [x] Dependencies: Deklariert Abhaengigkeiten zu anderen Apps (node-amp, etc.)
- [x] Secret-Management mit 4 Tiers:
  - `railway_reference` — Railway liefert den Wert (`DATABASE_URL`)
  - `auto_generate` — AMP generiert einmalig (API_KEY, JWT_SECRET, Peppers, etc.)
  - `amp_managed` — AMP synct aus Company-Vault (AWS, Email, AMP-Keys)
  - `customer_managed` — Auto-filled (HOST_NAME, PUBLIC_URL) oder Onboarding-Flow
- [x] Health-Check: `/app-info/health` mit 300s Intervall
- [x] Supported Limits: Leer im Template (Apps ergaenzen eigene)

**AMP-Proxy** (`src/routes/amp-proxy/amp-proxy.route.ts`):
- [x] OAuth2 Bearer Token Validation fuer alle Proxy-Requests
- [x] `GET /api/amp-proxy/logs` — Log-Abfrage mit Search, Pagination, Level-Filter
- [x] `POST /api/amp-proxy/create-log` — Remote Log-Erstellung
- [x] `DELETE /api/amp-proxy/delete-logs` — Log-Loeschung

**Public Endpoints** (`src/routes/appInfo/app-info.route.ts`):
- [x] `GET /app-info/manifest` — AMP-Manifest (public, kein Auth)
- [x] `GET /app-info/health` — Health-Check mit DB-, Memory-, EventLoop-Diagnostik

**AMP-seitig (node-amp):**
- [x] `gf_apps` Tabelle mit `technology: "nodejs"`, `authType`, `baseUrl`, `bossStatus`
- [x] `initial-apps.ts` — node-bill, node-shop bereits registriert
- [x] Discovery-Job: Taeglich, ruft `/_discover`, synct Capabilities + Secrets + Dependencies
- [x] Boss-Sync: `POST /internal/boss/sync` — Deployment-Status, Migrations, Repo-Info
- [x] Auto-Tickets bei Discovery-Fehlern (unreachable, missing secrets)

**File-Inventar:**
```
src/routes/amp-proxy/
├── amp.manifest.ts               → AMP-Manifest (Capabilities, Secrets, Dependencies, Health)
└── amp-proxy.route.ts            → Discovery + Proxy Endpoints (OAuth2-geschuetzt)

src/routes/appInfo/
├── app-info.route.ts             → Public Manifest + Health Endpoints
├── app-info.controller.ts        → Handler-Implementierung
└── app-info.dto.ts               → Query-Schemas
```

**Operativer Rollout (pro App):**
- [ ] App in AMP's `gf_apps` registrieren (oder via initial-apps.ts Seed)
- [ ] `baseUrl` in AMP setzen (z.B. `https://bills.geilemukke.de`)
- [ ] `APP_API_KEY` auf Railway setzen (damit AMP `/_discover` aufrufen kann)
- [ ] Boss-Service verknuepfen: `internalServiceId` in `gf_apps` setzen
- [ ] Erster Discovery-Run verifizieren (AMP Dashboard oder manueller Job-Trigger)

### 2.3 AMP App-Provisioning Pipeline (DONE)

node-template als Template-App in AMP registriert. Provisioning-Pipeline technology-agnostic gemacht.

**Aenderungen in node-amp:**
- [x] `initial-apps.ts`: node-template als 9. App mit `isTemplate: true`, `technology: "nodejs"`, `configFilePath: "src/app.config.ts"`
- [x] `initial-apps.ts`: Dependencies node-amp (data) + node-cron (infrastructure) hinzugefuegt
- [x] `initial-apps.ts`: Project-Templates Seed-Daten ("Next.js Frontend" + "Node.js Backend") mit `infraConfig`, `envConfig`, `repoConfig`, `dbInitConfig`
- [x] `app.useCase.ts`: Seed-Funktion erstellt Project-Templates nach Apps (FK auf `templateAppId`)
- [x] `app.useCase.ts:123`: configFilePath-Default von `"src/app-config.tsx"` auf `null` geaendert (keine nextjs-Annahme)
- [x] `provisioning.steps.ts:178`: configFilePath-Default von `"src/app-config.tsx"` auf `null` geaendert
- [x] `provisioning.steps.ts:~485`: `PUBLIC_URL` zu Auto-Fill-Vars hinzugefuegt (neben HOST_NAME/NEXT_PUBLIC_HOST_NAME)
- [x] **"Add to Existing Project"**: `provisionBodySchema` + `ResolvedProvisioningInput` um `existingProjectId`, `existingRailwayProjectId`, `existingRailwayEnvironmentId` erweitert
- [x] Steps 1+2: Skip-Logik wenn `existingProjectId`/`existingRailwayProjectId` gesetzt — Rollback schuetzt bestehende Projekte

**Provisioning-Flows:**
- **Neues Projekt**: Alle 14 Steps (Projekt → Railway → GitHub → App → Service → DB → ENV → Register → Secrets → Shop → Connection-ENV → Cron → Boss → Init)
- **Bestehendes Projekt**: Steps 1+2 geskippt, App wird in existierendes Projekt eingefuegt (Steps 3-14)
- **Ohne Shop-Connection**: Steps 10+11 uebersprungen wenn `infraConfig.connections.shop.enabled === false`
- **Ohne Cron**: Step 12 prueft Vault auf CRON_JOB_SECRET → nicht vorhanden → skipped

**Nicht in Scope (spaetere Phase):**
- Multi-Template Projects (node-template + next-template in einem Projekt automatisch pairen)
- Williams UI fuer Onboarding-Wizard
- Connection Orchestrator (automatisches ENV-Wiring zwischen Frontend und Backend)

---

## Phase 3: Shop-Integration + Entitlements Upgrade

### 3.1 Entitlements Individual-Config Pattern (DONE)
**Umgesetzt:** App-spezifische Konfiguration in `src/lib/entitlements/individual/`:
- `entitlement-metrics.config.ts` — Welche Metriken die App hat (leer = keine)
- `plan-limits.config.ts` — Plan-Tiers mit Limits pro Metrik (leer = alle unlimited)
- `role-hierarchy.config.ts` — Rollen-Vererbung (leer = keine)
Base-Services lesen aus diesen Configs. Frische Apps funktionieren mit leeren Defaults.

### 3.2 Generische Usage-Overage-Pipeline (DONE)
Vollstaendig generisch implementiert — keine hart-kodierten Metriken mehr.

**Synced (Template) Services:**
- `subscription-limits.service.ts` → generische `Record<string, number | null>`, liest aus `plan-limits.config.ts`
- `usage-overage-pull.service.ts` → iteriert ueber `APP_METRICS`, delegiert an `measureMetrics()`

**Individual (App-spezifisch) Configs:**
```
src/lib/entitlements/individual/
├── entitlement-metrics.config.ts   → APP_METRICS Array (leer im Template)
├── plan-limits.config.ts           → APP_PLAN_PROFILES + LEGACY_PLAN_LIMITS (leer im Template)
└── metric-measurement.service.ts   → measureMetrics() Stub (return {} im Template)
```

Frische Apps funktionieren mit leeren Defaults. Apps definieren eigene Metriken in den Individual-Files.

### 3.3 Connection Orchestrator — Shop + Cron + Tracking + User-Endpoints (DONE)
AMP registriert provisionierte Apps automatisch bei node-shop und node-cron, trackt alle Connections
in `gf_app_connections` und bietet User-Endpoints zum Verwalten, Erkennen und manuellen Herstellen.

**Provisioning-Flow (14 Steps):**
```
Steps 1-6:  Projekt, Railway, GitHub, App, Services, DB
Step 7:     wire_env_variables — Secrets generieren + Railway pushen
            └── CRON_JOB_SECRET zusaetzlich im AMP Vault gespeichert
Steps 8-9:  Railway in AMP registrieren, Secrets Setup
Step 10:    register_with_shop — Idempotent upsert bei node-shop + gf_app_connections
Step 11:    wire_connection_env_vars — ENTITLEMENTS_SYNC_API_KEY auf Railway
Step 12:    register_with_cron — CRON_JOB_SECRET aus Vault lesen, node-cron upsert + gf_app_connections
Steps 13-14: configure_boss_db, initial_db_setup
```

**Manifest-getriebene Detection:**
- CRON_JOB_SECRET im Vault → Cron-Registration (automatisch fuer ALLE Templates)
- ENTITLEMENTS_SYNC_API_KEY im Vault → Shop-Registration
- Kein `infraConfig.connections.cron.enabled` Flag noetig — Step 12 prueft Vault und skippt sich selbst

**Connection Status Tracking (`gf_app_connections`):**
- `UNIQUE(appId, connectionType)` — eine Connection pro Typ pro App
- Status: connected/disconnected/pending/error/not_configured
- Health-Tracking: lastHealthCheckAt, consecutiveFailures
- Provisioning-Run + Secret-Link

**User-Endpoints (AMP REST API):**

| Method | Pfad | Beschreibung |
|--------|------|-------------|
| GET | `/connections/overview` | Alle Apps mit Connection-Status |
| GET | `/connections/by-app/:appId` | Connections einer App |
| GET | `/connections/detect/:appId` | Manifest-Detection: welche Connections braucht die App? |
| POST | `/connections/establish` | Manuell Connection herstellen (Retry, Legacy, Rotation) |
| POST | `/connections/verify/:appId/:type` | Health-Check einer Connection |
| POST | `/connections/remove` | Connection-Record entfernen |

**Idempotenz:** Alle Registration-Calls sind Upserts (create-or-update). Vault-Secrets werden vor Neuanlage geprueft.
**Fehler-Strategie:** Kein Rollback bei Connection-Steps — Infrastruktur bleibt, Ticket wird erstellt.

**Geaenderte Dateien:**

| Repo | Datei | Aenderung |
|------|-------|-----------|
| **node-shop** | `external-app.route.ts` | B2B register (upsert) + update + delete Routes |
| **node-shop** | `external-app.useCase.ts` | +registerExternalApp Upsert-Methode |
| **node-cron** | `external-app.route.ts` | B2B register + status + delete Routes |
| **node-cron** | `external-app.useCase.ts` | +registerExternalApp Upsert-Methode |
| **node-cron** | `middleware.ts` | +isBackendToBackend Middleware |
| **node-amp** | `src/lib/node-shop/node-shop-api.ts` | B2B API Client (registerExternalApp) |
| **node-amp** | `src/lib/node-cron/node-cron-api.ts` | B2B API Client (registerApp, getAppStatus) |
| **node-amp** | `individual-schema.ts` | +gf_app_connections Tabelle + Enums |
| **node-amp** | `project-template.service.ts` | 14 Step-Keys |
| **node-amp** | `provisioning.steps.ts` | Step 7 Vault-Store + Step 12 registerWithCron + Connection-Tracking |
| **node-amp** | `provisioning.context.ts` | +cronJobSecret, cronJobSecretId, cronRegistrationId |
| **node-amp** | `src/routes/connections/*` | NEU — Service, UseCase, Controller, DTO, Route |
| **node-template** | `amp.manifest.ts` | ENTITLEMENTS_SYNC_API_KEY als amp_managed |
| **node-bill** | `amp.manifest.ts` | ENTITLEMENTS_SYNC_API_KEY als amp_managed |

**Noch offen (Deployment):**
- [ ] `drizzle-kit push` fuer gf_app_connections + Enums in node-amp
- [ ] "Node.js Backend" Template in DB: `infraConfig.connections = { shop: { enabled: true } }`
- [ ] `NODE_SHOP_URL` + `NODE_SHOP_B2B_API_KEY` in node-amp Prod-ENV
- [ ] `NODE_CRON_URL` + `NODE_CRON_B2B_API_KEY` in node-amp Prod-ENV
- [ ] `BACKEND_TO_BACKEND_API_KEY` in node-shop + node-cron Prod-ENV pruefen

**Connection Health Job (Phase F — DONE):**
- `connection-health-check` Job laeuft alle 30 Minuten
- Prueft Cron-Connections via `nodeCronApi.getAppStatus()`
- Transiente Fehler (1-4) werden nur gezaehlt, kein Ticket
- Persistente Fehler (5+) → Status `error` + Auto-Ticket mit Diagnose
- Recovery-Detection: Failures reset auf 0 wenn Connection wieder healthy

**Nicht im Scope (spaeter):**
- URL-Change-Propagation (Domain aendert sich → Shop/Cron updaten)
- OAuth2-Upgrade (API Key → OAuth2 CC nach Deploy)
- node-bill direkte Registration (AMP hat bereits OAuth2 Client zu node-bill)

### 3.4 Entitlement Manifest → Shop Metric Catalog (DONE)
Pipeline komplett End-to-End implementiert:
1. App definiert `APP_METRICS` in `entitlement-metrics.config.ts` (Individual-File)
2. App exponiert `GET /entitlements/app-manifest` (Template-Route, OAuth2-geschuetzt)
3. Shop holt Manifest waehrend Entitlement-Fetch (parallel, fail-safe)
4. Shop synct zu `app_metric_catalog` Tabelle (Upsert, deaktiviert entfernte Metriken)
5. Shop-Registration setzt `isActive: true` → Auto-Sync beginnt

**Noch offen (Shop-Frontend):** Admin-UI zum Ansehen des Metric Catalogs und Erstellen von
`entitlementLimitConfigs` aus Manifest-Vorschlaegen. Backend-Infrastruktur steht.

### 3.5 Shop-Verbindung konfigurierbar (DONE — durch Connection Orchestrator)
- `amp_managed`: AMP registriert automatisch bei Provisioning (Steps 10+12)
- `customer_managed`: User nutzt `POST /connections/establish` fuer manuelle Herstellung
- Detection: `GET /connections/detect/:appId` zeigt benoetigte Connections basierend auf Vault-Secrets

---

## Phase 4: Multi-App Projekte (Backend + Frontend)

### 4.1 FRONTEND_API_KEY Automatik
**Problem:** Wenn next-template (Frontend) + node-template (Backend) im selben Projekt sind,
brauchen sie einen shared API Key. Aktuell manuell.

**Ziel-Flow:**
1. Projekt hat 2 Apps: Frontend (next-template) + Backend (node-template)
2. AMP generiert FRONTEND_API_KEY (auto_generate)
3. AMP setzt Key auf BEIDEN Apps:
   - Frontend: als `BACKEND_API_KEY` oder `FRONTEND_API_KEY`
   - Backend: als `FRONTEND_API_KEY`
4. Frontend kennt Backend-URL → `BACKEND_URL` (auto aus Railway Internal Network)

**Benötigte Änderungen:**
- AMP: Projekt-Level Secret-Sharing (neues Konzept)
- Manifest: `projectLinks` oder ähnlich → deklariert Abhängigkeiten zu anderen Template-Typen

### 4.2 Boss-gesteuerte Repo-Integration
**Problem:** Backend muss im Frontend-Repo verankert werden (oder umgekehrt).

**Optionen:**
- **Option A: Separate Repos** (einfacher)
  - Frontend + Backend jeweils eigenes Repo
  - Kommunikation über Railway Internal Network
  - `/generated` Ordner wird NICHT kopiert (Types über API Contract)
- **Option B: Monorepo** (komplexer, aber tighter Integration)
  - Boss erstellt Backend-Folder im Frontend-Repo
  - Boss kopiert `/generated` Types in Frontend
  - Template-Sync muss beide Teile kennen

**Empfehlung:** Option A für Phase 4, Option B als Phase 5.

### 4.3 API Contract → Frontend Types
- node-template generiert `frontend-types.ts` via `npm run types:generate`
- Bei separaten Repos: AMP/Boss kopiert generated Types zum Frontend
- Bei Monorepo: Shared folder im Repo
- Langfristig: API Contract als npm Package publishen?

---

## Phase 5: Template-Sync Automation (Langzeit)

### 5.1 AMP als Sync-Orchestrator
- AMP verwaltet welche Apps welches Template nutzen
- Bei Template-Update: AMP triggered Sync für alle verknüpften Apps
- Dashboard: "Welche Apps sind auf welcher Template-Version?"

### 5.2 Breaking Changes Management
- Template-Versioning (semver?)
- Changelog pro Template-Release
- AMP zeigt "Update verfügbar" mit Changelog im Dashboard

### 5.3 Selektive Sync
- Nicht alles oder nichts — einzelne Features opt-in
- z.B. "Entitlements Upgrade v2" als Feature-Branch im Template
- Apps können Features einzeln aktivieren

---

## Architektur-Prinzipien

1. **Manifest als Single Source of Truth** — Was eine App braucht und kann steht im Manifest
2. **Template = Base, Individual = App** — Klare Trennung, `.templatesyncignore` schützt Individual
3. **AMP orchestriert, Boss operiert** — AMP macht Entscheidungen, Boss macht Git/Infra-Ops
4. **Shop als Entitlements Hub** — Alle Subscriptions/Packages laufen über den Shop
5. **Automatisch wenn möglich, manuell wenn nötig** — Konfigurierbar, nicht eingeschränkt

---

## Offene Design-Fragen (für zukünftige Sessions)

- [ ] Soll `supportedMetrics` im Manifest oder in App-Settings leben?
- [ ] Wie handlen wir Template-Versionen? Tag-based? Branch-based?
- [ ] Brauchen wir ein `projectLinks` Konzept im Manifest für Multi-App?
- [x] ~~Soll der Shop neue External Apps nur über AMP registrieren oder auch direkt?~~ → Beides: AMP registriert via B2B API bei Provisioning, manuelle Registration bleibt via Frontend
- [ ] Wie werden Entitlement Limit Configs initial erstellt? Manifest-Vorschläge oder manuell?
