/**
 * sync-migrations.ts
 *
 * Ensures the local __drizzle_migrations tracking table is in sync
 * with the migration files on disk. This prevents "type already exists"
 * errors when the tracking table has stale entries from a previous
 * migration chain.
 *
 * Safe for production: only marks migrations as applied if their
 * schema objects already exist in the database. Never runs SQL from
 * migration files.
 */
import "dotenv/config";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const DRIZZLE_DIR = join(process.cwd(), "drizzle");
const JOURNAL_PATH = join(DRIZZLE_DIR, "meta", "_journal.json");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function computeHash(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  if (!existsSync(JOURNAL_PATH)) {
    console.log("⚠️  No journal file found, skipping sync.");
    return;
  }

  const journal: Journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"));
  const pg = postgres(DATABASE_URL!);

  try {
    // Ensure drizzle schema and table exist
    await pg.unsafe(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pg.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    // Get currently tracked hashes
    const tracked = await pg.unsafe<{ hash: string }[]>(
      `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id`
    );
    const trackedHashes = new Set(tracked.map((r) => r.hash));

    // Build expected entries from journal
    const expected: { hash: string; tag: string; when: number; file: string }[] = [];
    for (const entry of journal.entries) {
      const sqlFile = join(DRIZZLE_DIR, `${entry.tag}.sql`);
      if (!existsSync(sqlFile)) {
        console.error(`❌ Migration file missing: ${entry.tag}.sql`);
        process.exit(1);
      }
      expected.push({
        hash: computeHash(sqlFile),
        tag: entry.tag,
        when: entry.when,
        file: sqlFile,
      });
    }

    const expectedHashes = new Set(expected.map((e) => e.hash));

    // Check for stale entries (tracked hashes not matching any current file)
    const staleHashes = [...trackedHashes].filter((h) => !expectedHashes.has(h));
    const hasStaleEntries = staleHashes.length > 0;

    if (hasStaleEntries) {
      console.log(
        `⚠️  Found ${staleHashes.length} stale migration tracking entry/entries.`
      );
    }

    // Always verify: check which migrations are actually applied in the DB
    console.log("🔍 Verifying which migrations are actually applied in the database...");
    const appliedCount = await detectAppliedMigrations(pg, expected);

    // Check if tracking matches reality
    const trackedInOrder = expected.filter((e) => trackedHashes.has(e.hash));
    const trackingMatchesReality =
      !hasStaleEntries &&
      trackedInOrder.length === appliedCount &&
      trackedHashes.size === appliedCount;

    if (trackingMatchesReality) {
      const pending = expected.length - appliedCount;
      if (pending > 0) {
        console.log(
          `✅ Tracking is correct. ${pending} pending migration(s) — drizzle will apply them.`
        );
      } else {
        console.log("✅ Migration tracking is in sync. All migrations applied.");
      }
      return;
    }

    // Tracking doesn't match reality — rebuild it
    console.log(
      `📊 ${appliedCount} of ${expected.length} migrations are actually applied. Rebuilding tracking...`
    );

    await pg.unsafe(`DELETE FROM drizzle.__drizzle_migrations`);
    await pg.unsafe(
      `SELECT setval('drizzle.__drizzle_migrations_id_seq', 1, false)`
    );

    for (let i = 0; i < appliedCount; i++) {
      const entry = expected[i];
      await pg.unsafe(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [entry.hash, entry.when]
      );
      console.log(`  ✓ Marked as applied: ${entry.tag}`);
    }

    const pending = expected.length - appliedCount;
    if (pending > 0) {
      console.log(
        `ℹ️  ${pending} migration(s) will be applied by drizzle migrate.`
      );
    }

    console.log("✅ Migration tracking rebuilt successfully.");
  } finally {
    await pg.end();
  }
}

/**
 * Detect how many migrations (from the start) are already applied.
 * We check sequentially — if migration N is not applied, we stop.
 */
async function detectAppliedMigrations(
  pg: postgres.Sql,
  migrations: { hash: string; tag: string; when: number; file: string }[]
): Promise<number> {
  let applied = 0;

  for (const migration of migrations) {
    const sql = readFileSync(migration.file, "utf-8");
    const isApplied = await checkMigrationApplied(pg, sql);
    if (isApplied) {
      applied++;
    } else {
      break; // Migrations are sequential, stop at first unapplied
    }
  }

  return applied;
}

/**
 * Check if a migration's effects are already present in the database.
 * Parses the SQL for CREATE TYPE, CREATE TABLE, ALTER TABLE ADD COLUMN
 * and checks if those objects exist.
 */
async function checkMigrationApplied(
  pg: postgres.Sql,
  sql: string
): Promise<boolean> {
  // Split by statement breakpoints
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  if (statements.length === 0) return false;

  // Check the first statement to see if its objects exist
  const firstStmt = statements[0];

  // ALTER TYPE "public"."name" ADD VALUE 'value'
  const alterTypeMatch = firstStmt.match(
    /ALTER\s+TYPE\s+"?(\w+)"?(?:\."?(\w+)"?)?\s+ADD\s+VALUE\s+'(\w+)'/i
  );
  if (alterTypeMatch) {
    const typeName = alterTypeMatch[2] || alterTypeMatch[1];
    const schemaName = alterTypeMatch[2] ? alterTypeMatch[1] : "public";
    const enumValue = alterTypeMatch[3];
    const result = await pg.unsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = $1 AND t.typname = $2 AND e.enumlabel = $3) as exists`,
      [schemaName, typeName, enumValue]
    );
    return result[0]?.exists ?? false;
  }

  // CREATE TYPE "public"."name" AS ENUM(...)
  const typeMatch = firstStmt.match(
    /CREATE\s+TYPE\s+"?(\w+)"?\."?(\w+)"?\s+AS\s+ENUM/i
  );
  if (typeMatch) {
    const [, schema, typeName] = typeMatch;
    const result = await pg.unsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = $1 AND t.typname = $2) as exists`,
      [schema, typeName]
    );
    return result[0]?.exists ?? false;
  }

  // CREATE TABLE "name"
  const tableMatch = firstStmt.match(
    /CREATE\s+TABLE\s+"?(\w+)"?(?:\."?(\w+)"?)?/i
  );
  if (tableMatch) {
    const tableName = tableMatch[2] || tableMatch[1];
    const schemaName = tableMatch[2] ? tableMatch[1] : "public";
    const result = await pg.unsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) as exists`,
      [schemaName, tableName]
    );
    return result[0]?.exists ?? false;
  }

  // ALTER TABLE "name" ADD COLUMN "col"
  const alterMatch = firstStmt.match(
    /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+"?(\w+)"?/i
  );
  if (alterMatch) {
    const [, tableName, columnName] = alterMatch;
    const result = await pg.unsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2) as exists`,
      [tableName, columnName]
    );
    return result[0]?.exists ?? false;
  }

  // If we can't parse the first statement, assume not applied (safe default)
  return false;
}

main().catch((err) => {
  console.error("❌ Migration sync failed:", err);
  process.exit(1);
});
