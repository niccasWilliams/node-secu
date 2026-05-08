# OSINT Vendored Data

Plattform-Datenbanken die OSINT-Worker zur Laufzeit lesen. Keine Build-Time-Generierung,
kein Subprocess-Aufruf gegen externe CLIs — die Worker konsumieren direkt JSON.

## Files

- `holehe-modules.json` — kuratierte Holehe-Module (Email-Existenz pro Plattform).
  Schema dokumentiert in `src/lib/security/workers/passive/email-holehe-passive.worker.ts`.
- `username-platforms.json` — konsolidierte Plattform-Liste für `username_multiplatform`.
  Tier `verified` aus WhatsMyName, Tier `candidate` aus Sherlock/Maigret.

## Aktualisierung

Wenn die Listen aus den Upstream-Quellen aktualisiert werden sollen:

```bash
# Holehe-Pattern-Liste aus megadose/holehe konvertieren (manuell kuratieren)
# → siehe data/osint/holehe-modules.json header

# WhatsMyName Update
curl -sSL https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json \
  > /tmp/wmn-data.json
node scripts/import-whatsmyname.mjs /tmp/wmn-data.json data/osint/username-platforms.json
```

Beide Files sind versioniert, damit Worker-Tests deterministisch gegen einen
festen Stand laufen können.
