import { APP_ID, SUPPORT_EMAIL } from "@/app.config";

type Variant = "success" | "expired" | "invalid" | "missing";

interface PageContent {
    badge: string;
    badgeBg: string;
    title: string;
    body: string;
    footer?: string;
}

const VARIANTS: Record<Variant, PageContent> = {
    success: {
        badge: "✓",
        badgeBg: "#10b981",
        title: "E-Mail bestätigt",
        body: "Dein Konto ist jetzt aktiviert. Du kannst dieses Fenster schließen und dich in der App anmelden.",
    },
    expired: {
        badge: "⏱",
        badgeBg: "#f59e0b",
        title: "Link abgelaufen",
        body: "Dieser Bestätigungslink ist nicht mehr gültig. Logge dich in der App ein und fordere einen neuen Link an.",
    },
    invalid: {
        badge: "!",
        badgeBg: "#ef4444",
        title: "Link ungültig",
        body: "Dieser Bestätigungslink konnte nicht verifiziert werden. Möglicherweise wurde er bereits verwendet.",
    },
    missing: {
        badge: "?",
        badgeBg: "#6b7280",
        title: "Kein Token gefunden",
        body: "Der Aufruf enthält keinen Verification-Token. Bitte folge dem Link aus der E-Mail.",
    },
};

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function renderVerifyEmailPage(variant: Variant): string {
    const c = VARIANTS[variant];
    const support = escapeHtml(SUPPORT_EMAIL);
    const appName = escapeHtml(APP_ID);
    return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>${escapeHtml(c.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #fef9ef 0%, #f9fafb 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937;
    padding: 32px 16px;
  }
  .card {
    width: 100%;
    max-width: 440px;
    background: #fff;
    border-radius: 18px;
    padding: 40px 32px;
    box-shadow: 0 20px 50px -20px rgba(15, 23, 42, 0.18), 0 4px 12px -4px rgba(15, 23, 42, 0.08);
    text-align: center;
  }
  .badge {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: ${c.badgeBg};
    color: #fff;
    font-size: 36px;
    font-weight: 600;
    display: grid;
    place-items: center;
    margin: 0 auto 20px;
    box-shadow: 0 8px 20px -8px ${c.badgeBg}80;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 22px;
    font-weight: 600;
  }
  p {
    margin: 0 0 8px;
    color: #4b5563;
    line-height: 1.55;
    font-size: 15px;
  }
  .meta {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid #f3f4f6;
    font-size: 12px;
    color: #9ca3af;
  }
  .meta a { color: #EAAC3F; text-decoration: none; }
  .app { font-weight: 600; color: #1f2937; }
</style>
</head>
<body>
  <main class="card">
    <div class="badge" aria-hidden="true">${escapeHtml(c.badge)}</div>
    <h1>${escapeHtml(c.title)}</h1>
    <p>${escapeHtml(c.body)}</p>
    <div class="meta">
      <span class="app">${appName}</span> · Hilfe? <a href="mailto:${support}">${support}</a>
    </div>
  </main>
</body>
</html>`;
}

export type VerifyEmailVariant = Variant;
