import { createApp } from "./app";
import { env } from "./lib/env";
import { ensureStorageBucket } from "./routes/uploads";

try {
  await ensureStorageBucket();
} catch (error) {
  console.error("RustFS bucket belum dapat dipastikan:", error);
}

const app = createApp();

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
