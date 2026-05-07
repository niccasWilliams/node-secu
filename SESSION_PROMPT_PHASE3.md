# Session-Prompt: Phase 3 — Generische Usage-Overage-Pipeline + Connection Orchestrator

## Kontext

Phase 1 (Repos aufraeumen) und Phase 2 (Template-Sync + AMP Integration) sind komplett abgeschlossen.
Alle OAuth2 Base-Files sind identisch zwischen Template und node-bill.
node-template ist als Template in AMP registriert (App #19, Boss Service #21).
Die 11-Step Provisioning-Pipeline funktioniert fuer nodejs und nextjs.

## Was als naechstes ansteht

### 3.2 Generische Usage-Overage-Pipeline (Prioritaet 1)

**Problem:**
`subscription-limits.service.ts` und `usage-overage-pull.service.ts` sind hart an node-bill Metriken
(managing_companies, document_storage_gb) gekoppelt. Sie importieren aus `@/db/individual/individual-schema`
und `@/routes/managing-companies/`. Das verhindert Template-Sync dieser Files.

**Ziel:**
Services nutzen generische Metric-Limits aus `plan-limits.config.ts` und delegieren Messung an
app-definierte Measurement-Provider (`src/lib/entitlements/individual/metric-measurement.service.ts`).

**Betroffene Dateien im Template:**
- `src/lib/entitlements/subscription-limits.service.ts` → generische `Record<string, number | null>` statt feste Felder
- `src/lib/entitlements/usage-overage-pull.service.ts` → iteriert ueber Config-Metriken, ruft measureMetrics()
- `src/lib/entitlements/billing-config.service.ts` → liest Pricing dynamisch pro Metrik aus app_settings

**Neue Individual-Datei (pro App):**
```typescript
// src/lib/entitlements/individual/metric-measurement.service.ts
export async function measureMetrics(userId: number): Promise<Record<string, number>> {
    return {
        managing_companies: await countCompanies(userId),
        document_storage_gb: await measureStorage(userId),
    };
}
```

**In node-bill:**
- `document-storage-usage.service.ts` → wird zu individual (nicht synced)
- measureMetrics implementiert die bill-spezifischen Metriken

### 3.3 Shop ↔ App Auto-Registration / Connection Orchestrator (Prioritaet 2)

**Problem:**
Wenn eine neue App provisioniert wird, muessen Services wie node-shop (Entitlements), node-cron
(Scheduled Jobs) und node-bill (Invoicing) ueber die neue App informiert werden.
Aktuell: Manuelles ENV-Setzen. Ziel: Automatisch via AMP.

**Flow:**
```
App provisioniert in AMP
  ├── dep: node-shop (entitlements) → AMP: POST shop/external-apps → client_id/secret zurueck → Railway ENV
  ├── dep: node-cron (scheduled_jobs) → AMP: POST cron/register-app → Cron kennt URL + Secret
  └── dep: node-bill (invoicing) → AMP setzt NODE_BILLS_URL + Credentials auf Railway
```

**Benoetigte Aenderungen:**
| Repo | Was | Status |
|------|-----|--------|
| node-amp | `connectionOrchestrator` Service | TODO |
| node-amp | `gf_app_dependencies` + `connectionConfig` (jsonb) | TODO |
| node-amp | Event-Handler: "app.url_changed" → propagate | TODO |
| node-shop | `POST /external-apps` mit AMP-Auth | TODO |
| node-cron | Endpoint fuer App-Registration | TODO |

## Repos

- **node-template**: `/home/niclas/Dokumente/developement/node-template`
- **node-bill**: `/home/niclas/Dokumente/developement/node-bill`
- **node-amp**: `/home/niclas/Dokumente/developement/node-amp`
- **node-shop**: `/home/niclas/Dokumente/developement/node-shop`

## DB-Referenz (Prod)

- **AMP Prod DB**: Credentials in Boss DB (Port 5453), Service `node-amp`
- **node-template in AMP**: App ID 19, Boss Service ID 21
- **Project-Template "Node.js Backend"**: ID 2, template_app_id=19

## Offene Punkte aus Phase 1

- [ ] node-ruleregistry: Template-Sync ausfuehren (bekommt alle Base-Files automatisch)
- [ ] Phase 1.1: AMP Manifest Kommentar in node-ruleregistry korrigieren
