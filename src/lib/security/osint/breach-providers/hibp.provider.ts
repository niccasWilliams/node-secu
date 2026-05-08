// Phase 2.7 — HIBP-Adapter.
//
// haveibeenpwned.com Breach-API. Auth: bezahlter API-Key (HIBP_API_KEY env).
// Wenn Key fehlt → isConfigured()=false → Worker skipped sauber.
//
// Doku: https://haveibeenpwned.com/API/v3#BreachesForAccount

import { acquireProvider, markProvider429, markProviderSuccess } from "../provider-limiter";
import { osintHttp } from "../osint-http";
import type { BreachHit, BreachProvider } from "../breach-provider.types";

interface HibpBreach {
    Name: string;
    Title?: string;
    BreachDate?: string;
    PwnCount?: number;
    Description?: string;
    DataClasses?: string[];
    IsVerified?: boolean;
    IsSensitive?: boolean;
    IsRetired?: boolean;
    IsFabricated?: boolean;
}

function severityFromDataClasses(dataClasses: string[]): BreachHit["severity"] {
    const lower = dataClasses.map((d) => d.toLowerCase());
    if (lower.some((d) => d.includes("password"))) return "high";
    if (lower.some((d) => d.includes("credit card") || d.includes("bank") || d.includes("ssn") || d.includes("government"))) return "critical";
    if (lower.some((d) => d.includes("phone") || d.includes("address") || d.includes("date of birth"))) return "medium";
    return "low";
}

export class HibpBreachProvider implements BreachProvider {
    readonly key = "hibp";

    isConfigured(): boolean {
        return !!process.env.HIBP_API_KEY?.trim();
    }

    async getBreaches(email: string, opts?: { abortSignal?: AbortSignal }): Promise<BreachHit[]> {
        const apiKey = process.env.HIBP_API_KEY?.trim();
        if (!apiKey) throw new Error("hibp_api_key_missing");

        const release = await acquireProvider("hibp", { abortSignal: opts?.abortSignal });
        try {
            const url = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`;
            const res = await osintHttp.client().get<HibpBreach[]>(url, {
                timeout: 12_000,
                signal: opts?.abortSignal,
                validateStatus: () => true,
                headers: {
                    "hibp-api-key": apiKey,
                    "User-Agent": "node-secu-osint/2.7",
                },
            });
            if (res.status === 404) {
                markProviderSuccess("hibp");
                return [];
            }
            if (res.status === 429) {
                await markProvider429("hibp", "hibp 429 rate-limit");
                throw new Error("provider_paused:hibp");
            }
            if (res.status === 401 || res.status === 403) {
                throw new Error(`hibp_auth_failed:${res.status}`);
            }
            if (res.status !== 200 || !Array.isArray(res.data)) {
                throw new Error(`hibp_unexpected:${res.status}`);
            }
            markProviderSuccess("hibp");
            return res.data
                .filter((b) => !b.IsRetired && !b.IsFabricated)
                .map((b) => {
                    const dataClasses = b.DataClasses ?? [];
                    return {
                        source: "hibp",
                        breachName: b.Name,
                        breachDate: b.BreachDate,
                        dataClasses,
                        severity: severityFromDataClasses(dataClasses),
                        pwnCount: b.PwnCount,
                        description: b.Description,
                        isSensitive: b.IsSensitive,
                    } satisfies BreachHit;
                });
        } finally {
            release();
        }
    }
}

export const hibpBreachProvider = new HibpBreachProvider();
