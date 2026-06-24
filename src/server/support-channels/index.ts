import { prisma } from "@/lib/prisma";
import type { SupportSource as PrismaSupportSource } from "@prisma/client";
import type { ChannelAdapter, SyncContext, SyncResult, FilterReasons } from "./types";
import { discordAdapter } from "./discord";
import { redditAdapter } from "./reddit";
import { gmailAdapter } from "./gmail";
import { appReviewsAdapter } from "./app-reviews";
import { webhookAdapter } from "./webhook";

// Register a channel = add it here. New connectors implement `fetchItems` (or
// `run` for self-contained flows) and ride the shared ingest core below.
const ADAPTERS: ChannelAdapter[] = [discordAdapter, redditAdapter, gmailAdapter, appReviewsAdapter, webhookAdapter];

export function getChannelAdapter(source: string): ChannelAdapter | null {
  return ADAPTERS.find((a) => a.key === source) ?? null;
}

function sumReasons(r: FilterReasons): number {
  return (r.bots ?? 0) + (r.empty ?? 0) + (r.duplicate ?? 0) + (r.excluded ?? 0);
}

/**
 * The single ingest path for every channel. Resolves the adapter, then either:
 *  - delegates to `adapter.run()` (self-contained adapters, e.g. Gmail), or
 *  - calls `adapter.fetchItems()` and performs the shared upsert + dedup + diagnostics +
 *    cursor/config persistence (Discord, Reddit, and all new connectors).
 *
 * Keyword config is tags-only — never a gate. Nothing is dropped by the model here.
 */
export async function runChannelSync(ctx: SyncContext): Promise<SyncResult> {
  const adapter = getChannelAdapter(ctx.connection.source);
  if (!adapter) {
    return { ingested: 0, filtered: 0, errors: [`Source ${ctx.connection.source} not yet implemented`] };
  }

  if (adapter.run) return adapter.run(ctx);
  if (!adapter.fetchItems) {
    return { ingested: 0, filtered: 0, errors: [`Adapter ${ctx.connection.source} implements neither run nor fetchItems`] };
  }

  let fetchResult;
  try {
    fetchResult = await adapter.fetchItems(ctx);
  } catch (err) {
    return { ingested: 0, filtered: 0, errors: [`${ctx.connection.source} sync failed: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const { items, diagnostics, configPatch } = fetchResult;
  const reasons: FilterReasons = { ...diagnostics.filterReasons };
  let ingested = 0;
  const newConversationIds: string[] = [];
  const source = ctx.connection.source as PrismaSupportSource;

  for (const item of items) {
    let conv = await prisma.supportConversation.findFirst({
      where: { clientId: ctx.client.id, source, externalId: item.externalId },
    });

    if (!conv) {
      conv = await prisma.supportConversation.create({
        data: {
          clientId: ctx.client.id,
          source,
          externalId: item.externalId,
          customerLabel: item.customerLabel,
          subject: item.subject,
          preview: (item.preview ?? "").slice(0, 150),
          receivedAt: item.receivedAt,
          unread: true,
          tags: item.tags,
          externalUrl: item.externalUrl ?? null,
          externalGuildId: item.externalGuildId ?? null,
        },
      });
      newConversationIds.push(conv.id);
    } else if (item.refreshTags || (item.externalUrl && !conv.externalUrl)) {
      // Keep keyword tags in sync with the connector config, and backfill the deep-link
      // URL onto older rows that predate it (never overwrite an existing URL).
      await prisma.supportConversation.update({
        where: { id: conv.id },
        data: {
          ...(item.refreshTags ? { tags: item.tags } : {}),
          ...(item.externalUrl && !conv.externalUrl
            ? { externalUrl: item.externalUrl, externalGuildId: item.externalGuildId ?? conv.externalGuildId }
            : {}),
        },
      });
    }

    let createdHere = 0;
    for (const msg of item.messages) {
      const already = await prisma.supportMessage.findFirst({
        where: { conversationId: conv.id, externalId: msg.externalId },
        select: { id: true },
      });
      if (already) { reasons.duplicate = (reasons.duplicate ?? 0) + 1; continue; }

      await prisma.supportMessage.create({
        data: {
          conversationId: conv.id,
          direction: msg.direction,
          authorLabel: msg.authorLabel,
          body: msg.body,
          externalId: msg.externalId,
          createdAt: msg.createdAt,
        },
      });
      ingested++;
      createdHere++;
    }

    if (createdHere > 0) {
      await prisma.supportConversation.update({
        where: { id: conv.id },
        data: { unread: true, preview: (item.preview ?? "").slice(0, 150) },
      });
    }
  }

  // Persist cursor/config updates (e.g. Discord per-channel cursors) + the run timestamp —
  // but NOT on a hard fetch failure (nothing fetched, nothing stored, errors present), so a
  // transient failure on a first sync still backfills full history on the next attempt.
  const hardFailure = items.length === 0 && diagnostics.fetched === 0 && diagnostics.errors.length > 0;
  if (!hardFailure) {
    await prisma.accountConnection.update({
      where: { id: ctx.connection.id },
      data: {
        lastSyncedAt: new Date(),
        ...(configPatch
          ? { scraperConfig: { ...((ctx.connection.scraperConfig as object) ?? {}), ...configPatch } as object }
          : {}),
      },
    });
  }

  return {
    fetched: diagnostics.fetched,
    ingested,
    filtered: sumReasons(reasons),
    filterReasons: reasons,
    hints: diagnostics.hints,
    errors: diagnostics.errors,
    newConversationIds,
  };
}
