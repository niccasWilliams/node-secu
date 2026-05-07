
import { defineConfig } from "drizzle-kit";
//

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/individual/individual-schema.ts"],
  dialect: "postgresql",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:example@localhost:5450/postgres",
  },
  verbose: true,
  strict: true,
});
