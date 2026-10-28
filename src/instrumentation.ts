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
