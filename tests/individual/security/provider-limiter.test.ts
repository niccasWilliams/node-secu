// Phase 2.7 — provider-limiter Tests.
//
// Wir testen Concurrency-Cap (Semaphore) + Token-Bucket-Drainage. Den
// persistenten 429-Backoff-Pfad mocken wir, weil er die DB anspricht — das ist
// ein eigenes Integration-Test-Thema.

import { acquireProvider, _resetProviderLimiterForTests } from "@/lib/security/osint/provider-limiter";
import { providerStateService } from "@/lib/security/osint/provider-state.service";

// providerStateService.ensure spricht die DB an — mocken.
jest.mock("@/lib/security/osint/provider-state.service", () => ({
    providerStateService: {
        ensure: jest.fn().mockResolvedValue({ providerKey: "test", pausedUntil: null }),
        isPaused: jest.fn().mockReturnValue(false),
        markRequest: jest.fn().mockResolvedValue(undefined),
        mark429: jest.fn().mockResolvedValue(undefined),
    },
}));

beforeEach(() => {
    _resetProviderLimiterForTests();
    (providerStateService.ensure as jest.Mock).mockResolvedValue({ providerKey: "test", pausedUntil: null });
    (providerStateService.isPaused as jest.Mock).mockReturnValue(false);
});

describe("provider-limiter — Concurrency Cap", () => {
    it("blockt mehr als concurrency-many gleichzeitig (gravatar=8)", async () => {
        const releases: Array<() => void> = [];
        const acquireBatch = async (n: number) => {
            for (let i = 0; i < n; i++) {
                releases.push(await acquireProvider("gravatar"));
            }
        };
        // 8 Parallele sollten sofort durchgehen
        await acquireBatch(8);
        // 9. müsste warten — wir geben ihm 50ms, dann release einen Slot.
        let nineGotIn = false;
        const ninth = acquireProvider("gravatar").then((rel) => {
            nineGotIn = true;
            releases.push(rel);
        });

        // Zwischen-Check: noch nicht durchgekommen
        await new Promise((r) => setTimeout(r, 30));
        expect(nineGotIn).toBe(false);

        // Slot freigeben
        releases.shift()!();
        await ninth;
        expect(nineGotIn).toBe(true);

        // Cleanup
        for (const r of releases) r();
    });
});

describe("provider-limiter — Pause-Awareness", () => {
    it("respektiert isPaused → wartet bis pausedUntil", async () => {
        const futureMs = 80;
        const future = new Date(Date.now() + futureMs);
        (providerStateService.ensure as jest.Mock).mockResolvedValueOnce({ providerKey: "gravatar", pausedUntil: future });
        (providerStateService.isPaused as jest.Mock).mockReturnValueOnce(true);

        const startedAt = Date.now();
        const release = await acquireProvider("gravatar");
        const elapsed = Date.now() - startedAt;
        expect(elapsed).toBeGreaterThanOrEqual(futureMs - 20); // kleine Toleranz nach unten
        release();
    });
});
