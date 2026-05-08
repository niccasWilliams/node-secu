// Phase 2.7 — canonical-key Tests für die neuen OSINT-Identity-Kinds.

import { buildCanonicalKey } from "@/lib/security/entities/canonical-key";

describe("canonical-key — Phase 2.7 OSINT kinds", () => {
    describe("email_address", () => {
        it("trimmt + lowercased", () => {
            expect(buildCanonicalKey({ kind: "email_address", primaryValue: "  Foo@Example.COM " }))
                .toBe("foo@example.com");
        });

        it("googlemail.com → gmail.com (einzige Provider-Equivalence)", () => {
            expect(buildCanonicalKey({ kind: "email_address", primaryValue: "alice@googlemail.com" }))
                .toBe("alice@gmail.com");
        });

        it("Plus-Adressen bleiben separate Identitäten (konservativ)", () => {
            const a = buildCanonicalKey({ kind: "email_address", primaryValue: "alice+tag@gmail.com" });
            const b = buildCanonicalKey({ kind: "email_address", primaryValue: "alice@gmail.com" });
            expect(a).not.toBe(b);
        });
    });

    describe("username", () => {
        it("plattform-agnostisch lowercased", () => {
            expect(buildCanonicalKey({ kind: "username", primaryValue: "  ALICE_99 " }))
                .toBe("alice_99");
        });
    });

    describe("phone_number", () => {
        it("strippt Whitespace und Trennzeichen", () => {
            expect(buildCanonicalKey({ kind: "phone_number", primaryValue: "+49 (30) 12 345-678" }))
                .toBe("+493012345678");
        });
    });

    describe("social_account", () => {
        it("kombiniert {platform}:{handle} via discriminator", () => {
            expect(buildCanonicalKey({
                kind: "social_account",
                primaryValue: "Niclas",
                discriminator: "GitHub",
            })).toBe("github:niclas");
        });

        it("ohne discriminator → 'unknown:handle'", () => {
            expect(buildCanonicalKey({
                kind: "social_account",
                primaryValue: "alice",
            })).toBe("unknown:alice");
        });
    });
});
