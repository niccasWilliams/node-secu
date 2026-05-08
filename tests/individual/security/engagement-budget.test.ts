// Phase 2.7 — engagement-budget-Service Smoke-Tests.
//
// Pflichtumfang: Sliding-Window-Logik + isOsintWorker-Filter. Boss-Notify
// und DB-Lookup sind gemockt — Logik ist deterministisch.

import { engagementBudgetService, isOsintWorker } from "@/lib/security/osint/engagement-budget.service";

// Mock der DB-Lookups: budget=10/h für Engagement 42, default 1000 sonst.
jest.mock("@/db", () => ({
    database: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => Promise.resolve([{ budget: 10 }]),
                }),
            }),
        }),
    },
}));

beforeEach(() => {
    engagementBudgetService.reset(42);
    engagementBudgetService.reset(99);
});

describe("engagement-budget — sliding window", () => {
    it("erlaubt requests bis Budget erreicht ist", async () => {
        for (let i = 0; i < 10; i++) {
            const r = await engagementBudgetService.check(42);
            expect(r.allowed).toBe(true);
            expect(r.budget).toBe(10);
            expect(r.remaining).toBe(10 - i);
            engagementBudgetService.increment(42);
        }
    });

    it("verweigert nach budget exceeded", async () => {
        for (let i = 0; i < 10; i++) {
            await engagementBudgetService.check(42);
            engagementBudgetService.increment(42);
        }
        const r = await engagementBudgetService.check(42);
        expect(r.allowed).toBe(false);
        expect(r.reason).toBe("engagement_osint_budget_exceeded");
        expect(r.remaining).toBe(0);
    });

    it("snapshot liefert aktuellen Stand", async () => {
        await engagementBudgetService.check(42);
        engagementBudgetService.increment(42, 5);
        const snap = engagementBudgetService.snapshot(42);
        expect(snap.count).toBe(5);
        expect(snap.budget).toBe(10);
        expect(snap.windowStart).toBeInstanceOf(Date);
    });
});

describe("isOsintWorker — Worker-Key-Filter", () => {
    it("matched OSINT-Prefixes", () => {
        expect(isOsintWorker("email_holehe_passive")).toBe(true);
        expect(isOsintWorker("email_breach_check")).toBe(true);
        expect(isOsintWorker("username_multiplatform")).toBe(true);
        expect(isOsintWorker("phone_normalize")).toBe(true);
        expect(isOsintWorker("social_account_validate")).toBe(true);
        expect(isOsintWorker("domain_ct_email_mining")).toBe(true);
        expect(isOsintWorker("domain_github_personnel")).toBe(true);
        expect(isOsintWorker("github_secret_scan")).toBe(true);
    });

    it("matched non-OSINT nicht", () => {
        expect(isOsintWorker("dns_records")).toBe(false);
        expect(isOsintWorker("tls_cert")).toBe(false);
        expect(isOsintWorker("nuclei_safe")).toBe(false);
        expect(isOsintWorker("nmap_top1000")).toBe(false);
        expect(isOsintWorker("subdomain_passive")).toBe(false);
    });
});
