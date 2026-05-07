import "dotenv/config";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const pg = postgres(process.env.DATABASE_URL!);
const database = drizzle(pg);

async function main() {
  try {
    console.log("🗑️ Dropping and recreating schema...");

    // Schema komplett löschen und neu anlegen
    await database.execute(sql.raw(`DROP SCHEMA IF EXISTS public CASCADE;`));
    await database.execute(sql.raw(`CREATE SCHEMA public;`));
    await database.execute(sql.raw(`GRANT ALL ON SCHEMA public TO postgres;`));
    await database.execute(sql.raw(`GRANT ALL ON SCHEMA public TO public;`));

    // Auch das drizzle schema löschen falls es existiert
    await database.execute(sql.raw(`DROP SCHEMA IF EXISTS drizzle CASCADE;`));

    console.log("📦 Running migrations...");
    await migrate(database, { migrationsFolder: "drizzle" });

    console.log("✅ Database cleared and migrated successfully");
    console.log("💡 Falls du seeden willst, bitte 'npm run seed' separat ausführen.");
  } catch (error) {
    console.error("❌ Database operation failed:", error);
    process.exit(1);
  } finally {
    await pg.end();
  }
}

main();