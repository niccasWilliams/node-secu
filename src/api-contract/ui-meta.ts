// UI-Meta-Layer für Auto-Forms im Frontend.
//
// Ziel: das Frontend rendert Forms, Filter, Tabellen und Detail-Panels
// schema-driven — Backend ist Single-Source-of-Truth. Backend-Schema-Add
// → FE picked es automatisch auf, kein manuelles Form-Touch.
//
// Mechanik:
//   1. ui(schema, meta) attached die Meta an `schema._def.uiMeta`.
//   2. Der OpenAPI-Generator (scripts/generate-api-contract.ts) extrahiert
//      uiMeta + zod's eingebaute description und schreibt sie als
//      `description` + `x-ui` Extension ins generierte JSON-Schema.
//   3. Frontend liest `x-ui` aus dem generierten Routenkontrakt
//      (frontend-types.ts / generated/openapi.json) und rendert
//      automatisch das richtige Widget, Label, Hilfe-Text etc.

import type { z } from "zod";

/** Welche UI-Komponente das Feld rendert. Bewusst engster Set — erweitern bei Bedarf. */
export type UiWidget =
    | "text"
    | "textarea"
    | "email"
    | "url"
    | "domain"
    | "password"
    | "number"
    | "integer"
    | "date"
    | "datetime"
    | "checkbox"
    | "select"
    | "multi-select"
    | "radio"
    | "json"
    | "code"
    | "tags"
    | "hidden"
    | "readonly"
    | "entity-picker"
    | "engagement-picker"
    | "playbook-picker"
    | "worker-picker"
    | "severity-badge"
    | "status-badge";

/** Wo das Feld in der UI gruppiert wird (Form-Sections, Detail-Panels). */
export type UiGroup = string;

/** Auswahloption für select/radio/multi-select Widgets. */
export type UiOption = {
    value: string | number | boolean;
    label: string;
    description?: string;
    /** Optional — wird vom FE als Farbe in Badges genutzt. */
    color?: "neutral" | "info" | "success" | "warning" | "danger";
    /** Optional — Icon-Slug (Lucide-Icons o.ä.). */
    icon?: string;
};

/** Optional sichtbarkeits-Steuerung: zeige Feld nur wenn anderes Feld bestimmten Wert hat. */
export type UiCondition = {
    field: string;
    equals?: unknown;
    notEquals?: unknown;
    in?: unknown[];
};

/**
 * Annotation eines Schema-Feldes für das FE.
 * Alle Felder sind optional — minimal: nur `label`.
 */
export type UiMeta = {
    /** Primär-Label (Form-Label, Spalten-Header, Detail-Caption). */
    label?: string;
    /** Längerer Hilfe-Text unter dem Feld. */
    help?: string;
    /** Placeholder im Input. */
    placeholder?: string;
    /** UI-Widget. Wenn leer, FE leitet aus Zod-Type ab. */
    widget?: UiWidget;
    /** Sektion / Gruppe in Forms und Detail-Panels. */
    group?: UiGroup;
    /** Reihenfolge innerhalb der Gruppe (kleiner = früher). Default 100. */
    order?: number;
    /** Statisches Options-Set für select/radio/multi-select. */
    options?: UiOption[];
    /** Bedingte Sichtbarkeit. */
    showIf?: UiCondition;
    /** Feld in Listen-Tabellen anzeigen? */
    listColumn?: boolean;
    /** Spaltenbreite-Hint (px oder fr). */
    columnWidth?: string;
    /** Im Detail-Panel rendern? Default true. */
    detailField?: boolean;
    /** Im Form rendern? Default true. */
    formField?: boolean;
    /** Read-only Feld (Anzeige, kein Input). */
    readonly?: boolean;
    /** Extra Tags (z.B. "secret", "pii", "internal") — FE kann maskieren/warnen. */
    tags?: string[];
    /** Beispielwert (für Form-Skelett oder Doku-Anzeige). */
    example?: unknown;
};

/**
 * Annotiert ein Zod-Schema mit UI-Meta. Returnt **das gleiche** Schema
 * (mutating in-place), damit Chaining (`.optional()`, `.nullable()`) weiter geht.
 *
 * Best Practice: ui() ganz innen vor optional/nullable/default ansetzen,
 * damit die Meta auf der konkreten Type-Schicht hängt:
 *
 *   email: ui(z.string().email(), { label: "E-Mail", widget: "email" }).optional()
 */
export function ui<T extends z.ZodTypeAny>(schema: T, meta: UiMeta): T {
    // Wir hängen die Meta direkt am _def — der OpenAPI-Generator picked sie
    // beim Walk und schreibt sie als `x-ui` Extension ins JSON-Schema.
    const def = (schema as any)._def;
    if (def && typeof def === "object") {
        // Merge mit ggf. bereits vorhandener Meta (idempotent für Hot-Reload).
        def.uiMeta = { ...(def.uiMeta ?? {}), ...meta };
    }
    return schema;
}

/**
 * Convenience-Pattern für annotierte Enums:
 *
 *   const status = z.enum(["open", "fixed"]);
 *   ui(status, {
 *     label: "Status",
 *     widget: "select",
 *     options: [
 *       { value: "open",  label: "Offen",   color: "warning" },
 *       { value: "fixed", label: "Behoben", color: "success" },
 *     ],
 *   });
 *
 * Bewusst KEIN dedizierter `uiEnum`-Helper — Zod's Type-Inference verträgt
 * sich schlecht mit zusätzlichen Generics um z.enum(), und der direkte
 * Aufruf von `ui()` ist sauber genug.
 */
