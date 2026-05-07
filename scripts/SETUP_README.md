# App Setup Script - Dokumentation

## Übersicht

Das `setup-app.ts` Script hilft dir, schnell eine neue Node.js App aus dem Template zu erstellen, indem es automatisch alle notwendigen Konfigurationen vornimmt.

## Was macht das Script?

Das Script aktualisiert folgende Dateien automatisch:

1. **docker-compose.yml**
   - Service Name: `node-template` → `dein-app-name`
   - Container Name: `node-template-database` → `dein-app-name-database`
   - Database Port: `5441` → `dein-port`

2. **.env**
   - `DATABASE_URL`: Port wird aktualisiert
   - `NODE_PORT`: Wird auf deinen gewünschten Port gesetzt

3. **drizzle.config.ts**
   - Fallback `DATABASE_URL`: Port wird aktualisiert

4. **package.json**
   - `name`: Wird auf deinen App-Namen gesetzt

5. **.setup-config.json** (neu erstellt)
   - Speichert alle Setup-Konfigurationen
   - Wird automatisch von `.gitignore` ignoriert
   - App-Name wird automatisch in `app_settings` Tabelle übernommen

## Verwendung

### 1. Setup starten

```bash
npm run setup
```

### 2. Interaktive Eingaben

Das Script fragt folgende Informationen ab:

#### App Name
```
📝 Enter app name (e.g., "my-api", "shop-backend"):
```

**Beispiele:**
- `chatbot` → Docker Service: "node-chatbot", Display Name: "Chatbot"
- `event-manager` → Docker Service: "node-event-manager", Display Name: "Event Manager"
- `user-service` → Docker Service: "node-user-service", Display Name: "User Service"

**Regeln:**
- Nur Kleinbuchstaben, Zahlen und Bindestriche
- Wird automatisch normalisiert (z.B. "My Shop" → "my-shop")
- Wird als `package.json` Name verwendet
- **Docker Service erhält automatisch `node-` Prefix** (z.B. "chatbot" → "node-chatbot")
- Das Prefix hilft, verschiedene App-Typen zu unterscheiden (node, python, etc.)

#### Database Port
```
🗄️  Enter database port (default: 5441):
```

**Standard:** `5441`

**Beispiele:**
- `5441` - Für zweite App
- `5452` - Für dritte App
- `5433` - Alternativer PostgreSQL Port

**Wichtig:** Muss unterschiedlich sein für jede App auf dem gleichen System!

#### Node.js Server Port
```
🌐 Enter Node.js server port (default: 8102):
```

**Standard:** `8102`

**Beispiele:**
- `8102` - Für zweite App
- `8102` - Für dritte App
- `3000` - Klassischer Express Port

**Wichtig:**
- Muss unterschiedlich sein vom Database Port
- Muss unterschiedlich sein für jede App auf dem gleichen System

### 3. Bestätigung

Das Script zeigt eine Zusammenfassung:

```
═════════════════════════════════════════════════
📋 Summary:
   App Name:      my-shop-api
   Display Name:  My Shop Api
   Database Port: 5441
   Node Port:     8102
═════════════════════════════════════════════════

✅ Apply these settings? (y/n):
```

Gib `y` oder `yes` ein zum Bestätigen.

### 4. Nach dem Setup

Das Script zeigt dir die nächsten Schritte:

```bash
# 1. Starte die Datenbank
docker-compose up -d

# 2. Führe Migrationen aus
npm run db:migrate

# 3. Seede die Datenbank (Optional)
npm run db:seed

# 4. Starte den Dev Server
npm run run:dev
```

## Beispiel-Session

```
🚀 Node Template - App Setup
══════════════════════════════════════════════════
This script will configure your app with:
  • Custom app name
  • Database port
  • Node.js server port
══════════════════════════════════════════════════

📝 Enter app name (e.g., "my-api", "shop-backend"): event-planner
✓ App name: event-planner
✓ Display name: Event Planner
✓ Docker service: node-event-planner

🗄️  Enter database port (default: 5441): 5441
✓ Database port: 5441

🌐 Enter Node.js server port (default: 8102): 8102
✓ Node.js port: 8102

══════════════════════════════════════════════════
📋 Summary:
   App Name:        event-planner
   Display Name:    Event Planner
   Docker Service:  node-event-planner
   Database Port:   5441
   Node Port:       8102
══════════════════════════════════════════════════

✅ Apply these settings? (y/n): y

🔧 Applying settings...

📝 Updating docker-compose.yml...
📝 Updating .env...
📝 Updating drizzle.config.ts...
📝 Updating package.json...
📝 Creating setup configuration...

✅ Setup completed successfully!

══════════════════════════════════════════════════
📋 Next Steps:
══════════════════════════════════════════════════

1. Start the database:
   docker-compose up -d

2. Run database migrations:
   npm run db:migrate

3. Seed the database (optional):
   npm run db:seed

4. The app name "Event Planner" will be automatically
   added to app_settings during the first seed.

5. Start the development server:
   npm run run:dev

══════════════════════════════════════════════════
🌐 Your app will be available at: http://localhost:8102
🗄️  Database runs on port: 5441
══════════════════════════════════════════════════
```

## Automatische App-Name Integration

Nach dem Setup wird der App-Name automatisch in die Datenbank übernommen:

1. Die `.setup-config.json` wird erstellt mit:
   ```json
   {
     "appName": "event-planner",
     "appNamePascal": "Event Planner",
     "dockerServiceName": "node-event-planner",
     "dbPort": "5441",
     "nodePort": "8102",
     "databaseUrl": "postgresql://postgres:example@localhost:5441/postgres",
     "setupDate": "2025-10-25T12:00:00.000Z"
   }
   ```

2. Beim ersten `npm run db:seed` wird automatisch:
   - Der App-Name aus `.setup-config.json` gelesen
   - In die `app_settings` Tabelle als `application_name` geschrieben
   - Für E-Mails, PDFs und andere Outputs verwendet

## Mehrere Apps parallel betreiben

Du kannst mehrere Apps vom Template gleichzeitig betreiben:

### App 1: Event Planner
```
DB Port:   5441
Node Port: 8102
```

### App 2: Shop Backend
```
DB Port:   5441
Node Port: 8102
```

### App 3: User Service
```
DB Port:   5452
Node Port: 8102
```

**Wichtig:** Jede App braucht eindeutige Ports!

## Troubleshooting

### Port bereits in Verwendung

**Fehler:** "Address already in use"

**Lösung:**
```bash
# Prüfe welche Ports belegt sind
lsof -i :5441
lsof -i :8102

# Wähle andere Ports beim Setup
```

### Setup nochmal ausführen

Das Script kann beliebig oft ausgeführt werden und überschreibt die bestehenden Werte:

```bash
npm run setup
```

### .setup-config.json wurde gelöscht

Kein Problem! Das Seed-Script verwendet dann den Fallback `"My App"`. Einfach manuell in der Datenbank ändern oder Setup erneut ausführen.

## Files die geändert werden

```
.
├── docker-compose.yml      ← Service und Container Namen, DB Port
├── .env                     ← Database URL Port, Node Port
├── drizzle.config.ts        ← Fallback Database URL Port
├── package.json             ← App Name
└── .setup-config.json       ← (NEU) Setup Konfiguration
```

## Datei-Übersicht nach Setup

### docker-compose.yml
```yaml
services:
  node-event-planner:                # ← Geändert (mit node- Prefix!)
    container_name: node-event-planner-database  # ← Geändert
    ports:
      - 5441:5432                    # ← Geändert
```

### .env
```env
DATABASE_URL=postgresql://postgres:example@localhost:5441/postgres  # ← Port geändert
NODE_PORT="8102"                     # ← Geändert
```

### drizzle.config.ts
```typescript
export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:example@localhost:5441/postgres"  // ← Port geändert
  }
});
```

### package.json
```json
{
  "name": "event-planner"           // ← Geändert
}
```

## Best Practices

1. **Führe Setup direkt nach dem Clonen aus**
   ```bash
   git clone <template-repo> my-new-app
   cd my-new-app
   npm install
   npm run setup
   ```

2. **Wähle eindeutige Ports**
   - Dokumentiere deine verwendeten Ports
   - Nutze einen Port-Manager oder Liste

3. **Committe .setup-config.json NICHT**
   - Ist bereits in `.gitignore`
   - Enthält lokale Konfiguration

4. **Für Production Deployment**
   - Passe `.env` manuell an
   - Nutze Environment Variables im CI/CD
   - `.setup-config.json` ist nur für lokale Entwicklung
