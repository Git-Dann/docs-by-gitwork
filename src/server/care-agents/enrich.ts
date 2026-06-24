import { triageConversation } from "./triage-agent";
import { prisma } from "@/lib/prisma";
import type { AiContext } from "./ai-client";

/**
 * Non-gating enrichment pass. Ingestion has already stored every conversation —
 * this only *annotates* them (sentiment, issue type, suggested priority). It never
 * replies, creates tickets, or hides anything, so "see everything" always holds even
 * if the model is wrong. The operator triages from the cockpit.
 *
 * Capped per run so a large backfill can't blow the serverless time budget or run up
 * unbounded AI cost — the daily cron picks up the rest on later passes.
 */
export async function enrichConversations(
  ctx: AiContext,
  conversationIds: string[],
  opts: { max?: number } = {},
): Promise<{ enriched: number; errors: string[] }> {
  const max = opts.max ?? 25;
  const slice = conversationIds.slice(0, max);
  let enriched = 0;
  const errors: string[] = [];

  for (const convId of slice) {
    try {
      await triageConversation(ctx, convId);
      enriched++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`enrich ${convId}: ${msg}`);
      try {
        const conv = await prisma.supportConversation.findUnique({
          where: { id: convId },
          select: { clientId: true },
        });
        if (conv) {
          await prisma.supportAuditLog.create({
            data: {
              clientId: conv.clientId,
              actorId: "agent:enrich",
              action: "enrichment_error",
              target: convId,
              metadata: { error: msg.slice(0, 500) },
            },
          });
        }
      } catch {
        // Audit log failure is non-fatal
      }
    }
  }

  return { enriched, errors };
}
