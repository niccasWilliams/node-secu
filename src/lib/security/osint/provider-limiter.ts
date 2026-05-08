// Phase 2.7 — Provider-Limiter.
//
// Pro Provider-Key: Semaphore (Concurrency) + Token-Bucket (Rate). Beide
// in-process, kein Redis. Persistente 429-Erkennung läuft separat über
// `provider-state.service` — der Limiter schaut vor jedem Request, ob der
// Provider gerade pausiert ist, und setzt sich passend selbst fort.
//
// Verwendung:
//   import { acquireProvider } from "...provider-limiter";
//   const release = await acquireProvider("gravatar");
//   try {
//     const r = await axios.get(...);
//     return r;
//   } finally {
//     release();
//   }
//
// Wenn der Caller einen 429 sieht, ruft er `markProvider429("gravatar", err.message)`
// — dann blockt der nächste acquire() bis pausedUntil abgelaufen ist.

import { getProviderLimits } from "./provider-config";
import { providerStateService } from "./provider-state.service";

interface SemaphoreState {
    /** Aktuell laufende Requests. */
    active: number;
    /** Wartende Resolver, die ein Slot bekommen wenn frei. */
    waiters: Array<() => void>;
    /** Token-Bucket: aktuelle Tokens (float). */
    tokens: number;
    /** Wann das letzte Refill war (ms timestamp). */
    lastRefill: number;
    /** Backoff-Counter — steigt mit jedem 429, reset bei erfolgreicher Acquire. */
    retries: number;
}

const STATE = new Map<string, SemaphoreState>();

function getState(providerKey: string): SemaphoreState {
    let s = STATE.get(providerKey);
    if (!s) {
        const limits = getProviderLimits(providerKey);
        s = {
            active: 0,
            waiters: [],
            tokens: limits.ratePerMin, // initial vollgefüllter Bucket
            lastRefill: Date.now(),
            retries: 0,
        };
        STATE.set(providerKey, s);
    }
    return s;
}

function refillTokens(providerKey: string, s: SemaphoreState): void {
    const limits = getProviderLimits(providerKey);
    const now = Date.now();
    const elapsedMin = (now - s.lastRefill) / 60_000;
    if (elapsedMin > 0) {
        s.tokens = Math.min(limits.ratePerMin, s.tokens + elapsedMin * limits.ratePerMin);
        s.lastRefill = now;
    }
}

async function waitForTokens(providerKey: string, s: SemaphoreState): Promise<void> {
    refillTokens(providerKey, s);
    if (s.tokens >= 1) {
        s.tokens -= 1;
        return;
    }
    const limits = getProviderLimits(providerKey);
    // Sekunden bis 1 Token verfügbar ist: 60s/ratePerMin
    const waitMs = Math.max(50, Math.ceil(60_000 / limits.ratePerMin));
    await new Promise((r) => setTimeout(r, waitMs));
    return waitForTokens(providerKey, s);
}

/**
 * Belegt einen Slot beim Provider und retourniert eine release()-Funktion.
 * Berücksichtigt: persistierte Pause (mark429), Concurrency-Cap, Token-Bucket.
 *
 * Wirft NICHT — wenn pausiert wird gewartet bis unblockiert (oder bis abortSignal).
 */
export async function acquireProvider(
    providerKey: string,
    opts?: { abortSignal?: AbortSignal },
): Promise<() => void> {
    // 1) Persistente 429-Pause respektieren.
    const state = await providerStateService.ensure(providerKey);
    if (providerStateService.isPaused(state)) {
        const waitMs = state.pausedUntil!.getTime() - Date.now();
        if (waitMs > 0) {
            await sleep(waitMs, opts?.abortSignal);
        }
    }

    // 2) Concurrency-Slot.
    const s = getState(providerKey);
    const limits = getProviderLimits(providerKey);
    if (s.active >= limits.concurrency) {
        await new Promise<void>((resolve) => {
            s.waiters.push(resolve);
        });
    }
    s.active += 1;

    // 3) Rate-Limit-Token.
    await waitForTokens(providerKey, s);

    // 4) Persistenten Counter inkrementieren (fire-and-forget — DB-IO blockt nicht).
    void providerStateService.markRequest(providerKey).catch(() => {/* swallow */});

    let released = false;
    return () => {
        if (released) return;
        released = true;
        s.active = Math.max(0, s.active - 1);
        const next = s.waiters.shift();
        if (next) next();
    };
}

/** Markiert einen 429 — der Provider wird mit exponentiellem Backoff pausiert. */
export async function markProvider429(providerKey: string, errorMsg?: string): Promise<void> {
    const s = getState(providerKey);
    const limits = getProviderLimits(providerKey);
    await providerStateService.mark429(providerKey, limits.backoffBaseSec, s.retries, errorMsg);
    s.retries = Math.min(s.retries + 1, 6); // cap bei 2^6 * base = 64*base, danach kein weiteres Wachstum
}

/** Reset retries-Counter — nach erfolgreichem Request. */
export function markProviderSuccess(providerKey: string): void {
    const s = STATE.get(providerKey);
    if (s) s.retries = 0;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (signal) {
            const onAbort = () => {
                clearTimeout(t);
                reject(new Error("aborted"));
            };
            signal.addEventListener("abort", onAbort, { once: true });
        }
    });
}

/** Reset für Tests. */
export function _resetProviderLimiterForTests(): void {
    STATE.clear();
}
