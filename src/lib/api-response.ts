import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * `headers` is optional and additive — existing callers are unaffected.
 *
 * Added so the public scan endpoint can advertise the rate limit it actually
 * enforces. Pulse's own `api_rate_limit_headers` check WARNS every scanned site
 * for omitting these, so sending none was the plainest hypocrisy in the audit.
 */
export function apiOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    ...(init?.headers ? { headers: init.headers } : {}),
  });
}

export function apiError(message: string, status = 500, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      details,
    },
    {
      status,
    },
  );
}

export function fromError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError(describeValidation(error), 400, error.issues);
  }

  // Errors that carry their own HTTP status (e.g. UnauthorizedError, ForbiddenError)
  if (error instanceof Error) {
    const maybeStatus = (error as unknown as { status?: unknown }).status;
    if (typeof maybeStatus === "number") {
      return apiError(error.message, maybeStatus);
    }
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return apiError(message, 500);
}

/**
 * "Validation failed" alone told the person on the other end nothing — not which field,
 * not why — and most callers render `error` straight onto the screen. A client logging a
 * 258-character request on PollenIQ's wiki saw exactly those two words and gave up. Name
 * the first offending field and the reason; the full list stays in `details`.
 */
export function describeValidation(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "Validation failed";
  const field = first.path.map(String).join(".");
  return field ? `Validation failed: ${field} — ${first.message}` : `Validation failed: ${first.message}`;
}
