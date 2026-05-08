# features.md — OSINT-Recherche-Engine: Master-Roadmap

> **Zweck**: Master-Plan für den OSINT-Ausbau in node-secu. Ersetzt `SOCIAL_ENGINEERING.md` (Problem-Report) durch eine vollständige Mechanik-Liste + Architektur-Entscheidungen + DIY-Plan zum Ersatz kommerzieller Quellen + Future-Spec für eine Darkweb-Leak-Engine.
>
> **Vorausgesetzt gelesen**: `CLAUDE.md` (Mission + Authorization-Modell), `.claude/scan-operations.md` (operative Befehle), `FULL_SCAN.md` (Roadmap Phase 5–8 für Tech-Stack + Reporting).
>
> **Stand**: 2026-05-08. Architektur-Entscheidungen in dieser Session getroffen — siehe Sektion 2.
>
> **Mission im Klartext**: Customer kommt aus DE-B2B-KMU. Operator soll dem Customer **glasklar** zeigen können, dass seine Mitarbeiter, deren Identitäten, deren Email-Patterns, deren Social-Media-Footprints, deren leaked Credentials das **kritischste Angriffsfeld** sind — nicht die TLS-Konfiguration und nicht das CMS-Plugin. Die OSINT-Engine ist das Werkzeug das diese Geschichte mit Daten unterlegen muss.

---

## 0. Tags und Konventionen

Jeder Mechanik-Eintrag trägt Tags:

| Tag | Bedeutung |
|---|---|
| `[free]` | Kostenlose Quelle, keine API-Kosten |
| `[self-host]` | Erfordert lokales Tool (z.B. SearXNG, Holehe, Sherlock) |
| `[de-spezial]` | DE-spezifische Quelle, primär für DE-B2B-Customer relevant |
| `[diy-replacement]` | Wir bauen das selbst nach, was sonst Hunter.io/Apollo/northdata kostenpflichtig liefern würden |
| `[scope:passive_only]` | Authorization-Stufe |
| `[scope:active_safe]` | Erfordert active_safe-Authorization |
| `[future]` | Eigene Phase, jetzt nicht im Bau |
| `[hint-aware]` | Worker konsumiert Operator-Hints als Seed-Material |

**Authorization-Klärung (entschieden in dieser Session)**: Impressum-Crawl + Search-Engine-Abfragen + WHOIS/RDAP zählen alle als `passive_only`. Begründung: read-only, kein Tool-Spawn gegen die Customer-Site, kein State-Change. Eine separate `osint_passive`-Stufe wird **nicht** eingeführt.

---

## 1. Aktueller Stand (Baseline 2026-05-08)

20 passive + 8 active Worker. OSINT-Layer hat 13 Worker für Email/Username/Domain → produziert aber bei vielen Domains 0 Funde (siehe `SOCIAL_ENGINEERING.md`-Run gegen geilemukke.de). Auto-Chain ist max 1 Hop tief. Kein WHOIS, kein Impressum, keine Search-Engine, keine DE-Spezialquellen, keine Cross-Domain-Pivots.

`personFullService` existiert als Orchestrator für Email/Username/Domain-Roots (siehe `src/lib/security/osint/person-full.service.ts`), aber die einzelnen Worker liefern zu wenig Substanz für ihn.

### 1.1 Live-Fortschritt (last update: 2026-05-08)

| Sprint-Punkt | Status | Notiz |
|---|---|---|
| Sprint 1.1 — Hints-API + Schema | ✅ live | Tabelle `secu_engagement_hints` (8-Slot-Enum) + Endpoints + Audit-Log; Worker-Konsum via `hintService.getBundle(engagementId)`. Migration `0005_complex_weapon_omega.sql`. |
| Sprint 1.2 — Speculative-Entity-Felder + `confidence.ts` | ✅ live (2026-05-08) | `EntityProvenance/EntityEvidenceItem/EntityConflict/EntityEvidenceClass`-Typen in Schema; `confidenceService.aggregate/buildDataPatch` mit Single-Source-Cap (0.6), HintOnly-Cap (0.7), HintBoost-Floor (0.95), Probabilistic-OR-Aggregation. `DiscoveredEntityDraft.evidence[]`+`speculativeOverride` ergänzt; worker-runner mergt Provenance-Block in entity.data. Listing-Filter `?includeSpeculative=true` (default ausblenden). |
| Sprint 1.3 — Pivot-Budget-Enforcement | ✅ live (2026-05-08) | Schema: `playbookRuns.hopDepth/parentRunId` + `engagements.osintMaxHops` (default 2). Migration `0008_outgoing_fenris.sql`. Runner enforced bei `startRun`; Block-Outcome `BudgetBlockedResult` + Audit-Log `playbook_run.hop_budget_blocked`. Rule-Evaluator gibt parentRunId via `EntityEventPayload.sourcePlaybookRunId` weiter. |
| Sprint 1.4 — `osint_pivot_light`-Mini-Playbook | ✅ live (2026-05-08) | 5-Step (dns_records + tls_cert + http_headers + domain_whois_passive + domain_impressum_extract), passive_only. Auto-Chain-Rule "Cross-Domain Pivot → osint_pivot_light" als ensureRule registriert, **DISABLED bis Sprint 5 Cross-Domain-Discovery-Worker stehen**. |
| Sprint 1.5 — Shared-Utils (`http-fetch`, `cf-email-decode`, `dns-verify`, `hosting-classifier`) | ✅ live (2026-05-08) | `osint/http-fetch.ts` (UA-Pool 3 Browser, Retry mit Exp-Backoff, Proxy-Gate via osint-http), `osint/cf-email-decode.ts` (data-cfemail XOR-Decoder + /cdn-cgi/l/email-protection-Variante), `osint/dns-verify.ts` (Promise.race-Timeout, 5min-Cache, A/AAAA/CNAME/MX/NS/TXT + DNSSEC-Hint), `osint/hosting-classifier.ts` (15+ Cloud-Provider via CIDR/ASN/PTR-Heuristik). |
| Sprint 1.6 — `findingCategoryEnum.compliance_imprint` | ✅ live (2026-05-08) | Migration `0007_little_leopardon.sql` — Enum-Wert hinzugefügt; `WorkerResult.FindingDraft.category`-Union ergänzt. Konsumiert von `domain_impressum_extract` für DDG/TMG-§5-Pflichtfeld-Findings. |
| Sprint 1.7 — Infrastructure-Provider-Registry | ✅ live (2026-05-08) | Tabelle `secu_infrastructure_providers` (8 dns / 10 registrar / 12 hosting / 6 cdn / 10 email / 8 analytics / 12 social = **66 Provider**) + Entity-Kind `infrastructure_provider` + `infrastructureProviderService` mit `classifyDomain/Host/Asn/Ipv4/NsHost/HtmlAssetHost/EmailDomain` + Worker-Helper `classifyAndPersistIfInfra()`. Migration `0006_friendly_doctor_strange.sql`. Smoke-Test 14/14 grün (Cloudflare-NS, Railway-IP, GTM-Asset, AS13335, github.io vs github.com etc.). Gegen-Use: kein Owner-Pivot auf bekannten Infrastructure-Hits — siehe §2.8. |
| Sprint 2 #7 — `dns_records`-Erweiterung | ✅ live (2026-05-08) | DMARC `rua=`/`ruf=`-Email-Extract → email_address Discovery; DNS-TXT-Verifications-Pivot (12 Token-Typen) → `secu_dns_verification_pivots`; Cloudflare-NS-Pair-Pivot → `secu_dns_ns_pivots`; NS-/MX-/SPF-Includes via `classifyNsHost/EmailDomain`. Schema: Migration `0009_gigantic_princess_powerful.sql`. Smoke gegen niccaswilliams.com: google_site_verification + cloudflare_ns_pair persistiert; Cloudflare-Email-Routing + Amazon-SES als infrastructure_provider verlinkt. |
| Sprint 2 #8 — `domain_whois_passive` | ✅ live (2026-05-08) | RDAP via IANA-Bootstrap-Cache (24h TTL); Vcard-Parser für registrant/admin/tech/billing-Rollen (abuse explizit gefiltert); Anonymized-Detection für Privacy-Provider; speculativeOverride basiert auf Anonymisierung. |
| Sprint 2 #9 — `domain_impressum_extract` | ✅ live (2026-05-08) | Crawl-Pfade: 15 (DE+EN); CF-Email-Decoder integriert; NER-light für Person (Vertretungsformeln + Stop-Words), Email, Phone (DE/intl), Adresse (PLZ-Anker rückwärts), HRB/USt-IdNr; Cross-Domain-NER mit Provider-Filter; DDG/TMG-§5-Compliance-Audit (missing-imprint=medium, incomplete=low/medium). Smoke: niccaswilliams.com — Person `Niclas Pilz`, Email `support@…`, Adresse `Große Bleiche 27, 55116 Mainz` korrekt extrahiert. |
| Sprint 2 #10 — `domain_microsoft_tenant` | ✅ live (2026-05-08) | login.microsoftonline.com/.well-known/openid-configuration; Tenant-ID + Issuer-URL + cloud-Region als entity.data.microsoftTenant. Smoke: outlook.com → tenantId f8cdef31-…; niccaswilliams.com → korrekt als not-tenant erkannt (HTTP 400). |
| Sprint 2 #11 — `domain_html_pivots_extract` | ✅ live (2026-05-08) | Tabelle `secu_html_pivots` (Migration `0010_complete_cerebro.sql`); Worker matched 17 Pivot-Typen (UA/GA4/GTM, FB-Pixel, Hotjar/Matomo/Yandex/Clarity, Sentry/Stripe/Mapbox/Mailchimp/reCAPTCHA/Plausible, Webpack/Next/Vite/SvelteKit-Asset-Hashes); Cross-Engagement-Lookup nach Persistierung → finding `exposure:Cross-Engagement Pivot` info-level. Smoke: niccaswilliams.com → 31 next_chunk_hash-Pivots persistiert. |
| Sprint 2 #12 — `tls_cert`-Refactor | ✅ live (2026-05-08) | Subject-Validity-Gate: bei expired/notYetValid → SAN-Discoveries als speculative=true (statt droppen). SAN → asset_subdomain (in-domain) oder asset_domain (cross-domain) mit Provider-Filter (Railway/Vercel-SANs nicht als Cross-Domain). Smoke: niccaswilliams.com (TLSv1.3, daysLeft=74, 1 SAN apex-only); expired.badssl.com → expired-Finding (critical) korrekt erzeugt. |
| Sprint 2 #13 — `subdomain_passive`-Refactor | ✅ live (2026-05-08) | 5-Source-Aggregator: subfinder + crt.sh + HackerTarget + Wayback-CDX + DNS-Bruteforce (50-Top-Wordlist); pro Hit Multi-Source-Provenance (`data.sources[]`); Live-Verify via dns-verify.ts; Stale-Hits NICHT gedroppt sondern als speculative=true mit `data.staleSince` markiert. Smoke: niccaswilliams.com → 7 Subdomains aus 4 Quellen, 0 live + 7 stale (alle CT-Log-Artefakte). |
| Sprint 3 #16 — `domain_github_brand` | ✅ deployed (2026-05-08, **live-test pending GH_TOKEN**) | Erster hint-aware Worker. SLD-Variants (`sldVariants`) als organic-Quelle + Hint-getriebene Queries (ownerNames via `personNameVariants`, ownerCompanies via `companyNameVariants`, ownerKnownUsernames 1:1). Pro Hit social_account (discriminator=github) + username (cross-platform-Bridge) + optional email_address aus public Profil-Email. Provenance pro Evidence: `evidenceClass=organic` für SLD, `hint_seeded` mit `hintRefs[]` für Hint-Queries. Confidence-Mapping: SLD-exact-in-login=0.7, SLD-broad=0.4, known-username-hint=0.85, name/company-hint=0.5. Hard-Cap 12 Queries/Run gegen Quota. Util `osint/brand-variants.ts` (extractSld + Public-Suffix-Awareness, sldVariants, personNameVariants, companyNameVariants, normalizeFreeText) — Smoke 11/11 grün. Live-Test mit GitHub-API steht aus, weil GH_TOKEN im Server-Env nicht gesetzt; Worker-Skip-Pfad analog zu existierendem `domain_github_personnel` verifiziert. |
| Sprint 3 #17a — `github_repos_public` | ✅ deployed (2026-05-08, **live-test pending GH_TOKEN**) | Input social_account mit data.platform="github". GET /users/{handle}/repos?sort=pushed&per_page=30. entityDataPatch mit `publicRepos[]` (name, fullName, language, pushedAt, stargazers, isFork, isArchived, htmlUrl) + `repoLanguages[]` (Histogramm, Forks halb gewichtet). Keine eigenen Discoveries — Anreicherung des bestehenden Account-Knotens. |
| Sprint 3 #17b — `github_events_public` | ✅ deployed (2026-05-08, **live-test pending GH_TOKEN**) | Input social_account mit data.platform="github". GET /users/{handle}/events/public?per_page=100. Mining commit-author-emails aus PushEvents → 3 Klassen: **personal** (e.g. `name@gmail.com`, speculative=false, contribution=0.7), **corporate** (matcht `discoveredFromDomain` aus Brand-Worker, speculative=false), **github_noreply** (`12345+login@users.noreply.github.com`, speculative=true, contribution=0.4). Discovery: `email_address` mit relationshipKind=`email_used_in_github_commits`, evidence inkl. `sampleSubject` (erste 200 Zeichen Commit-Message) + commitCount + repos[]. |
| Sprint 3 — Auto-Chain + Mini-Playbook | ✅ deployed (2026-05-08) | Mini-Playbook `osint_github_account_recon` (2 Steps: github_repos_public + github_events_public) für Out-of-Band-Hits. Auto-Chain-Rule "GitHub-social_account → osint_github_account_recon" via `ensureRule` in bootstrap.ts seeded, **DEFAULT DISABLED** — Operator schaltet bewusst frei, weil ein Hop-2-Trigger schnell die OSINT-Quota frisst und im normalen `web_recon_passive`-Flow Brand+Repos+Events bereits als Steps verdrahtet sind (dependsOn=[github_personnel, github_brand_search]). |
| Sprint 3 #14, #15, #18 — SearXNG + Search-Engine + LinkedIn/XING | offen | Strang B aus Sprint 3 ausgesetzt; Architektur-Entscheidung SearXNG-self-hosted vs Brave-Search-API (free-tier 2000/Monat) noch zu treffen. Item #18 (LinkedIn/XING) hängt direkt an #15. |
| Sprint 4+ — DE-Spezial / Cross-Domain-Activation / Email-Discovery | offen, wartet auf Sprint 3 Strang B |

---

## 1.5 Live-Test 2026-05-08 — empirische Lehren aus geilemukke / orvello / niccaswilliams

Bevor wir die Engine bauen, wurde ein **manueller OSINT-Live-Test** gegen drei Operator-eigene Domains durchgeführt (geilemukke.de, orvello.de, niccaswilliams.com). Ziel: empirisch validieren welche Mechaniken aus Sektion 3 in der Realität tragen, welche silently failen, welche Worker-Robustness-Anforderungen sich daraus ergeben. Alles unten dokumentierte ist mit Bash/curl/dig/openssl/Search-API-Calls aus dieser Session reproduzierbar — kein Insider-Wissen, keine Annahmen.

### 1.5.1 Was die Engine auf den drei Domains finden konnte

| Befund | Quelle (organisch reproduzierbar) | Confidence |
|---|---|---|
| **Person: Niclas Pilz** | nw + orv `/impressum` (HTML-Body NER) | 1.0 |
| **Firma: Geile Mukke** (Marke / Einzelunternehmen, kein HRB) | orv `/impressum` Anbieterkennzeichnung §5 DDG | 1.0 |
| **Adresse: Große Bleiche 27, 55116 Mainz** | beide Impressen | 1.0 |
| **Email: support@orvello.de** | DMARC-TXT `rua=mailto:` + Impressum (CF-decoded) | 1.0 |
| **Email: support@niccaswilliams.com** | nw `/impressum` Klartext | 1.0 |
| **GitHub-User: `niccasWilliams`** (id 156859625, seit 2024-01-16) | GitHub-User-API `q=<sld-of-domain>` | 0.9 |
| **Cross-Domain orv ↔ nw**: 8 gemeinsame Webpack-Chunks | HTML-Source-Vergleich `/_next/static/chunks/<hash>.{js,css}` | 0.95 |
| **Cross-Domain alle 3**: identisches Cloudflare-NS-Pair `leonidas.ns + teagan.ns` | DNS NS-Records (NS-Pair ist account-spezifisch in CF) | 0.85 |
| **Cross-Domain orv ↔ geilemukke** Klartext: orv-Impressum nennt "Geile Mukke" als Verantwortlich | Impressum-NER für Domain/Firmen-Mentions | 1.0 |
| **Cross-Domain nw ↔ orv** Klartext: nw-Impressum nennt "Orvello" wörtlich | Impressum-NER | 1.0 |
| **Tech-Stack pro Domain**: Next.js+Turbopack+Cloudflare (orv, nw); Railway-Hosting (gm) | TLS-Cert-SAN (`*.up.railway.app`) + HTML-Chunks | 1.0 |
| **Mail-Tooling**: Strato (orv, gm), Cloudflare-Email-Routing (nw), AmazonSES-includes (gm, nw) | DNS MX + SPF parsing | 1.0 |
| **Subdomain-Historie**: `abenteuerfreunde.niccaswilliams.com`, `backup.niccaswilliams.com` (existierten, jetzt DNS-tot) | HackerTarget hostsearch (Cache zeigt historische SDs) | 0.7 (stale) |
| **Wayback-Historie**: geilemukke.de seit 2001-11-07 (24 Jahre), nw seit 2024-08-04, orv leer | Wayback CDX API | 1.0 |
| **Soundcloud `geile-mukke` + Instagram `@geilemukkepicknick`** (GMP Festival, Rüdesheim) | Web-Search `"Geile Mukke" Mainz` (organic) | 0.8 |
| **Domain-Compliance-Finding**: orv-Impressum hat keine Telefonnummer (`Telefon: .` leer), keine USt-IdNr — TMG/DDG §5-Verstoß | Impressum-Parse | 0.9 |

**Was NICHT gefunden wurde** (auch nicht mit gezielter Suche):
- Tatsächliche Email hinter Cloudflare-Email-Routing (nw → wird forwardet, Destination ist CF-Dashboard-intern)
- Telefonnummer (im Impressum bewusst leer)
- LinkedIn/XING-Profil zu Niclas Pilz aus Mainz (Web-Search lieferte nur einen Fußballer als False-Positive)
- HRB-Nummer (Kleingewerbe ohne Handelsregister-Pflicht)
- Mitarbeiter / Team (vermutlich Solo-Operator)

### 1.5.2 Korrekturen an bestehender Doku

- `SOCIAL_ENGINEERING.md` Sektion 7 listete früher bekannte Subdomains "bills, email, picknick, williams, amp" — das war Insider-Wissen aus dem Operator-Setup, nicht via OSINT entdeckt. Die OSINT-Engine hat HackerTarget genutzt und 4 dieser 5 unabhängig gefunden (`bills`, `email`, `picknick`, `amp`); `williams` war stale/weg. Die Owner-Identitäten dort wurden entfernt — Operator-Vorwissen gehört in die Hints-API, nicht in committete Doku-Hints, sonst trainieren wir die Engine implizit auf falsche/private Daten.

### 1.5.3 Die 14 Engine-Lehren aus dem Live-Test

Diese Punkte sind operativ kritisch und müssen in den Worker-Implementationen berücksichtigt werden:

| # | Lehre | Worker-Konsequenz |
|---|---|---|
| L1 | **Cloudflare-Email-Obfuscation** versteckt Emails als `data-cfemail="HEX"` — sichtbarer HTML-Text ist `[email protected]`, echter Wert nur via 5-Zeilen-XOR-Decoder (`r = parseInt(hex.slice(0,2),16); chars = [for i in 2..len step 2: chr(parseInt(hex[i..i+2],16) ^ r)]`). Auf orvello-Impressum 6× verwendet, ohne Decoder = 0 Emails | Pflicht-Capability für **jeden** HTML-crawlenden Worker (Impressum, HTML-Pivot, Tracking-IDs). Eigenes Util `src/lib/security/osint/cf-email-decode.ts` |
| L2 | **HTTP-Crawl ohne Browser-User-Agent wird geblockt** — orvello.de gab `403` für default-WebFetch-UA, mit `Mozilla/5.0 ...` → `200`. Cloudflare-WAF-Rules klassifizieren Bot-UAs default als verdächtig | Worker-HTTP-Util muss konfigurierbare UA-Rotation haben + Retry mit alternativen UAs. Nie auf Default-UA verlassen |
| L3 | **crt.sh ist nicht zuverlässig** — 3/3 Requests in dieser Session hatten Timeouts. CT-Discovery muss **multi-source** sein: crt.sh + Censys + certspotter + Google CT API + Cloudflare-Radar-API. Bei Single-Source-Failure silent-failure | Siehe Sektion 4.7 (neue) — eigener Multi-Source-CT-Aggregator |
| L4 | **HackerTarget DNS-Lookup liefert STALE-Daten** — zeigte 5 Subdomains für nw, davon 3 (`abenteuerfreunde`, `backup`, `williams`) DNS-tot bei Live-Verify. Cache enthält historische Records | Subdomain-Worker MUSS jeden Treffer live-verify (DNS-Resolve) bevor Persistierung. Stale-Records markieren mit `entity.data.lastSeenAt < now()-30d` |
| L5 | **Reverse-IP-Pivot ist bei Shared-Hosting WERTLOS** — Reverse-Lookup auf `66.33.22.245` (geilemukke) zeigt hunderte unrelated `*.ai`-Domains, weil Railway-Shared-IP. Ähnlich für CF/Vercel/Render | Vor Reverse-IP-Persistierung **erst** Hosting-Provider klassifizieren. ASN-Owner + bekannte CIDR-Bereiche prüfen (Cloudflare 104.16.0.0/12, Railway 66.33.22.0/24, Vercel etc). Nur bei Dedicated-IP weiterverwenden |
| L6 | **TLS-Cert-Owner-Inferenz nur valide wenn Cert auf Domain ausgestellt** — geilemukke.de's Cert sagt `*.up.railway.app` (Railway-Wildcard, nicht eigener). Subject-Inferenz "CN=Railway" als Owner wäre falsch | Cert-Inferenz nur wenn `CN==domain` ODER `domain ∈ SAN`. Sonst Cert als "platform_default" klassifizieren, nicht als Owner-Signal |
| L7 | **Webpack-Chunk-Hash schlägt Tracking-IDs als Cross-Domain-Pivot** — auf orv+nw fanden wir **NULL** Tracking-IDs (kein GA, kein GTM, nichts), aber 8 gemeinsame `_next/static/chunks/<hash>.{js,css}`. Bei Custom-Built-Apps ist das **der** Pivot | Eigene Pivot-Klasse `id_type='webpack_chunk'` in `secu_html_pivots`. Höhere Confidence als Tracking-ID-Match (Tracking-IDs können bewusst kopiert werden, Chunks nur identische Codebase) |
| L8 | **DMARC `rua=`/`ruf=`-Felder leaken Owner-Email** — `_dmarc.orvello.de` enthielt `rua=mailto:support@orvello.de` als TXT, ein Email-Treffer rein aus DNS-Lookup. Bisher in `dns_records.worker` nicht extrahiert | `dns_records.worker` muss DMARC-TXT parsen + `mailto:`-Adressen als `email_address`-Entities materialisieren |
| L9 | **Subdomain-Discovery ist 5-Source, keine reicht allein** — wir fanden Subdomains via DNS-Bruteforce (klein, 4 Treffer), HackerTarget (5 mit 3 stale), TLS-SAN (0 wegen Wildcard), Wayback (für gm produktiv), CT-Logs (down). Worker muss **alle 5** kombinieren + dedup + live-verify | Subdomain-Worker als Aggregator-Pattern: jede Quelle ist ein Sub-Step, results merged + verified vor Persistierung |
| L10 | **Search-Engine hat False-Positive-Risiko bei Personensuche** — `"Niclas Pilz"` lieferte Fußballer aus BeSoccer/Transfermarkt als True-Negative. Confidence muss Kontext-Token-Overlap zählen (Mainz, Mukke, Domain-Erwähnung) | `search_engine_recon`-Worker speichert pro Hit `contextTokens: [...]` und confidence proportional zu Hint-Token-Match-Count |
| L11 | **DDG/TMG-§5-Compliance ist eigene Finding-Kategorie** — orv-Impressum hat keine Telefonnummer (gesetzliche Pflicht) und keine USt-IdNr. Das ist Customer-relevant: "deine Site ist abmahnfähig" | Neue `findingCategoryEnum.compliance_imprint`-Kategorie; Impressum-Worker erzeugt Findings nach Pflichtangaben-Lücken |
| L12 | **Impressum-Text enthält Cross-Domain-Mentions im Klartext** — nw-Impressum sagt wörtlich "digitale Dienste von Orvello", orv-Impressum nennt "Geile Mukke". Diese Domain/Firmen-Mentions sind direkter als Tracking-IDs | Impressum-Worker NER-Pass: extrahiere alle erwähnten Domains (Regex `[a-z0-9-]+\.[a-z]{2,}`) und Firmen-Namen (capitalized noun-phrases ggf. mit Rechtsform `GmbH/UG/AG/KG`), persistiere als `entity.data.relatedDomains[]` mit `evidenceClass='organic'` |
| L13 | **GitHub-User per Domain-SLD-Brand-Search ist organische Heuristik** — direkter Domain-Search `q=niccaswilliams` → 1 Treffer. Branding-Konsistenz ist Standard. Aber: `q="Niclas Pilz"` (Personenname) → 0 Treffer trotz existierendem Account, weil Account leer ist (kein name-Field). Username-Heuristik schlägt Name-Heuristik | Eigener Worker `github_user_by_domain_brand`: nimmt Domain → SLD ohne TLD → User-Search. Plus Variants (CamelCase, lowercase, dashes) |
| L14 | **Subdomain-Service-Probe filtert tote Records** — `email.geilemukke.de` liefert 200+Login-Page, andere Subdomains 404. Live-HTTP-Probe nach Subdomain-Discovery klassifiziert "alive vs DNS-only" | Bestehender `service_classify`-Worker muss konsistent für jeden discovered Subdomain laufen, nicht nur für Apex. Auto-Chain-Rule: `entity.created kind=asset_subdomain → service_classify` |

### 1.5.4 Was die OSINT-Engine **konkret anders bauen muss** als naiv geplant

Aus L1-L14 abgeleitet, vor Sprint 1 in die Architektur einarbeiten:

1. **`src/lib/security/osint/cf-email-decode.ts`** als Shared-Util für alle HTML-Worker (L1)
2. **`src/lib/security/osint/http-fetch.ts`** mit UA-Rotation + Retry-Logic, ALLE HTTP-Worker nutzen es (L2)
3. **`src/lib/security/osint/ct-multi-source.ts`** als crt.sh-Replacement mit 5 Quellen + Round-Robin (L3, siehe Sektion 4.7)
4. **`src/lib/security/osint/dns-verify.ts`** als Live-Verify-Util für jede aus 3rd-party-API gelieferte Discovery (L4)
5. **`src/lib/security/osint/hosting-classifier.ts`** mit ASN+CIDR-DB für Cloudflare/Railway/Vercel/Render/AWS-CF/Hetzner-Cloud (L5, L6)
6. **Webpack-Chunk-Pivot** als eigener `id_type` in `secu_html_pivots` (L7)
7. **DMARC-Parse** in bestehendem `dns_records.worker` ergänzen (L8)
8. **Subdomain-Aggregator-Pattern** für `subdomain_passive` umbauen (L9)
9. **Confidence-by-Context-Tokens** in `search_engine_recon` (L10)
10. **Neue Finding-Kategorie** `compliance_imprint` in `findingCategoryEnum` (L11)
11. **Impressum-NER für Cross-Domain-Mentions** in `domain_impressum_extract` (L12)
12. **`github_user_by_domain_brand`-Worker** als eigene Mechanik (L13)
13. **Auto-Chain-Rule** `entity.created kind=asset_subdomain → service_classify` (L14)

---

## 2. Architektur-Entscheidungen (in dieser Session entschieden)

Diese sechs Designs sind die Grundlage aller Worker-Implementationen unten. Bevor ein Worker gebaut wird, müssen die Entscheidungen im Code persistiert sein — sonst tragen die Worker das Verhalten widersprüchlich.

### 2.1 Hints-API + DB-Tabelle `secu_engagement_hints`

Operator kann pro Engagement **Vorwissen** strukturiert hinterlegen, das jeder OSINT-Worker als Seed konsumiert.

**Slots** (alle optional, alle multi-value):
- `ownerNames[]` — bekannte Personen-Namen (z.B. "Niclas Pilz")
- `ownerCities[]` — Standorte
- `ownerCompanies[]` — Firmen-Namen
- `ownerKnownEmails[]` — vorab bekannte Emails
- `ownerKnownUsernames[]` — vorab bekannte Plattform-Identitäten
- `ownerAltDomains[]` — manuell zugeordnete weitere Domains des gleichen Owners (Pivot-Bestätigung durch Mensch)
- `industryHints[]` — Branche, B2B-Kategorie
- `freeText` — alles andere

**API**:
- `POST /engagements/:id/hints` mit JSON-Body (siehe Slots oben)
- `GET /engagements/:id/hints`
- `PATCH /engagements/:id/hints/:hintId`
- `DELETE /engagements/:id/hints/:hintId`

**Worker-Konsum**: Workers sehen Hints via `engagementService.getHints(engagementId)`. Worker-Doku muss explizit dokumentieren welche Hint-Slots der Worker als Seed nutzt → Tag `[hint-aware]`.

**UI-Aspekt** (Frontend, später): Hints-Edit während laufender Recherche möglich. Persistente Hints werden bei Re-Run automatisch wieder durchgereicht.

### 2.2 Speculative-Entities + Confidence-Score

Jede Entity bekommt zusätzliche `data`-Felder:

```typescript
entity.data = {
  ...existing,
  speculative: boolean,        // false = verifiziert, true = Hypothese
  confidence: 0.0..1.0,        // Vertrauens-Score
  evidence: [                  // alle Belege gesammelt
    {
      source: "impressum_crawl" | "whois" | "search_engine" | "hint" | ...,
      foundAt: ISO8601,
      snippet: string,         // wörtliches Zitat
      confidenceContribution: 0.0..1.0,
      evidenceClass: "organic" | "hint_seeded",  // siehe 2.7
      hintRefs?: number[],     // wenn hint_seeded: welche secu_engagement_hints.id war Seed
    }
  ],
  conflicts: [                 // wenn Quellen sich widersprechen
    { source, claim }
  ],
}
```

**Confidence-Aggregation**: Multi-Source-Boost. Wenn 3 unabhängige Quellen denselben Namen liefern, hochzonen. Wenn 1 Quelle widerspricht, Konflikt-Flag setzen statt Wert überschreiben. Konkrete Berechnung: siehe `src/lib/security/entities/confidence.ts` (zu bauen).

**Persistierung**: `speculative=true`-Entities werden im Standard-API-Listing **nicht** als gleichberechtigt zu verifizierten Entities zurückgegeben — ein Query-Parameter `?includeSpeculative=true` schaltet sie ein. Customer-Reports zeigen sie nur als "Hypothesen, nicht verifiziert"-Block separat.

### 2.3 Hybrid-Cross-Domain-Pivot mit Auto-Light-Scan

Wenn Worker eine wahrscheinliche zweite Domain für denselben Owner findet (z.B. via Tracking-ID-Match, Impressum-Cross-Reference, Cert-SAN-Sharing):

1. Domain wird als `asset_domain`-Entity persistiert mit `role=pivot`, `engagement-link = secondary`, `confidence=N`.
2. **Auto-Light-Scan** läuft automatisch — definiert als Mini-Playbook `osint_pivot_light` (DNS-Records, TLS-Cert, HTTP-Headers, Impressum-Crawl, WHOIS). Liefert Researcher sofort die Basis-Infos zur Triage.
3. **Kein** voller Scan (kein active_safe, kein nuclei) — der bleibt menschlicher Entscheidung.
4. Wenn Operator via Hints bestätigt "Domain X gehört zu diesem Customer" oder via Engagement-Authorization eine zweite Authorization für Domain X anlegt, wird die Domain auf `role=in_scope` hochgestuft und **alle Engagement-Playbooks können auf ihr laufen**.
5. Customer-Block-Verbindung: zwei Domains die manuell verbunden wurden teilen `engagement.metadata.customerBlockId` → Reports konsolidieren.

**Konsequenz**: Keine ungenehmigten Active-Scans auf Pivot-Domains, aber sofort verwertbare Recherche-Substanz. Klare Eskalations-Pfade Hint → Authorization → Full-Scan.

### 2.4 Multi-Hop-Tiefe = max 2 Hops, mit Operator-Override

Auto-Chain feuert maximal 2 Hops in Folge:

```
Hop 0: Domain (Engagement-Root)
  ↓
Hop 1: Person, Email, Cross-Domain (via Impressum, WHOIS, Tracking-Pivot)
  ↓
Hop 2: Mehr Domains/Personen via Person→Firma→deren-Domains (via Handelsregister, Search-Engine)
  ✗ STOP für Auto-Chain
```

**Aber**: alle in Hop 3+ entdeckbaren Kandidaten werden **als Hypothese persistiert** (mit `speculative=true, confidence<threshold`), nur nicht automatisch gescannt. Operator sieht sie im Engagement-Graph und kann manuell triggern: `POST /engagements/:id/entities/:entityId/expand`.

**Pivot-Budget pro Engagement** (gegen Explosion):
- max 30 Personen (verifiziert + speculative)
- max 20 Cross-Domains
- max 100 Emails
- max 50 Usernames

Bei Überschreitung: Auto-Chain wird angehalten, Audit-Eintrag, Operator-Notification via boss.

### 2.5 Pro wahrscheinlichster Hypothese: Auto-Trigger; alle anderen: sichtbar aber unscanned

Wenn ein Worker mehrere Owner-Hypothesen liefert (z.B. Impressum-Crawl auf 3 Sub-Domains gibt 3 verschiedene Namen), triggert die Auto-Chain **nur** für die Hypothese mit höchster `confidence`. Die anderen werden persistiert als `entity.data.speculative=true, autoChainPending=true`. Operator sieht sie und kann sie individuell promoten: `POST /entities/:id/promote`.

### 2.6 DSGVO-Frame für Personen-Daten

- Personen-Findings werden ausschließlich im Engagement-Kontext persistiert, **nie** engagement-übergreifend dedupliziert (Cross-Engagement-Hits gehen via `triggerCrossEngagementHit`-Notification, nicht via stille Konsolidierung).
- Bei Engagement-Status `archived`: Personen-Entities werden nach **180 Tagen** automatisch hard-gelöscht (Cron-Job, später). Findings bleiben anonymisiert (Email → "REDACTED", Person-Name → "REDACTED").
- Audit-Trail: jeder Personen-Entity-Read im API-Layer schreibt einen `secu_audit_log`-Eintrag.
- Free-Public-Scan-Funnel (Phase 8): wenn ein Stranger eine Domain einreicht, dürfen auf entdeckten Personen **keine** Worker laufen — Personen-Worker sind hinter `engagement.kind in ('paid_pentest','internal_lab')` gegated.

### 2.7 Befund-Provenance: organic vs hint_seeded

Jeder Evidence-Eintrag (siehe 2.2) trägt `evidenceClass`. Zwei harte Klassen:

| Klasse | Definition | Beispiele |
|---|---|---|
| **`organic`** | Befund wäre für **jeden** Researcher mit nur der initialen Engagement-Eingabe (Domain) reproduzierbar — über öffentliche Quellen + generische Heuristik. Kein Operator-Hint nötig. | Niclas Pilz aus orv-Impressum (Crawl `/impressum`); GitHub-User `niccasWilliams` per `q=<domain-sld>`-User-Search (generische Domain-zu-Brand-Heuristik); Cross-Domain via Webpack-Chunk-Match (HTML-Diff zweier discovered Domains); DMARC `rua=`-Email aus DNS |
| **`hint_seeded`** | Befund wurde nur gefunden weil ein Operator-Hint aus `secu_engagement_hints` als Seed in den Worker eingespeist wurde. Ohne den Hint hätte die Engine nichts (oder zu viele False-Positives) gefunden. | Search-Engine `"Niclas Pilz Mainz Geile"` triggert nur, weil Hint `ownerNames=["Niclas Pilz"]` + `ownerCities=["Mainz"]` existiert; `email_pattern_generator` braucht `ownerNames`-Hint um plausible Emails zu generieren; LinkedIn-Snippet-Suche `site:linkedin.com "<name>"` braucht den Namen als Hint |

**Architektur-Konsequenzen**:

1. **Worker-Output**: jeder Worker, der Entities oder Findings erzeugt, MUSS für jedes Evidence-Item klassifizieren ob der Befund organic oder hint_seeded ist. Default: `organic`. Wenn ein Worker mit Hints gearbeitet hat: `hint_seeded` mit `hintRefs[]`.

2. **Confidence-Aggregation** (siehe 2.2) gewichtet beide Klassen unterschiedlich:
   - 1× `organic` von 2 unabhängigen Quellen → confidence = 0.85
   - 1× `hint_seeded` allein → confidence cap auf 0.7 (Operator-Bias-Risiko)
   - 1× `organic` + 1× `hint_seeded` (Hint bestätigt) → confidence = 0.95

3. **Customer-Report** zeigt die Klassen separat:
   - **"Organic OSINT"-Block**: "Was jeder Angreifer mit nur Ihrer Domain in 5 Minuten findet" — das ist der Wow-Faktor für den Customer-Verkauf, weil er selbst sieht wie viel öffentlich exposed ist
   - **"Researcher-Tiefe"-Block**: "Was unser Researcher mit zusätzlichem Domain-Wissen findet" — zeigt den Unterschied "0815-Tool vs menschlicher Recherche-Analyst"
   - Trennt für Customer ehrlich: "diese Lücke kennt jeder" vs "dafür musst du mich bezahlen"

4. **Re-Scan-Konsistenz**: ein zweiter Run mit denselben Hints muss dieselben hint_seeded-Treffer liefern (deterministic). Ein Run **ohne** Hints muss alle organic-Treffer reproduzieren — sonst ist die Engine-Aussage "diese Befunde sind organisch" nicht haltbar.

5. **Self-Audit**: alle 4 Wochen läuft ein automatischer "Hints-disabled-Run" gegen ein Test-Engagement, vergleicht Output mit dem letzten Hints-enabled-Run, und alarmiert wenn organic-Befunde plötzlich verschwinden (= ein Worker hat sich heimlich auf Hints verlassen die er als organic gemeldet hat).

**Beispiel aus dem Live-Test (1.5.1)**: Niclas Pilz / Geile Mukke / Adresse / GitHub-User → alle `organic`. Hätten wir Hint `ownerNames=["Niclas Pilz"]` + `ownerCities=["Mainz"]` gesetzt und damit `search_engine_recon` getriggert, hätten Soundcloud `geile-mukke` und Instagram `@geilemukkepicknick` `evidenceClass=hint_seeded` (weil die Suche nur funktioniert wenn der Name als Token-Match-Filter eingespeist wird).

### 2.8 Infrastructure-Provider-Registry (Sprint 1.7, ✅ deployed 2026-05-08)

**Problem (aus Live-Test §1.5)**: Naive Worker interpretieren *jedes* Cross-Domain-Signal als Owner-Hypothese. Ergebnis: Cloudflare-NS-Pair landet als "Domain-Owner-Pivot", Railway-Shared-IP als "andere Customer-Domain", `www.googletagmanager.com` als Cross-Domain-Hit. Müll-Pivots fluten den Engagement-Graph und vergiften die Cross-Domain-Heuristik.

**Lösung**: globale, DB-getragene Registry bekannter Provider, die *vor* jeder Pivot-Logik konsultiert wird. Wenn ein Hit als bekannte Infrastruktur klassifiziert ist, landet er als `entity.kind='infrastructure_provider'` (Context-Info) — NICHT im Owner-/Cross-Domain-Pivot-System.

**Schema** (Sprint 1.7 deployed):

```sql
secu_infrastructure_providers (
  id, key, name, category, match_patterns jsonb, data_notes, is_active
)
secu_infra_provider_category ENUM ('dns_provider','registrar','hosting','cdn',
                                   'email_provider','analytics','social_platform')
```

`match_patterns` ist multi-axial: `domainSuffixes[]`, `asnNumbers[]`, `cidrRanges[]` (IPv4 CIDR), `nsSuffixes[]`, `htmlAssetHosts[]`, `emailDomains[]`. Worker rufen je Quelle die passende `classifyXxx()`-Methode — bei mehrfachem Match wird der spezifischste (längster Suffix / längstes Prefix) gewählt.

**Worker-Vertrag**:

```typescript
const result = await infrastructureProviderService.classifyAndPersistIfInfra(
  { kind: "ns_host", value: nsHostFromDns },
  { engagementId, source: "dns_records:NS" },
);
if (result.isInfra) {
  // KEIN Owner-Pivot, KEIN Cross-Domain-Trigger.
  // result.entity ist als context-Role im Engagement verlinkt.
  return;
}
// Sonst: weiter mit der normalen Owner-Pivot-Logik.
```

**Initial Seed (66 Provider, Stand 2026-05-08)**:
- **DNS-Provider** (8): Cloudflare, AWS Route 53, Google Cloud DNS, NS1, DNSimple, Hetzner DNS, DENIC, HE.net
- **Registrar** (10): Namecheap, GoDaddy, IONOS, Strato, Hetzner-Domains, Gandi, Porkbun, Name.com, OVH, INWX
- **Hosting** (12): Railway, Vercel, Netlify, Render, Heroku, Fly.io, AWS, GCP, Azure, Hetzner-Cloud, DigitalOcean, GitHub-Pages
- **CDN** (6): Cloudflare-Edge (incl. AS13335 + IPv4-Ranges), jsDelivr, unpkg, Akamai, Fastly, Bunny.net
- **Email-Provider** (10): Google-Workspace, Microsoft-365, Strato-Mail, Mailgun, SendGrid, Postmark, Amazon-SES, Mailchimp, Cloudflare-Email-Routing, ProtonMail
- **Analytics** (8): Google-Analytics, GTM, Sentry, PostHog, Plausible, Matomo, Hotjar, MS-Clarity
- **Social-Platform** (12): LinkedIn, GitHub, GitLab, Bitbucket, Twitter/X, Facebook, Instagram, Mastodon-Flagship, Bluesky, HackerNews, Reddit, YouTube

**Architektur-Konsequenzen** (für jeden Sprint-2-Worker):

1. **DNS-NS-Worker**: vor NS-Persistierung → `classifyNsHost(nsHost)`. Cloudflare-NS-Match: kein Owner-Pivot, aber NS-Pair-Pivot bleibt eigene Mechanik (siehe §3.1 Kommentar).
2. **DNS-MX-Worker / SPF-Parser**: vor "Owner-Mailprovider"-Inferenz → `classifyEmailDomain(mxHost)`. Google-Workspace-Match → klassifiziert als email_provider, nicht Owner-Email.
3. **TLS-Cert-Worker**: vor SAN-Cross-Domain → `classifyDomain(san)`. `*.up.railway.app` Match → kein Cross-Domain-Pivot, Cert wird als `platform_default` markiert (R5).
4. **Reverse-IP-/Hosting-Klassifikator**: `classifyIpv4(ip)`. Match → Reverse-IP-Pivot ist *garantiert* wertlos (Shared-Hosting), Worker überspringt den Pivot-Step.
5. **HTML-Tracking-Pivots**: `classifyHtmlAssetHost(host)`. Match auf GTM/GA-Asset-Hosts → wird NICHT als Cross-Domain-Pivot gewertet (jeder hat GTM). Tracking-IDs (`UA-XXX`/`G-XXX`) sind eigene Pivot-Klasse in `secu_html_pivots`, nicht Provider-Domain-Match.
6. **Impressum-NER (Cross-Domain-Mentions)**: für jede in einem Impressum gefundene Domain → `classifyDomain()`. Mention von `cloudflare.com` ist kein Verbundes-Unternehmen, Mention von `niccaswilliams.com` ist es.

**Worker- und Operator-CRUD** (folgt mit den Sprint-2-Worker-Implementationen):
- Workers: nur lesen via `classifyXxx()`-Methoden des Service.
- Operator-CRUD-Endpoints (POST/PATCH/DELETE `/admin/infrastructure-providers`): lazy implementieren wenn der erste Provider-Edit zur Laufzeit nötig wird. Aktuell bearbeitet man die Liste via Edit `provider.seed.ts` + `pnpm run db:seed` (idempotenter upsert).

**Bewusst NICHT abgedeckt**:
- IPv6-CIDR-Match (Free-Tier-Quellen sind primär IPv4).
- Reverse-Lookup "welche Domains laufen auf Provider X?" (das ist die *umgekehrte* Frage — nutzt unsere eigene `secu_html_pivots` + `secu_dns_ns_pivots`, nicht die Provider-Registry).
- Per-Engagement-Override (Operator kann pro Engagement keinen Provider sperren). Wenn jemals nötig: zusätzliche Tabelle `secu_engagement_provider_overrides` mit `(engagementId, providerKey, action: 'force_owner'|'force_infra')`.

---

## 3. OSINT-Mechanik-Katalog

### 3.1 Domain → Owner identifizieren

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 1 | **WHOIS / RDAP** Owner-Email + Adresse + Registrar | RDAP-Endpoint via IANA-Bootstrap-Registry; DENIC-Web-Form-Fallback für `.de` | `[free]` `[scope:passive_only]` | offen |
| 2 | **Impressum-Crawler** — DE TMG §5 Pflichtdaten | GET `/impressum /imprint /legal /legal-notice /kontakt /contact /about /datenschutz /privacy /datenschutzerklaerung` | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 3 | **Datenschutzerklärung-Parser** — Verantwortlicher + DSB | aus Impressum-Crawl-Bundle, separater NER-Pass | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 4 | **CT-Email-Mining** (existiert) — RFC822-SANs aus Zertifikaten | crt.sh | `[free]` `[scope:passive_only]` | ✅ |
| 5 | **CT-Domain-Mining** — DNS-SANs aus Zertifikaten als Cross-Domain-Signal | crt.sh | `[free]` `[scope:passive_only]` | offen |
| 6 | **SSL-Subject-Inferenz** — CN/O/L/C aus aktuellem TLS-Cert | TLS-Handshake (haben wir teilweise) | `[free]` `[scope:passive_only]` | erweitern |
| 7 | **MX-Tenant-Inferenz** — Mail-Provider klassifizieren | DNS-MX | `[free]` `[scope:passive_only]` | offen |
| 8 | **Microsoft-Tenant-Resolution** — `login.microsoftonline.com/<domain>/.well-known/openid-configuration` | MS-Endpoint | `[free]` `[scope:passive_only]` | offen |
| 9 | **Google-Workspace-Detection** — SPF-Include `_spf.google.com` + MX `aspmx.l.google.com` | DNS | `[free]` `[scope:passive_only]` | offen |
| 10 | **DNS-TXT-Verifications-Pivot** — `google-site-verification`, `apple-domain-verification`, `MS=ms\d+`, `atlassian-domain-verification`, `facebook-domain-verification` | DNS TXT | `[free]` `[scope:passive_only]` | offen |
| 11 | **DKIM-Selector-Discovery** — default Selektoren je Provider (`google._domainkey`, `selector1._domainkey`, `mailo._domainkey`...) | DNS | `[free]` `[scope:passive_only]` | offen |
| 11a | **DMARC-rua/ruf-Email-Extract** — `_dmarc.<domain>` TXT enthält oft `rua=mailto:<owner-email>` und `ruf=mailto:<owner-email>` für Aggregate-Reports. Live-Test fand support@orvello.de allein hierüber. | DNS TXT | `[free]` `[scope:passive_only]` `[organic]` | **kritisch, hohe Priorität** — Erweiterung von `dns_records.worker` |
| 11b | **Cloudflare-Email-Obfuscation-Decoder** — Cloudflare wandelt jeden `<a href="mailto:...">` auf Sites mit aktivem CF-Email-Protect in `<a data-cfemail="HEX">[email&#160;protected]</a>`. XOR-Decoder mit Key=byte0 dekodiert in 5 Zeilen. Live-Test fand support@orvello.de hier 6× verschlüsselt | HTML-Body NER | `[free]` `[scope:passive_only]` `[organic]` | **Pflicht-Capability für jeden HTML-Crawler**, eigenes Util `cf-email-decode.ts` |
| 11c | **Impressum-Text-Cross-Domain-NER** — Impressum-Texte enthalten oft Klartext-Mentions verbundener Domains/Marken ("digitale Dienste von Orvello", "vertreten durch X für Marke Y"). Regex `[a-z0-9-]+\.[a-z]{2,}` + Capitalized-Noun-Phrases mit Rechtsform-Suffix (`GmbH`, `UG`, `e.K.`) | Impressum-Body NER | `[free]` `[de-spezial]` `[scope:passive_only]` `[organic]` | **kritisch** — Cross-Domain-Pivot direkt im Klartext |
| 11d | **Impressum-Compliance-Audit** — DDG/TMG §5 verlangt: Name + Anschrift + Kontakt-Email + Telefon + (bei Gewerbe) HRB/USt-IdNr. Lücken sind Customer-Finding (`compliance_imprint`-Kategorie). Live-Test orv hatte leere Telefon → §5-Verstoß | Impressum-Parse + Pflichtfeld-Check | `[free]` `[de-spezial]` `[scope:passive_only]` `[organic]` | neu, eigene Finding-Kategorie |

**Kommentar zu DNS-TXT-Verifications**: Diese Strings sind global-eindeutig pro Konto. Wenn `acme.de` den TXT `MS=ms12345678` hat und `acmegroup.com` denselben — sicher gleicher Microsoft-Tenant. Reverse-Suche dieser Strings ist über HackerTarget DNS-Lookup limitiert kostenlos, oder in unserer eigenen Datenbank als wir sie über mehrere Engagements hinweg sammeln. **DIY-Replacement-Idee**: bauen wir uns selbst eine Verifikations-String-Datenbank auf (siehe Sektion 4.1).

**Kommentar zu Cloudflare-NS-Pair (aus Live-Test)**: Cloudflare vergibt jedem Account ein eindeutiges Nameserver-Pair (`<adjective>.ns.cloudflare.com`-Form, z.B. `leonidas.ns + teagan.ns`). Alle Domains mit identischem Pair gehören demselben CF-Account. Im Live-Test waren alle 3 Operator-Domains am Pair `leonidas + teagan` erkennbar. **Kein Reverse-Lookup-Service kostenlos verfügbar** (Cloudflare gibt das nicht raus), aber unsere eigene Pivot-DB kann das über mehrere Engagements hinweg sammeln (`secu_dns_ns_pivots`). Schema analog zu 4.1, `id_type='cloudflare_ns_pair'`. Confidence des Pivots: 0.9 (CF garantiert NS-Pair-Eindeutigkeit pro Account).

### 3.2 Domain ↔ Domain Cross-Pivots

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 12 | **Google-Analytics-ID-Match** (`UA-`, `G-`) im HTML | HTML-Body | `[free]` `[scope:passive_only]` `[diy-replacement]` | offen |
| 13 | **GTM-, AdSense-, Facebook-Pixel-, reCAPTCHA-Site-Key-Match** | HTML-Body | `[free]` `[scope:passive_only]` `[diy-replacement]` | offen |
| 14 | **Sentry-DSN, Stripe-pk, Mapbox-Token, Plausible/Matomo-URL, Mailchimp-List-ID, Calendly/Cal.com-URL** | HTML-Body + JS-Bundle-Inspect | `[free]` `[scope:passive_only]` `[diy-replacement]` | offen |
| 15 | **Favicon-Hash** (mmh3) — Cluster-Bildung | direkter GET `/favicon.ico` + mmh3 | `[free]` `[scope:passive_only]` | offen |
| 16 | **JS-Bundle-Hash + Webpack-Chunk-Pattern** — eindeutig bei Custom-Apps | HTML + Asset-Fetch | `[free]` `[scope:passive_only]` | offen |
| 16a | **Next.js Webpack-Chunk-Hash-Match** — `_next/static/chunks/<16hex>.{js,css}`-Hashes sind deterministische Outputs vom Custom-Build. Live-Test fand 8 gemeinsame Chunks zwischen orv und nw → quasi sicher dieselbe Codebase. Im Gegensatz zu Tracking-IDs (kann man bewusst kopieren) zeigt Chunk-Match nur identische Builds | HTML-Body Regex `_next/static/chunks/[a-f0-9]{16}\.(?:js\|css)` | `[free]` `[scope:passive_only]` `[organic]` `[diy-replacement]` | **stärkstes Cross-Domain-Signal bei Custom-Apps**, eigene `id_type='next_chunk_hash'` in `secu_html_pivots` |
| 16b | **Vite/Astro/SvelteKit Asset-Hash-Match** — analog zu Next-Chunks für andere Build-Tools (`/_app/immutable/chunks/<hash>.js` für SvelteKit, `/assets/<name>-<hash>.js` für Vite) | HTML-Body Regex je Framework | `[free]` `[scope:passive_only]` `[organic]` | offen, niedriger als Next |
| 16c | **Custom-Error-Page-Match** — viele Apps haben Custom-404 mit eindeutiger Branding-Phrase ("Oops, das hier gibt's nicht!"). Cross-Domain dieselbe Phrase = wahrscheinlich gleiche Codebase | HTTP `/<random-uuid>` → 404-Body | `[free]` `[scope:passive_only]` | offen |
| 17 | **Footer-Copyright-Match** — "© Acme GmbH" als Cross-Domain-Indikator | HTML-Body | `[free]` `[scope:passive_only]` | offen |
| 18 | **Cert-SAN-Sharing** — eine Cert für `acme.de` + `acmesoft.com` | crt.sh | `[free]` `[scope:passive_only]` | offen |
| 19 | **Reverse-IP-Lookup** — alle Hosts auf gleicher IP (schwach bei Shared-Hosting) | HackerTarget free-tier (50 req/day) oder Common Crawl | `[free]` `[scope:passive_only]` | offen |
| 20 | **Wayback-Machine** — alte CNAME, gelöschte Impressen, frühere Mitarbeiter-Listen | archive.org-API | `[free]` `[scope:passive_only]` | offen |
| 21 | **Common-Crawl Domain-Mention** — String-Match auf Cross-References im offenen Web | CC-Index | `[free]` `[self-host]` `[scope:passive_only]` | offen, anspruchsvoll |
| 22 | **Reverse-DNS / PTR auf Subnetz** — bei Dedicated-Hosting starkes Signal | DNS | `[free]` `[scope:passive_only]` | offen |

### 3.3 Person/Email/Username Enrichment

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 23 | Holehe-Style — Email auf 100+ Plattformen geprüft | Provider-Endpoints | `[free]` `[self-host]` `[scope:passive_only]` | ✅ (begrenzt — ausbauen auf 100+) |
| 24 | HIBP — Breach-Check | HIBP-API (free für Domain-Search, paid für Single-Email) | `[free]` (Domain-Search) `[scope:passive_only]` | ✅ teilweise |
| 25 | Sherlock-Style — Username auf 30+ Plattformen | Provider-Endpoints | `[free]` `[self-host]` `[scope:passive_only]` | ✅ (ausbauen auf 100+) |
| 26 | Gravatar | gravatar.com | `[free]` `[scope:passive_only]` | ✅ |
| 27 | GitHub Commit-Search per Email | GitHub-API | `[free]` (mit PAT) `[scope:passive_only]` | ✅ |
| 28 | GitHub Code-Search — `"@<domain>" path:.env` etc. | GitHub-API | `[free]` (mit PAT) `[scope:passive_only]` | offen |
| 29 | GitHub User-Profile-Discovery per Display-Name | GitHub-API search | `[free]` `[scope:passive_only]` `[hint-aware]` | offen |
| 29a | **GitHub-User-by-Domain-Brand** — `q=<sld-of-domain>` + Variants (CamelCase, lowercase, dashes). Live-Test: `q=niccaswilliams` → `niccasWilliams`-Treffer trotz leerem Profil. Brandkonsistenz Domain↔Username ist Standard bei Solo-Operatoren | GitHub-User-API search | `[free]` `[scope:passive_only]` `[organic]` | **organische Heuristik, hohe Priorität** |
| 29b | **GitHub-Repo-Public-Discovery** — wenn User gefunden, listet `/users/<u>/repos` öffentliche Repos mit Sprache/Description/Push-Date. Live-Test: niccasWilliams hatte `node-secu` + `niccasWilliams`-Repos | GitHub-API | `[free]` `[scope:passive_only]` `[organic]` | offen |
| 29c | **GitHub-Public-Events Commit-Author-Email-Mining** — `/users/<u>/events/public` zeigt Push-Events; jeder Commit hat `author.email`. Auch wenn Profil-Email leer, leakt commit-author-email oft die Privatemail (`12345+username@users.noreply.github.com` oder direkt `name@gmail.com`) | GitHub-API | `[free]` `[scope:passive_only]` `[organic]` | **wichtig** — leakt oft Privatemails |
| 30 | **LinkedIn Public-Snippet** — Search-Engine-Suche `site:linkedin.com/in "<name>" "<firma>"` | Search-Engine (SearXNG self-hosted) | `[free]` `[self-host]` `[scope:passive_only]` `[hint-aware]` | offen |
| 31 | **XING Public-Snippet** — Search-Engine, DACH-fokussiert | Search-Engine | `[free]` `[self-host]` `[de-spezial]` `[scope:passive_only]` `[hint-aware]` | offen |
| 32 | **npm/PyPI/Maven/RubyGems/crates.io Author-Suche** per Email + Name | Registry-APIs (alle free) | `[free]` `[scope:passive_only]` | offen |
| 33 | **Docker Hub User-Lookup** | Docker-Hub-API | `[free]` `[scope:passive_only]` | offen |
| 34 | **Keybase User-Lookup** | keybase.io API | `[free]` `[scope:passive_only]` | offen |
| 35 | **Mastodon Webfinger** + Profile-Inspection | beliebige Mastodon-Instanz | `[free]` `[scope:passive_only]` | offen |
| 36 | **Bluesky DID-Resolution** | `*.bsky.social` Public-API | `[free]` `[scope:passive_only]` | offen |
| 37 | **Hacker News User** | hn.algolia.com | `[free]` `[scope:passive_only]` | offen |
| 38 | **Reddit User** | reddit-public-API | `[free]` `[scope:passive_only]` | offen |
| 39 | **DEV.to / Hashnode / Medium / Substack Public-Profile** | Public-API/Page | `[free]` `[scope:passive_only]` | offen |
| 39a | **Soundcloud Public-Profile + Tracks** — Live-Test fand `soundcloud.com/geile-mukke` via Search-Engine. Brand-Match-Heuristik analog 29a | soundcloud.com/<slug> | `[free]` `[scope:passive_only]` `[organic]` | offen |
| 39b | **Instagram Public-Profile** (ohne Login: nur public-pages) — Live-Test fand `@geilemukkepicknick`. Brand-Match-Heuristik | instagram.com/<slug> | `[free]` `[scope:passive_only]` `[organic]` | offen, oft hinter Login |
| 39c | **Spotify / Apple-Podcasts / Bandcamp Public-Profile** — analog | Public-Pages | `[free]` `[scope:passive_only]` `[organic]` | offen, niedrige Priorität |
| 40 | **Speakerdeck / SlideShare / ResearchGate / ORCID / Google-Scholar** | Public-Search | `[free]` `[scope:passive_only]` | offen, Lower-Priority |
| 41 | **Email-Pattern-Generation** — aus Hint `ownerName + domain` → 8-12 plausible Emails als `speculative=true`-Entities | deterministic | `[free]` `[scope:passive_only]` `[hint-aware]` `[diy-replacement]` | offen, **hohe Priorität** |
| 42 | **Email-SMTP-Validation** — RCPT-TO-Probe ohne Send (passiv) | MX-Server | `[free]` `[scope:passive_only]` | offen |
| 43 | **Catch-All-Detection** — testen ob Domain alle Emails akzeptiert | MX-Server | `[free]` `[scope:passive_only]` | offen |
| 44 | **EXIF auf Profilbildern** — Kamera, Geo, manchmal Name | direkter Bilder-GET + exif-parse | `[free]` `[scope:passive_only]` | offen |
| 45 | **Reverse-Image-Search** — gleiche Profilbilder auf anderen Plattformen | TinEye API (limitiert kostenlos) ODER eigene Image-Hash-DB | `[free]` (limitiert) `[diy-replacement]` `[scope:passive_only]` | offen |

### 3.4 Person → Firma → Mehr Domains (DE-Spezial)

**Das ist die kritische Lücke für DE-B2B-Customer.** Heute komplett offen.

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 46 | **Handelsregister-Suche** per Name oder Firma | handelsregister.de (seit Aug 2022 frei zugänglich, web-scrape mit rate-limit) | `[free]` `[de-spezial]` `[scope:passive_only]` `[hint-aware]` | offen, **höchste Priorität** |
| 47 | **Unternehmensregister.de** — Backup für HR | unternehmensregister.de | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 48 | **Bundesanzeiger Jahresabschluss-Lookup** — Mitarbeiterzahlen + Geschäftsführer-Vergütung | bundesanzeiger.de | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 49 | **OpenCorporates** — Cross-Border-Beziehungen, hat DE-Coverage | opencorporates.com (free-tier ~500/Monat) | `[free]` `[scope:passive_only]` | offen |
| 50 | **Wikidata SPARQL** — Key-Person → Firma, Firma → Schwesterfirmen | query.wikidata.org | `[free]` `[scope:passive_only]` | offen |
| 51 | **Pressemitteilungen-Aggregator** — presseportal.de, openpr.de, pressrelations.de | RSS + HTML-Parse | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 52 | **Job-Posting-Crawler** — StepStone, Indeed, LinkedIn-Jobs (über Search-Engine) | Search-Engine-Snippets | `[free]` `[de-spezial]` `[scope:passive_only]` `[hint-aware]` | offen |
| 53 | **Branchenbuch-Lookup** — dasoertliche.de, gelbeseiten.de, 11880.com | Public-Web | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 54 | **Search-Engine-Recon** — `"<domain>"`, `"@<domain>"`, `site:linkedin.com "<firma>"`, `"<owner-name>"` | SearXNG (self-hosted) ODER Brave-Search-API (free-tier 2000/Monat) | `[free]` `[self-host]` `[scope:passive_only]` `[hint-aware]` | offen, **hohe Priorität** |

### 3.5 Code-/Repo-basierte Discovery

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 55 | GitHub Code-Search — Domain-spezifische Strings (Hostnames, Slugs) | GitHub-API | `[free]` `[scope:passive_only]` | offen |
| 56 | GitHub Public-Org-Discovery — Org-Member finden | GitHub-API | `[free]` `[scope:passive_only]` `[hint-aware]` | offen |
| 57 | GitLab Public Code-Search | gitlab.com API | `[free]` `[scope:passive_only]` | offen |
| 58 | Bitbucket Public-Search | bitbucket.org | `[free]` `[scope:passive_only]` | offen |

### 3.6 Phone-Enrichment

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 59 | libphonenumber-Normalisierung (existiert) | local | `[free]` | ✅ |
| 60 | **Reverse-Lookup DE** — dasoertliche.de, klicktel.de, telefonbuch.de | Public-Web | `[free]` `[de-spezial]` `[scope:passive_only]` | offen |
| 61 | **WhatsApp-Business-Existenz** (passive — public business directory) | wa.me/<phone> nur als Existenz-Check | `[free]` `[scope:passive_only]` | offen, datenschutz-grenzwertig |

### 3.7 Document-/Leak-Quellen (frei)

| # | Mechanik | Quelle | Tags | Status |
|---|---|---|---|---|
| 62 | **Pastebin/Ghostbin via Search-Engine** — `site:pastebin.com "<domain>"` | Search-Engine | `[free]` `[scope:passive_only]` | offen |
| 63 | **LeakIX free-tier** — passive-scan-Index | leakix.net API (free 100/Tag) | `[free]` `[scope:passive_only]` | offen |
| 64 | **Wayback Machine** — historische Snapshots gelöschter Mitarbeiter-Seiten | archive.org | `[free]` `[scope:passive_only]` | offen |
| 65 | **GitHub Secret-Scan** (existiert) — Secrets in öffentlichen Repos der Person | GitHub-API | `[free]` `[scope:passive_only]` | ✅ |
| 66 | **HIBP Breach-Check** (existiert teilweise) — domain-search free, single-email paid | HIBP | `[free]` (domain) `[scope:passive_only]` | ✅ teilweise |

### 3.8 Worker-Robustness (gelernt aus Live-Test 1.5)

Diese Anforderungen gelten als **Querschnitts-Verträge** für JEDEN Worker, nicht als einzelne Mechanik. Wenn ein Worker sie ignoriert, produziert er silent-failures bzw. False-Positives — der Customer-Report wird unzuverlässig.

| # | Anforderung | Begründung (Live-Test) | Implementation |
|---|---|---|---|
| R1 | **Browser-User-Agent + UA-Rotation** für jeden HTTP-Crawl | Cloudflare-WAF blockt Default-UAs (orv → 403, mit Mozilla → 200) | `src/lib/security/osint/http-fetch.ts` mit UA-Pool + Retry, alle HTTP-Worker konsumieren es |
| R2 | **Multi-Source-Fallback** für 3rd-party-APIs (CT, Wayback, RDAP, Search-Engine) | crt.sh war 3/3 Mal down; Wayback 1/3 timeout | Pro Quellen-Klasse: `tryAll([source1, source2, source3], untilFirstSuccess)`. Failure-State pro Source persistieren in `secu_provider_state` (existiert bereits) |
| R3 | **Live-Verify-After-3rd-Party-Discovery** — DNS-Resolve, HTTP-200-Probe, oder Cert-Validity-Check | HackerTarget zeigte 3/5 stale Subdomains. Direkt-Persistierung würde Engagement-Graph mit Karteileichen füllen | Subdomain-/Domain-Worker: nach jeder 3rd-party-Discovery `dns-verify.ts` → wenn fail: persistiere mit `entity.data.staleSince=<ts>`, nicht als alive-Entity |
| R4 | **Hosting-Provider-Klassifikation vor Reverse-IP-Pivot** | Reverse-IP auf CF/Railway/Vercel-Shared = hunderte unrelated Domains, Pivot-Müll | `hosting-classifier.ts` mit ASN+CIDR-Liste (Cloudflare 104.16/12+172.64/13+162.158/15+131.0.72/22, Railway 66.33.22/24, Vercel 76.76.21/24, Render 35.227.0/16+216.24.57/24, AWS-CF mehrere). Nur bei `dedicated_hosting=true` Reverse-IP weiterverwenden |
| R5 | **Cert-Subject-Validity-Gate** — TLS-Cert-Inferenz nur wenn `CN==domain ∨ domain∈SAN`, sonst als `platform_default_cert` markieren, nicht als Owner-Signal | gm.de Cert war `*.up.railway.app`, nicht owner-spezifisch. Naive Inferenz hätte "Railway" als Owner notiert | `tls-cert.worker.ts` erweitern um Validity-Gate |
| R6 | **Cloudflare-Email-Decoder als HTML-Standard-Pass** — JEDER HTML-crawlende Worker führt CF-Decode auf `data-cfemail` und `/cdn-cgi/l/email-protection#`-Refs aus | orv-Impressum: 6× CF-encoded, ohne Decoder = 0 Emails | Shared-Util `cf-email-decode.ts`, in HTML-Worker-Base-Class einsetzen |
| R7 | **Stale-Detection für Cache-3rd-Parties** — HackerTarget, Common-Crawl, BuiltWith liefern historische Records die nicht mehr leben | siehe R3 | `entity.data.firstSeenSource: 'hackertarget'`, `entity.data.lastVerifiedAt`, Re-Verify nach 7 Tagen |
| R8 | **Search-Engine-Confidence-by-Context-Tokens** — pro Search-Hit zähle wie viele Hint-Tokens (Mainz, Mukke, Domain) im Snippet matchen, confidence ∝ Match-Count | "Niclas Pilz" allein → Fußballer als FP. "Niclas Pilz Mainz Mukke" → echter Treffer | `search_engine_recon`: `contextTokens: string[]`, `confidence = matchCount / tokenCount` |
| R9 | **Provenance-Class-Tagging** — jeder Evidence-Eintrag MUSS `evidenceClass: 'organic' \| 'hint_seeded'` setzen, default `organic`, Hint-konsumierende Worker `hint_seeded` mit `hintRefs[]` | siehe Sektion 2.7 | Worker-Result-Type erweitern in `worker.types.ts` |
| R10 | **Subdomain-Aggregator-Pattern** — kein Single-Source-Reliance, immer 5 Quellen (DNS-BF, HackerTarget, CT-Multi, Wayback, TLS-SAN) merge + dedup + verify | keine Quelle alleine vollständig (Live-Test) | Refactor `subdomain_passive.worker.ts` zu Multi-Source-Aggregator |

---

## 4. DIY-Replacements für kommerzielle APIs

Wir verzichten bewusst auf Hunter.io / Apollo / northdata / IntelX — und bauen ihre Funktionen aus den Bausteinen oben selbst. Das geht **nie** so umfassend wie kommerziell, aber für DE-B2B-Customer reicht es.

### 4.1 Eigene Tracking-ID-Pivot-Datenbank (statt BuiltWith / PublicWWW)

**Problem**: BuiltWith/PublicWWW indexieren das offene Web und erlauben "find me all sites with GA-ID UA-12345". Kostenpflichtig.

**DIY**: jeder unserer Worker, der HTML-Body crawlt, extrahiert ALLE Tracking-IDs (GA, GTM, AdSense, FB-Pixel, Sentry-DSN, Stripe-pk, Mapbox-Token, reCAPTCHA-Site-Key, Plausible-URL, Mailchimp-List-ID, etc.) und persistiert sie in `secu_html_pivots` mit `(domain, idType, idValue, foundAt)`. Über alle Engagements hinweg sammelt sich so ein eigener Pivot-Index.

**Schema-Skizze**:
```sql
CREATE TABLE secu_html_pivots (
  id BIGSERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  id_type VARCHAR(64) NOT NULL,    -- 'ga_ua', 'ga_g4', 'gtm', 'adsense', 'fb_pixel', ...
  id_value VARCHAR(255) NOT NULL,
  found_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_engagement_id INTEGER REFERENCES secu_engagements(id),
  UNIQUE (domain, id_type, id_value)
);
CREATE INDEX ON secu_html_pivots (id_type, id_value);
```

**Lookup**: ein neuer Worker `cross_domain_pivot_lookup` fragt: "Welche anderen Domains haben dieselbe GA-ID gesehen?" und liefert Cross-Domain-Hypothesen.

**Ramp-up**: anfangs leer → nach 50-100 Engagements eine sinnvolle Datenbasis. Self-fulfilling growth.

### 4.2 Eigene DNS-TXT-Verification-Pivot-Datenbank (statt SecurityTrails)

Gleiches Prinzip wie 4.1, aber auf TXT-Verifications.

**Schema**: `secu_dns_verification_pivots (domain, txt_string, prefix, found_at)`. Prefixe: `MS=ms`, `google-site-verification=`, `atlassian-domain-verification=`, `apple-domain-verification=`, `facebook-domain-verification=`, `_acme-challenge`, etc.

**Use-Case**: zwei Domains mit `MS=ms12345` → derselbe Microsoft-Tenant → wahrscheinlich derselbe Customer.

### 4.3 Eigener Mitarbeiter-Email-Discovery-Stack (statt Hunter.io)

Hunter.io's Kern-Trick: aus Domain → Liste von Emails mit Personen-Namen. Sie scrapen das offene Web + lizenzieren B2B-Datenbanken. Wir bauen das Open-Source-Approximate:

**Pipeline pro Customer-Domain**:
1. **Impressum-Crawl** + **Datenschutz-Crawl** → 1-3 verifizierte Emails (TMG-Pflicht).
2. **CT-Email-Mining** (existiert) → SAN-Emails aus Zertifikaten.
3. **GitHub Personnel-Search** (existiert) → Commit-Authors mit `@<domain>`-Email.
4. **Search-Engine `"@<domain>"`** → Snippet-Mining für weitere Emails.
5. **LinkedIn/XING Public-Snippets** mit Hint `ownerCompanies` → Mitarbeiter-Display-Names.
6. **Email-Pattern-Inference** (existiert) → aus 2-3 Sample-Emails Pattern lernen (`firstname.lastname@`, `flastname@`, ...).
7. **Email-Pattern-Generation** → für jeden gefundenen Display-Name aus Schritt 5 das Pattern aus Schritt 6 anwenden → speculative-Email-Entities.
8. **HIBP Breach-Check** auf alle (verifiziert + speculative) Emails.
9. **Email-SMTP-Validation** (RCPT-TO) auf speculative-Emails → hochzonen wenn Server "user exists" sagt.

**Output**: Liste von 5-30 verifizierten + speculative Mitarbeiter-Emails pro Domain. Customer-Report-Block: "OSINT — Identifizierte Mitarbeiter und potentielle Email-Vektoren".

### 4.4 Eigener Personen→Firmen-Beziehungs-Graph (statt northdata)

northdata's Kern-Trick: Person X → in welchen anderen Firmen sitzt sie?

**DIY**: kombiniere Handelsregister + Wikidata + GitHub-Org-Memberships + Pressemitteilungen.

- Handelsregister-Suche per Name → alle Einträge wo X als Geschäftsführer/Prokurist genannt ist → Firmen-Liste.
- Wikidata: `SELECT ?company WHERE { ?company wdt:P488 ?person . ?person rdfs:label "Niclas Pilz"@de . }` (P488 = Vorsitzender).
- GitHub-Org-Memberships von Username X.
- Search-Engine Snippet-Mining `"<name>" Geschäftsführer OR CEO OR Vorstand`.

Aggregation in `secu_person_company_links (personId, companyName, role, source, confidence)`.

### 4.5 Eigener Email-Verifier (statt verifyemailaddress.com / mailerlite)

SMTP-RCPT-TO-Probe + Catch-All-Detection.

**Pipeline**:
1. DNS MX-Lookup.
2. TCP-Connect Port 25 zum MX.
3. EHLO → MAIL FROM <leerer-rückläufer> → RCPT TO `<email>`.
4. Lese Server-Antwort: `250` = wahrscheinlich existent, `550` = nicht existent, `4xx` = greylisting.
5. Catch-All-Detection: zusätzliches RCPT auf `<random-string>@<domain>`. Wenn auch `250` → Catch-All, alle "exists"-Antworten unzuverlässig.

**Caveat**: einige Provider (Outlook, Gmail) blockieren RCPT-Probes oder rate-limiten. Microsoft-Tenants oft 250-für-alles. Heuristik: Provider-Klassifikation aus 4.6 lookup + Confidence-Anpassung.

### 4.6 Eigener Image-Hash-Index (statt TinEye)

pHash + dHash über alle gecrawlten Profilbilder. Cross-Engagement-Suche: "ist dieses Profilbild schonmal aufgetaucht?"

**Schema**: `secu_image_hashes (sha256, phash, dhash, source_url, source_entity_id, found_at)`.

Index auf phash für approximate-match (Hamming-Distance < 10).

### 4.7 Multi-Source-CT-Log-Aggregator (statt nur crt.sh)

**Problem**: crt.sh ist die einzige CT-Quelle in Worker `domain_ct_email_mining`. Live-Test: 3/3 Requests timeout. Single-Source = Single-Point-of-Failure.

**DIY-Multi-Source-Pipeline**:

| Quelle | Endpoint | Free-Tier | Output |
|---|---|---|---|
| crt.sh | `https://crt.sh/?q=<domain>&output=json` | unlimited (oft down) | full SAN-Liste, Email-SANs, Issuer |
| certspotter (sslmate) | `https://api.certspotter.com/v1/issuances?domain=<domain>&include_subdomains=true&expand=dns_names` | 100 req/h | DNS-Names, Issuer |
| Censys Search | `https://search.censys.io/api/v2/certificates/search?q=<domain>` | 250 queries/Monat free | DNS-Names, Issuer, IPs |
| Google CT (Argon/Xenon) | direkt CT-Log-Server-API | rate-limited aber ohne Auth | RFC6962 raw |
| Cloudflare-Radar-API | `https://api.cloudflare.com/client/v4/radar/...` | mit free-Account | aggregierte Cert-Sichtungen |

**Logik**:
1. Round-Robin-Try aller 5 Quellen mit Timeout-pro-Source
2. Erste erfolgreiche Antwort wird als Primärquelle persistiert mit `source: 'certspotter'` etc.
3. Wenn 2 Quellen Daten liefern: merge + dedup, höhere Confidence (Cross-Source-Match)
4. Wenn alle 5 fehlschlagen: Worker `success=false`, `error=ct_all_sources_down`, retry-after 6h

**Persistierung**: `secu_ct_observations (domain, dns_name, issuer, source_array, first_seen, last_seen)`. Cross-Source-Tracking erlaubt: "alle DNS-Names für `acme.de` aus Cert-Daten" als ein konsolidiertes Set.

### 4.8 Eigener Hosting-Provider-Klassifikator (statt BuiltWith Hosting-Detection)

**Problem (aus Live-Test L5)**: Reverse-IP-Pivot ist bei Shared-Hosting wertlos. Wir brauchen Wissen "ist diese IP eine Shared-Cloud-IP oder Dedicated?".

**DIY**: Hardcoded ASN+CIDR-Liste der bekannten Cloud-Provider plus Heuristik aus PTR-Pattern.

**Schema** (Code, kein DB):
```typescript
const SHARED_HOSTING_RANGES = {
  cloudflare: ['104.16.0.0/12', '172.64.0.0/13', '162.158.0.0/15', '131.0.72.0/22'],
  railway: ['66.33.22.0/24'],
  vercel: ['76.76.21.0/24', '76.76.16.0/20'],
  render: ['35.227.0.0/16', '216.24.57.0/24'],
  netlify: ['52.84.0.0/15'],
  github_pages: ['185.199.108.0/22'],
  fly_io: ['66.241.124.0/24'],
  // ... extend
};
const PTR_PATTERNS = [
  /\.amazonaws\.com$/, /\.cloudfront\.net$/, /\.s3\..*\.amazonaws\.com$/,
  /\.googleusercontent\.com$/, /\.azurewebsites\.net$/, /\.fly\.dev$/,
];
function classify(ip): { provider, isShared } { ... }
```

**Verwendung**:
- `subdomain_passive` und `dns_records.worker` rufen Classifier auf, persistieren `entity.data.hostingProvider`
- Reverse-IP-Pivot-Worker nur ausführen wenn `isShared=false`
- TLS-Cert-Inferenz und HTML-Tracking-Pivots werden gar nicht von Hosting-Erkennung beeinflusst (laufen weiter)

**Maintenance**: Liste lebt im Code, jedes Quartal Review (neue Cloud-Provider tauchen auf, IP-Bereiche ändern sich). Optional: Cron-Job der ASN-Daten von BGPView (kostenlos) abholt und Liste aktuell hält.

---

## 5. Darkweb-Leak-Engine (Future, eigene Phase)

> **Status**: future. Eigene Phase nach OSINT-Engine-Stabilisierung. Soll **dauerhaft laufen**, nicht engagement-getriggert.

### 5.1 Mission

Customer übergibt uns Domain + Personen + Emails (oder wir haben sie aus OSINT). Engine **monitored kontinuierlich** Darkweb-Quellen und alarmiert (via boss-Telegram), sobald eine der überwachten Identitäten in einem neuen Leak auftaucht. Kunde wird proaktiv gewarnt, oft Tage bis Wochen vor öffentlichen Breach-Reports.

### 5.2 Quellen-Stack (legal nutzbar)

| # | Quelle | Zugang | Frequenz | Caveat |
|---|---|---|---|---|
| D1 | **HIBP Domain-Watch** | API mit Verifikations-DNS-TXT, kostenlos | sofort bei neuem Breach | nur Customer-Domains, nicht Personen-Emails |
| D2 | **DeHashed Search-API** | kostenpflichtig (~$5/Monat Free-Tier) | Polling | grenzwertig DSGVO, nur mit Auftrag |
| D3 | **IntelX Free-Tier** | API, 50 queries/day kostenlos | Polling | meist Indizien, kein Plaintext |
| D4 | **LeakIX-Stream** | API | Polling oder Webhook | mehr Infrastruktur-Leaks als Identitäts-Leaks |
| D5 | **Eigener Telegram-Channel-Watcher** | self-hosted, abonniert öffentliche Leak-Channels | Stream | rechtlich heikel, nur Public-Channels |
| D6 | **Eigener Pastebin-Watcher** | scrape-public-paste-feeds | Polling | viele False-Positives |
| D7 | **Eigener BreachForums-Replacement-Watcher** | manche Foren haben rss/web | Polling | nur Public-Threads, kein Login |
| D8 | **Common Crawl Periodic-Diff** | Diff über CC-Snapshots, finde neue Erwähnungen geschützer Strings | wöchentlich | Latenz |

### 5.3 Architektur-Skizze

```
Watch-Subjects (DB)             Watcher-Workers (Cron)         Alert-Pipeline
─────────────────               ───────────────────             ──────────────
domain: acme.de         ──┐     hibp_domain_watch       ──┐    boss-Telegram-Push
email: ceo@acme.de      ──┤  →  intelx_email_watch      ──┤ →  Customer-Email-Notify
username: acmeceo       ──┤     dehashed_email_watch    ──┤    Engagement-Finding-Create
phone: +49301234567     ──┘     pastebin_watch          ──┘    Audit-Log
                                leakix_stream
                                telegram_channel_watch
                                custom_paste_watch
```

**Tabellen**:
- `secu_watch_subjects (id, engagementId, kind, value, addedAt, expiresAt, status)`
- `secu_watch_hits (id, subjectId, source, leakName, occurredAt, severity, raw)`
- `secu_watch_runs (id, watcherKey, startedAt, finishedAt, subjectsScanned, hitsFound)`

**Cron**: alle 6h pro Watcher. Watch-Subjects werden via Engagement-Lifecycle automatisch eingetragen (Engagement→active = subscribe; Engagement→archived = unsubscribe nach 30d).

### 5.4 Was die Engine NICHT wird

- **Kein Aktiv-Login** in Foren/Marktplätze.
- **Kein Re-Distribution** von Plaintext-Dumps. Wir speichern nur "ist X in Leak Y betroffen", nicht den Leak selbst.
- **Kein Kauf von Combolists**. Wenn DeHashed-Lookup einen Hit liefert: speichern als Hash-Indikator + Source-Reference, nicht den Plaintext.
- **Keine engagement-übergreifenden Watches ohne explizite Customer-Genehmigung**.

### 5.5 Operative Voraussetzungen

- DSGVO-Auftragsverarbeitung mit Customer (separater Vertrag pro Watch-Subject).
- Boss-Push-Channel für High-Severity-Hits (Plaintext-Password-Leak einer Customer-Email).
- Audit-Log mit jedem Hit + jeder Customer-Notification.
- Soft-Delete-Mechanik mit 90-Tage-Retention.

---

## 6. Implementations-Reihenfolge (Sprint-Skizze)

> **Hinweis**: Sequenzierung priorisiert Customer-Wow-Faktor + Architektur-Foundation, nicht Worker-Anzahl.

### Sprint 1 — Foundation + Robustness-Utils (1-2 Wochen)

Ohne diese Bausteine machen die Workers darunter keinen Sinn. Reihenfolge erweitert um die R1-R10-Anforderungen aus 3.8:

1. ✅ **Hints-API + Schema** (Sektion 2.1, deployed 2026-05-08) — Tabelle `secu_engagement_hints` (pgEnum `secu_engagement_hint_slot` mit 8 Slots: `owner_name|owner_city|owner_company|owner_known_email|owner_known_username|owner_alt_domain|industry|free_text`). Service `src/lib/security/hints/hint.service.ts` mit `getBundle(engagementId)` als Worker-Konsum-API (gibt alle Hints gruppiert nach Slot zurück). Cross-Engagement-Schutz via `getInEngagement()`-Lookup vor PATCH/DELETE. Audit-Log auf jeder Mutation (`engagement.hint_create|update|delete`). Endpoints: `GET/POST /engagements/:id/hints` (POST nimmt `{items:[…]}` bulk, max 50), `PATCH/DELETE /engagements/:id/hints/:hintId`. Migration `drizzle/0005_complex_weapon_omega.sql`. Smoke-Tests durch.

   **Worker-Integration-Pflicht (für alle hint-aware Worker ab Sprint 2)**: Worker, die einen Hint genutzt haben, MÜSSEN die `id` des konsumierten Hints in `evidence[].hintRefs` aufnehmen — sonst ist die `evidenceClass=hint_seeded`-Klassifizierung aus §2.7 nicht haltbar. Doc-Hinweis steht im Service-File.
2. **Speculative-Entity-Erweiterung** (Sektion 2.2 + 2.7) — `entity.data.confidence/speculative/evidence/conflicts/evidenceClass/hintRefs`-Felder + Aggregations-Service `src/lib/security/entities/confidence.ts`. Provenance-Class als Pflichtfeld in `WorkerResult.evidence[]`.
3. **Pivot-Budget-Enforcement** (Sektion 2.4) — Counter im `playbook-runner` + Auto-Chain-Stop bei Überschreitung.
4. **Auto-Light-Scan-Mini-Playbook** (Sektion 2.3) — `osint_pivot_light` als neue Playbook-Definition, getriggert durch Cross-Domain-Discovery-Rules.
5. **Shared-Utils** (R1, R6 + Hosting-Klassifikator):
   - `src/lib/security/osint/http-fetch.ts` — UA-Rotation + Retry (R1)
   - `src/lib/security/osint/cf-email-decode.ts` — Cloudflare Email-XOR-Decoder (R6, L1)
   - `src/lib/security/osint/dns-verify.ts` — Live-DNS-Verify-Util (R3)
   - `src/lib/security/osint/hosting-classifier.ts` — ASN+CIDR-Klassifikator (R4, Sektion 4.8)
6. **`findingCategoryEnum.compliance_imprint`** als neue Kategorie in `individual-schema.ts` (L11)

### Sprint 1.7 — Infrastructure-Provider-Registry (✅ deployed 2026-05-08)

Eigener Block weil Architektur-Foundation, kein Worker-Item. Voraussetzung für jeden Cross-Domain-/Owner-Pivot in Sprint 2 — Worker müssen vor Pivot-Logik den Service konsultieren, sonst werden Cloudflare-NS, Railway-IPs, GTM-Assets als Owner-Hits fehlinterpretiert (siehe §2.8).

- Tabelle `secu_infrastructure_providers` + Enum `secu_infra_provider_category` + Entity-Kind `infrastructure_provider` (Migration `0006_friendly_doctor_strange.sql`)
- Service `src/lib/security/osint/infrastructure-providers/provider.service.ts` mit Multi-Match-Classifier (`classifyDomain/Host/Asn/Ipv4/NsHost/HtmlAssetHost/EmailDomain`) + In-Memory-Cache (5min TTL)
- Worker-Helper `classifyAndPersistIfInfra()` — persistiert `entity.kind='infrastructure_provider'` mit canonical `provider:<key>`, verlinkt automatisch ins Engagement (`role=context`)
- Seed `provider.seed.ts` mit **66 Providern** in 7 Kategorien (8 dns / 10 registrar / 12 hosting / 6 cdn / 10 email / 8 analytics / 12 social), idempotenter upsert
- Bootstrap-Cache-Prime in `bootstrap.ts`
- Smoke-Test 14/14 grün (Cloudflare-NS, Railway-IP, GTM-Asset, AS13335, github.io vs github.com, etc.)

### Sprint 2 — Domain → Owner (1-2 Wochen)

Direkter Customer-Wert: macht Domain-Engagements von 0-Funden zu substantiierten Owner-Reports. Reihenfolge berücksichtigt Live-Test-Lehren.

> **Querschnitts-Pflicht für jeden Sprint-2-Worker** (aus §2.8): Worker rufen vor Owner-/Cross-Domain-Pivot `infrastructureProviderService.classifyAndPersistIfInfra()` mit der passenden `kind` (`domain`/`ns_host`/`html_asset_host`/`email_domain`/`cidr`/`asn`). Bei `isInfra=true` wird der Pivot unterdrückt; das Provider-Entity ist Context-Info. Smoke-Test des Worker MUSS einen Cloudflare-NS- oder Railway-Domain-Fall einschließen.

7. **`domain_dns_meta_extract`** (Erweiterung von `dns_records.worker`) — DMARC-`rua`/`ruf`-Email-Extract (Mechanik #11a, L8) + DNS-Verifications-Pivot (#10) + Cloudflare-NS-Pair-Pivot. Eine Worker-Erweiterung, keine neue Datei. NS-Records gehen durch `classifyNsHost()`; MX-Records + SPF-Includes durch `classifyEmailDomain()`.
8. **`domain_whois_passive`** (Mechanik #1) — RDAP via IANA-Bootstrap, DENIC-Fallback für `.de`. Confidence 1.0 bei nicht-anonymisierten Records.
9. **`domain_impressum_extract`** (Mechaniken #2, #11b, #11c, #11d) — Crawl mit `http-fetch.ts` (R1), `cf-email-decode.ts` (R6) auf HTML-Body, NER für Person/Email/Phone/Address/HRB/USt-IdNr + Cross-Domain-Mentions (L12) + Compliance-Audit-Findings (L11).
10. **`domain_microsoft_tenant`** (Mechanik #8) — openid-config-Lookup, schreibt Tenant-ID + Tenant-Namespace in `entity.data`.
11. **`domain_html_pivots_extract`** (Mechaniken #12-16c, L7) — Tracking-IDs + Webpack-Chunk-Hashes + Vite-Asset-Hashes, persistiert in `secu_html_pivots` mit `id_type`. Cross-Domain-Lookup-Sub-Worker.
12. **Refactor `tls-cert.worker.ts`** (R5, L6) — Cert-Subject-Validity-Gate hinzufügen.
13. **Refactor `subdomain_passive.worker.ts`** (R2, R3, R10, L4, L9) — Multi-Source-Aggregator-Pattern: DNS-BF + HackerTarget + CT-Multi (4.7) + Wayback + TLS-SAN, alle live-verified. Stale-Records mit `lastVerifiedAt` markieren statt droppen.

### Sprint 3 — Search-Engine als First-Class-Quelle + GitHub-Brand-Discovery (1 Woche)

14. **SearXNG-Self-Hosting** als Docker-Compose-Service (Sektion 3.4 Mechanik #54) — *offen, Architektur-Entscheidung SearXNG vs Brave-Search-API steht aus*
15. **`search_engine_recon`-Worker** — generischer Search-Snippet-Mining-Worker, hint-aware, mit Confidence-by-Context-Tokens (R8, L10) — *offen, hängt an #14*
16. ✅ **`domain_github_brand`** (Mechanik #29a, L13, deployed 2026-05-08) — erster hint-aware Worker; konsumiert Hints (ownerNames/ownerCompanies/ownerKnownUsernames) und produziert Provenance-getrennte Evidence (organic vs hint_seeded). Util `osint/brand-variants.ts` als Foundation für künftige Brand-Discovery-Worker. **Live-Test gegen GitHub-API pending GH_TOKEN-Set in Server-Env.**
17. ✅ **`github_repos_public`** + ✅ **`github_events_public`** (Mechaniken #29b, #29c, deployed 2026-05-08) — Folge-Worker nach gefundenem GitHub-User. Repos-Worker patcht entity.data; Events-Worker leakt Privat-/Corporate-Emails aus Commit-Headern (3 Klassen: personal/corporate/github_noreply). Auto-Chain-Rule + Mini-Playbook `osint_github_account_recon` für Out-of-Band-Hits seeded, default disabled.
18. **LinkedIn/XING Public-Snippet-Worker** (Mechaniken #30, #31) — bauen auf `search_engine_recon` auf — *offen, hängt an #15*

### Sprint 4 — DE-Spezial (1-2 Wochen)

19. **`handelsregister_lookup`** (Mechanik #46) — höchste Priorität nach Hints-API
20. **`bundesanzeiger_lookup`** (Mechanik #48)
21. **`branchenbuch_lookup`** (Mechanik #53) — dasoertliche/gelbeseiten

### Sprint 5 — Cross-Domain-Pivot-Activation (1 Woche)

22. **Multi-Source-CT-Aggregator** (Sektion 4.7) — eigene `ct-multi-source.ts` ersetzt direkten crt.sh-Call
23. **`cross_domain_pivot_lookup`** — fragt eigene `secu_html_pivots` (inkl. webpack_chunk_hash) + `secu_dns_verification_pivots` + `secu_dns_ns_pivots` ab
24. **Auto-Chain-Rule** für Cross-Domain-Discovery → triggert `osint_pivot_light` aus 2.3
25. **Auto-Chain-Rule** `entity.created kind=asset_subdomain → service_classify` (L14)

### Sprint 6 — Email-Discovery-Vollausbau (DIY-Hunter, 1-2 Wochen)

26. **`email_pattern_generator`** (Mechanik #41) — hint-aware
27. **`email_smtp_validator`** (Mechanik #42, #43)
28. **Email-Discovery-Pipeline** als Master-Playbook das 4.3-Pipeline orchestriert

### Sprint 7 — Person-Multi-Plattform-Extension

29. Mechaniken #32-40 inkrementell (npm/PyPI/Docker, Keybase, Mastodon, Bluesky, HN, Reddit, DEV.to, Soundcloud/Instagram-Brand-Search aus #39a-c)

### Sprint 8 — Person → Firma → Mehr Domains

30. **`person_company_resolver`** kombiniert Handelsregister + Wikidata + Press + GitHub-Orgs (Sektion 4.4)

### Future Sprint — Darkweb-Engine (eigene Phase)

23. Sektion 5 komplett

---

## 7. Was die OSINT-Engine NICHT werden soll (Grenzen)

- **Kein Phishing-Generator**. Mitarbeiter-Email-Output speist Customer-Berichte und stack-aware Folge-Scans. Keine Email-Templates an entdeckte Personen.
- **Keine Massen-OSINT ohne Engagement**. Free-Public-Scan (Phase 8) blockiert Personen-Worker hard.
- **Kein Active-Login** auf entdeckten Accounts (Username-Validate prüft Existenz, nicht Login).
- **Keine kommerziellen Combolist-Käufe**. DeHashed-Hits werden referenziert, nie persistiert.
- **Kein Cross-Engagement-Stille-Konsolidierung**. Personen tauchen über `triggerCrossEngagementHit` auf, nicht via stille DB-Linkage.
- **Keine Browser-Automation gegen Search-Engines**. SearXNG-self-hosted ODER offizielle APIs (Brave, Bing). Kein Selenium gegen Google.
- **Keine LinkedIn/XING-Login-Scrapes**. Nur Public-Snippets via Search-Engine.
- **Keine Speicherung Plaintext-PII über 180d nach Engagement-Archivierung**.

---

## 8. Cross-Reference

- **`CLAUDE.md`** Sektion 2 — Authorization-Frame; alle OSINT-Worker laufen unter `passive_only`-Authorization.
- **`FULL_SCAN.md`** Phase 8 — Reporting-Layer konsumiert die OSINT-Outputs als eigenen Report-Block "Mitarbeiter-Identität & Email-Vektoren". Provenance-Klassen (siehe 2.7) erzeugen zwei Sub-Blocks im Report: "Organic OSINT — was jeder Angreifer findet" + "Researcher-Tiefe — was unser Analyst zusätzlich findet".
- **`SOCIAL_ENGINEERING.md`** — diese Datei ersetzt das Problem-Beschreibungs-Dokument; SOCIAL_ENGINEERING.md kann gelöscht werden, sobald Sprint 1+2 deployed sind. Live-Test 1.5 in dieser Datei ist die empirische Validierung der dort beschriebenen Lücken.
- **`.claude/scan-operations.md`** — operative Anleitung für neue OSINT-Worker (zu erweitern bei jedem Sprint-Abschluss). Live-Test 1.5 zeigt konkrete curl/dig/openssl-Befehle die in scan-operations.md als Manual-Recipes übernommen werden können.

---

**Pflege**: dieses Dokument ist die kanonische Source für OSINT-Roadmap. Jede neue Mechanik-Idee → hier eintragen mit Tags. Jeder Sprint-Abschluss → Status-Spalte aktualisieren. Wenn Mechanik dauerhaft veraltet → streichen, nicht silently lassen. Live-Test-Sektion 1.5 ist Snapshot-Daten und sollte nicht silently aktualisiert werden — neue Live-Tests bekommen eine neue Sektion 1.6, 1.7 etc., damit die Lerngeschichte nachvollziehbar bleibt.
