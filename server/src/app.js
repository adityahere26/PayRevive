// Express app assembly. Deliberately has NO side effects at import time (no app.listen, no
// DB connect) so tests can import and exercise it directly — server.js is the only place
// that starts a real process. ARCHITECTURE.md § System overview / § Security requirements.

import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { requestContext } from "./middleware/requestContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";

export function createApp() {
  const app = express();

  // Never trust request IPs for rate limiting behind a proxy (Render/Vercel) without this.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(requestContext);

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
