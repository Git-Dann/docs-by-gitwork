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
import { askWhichClientText, decideSlackChat, DM_CHAT_IDLE_MS } from "@/lib/dispatch/slack-conversation";
import { MAX_CHAT_MESSAGES } from "@/lib/dispatch/limits";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://foundry.gitwork.co.uk";

export interface SlackQuestion {
  workspaceId: string;
  botToken: string;
  asker: EffectiveUser;
  askerSlackId: string;
  channelId: string;
  channelType: string | undefined;
  threadTs: string;
  /** The message was posted inside a thread (Slack sent thread_ts). */
  inThread: boolean;
  question: string;
  /** The audit row created by events.ts for this delivery. */
  exchangeId: string;
}

/** "legacy" = not for the assistant (switched off, or not about one client): use respond.ts. */
export async function answerInSlack(q: SlackQuestion): Promise<"handled" | "legacy"> {
  if (!(await assistantAvailable(q.asker))) return "legacy";
  const startedAt = Date.now();
  const isDm = q.channelType === "im";

  const [threadChat, recentDm, channelClient, candidates] = await Promise.all([
    !isDm && q.inThread
      ? prisma.dispatchConversation.findFirst({
          where: { workspaceId: q.workspaceId, userId: q.asker.id, slackChannelId: q.channelId, slackThreadTs: q.threadTs },
          orderBy: { createdAt: "desc" },
          select: { id: true, clientId: true },
        })
      : null,
    // A DM is one running chat: the person's latest one in this DM.
    isDm
      ? prisma.dispatchConversation.findFirst({
          where: {
            workspaceId: q.workspaceId,
            userId: q.asker.id,
            slackChannelId: q.channelId,
            updatedAt: { gte: new Date(Date.now() - DM_CHAT_IDLE_MS) },
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true, clientId: true, updatedAt: true },
        })
      : null,
    isDm
      ? null
      : prisma.workspaceClient.findFirst({
          where: {
            workspaceId: q.workspaceId,
            OR: [{ slackInternalChannelId: q.channelId }, { slackChannelId: q.channelId }],
          },
          select: { id: true, slackExternalChannelId: true },
        }),
    // Only clients this person can open are candidates, so a client they can't open reads
    // exactly like an unknown name.
    loadCandidates(q.workspaceId, await askerScope(q.asker)),
  ]);
  // A client's shared channel is never "its own" channel, even if it was saved in both fields.
  const ownChannelClient = channelClient && channelClient.slackExternalChannelId !== q.channelId ? channelClient : null;
  const resolved = resolveSubject(q.question, candidates);
  const recentDmChat = recentDm
    ? { ...recentDm, messages: await prisma.dispatchMessage.count({ where: { conversationId: recentDm.id } }) }
    : null;

  // A DM with nothing to go on starts on the client the person last asked Dispatch about, or
  // their first, and Dispatch moves between their clients from there (§164).
  const { ownClients, activeOnly } = await import("./own-clients");
  const sortedClients = activeOnly(await ownClients(q.asker));
  const lastChat = isDm
    ? await prisma.dispatchConversation.findFirst({
        where: { workspaceId: q.workspaceId, userId: q.asker.id, clientId: { in: sortedClients.map((c) => c.id) } },
        orderBy: { updatedAt: "desc" },
        select: { clientId: true },
      })
    : null;
  const decision = decideSlackChat({
    isDm,
    inThread: q.inThread,
    threadChat,
    recentDmChat,
    namedClientId: resolved.subject?.kind === "client" ? resolved.subject.id : null,
    aboutPersonOrAll: resolved.subject !== null && resolved.subject.kind !== "client",
    channelClientId: ownChannelClient?.id ?? null,
    onlyClientId: sortedClients.length === 1 ? sortedClients[0].id : null,
    fallbackClientId: lastChat?.clientId ?? sortedClients[0]?.id ?? null,
    // Room for this turn's question, tool calls and answer before the cap.
    maxMessages: MAX_CHAT_MESSAGES - 6,
    now: new Date(),
  });
  if (decision.action === "legacy") return "legacy";

  // In a DM, answer where they wrote: at the top level, or in the thread they used. In a
  // channel, always in the thread, so the channel stays quiet.
  const replyThreadTs = isDm && !q.inThread ? undefined : q.threadTs;

  if (decision.action === "ask_which") {
    const text = askWhichClientText({
      firstName: q.asker.name?.split(" ")[0] ?? null,
      question: q.question,
      clients: candidates.clients.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    });
    const notice = buildDispatchNotice(text);
    await postMessage(q.botToken, { channel: q.channelId, ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}), text: notice.text, blocks: notice.blocks });
    await prisma.dispatchExchange
      .update({ where: { id: q.exchangeId }, data: { askerUserId: q.asker.id, status: "no_subject", latencyMs: Date.now() - startedAt, answeredAt: new Date() } })
      .catch(() => undefined);
    return "handled";
  }
  const clientId = decision.clientId;
  const existing = decision.action === "continue" ? { id: decision.conversationId } : null;

  const post = async (payload: { text: string; blocks: unknown[] }, where: "thread" | "dm") => {
    if (where === "thread") {
      return postMessage(q.botToken, {
        channel: q.channelId,
        ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
        text: payload.text,
        blocks: payload.blocks,
      });
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
  let endedOn = "";
  const ask = (conversationId: string | null) => runTurn({
      scope,
      question: q.question,
      conversationId,
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
    });
  try {
    try {
      ({ outcome, model: usedModel, clientName: endedOn } = await ask(existing?.id ?? null));
    } catch (err) {
      // A chat that has grown long carries on in a fresh one, rather than telling the person to
      // start again themselves.
      if (!(existing && err instanceof DispatchLimitError && /got long/.test(err.message))) throw err;
      ({ outcome, model: usedModel, clientName: endedOn } = await ask(null));
    }
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
        clientName: endedOn || scope.client.name,
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
