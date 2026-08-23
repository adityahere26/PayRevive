// MongoDB/Mongoose connection layer. A connection failure must never crash the process —
// GET /api/health exists specifically to report database status, which only works if the
// server stays up when the database is unreachable (ARCHITECTURE.md § API contract).

import mongoose from "mongoose";
import { logger } from "../lib/logger.js";

mongoose.connection.on("error", (err) => {
  logger.error("MongoDB connection error", { error: err.message });
});

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB disconnected");
});

mongoose.connection.on("connected", () => {
  logger.info("MongoDB connected");
});

/**
 * Attempts to connect to MongoDB. Resolves on success; rejects on failure (callers decide
 * whether that's fatal). `serverSelectionTimeoutMS` keeps a bad URI from hanging forever —
 * important both for real startup UX and for the "database unreachable" foundation test.
 */
export async function connectDB(uri, { serverSelectionTimeoutMS = 8000 } = {}) {
  return mongoose.connect(uri, { serverSelectionTimeoutMS });
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

/** "connected" | "connecting" | "disconnecting" | "disconnected" — used by the health route. */
export function dbStatus() {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return states[mongoose.connection.readyState] || "unknown";
}
