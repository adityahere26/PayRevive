// Assigns a request id and logs one structured line per request, per SECURITY.md §
// Logging / observability: requestId, timestamp, route, status, duration — never secrets.

import crypto from "node:crypto";
import { logger } from "../lib/logger.js";

export function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info("request", {
      requestId: req.id,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    });
  });

  next();
}
