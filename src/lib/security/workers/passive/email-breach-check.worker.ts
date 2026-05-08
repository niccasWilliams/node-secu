// Phase 2.7 — email_breach_check Worker.
//
// Input:  email_address-Entity
// Output: Pro Breach 1 Finding (category=leak, severity je nach dataClasses)
//         + entityDataPatch { pwnedSources: [breachNames], lastValidated: ISO }
//
// Provider: BreachProvider-Interface — Phase 2.7 nur HIBP. Wenn KEIN Provider
// konfiguriert ist (= kein HIBP_API_KEY) → success=true mit error=skipped:no_breach_provider_configured.
//
// Bei 429/Provider-Pause: success=true mit error="provider_paused:..." — gleicher
// Pattern wie alle anderen OSINT-Worker.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import { listConfiguredBreachProviders } from "../../osint/breach-providers";
import type { BreachHit } from "../../osint/breach-provider.types";

function findingFromBreach(email: string, b: BreachHit): FindingDraft {
    const dateStr = b.breachDate ? ` (${b.breachDate})` : "";
    const sensitive = b.isSensitive ? " [sensitive]" : "";
    return {
        fingerprintInputs: ["osint_breach", b.source, b.breachName, email],
        severity: b.severity,
        category: "leak",
        title: `Pwned: ${email} in ${b.breachName}${dateStr}${sensitive}`,
        description:
            (b.description ? b.description.slice(0, 600) : `Email ist in Breach "${b.breachName}" enthalten.`) +
            (b.dataClasses.length > 0 ? `\n\nDatenklassen: ${b.dataClasses.join(", ")}.` : "") +
            (b.pwnCount ? `\nGesamt betroffene Accounts: ${b.pwnCount.toLocaleString("de-DE")}.` : ""),
        evidence: {
            source: b.source,
            breachName: b.breachName,
            breachDate: b.breachDate,
            dataClasses: b.dataClasses,
            pwnCount: b.pwnCount,
            isSensitive: b.isSensitive,
        },
        recommendation:
            b.severity === "critical" || b.severity === "high"
                ? "Passwort sofort rotieren, Multi-Faktor-Auth aktivieren wo verfügbar, weitere Accounts mit gleichem Passwort prüfen."
                : "Awareness — Email-Adresse ist öffentlich bekannt durch diesen Breach.",
    };
}

export const emailBreachCheckWorker: SecurityWorker = {
    jobKey: "email_breach_check",
    requiredScope: "passive_only",
    description: "Prüft via konfigurierten Breach-Providern (Phase 2.7: HIBP) ob die Email in bekannten Datenleaks aufgetaucht ist.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "email_address";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const email = ctx.target.value.trim().toLowerCase();
        const providers = listConfiguredBreachProviders();

        if (providers.length === 0) {
            return {
                success: true,
                findings: [],
                error: "skipped:no_breach_provider_configured",
                durationMs: Date.now() - start,
            };
        }

        const allHits: BreachHit[] = [];
        const errors: string[] = [];
        const skippedProviders: string[] = [];

        for (const provider of providers) {
            try {
                const hits = await provider.getBreaches(email, { abortSignal: ctx.abortSignal });
                allHits.push(...hits);
            } catch (err: unknown) {
                const msg = (err as Error).message ?? "unknown";
                if (msg.startsWith("provider_paused:")) {
                    skippedProviders.push(`${provider.key}:${msg}`);
                } else {
                    errors.push(`${provider.key}:${msg}`);
                }
            }
        }

        if (allHits.length === 0) {
            return {
                success: errors.length === 0,
                rawOutput: { providersQueried: providers.map((p) => p.key), skipped: skippedProviders, errors },
                findings: [],
                error: errors.length > 0 ? `breach_check_partial:${errors.join("|")}` : (skippedProviders.length > 0 ? skippedProviders[0] : undefined),
                durationMs: Date.now() - start,
            };
        }

        const findings: FindingDraft[] = allHits.map((h) => findingFromBreach(email, h));
        const breachNames = [...new Set(allHits.map((h) => h.breachName))].sort();
        const maxSeverity = allHits.reduce<BreachHit["severity"]>((acc, h) => {
            const order = ["info", "low", "medium", "high", "critical"];
            return order.indexOf(h.severity) > order.indexOf(acc) ? h.severity : acc;
        }, "info");

        findings.unshift({
            fingerprintInputs: ["osint_breach_summary", email, breachNames.join(",")],
            severity: maxSeverity,
            category: "leak",
            title: `${breachNames.length} Breach-Treffer für ${email}`,
            description: `Email taucht in ${breachNames.length} bekannten Datenleaks auf: ${breachNames.join(", ")}.`,
            evidence: { breaches: breachNames, providers: providers.map((p) => p.key) },
        });

        return {
            success: true,
            rawOutput: { providersQueried: providers.map((p) => p.key), totalHits: allHits.length, breachNames },
            findings,
            entityDataPatch: {
                pwnedSources: breachNames,
                lastValidated: new Date().toISOString(),
            },
            durationMs: Date.now() - start,
        };
    },
};
