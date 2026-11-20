/**
 * Next.js server start hook. Runs once per server process, before any request.
 *
 * ⚠️ Keep the `if (process.env.NEXT_RUNTIME === "nodejs")` + dynamic import shape exactly. This
 * file is also compiled for the edge runtime; Next replaces NEXT_RUNTIME with a literal so the
 * branch, and the Node-only module behind it, are dropped from the edge build. An early-return
 * form is not eliminated and the edge build fails on `node:` imports.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

/**
 * Every server error (route handlers, pages, server actions) goes to the ops Slack webhook when
 * one is set (src/server/error-alerts.ts). Same shape as `register`, for the same reason.
 */
export async function onRequestError(
  err: unknown,
  request: { method?: string; path?: string },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRequestError } = await import("./server/error-alerts");
    await reportRequestError(err, request, context);
  }
}
