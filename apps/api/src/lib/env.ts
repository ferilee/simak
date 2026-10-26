import { z } from "zod";

// Semua rahasia hanya hidup di variabel lingkungan (blueprint Bagian 08).
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RUAS_AUTH_MODE: z.enum(["shared-db", "internal-endpoint"]).default("internal-endpoint"),
  RUAS_DATABASE_URL: z.string().optional(),
  RUAS_AUTH_ENDPOINT: z.string().optional(),
  SESSION_SECRET: z.string().min(16),
  RUSTFS_ENDPOINT: z.string().url(),
  RUSTFS_PUBLIC_ENDPOINT: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional(),
  ),
  RUSTFS_BUCKET: z.string().default("simak"),
  RUSTFS_ACCESS_KEY: z.string().min(1),
  RUSTFS_SECRET_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_PORT: z.coerce.number().default(3001),
});

export const env = envSchema.parse(process.env);
