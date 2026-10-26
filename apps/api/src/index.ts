import { createApp } from "./app";
import { env } from "./lib/env";

const app = createApp();

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
