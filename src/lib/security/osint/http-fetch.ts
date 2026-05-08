// Sprint 1.5 (OSINT-Engine, features.md L2 / R1) — HTTP-Fetch-Util mit
// User-Agent-Rotation, Retry/Backoff, Timeout-Management.
//
// PROBLEM (aus Live-Test 2026-05-08): Cloudflare-WAF blockiert Requests mit
// `User-Agent: axios/x.y.z` oder `User-Agent: Mozilla/5.0 (Node.js)` mit 403.
// Dieselbe Site mit echtem Browser-UA antwortet 200. Ohne UA-Rotation produziert
// jeder HTTP-Worker silent-failures auf CF-geschützten Domains (orvello → 403,
// niccaswilliams → 403 in Logs).
//
// Sekundäre Anforderungen:
//   - Retry mit Exponential-Backoff für transient errors (5xx, 429, ECONNRESET,
//     ETIMEDOUT) — 3 Versuche, 250ms / 1s / 4s.
//   - Timeout per Request (default 15s) — verhindert Worker-Hangs.
//   - Pool-Rotation: pro Request ein zufälliger UA aus dem Pool, NICHT pro
//     Worker fix — sonst korrelierbar.
//
// Transport-Layer ist bewusst osint-http.ts (proxy-aware) — wir setzen ein
// Per-Request-Wrapper drüber, der die UA + Retry-Logik beisteuert.

import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { osintHttp } from "./osint-http";

/**
 * UA-Pool — aktuelle (2026) Browser-Strings auf gängigen Plattformen.
 * Der Pool ist NICHT auf Maximum-Stealth ausgelegt (das ist Phase 3 mit
 * residential proxies + browser-fingerprint-spoofing) — sondern auf
 * "WAF-Default-Filter passieren". Drei Strings reichen, mehr ist false-precision.
 */
const UA_POOL: ReadonlyArray<string> = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
];

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NET_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ENETUNREACH"]);

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 250;

export interface HttpFetchOptions extends Omit<AxiosRequestConfig, "headers"> {
    /** Per-Request-Headers — werden mit Default-Headers gemergt (Default verliert). */
    headers?: Record<string, string>;
    /** Override für Timeout (Default 15000). */
    timeoutMs?: number;
    /** Anzahl Retries (Default 3 = max 4 Versuche). 0 = no retry. */
    retries?: number;
    /** Provider-Identifier für osint-http-Gate (Proxy-Anforderung). */
    providerKey?: string;
    /** Erlaubt einem Caller einen festen UA zu setzen (überschreibt Pool-Rotation). */
    userAgent?: string;
    /** Abort-Signal vom Worker-Runner. */
    signal?: AbortSignal;
}

export interface HttpFetchResult<T = unknown> {
    success: boolean;
    /** HTTP-Status oder 0 wenn der Request gar nicht erst zustande kam. */
    status: number;
    headers: Record<string, string>;
    data?: T;
    /** Body als string falls Caller nicht parsen will (data ist axios-parsed JSON wenn JSON-Content-Type). */
    text?: string;
    error?: string;
    /** Welche UA wurde am Ende verwendet (für Logging). */
    userAgentUsed: string;
    /** Anzahl Versuche bis zum finalen Outcome (1 = first try success). */
    attempts: number;
    /** True wenn der Request über den proxy-Gate skipped wurde (siehe osint-http). */
    proxySkipped?: boolean;
}

function pickUserAgent(): string {
    return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

function isAxiosError(err: unknown): err is AxiosError {
    return Boolean(err && typeof err === "object" && (err as AxiosError).isAxiosError);
}

function extractError(err: unknown): { code?: string; status?: number; message: string } {
    if (isAxiosError(err)) {
        return { code: err.code, status: err.response?.status, message: err.message };
    }
    return { message: (err as Error).message };
}

function isRetryable(err: unknown): boolean {
    if (isAxiosError(err)) {
        if (err.response && RETRYABLE_HTTP_STATUSES.has(err.response.status)) return true;
        if (err.code && RETRYABLE_NET_CODES.has(err.code)) return true;
    }
    return false;
}

function flattenHeaders(headers: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!headers || typeof headers !== "object") return out;
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
        if (v == null) continue;
        out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
    }
    return out;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(t);
                reject(new Error("aborted"));
            }, { once: true });
        }
    });
}

/**
 * Führt einen HTTP-Request mit UA-Rotation, Retry-Backoff und Proxy-Gate durch.
 * Wirft NICHT — gibt strukturiertes HttpFetchResult zurück (success=false bei
 * jedem nicht-2xx oder Netz-Fehler).
 */
export async function httpFetch<T = unknown>(
    url: string,
    options: HttpFetchOptions = {},
): Promise<HttpFetchResult<T>> {
    const ua = options.userAgent ?? pickUserAgent();
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);

    const gate = options.providerKey ? osintHttp.gate(options.providerKey) : { skipped: false, client: osintHttp.client() };
    if (gate.skipped) {
        return {
            success: false,
            status: 0,
            headers: {},
            error: gate.reason ?? "proxy_required_unconfigured",
            userAgentUsed: ua,
            attempts: 0,
            proxySkipped: true,
        };
    }

    const baseHeaders: Record<string, string> = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
        ...(options.headers ?? {}),
    };

    let attempt = 0;
    let lastErr: unknown = null;

    while (attempt <= retries) {
        attempt += 1;
        try {
            const res: AxiosResponse<T> = await gate.client.request<T>({
                url,
                method: options.method ?? "GET",
                headers: baseHeaders,
                timeout,
                signal: options.signal,
                validateStatus: () => true,
                ...(options.params !== undefined ? { params: options.params } : {}),
                ...(options.data !== undefined ? { data: options.data } : {}),
                ...(options.maxRedirects !== undefined ? { maxRedirects: options.maxRedirects } : {}),
                ...(options.responseType !== undefined ? { responseType: options.responseType } : {}),
            });

            const headers = flattenHeaders(res.headers);
            const text = typeof res.data === "string" ? res.data : undefined;

            if (res.status >= 200 && res.status < 300) {
                return {
                    success: true,
                    status: res.status,
                    headers,
                    data: res.data,
                    text,
                    userAgentUsed: ua,
                    attempts: attempt,
                };
            }
            // Non-2xx: für retryable-Statuscodes erneut versuchen.
            if (RETRYABLE_HTTP_STATUSES.has(res.status) && attempt <= retries) {
                lastErr = new Error(`http_${res.status}`);
                await sleep(backoffMs(attempt), options.signal);
                continue;
            }
            return {
                success: false,
                status: res.status,
                headers,
                data: res.data,
                text,
                error: `http_${res.status}`,
                userAgentUsed: ua,
                attempts: attempt,
            };
        } catch (err) {
            lastErr = err;
            if (options.signal?.aborted) {
                return {
                    success: false,
                    status: 0,
                    headers: {},
                    error: "aborted",
                    userAgentUsed: ua,
                    attempts: attempt,
                };
            }
            if (isRetryable(err) && attempt <= retries) {
                try { await sleep(backoffMs(attempt), options.signal); } catch { /* aborted */ }
                continue;
            }
            const meta = extractError(err);
            return {
                success: false,
                status: meta.status ?? 0,
                headers: {},
                error: meta.code ? `${meta.code}:${meta.message}` : meta.message,
                userAgentUsed: ua,
                attempts: attempt,
            };
        }
    }

    const meta = extractError(lastErr);
    return {
        success: false,
        status: meta.status ?? 0,
        headers: {},
        error: meta.code ? `${meta.code}:${meta.message}` : meta.message ?? "unknown_failure",
        userAgentUsed: ua,
        attempts: attempt,
    };
}

function backoffMs(attempt: number): number {
    // 1.try → kein Backoff (schon gemacht beim ersten Aufruf), 2.try → 250ms,
    // 3.try → 1s, 4.try → 4s. Geometric mit Jitter.
    const exp = RETRY_BASE_DELAY_MS * Math.pow(4, Math.max(0, attempt - 2));
    const jitter = exp * 0.25 * Math.random();
    return Math.min(exp + jitter, 8_000);
}

export const httpFetchInternals = {
    UA_POOL,
    RETRYABLE_HTTP_STATUSES,
    RETRYABLE_NET_CODES,
    backoffMs,
};
