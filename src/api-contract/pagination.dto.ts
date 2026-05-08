// Zentrale Pagination/Sort-Helper für alle Listen-Endpoints.
//
// Konvention:
//   Query: ?limit=&offset=&sortBy=&order=asc|desc&search=
//   Response: { items: T[], total: number, limit: number, offset: number }
//
// Jeder Listen-Endpoint, der nicht zwingend eine andere Shape braucht, sollte
// `paginatedQuery({ sortFields: [...] })` als Request-Query und
// `paginatedResponse(itemSchema)` als Response-Data verwenden.

import { z } from "zod";
import { ui } from "./ui-meta";

const DEFAULT_LIMIT_MAX = 500;

/**
 * Erzeugt ein Pagination-Query-Schema mit erlaubten Sort-Feldern.
 * `sortFields` ist die Whitelist gegen SQL-Injection — der Controller darf
 * sich darauf verlassen, dass q.sortBy ∈ sortFields ist.
 *
 * Alle Pagination-Schemas exposen die gleichen Felder (`limit/offset/sortBy/order/search`),
 * damit der inferred TypeScript-Type stabil und specific bleibt — sonst geht der
 * Type-Schluss bei `.extend(...)` durch eine string-index-signature kaputt.
 */
export function paginatedQuery<const Sort extends readonly [string, ...string[]]>(opts: {
    sortFields: Sort;
    /** Default sort field falls keiner übergeben (Doku-Hinweis, vom Controller verwendet). */
    defaultSort?: Sort[number];
    /** Default order falls keine übergeben. */
    defaultOrder?: "asc" | "desc";
    /** Maximaler limit-Wert (Default 500). */
    maxLimit?: number;
}) {
    const max = opts.maxLimit ?? DEFAULT_LIMIT_MAX;
    const sortBy = z.enum(opts.sortFields).optional();
    const order = z.enum(["asc", "desc"]).optional();
    const limit = z.coerce.number().int().min(1).max(max).optional();
    const offset = z.coerce.number().int().min(0).optional();
    const search = z.string().max(256).optional();

    ui(limit, { label: "Limit", widget: "integer", group: "Paginierung", help: `Anzahl Einträge (1-${max})` });
    ui(offset, { label: "Offset", widget: "integer", group: "Paginierung" });
    ui(sortBy, { label: "Sortieren nach", widget: "select", group: "Paginierung" });
    ui(order, { label: "Reihenfolge", widget: "select", group: "Paginierung" });
    ui(search, { label: "Suche", widget: "text", group: "Filter", placeholder: "Volltext-Suche…" });

    return z.object({ limit, offset, sortBy, order, search });
}

/**
 * Erzeugt ein Paginated-Response-Schema für einen Item-Typ.
 *
 * Auch ohne diese Helper bleibt `itemSchema.array()` als Response-Type
 * gültig — aber dann fehlen `total/limit/offset`, was das FE braucht
 * um Pagination-UI zu bauen.
 */
export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
    return z
        .object({
            items: z.array(itemSchema),
            total: z.number().int().nonnegative(),
            limit: z.number().int().nonnegative(),
            offset: z.number().int().nonnegative(),
        })
        .strict();
}

/** Type-Helper für Controller. */
export type PaginatedQueryInput = {
    limit?: number;
    offset?: number;
    sortBy?: string;
    order?: "asc" | "desc";
    search?: string;
};

/** Default-Werte normalisieren — nutzt der Controller. */
export function normalizePagination(
    q: PaginatedQueryInput,
    fallback: { defaultSort?: string; defaultOrder?: "asc" | "desc"; defaultLimit?: number } = {},
): { limit: number; offset: number; sortBy?: string; order: "asc" | "desc" } {
    return {
        limit: q.limit ?? fallback.defaultLimit ?? 50,
        offset: q.offset ?? 0,
        sortBy: q.sortBy ?? fallback.defaultSort,
        order: q.order ?? fallback.defaultOrder ?? "desc",
    };
}
