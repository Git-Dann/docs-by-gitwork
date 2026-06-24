/**
 * POST /api/dev/migrate-tickets-to-conversations — admin-only, one-shot, idempotent.
 *
 * The Care rebuild makes the *conversation* the unit of triage (status/priority/assignee/
 * timestamps live on SupportConversation, not SupportTicket). This copies the live triage
 * state from each ticket onto its linked conversation so nothing is lost when the cockpit
 * stops reading tickets. It also backfills the "Open in {channel}" externalUrl for older
 * Discord / Reddit / Gmail rows that predate that column.
 *
 * Mapping (ticket → conversation):
 *   OPEN/IN_PROGRESS/DEV_REVIEW → OPEN,  AWAITING_CUSTOMER → SNOOZED,  RESOLVED → CLOSED
 *   priority 1:1 · assignedTo → assigneeId · issueType → issueType
 *   firstReplyAt ?? createdAt → firstTriagedAt · resolvedAt → closedAt
 *
 * Idempotent: only writes a conversation still in its default untouched state
 * (status NEW + firstTriagedAt null). Newest ticket wins when a conversation has several.
 *
 * Body (optional): { "dryRun": true, "clientSlug": "fellas" }
 * dryRun DEFAULTS TO TRUE — reports counts + samples, writes nothing. Re-POST
 * { "dryRun": false } to commit.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";
import type {
  ConversationStatus,
  ConversationPriority,
  SupportTicketStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function mapTicketStatus(s: SupportTicketStatus): ConversationStatus {
  switch (s) {
    case "RESOLVED":
      return "CLOSED";
    case "AWAITING_CUSTOMER":
      return "SNOOZED";
    default:
      return "OPEN";
  }
}

function redditUrl(externalId: string | null): string | null {
  if (!externalId?.startsWith("reddit:")) return null;
  return `https://redd.it/${externalId.slice("reddit:".length)}`;
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; clientSlug?: string };
    const dryRun = body.dryRun ?? true;

    const clientFilter = body.clientSlug
      ? { client: { slug: body.clientSlug } }
      : {};

    // ── 1. Carry ticket triage state onto conversations ──
    const tickets = await prisma.supportTicket.findMany({
      where: { conversationId: { not: null }, ...clientFilter },
      orderBy: { updatedAt: "desc" }, // newest first → first seen per conversation wins
      select: {
        id: true,
        conversationId: true,
        status: true,
        priority: true,
        assignedTo: true,
        issueType: true,
        firstReplyAt: true,
        resolvedAt: true,
        createdAt: true,
      },
    });

    const seen = new Set<string>();
    let triageMigrated = 0;
    let triageSkipped = 0;
    const samples: Array<Record<string, unknown>> = [];

    for (const t of tickets) {
      const convId = t.conversationId!;
      if (seen.has(convId)) continue; // newest ticket already handled this conversation
      seen.add(convId);

      // Only migrate conversations still in their untouched default state.
      const conv = await prisma.supportConversation.findUnique({
        where: { id: convId },
        select: { id: true, status: true, firstTriagedAt: true },
      });
      if (!conv || conv.status !== "NEW" || conv.firstTriagedAt !== null) {
        triageSkipped++;
        continue;
      }

      const status = mapTicketStatus(t.status);
      const data = {
        status,
        priority: t.priority as ConversationPriority,
        assigneeId: t.assignedTo,
        issueType: t.issueType,
        firstTriagedAt: t.firstReplyAt ?? t.createdAt,
        closedAt: status === "CLOSED" ? t.resolvedAt ?? t.createdAt : null,
      };

      if (samples.length < 10) samples.push({ conversationId: convId, ...data });
      if (!dryRun) {
        await prisma.supportConversation.update({ where: { id: convId }, data });
      }
      triageMigrated++;
    }

    // ── 2. Backfill externalUrl for older rows (Discord / Reddit / Gmail) ──
    const missing = await prisma.supportConversation.findMany({
      where: { externalUrl: null, externalId: { not: null }, ...clientFilter },
      select: { id: true, source: true, externalId: true, externalGuildId: true },
    });

    let urlsBackfilled = 0;
    for (const c of missing) {
      let url: string | null = null;
      if (c.source === "GMAIL") {
        url = `https://mail.google.com/mail/u/0/#all/${c.externalId}`;
      } else if (c.source === "DISCORD" && c.externalGuildId) {
        url = `https://discord.com/channels/${c.externalGuildId}/${c.externalId}`;
      } else if (c.source === "REDDIT") {
        url = redditUrl(c.externalId);
      }
      if (!url) continue;
      if (!dryRun) {
        await prisma.supportConversation.update({ where: { id: c.id }, data: { externalUrl: url } });
      }
      urlsBackfilled++;
    }

    return apiOk({
      dryRun,
      triage: { candidates: seen.size, migrated: triageMigrated, skipped: triageSkipped, samples },
      externalUrls: { candidates: missing.length, backfilled: urlsBackfilled },
    });
  } catch (error) {
    return fromError(error);
  }
}
