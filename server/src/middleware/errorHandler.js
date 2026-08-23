// Centralized error handling — the ONLY place that writes an error response body, so every
// route gets the same shape and the same "no stack traces to the client" guarantee.
// ARCHITECTURE.md § API contract / SECURITY.md § Error handling.

import { logger } from "../lib/logger.js";
import { ApiError } from "../lib/errors.js";
import { env } from "../config/env.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const requestId = req.id || null;

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { requestId, code: err.code, stack: err.stack });
    }
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  // Unrecognized error: log full detail server-side, return a generic message to the
  // client. Never leak err.message/stack outward — it may contain internal detail.
  logger.error("Unhandled error", {
    requestId,
    message: err.message,
    stack: env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      requestId,
    },
  });
}
