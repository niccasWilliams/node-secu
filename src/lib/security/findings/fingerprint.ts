import { createHash } from "node:crypto";

/**
 * Erzeugt einen stabilen 64-char SHA-256 Hash über Finding-Inputs.
 * Wird genutzt, um identische Findings über mehrere Scans zu deduplizieren.
 *
 * Inputs müssen deterministisch sein — KEINE Timestamps, keine zufälligen IDs.
 * Beispiel: ["dns", "spf_missing", "example.com"]
 */
export function buildFindingFingerprint(inputs: string[]): string {
    const normalized = inputs
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .join("::");
    return createHash("sha256").update(normalized).digest("hex");
}
