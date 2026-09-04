// Minimal structured server-side logger. Deliberately dependency-free —
// JSON lines to stdout/stderr are enough for P0 and are trivially
// ingestible by any future log aggregator.
type LogLevel = "info" | "warn" | "error";

const REDACT_KEY_FRAGMENTS = ["password", "secret", "token", "authorization", "cookie", "apikey"];

function redact(meta: unknown): unknown {
  if (Array.isArray(meta)) return meta.map(redact);
  if (meta && typeof meta === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
      clone[key] = REDACT_KEY_FRAGMENTS.some((fragment) => key.toLowerCase().includes(fragment))
        ? "[REDACTED]"
        : redact(value);
    }
    return clone;
  }
  return meta;
}

function write(level: LogLevel, message: string, meta?: unknown) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta !== undefined ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta),
};
