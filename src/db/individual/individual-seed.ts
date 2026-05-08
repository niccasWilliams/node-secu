import { eq } from "drizzle-orm";
import { database } from "@/db";
import { users } from "@/db/schema";
import {
    engagements,
} from "@/db/individual/individual-schema";
import { engagementService } from "@/lib/security/engagements/engagement.service";
import { entityService } from "@/lib/security/entities/entity.service";
import { relationshipService } from "@/lib/security/entities/relationship.service";

/**
 * Phase-1 Demo-Seed.
 *
 * Legt drei Engagements an:
 *   - "Mein Lab"     (solo_lab)        — Default-Sandbox des Operators, internal_lab-Auth
 *   - "HTB-Demo"     (ctf)             — CTF-Engagement, kein Active-Auth
 *   - "ACME GmbH"    (customer_pentest) — Demo-Customer, written_consent + active_safe
 *
 * Plus einen Demo-Graph mit ~20 Entities und ~15 Relationships, der pro Entity-Kind
 * mindestens 1 Vertreter enthält. Eine Person taucht in zwei Organisationen auf —
 * Beweis dass das globale Identitäts-Modell funktioniert.
 *
 * Der Seed ist idempotent: wenn `Mein Lab` bereits existiert, wird komplett
 * geskippt (verhindert Doppelt-Anlage bei `pnpm run db:seed` auf nicht-leerem DB).
 */
export async function individualSeed() {
    const adminUserId = await resolveAdminUserId();
    if (adminUserId == null) {
        console.warn("⚠️  [secu seed] no admin user found (id=1) — skipping demo seed.");
        return;
    }

    const [existing] = await database
        .select({ id: engagements.id })
        .from(engagements)
        .where(eq(engagements.slug, "mein-lab"))
        .limit(1);
    if (existing) {
        console.log("ℹ️  [secu seed] 'Mein Lab' already seeded — skipping.");
        return;
    }

    // ─── ENTITIES (global) ──────────────────────────────────────────────

    // Asset-Side: Domains, Subdomains, Hosts, IPs, URLs
    const labDomain = await entityService.upsert({
        kind: "asset_domain",
        canonical: { kind: "asset_domain", primaryValue: "lab.local" },
        data: { note: "Operator-Lab — internal_lab scope" },
    });
    const labSubdomain = await entityService.upsert({
        kind: "asset_subdomain",
        displayName: "vuln.lab.local",
        canonical: { kind: "asset_subdomain", primaryValue: "vuln.lab.local" },
    });
    const labHost = await entityService.upsert({
        kind: "asset_host",
        displayName: "vuln-host-01.lab.local",
        canonical: { kind: "asset_host", primaryValue: "vuln-host-01.lab.local" },
    });
    const labIp = await entityService.upsert({
        kind: "asset_ip",
        displayName: "10.0.0.42",
        canonical: { kind: "asset_ip", primaryValue: "10.0.0.42" },
        data: { network: "lab" },
    });
    const labUrl = await entityService.upsert({
        kind: "asset_url",
        displayName: "https://vuln.lab.local/admin",
        canonical: { kind: "asset_url", primaryValue: "https://vuln.lab.local/admin" },
    });

    // CTF-Side
    const htbDomain = await entityService.upsert({
        kind: "asset_domain",
        canonical: { kind: "asset_domain", primaryValue: "htb-demo.local" },
    });
    const htbHost = await entityService.upsert({
        kind: "asset_host",
        displayName: "box01.htb-demo.local",
        canonical: { kind: "asset_host", primaryValue: "box01.htb-demo.local" },
    });
    const htbIp = await entityService.upsert({
        kind: "asset_ip",
        displayName: "10.10.11.42",
        canonical: { kind: "asset_ip", primaryValue: "10.10.11.42" },
    });

    // Customer-Side
    const acmeOrg = await entityService.upsert({
        kind: "organization",
        displayName: "ACME GmbH",
        canonical: { kind: "organization", primaryValue: "ACME GmbH" },
        data: { country: "DE", industry: "logistics" },
    });
    const acmeSubsidiary = await entityService.upsert({
        kind: "organization",
        displayName: "ACME Logistics GmbH",
        canonical: { kind: "organization", primaryValue: "ACME Logistics GmbH" },
    });
    const acmeDomain = await entityService.upsert({
        kind: "asset_domain",
        canonical: { kind: "asset_domain", primaryValue: "acme-demo.example" },
    });
    const acmeMail = await entityService.upsert({
        kind: "asset_subdomain",
        displayName: "mail.acme-demo.example",
        canonical: { kind: "asset_subdomain", primaryValue: "mail.acme-demo.example" },
    });
    const acmePortal = await entityService.upsert({
        kind: "asset_url",
        displayName: "https://portal.acme-demo.example/login",
        canonical: { kind: "asset_url", primaryValue: "https://portal.acme-demo.example/login" },
    });

    // People — eine Person ist Mitarbeiterin zweier Orgs (Pivot zwischen Kunden).
    const personAlice = await entityService.upsert({
        kind: "person",
        displayName: "Alice Schmidt",
        canonical: { kind: "person", primaryValue: "alice@acme-demo.example" },
        data: { role: "IT-Lead", source: "linkedin" },
    });
    const personBob = await entityService.upsert({
        kind: "person",
        displayName: "Bob Müller",
        canonical: { kind: "person", primaryValue: "bob@acme-demo.example" },
        data: { role: "Finance" },
    });
    const personCarol = await entityService.upsert({
        kind: "person",
        displayName: "Carol Weber",
        canonical: { kind: "person", primaryValue: "carol@acme-logistics.example" },
        data: { role: "CISO", note: "auch ehemalige ACME-GmbH-Mitarbeiterin" },
    });

    // Location
    const locBerlin = await entityService.upsert({
        kind: "location",
        displayName: "Berlin, DE",
        canonical: { kind: "location", primaryValue: "Berlin, DE" },
    });

    // Credential-Ref + Document
    const credAlice = await entityService.upsert({
        kind: "credential_ref",
        displayName: "alice@acme — leaked 2023",
        canonical: {
            kind: "credential_ref",
            primaryValue: "alice@acme-demo.example",
            discriminator: "haveibeenpwned-2023",
        },
        data: { source: "haveibeenpwned", year: 2023 },
    });
    const docPolicy = await entityService.upsert({
        kind: "document",
        displayName: "ACME IT-Security-Policy 2025",
        canonical: { kind: "document", primaryValue: "acme-policy-2025", discriminator: "v1" },
        data: { confidentiality: "internal" },
    });

    // ─── RELATIONSHIPS (global) ─────────────────────────────────────────

    await relationshipService.upsert({ fromEntityId: labDomain.id, toEntityId: labSubdomain.id, kind: "parent_of", source: "manual" });
    await relationshipService.upsert({ fromEntityId: labSubdomain.id, toEntityId: labIp.id, kind: "resolves_to", source: "manual" });
    await relationshipService.upsert({ fromEntityId: labSubdomain.id, toEntityId: labHost.id, kind: "hosted_on", source: "manual" });
    await relationshipService.upsert({ fromEntityId: labUrl.id, toEntityId: labSubdomain.id, kind: "hosted_on", source: "manual" });

    await relationshipService.upsert({ fromEntityId: htbDomain.id, toEntityId: htbHost.id, kind: "parent_of", source: "manual" });
    await relationshipService.upsert({ fromEntityId: htbHost.id, toEntityId: htbIp.id, kind: "resolves_to", source: "manual" });

    await relationshipService.upsert({ fromEntityId: acmeOrg.id, toEntityId: acmeSubsidiary.id, kind: "parent_of", source: "osint_handelsregister" });
    await relationshipService.upsert({ fromEntityId: acmeOrg.id, toEntityId: acmeDomain.id, kind: "operates", source: "manual" });
    await relationshipService.upsert({ fromEntityId: acmeDomain.id, toEntityId: acmeMail.id, kind: "parent_of", source: "manual" });
    await relationshipService.upsert({ fromEntityId: acmePortal.id, toEntityId: acmeDomain.id, kind: "hosted_on", source: "manual" });

    await relationshipService.upsert({ fromEntityId: personAlice.id, toEntityId: acmeOrg.id, kind: "employs", source: "osint_linkedin" });
    await relationshipService.upsert({ fromEntityId: personBob.id, toEntityId: acmeOrg.id, kind: "employs", source: "osint_linkedin" });
    // Carol arbeitet aktuell bei der Tochter UND ist ehemalige Mitarbeiterin der Mutter → 2 Org-Edges
    await relationshipService.upsert({ fromEntityId: personCarol.id, toEntityId: acmeSubsidiary.id, kind: "employs", source: "osint_linkedin" });
    await relationshipService.upsert({ fromEntityId: personCarol.id, toEntityId: acmeOrg.id, kind: "works_with", confidence: 60, source: "osint_linkedin", data: { former: true } });

    await relationshipService.upsert({ fromEntityId: acmeOrg.id, toEntityId: locBerlin.id, kind: "located_at", source: "osint_handelsregister" });
    await relationshipService.upsert({ fromEntityId: personAlice.id, toEntityId: credAlice.id, kind: "owns_credential", source: "osint_hibp" });
    await relationshipService.upsert({ fromEntityId: acmeOrg.id, toEntityId: docPolicy.id, kind: "owns", source: "manual" });

    // ─── ENGAGEMENTS ────────────────────────────────────────────────────

    // 1) Mein Lab — solo_lab, alles auto-internal_lab via Convenience
    const lab = await engagementService.create({
        name: "Mein Lab",
        kind: "solo_lab",
        ownerUserId: adminUserId,
        scopeSummary: "Operator-Sandbox: Lab-Domains und HTB-ähnliche Demo-Boxen.",
    });
    for (const e of [labDomain, labSubdomain, labHost, labIp, labUrl]) {
        await engagementService.linkEntity({
            engagementId: lab.id,
            entityId: e.id,
            role: e.id === labDomain.id ? "primary_target" : "in_scope",
            addedBy: adminUserId,
        });
    }
    // internal_lab-Auth auf alle Lab-Assets
    for (const e of [labDomain, labSubdomain, labHost, labIp, labUrl]) {
        await engagementService.grantAuthorization({
            entityId: e.id,
            kind: "internal_lab",
            scope: "active_intrusive",
            proofType: "manual_owner_verification",
            verifiedAt: new Date(),
            grantedBy: adminUserId,
            notes: "Operator-Lab — kein externer Vertrag nötig.",
        });
    }

    // 2) HTB-Demo — ctf, keine Active-Auth, nur passive_only ist sowieso erlaubt
    const ctf = await engagementService.create({
        name: "HTB-Demo Saison 1",
        kind: "ctf",
        ownerUserId: adminUserId,
        scopeSummary: "CTF-Engagement — keine Active-Auth, Operator hält sich an HTB-ToS.",
    });
    for (const e of [htbDomain, htbHost, htbIp]) {
        await engagementService.linkEntity({
            engagementId: ctf.id,
            entityId: e.id,
            role: e.id === htbDomain.id ? "primary_target" : "in_scope",
            addedBy: adminUserId,
        });
    }

    // 3) ACME GmbH — customer_pentest, written_consent → active_safe
    const customer = await engagementService.create({
        name: "ACME GmbH — Q2 2026 Pentest",
        kind: "customer_pentest",
        ownerUserId: adminUserId,
        scopeSummary: "Externer Webportal-Pentest gegen acme-demo.example. active_safe.",
    });
    // Scope: Org als context, Domains als targets, Personen als context (OSINT)
    await engagementService.linkEntity({ engagementId: customer.id, entityId: acmeOrg.id, role: "context", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: acmeSubsidiary.id, role: "out_of_scope", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: acmeDomain.id, role: "primary_target", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: acmeMail.id, role: "in_scope", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: acmePortal.id, role: "primary_target", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: personAlice.id, role: "context", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: personBob.id, role: "context", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: personCarol.id, role: "pivot", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: locBerlin.id, role: "context", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: credAlice.id, role: "context", addedBy: adminUserId });
    await engagementService.linkEntity({ engagementId: customer.id, entityId: docPolicy.id, role: "context", addedBy: adminUserId });

    // written_consent für die zwei In-Scope-Webziele (active_safe — kein active_intrusive ohne weiteren Vertrag)
    for (const e of [acmeDomain, acmeMail, acmePortal]) {
        await engagementService.grantAuthorization({
            entityId: e.id,
            kind: "written_consent",
            scope: "active_safe",
            proofType: "written_contract",
            proofRef: "Pentest-Auftrag ACME-2026-Q2.pdf",
            verifiedAt: new Date(),
            grantedBy: adminUserId,
            notes: "Demo-Auftrag — würde in real-Engagement durch echten Vertrag ersetzt.",
        });
    }

    console.log(
        `✅ [secu seed] engagements=3 entities=${[
            labDomain, labSubdomain, labHost, labIp, labUrl,
            htbDomain, htbHost, htbIp,
            acmeOrg, acmeSubsidiary, acmeDomain, acmeMail, acmePortal,
            personAlice, personBob, personCarol,
            locBerlin, credAlice, docPolicy,
        ].length} relationships=15 (Mein Lab, HTB-Demo, ACME GmbH).`,
    );
}

async function resolveAdminUserId(): Promise<number | null> {
    const [u] = await database.select({ id: users.id }).from(users).where(eq(users.id, 1)).limit(1);
    return u?.id ?? null;
}
