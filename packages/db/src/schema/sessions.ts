import { bigint, index, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

// SESI LOGIN SIMAK (guru + murid) — persisten di basis data sejak paket
// Sesi Persisten (Tahap 1 Hub Murid, migrasi 0019), menggantikan Map
// ingatan proses di apps/api/src/lib/session.ts: Redeploy API tidak
// lagi mengeluarkan pengguna.
//
// Yang disimpan hanya SHA-256 (hex, 64 char) dari id sesi yang beredar
// di cookie — token mentah tidak pernah masuk basis data, jadi salinan
// tabel ini tidak bisa dipakai untuk membajak sesi. Masa berlaku
// 30 hari MELUNCUR dari aktivitas terakhir; kebijakan kadaluwarsa dan
// ambang perpanjangan tinggal di apps/api/src/lib/session-policy.ts.
export const sessions = mysqlTable(
  "sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_expires_idx").on(t.expiresAt)],
);
