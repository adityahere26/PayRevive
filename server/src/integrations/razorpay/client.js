// The ONLY file that reads RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET to make an outbound request —
// mirrors ai/gemini/client.js's "one file imports the credential" pattern (AGENT_DESIGN.md §
// Provider abstraction). Direct HTTPS via Node's built-in fetch, not the razorpay npm SDK — the
// Payment Links API is a single authenticated POST, and Node 20's global fetch handles Basic
// Auth + JSON with no extra dependency (verified against the official razorpay-node source: the
// SDK itself is a thin wrapper around the same REST calls, plus a non-timing-safe webhook
// comparison this project deliberately does not reuse — see webhookVerify.js).
//
// Test Mode is enforced at startup (config/env.js's assertRazorpayTestMode), not here — this
// file just uses whatever key is configured.

import { env } from "../../config/env.js";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/** True once both Razorpay Test Mode credentials are present. Never true with a live key. */
export function isRazorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function authHeader() {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Thin authenticated fetch wrapper for the Razorpay REST API. Throws on a non-2xx response or
 * network failure; never returns a fabricated success. Callers (paymentLinks.js) are
 * responsible for interpreting the response — this module has no business logic.
 */
export async function razorpayRequest(path, { method = "GET", body } = {}) {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing)");
  }

  const res = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error body — fall through with json=null; the status check below still fires.
  }

  if (!res.ok) {
    const message = json?.error?.description || `Razorpay request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.razorpayError = json?.error || null;
    throw err;
  }

  return json;
}
