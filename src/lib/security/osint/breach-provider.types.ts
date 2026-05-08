// Phase 2.7 — Breach-Provider-Interface.
//
// Provider-neutrales Vertrag-Layer: Phase 2.7 hat HIBP, Phase 2.8 wird DeHashed,
// LeakCheck, IPQS dazustöpseln — als neue Klassen die dieses Interface erfüllen.
// Der Worker (email_breach_check) ruft den Adapter auf und persistiert die
// generischen `BreachHit`-Records, ohne den Provider zu kennen.

export interface BreachHit {
    /** Provider-Name (z.B. "hibp", "dehashed"). Nicht-leer. */
    source: string;
    /** Eindeutiger Breach-Name (Provider-spezifischer Slug). */
    breachName: string;
    /** ISO-Date des bekannten Breach-Datums (sofern Provider liefert). */
    breachDate?: string;
    /** Daten-Klassen (z.B. "Email addresses", "Passwords", "Phone numbers"). */
    dataClasses: string[];
    /** Vom Adapter geschätzte Severity — basierend auf dataClasses. */
    severity: "critical" | "high" | "medium" | "low" | "info";
    /** Anzahl betroffener Accounts in dem Breach (sofern bekannt). */
    pwnCount?: number;
    /** Optional: vom Provider gelieferte Beschreibung — kommt ins Finding-Body. */
    description?: string;
    /** True wenn Provider den Breach als sensible Daten flaggt (HIBP IsSensitive). */
    isSensitive?: boolean;
}

export interface BreachProvider {
    /** Stable key — Provider-Name in Adapter-Registry. */
    readonly key: string;
    /** True wenn der Adapter konfiguriert ist (z.B. API-Key in env vorhanden). */
    isConfigured(): boolean;
    /**
     * Holt alle Breaches für die Email. Wirft bei Provider-Fehler — Worker
     * fängt und mapped zu skipped/failed.
     */
    getBreaches(email: string, opts?: { abortSignal?: AbortSignal }): Promise<BreachHit[]>;
}
