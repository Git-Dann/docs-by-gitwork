/**
 * Dispatch answering in Slack, on the same engine and permission wall as the in-app panel.
 *
 * Which client a question is about, in order:
 *   1. a thread this person already started with Dispatch keeps its client;
 *   2. a client's own internal channel means that client;
 *   3. otherwise the client named in the question, from the clients this person can open.
 * Anything else (a teammate, "everything") goes to the older status answer in respond.ts.
 *
 * Where the answer goes:
 *   - a DM with the bot, or the client's own internal channel: in the thread;
 *   - anywhere else: to the asker by DM, with a short note in the thread.
 * An answer posted in a channel is read by everyone there, so it is built with the narrowest
 * view (forChannel): no figures, developer document types only. Proposed changes carry Confirm
 * and Cancel buttons that only the asker can use (interactions.ts → decideAction).
 *
 * Questions from Slack Connect channels never reach here (events.ts refuses them first).
 */

import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { buildAssistantReply, type SlackActionCard, type SlackSource } from "@/lib/dispatch/slack-format";
import { openDirectMessage, postMessage } from "@/server/slack/client";
import { buildDispatchNotice } from "@/server/slack/blocks";
import { resolveSubject } from "@/server/dispatch/resolve";
import { askerScope, loadCandidates } from "@/server/dispatch/respond";
import { assistantAvailable } from "./access-gate";
import { DispatchAccessError, forChannel, openScope, type DispatchScope } from "./scope";
import { DispatchLimitError, runTurn } from "./loop";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://foundry.gitwork.co.uk";

export interface SlackQuestion {
  workspaceId: string;
  botToken: string;
  asker: EffectiveUser;
  askerSlackId: string;
  channelId: string;
  channelType: string | undefined;
  threadTs: string;
  question: string;
  /** The audit row created by events.ts for this delivery. */
  exchangeId: string;
}

/** "legacy" = not for the assistant (switched off, or not about one client): use respond.ts. */
export async function answerInSlack(q: SlackQuestion): Promise<"handled" | "legacy"> {
  if (!(await assistantAvailable(q.asker))) return "legacy";
  const startedAt = Date.now();
  const isDm = q.channelType === "im";

  const [existing, channelClient] = await Promise.all([
    prisma.dispatchConversation.findFirst({
      where: { workspaceId: q.workspaceId, userId: q.asker.id, slackChannelId: q.channelId, slackThreadTs: q.threadTs },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientId: true },
    }),
    isDm
      ? null
      : prisma.workspaceClient.findFirst({
          where: {
            workspaceId: q.workspaceId,
            OR: [{ slackInternalChannelId: q.channelId }, { slackChannelId: q.channelId }],
          },
          select: { id: true, slackExternalChannelId: true },
        }),
  ]);
  // A client's shared channel is never "its own" channel, even if it was saved in both fields.
  const ownChannelClient = channelClient && channelClient.slackExternalChannelId !== q.channelId ? channelClient : null;

  let clientId = existing?.clientId ?? ownChannelClient?.id ?? null;
  if (!clientId) {
    // Only clients this person can open are candidates, so a client they can't open reads
    // exactly like an unknown name.
    const resolved = resolveSubject(q.question, await loadCandidates(q.workspaceId, await askerScope(q.asker)));
    if (resolved.subject?.kind !== "client") return "legacy";
    clientId = resolved.subject.id;
  }

  const post = async (payload: { text: string; blocks: unknown[] }, where: "thread" | "dm") => {
    if (where === "thread") {
      return postMessage(q.botToken, { channel: q.channelId, thread_ts: q.threadTs, text: payload.text, blocks: payload.blocks });
    }
    const dm = await openDirectMessage(q.botToken, q.askerSlackId);
    const channel = dm.data.channel?.id;
    if (!dm.ok || !channel) return { ok: false as const, error: dm.error ?? "no-dm-channel", data: {} };
    return postMessage(q.botToken, { channel, text: payload.text, blocks: payload.blocks });
  };
  const finish = (data: Record<string, unknown>) =>
    prisma.dispatchExchange
      .update({
        where: { id: q.exchangeId },
        // Chats are private: the audit row records who, which client and the outcome, not the text.
        data: { askerUserId: q.asker.id, latencyMs: Date.now() - startedAt, answeredAt: new Date(), ...data },
      })
      .catch(() => undefined);

  let scope: DispatchScope;
  try {
    scope = await openScope(q.asker, { id: clientId }, "slack");
  } catch (err) {
    const message = err instanceof DispatchAccessError ? err.message : "I couldn't open that client for you.";
    const notice = buildDispatchNotice(message);
    await post(notice, "thread");
    await finish({ status: "error", error: message.slice(0, 200) });
    return "handled";
  }

  const where: "thread" | "dm" = isDm || ownChannelClient?.id === scope.client.id ? "thread" : "dm";
  if (where === "thread" && !isDm) scope = forChannel(scope);

  let text = "";
  let sawStatus = false;
  const actions: SlackActionCard[] = [];
  const sources = new Map<string, SlackSource>();
  const notices: string[] = [];
  let outcome = "failed";
  let usedModel: string | null = null;
  try {
    ({ outcome, model: usedModel } = await runTurn({
      scope,
      question: q.question,
      conversationId: existing?.id ?? null,
      slack: { channelId: q.channelId, threadTs: q.threadTs },
      emit: {
        conversation: () => undefined,
        text: (delta) => {
          // Text written before a tool call and after it are separate thoughts.
          if (sawStatus && text && !text.endsWith("\n")) text += "\n\n";
          sawStatus = false;
          text += delta;
        },
        status: () => {
          sawStatus = true;
        },
        action: (card) => actions.push({ id: card.id, title: card.title, lines: card.lines }),
        sources: (list) => {
          for (const s of list) {
            sources.set(`${s.kind}:${s.id}`, { label: s.label, url: s.href ? `${APP_BASE_URL}${s.href}` : undefined });
          }
        },
        notice: (n) => notices.push(n),
      },
    }));
  } catch (err) {
    const message = err instanceof DispatchLimitError || err instanceof DispatchAccessError ? err.message : "Something went wrong answering that. It's logged in Foundry.";
    await post(buildDispatchNotice(message), "thread");
    await finish({ status: err instanceof DispatchLimitError ? "rate_limited" : "error", error: message.slice(0, 200) });
    return "handled";
  }

  const reply = text.trim()
    ? buildAssistantReply({
        text,
        actions,
        sources: [...sources.values()],
        clientName: scope.client.name,
        askerSlackId: q.askerSlackId,
        notice: notices.join(" ") || null,
      })
    : buildDispatchNotice(notices.join(" ") || "I couldn't come up with an answer to that one.");

  const posted = await post(reply, where);
  if (where === "dm") {
    const note = buildDispatchNotice(
      posted.ok
        ? "I've sent you my answer by direct message, because people in this channel may not have the same access as you."
        : "I couldn't send you a direct message, and I won't post the answer here because people in this channel may not have the same access as you. Ask me in a DM.",
    );
    await post(note, "thread");
  }
  await finish({
    status: outcome === "answered" && text.trim() ? "answered" : "error",
    subjectKind: "client",
    subjectId: scope.client.id,
    subjectLabel: scope.client.name,
    aiModel: usedModel,
    cached: false,
    error: posted.ok ? null : `slack:${posted.error ?? "unknown"}`,
  });
  return "handled";
}
