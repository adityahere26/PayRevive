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
import { demoRouter } from "./routes/demo.js";
import { recoveryCasesRouter } from "./routes/recoveryCases.js";
import { recoveryPlanRouter } from "./routes/recoveryPlan.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { evaluationRouter } from "./routes/evaluation.js";
import { auditLogRouter } from "./routes/auditLog.js";
import { policyRouter } from "./routes/policy.js";
import { webhooksRouter } from "./routes/webhooks.js";

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
  app.use(requestContext);

  // Mounted BEFORE express.json(): Razorpay webhook signature verification requires the
  // untouched raw request body (SECURITY.md § Webhook security) — routes/webhooks.js brings
  // its own express.raw() middleware scoped to this one path, so every other route still gets
  // normal JSON parsing below, unaffected.
  app.use("/api/webhooks", webhooksRouter);

  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/demo", demoRouter);
  app.use("/api/recovery-cases", recoveryCasesRouter);
  app.use("/api/recovery-plan", recoveryPlanRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/evaluation", evaluationRouter);
  app.use("/api/audit-log", auditLogRouter);
  app.use("/api/merchant/policy", policyRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
