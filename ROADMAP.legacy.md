# node-secu — Roadmap

> Lebendiges Dokument. Phasen sind sequenziell sortiert; Reihenfolge ist nicht beliebig (siehe Abhängigkeitshinweise).
> Stand: 2026-05-07 — initiale Roadmap nach Skeleton-Aufbau.

---

## Strategischer Kontext

**Geschäftsziel:** Aus der Software-Agentur (niccaswilliams.com / Foundry) eine *Security-fokussierte* Agentur machen, die in 2026 verteidigungsfähig gegen das "20€-Claude-Code-Abo"-Problem ist. Webseiten-Bau ist Commodity. Sicherheit ist es nicht.

**Drei Säulen, die node-secu liefern muss:**

1. **Lead-Magnet** — Free-Public-Scan auf niccaswilliams.com, der echten Wert liefert (passive Findings) und Conversion zu Pentest-Aufträgen treibt.
2. **Internal Hardening** — kontinuierliches Self-Audit aller Sister-Services (shop/bill/amp/boss/williams). Macht den Stack defensible.
3. **Verkaufbares Pentest-Service** — als monatliches Abo (PTaaS) oder als Engagement-Modell. Use-Case: bestehende Foundry-Kunden + Neukunden über Lead-Funnel.

**Erfolgs-Metrik nach Phase 5:**
- Phase 1-2 deployable, läuft passive auf own infra: ~6 Wochen
- Erster zahlender externer Pentest-Kunde: bis Q3 2026
- 50+ Public-Free-Scans/Monat durch SEO-Lead-Magnet: bis Q4 2026

---

## Phase 0 — Skeleton ✅ (erledigt)

**Erreicht:**
- [x] Repo aus `node-template` als GitHub-Template instanziiert
- [x] Customize: Ports (8108/5454), package.json, app-config, .env, .setup-config.json
- [x] DB-Schema vollständig: 11 Tabellen + Enums (assets, authorizations, scans, jobs, findings, tech_fingerprints, cve_records, cve_matches, scan_policies, public_leads, audit_log)
- [x] Worker-Contract (`SecurityWorker`-Interface) + Registry
- [x] 3 funktionierende passive Worker: dns_records, tls_cert, http_headers
- [x] Findings-Service mit Fingerprint-Dedup
- [x] Authorization-Gate (`canScan()`)
- [x] Domain-Ownership-Verifier (DNS-TXT-Token)
- [x] Scan-Orchestrator (sequenzieller Run, Tech-Fingerprint-Persist)
- [x] Public-Free-Scan-Endpoint (POST /public/scan) E2E
- [x] Audit-Log-Service
- [x] CLAUDE.md mit Authorization-Kontext

---

## Phase 1 — "Walking Skeleton" deploybar (Woche 1-2)

**Ziel:** node-secu läuft lokal stabil, passive Scans funktionieren E2E gegen echte Domains, schema-ready durchgelaufen, kein TS-Build-Error, basic Tests grün.

**Tasks:**
- [ ] **DB-Migration generieren & applien** via `./schema-ready.sh` — alle `secu_*`-Tabellen materialisieren.
- [ ] **TS-Build cleanen** — `pnpm run build` muss grün durchlaufen, alle import-Pfade konsistent.
- [ ] **Smoke-Test der 3 Worker** — gegen eigene Domains scannen (niccaswilliams.com, das Boss-Domain). Findings-Output validieren.
- [ ] **Public-Scan E2E-Test** — `curl -X POST localhost:8108/public/scan -d '{"domain":"niccaswilliams.com","consent":true}'` muss real Findings zurückgeben.
- [ ] **Rate-Limit testen** — 6. Request derselben IP innerhalb 1h muss 429 + Retry-After liefern.
- [ ] **PM2-Eintrag** — node-secu in PM2 ecosystem hinzufügen, parallel zu boss laufen lassen.
- [ ] **schema-ready.sh** — anpassen falls Sister-Services Convention abweicht.
- [ ] **Frontend-Types-Generator** erweitern um secu_*-Types (für niccaswilliams Next-Frontend).

**Deliverables:**
- node-secu läuft 24/7 auf Linux, Port 8108
- Public-Scan-Endpoint produktiv, gegen niccaswilliams.com getestet
- Logs in `secu_audit_log` für jeden Scan-Trigger

---

## Phase 1.5 — Tenant-Auth & Asset-CRUD (Woche 2-3)

**Ziel:** Eingeloggte User können eigene Assets registrieren, Domain-Ownership verifizieren, eigene Scans triggern.

**Tasks:**
- [ ] **Auth-Middleware aktivieren** für `/assets`, `/scans`, `/findings` (template hat bereits OAuth2 + JWT).
- [ ] `assetController.create/list/update/archive` — CRUD-Endpoints implementieren.
- [ ] `assetController.requestVerification` — Token generieren, in `assetAuthorizations.proofValue` ablegen, an User zurückgeben (UI zeigt: "leg diesen TXT-Record an").
- [ ] `assetController.runVerification` — `domainOwnershipService.runVerification()` triggern.
- [ ] `scanController.start` — User triggert Scan-Type (passive_full, active_safe). Orchestrator + Authorization-Gate kicken.
- [ ] `scanController.getStatus` — Live-Polling für laufende Scans.
- [ ] `findingController.list/getDetail/updateStatus` — User markiert Findings als acknowledged/wont_fix/false_positive.
- [ ] **Frontend-Stub auf niccaswilliams.com** — Dashboard-Page "Meine Assets" für eingeloggte User. Reuse Foundry-CMS-UI-Patterns.

**Deliverables:**
- Eingeloggter User kann eine Domain registrieren, verifizieren, vollen passiven Scan triggern, Findings im Dashboard durchgehen.
- Authorization-Workflow End-to-End klickbar.

---

## Phase 2 — Active Workers in Docker (Woche 3-5)

**Ziel:** `active_safe`-Scans laufen — nuclei + nmap + sslyze als Docker-isolierte Worker. Niemals direkt auf Host-Network.

**Architekturentscheidungen (in `docs/decisions/` festhalten):**
- Container-Runtime: Docker (Compose-Profil, nicht Daemon-Service).
- Network-Isolation: dediziertes Netz `secu-isolated`. Worker-Container haben keinen Zugang auf 192.168.0.0/16, 10.0.0.0/8, etc. — nur auf das Target.
- Output-Capture: stdout/stderr → JSON-Parser → normalisierte FindingDrafts.
- Tool-Versions in `worker.versionFor()` deklarativ — Reproducibility.
- Cleanup: Container nach Job-Ende gestoppt + entfernt (`--rm`).

**Tasks:**
- [ ] **Docker-Workers Setup** — `docker/workers/` mit Subdirs pro Tool. Compose-Profil "secu-workers".
- [ ] **Network-Isolation-Test** — von Worker aus ist 10.0.0.1 unerreichbar.
- [ ] **`nuclei_safe.worker.ts`** — wrapped `projectdiscovery/nuclei:v3` mit `-severity high,critical -etags intrusive,dos`. Output-Format `-jsonl`. Parsing: jedes JSONL-Result → 1 FindingDraft.
- [ ] **`nmap_top1000.worker.ts`** — wrapped `instrumentisto/nmap` mit `-Pn -sT --top-ports 1000 -T3 --max-rate 100`. Findings: open ports, service banners.
- [ ] **`sslyze_deep.worker.ts`** — wrapped `nablac0d3/sslyze` mit `--json_out`. Findings: schwache Cipher, fehlende OCSP-Stapling, etc.
- [ ] **`subdomain_passive.worker.ts`** — `projectdiscovery/subfinder` (passive only, OSINT-basiert, kein DNS-Bruteforce). Discovered Subdomains → Asset-Vorschläge im Dashboard.
- [ ] **Worker-Resource-Limits** — CPU 0.5 cores, RAM 512Mi, time-out 15min hard.
- [ ] **Concurrent-Limit** — `SCAN_MAX_CONCURRENT_GLOBAL` umsetzen (semaphore in scan-orchestrator).
- [ ] **Active-Scan E2E-Test** gegen eigene Staging-Instanz.

**Deliverables:**
- `active_safe`-Scan auf eigener Domain liefert reale nuclei/nmap-Findings.
- Worker-Container haben isoliertes Netz, kein Lateral-Movement-Risk.
- Erste echte CVE-IDs in findings.cveIds (manuelle Anreicherung; automatisch ab Phase 4).

---

## Phase 3 — Reports + Triage (Woche 5-7)

**Ziel:** Findings werden zu kunden-lesbaren Reports verarbeitet. AI-Triage filtert False-Positives.

**Tasks:**
- [ ] **`report.service.ts.buildMarkdownReport()`** — Findings nach Severity gruppiert, plain-deutsch erklärt (kein "CVSS 9.8" — sondern "kritisch, weil…").
- [ ] **`report.service.ts.buildPdfReport()`** — React-PDF-Renderer (gleiche Library wie node-bill). Branding aus Foundry. S3-Upload + presigned URL.
- [ ] **Report-Templates** — Executive Summary, Findings nach Severity, Empfehlungen, Anhang (raw output).
- [ ] **Triage-Service** — fire-and-forget AI-Call pro Finding (siehe boss claude-code.service.ts Pattern). Setzt `triageConfidence` + `triageReasoning`. Auto-markiert offensichtliche FPs als `false_positive`.
- [ ] **Email-Versand** — Reports per DoubleZero-API verschicken (template hat bereits Setup).
- [ ] **Telegram-Alert** — kritische Findings via Boss-Integration → Operator-Chat.
- [ ] **Diff-Reports** — bei Re-Scan: was ist NEU, was wurde GELÖST, was ist UNVERÄNDERT.

**Deliverables:**
- Erster automatisch generierter Pentest-Report als PDF, an Test-Kunden versendbar.
- Telegram-Notification bei kritischen Findings auf eigener Infra.
- AI-Triage senkt FP-Rate um >50% gegenüber raw-output.

---

## Phase 4 — CVE-Datenbank + Matching (Woche 7-10)

**Ziel:** node-secu kennt aktuelle CVEs und matched sie automatisch gegen Tech-Fingerprints aller registrierten Assets.

**CVE-Quellen:**
- **NVD** (National Vulnerability Database, US-Government) — primär. API: `services.nvd.nist.gov/rest/json/cves/2.0`. Kostenlos, mit API-Key 50req/30s.
- **CISA KEV** (Known Exploited Vulnerabilities) — Threat-Intel-Anreicherung. Welche CVEs werden tatsächlich ausgenutzt.
- **GitHub Advisory Database** — npm/pypi/etc. ecosystem-spezifische Advisories.
- **CVE.org** (MITRE) — manchmal früher als NVD.

**Tasks:**
- [ ] **`cveFeedService.syncFullBootstrap()`** — initialer Seed: alle CVEs ab 2010 ziehen, in `secu_cve_records` ablegen. Mit NVD-API-Key, paginiert.
- [ ] **`cveFeedService.syncIncremental()`** — täglich (cron) `lastModStartDate`-Filter. Nur Änderungen.
- [ ] **CISA-KEV-Sync** — täglich JSON-Pull von `cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`. Setzt `exploitedInWild=true`.
- [ ] **`cveMatcherService.matchAsset(assetId)`** — alle `tech_fingerprints` des Assets gegen `cve_records.affectedProducts` (CPE-Match).
  - Exact CPE → confidence=high, automatisch finding (severity=cve.severity).
  - Version-Range → confidence=medium, finding nur wenn severity ≥ high.
  - Vendor-only → confidence=low, kein finding (Noise).
- [ ] **`cveMatcherService.matchAll()`** — daily cron: alle aktiven Assets → matching.
- [ ] **CVE-Watcher-Policy** — bei neuer CVE: alle bestehenden Assets re-matchen, Treffer als Finding anlegen.
- [ ] **Telegram-Alert** für Critical-CVE-Match auf own infra.
- [ ] **CVE-Dashboard-Endpoint** — `/cve/stats`, `/cve/recent` für Foundry-UI.

**Deliverables:**
- ~250k CVEs in lokaler DB, täglich aktuell.
- Bei neuer Critical-CVE: <24h später hat node-secu Match-Befund auf allen betroffenen Assets im Stack.
- Customer-Dashboard zeigt "Du bist betroffen von CVE-2026-XXXXX".

---

## Phase 5 — Active Intrusive + Workflow-Queue (Woche 10-13)

**Ziel:** echte Pentest-Engagements möglich. ffuf, sqlmap, hydra, wpscan-aggressive. Long-running Jobs in Workflow-Queue (boss-style).

**Tasks:**
- [ ] **Workflow-Queue** — entweder boss `workflow-queue` reused (via API) oder lokale BullMQ-Instance. Long-running Scans (>5min) laufen async.
- [ ] **`ffuf_dirs.worker.ts`** — Content-Discovery. Wordlist konfigurierbar pro Auftrag.
- [ ] **`sqlmap.worker.ts`** — pro Endpoint, opt-in via Auftrag. Aggressiv-Level 1-3 (default 1).
- [ ] **`hydra_login.worker.ts`** — gegen authorized Login-Endpoints. Wordlist eingeschränkt (top-1000 schlechte Passwörter, kein Massive-Wordlist-Brute-Force).
- [ ] **`wpscan_aggressive.worker.ts`** — WordPress-Plugins/Themes/Users. WP-API-Token konfigurierbar.
- [ ] **Authorization-UI** — Pentest-Auftrag-Workflow: User lädt PDF (Scope, Datum, Verantwortlicher) hoch → Admin-Review → `written_consent`-Authorization.
- [ ] **Scan-Cancel** — Long-running Jobs müssen abbrechbar sein (AbortSignal Propagation).
- [ ] **Resource-Throttling** — Hydra darf max 50 attempts/sec, ffuf max 100 req/sec.
- [ ] **Pentest-Engagement-Modell** — separate Bill-Integration (siehe shop/bill): Customer kauft "Pentest-Tier-1/2/3" → Asset-Authorization wird automatisch gegrantet → Scan läuft → Report.

**Deliverables:**
- Erstes verkauftes Pentest-Engagement (€-zahlender Kunde, nicht intern).
- node-shop-Produkt "Security Pentest Pro" mit Stripe-Checkout, der Authorization-Record erzeugt.

---

## Phase 6 — Continuous Monitoring + Lead-Funnel (Woche 13-16)

**Ziel:** Foundry-Kunden bekommen täglich automatisches Health-Monitoring. SEO-Lead-Magnet treibt qualifizierte Leads.

**Tasks:**
- [ ] **Scheduled-Scans** — `scan_policies` cron-evaluator, täglich/wöchentlich passive_full pro Asset.
- [ ] **Cert-Expiry-Watcher** — eigene Policy: TLS-Cert <30 Tage → Telegram + Email-Alert.
- [ ] **Domain-Health-Daily** — alle Foundry-Tenant-Domains täglich passive_quick. Diff zu gestern.
- [ ] **Public-Scan-UI** auf niccaswilliams.com — schöne Lead-Page: "Email-Sicherheits-Check für deine Domain in 30 Sekunden". Show partial findings → CTA "vollständigen Bericht zur Email".
- [ ] **Lead-Pipeline-CRM** — `secu_public_scan_leads` durchgehen, Status-Updates, Follow-Up-Mail-Sequenzen.
- [ ] **SEO-Optimierung** — Public-Tool-Page mit ranking-fähigem Content ("Was ist SPF und warum ist es wichtig?", interner Link auf Tool).
- [ ] **Conversion-Tracking** — Lead → Asset registriert → erster bezahlter Scan. Funnel-Stages messen.
- [ ] **Stripe-Sub-Checkout** — "Security Monitoring Basic" 49€/Monat (1 Domain, daily passive scan), "Pro" 199€/Monat (5 Domains, active_safe weekly).

**Deliverables:**
- 50+ Public-Free-Scans/Monat
- 5+ zahlende Subscription-Kunden (Phase-6-Ende)
- 1+ Lead pro Woche, der zu einem Pentest-Engagement konvertiert (Phase 7+)

---

## Phase 7 — Boss-Integration + AI-Triage 2.0 (kontinuierlich)

**Ziel:** node-secu wird Teil der gesamten Operations-Plattform. Boss orchestriert. AI-Triage nutzt Cross-Service-Kontext.

**Tasks:**
- [ ] **Boss-API-Calls** — node-secu meldet sich bei boss als Service an (`x-app-id: node-secu`).
- [ ] **AI-Triage 2.0** — Codex/Claude-Routing aus boss reused. Findings bekommen narrative Erklärung.
- [ ] **Cross-Service-Context** — z.B. "diese Domain hat seit 30 Tagen keine Webhooks aus Shop empfangen UND hat ein abgelaufenes Cert" → komposite Alert.
- [ ] **CI/CD-Hook** — pre-deploy Scan im Sister-Service-CI. Critical-Finding blockt Deploy.
- [ ] **Audit-Compliance-Reports** — monatliche Self-Audit-Reports aller Sister-Services + Foundry-Tenants. Telegram-Briefing.

---

## Phase 8 — Shop-Tier-Modell + Self-Service-Buy (Q4 2026)

**Ziel:** node-secu-Funktionen sind direkt im Foundry-Shop kaufbar. Kunden können selbst upgraden.

**Tier-Modell-Vorschlag:**
- **Free** (Lead-Magnet): 1 Public-Scan/Monat, passive_quick only, Email-Capture.
- **Basic — 49€/Monat**: 1 Domain, daily passive_full, monthly Email-Report.
- **Pro — 199€/Monat**: 5 Domains, weekly active_safe, weekly Telegram-Brief, CVE-Alerts.
- **Pentest-Engagement** (one-shot, Custom-Pricing 500-2500€): active_intrusive, manueller Test, ausführlicher PDF-Report mit Empfehlungen.

**Tasks:**
- [ ] node-shop Produkte anlegen
- [ ] Stripe-Webhook → secu-Tier-Aktivierung
- [ ] Self-Service-Asset-Limit-Enforcement
- [ ] Tier-Downgrade-Handling (was passiert mit Asset 6 wenn Pro→Basic gewechselt wird)

---

## Cross-Cutting Concerns (alle Phasen)

### Sicherheit der Plattform selbst
- node-secu ist selbst kritische Infra (kennt Tenant-Tech-Stacks, hat Authorization-Records). Härtere Hardening:
- Eigene `node-secu`-Assets mit `isOwnInfrastructure=true` registrieren → Self-Scan in scheduled_scan policy.
- Audit-Log-Retention min 1 Jahr.
- Container für active workers laufen niemals als root, niemals mit `--privileged`, niemals mit Host-Network.
- DB-Backups verschlüsselt, getrennte Storage-Location.

### Compliance / DSGVO
- IP-Adressen werden gehasht gespeichert (siehe `audit-log.service.ts`).
- Public-Scan-Leads: 24-Monats-Retention, danach Auto-Delete (Cron-Job in Phase 6).
- Findings dürfen nur an die User-Rolle des Asset-Eigners ausgeliefert werden.
- Verträge/Pentest-Authorization als PDF in S3 mit serverside-encryption.

### Dokumentation
- Pro Worker: README im Worker-Dir mit Tool-Version, Flags, Output-Format.
- Pro Phase: Decision-Doc in `docs/decisions/NNNN-titel.md` (ADR-Format) für nicht-triviale Entscheidungen.
- Public-Scan-Result-API hat OpenAPI-Spec ab Phase 2.

### Tests
- Unit-Tests für alle Worker mit fixed snapshot-Inputs (real DNS-Resolves cached).
- Integration-Tests für Orchestrator gegen lokale Test-Domain.
- E2E-Test für Public-Scan-Flow inkl. Rate-Limit.

---

## Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Active Worker scannt versehentlich falsche IP | mittel | hoch (juristisch) | Network-Isolation + Authorization-Gate strikt vor jedem Worker-Run |
| NVD-API rate-limited während CVE-Sync | hoch | mittel | API-Key registrieren + exponential backoff |
| Public-Scan wird gescraped/missbraucht | hoch | mittel | Rate-Limit per IP-Hash + CAPTCHA in Phase 6 |
| AI-Triage halluziniert Severity falsch | mittel | mittel | Triage ist Vorschlag, nicht Authority — User kann override |
| Worker-Container-Escape | niedrig | sehr hoch | non-root user + read-only filesystem + dediziertes Netz |
| Hydra-Wordlist zu aggressiv → DoS-Effekt auf Kunden-System | mittel | hoch | hardcoded rate-limit pro Worker + max-attempts |
| §202c-Klage von "geheilten" Lead | niedrig | sehr hoch | Public-Scan ist passive only + explizite Consent + Audit-Log |

---

## Wann ist node-secu "fertig genug zum Verkaufen"?

**Minimum-Viable-Sellable-Product (MVSP):**
- Phase 1 + 1.5 + 2 + 3 abgeschlossen.
- Mind. 1 Foundry-Tenant nutzt es als Continuous-Monitoring (Pilot-Kunde, ggf. kostenlos).
- 1 erfolgreich verkaufter externer Pentest-Auftrag mit ausgeliefertem PDF-Report.
- Dann Phase 6 (Lead-Funnel) starten.

**Erwartete Timeline:** ~3-4 Monate ab Phase 0 (heute) bis MVSP. Phase 4-5 können parallel laufen, sobald Phase 2-3 stabil.
