import { bigint, boolean, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

// PEMETAAN PROFIL ke akun RUAS — bukan tabel akun.
// SIMAK tidak menyimpan kata sandi; verifikasi selalu ke sumber akun RUAS.
export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  // Pengenal akun di RUAS; varchar agar tahan terhadap format id RUAS apa pun.
  ruasUserId: varchar("ruas_user_id", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  role: mysqlEnum("role", ["guru", "murid"]).notNull(),
  nis: varchar("nis", { length: 32 }),
  isActive: boolean("is_active").notNull().default(true),
  // Kapan murid pertama kali menyambut modal ucapan selamat datang di
  // ruang murid (NULL = belum pernah disambut). Penanda di server —
  // bukan di perangkat — karena murid berbagi perangkat: penanda lokal
  // akan menyambut orang yang salah atau melewatkan yang berhak.
  welcomedAt: timestamp("welcomed_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
