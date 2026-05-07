# Session-Prompt: OAuth2 Zentralisierung abschliessen

## Kontext

In der letzten Session wurde OAuth2 im node-template zentralisiert mit dem Individual-Config-Pattern.
11 synced Files sind identisch zwischen Template und node-bill. Runtime-Tenant-Support ist eingebaut.
Aber es gibt **2 offene Blocker** die das OAuth2-System noch nicht vollstaendig machen.

## Was bereits erledigt ist

- 10 Base-Files in `src/routes/oauth2/` (Schema, Services, Middleware, Controller, Routes, DTO)
- Individual-Configs in allen 3 Repos (`oauth2-scopes.config.ts`, `oauth2-tenant.config.ts`)
- `getManagingCompanyIdFromRequest` extrahiert nach `src/util/individual/tenant-utils.ts`
- Runtime-Tenant-Support: `OAUTH2_TENANT_CONFIG.enabled` Guards in allen Base-Files
- JWT backward-compat fuer legacy "NodeBill" Issuer
- Base-Tests im Template
- `.templatesyncignore` in allen 3 Repos korrekt

## Blocker 1: Schema-Sync (oauth2-client.schema.ts)

**Problem:**
`oauth2-client.schema.ts` ist der LETZTE File der nicht synced werden kann.
- Template: `managingCompanyId: integer("managing_company_id")` — nullable, kein FK
- node-bill: `managingCompanyId: integer("managing_company_id").notNull().references(() => managingCompanies.id, { onDelete: "cascade" })`
- node-bill's `.templatesyncignore` schuetzt aktuell diesen File

**Warum ist das ein Problem:**
- Es gibt 12 synced Files aber 1 ist ausgenommen — das ist inkonsistent
- Bei Aenderungen am Schema muss man daran denken in BEIDEN Repos zu aendern

**Loesungsoptionen:**
1. **Drizzle-Schema bedingt**: Kann Drizzle `.notNull()` conditional anwenden? Moeglicherweise mit Type-Tricks.
2. **FK per Migration statt Schema**: Template-Schema hat die Column ohne FK, node-bill fuegt FK per SQL-Migration hinzu. Column ist in beiden `.notNull()` aber FK-Constraint nur in node-bill's DB.
3. **Schema immer notNull**: Template-Schema hat `managingCompanyId.notNull()`. Apps ohne Tenants setzen 0 oder -1 als Dummy.
4. **Schema-Generierung**: Ein Build-Script das die Tenant-Config liest und das Schema dynamisch generiert.

**Empfehlung**: Option 2 — Column `notNull()` in beiden, FK nur per Migration in node-bill.

## Blocker 2: Cost-Center-Policy-Validation

**Problem:**
node-bill's alter `oauth2.useCase.ts` hatte Logik die jetzt fehlt:
- `resolveCostCenterPolicy()` — Validiert dass `defaultCostCenter` in `availableCostCenters` enthalten ist fuer Non-Admin
- `validateCostCenterIdsBelongToCompany()` — Prueft dass Cost-Center-IDs zur Managing Company gehoeren
- Admin-Clients bekommen `availableCostCenters: null` (unrestricted)

Diese Logik wurde beim Sync mit dem generischen Template-UseCase entfernt.

**Warum ist das ein Problem:**
- node-bill's Frontend/API kann jetzt ungueltige Cost-Center-Kombinationen erstellen
- Die Tests in `tests/features/oauth2/oauth2.useCase.cost-centers.test.ts` werden zur Laufzeit fehlschlagen

**Loesungsoptionen:**
1. **Generisch im Base-UseCase**: `resolveCostCenterPolicy()` wird bedingt ausgefuehrt wenn `OAUTH2_TENANT_CONFIG.resourceFields` konfiguriert ist. Braucht dynamischen Import fuer `companyCostCenterService`.
2. **Individual-Hook**: `oauth2-tenant.config.ts` exportiert optional eine `validateClientCreation()` Funktion die der UseCase aufruft.
3. **Middleware statt UseCase**: Cost-Center-Validation als Middleware im Controller-Layer statt im UseCase.

**Empfehlung**: Option 1 — generisch im Base-UseCase, mit dynamischem Import fuer den Cost-Center-Service. Folgt dem gleichen Pattern wie der Rest (runtime-bedingt via Tenant-Config).

## Repos

- **node-template**: `/home/niclas/Dokumente/developement/node-template`
- **node-bill**: `/home/niclas/Dokumente/developement/node-bill`
- **node-ruleregistry**: `/home/niclas/Dokumente/developement/node-ruleregistry`

## Referenz-Dateien

**Template (Source of Truth fuer synced Files):**
- `src/routes/oauth2/oauth2.useCase.ts` — Hier muss Cost-Center-Validation rein
- `src/routes/oauth2/oauth2-client.schema.ts` — Hier muss Schema-Sync geloest werden
- `src/routes/oauth2/individual/oauth2-tenant.config.ts` — Tenant-Config Type

**node-bill (Referenz fuer alte Logik):**
- `src/routes/oauth2/oauth2-client.schema.ts` — Hat notNull + FK (in `.templatesyncignore`)
- `tests/features/oauth2/oauth2.useCase.cost-centers.test.ts` — Tests die aktuell runtime-failen
- `src/routes/managing-companies/cost-centers/cost-center.service.ts` — Cost-Center-Service (dynamisch importiert)

## Nach Abschluss

Wenn beide Blocker geloest sind:
1. `oauth2-client.schema.ts` aus node-bill's `.templatesyncignore` entfernen
2. Alle 12 OAuth2 Base-Files sind sync-ready
3. Template-Sync fuer node-ruleregistry ausfuehren (bekommt dann alles automatisch)
4. `NODE_TEMPLATE_PLAN.md` Phase 1.5 als DONE markieren
