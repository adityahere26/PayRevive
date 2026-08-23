// GET /api/health — ARCHITECTURE.md § API contract. Never crashes, never exposes secrets;
// reflects real database connectivity rather than hardcoding "ok".

import { Router } from "express";
import { dbStatus } from "../config/db.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const database = dbStatus();
  const applicationStatus = database === "connected" ? "ok" : "degraded";

  res.status(200).json({
    status: applicationStatus,
    database,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
