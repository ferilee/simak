import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: new URL("../../.env", import.meta.url) });

// MariaDB memakai dialect "mysql" di Drizzle (drizzle-orm/mysql2).
export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
