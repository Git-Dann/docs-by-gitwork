import { triageConversation } from "./triage-agent";
import { generateDraftReply } from "./draft-agent";
import type { AiContext } from "./ai-client";

/**
 * Non-gating enrichment pass. Ingestion has already stored every conversation —
 * this only *annotates* them (sentiment, issue type, priority tags) and, when
 * triage suggests a ticket, creates it and drafts a reply. It never deletes or
 * hides anything, so "see everything" always holds even if the model is wrong.
 *
 * Capped per run so a large backfill can't blow the serverless time budget or
 * run up unbounded AI cost — the daily cron picks up the rest on later passes.
 */
export async function enrichConversations(
  ctx: AiContext,
  conversationIds: string[],
  opts: { max?: number } = {},
): Promise<{ enriched: number; ticketsCreated: number; draftsGenerated: number; errors: string[] }> {
  const max = opts.max ?? 25;
  const slice = conversationIds.slice(0, max);
  let enriched = 0;
  let ticketsCreated = 0;
  let draftsGenerated = 0;
  const errors: string[] = [];

  for (const convId of slice) {
    try {
      const { ticketId } = await triageConversation(ctx, convId);
      enriched++;
      if (ticketId) {
        ticketsCreated++;
        // Draft only when a ticket was suggested — keeps cost bounded.
        await generateDraftReply(ctx, convId, ticketId);
        draftsGenerated++;
      }
    } catch (err) {
      errors.push(`enrich ${convId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { enriched, ticketsCreated, draftsGenerated, errors };
}
