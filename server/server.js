// Entry point: connects to MongoDB (non-fatally — see config/db.js), starts the HTTP
// server, and wires up graceful shutdown. ARCHITECTURE.md § Deployment topology.

import { env } from "./src/config/env.js";
import { connectDB, disconnectDB } from "./src/config/db.js";
import { createApp } from "./src/app.js";
import { logger } from "./src/lib/logger.js";

const app = createApp();

connectDB(env.MONGODB_URI).catch((err) => {
  logger.error("Initial MongoDB connection failed — server will keep running; GET /api/health reflects this", {
    error: err.message,
  });
});

const server = app.listen(env.PORT, () => {
  logger.info("payrevive server started", { port: env.PORT, environment: env.NODE_ENV });
});

async function shutdown(signal) {
  logger.info("Shutting down", { signal });
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
