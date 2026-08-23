// Minimal structured logger. No external dependency — see CLAUDE.md non-negotiable
// constraints (simplest thing that works). Every log line is a single JSON object so it's
// easy to grep/parse; secret-shaped fields are redacted defensively even though callers
// should never pass secrets in here to begin with (SECURITY.md § Logging / observability).

const SECRET_KEY_PATTERN = /(secret|password|token|apikey|api_key|authorization|cvv|card)/i;

function redact(meta) {
  if (!meta || typeof meta !== "object") return meta;
  const safe = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      safe[key] = "[redacted]";
    } else if (value && typeof value === "object" && !(value instanceof Error)) {
      safe[key] = redact(value);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

function write(level, message, meta) {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redact(meta),
  };
  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    process.stderr.write(serialized + "\n");
  } else {
    process.stdout.write(serialized + "\n");
  }
}

export const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
