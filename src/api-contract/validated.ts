import type { Request } from "express";
import type { ZodTypeAny, z } from "zod";
import type { ValidatedRequest } from "./contract.middleware";

/**
 * Small helper to keep controllers clean:
 * - Prefer `req.validated.*` (set by `validate(...)` middleware)
 * - Optional fallback: if a schema is provided, try parsing `req.*` directly
 *
 * Returns `null` if nothing is available / parsing fails.
 */
export function validatedParams<T extends ZodTypeAny>(req: Request, schema?: T): z.infer<T> | null {
  const vr = req as ValidatedRequest;
  if (vr.validated?.params) return vr.validated.params as z.infer<T>;
  if (!schema) return null;
  const parsed = schema.safeParse(req.params);
  return parsed.success ? (parsed.data as z.infer<T>) : null;
}

export function validatedQuery<T extends ZodTypeAny>(req: Request, schema?: T): z.infer<T> | null {
  const vr = req as ValidatedRequest;
  if (vr.validated?.query) return vr.validated.query as z.infer<T>;
  if (!schema) return null;
  const parsed = schema.safeParse(req.query);
  return parsed.success ? (parsed.data as z.infer<T>) : null;
}

export function validatedBody<T extends ZodTypeAny>(req: Request, schema?: T): z.infer<T> | null {
  const vr = req as ValidatedRequest;
  if (vr.validated?.body) return vr.validated.body as z.infer<T>;
  if (!schema) return null;
  const parsed = schema.safeParse((req as any).body);
  return parsed.success ? (parsed.data as z.infer<T>) : null;
}

