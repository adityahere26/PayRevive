// The ONLY file in this project that imports the Gemini SDK (@google/genai). Everything else
// — the planner, the provider abstraction, and all business logic — depends on the plain
// function exported below, never on SDK types directly. This is what makes the provider
// replaceable later without touching the Recovery Engine (ARCHITECTURE.md § Key architecture
// decisions and rationale).
//
// GEMINI_API_KEY is read server-side only (config/env.js), never hardcoded, never exposed to
// the client — SECURITY.md § Secrets. Nothing here ever receives Razorpay credentials or a
// MongoDB connection: this module's only capability is "send a prompt, get text back."

import { GoogleGenAI } from "@google/genai";
import { env } from "../../config/env.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 10000;

let cachedClient = null;

// Lazy singleton: constructing GoogleGenAI eagerly at module-import time would make every
// test that imports anything in this file's dependency chain require GEMINI_API_KEY, even
// tests that never call Gemini. Deferring construction to first real call keeps the module
// safely importable when the key is absent (config/env.js § OPTIONAL_FOR_NOW).
function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return cachedClient;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Sends a prompt to Gemini with a JSON-schema-constrained response and returns the raw text
 * (expected to be a JSON string — the caller, gemini/planner.js, is responsible for parsing
 * and independently re-validating it; this function does not parse or validate).
 *
 * @param {{prompt: string, responseSchema: object, model?: string, timeoutMs?: number}} args
 * @returns {Promise<string>}
 */
export async function generateStructuredContent({
  prompt,
  responseSchema,
  model = DEFAULT_MODEL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const client = getClient();
  const response = await withTimeout(
    client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
    timeoutMs
  );
  return response.text;
}
