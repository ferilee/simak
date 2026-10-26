import { config } from "dotenv";
import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema/index";

config({ path: new URL("../../../.env", import.meta.url) });

// timezone "Z" = UTC. Semua waktu disimpan dalam UTC dan ditampilkan
// sebagai WIB di antarmuka (blueprint Bagian 05).
const pool = createPool({
  uri: process.env.DATABASE_URL,
  timezone: "Z",
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });
export { pool, schema };
