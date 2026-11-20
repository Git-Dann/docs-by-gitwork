/**
 * Posts server errors to the ops Slack webhook (CLAUDE.md §144), via Next's `onRequestError`
 * (src/instrumentation.ts). Does nothing unless SLACK_OPS_WEBHOOK_URL is set. Rules and
 * rate limits: src/lib/error-alerts.ts. Never throws: reporting an error must not cause one.
 */

import { errorAlertText, errorSignature, shouldPostError, type AlertWindow, type ErrorFacts } from "@/lib/error-alerts";
import { postOpsWebhook } from "@/server/ops-alert";

const state: AlertWindow = { lastSent: new Map(), sentTimes: [] };

export async function reportRequestError(
  err: unknown,
  request: { method?: string; path?: string },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  try {
    if (!process.env.SLACK_OPS_WEBHOOK_URL?.trim()) return;
    const e = err as { name?: unknown; message?: unknown; code?: unknown; digest?: unknown } | null;
    const facts: ErrorFacts = {
      // The route's template only. The real path can carry ids or tokens.
      routePath: context.routePath || "(unknown route)",
      method: request.method || "GET",
      name: typeof e?.name === "string" ? e.name : "Error",
      code: typeof e?.code === "string" ? e.code : undefined,
      message: typeof e?.message === "string" ? e.message : String(err),
      digest: typeof e?.digest === "string" ? e.digest : undefined,
    };
    // A 404 thrown as notFound() and redirect() are control flow, not errors.
    if (facts.digest?.startsWith("NEXT_")) return;
    if (!shouldPostError(state, errorSignature(facts), Date.now())) return;
    await postOpsWebhook(errorAlertText(facts));
  } catch {
    // Nothing: the error itself is already in the logs.
  }
}
