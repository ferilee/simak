import { bigint, index, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

// TOKEN SERAH-TERIMA MASUK RUAS -> SIMAK (Hub Murid Tahap 4, migrasi
// 0022) — cermin tabel simak_handoff_tokens di RUAS untuk arah
// sebaliknya. RUAS meminta token lewat endpoint internal SIMAK untuk
// seorang penggunanya; peramban murid menukarnya di /masuk-ruas/:token
// menjadi sesi SIMAK biasa (tabel sessions, migrasi 0019).
//
// Yang disimpan hanya SHA-256 (hex, 64 char) dari token mentah — token
// mentah (32 byte acak, base64url) hanya hidup di URL penukaran dan
// tidak pernah ditulis ke basis data atau log. Masa berlaku 60 detik,
// SEKALI PAKAI: penukaran menandai used_at secara atomik (UPDATE ...
// WHERE used_at IS NULL); baris yang sudah terpakai/kedaluwarsa tidak
// bisa ditukar lagi. Kebijakan keputusannya tinggal di
// apps/api/src/lib/serah-terima.ts.
export const ruasHandoffTokens = mysqlTable(
  "ruas_handoff_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ruas_handoff_tokens_expires_idx").on(t.expiresAt)],
);
