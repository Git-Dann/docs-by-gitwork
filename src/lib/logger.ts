/**
 * logger.ts — minimal structured logger with secret redaction.
 *
 * Emits one JSON line per event ({ ts, level, msg, scope?, ctx? }) so container
 * logs are machine-parseable and queryable, instead of free-text console.* calls.
 * Any context key that looks like a credential (token/secret/password/apiKey/
 * authorization/refreshToken/bankAccount/…) is replaced with "[redacted]" before
 * serialising, so accidentally passing a workspace object or request body can't
 * leak keys/PII into the logs.
 *
 * Prefer this over raw console.* anywhere secrets, tokens or user data may be in
 * scope (cron jobs, AI/provider calls, integration sync).
 */

type Level = "debug" | "info" | "warn" | "error";

// Substring match (case-insensitive) against object KEYS — value is redacted whole.
const SENSITIVE_KEY =
  /(pass(word|phrase)?|secret|token|api[-_]?key|authorization|bearer|cookie|credential|refresh[-_]?token|bank(account)?|iban|sortcode|encryption[-_]?key|service[-_]?account|client[-_]?secret|private[-_]?key|ssn)/i;

const REDACTED = "[redacted]";

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, scope: string | undefined, ctx?: unknown): void {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (scope) line.scope = scope;
  if (ctx !== undefined) line.ctx = redact(ctx);
  const serialized = JSON.stringify(line);
  // Keep the console stream mapping so existing log collectors still bucket by level.
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export type Logger = {
  debug: (msg: string, ctx?: unknown) => void;
  info: (msg: string, ctx?: unknown) => void;
  warn: (msg: string, ctx?: unknown) => void;
  error: (msg: string, ctx?: unknown) => void;
};

/** A logger tagged with a scope (e.g. "cron:support-sync") for easy filtering. */
export function loggerFor(scope: string): Logger {
  return {
    debug: (msg, ctx) => emit("debug", msg, scope, ctx),
    info: (msg, ctx) => emit("info", msg, scope, ctx),
    warn: (msg, ctx) => emit("warn", msg, scope, ctx),
    error: (msg, ctx) => emit("error", msg, scope, ctx),
  };
}

/** Untagged logger for one-off call sites. */
export const logger: Logger = {
  debug: (msg, ctx) => emit("debug", msg, undefined, ctx),
  info: (msg, ctx) => emit("info", msg, undefined, ctx),
  warn: (msg, ctx) => emit("warn", msg, undefined, ctx),
  error: (msg, ctx) => emit("error", msg, undefined, ctx),
};
