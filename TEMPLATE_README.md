# Node Backend Template

Dieses Template bietet eine vorkonfigurierte Node.js Backend-Struktur mit Authentication, Rollen, Permissions, Webhooks und mehr.

## 🚀 Schnellstart für neue App

### 1. Template kopieren
```bash
# Kopiere das gesamte Template in ein neues Verzeichnis
cp -r node-template my-new-app
cd my-new-app
```

### 2. Abhängigkeiten installieren
```bash
pnpm install
```

### 3. **NEU: Interaktives Setup ausführen** ⭐

**Der einfachste Weg, eine neue App zu konfigurieren:**

```bash
pnpm run setup
```

Das Setup-Script konfiguriert automatisch:
- ✅ App-Name (in docker-compose.yml, package.json)
- ✅ Database Port (konsistent über alle Config-Files)
- ✅ Node.js Server Port
- ✅ App-Name wird automatisch in Datenbank übernommen

**Beispiel:**
```
📝 Enter app name: event-planner
🗄️  Enter database port: 5451
🌐 Enter Node.js server port: 8101
```

➡️ **Fertig!** Alle Dateien sind korrekt konfiguriert.

Siehe [`scripts/SETUP_README.md`](./scripts/SETUP_README.md) für Details.

### 4. Manuelle Konfiguration (Optional)

Falls du das Setup-Script nicht nutzt, passe folgende Dateien manuell an:

**Wichtige Dateien zum Anpassen:**

#### `src/app.config.ts`
- Support Email anpassen
- Logo-Pfade aktualisieren
- Sprach-Einstellungen

#### `src/db/userSeeds.ts`
- Admin-User Email ändern
- Weitere Users hinzufügen

#### `src/routes/settings/individual-settings.ts`
- App-Name anpassen
- Weitere App-Settings hinzufügen

#### `src/individual-routes.ts`
- Eigene Routes registrieren
- Wird von `routes.ts` automatisch geladen

### 5. Individual-Dateien anpassen

Die folgenden Dateien sind **app-spezifisch** und werden NICHT vom Template überschrieben:

```
src/
├── individual-routes.ts       # ⚠️ Deine eigenen Routes registrieren

src/db/individual/
├── individual-schema.ts       # Deine eigenen Tabellen
├── individual-seed.ts         # Seeds für deine Tabellen
└── individual-user-seeds.ts   # Weitere User-Seeds

src/routes/
├── settings/individual-settings.ts
├── webhooks/individual-webhooks.ts
└── auth/roles/permissions/individual-permissions.ts
```

### 6. Datenbank migrieren & seeden

```bash
pnpm run db:reset    # Resettet DB, migriert und seedet
```

## 📁 Projekt-Struktur

```
src/
├── app.config.ts              # ⚠️ App-spezifische Konfiguration
├── routes.ts                  # ✅ Base Route-Registrierung
├── individual-routes.ts       # ⚠️ Individual Route-Registrierung
├── db/
│   ├── schema.ts              # ✅ Base Schema (vom Template)
│   ├── userSeeds.ts           # ⚠️ Admin User Seeds (anpassen!)
│   ├── seed.ts                # ✅ Base Seed Runner
│   └── individual/            # ⚠️ Deine eigenen Schemas & Seeds
├── routes/
│   ├── auth/                  # ✅ Base Auth System
│   ├── settings/
│   │   ├── settings.service.ts         # ✅ Base Service
│   │   └── individual-settings.ts      # ⚠️ Deine Settings
│   ├── webhooks/
│   │   ├── webhook.service.ts          # ✅ Base Service
│   │   └── individual-webhooks.ts      # ⚠️ Deine Webhooks
│   └── ...                    # Weitere Base Routes
```

**Legende:**
- ✅ = Wird vom Template gesynct
- ⚠️ = App-spezifisch, NICHT gesynct

## 🔄 Template Updates synchronisieren

Das Template wird **vollständig automatisch** via GitHub Actions synchronisiert (wöchentlich).

**✨ NEU: Komplett automatisiert!**
- GitHub Actions synct das Template
- App-Config wird automatisch wiederhergestellt
- Du musst nur noch den PR prüfen und mergen!

**Vollständige Anleitung:** Siehe [TEMPLATE_SYNC.md](./TEMPLATE_SYNC.md)

### Was wird synchronisiert?

- ✅ Base-Dateien, Scripts, Dependencies
- ✅ App-Config wird automatisch wiederhergestellt
- ❌ Individual-Dateien bleiben unberührt

**Wichtig:** Die `.setup-config.json` muss committed sein für automatischen Sync!

## 🛠️ Wichtige Befehle

```bash
# Setup (NEW!)
pnpm run setup            # ⭐ Interaktives Setup für neue App

# Development
pnpm run dev              # Startet Dev Server

# Database
pnpm run db:generate      # Generiert Migration
pnpm run db:migrate       # Führt Migration aus
pnpm run db:seed          # Seedet Datenbank
pnpm run db:reset         # Reset + Migrate + Seed

# Type Generation
pnpm run types:generate   # Generiert frontend-types.ts

# Production
pnpm run build            # Build für Production
pnpm start                # Startet Production Server

# Docker
docker-compose up -d     # Startet DB Container
```

## 🔐 Auth-Modi (`AUTH_MODE`)

Das Template unterstützt zwei Authentifizierungs-Strategien, die per ENV umgeschaltet werden:

| Modus | Wann verwenden | Anforderungen ans Frontend |
|-------|---------------|----------------------------|
| `williams` *(default)* | NextJS-Frontends, die Auth selbst lösen und Requests via Internal-Network HTTP an dieses Backend weiterreichen | Setzt JWT (signiert mit `FRONTEND_API_KEY`) im `Authorization: Bearer …` Header und Header `user-id: <externalUserId>` |
| `direct` | Serverlose / native Frontends (Expo, Mobile, Web-SPAs ohne eigenes Backend) | Spricht `/auth/*` Endpoints direkt an, hält Access- + Refresh-JWT clientseitig |

```bash
AUTH_MODE=williams   # oder "direct"
```

### ENV pro Modus

```bash
# williams (default)
FRONTEND_API_KEY=...                  # JWT signing key

# direct
AUTH_JWT_ACCESS_SECRET=...        # >= 32 zufällige Bytes
AUTH_JWT_REFRESH_SECRET=...       # >= 32 zufällige Bytes, anderes Secret
PUBLIC_URL=https://api.example.com  # öffentliche Backend-URL — wird in Verification-Mails verlinkt
```

Beim Start wird das Set passend zum Modus erzwungen (`src/util/env-validator.ts`).

### `/auth` Routen (nur `direct`)

Vertrag (für das Expo-Template fixiert):

| Method | Path                | Body                                  | Antwort                                              |
|--------|---------------------|---------------------------------------|------------------------------------------------------|
| POST   | `/auth/register`    | `{ email, password, name? }`          | `{ user, accessToken, refreshToken }`                |
| POST   | `/auth/login`       | `{ email, password }`                 | `{ user, accessToken, refreshToken }`                |
| POST   | `/auth/refresh`     | `{ refreshToken }`                    | `{ accessToken, refreshToken }` (Rotation)           |
| POST   | `/auth/logout`      | `{ refreshToken? }`                   | `204`                                                |
| GET    | `/auth/me`          | Bearer Access-JWT                     | `User`                                               |
| POST   | `/auth/push-token`  | Bearer + `{ token, platform }`        | `204`                                                |
| POST   | `/auth/verify-email/request` | Bearer Access-JWT              | `{ ok: true }` — sendet (neuen) Verification-Link    |
| GET    | `/auth/verify-email?token=…` | —                              | HTML-Landing-Page (vom Backend gerendert), konsumiert Token |
| POST   | `/auth/verify-email/confirm` | `{ token }`                    | `{ ok: true, user }` — programmatische Variante (z.B. Deep-Link) |

- **Password-Hashing:** `argon2id` (`src/auth/password.service.ts`).
- **Access-JWT:** HS256, 15 min, payload `{ sub: userId, type: "access" }`.
- **Refresh-JWT:** HS256, 30 d, payload `{ sub, type: "refresh", jti }`.
- **Refresh-Strategie:** Rotation + DB-Allowlist (`auth_refresh_tokens`, sha256-Hash des `jti`). Bei Reuse eines bereits revoked Tokens werden alle aktiven Refresh-Tokens des Users invalidiert.
- **Email-Verification:** Pflicht im `direct`-Mode. Bei `/auth/register` wird automatisch ein Token (32 Bytes, sha256-Hash in `auth_email_verification_tokens`, TTL 24h, single-use) erzeugt und per Mail (`EmailVerify.tsx`) verschickt. `/auth/login` blockt Konten ohne `emailVerifiedAt` (`403 email_not_verified`). Der Mail-Button verlinkt auf `${PUBLIC_URL}/auth/verify-email?token=…` — das Backend rendert dort selbst eine kleine Landing-Page (Erfolg/abgelaufen/ungültig), kein Frontend-Roundtrip nötig. Für programmatische Flows (Deep-Link in der App) gibt es zusätzlich `POST /auth/verify-email/confirm`.

### Strategy-Abstraktion

`src/auth/auth-strategy.ts` exportiert ein `authStrategy`-Singleton, das je nach `AUTH_MODE` `WilliamsStrategy` oder `DirectStrategy` enthält. Alle Auth-Middlewares (`AccessControl.isFrontendRequest`, `isAuthUser`, `hasPermission`) sowie `getUserIdFromRequest()` delegieren an dieses Singleton — Routen-Code bleibt modus-unabhängig.

### Schema-Auswirkungen

- `users.externalUserId` ist nullable (im `direct`-Mode leer; im `williams`-Mode wie bisher gesetzt).
- Neue Spalten `users.passwordHash`, `users.name` (beide nullable, nur `direct` füllt sie).
- Neue Tabellen `auth_refresh_tokens`, `auth_push_tokens`.

Migration nach dem Pull: `pnpm drizzle-kit generate` (oder `pnpm run db:generate`) und anschließend `pnpm run db:migrate`.

## 🎯 Features

### Bereits implementiert:
- ✅ User Management mit Clerk Integration
- ✅ Rollen & Permissions System
- ✅ Auth-Strategien: `williams` (NextJS Internal-Network) und `direct` (Expo/serverless)
- ✅ Webhook Tracking & Processing
- ✅ App Settings Management
- ✅ Logging System
- ✅ Cron Jobs / Background Jobs
- ✅ User Activity Tracking
- ✅ PostgreSQL mit Drizzle ORM

### Einfach erweiterbar:
- Individual Permissions
- Individual Webhooks
- Individual Settings
- Individual Database Schema
- Individual Routes

## 🔄 Frontend Types synchronisieren

### Automatische Type-Generation

Alle Database Types werden automatisch in `frontend-types.ts` exportiert:

```bash
pnpm run types:generate  # Types manuell generieren
```

### Im Frontend verwenden

```typescript
// In deinem Frontend (z.B. React/Next.js)
import type { User, Role, AppPermissions } from '../backend/frontend-types';

// Types sind jetzt verfügbar
const user: User = {
  id: 1,
  email: "test@example.com",
  // ... TypeScript autocomplete funktioniert!
};

// Permissions verwenden
if (user.permissions.includes(AppPermissions.UsersManage)) {
  // ...
}
```

### Neue Individual Types hinzufügen

1. **Tabelle in `individual-schema.ts` erstellen:**
```typescript
export const articles = pgTable("articles", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
});

export type Article = typeof articles.$inferSelect;
export type ArticleId = typeof articles.$inferSelect['id'];
```

2. **Type-Generator updaten (`scripts/generate-frontend-types.ts`):**
```typescript
// In der INDIVIDUAL SCHEMA TYPES Sektion:
export { type Article, type ArticleId } from './src/db/individual/individual-schema';
```

3. **Types generieren:**
```bash
pnpm run types:generate
```

4. **Im Frontend importieren:**
```typescript
import type { Article } from '../backend/frontend-types';
```

## 📝 Beispiel: Neue Route hinzufügen

```typescript
// 1. Erstelle deine Route (z.B. src/routes/articles/article.route.ts)
import express from "express";
const router = express.Router();

router.get("/", async (req, res) => {
    res.json({ articles: [] });
});

export default router;

// 2. Registriere in individual-routes.ts
import articleRouter from "./routes/articles/article.route";

const registerIndividualRoutes = (app: express.Application) => {
    app.use("/articles", articleRouter);
};
```

## 📝 Beispiel: Neue Permission hinzufügen

```typescript
// src/routes/auth/roles/permissions/individual-permissions.ts
export const individualPermissions = [
    { name: "articles_create", description: "Artikel erstellen" },
    { name: "articles_edit", description: "Artikel bearbeiten" },
];

export enum IndividualAppPermissions {
    ArticlesCreate = "articles_create",
    ArticlesEdit = "articles_edit",
}
```

Dann einfach verwenden:
```typescript
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";

// Base + Individual Permissions verfügbar:
AppPermissions.UsersManage     // Base Permission
AppPermissions.ArticlesCreate  // Individual Permission
```

## 🐛 Troubleshooting

**Migration Fehler:**
```bash
pnpm run db:reset  # Resettet alles
```

**TypeScript Fehler nach Template Update:**
```bash
pnpm install
pnpm run build
```

**Seed Fehler:**
- Prüfe `userSeeds.ts` Admin Email
- Prüfe `individual-settings.ts` Konfiguration

## 📞 Support

Bei Fragen oder Problemen, siehe Projekt README oder kontaktiere den Template-Maintainer.
