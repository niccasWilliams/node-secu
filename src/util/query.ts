/**
 * Small helpers for parsing Express query params and building outgoing query strings.
 * Keeps controllers/handlers readable and consistent.
 */

export class QueryValidationError extends Error {
  statusCode = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "QueryValidationError";
  }
}

type AnyQuery = Record<string, any>;

function firstQueryValue(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  return String(value);
}

export function getQueryString(query: AnyQuery, key: string): string | undefined {
  return firstQueryValue(query?.[key]);
}

export function getQueryBoolean(
  query: AnyQuery,
  key: string,
  opts: { defaultValue?: boolean } = {}
): boolean {
  const raw = getQueryString(query, key);
  if (raw === undefined) return opts.defaultValue ?? false;

  const normalized = raw.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;

  throw new QueryValidationError(`Invalid '${key}' (expected boolean)`);
}

export function getQueryInt(
  query: AnyQuery,
  key: string,
  opts: { optional?: boolean; min?: number; max?: number } = {}
): number | undefined {
  const raw = getQueryString(query, key);
  if (raw === undefined) {
    if (opts.optional) return undefined;
    throw new QueryValidationError(`Query param '${key}' is required`);
  }

  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new QueryValidationError(`Invalid '${key}' (expected integer)`);
  if (opts.min !== undefined && n < opts.min) throw new QueryValidationError(`Invalid '${key}' (min ${opts.min})`);
  if (opts.max !== undefined && n > opts.max) throw new QueryValidationError(`Invalid '${key}' (max ${opts.max})`);
  return n;
}

export function getQueryISODate(
  query: AnyQuery,
  key: string,
  opts: { optional?: boolean } = {}
): Date | undefined {
  const raw = getQueryString(query, key);
  if (raw === undefined) {
    if (opts.optional) return undefined;
    throw new QueryValidationError(`Query param '${key}' is required`);
  }

  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new QueryValidationError(`Invalid '${key}' (expected ISO date)`);
  }
  return d;
}

export function getOptionalISODateRange(
  query: AnyQuery,
  startKey: string,
  endKey: string
): { start: Date; end: Date } | undefined {
  const startRaw = getQueryString(query, startKey);
  const endRaw = getQueryString(query, endKey);

  if (!startRaw && !endRaw) return undefined;
  if ((startRaw && !endRaw) || (!startRaw && endRaw)) {
    throw new QueryValidationError(`Both '${startKey}' and '${endKey}' must be provided together`);
  }

  const start = new Date(startRaw!);
  const end = new Date(endRaw!);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new QueryValidationError(`Invalid date format for '${startKey}' or '${endKey}' (expected ISO date)`);
  }
  return { start, end };
}

export type QueryParamValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | Array<string | number | boolean | Date | null | undefined>;

export function appendQuery(url: string, params: Record<string, QueryParamValue>): string {
  const sp = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null) continue;
      if (v instanceof Date) sp.append(key, v.toISOString());
      else sp.append(key, String(v));
    }
  }

  const qs = sp.toString();
  if (!qs) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}



export function getQueryOneOf<T extends string>(
  query: AnyQuery,
  key: string,
  allowed: readonly T[],
  opts: { optional?: boolean } = {}
): T | undefined {
  const raw = getQueryString(query, key);
  if (raw === undefined) {
    if (opts.optional) return undefined;
    throw new QueryValidationError(`Query param '${key}' is required`);
  }
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new QueryValidationError(`Invalid '${key}' (allowed: ${allowed.join(", ")})`);
}

