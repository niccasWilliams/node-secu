# Test-Struktur

Diese Test-Suite ist bewusst in zwei Bereiche getrennt:

- `tests/base/**`
  - Tests fuer den Base-Template-Bereich
  - Bezieht sich auf Kernlogik rund um `src/db/schema.ts`
  - Soll in allen Node-Backends identisch wiederverwendbar sein

- `tests/features/**`
  - Tests fuer app-spezifische Feature-Logik
  - Bezieht sich auf Feature-Datenmodelle rund um `src/db/individual/individual-schema.ts`
  - Darf je Produkt variieren

## Ausfuehrung

- Alle Tests: `pnpm test`
- Nur Base: `pnpm test:base`
- Nur Features: `pnpm test:features`
