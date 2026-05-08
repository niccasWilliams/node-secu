# SOCIAL_ENGINEERING.md — OSINT-Layer ist zu dumm

> **Zweck**: präziser Problem-Report für eine **frische Session**. Lesbar standalone. Erklärt nur **was** das Problem ist und **warum** es eines ist — Lösungsdesign passiert in der nächsten Session zusammen mit dem User.
>
> **Vorausgesetzt gelesen**: `CLAUDE.md` (Mission + Scope), `.claude/scan-operations.md` (operative Befehle), `FULL_SCAN.md` (Roadmap Phase 5–8).
>
> **Stand**: 2026-05-08 nach dem geilemukke.de-Run. Alle Code-Fixes der heutigen Session sind eingespielt (Trust-Layer, Phase 5 tech_fingerprint, Worker-API, dangling_platform-Detection, rule-evaluator Engagement-Lookup-Fix).
>
> **Disclaimer**: Trotz Dateiname geht es **NICHT** um Social-Engineering im engeren Sinne (Phishing, Pretexting, manipulative Kommunikation an Menschen). Es geht um **OSINT-Recherche-Tiefe** — der Code soll Personen/Emails/Identitäten zu einer Domain rekonstruieren wie ein menschlicher Recherche-Analyst es täte, **als Input für einen Customer-Sicherheitsbericht**, nicht als Angriffsvektor.

---

## 1. Was die OSINT-Layer heute macht

13 OSINT-Worker (`src/lib/security/workers/passive/`), drei Auto-Chain-Rules:

| Worker | Was er tut | Quelle | Output |
|---|---|---|---|
| `domain_ct_email_mining` | crt.sh-Lookup, parst RFC822-Email-SANs aus Zertifikaten | crt.sh | `email_address`-Entities |
| `domain_github_personnel` | GitHub-API-Suche nach Commits mit `@<domain>`-Email | GitHub-API (Token nötig) | `person`-Entities + `email_address` |
| `email_dns_signals` | SPF/DMARC/MX-Lookup für Email-Domain | DNS | Findings (auth, leak) |
| `email_gravatar` | Gravatar-Hash + Profil-API | gravatar.com | `person`-Anreicherung |
| `email_github_commits` | GitHub-API: Commits dieser Email | GitHub-API | `username`-Entities |
| `github_secret_scan` | Sucht Secrets in öffentlichen Repos der Person | GitHub-API | Findings (leak) |
| `email_holehe_passive` | Holehe-Stil "diese Email ist auf Plattform X registriert" | Provider-Endpoints | `social_account`-Entities |
| `email_breach_check` | HIBP-API: ist diese Email in bekannten Breaches | HIBP | `entity.data.pwnedSources` |
| `email_pattern_inference` | aus Sample-Emails pattern (e.g. `firstname.lastname@…`) inferieren | bestehende emails | `entity.data.emailPattern` |
| `email_alias_correlate` | mehrere Emails einer Person zusammenfassen | bestehende emails | Relationships |
| `username_multiplatform` | Username auf 30+ Plattformen prüfen (sherlock-style) | Plattform-APIs | `social_account`-Entities |
| `phone_normalize` | Telefonnummer → E.164 | regex/libphonenumber | `entity.data.e164` |
| `social_account_validate` | Prüft ob ein social_account noch existiert | Provider | `entity.data.lastSeenAt` |

**Auto-Chain-Rules** (in `src/db/individual/individual-seed.ts`, idempotent in `bootstrap.ts`):
- Rule 4: `entity.created kind=email_address` → start `osint_email_passive` (6 Worker auf Email)
- Rule 5: `entity.created kind=username` → start `osint_username_passive` (2 Worker auf Username)
- Rule 6: `entity.created kind=asset_domain` → start `osint_organization_recon` — **DISABLED** (würde rekursiv feuern; statt dessen direkt im web_recon-Flow)

---

## 2. Warum das heute nicht reicht — Beweis aus Run #1 gegen geilemukke.de

geilemukke.de ist eine echte aktive Domain. Owner ist der Operator (Niclas Pilz). Zugehörig:
- node-boss (lokal), node-secu (lokal), node-amp, mehrere Subdomains (bills, email, picknick, williams, amp)
- Public-Webseiten unter `email.geilemukke.de` (Login-Page mit Auth-Redirect)
- Domain ist deutsch registriert (Impressum-Pflicht für die meisten Use-Cases)

**Was die OSINT-Layer in Run #1 produzierte**:

| Worker | Output |
|---|---|
| domain_ct_email_mining | 60 Zertifikate untersucht, **0 Emails** gefunden |
| domain_github_personnel | nichts (kein `GITHUB_TOKEN` gesetzt → graceful skip) |
| email_pattern_inference | sampleSize=0 (kein Material) |
| Rule 4 (Email-Chain) | `fire_count=0` — nie getriggert |
| Rule 5 (Username-Chain) | `fire_count=0` — nie getriggert |

**Ergebnis**: 0 Personen, 0 Emails, 0 Usernames im Engagement.

**Aus Customer-Sicht**: der Report wäre "wir haben keine OSINT-Funde". Aber jeder menschliche Analyst, dem man `geilemukke.de` gibt, würde in 30 Sekunden über Google + Impressum + GitHub-Search die Owner-Identity rekonstruieren. **Diese Lücke ist genau das, was der Operator als "ausgetüfteltes Recherche-System" einfordert.**

---

## 3. Wo der OSINT-Layer architektonisch versagt

Alle 13 Worker arbeiten als **1:1-Lookups** ohne Recherche-Heuristik:

```
Input (Email | Username | Domain)
  │
  ▼
Worker macht EINE API-/DNS-Abfrage gegen genau diesen Identifier
  │
  ▼
Output: was die einzelne Quelle direkt zurückgibt
```

Das ist gut für **Verifikation** ("ist diese spezifische Email in HIBP?"), aber **schlecht für Discovery** ("welche Person/Emails gehören zu dieser Domain?").

**Konkret fehlende Recherche-Mechaniken**:

### 3.1 Domain → Owner-Inferenz (fehlt komplett)

Heute: `domain_ct_email_mining` ist die einzige Quelle für Domain→Email. Wenn da nichts kommt, ist der Pfad tot.

Missing:
- **WHOIS / RDAP-Lookup**: Domain-Registrant, Admin/Tech-Contact-Emails (oft anonymisiert via Privacy-Service, aber nicht immer — gerade bei kleinen DE-Domains).
- **Impressum-Crawler**: deutsche TMG-§5-Pflicht — auf jeder gewerblich genutzten DE-Site steht Name + Anschrift + Kontakt-Email im Impressum. Reines HTTP-Crawl auf `/impressum`, `/imprint`, `/legal`, `/contact` reicht oft.
- **Default-Mailbox-Probes** (passiv): `info@`, `kontakt@`, `abuse@`, `postmaster@`, `admin@`, `webmaster@` — testbar via SMTP-VRFY auf MX-Records oder einfach via Existenz-Probe.
- **DNS TXT-Records**: viele Domains haben Verifikations-TXT (Google-Workspace `google-site-verification=`, `_acme-challenge`, `apple-domain-verification=`, etc.) — die TXT-Strings selbst leaken keine Person, aber die Tool-Wahl ("Google-Workspace") ist Pivot-Material.

### 3.2 Search-Engine als OSINT-Quelle (fehlt komplett)

Ein menschlicher Analyst öffnet Google und sucht `"geilemukke.de"`, `site:linkedin.com geilemukke`, `"@geilemukke.de"`. Wir tun das nicht.

Optionen:
- **Bing-Search-API** (kostenpflichtig aber günstig, oder via SearXNG-self-hosted)
- **Common-Crawl**: index of public web — exakter String-Match auf Domain-Erwähnungen
- **Deutsche Spezialfälle**: Handelsregister (`unternehmensregister.de`), `northdata.de` (kommerzielle Wirtschaftsdaten-Aggregation, hat oft Inhaber-Namen)

### 3.3 Multi-Hop-Reasoning (fehlt)

Heute: jeder Worker startet von einem einzelnen Identifier. Es gibt keine Kette wie:
1. Domain → WHOIS-Email-Pattern → wahrscheinlicher Display-Name
2. Display-Name → GitHub-Search "<name> <domain>" → Account
3. GitHub-Account → Profile → Public-Email → Linkedin-Pivot
4. Linkedin → Arbeitgeber → potentielle Customer-Beziehung
5. Repos der Person → leaked secrets/internal-Hostnames

Aktuell ist die Auto-Chain nur 1 Hop tief: `email → 6 Worker, username → 2 Worker`. Kein graph-basiertes Recherche-Reasoning.

### 3.4 Hint-System (fehlt)

Operator weiß oft Dinge, die der Code nicht selbst herausfinden kann. Heute muss der Operator das via DB-Insert machen. Es gibt keinen API-Pfad "Hier ist ein Hint: der Domain-Owner heißt Niclas Pilz".

Missing:
- API-Endpoint `POST /engagements/:id/hints` mit free-text + structured-fields (`hintedOwnerName`, `hintedOwnerCity`, `hintedCompanyName`, `hintedAlternativeDomains`).
- Hints werden zu OSINT-Workern als **Seed-Material** durchgereicht.
- Operator-UI erlaubt Hint-Editing während der Recherche läuft.

### 3.5 Coverage-Honesty (teilweise vorhanden, nicht ausreichend)

Wenn ein Worker "nichts findet", gibt es heute keinen unterschied zwischen:
- "ich habe sauber recherchiert und es gibt nachweislich nichts"
- "ich konnte gar nicht recherchieren weil GITHUB_TOKEN fehlt / API down / Rate-Limit"

`domain_github_personnel` mit fehlendem Token gibt heute `rawOutput: {}` zurück — der Customer-Report würde das als "OSINT-Lücke" interpretieren statt als "Tool nicht konfiguriert".

Im FULL_SCAN.md Phase 8 ist "Coverage-Caveats" als Report-Sektion vorgesehen, aber die Workers tragen die Information nicht strukturiert mit.

---

## 4. Was ein "ausgetüfteltes Recherche-System" konkret bedeutet (Operator-Definition)

Vom Operator (2026-05-08, dieser Session): **"das System soll versuchen zu verstehen, dass Emails auch teilweise einfach gefunden werden"**.

Übersetzt in technische Anforderungen:

1. **Domain ist erst-mal nur ein Anfangs-Hint**, nicht der einzige Recherche-Vektor. Nach 30 Sekunden sollte das System mehrere Hypothesen über den Owner haben (mit Confidence-Score), nicht eine leere Liste.
2. **Multiple Quellen werden parallel angefragt** (WHOIS + Impressum-Crawl + Search-Engine + DNS-Pattern + CT-Logs). Wer als erster ein Owner-Signal findet, triggert die Quer-Validierung der anderen.
3. **Hints vom Operator werden als First-Class-Inputs verarbeitet**. "Owner heißt Niclas Pilz aus Berlin" sollte sofort:
   - Linkedin/XING-Public-Profile-Suche triggern
   - GitHub-Username-Suche (mit Display-Name + Domain)
   - Common-Email-Pattern-Generation (`niclas@`, `n.pilz@`, `niclas.pilz@`, `pilz@`)
   - Den Engagement-Graph als "hinted_owner"-Relationship markieren
4. **Multi-Hop-Auto-Chain**: jedes neu entdeckte Identitäts-Signal triggert Folge-Workers (das geht heute zur Email-Chain, nicht zur Person-Chain).
5. **Recherche-Tiefe ist transparent im Report**: "Wir haben WHOIS + Impressum + 3 Search-Engines + GitHub befragt. Daraus folgten N Hypothesen, davon M verifiziert." statt "0 Emails gefunden".
6. **Spezifisch deutsche Datenquellen** sind first-class: Impressum, Handelsregister, Bundesanzeiger, northdata. Die meisten Customer der Agentur sind DE-B2B.

---

## 5. Was es NICHT werden soll (Grenzen)

Wichtig für die nächste Session, damit der Scope sauber bleibt:

- **Kein Phishing-Generator**. Der Recherche-Output speist Customer-Reports und stack-aware Folge-Scans, nicht Email-Templates an entdeckte Personen.
- **Keine breach-as-a-service-Kollektion**. Wir nutzen HIBP-API für "ist diese Email betroffen", nicht eigene Plaintext-Dumps. Combolists o.ä. werden nicht persistiert.
- **Kein Massen-Scraping**. Search-Engines werden via offizielle APIs oder rate-limitierte Self-Hosted-Instanzen abgefragt, nicht durch Browser-Automation gegen Google/Bing.
- **Keine Auth-Tests gegen entdeckte Personen-Accounts**. Username-Multiplatform-Worker prüft Existenz, nicht Login. Brute-Force bleibt `active_intrusive` und braucht explicit written_consent.
- **Keine personenbezogenen Daten ohne Engagement-Bezug**. Findings über Personen werden nur im Kontext eines authorisierten Engagements persistiert; Cross-Engagement-Hits triggern explizite Operator-Notification (siehe `triggerCrossEngagementHit`), nicht stille Konsolidierung.

---

## 6. Wo die nächste Session anfangen sollte

Konkrete Pfade für die nächste Iteration (in Reihenfolge des erwarteten Customer-Wertes):

| Priorität | Was | Wo der Code hinkäme |
|---|---|---|
| 1 | **Hints-API** + DB-Tabelle `secu_engagement_hints` (frei-text + structured slots: ownerName, ownerCity, ownerCompany, ownerAltDomains, ownerKnownEmails). Migration via `./schema-ready.sh`. | neuer router `src/routes/security/hints/`, neue tabelle in `individual-schema.ts`, neue serviceklasse |
| 2 | **WHOIS/RDAP-Worker** `domain_whois_passive` (passive_only, RDAP-Endpoint von DENIC + IANA-Fallback). Output: registrant_email, registrar, creation_date als Tech-Anreicherung + Email-Entity wenn nicht-anonymisiert. | `src/lib/security/workers/passive/domain-whois-passive.worker.ts` |
| 3 | **Impressum-Crawler** `domain_impressum_extract` (passive, GET `/impressum` `/imprint` `/legal` `/kontakt`). NER auf Body: Namen, Emails, Telefonnummern, Adressen. Triggert email_address + person + phone_number Entities. | `src/lib/security/workers/passive/domain-impressum-extract.worker.ts` |
| 4 | **Hint→Email-Pattern-Generator** (deterministic, kein API-Call): aus `hintedOwnerName + domain` → 8-12 plausible Emails generieren als Speculation-Mode-Entities (`entity.data.speculative=true`). Sind Input für email_breach_check. | erweitere `email_pattern_inference` oder neuer Worker |
| 5 | **Search-Engine-Worker** `domain_websearch_recon` (passive_only, eine API: SearXNG self-hosted oder Bing-API). Sucht `"<domain>"`, `"@<domain>"`, `"<hintedOwnerName>"`. Extrahiert Person/Email/social_account aus Snippets. | `src/lib/security/workers/passive/domain-websearch-recon.worker.ts` |
| 6 | **Multi-Hop-Rule-Erweiterung**: Rule "person.created → trigger {linkedin_lookup, xing_lookup, github_username_search-by-name}". | `src/lib/security/bootstrap.ts` ensureRule |
| 7 | **Coverage-Tracker** auf Worker-Result-Level: jeder OSINT-Worker liefert zusätzlich `coverage: {tried: [...], skipped: [...], skipReason: {...}}`. Persistiert in `secu_worker_runs.rawOutput`. Phase 8 Report nutzt das für die Caveats-Section. | erweitere `WorkerResult`-Typ in `worker.types.ts` + alle 13 OSINT-Worker |

**Operative Voraussetzung vor Iteration**:
- `GITHUB_TOKEN` Env-Variable setzen (`PAT mit read:user, user:email` Scope reicht für github_personnel + github_secret_scan).
- Optional: SearXNG self-hosted aufsetzen (Docker-Image `searxng/searxng`, Port 8080), falls Search-Engine-Worker ohne Bing-API-Quota laufen soll.

---

## 7. Test-Setup für die nächste Session

geilemukke.de ist als Engagement #4 schon angelegt mit Authorization=internal_lab/active_intrusive (Apex = Entity #20). Subdomains: bills (#21), email (#22), picknick (#23), williams (#24), amp (#25).

Bekannte Owner-Daten werden hier bewusst nicht als Hints für die Engine notiert —
die OSINT-Engine soll Personen/GitHub-Accounts/Emails selbst aus der Domain
rekonstruieren. Operator-Vorwissen kommt ausschließlich über die Hints-API ins
System (`POST /engagements/:id/hints`), wo es als Seed-Material mit
`evidenceClass='hint_seeded'` getrennt vom organischen Befund nachvollziehbar
bleibt (features.md §2.7).

**Nicht** vorhandene Daten (= das, was die OSINT-Layer rekonstruieren müsste, um die Anforderung zu erfüllen):
- Anschrift / Stadt
- Aktuelle Telefonnummer
- LinkedIn/XING-Profil
- Andere assoziierte Domains
- Mitarbeiter / Team-Members
- Kunden-Pointer

Ein erfolgreicher Recherche-Lauf gegen geilemukke.de **mit Hints** sollte mindestens:
- Den Owner-Namen via Impressum-Crawl bestätigen (oder Inkonsistenz flaggen)
- 5+ wahrscheinliche Email-Kombinationen via Pattern-Generation erzeugen
- Mindestens 2 dieser Emails via HIBP gegen Breaches prüfen
- Den GitHub-Account via Search-Engine + Display-Name auflösen
- Das alles in einem Report-Block "OSINT — Owner-Identity" zusammenfassen, mit Confidence-Score pro Hypothese

---

## 8. Cross-Reference zu FULL_SCAN.md

Diese Datei adressiert eine **Spezialform** der "Coverage-Caveat"- und "Confidence"-Themen aus FULL_SCAN.md Phase 8. Sie greift den OSINT-Layer früher heraus, weil:
- OSINT-Recherche-Tiefe ist Customer-Wow-Faktor (was unterscheidet den Report von einer Tool-Liste)
- Die heutige 0-Funde-Realität auf geilemukke.de macht den Bedarf konkret sichtbar
- Phase 6 (stack-aware Routing) und Phase 7 (API-Fuzzing) brauchen kein OSINT-Upgrade — sie sind unabhängig
- Phase 8 (Reporting) profitiert direkt von tieferer OSINT-Tiefe in jedem Customer-Report

**Reihenfolge-Vorschlag** für die nächste Session: zuerst Hints-API + WHOIS + Impressum (3 Worker-Tage), dann Search-Engine + Multi-Hop-Rules (2 Tage), dann re-run gegen geilemukke.de mit Hint "Owner ist Niclas Pilz" und vergleichen.

---

## 9. Was diese Session bereits geliefert hat (als Baseline)

Damit die nächste Session weiß, worauf sie aufsetzt:

- **Trust-Layer ist live**: jeder Worker meldet `exit_code` ehrlich, `worker-runner.ts` downgraded `success=true`-mit-`exit_code≠0` automatisch zu `failed`. Bei OSINT-Workern bedeutet das: ein silently-failing-Worker (z.B. wegen API-Rate-Limit) wird sichtbar.
- **Rule-Observability ist live**: jede Rule × Event mit Scope-Match schreibt `rule.evaluated`-Audit-Eintrag. Wenn die nächste Session neue OSINT-Rules baut, ist die Trace-DB sofort lesbar.
- **Worker-API ist live**: `POST /engagements/:id/workers/:workerKey/run` kann jeden Worker einzeln triggern — ideal um neue OSINT-Worker iterativ gegen geilemukke.de zu testen ohne ganzen Playbook-Run zu starten.
- **Engagement-Lookup für entity.updated-Events ist gefixt**: Auto-Chain für Domain-Hints (Rule 6 könnte aktiviert werden) würde jetzt korrekt im richtigen Engagement starten.
- **service_classify hat dangling_platform-Detection**: orphaned Hosting-Slots werden als Subdomain-Takeover-Risk erkannt (Render/Heroku/Vercel/etc.). Das ist nicht direkt OSINT, aber vermeidet, dass die OSINT-Chain auf einem leeren Hosting-Stub Zeit verschwendet.

---

**Diese Datei nicht in der nächsten Session aktualisieren — neue Erkenntnisse fließen in `FULL_SCAN.md` (Roadmap) oder ins `auto-memory`. Diese Datei kann gelöscht werden, sobald die nächste Session die Hints-API + min. 1 zusätzlichen OSINT-Worker (WHOIS oder Impressum) deployed hat.**
