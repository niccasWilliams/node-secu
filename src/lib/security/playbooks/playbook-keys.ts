// Single-Source-of-Truth für alle Playbook-Keys, die das System kennt.
//
// Warum eine eigene Datei:
//   - Die Registry (`playbook-registry.ts`) ist runtime-gefüllt — beim
//     OpenAPI-Codegen ist sie leer und kann nicht als Enum-Quelle dienen.
//   - Die einzelnen Definition-Files registrieren sich runtime via bootstrap.
//   - Das DTO (`playbook.dto.ts`) braucht zur Codegen-Zeit ein Zod-Enum,
//     damit das Frontend einen typed Union-String bekommt.
//
// Deshalb: Liste hier hardcoden + assertion in bootstrap.ts, dass jeder
// Key auch wirklich registriert ist (Drift-Schutz).

import { z } from "zod";

export const PLAYBOOK_KEYS = [
    "web_recon_passive",
    "web_recon_active",
    "osint_email_passive",
    "osint_username_passive",
    "osint_organization_recon",
    "osint_pivot_light",
    "osint_github_account_recon",
    "api_security_active",
] as const;

export type PlaybookKey = (typeof PLAYBOOK_KEYS)[number];

export const playbookKeySchema = z.enum(PLAYBOOK_KEYS);
