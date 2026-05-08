// Phase 2.7 — OSINT HTTP-Layer.
//
// Zentraler axios-Provider für alle OSINT-Worker. Zwei Aufgaben:
//
//   1. **Proxy-Routing.** Wenn `OSINT_HTTP_PROXY` env gesetzt ist (z.B.
//      "http://user:pass@vpn.example.com:8080"), gehen alle Requests darüber.
//      So kann der Operator OSINT-Traffic über VPN/Residential-Proxy schicken,
//      ohne pro Worker etwas anzupassen.
//
//   2. **Sicherheitsnetz pro Provider.** Provider mit `requiresProxy=true`
//      laufen NUR wenn ein Proxy konfiguriert ist. Holehe + Username-Plattformen
//      sind bewusst gated, damit die Home-IP nicht in deren Logs auftaucht.
//
// Verwendung im Worker:
//
//   const gate = osintHttp.gate(providerKey);
//   if (gate.skipped) return { success: true, findings: [], error: gate.reason, durationMs: ... };
//   const res = await gate.client.get(url, { ... });
//
// Wenn kein Proxy gesetzt ist und der Provider keinen verlangt, fällt `gate.client`
// auf den nackten axios-Default zurück — gleiche Semantik wie bisher.

import axios, { type AxiosInstance } from "axios";
import { providerRequiresProxy } from "./provider-config";

export interface OsintHttpGate {
    /** Wenn true → Worker MUSS skipped zurückgeben mit `reason` als error-String. */
    skipped: boolean;
    reason?: string;
    /** Vorkonfigurierte axios-Instance (mit Proxy wenn gesetzt). Nur lesen wenn skipped=false. */
    client: AxiosInstance;
}

let cachedClient: AxiosInstance | null = null;
let cachedProxyUrl: string | null = null;

function readProxyUrl(): string | null {
    const url = process.env.OSINT_HTTP_PROXY?.trim();
    return url && url.length > 0 ? url : null;
}

function buildClient(proxyUrl: string | null): AxiosInstance {
    if (!proxyUrl) {
        return axios.create({
            timeout: 15_000,
            headers: { "User-Agent": "node-secu-osint/2.7" },
        });
    }
    // axios native proxy-Config — wir parsen die URL selbst, damit Auth
    // und IPv6-Hosts sauber durchkommen.
    let proxyConfig: { host: string; port: number; auth?: { username: string; password: string }; protocol: string };
    try {
        const u = new URL(proxyUrl);
        proxyConfig = {
            protocol: u.protocol.replace(":", ""),
            host: u.hostname,
            port: u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80),
        };
        if (u.username) {
            proxyConfig.auth = {
                username: decodeURIComponent(u.username),
                password: decodeURIComponent(u.password ?? ""),
            };
        }
    } catch (err) {
        console.warn(`[osint-http] OSINT_HTTP_PROXY ist keine gültige URL: ${(err as Error).message}`);
        return axios.create({
            timeout: 15_000,
            headers: { "User-Agent": "node-secu-osint/2.7" },
        });
    }
    return axios.create({
        timeout: 15_000,
        headers: { "User-Agent": "node-secu-osint/2.7" },
        proxy: proxyConfig,
    });
}

function getClient(): AxiosInstance {
    const proxyUrl = readProxyUrl();
    if (proxyUrl !== cachedProxyUrl || !cachedClient) {
        cachedClient = buildClient(proxyUrl);
        cachedProxyUrl = proxyUrl;
    }
    return cachedClient;
}

export const osintHttp = {
    /**
     * Liefert ein Gate für den Worker: prüft Proxy-Anforderung, gibt vorkonfigurierten
     * Client zurück. Worker kann sich auf gate.skipped/reason verlassen — kein eigenes
     * env-Lesen nötig.
     */
    gate(providerKey: string): OsintHttpGate {
        const proxyUrl = readProxyUrl();
        if (providerRequiresProxy(providerKey) && !proxyUrl) {
            return {
                skipped: true,
                reason: `provider_requires_proxy_unconfigured:${providerKey}`,
                client: getClient(),
            };
        }
        return { skipped: false, client: getClient() };
    },

    /** Direktzugriff auf den Default-Client (für Provider ohne requiresProxy). */
    client(): AxiosInstance {
        return getClient();
    },

    /** True wenn ein Proxy aktiv ist — für Audit-Log/Diagnose. */
    isProxied(): boolean {
        return readProxyUrl() !== null;
    },

    /** Test-Helper: Cache resetten zwischen Test-Suiten. */
    _resetForTests(): void {
        cachedClient = null;
        cachedProxyUrl = null;
    },
};
