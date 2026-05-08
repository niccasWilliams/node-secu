// Phase 2.7 — Provider-State-Service.
//
// Persistiert Rate-Limit-/429-State pro Provider-Key in `secu_osint_provider_state`.
// Der provider-limiter ruft `markRequest()` vor dem Send und `mark429()` bei 429
// — `pausedUntil` blockiert nachfolgende Worker-Runs sauber, überlebt App-Restarts.

import { eq, sql } from "drizzle-orm";
import { database } from "@/db";
import { secuOsintProviderState, type OsintProviderState } from "@/db/individual/individual-schema";

export const providerStateService = {
    async get(providerKey: string): Promise<OsintProviderState | null> {
        const [row] = await database
            .select()
            .from(secuOsintProviderState)
            .where(eq(secuOsintProviderState.providerKey, providerKey))
            .limit(1);
        return row ?? null;
    },

    /** Idempotent ensure — legt Row an wenn nicht existiert. */
    async ensure(providerKey: string): Promise<OsintProviderState> {
        const existing = await this.get(providerKey);
        if (existing) return existing;
        const [created] = await database
            .insert(secuOsintProviderState)
            .values({ providerKey })
            .onConflictDoNothing({ target: secuOsintProviderState.providerKey })
            .returning();
        if (created) return created;
        // Race: jemand anderes hat es zwischen get und insert angelegt.
        return (await this.get(providerKey))!;
    },

    /** True wenn pausiert und pausedUntil noch in der Zukunft liegt. */
    isPaused(state: OsintProviderState): boolean {
        return !!state.pausedUntil && state.pausedUntil.getTime() > Date.now();
    },

    /** Atomar inkrementieren + lastRequestAt setzen. */
    async markRequest(providerKey: string): Promise<void> {
        await database
            .update(secuOsintProviderState)
            .set({
                requestCount: sql`${secuOsintProviderState.requestCount} + 1`,
                lastRequestAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(secuOsintProviderState.providerKey, providerKey));
    },

    /** 429 erkannt — Backoff setzen. retries=0 → 1*base, retries=1 → 2*base, … (max 60min). */
    async mark429(providerKey: string, baseBackoffSec: number, retries: number, errorMsg?: string): Promise<void> {
        const backoffSec = Math.min(baseBackoffSec * Math.pow(2, retries), 3600);
        const pausedUntil = new Date(Date.now() + backoffSec * 1000);
        await database
            .update(secuOsintProviderState)
            .set({
                last429At: new Date(),
                pausedUntil,
                lastError: errorMsg ?? null,
                updatedAt: new Date(),
            })
            .where(eq(secuOsintProviderState.providerKey, providerKey));
    },

    /** Pause manuell aufheben — für Operator-CLI. */
    async resume(providerKey: string): Promise<void> {
        await database
            .update(secuOsintProviderState)
            .set({ pausedUntil: null, updatedAt: new Date() })
            .where(eq(secuOsintProviderState.providerKey, providerKey));
    },
};
