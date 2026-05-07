// db-errors.ts
type DbErrorMapped = {
  status: number;
  code?: string;
  userMessage: string;
  debugMessage?: string;
};

function isPgError(e: unknown): e is { code?: string; message?: string; detail?: string; constraint?: string; table?: string } {
  return !!e && typeof e === "object" && ("code" in e || "constraint" in e || "detail" in e);
}

export function mapDbError(e: unknown, fallbackUserMessage = "Database operation failed"): DbErrorMapped {
  if (!isPgError(e)) {
    return { status: 500, userMessage: fallbackUserMessage, debugMessage: String(e) };
  }

  const code = e.code;
  const msg = e.message ?? "";
  const detail = e.detail ?? "";
  const constraint = e.constraint ?? "";
  const table = e.table ?? "";

  // Postgres error codes (häufigste)
  switch (code) {
    case "23503": // foreign_key_violation
      return {
        status: 409,
        code,
        userMessage: "Cannot delete this item because it is referenced by other records.",
        debugMessage: `FK violation ${table}.${constraint}: ${detail || msg}`,
      };

    case "23505": // unique_violation
      return {
        status: 409,
        code,
        userMessage: "A record with the same unique value already exists.",
        debugMessage: `Unique violation ${table}.${constraint}: ${detail || msg}`,
      };

    case "23502": // not_null_violation
      return {
        status: 400,
        code,
        userMessage: "A required field is missing.",
        debugMessage: `NOT NULL violation ${table}.${constraint}: ${detail || msg}`,
      };

    case "23514": // check_violation
      return {
        status: 400,
        code,
        userMessage: "Input violates a validation rule.",
        debugMessage: `CHECK violation ${table}.${constraint}: ${detail || msg}`,
      };

    case "22P02": // invalid_text_representation (z.B. UUID)
      return {
        status: 400,
        code,
        userMessage: "Invalid input format.",
        debugMessage: `Invalid text representation: ${detail || msg}`,
      };

    default:
      // Fallback: nicht leaken, aber debug behalten
      return {
        status: 500,
        code,
        userMessage: fallbackUserMessage,
        debugMessage: `${code ?? "unknown"}: ${detail || msg}`,
      };
  }
}

// Optional: eigener Error-Typ fürs UseCase/Controller-Layer
export class AppError extends Error {
  status: number;
  code?: string;
  debugMessage?: string;

  constructor(mapped: DbErrorMapped) {
    super(mapped.userMessage);
    this.status = mapped.status;
    this.code = mapped.code;
    this.debugMessage = mapped.debugMessage;
  }
}