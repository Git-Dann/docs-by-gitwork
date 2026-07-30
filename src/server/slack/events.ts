/**
 * Slack Events API handler — the inbound half of Dispatch.
 *
 * Until now Foundry could POST to Slack (standups, roll-ups, digests) and react to button
 * clicks, but it could not be *spoken to*. This is that missing half: an `app_mention` in a
 * channel, or a plain message in a DM with the bot, becomes a question for Dispatch.
 *
 * Four guards, in order, before anything expensive or disclosing happens:
 *   1. Loop guard — never answer ourselves or any other bot. An agent that replies to its own
 *      message in a channel it is a member of is an infinite loop with a billing account.
 *   2. Dedupe — Slack re-delivers an event up to 3× if the ack is slow. `DispatchExchange.
 *      slackEventId` is unique, so the second delivery loses the insert race and stops. It is
 *      created BEFORE the answer is composed precisely so a slow answer can't cause a double
 *      post. If a previous attempt died before inserting, the retry legitimately proceeds.
 *   3. External-channel gate — Slack Connect channels contain the client. Checked against the
 *      live `conversations.info`, not a cached flag, because a channel can be shared later.
 *   4. Rate limit / subject resolution — inside `answerQuestion`.
 *
 * Dispatch always replies IN THREAD. The product is about removing Slack noise; a bot that
 * answers into the channel body adds some.
 */

import { prisma } from "@/lib/prisma";
import { answerQuestion } from "@/server/dispatch/respond";
import { stripBotMention } from "@/server/dispatch/resolve";
import { buildDispatchAnswer, buildDispatchNotice } from "./blocks";
import { conversationsInfo, postMessage, usersInfo } from "./client";

// ─── Envelope types ─────────────────────────────────────────────────────────

export interface SlackEventEnvelope {
  type?: string;
  /** Present on the one-off `url_verification` handshake. */
  challenge?: string;
  team_id?: string;
  /** Slack's per-delivery id — the dedupe key. */
  event_id?: string;
  event?: SlackInnerEvent;
}

export interface SlackInnerEvent {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  /** Set on messages posted by an app; another signal for the loop guard. */
  app_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  channel?: string;
  channel_type?: string;
}

export function parseEventBody(raw: string): SlackEventEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as SlackEventEnvelope;
  } catch {
    return null;
  }
}

/** Which events are a question for Dispatch: an @mention anywhere, or any DM to the bot. */
export function isQuestionEvent(event: SlackInnerEvent | undefined): boolean {
  if (!event) return false;
  // Edits, deletions, joins, channel topic changes — all carry a subtype and none are questions.
  if (event.subtype) return false;
  if (event.type === "app_mention") return true;
  return event.type === "message" && event.channel_type === "im";
}

/** True for anything authored by a bot (including us). Never answer these. */
export function isBotAuthored(event: SlackInnerEvent | undefined, botUserId: string | null): boolean {
  if (!event) return true;
  if (event.bot_id) return true;
  if (!event.user) return true;
  return botUserId !== null && event.user === botUserId;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export interface HandleEventArgs {
  envelope: SlackEventEnvelope;
  workspaceId: string;
  botToken: string | null;
  botUserId: string | null;
}

export async function handleSlackEvent(args: HandleEventArgs): Promise<void> {
  const { envelope, workspaceId, botToken, botUserId } = args;
  const event = envelope.event;

  if (!isQuestionEvent(event) || isBotAuthored(event, botUserId)) return;
  if (!event?.channel || !event.ts) return;
  const eventId = envelope.event_id;
  if (!eventId) return;
  if (!botToken) {
    console.warn("[dispatch] no Slack bot token configured — cannot reply");
    return;
  }

  const question = stripBotMention(event.text ?? "", botUserId);

  // Answer under the question: an existing thread if there is one, else start one on it.
  const threadTs = event.thread_ts ?? event.ts;
  const startedAt = Date.now();

  // ── Dedupe: the unique index is the guard, not a prior read ──
  let exchangeId: string;
  try {
    const row = await prisma.dispatchExchange.create({
      data: {
        workspaceId,
        slackEventId: eventId,
        channelId: event.channel,
        threadTs,
        askerSlackId: event.user ?? null,
        question,
        status: "pending",
      },
      select: { id: true },
    });
    exchangeId = row.id;
  } catch {
    // Unique violation → Slack re-delivered an event already in flight or done. Drop it.
    return;
  }

  try {
    const isExternal = await isExternalChannel(botToken, event.channel, event.channel_type);
    const askerUserId = await resolveAsker(botToken, workspaceId, event.user ?? null);

    const result = await answerQuestion({
      workspaceId,
      question,
      channelId: event.channel,
      isExternalChannel: isExternal,
    });

    const payload =
      result.status === "answered" && result.answer
        ? buildDispatchAnswer({
            subjectLabel: result.subject?.label ?? "Foundry",
            headline: result.answer.headline,
            bullets: result.answer.bullets,
            unverified: result.answer.unverified,
            href: result.subject?.kind === "client" ? `/app/portal/${result.subject.slug}/tasks` : null,
            aiModel: result.aiModel,
            cached: result.cached,
          })
        : buildDispatchNotice(result.message ?? "I couldn't answer that one.");

    const posted = await postMessage(botToken, {
      channel: event.channel,
      thread_ts: threadTs,
      text: payload.text,
      blocks: payload.blocks,
    });
    if (!posted.ok) console.warn("[dispatch] post failed", posted.error);

    await prisma.dispatchExchange.update({
      where: { id: exchangeId },
      data: {
        askerUserId,
        status: result.status,
        subjectKind: result.subject?.kind ?? "none",
        subjectId: result.subject && result.subject.kind !== "workspace" ? result.subject.id : null,
        subjectLabel: result.subject?.label ?? null,
        answer: result.answer ? [result.answer.headline, ...result.answer.bullets].join("\n") : result.message,
        unverified: result.answer?.unverified ?? undefined,
        // Counts + blind-spot kinds only — the audit row records what was known, not a
        // second copy of the client's data.
        evidence: result.evidence
          ? {
              counts: result.evidence.counts,
              blindSpots: result.evidence.blindSpots.map((b) => b.kind),
              truncated: result.evidence.truncated,
              foremanFindings: result.evidence.foremanFindings.length,
            }
          : undefined,
        aiModel: result.aiModel,
        cached: result.cached,
        latencyMs: Date.now() - startedAt,
        error: posted.ok ? null : `slack:${posted.error ?? "unknown"}`,
        answeredAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[dispatch] handler failed", message);
    await prisma.dispatchExchange
      .update({
        where: { id: exchangeId },
        data: { status: "error", error: message, latencyMs: Date.now() - startedAt, answeredAt: new Date() },
      })
      .catch(() => undefined);
    // Tell the asker rather than leaving the mention hanging — silence reads as "ignored".
    const notice = buildDispatchNotice("Something went wrong answering that. It's logged in Foundry.");
    await postMessage(botToken, {
      channel: event.channel,
      thread_ts: threadTs,
      text: notice.text,
      blocks: notice.blocks,
    }).catch(() => undefined);
  }
}

/**
 * Whether posting here would reach people outside Gitwork. `is_ext_shared` is the Slack Connect
 * signal; `is_shared` alone also covers internal org-wide shares, so it is not sufficient.
 * On ANY failure to determine this we return true — fail closed, because the cost of guessing
 * wrong is internal delivery state landing in front of a client.
 */
async function isExternalChannel(
  botToken: string,
  channelId: string,
  channelType: string | undefined,
): Promise<boolean> {
  if (channelType === "im") return false; // a DM with a workspace member
  try {
    const info = await conversationsInfo(botToken, channelId);
    if (!info.ok || !info.data.channel) return true;
    return info.data.channel.is_ext_shared === true;
  } catch {
    return true;
  }
}

/** Best-effort Slack user id → Foundry user id, for the audit row. Never blocks the answer. */
async function resolveAsker(
  botToken: string,
  workspaceId: string,
  slackUserId: string | null,
): Promise<string | null> {
  if (!slackUserId) return null;
  try {
    const info = await usersInfo(botToken, slackUserId);
    const email = info.data.user?.profile?.email;
    if (!email) return null;
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        memberships: { some: { workspaceId } },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}
