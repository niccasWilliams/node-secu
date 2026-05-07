# Template Sync - Workflow

Dieses Dokument erklärt, wie das Template-Sync-System funktioniert und wie du es nach einem Sync verwendest.

## 🔄 Wie funktioniert der Sync?

Das Template verwendet GitHub Actions, um automatisch Updates vom `node-template` Repository zu synchronisieren.

### Automatischer Sync

- **Wöchentlich:** Jeden Montag um 3 Uhr (cron: `0 3 * * 1`)
- **Manuell:** Via GitHub Actions Workflow Dispatch

### Was wird synchronisiert?

**✅ Wird synchronisiert:**
- Alle Base-Dateien (z.B. `src/routes/auth/*`, `src/db/schema.ts`)
- Scripts in `scripts/` (inklusive neuer Scripts)
- `package.json` (inkl. neuer Dependencies und Scripts)
- GitHub Workflows
- Base Config-Dateien

**❌ Wird NICHT synchronisiert (.templatesyncignore):**
- `package.json` Name (wird nach Sync wiederhergestellt)
- `docker-compose.yml` (App-spezifisch)
- `drizzle.config.ts` (App-spezifischer Port)
- `.env` (App-spezifische Umgebungsvariablen)
- `.setup-config.json` (App-spezifische Setup-Konfiguration)
- Individual-Dateien (`src/db/individual/*`, `src/routes/*/individual-*`)
- `README.md` (App-spezifische Dokumentation)
- Generated Files (`frontend-types.ts`)

## ✅ Quick Checklist

Nach einem Template-Sync:

- [ ] PR prüfen (App-Config sollte bereits automatisch wiederhergestellt sein! ✨)
- [ ] PR mergen
- [ ] **Fertig!** 🎉

Das war's! Die App-spezifische Config wird automatisch durch GitHub Actions wiederhergestellt.

---

## 🤖 Automatische Wiederherstellung

**NEU:** Der Template-Sync läuft jetzt komplett automatisch!

**Was passiert automatisch:**
1. 🔄 GitHub Actions synct das Template
2. 🔧 Post-Sync Fix läuft automatisch
3. ✅ App-Config wird wiederhergestellt
4. 📤 Changes werden zum Sync-Branch committed
5. 📋 PR ist fertig zum Mergen

**Du musst nichts mehr manuell machen!** Einfach den PR prüfen und mergen.

---

## 📋 Nach einem Sync: Was tun?

### 1. Sync Pull Request prüfen

Nachdem der Sync läuft, erstellt GitHub automatisch einen Pull Request:

```
Title: chore(template): sync from node-template
Branch: chore/template-sync-XXXXXXXX
Label: template_sync
```

**Der PR enthält bereits 2 Commits:**
1. Template Sync (vom Template)
2. "chore: restore app-specific config after template sync" (automatisch!)

**Prüfe den PR:**
- Schau dir die Changes an
- Der zweite Commit sollte deine App-Config wiederhergestellt haben
- Achte besonders auf Breaking Changes in:
  - Dependencies (`package.json`)
  - Base Schema (`src/db/schema.ts`)
  - Base Routes (`src/routes/*`)

### 2. Pull Request mergen - FERTIG! ✅

Wenn alles gut aussieht, merge den PR:

```bash
# Via GitHub UI oder CLI
gh pr merge <PR-NUMBER> --squash
```

**Das war's!** 🎉 Keine weiteren Schritte nötig.

### 3. ~~Post-Sync Fix ausführen~~ (NICHT MEHR NÖTIG!)

~~Nach dem Merge **MUSST** du das Post-Sync Script ausführen:~~

**✨ Das passiert jetzt automatisch durch GitHub Actions!**

Falls du es trotzdem manuell ausführen willst:
```bash
git pull origin main
pnpm run post-sync-fix
```

## 🚀 Vollständiger Workflow (Automatisch!)

```bash
# 1. ⏰ GitHub Actions läuft automatisch (wöchentlich oder manuell)
#    - Synct Template
#    - Installiert Dependencies
#    - Führt Post-Sync Fix aus
#    - Committed Changes

# 2. 📋 PR wird automatisch erstellt mit beiden Commits:
#    - Template Sync
#    - Config Restore

# 3. 👀 Du prüfst den PR via GitHub UI

# 4. ✅ Du mergst den PR via GitHub UI

# 5. 🎉 FERTIG! Keine weiteren Schritte nötig!
```

**Optional (nur bei lokaler Entwicklung):**
```bash
git pull origin main
pnpm install  # Falls neue Dependencies
```

## 🔧 Troubleshooting

### Problem: package.json Name wurde überschrieben

**Lösung:**
```bash
pnpm run post-sync-fix
```

Das Script liest den korrekten Namen aus `.setup-config.json` und stellt ihn wieder her.

### Problem: Database Port falsch nach Sync

**Lösung:**
```bash
pnpm run post-sync-fix
```

### Problem: Docker Service Name falsch

**Lösung:**
```bash
pnpm run post-sync-fix
```

### Problem: .setup-config.json fehlt

Falls du die `.setup-config.json` gelöscht hast:

```bash
# Führe Setup erneut aus
pnpm run setup

# Oder erstelle manuell:
echo '{
  "appName": "your-app-name",
  "appNamePascal": "Your App Name",
  "dockerServiceName": "node-your-app-name",
  "dbPort": "5451",
  "nodePort": "8101",
  "databaseUrl": "postgresql://postgres:example@localhost:5451/postgres",
  "setupDate": "2025-10-26T10:00:00.000Z"
}' > .setup-config.json
```

### Problem: Merge Conflicts

Falls es Merge Conflicts gibt (z.B. in Individual-Dateien):

1. **Prüfe welche Datei betroffen ist**
2. **Falls Individual-Datei:** Sollte nicht passieren (ist in `.templatesyncignore`)
3. **Falls Base-Datei:** Manuell mergen oder Template-Version übernehmen

```bash
# Template-Version übernehmen
git checkout --theirs <file>

# Deine Version behalten
git checkout --ours <file>

# Dann weitermachen
git add <file>
git commit
```

## 📝 Neue Scripts nach Sync

Wenn das Template neue Scripts in `package.json` hinzufügt, werden diese automatisch synchronisiert.

**Nach dem Sync:**
```bash
pnpm run post-sync-fix  # Stellt App-Name wieder her
pnpm install            # Installiert neue Dependencies
```

Die neuen Scripts sind dann sofort verfügbar!

## 🎯 Best Practices

### 1. Sync PRs regelmäßig prüfen

Schau dir die wöchentlichen Sync-PRs an, auch wenn du sie nicht sofort mergen willst.

### 2. Vor wichtigen Deployments

Merge keine Sync-PRs direkt vor wichtigen Deployments. Teste die Changes vorher.

### 3. Breaking Changes beachten

Achte auf Breaking Changes in:
- Database Schema (`src/db/schema.ts`)
- Base Routes
- Dependencies

### 4. ~~Post-Sync Fix nicht vergessen~~ (VERALTET)

~~**Immer nach einem Sync:**~~
~~`pnpm run post-sync-fix`~~

**✨ Passiert jetzt automatisch durch GitHub Actions!**

### 5. .setup-config.json committen (WICHTIG!)

Die `.setup-config.json` **MUSS** committed werden, damit der automatische Sync funktioniert:

```bash
# Ist bereits aus .gitignore entfernt
git add .setup-config.json
git commit -m "chore: add setup config for automated template sync"
git push
```

**Ohne diese Datei kann GitHub Actions die App-Config nicht wiederherstellen!**

## 🔒 GitHub Actions Setup

### Erforderliche Secrets

Der Sync benötigt ein GitHub Token:

**Secret Name:** `TEMPLATE_SYNC_TOKEN`

**Berechtigungen:**
- `repo` (Full control of private repositories)
- `workflow` (Update workflows)

**Setup:**
1. GitHub Settings → Developer Settings → Personal Access Tokens
2. Token generieren mit `repo` und `workflow` Scope
3. Token als Secret in deinem Repository hinzufügen

## 📊 Workflow File

Der Sync-Workflow ist definiert in:
```
.github/workflows/template-sync.yml
```

**Wichtige Einstellungen:**
- Source Repo: `niccasWilliams/node-template`
- Upstream Branch: `main`
- PR Title: `chore(template): sync from node-template`
- PR Labels: `template_sync`

## 🎉 Zusammenfassung

**Der Sync-Prozess in Kürze:**

1. ⏰ **Automatischer Sync** (wöchentlich oder manuell)
2. 🤖 **GitHub Actions** führt automatisch aus:
   - Template Sync
   - Post-Sync Fix
   - Config Restore
   - Commit
3. 👀 **PR Review** (prüfe Changes)
4. ✅ **Merge PR** (via GitHub UI)
5. 🎉 **FERTIG!**

**Kein manuelles Eingreifen mehr nötig!** 🚀

Der gesamte Prozess läuft automatisiert - du musst nur noch den PR prüfen und mergen!

---

~~**Alt (vor Automatisierung):**~~
~~4. ⬇️ **Git Pull** (lokale Changes pullen)~~
~~5. 🔧 **Post-Sync Fix** (`pnpm run post-sync-fix`)~~
~~6. 📦 **Install** (`pnpm install`)
7. ✅ **Test** (`pnpm run build`)
8. 📤 **Commit & Push** (restored config)

**Das war's!** 🚀
