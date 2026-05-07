import { z } from "zod";

type FlexibleDateOptions = {
  /**
   * If `YYYY-MM-DD` is passed, interpret it as a local day boundary.
   * - start: 00:00:00.000
   * - end:   23:59:59.999
   */
  dayBoundary?: "start" | "end";
  /**
   * Accept German date format `DD.MM.YYYY` in addition to ISO / YYYY-MM-DD.
   * (Useful for query parameters pasted from spreadsheets / banking exports)
   */
  allowGermanDotDate?: boolean;
};

function parseFlexibleDate(raw: string, opts: FlexibleDateOptions): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Pure date: YYYY-MM-DD
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]);
    const d = Number(m1[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

    if (opts.dayBoundary === "end") return new Date(y, mo - 1, d, 23, 59, 59, 999);
    // default: start
    return new Date(y, mo - 1, d, 0, 0, 0, 0);
  }

  // German dot date: DD.MM.YYYY
  if (opts.allowGermanDotDate) {
    const m2 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m2) {
      const d = Number(m2[1]);
      const mo = Number(m2[2]);
      const y = Number(m2[3]);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
      if (opts.dayBoundary === "end") return new Date(y, mo - 1, d, 23, 59, 59, 999);
      return new Date(y, mo - 1, d, 0, 0, 0, 0);
    }
  }

  // ISO datetime etc.
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

/**
 * Query/body date parser:
 * - Input is a string (as sent over HTTP)
 * - Output is a `Date` for backend/internal use
 *
 * IMPORTANT:
 * Our contract generator unwraps ZodEffects for TS/OpenAPI output,
 * so the generated frontend contract still expects a string.
 */
export function zFlexibleDate(opts: FlexibleDateOptions = {}) {
  return z.string().min(1).transform((val, ctx) => {
    const dt = parseFlexibleDate(val, { dayBoundary: opts.dayBoundary ?? "start", allowGermanDotDate: opts.allowGermanDotDate ?? true });
    if (!dt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date",
      });
      return z.NEVER;
    }
    return dt;
  });
}

/**
 * Boolean query-parameter parser.
 * Handles string "false" correctly (z.coerce.boolean() does NOT — Boolean("false") === true).
 * Accepts: "true"/"1" → true, "false"/"0"/undefined → false, actual booleans pass through.
 */
export function zQueryBoolean() {
  return z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val === "true" || val === "1";
    return false;
  }, z.boolean());
}

