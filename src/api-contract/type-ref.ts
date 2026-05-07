export type TypeRef =
  | {
      kind: "type_ref";
      /**
       * Type name that exists in `frontend-types.ts`
       * (we'll generate `import type { Name } from "../frontend-types"` in the frontend contract output)
       */
      name: string;
    }
  | {
      kind: "type_ref";
      /**
       * TypeScript type expression, backed by imports from `frontend-types.ts`.
       * Example: expr: "PaginatedResult<BookkeepingRevenue>", imports: ["PaginatedResult","BookkeepingRevenue"]
       */
      expr: string;
      imports: string[];
    };

/**
 * Use this for response typing without having to maintain large Zod response schemas.
 *
 * Example:
 * responses: [{ kind: "json", status: 200, data: typeRef("FullDocument") }]
 */
export function typeRef(name: string): TypeRef {
  return { kind: "type_ref", name };
}

export function typeRefExpr(expr: string, imports: string[]): TypeRef {
  return { kind: "type_ref", expr, imports };
}
