# Session-Prompt: OAuth2 Zentralisierung im node-template

## Kontext

Das node-template ist das zentrale Backend-Template fuer alle Node.js Apps (node-bill, node-ruleregistry, zukuenftige Apps). Wir haben in der letzten Session das Entitlements-System generisch gemacht mit einem Individual-Config-Pattern. Jetzt fehlt OAuth2.

## Problem

Das Template hat Middleware und Entitlements die `@/routes/oauth2/...` importieren — aber **der OAuth2-Ordner existiert nicht im Template**. Er existiert nur in node-bill (~2900 LOC). node-ruleregistry hat gar kein OAuth2.

**Broken Imports im Template:**
```
middleware/oauth2-auth.middleware.ts → @/routes/oauth2/oauth2-token.service
middleware/unified-auth.middleware.ts → @/routes/oauth2/oauth2-token.service + oauth2-scopes
lib/entitlements/entitlement.useCase.ts → @/routes/oauth2/oauth2-client.service
lib/entitlements/entitlement.route.ts → @/routes/oauth2/oauth2-scopes
db/schema.ts → export * from @/routes/oauth2/oauth2-client.schema
```

## Was existiert (node-bill Referenz)

OAuth2 in node-bill besteht aus 8 Dateien:

| Datei | LOC | Generisch? | App-spezifisch? |
|-------|-----|-----------|-----------------|
| `oauth2-scopes.ts` | ~100 | Validation Functions | Scope-Enum (invoices:*, expenses:*, etc.) |
| `oauth2-client.schema.ts` | ~200 | Credentials, Tokens, Audit | `managingCompanyId` FK, `costCenter` Felder |
| `oauth2-client.service.ts` | ~420 | CRUD, Argon2, Pepper | Nichts — komplett generisch |
| `oauth2-token.service.ts` | ~400 | JWT, Refresh Tokens | Cost-Center-Embedding in JWT |
| `oauth2.useCase.ts` | ~750 | Token Grant/Revoke Flows | Company-Access-Check, Cost-Center-Policy |
| `oauth2.controller.ts` | ~470 | HTTP Handler | `getManagingCompanyIdFromRequest()` |
| `oauth2.route.ts` | ~200 | Route Definitions | Nichts |
| `oauth2.dto.ts` | ~100 | Zod Schemas | `defaultCostCenter`, `availableCostCenters` |

Plus Middleware:
- `oauth2-auth.middleware.ts` — Bearer Token Validation + Cost-Center-Access
- `unified-auth.middleware.ts` — Bridges User/OAuth2/ApiKey Auth

## Tenant-Konzept (WICHTIG)

node-bill hat **Managing Companies** als Tenants:
- Jeder OAuth2 Client ist an EINE Managing Company gebunden (`managingCompanyId` FK)
- Cost Centers sind Sub-Ressourcen eines Tenants
- Admin-Clients haben Zugriff auf alle Cost Centers, Non-Admin nur auf eine Whitelist

**Das muss generisch werden**, denn:
- Nicht jede App hat Tenants (frische App: kein Tenant-Konzept)
- Wenn Tenants existieren, heissen sie nicht immer "Managing Company"
- Cost Centers sind node-bill-spezifisch und gehoeren nicht ins Template

## Gewuenschte Architektur

Gleiches Pattern wie bei Entitlements — Individual-Config:

```
src/routes/oauth2/                        ← Base (synced)
├── oauth2-client.schema.ts               → Generisch: Credentials, Tokens, Audit
├── oauth2-client.service.ts              → Generisch: CRUD, Argon2, Pepper
├── oauth2-token.service.ts               → Generisch: JWT, Refresh Tokens
├── oauth2.useCase.ts                     → Generisch: Grant/Revoke Flows
├── oauth2.controller.ts                  → Generisch: HTTP Handler
├── oauth2.route.ts                       → Generisch: Route Definitions
├── oauth2.dto.ts                         → Generisch: Zod Schemas
└── individual/                           ← Individual (nicht synced)
    ├── oauth2-scopes.config.ts           → App-spezifische Scopes
    └── oauth2-tenant.config.ts           → Tenant-Konfiguration (optional)
```

### Tenant-Config Konzept

```typescript
// individual/oauth2-tenant.config.ts
export const OAUTH2_TENANT_CONFIG = {
    enabled: false,           // Frische App: kein Tenant
    // enabled: true,         // node-bill:
    // tenantField: "managingCompanyId",
    // tenantTable: managingCompanies,
    // tenantFk: "managing_companies",
    // resourceFields: [      // Sub-Ressourcen (optional)
    //     { field: "defaultCostCenter", type: "number" },
    //     { field: "availableCostCenters", type: "number[]" },
    // ],
};
```

### Scopes-Config Konzept

```typescript
// individual/oauth2-scopes.config.ts (node-bill Beispiel)
export enum OAuth2Scope {
    INVOICES_READ = "invoices:read",
    INVOICES_WRITE = "invoices:write",
    // ...app-spezifisch
    ENTITLEMENTS_READ = "entitlements:read",  // Shop-Integration (alle Apps)
    ENTITLEMENTS_WRITE = "entitlements:write",
}

export const SCOPE_GROUPS = { ... };
export const SCOPE_DESCRIPTIONS = { ... };
```

## Was gemacht werden muss

### 1. Template: OAuth2 Base erstellen
- Alle 8 Dateien aus node-bill kopieren
- Tenant-spezifische Logik (managingCompanyId, costCenters) herausloesen
- `oauth2-client.schema.ts`: Tenant-FK optional machen (wenn OAUTH2_TENANT_CONFIG.enabled)
- `oauth2-token.service.ts`: Tenant-Kontext nur in JWT wenn Tenant aktiv
- `oauth2.useCase.ts`: Company-Access-Check nur wenn Tenant aktiv
- `oauth2-auth.middleware.ts`: Resource-Access-Checks nur wenn konfiguriert
- `unified-auth.middleware.ts`: Tenant-Kontext optional

### 2. Template: Individual-Configs erstellen
- `individual/oauth2-scopes.config.ts` — leere Scopes (nur entitlements:read/write als Default)
- `individual/oauth2-tenant.config.ts` — `enabled: false`

### 3. node-bill: Auf Individual-Config umstellen
- Scopes in Individual verschieben
- Tenant-Config: `enabled: true, tenantField: "managingCompanyId", ...`
- Cost-Center-Logik in Individual-Service
- Sicherstellen dass bestehende Imports weiter funktionieren

### 4. node-ruleregistry: OAuth2 hinzufuegen
- Individual-Scopes: `rules:read`, `entitlements:read/write`
- Tenant: `enabled: false` (keine Tenants)
- Template-Sync wuerde dann automatisch OAuth2 Base bringen

### 5. .templatesyncignore updaten
- `src/routes/oauth2/individual/*` in allen Apps

## Sicherheits-Details (NICHT vergessen)

- **Pepper-System**: OAUTH2_PEPPER_V{n} mit Fallback auf API_KEY_PEPPER_V{n}
- **Argon2 Config**: memoryCost=65536, timeCost=3, parallelism=4
- **Fingerprint Index**: HMAC-SHA256 fuer O(1) Candidate Lookup vor Argon2.verify()
- **Token Rotation**: Refresh Tokens werden bei jedem Use rotiert
- **Entitlements Auto-Grant**: ENTITLEMENTS_SYNC_OAUTH_ALLOWED_CLIENT_IDS Clients bekommen entitlements:* automatisch
- **Stateless Access Tokens**: JWTs werden NICHT in DB gespeichert (by design)

## Repos

- **node-template**: `/home/niclas/Dokumente/developement/node-template`
- **node-bill**: `/home/niclas/Dokumente/developement/node-bill`
- **node-ruleregistry**: `/home/niclas/Dokumente/developement/node-ruleregistry`
- **node-shop** (Referenz): `/home/niclas/Dokumente/developement/node-shop`

## Referenz-Dateien in node-bill

Alle unter `src/routes/oauth2/`:
- `oauth2-scopes.ts` — Scope-Enum, Validation, Groups
- `oauth2-client.schema.ts` — Drizzle Schema (oauth2_clients, oauth2_refresh_tokens, oauth2_audit_log)
- `oauth2-client.service.ts` — Client CRUD, Argon2, Pepper Rotation
- `oauth2-token.service.ts` — JWT Access + Refresh Tokens
- `oauth2.useCase.ts` — Business Logic (Grant, Refresh, Revoke, Client Management)
- `oauth2.controller.ts` — HTTP Handlers
- `oauth2.route.ts` — Express Routes (createContractRouter)
- `oauth2.dto.ts` — Zod Schemas

Middleware:
- `src/middleware/oauth2-auth.middleware.ts` — Bearer Token Validation
- `src/middleware/unified-auth.middleware.ts` — Multi-Auth Bridge (User/OAuth2/ApiKey)

Schema Re-Export:
- `src/db/schema.ts:343` — `export * from "@/routes/oauth2/oauth2-client.schema"`

## Wichtige Constraints

- Template muss OHNE OAuth2-Tenant funktionieren (frische App)
- Entitlements-Scopes (entitlements:read/write) muessen in JEDER App vorhanden sein (Shop-Integration)
- oauth2-client.schema.ts Tabellen gehoeren ins BASE-Schema (wie shop_limit_configs)
- Cost-Center-Logik ist NUR node-bill — darf nicht im Template sein
- Pepper-Sharing mit API Keys muss erhalten bleiben
- RFC 6749 Compliance bei Token-Endpoints
- `.templatesyncignore` muss `src/routes/oauth2/individual/*` enthalten

## Existierendes Individual-Pattern (Referenz)

Das Entitlements-System nutzt bereits dieses Pattern:
```
src/lib/entitlements/individual/
├── entitlement-metrics.config.ts  → APP_METRICS = []
├── plan-limits.config.ts          → APP_PLAN_PROFILES = []
├── role-hierarchy.config.ts       → ROLE_HIERARCHY = {}
└── metric-measurement.service.ts  → measureMetricsForUser() → {}
```

Base-Services importieren aus `./individual/...`. Frische Apps funktionieren mit leeren Defaults. Das OAuth2-System soll exakt dasselbe Pattern nutzen.

## NODE_TEMPLATE_PLAN.md

Im node-template Repo liegt `NODE_TEMPLATE_PLAN.md` mit dem Langzeit-Plan (5 Phasen). OAuth2 gehoert zu Phase 1 (Repos aufraeumen) da es broken Imports fixt.
