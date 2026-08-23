// Shared test harness. `node --test` runs each test file in its own process, so each file
// that calls startTestServer() gets an independent in-memory MongoDB (mongodb-memory-server)
// and an independent copy of the app — no shared state or ordering dependence between files.
// This is what makes "Tests should be deterministic" (EVALUATION.md's principle, applied
// here to the foundation suite) actually true without needing real Atlas credentials.

import { MongoMemoryServer } from "mongodb-memory-server";

export const TEST_JWT_SECRET = "test-only-jwt-secret-never-use-outside-tests";
export const TEST_CLIENT_URL = "http://localhost:5173";

/**
 * Boots the real app (server/src/app.js) against a fresh in-memory MongoDB on an ephemeral
 * port. Env vars are set via dynamic import ordering (ESM static imports are hoisted, so
 * config/env.js must not be imported — even transitively — until these are set).
 */
export async function startTestServer({ mongoUri, envOverrides = {} } = {}) {
  const mem = mongoUri ? null : await MongoMemoryServer.create();
  const uri = mongoUri || mem.getUri();

  process.env.NODE_ENV = "test";
  process.env.PORT = "0";
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.CLIENT_URL = TEST_CLIENT_URL;
  Object.assign(process.env, envOverrides);

  const dbModule = await import("../../server/src/config/db.js");
  const { createApp } = await import("../../server/src/app.js");
  const models = await import("../../server/src/models/index.js");

  await dbModule.connectDB(uri);

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    if (mem) {
      await dbModule.disconnectDB().catch(() => {});
      await mem.stop();
    }
  }

  return { baseUrl, models, dbModule, stop };
}
