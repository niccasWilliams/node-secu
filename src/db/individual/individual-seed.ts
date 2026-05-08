import { eq } from "drizzle-orm";
import { database } from "@/db";
import { users } from "@/db/schema";
import {
    engagements,
    rules,
} from "@/db/individual/individual-schema";
import { engagementService } from "@/lib/security/engagements/engagement.service";
import { entityService } from "@/lib/security/entities/entity.service";
import { relationshipService } from "@/lib/security/entities/relationship.service";
import { ruleService } from "@/lib/security/rules/rule.service";
import { seedInfrastructureProviders } from "@/lib/security/osint/infrastructure-providers/provider.seed";

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

    // Sprint 1.7 — Infrastructure-Provider-Registry. Idempotent (upsert pro key),
    // läuft auf jedem db:seed-Run, damit nach-getragene Provider eingespielt werden.
    const infraResult = await seedInfrastructureProviders();
    console.log(
        `✅ [secu seed] infrastructure_providers: ${infraResult.inserted} inserted, ${infraResult.updated} updated (total ${infraResult.total}).`,
    );

    const [existing] = await database
        .select({ id: engagements.id })
        .from(engagements)
        .where(eq(engagements.slug, "mein-lab"))
        .limit(1);
    if (existing) {
        console.log("ℹ️  [secu seed] 'Mein Lab' already seeded — skipping demo block.");
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

    await seedExampleRules(adminUserId);
}

/**
 * Phase-2.5 Beispiel-Regeln. Idempotent: legt nur an, wenn `rules` leer ist.
 *
 * Drei Beispiele aus der Roadmap §2.5:
 *  1. Critical Finding → notify_boss (Telegram über node-boss).
 *  2. Neuer asset_subdomain mit WordPress-Tech → start_playbook web_recon_passive.
 *     Bewusst disabled by default — der Operator schaltet sie scharf, sobald er es will.
 *  3. Person mit Email-Domain im ACME-Scope → tag "internal_employee".
 */
async function seedExampleRules(adminUserId: number): Promise<void> {
    const [hasAny] = await database.select({ id: rules.id }).from(rules).limit(1);
    if (hasAny) {
        console.log("ℹ️  [secu seed] rules already seeded — skipping.");
        return;
    }

    await ruleService.create({
        name: "Critical finding → notify boss",
        description: "Pusht jedes neue Finding mit severity=critical via node-boss-Notifications an den Operator.",
        scope: "global",
        trigger: "finding.created",
        action: "notify_boss",
        condition: { "==": [{ var: "finding.severity" }, "critical"] },
        actionParams: {
            channel: "alerts",
            severityFloor: "critical",
            message: "🚨 [secu] critical finding: {{finding.title}} (engagement {{engagement.id}})",
        },
        enabled: true,
        createdBy: adminUserId,
    });

    await ruleService.create({
        name: "WordPress subdomain → web_recon_passive",
        description:
            "Wenn eine Subdomain mit erkannter WordPress-Tech entsteht, startet der Passive-Recon-Playbook automatisch. " +
            "Default disabled — vor Aktivierung Authorization auf der Wurzel-Entity prüfen.",
        scope: "global",
        trigger: "entity.updated",
        action: "start_playbook",
        condition: {
            and: [
                { "==": [{ var: "entity.kind" }, "asset_subdomain"] },
                { in: ["wordpress", { var: "entity.tech" }] },
            ],
        },
        actionParams: {
            playbookKey: "web_recon_passive",
            rootEntityIdFrom: "entity.id",
        },
        enabled: false,
        createdBy: adminUserId,
    });

    await ruleService.create({
        name: "ACME-Person → tag internal_employee",
        description: "Personen mit ACME-Email werden auto-getagt — als Pivot-Hinweis bei Recon.",
        scope: "engagement_kind:customer_pentest",
        trigger: "entity.created",
        action: "tag_entity",
        condition: {
            and: [
                { "==": [{ var: "entity.kind" }, "person"] },
                { ends_with: [{ var: "entity.canonicalKey" }, "@acme-demo.example"] },
            ],
        },
        actionParams: { tag: "internal_employee", color: "#facc15" },
        enabled: true,
        createdBy: adminUserId,
    });

    // Phase-2.7 — OSINT Auto-Chain: jede neue Email → passive Recon.
    await ruleService.create({
        name: "Email entdeckt → osint_email_passive",
        description:
            "Phase 2.7 — sobald eine email_address-Entity erscheint, startet die passive OSINT-Chain " +
            "(DNS + Gravatar + GitHub + Holehe + Breach + Alias). Discovered social_account/username-" +
            "Entities feuern weitere Chains.",
        scope: "global",
        trigger: "entity.created",
        action: "start_playbook",
        condition: { "==": [{ var: "entity.kind" }, "email_address"] },
        actionParams: {
            playbookKey: "osint_email_passive",
            rootEntityIdFrom: "entity.id",
        },
        enabled: true,
        createdBy: adminUserId,
    });

    // Phase-2.7 — Username → Multi-Platform-Existence-Check
    await ruleService.create({
        name: "Username entdeckt → osint_username_passive",
        description:
            "Phase 2.7 — sobald eine username-Entity erscheint, startet die Multi-Platform-Chain " +
            "(WhatsMyName-Tier verified + optional Sherlock/Maigret-Tier candidate). Validierte Hits " +
            "werden anschliessend auf Reachability + Profil-Metadaten geprüft.",
        scope: "global",
        trigger: "entity.created",
        action: "start_playbook",
        condition: { "==": [{ var: "entity.kind" }, "username"] },
        actionParams: {
            playbookKey: "osint_username_passive",
            rootEntityIdFrom: "entity.id",
        },
        enabled: true,
        createdBy: adminUserId,
    });

    // Phase-2.7 — Domain → Organization-Recon (default disabled — produziert viel Traffic)
    await ruleService.create({
        name: "Domain entdeckt → osint_organization_recon",
        description:
            "Phase 2.7 — bei neuer asset_domain-Entity startet das Organization-Recon-Playbook " +
            "(CT-Mining + GitHub-Personnel + Pattern-Inferenz). DEFAULT DISABLED — Operator " +
            "schaltet bewusst scharf für primary_target-Domains, sonst entstehen viele false-positive-" +
            "Personen aus Wildcard-Subdomain-Certs.",
        scope: "global",
        trigger: "entity.created",
        action: "start_playbook",
        condition: { "==": [{ var: "entity.kind" }, "asset_domain"] },
        actionParams: {
            playbookKey: "osint_organization_recon",
            rootEntityIdFrom: "entity.id",
        },
        enabled: false,
        createdBy: adminUserId,
    });

    // Phase-4 — REST-API entdeckt → API-Security-Pipeline starten
    await ruleService.create({
        name: "Service rest_api → api_security_active",
        description:
            "Phase 4 — sobald service_classify einen Host als rest_api markiert, startet die " +
            "API-Security-Pipeline (OpenAPI-Discovery + Auth-Probe + CORS-Check + Rate-Limit-Probe). " +
            "Voraussetzung: Engagement hat active_safe-Authorization auf dem Host.",
        scope: "global",
        trigger: "entity.updated",
        action: "start_playbook",
        condition: { "==": [{ var: "entity.data.serviceType" }, "rest_api"] },
        actionParams: {
            playbookKey: "api_security_active",
            rootEntityIdFrom: "entity.id",
        },
        enabled: true,
        createdBy: adminUserId,
    });

    // Phase-2.7 — Pwned-Finding → Person/Email taggen
    await ruleService.create({
        name: "Pwned-Finding → tag compromised_credentials",
        description:
            "Phase 2.7 — wenn ein Finding category=leak entsteht, taggen wir die zugehörige " +
            "Email-/Person-Entity automatisch als compromised_credentials. Macht den Status in der " +
            "Identity-View sofort sichtbar.",
        scope: "global",
        trigger: "finding.created",
        action: "tag_entity",
        condition: { "==": [{ var: "finding.category" }, "leak"] },
        actionParams: { tag: "compromised_credentials", color: "#dc2626" },
        enabled: true,
        createdBy: adminUserId,
    });

    // HINWEIS: Cross-Engagement-Hit ist NICHT als DB-Rule implementiert, weil
    // ruleTriggerEnum den event-type entity.cross_engagement_hit nicht enthält
    // (würde Schema-Migration erfordern). Stattdessen registriert
    // bootstrap.ts einen direkten event-bus-Listener der notify_boss aufruft.

    console.log("✅ [secu seed] rules=7 (critical-finding-notify, WP→recon disabled, ACME-tag, email→osint, username→osint, domain→recon disabled, leak→tag).");
}

async function resolveAdminUserId(): Promise<number | null> {
    const [u] = await database.select({ id: users.id }).from(users).where(eq(users.id, 1)).limit(1);
    return u?.id ?? null;
}
