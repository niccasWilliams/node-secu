import { database } from "@/db";
import { AppLog, AppLogLevel, appLogs } from "@/db/schema";
import { eq, desc, inArray, and, ilike, gte, lte, or, sql, count } from "drizzle-orm";
import { createTransaction, nowInBerlin } from "@/util/utils";
import { PaginatedResult } from "@/types/types";

type LogFilters = {
  level?: AppLogLevel
  dateFrom?: Date
  dateTo?: Date
}

class LogService {
  private db;

  constructor() {
    this.db = database;
  }

  /**
   * Sanitizes the context object to ensure it can be serialized to JSON
   * Handles Error objects, circular references, and other non-serializable values
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(context)) {
      // Handle Error objects
      if (value instanceof Error) {
        sanitized[key] = {
          message: value.message,
          name: value.name,
          stack: value.stack,
          // Include cause if it exists (ES2022+)
          ...((value as any).cause ? { cause: String((value as any).cause) } : {}),
        };
      }
      // Handle nested objects (but avoid circular references)
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        try {
          // Try to stringify to check if it's serializable
          JSON.stringify(value);
          sanitized[key] = value;
        } catch (err) {
          // If it fails, convert to string representation
          sanitized[key] = String(value);
        }
      }
      // Handle arrays
      else if (Array.isArray(value)) {
        try {
          // Check if array is serializable
          JSON.stringify(value);
          sanitized[key] = value;
        } catch (err) {
          sanitized[key] = value.map(v => String(v));
        }
      }
      // Handle primitives and null/undefined
      else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private async log(level: AppLogLevel, message: string, context: Record<string, any> = {}) {
    try {
      // Sanitize context before inserting into DB
      const sanitizedContext = this.sanitizeContext(context);
      console.log(`[${level.toUpperCase()}] ${message}`, sanitizedContext);
      await this.db.insert(appLogs).values({
        level,
        message,
        context: sanitizedContext,
        createdAt: nowInBerlin(),
      });
    } catch (err) {
      console.error("❌ Failed to insert log into DB:", err);
    }
  }

  async info(message: string, context: Record<string, any> = {}) {
    return this.log("info", message, context);
  }

  async warn(message: string, context: Record<string, any> = {}) {
    return this.log("warn", message, context);
  }

  async error(message: string, context: Record<string, any> = {}) {
    return this.log("error", message, context);
  }

  async critical(message: string, context: Record<string, any> = {}) {
    return this.log("critical", message, context);
  }

  async debug(message: string, context: Record<string, any> = {}) {
    return this.log("debug", message, context);
  }

  async fatal(message: string, context: Record<string, any> = {}) {
    return this.log("fatal", message, context);
  }


  async searchLogs(search?: string, page: number = 1, pageSize: number = 100, filters?: LogFilters): Promise<PaginatedResult<AppLog>> {
    try {
      const where: any[] = []

      // Level-Filter
      if (filters?.level) {
        where.push(eq(appLogs.level, filters.level))
      }

      // Date-Range-Filter
      if (filters?.dateFrom) {
        where.push(gte(appLogs.createdAt, filters.dateFrom))
      }
      if (filters?.dateTo) {
        where.push(lte(appLogs.createdAt, filters.dateTo))
      }

      // Textsuche (message + optional context)
      if (search) {
        const pattern = `%${search}%`
        where.push(
          or(
            ilike(appLogs.message, pattern),
            // Kontext mit durchsuchen (als Text gecastet)
            ilike(sql`CAST(${appLogs.context} AS text)`, pattern),
          ),
        )
      }

      const whereExpr = where.length ? and(...where) : undefined
      const offset = (page - 1) * pageSize

      // 1) Daten holen
      const items = await this.db
        .select()
        .from(appLogs)
        .where(whereExpr)
        .orderBy(desc(appLogs.createdAt))
        .limit(pageSize)
        .offset(offset)

      // 2) Gesamtzahl holen (für Pagination)
      const [countRow] = await this.db
        .select({ total: count() })
        .from(appLogs)
        .where(whereExpr)

      const total = Number(countRow?.total ?? 0)
      const totalPages =
        total === 0 ? 0 : Math.ceil(total / pageSize)

      const hasNextPage = page < totalPages
      const hasPrevPage = page > 1

      return {
        items,
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      }
    } catch (err) {
      console.error("❌ Failed to fetch logs from DB:", err)

      // Im Fehlerfall trotzdem ein gültiges PaginatedResult zurückgeben
      return {
        items: [],
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: page > 1, // theoretisch, aber hier egal
      }
    }
  }


  async deleteLog(logId: number) {
    try {
      const result = await this.db
        .delete(appLogs)
        .where(eq(appLogs.id, logId));
      return result;
    } catch (err) {
      console.error("❌ Failed to delete log from DB:", err);
      throw new Error("Failed to delete log");
    }
  }

  async deleteLogs(logIds: number[]) {
    if (!logIds || logIds.length === 0) throw new Error("No log IDs provided for deletion");
    try {
      const result = await createTransaction(async (trx) => {
        return await trx
          .delete(appLogs)
          .where(inArray(appLogs.id, logIds));
      });

      return result;
    } catch (err) {
      console.error("❌ Failed to delete logs from DB:", err);
      throw new Error("Failed to delete logs");
    }
  }


}

export const logService = new LogService();