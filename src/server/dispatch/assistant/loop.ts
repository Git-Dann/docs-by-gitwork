/**
 * One Dispatch question, start to finish: the model reads with tools, proposes changes, and
 * answers, streaming as it goes. Used by the in-app panel and by Slack.
 *
 * Cost (a $200 pot shared with every AI feature):
 *   - Claude Haiku 5.5 answers most chats; Sonnet 5.5 only code and design-against-build ones
 *     (src/lib/dispatch/model.ts). The model is fixed per chat.
 *   - The system prompt and the tool list are identical for every person and question, with a
 *     cache breakpoint after them, so every question after the first in a 5-minute window reads
 *     them at a tenth of the price. Who is asking and about which client goes in the first user
 *     message, after the cached part (prompt.ts). Automatic caching covers the growing chat.
 *   - Effort "low", answers kept short by instruction, results capped (redact.ts), at most
 *     MAX_TOOL_ROUNDS calls, and chats capped in length.
 *   - Every call is logged against the person with module DISPATCH (Analytics → AI usage).
 *
 * History is append-only and replayed exactly as received (thinking blocks included): Sonnet 5.5
 * checks that earlier turns weren't edited.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { DISPATCH_SYSTEM_PROMPT, chatContext, roomFor } from "@/lib/dispatch/prompt";
import {
  MAX_CHAT_MESSAGES,
  MAX_CHAT_TOKENS,
  MAX_IMAGES_PER_QUESTION,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  MAX_TOOL_ROUNDS,
  QUESTIONS_PER_HOUR,
  roughTokens,
} from "@/lib/dispatch/limits";
import { DISPATCH_MODELS } from "@/server/ai-provider";
import { chooseDispatchTier } from "@/lib/dispatch/model";
import { aiKeyFor } from "@/server/ai-keys";
import { recordAiUsage, usageFromAnthropic } from "@/server/ai-usage";
import { describeAiError } from "@/lib/ai-error-words";
import { taskRef } from "@/lib/format";
import { ROLES } from "@/types/auth";
import type { DispatchScope } from "./scope";
import { runTool, toolDefinitions, toolStatus, type ProposedActionCard, type ToolImage, type ToolSource } from "./tools";
import {
  appendMessage,
  createConversation,
  getOwnConversation,
  loadMessages,
  questionsInLastHour,
} from "./store";

export interface TurnEmitter {
  /** The conversation this question belongs to (sent first, so a new chat gets its id). */
  conversation(id: string): void;
  text(delta: string): void;
  status(text: string): void;
  action(card: ProposedActionCard): void;
  sources(list: ToolSource[]): void;
  /** A problem worth showing the person, in plain words. */
  notice(text: string): void;
  /** The chat moved to another of the person's clients (switch_client, §164). */
  client?(c: { slug: string; name: string }): void;
}

export interface TurnInput {
  scope: DispatchScope;
  question: string;
  conversationId?: string | null;
  /** The task the panel was opened from, if any (named in the chat context). */
  focusTaskId?: string | null;
  slack?: { channelId: string; threadTs: string };
  /** Pictures the person attached (already checked: src/lib/dispatch/images.ts). */
  images?: { mediaType: ToolImage["mediaType"]; data: string }[];
  emit: TurnEmitter;
}

export class DispatchLimitError extends Error {
  readonly status = 429;
}

type Block = Anthropic.Beta.BetaContentBlockParam;
type Param = Anthropic.Beta.BetaMessageParam;

/** "failed" = the model call failed (the person was told why); "no_key" = no Anthropic key. */
export type TurnOutcome = "answered" | "failed" | "no_key";

export async function runTurn(
  input: TurnInput,
): Promise<{ conversationId: string; outcome: TurnOutcome; model: string; clientName: string }> {
  const { emit } = input;
  // The client the chat is on. It can change mid-question (switch_client, §164), and every tool
  // after that works on the new one.
  let scope = input.scope;
  const question = input.question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!question) throw new DispatchLimitError("That came through empty. What did you want to ask?");

  if ((await questionsInLastHour(scope.user)) >= QUESTIONS_PER_HOUR) {
    throw new DispatchLimitError(
      `That's ${QUESTIONS_PER_HOUR} questions in the last hour, which is the most I take from one person (it keeps the AI bill sensible). Give it a few minutes and I'm all yours again.`,
    );
  }

  // ── The conversation ──
  let conversationId: string;
  /** Set when this question moves an existing chat to another client. */
  let movedTo: string | null = null;
  let history: { role: "user" | "assistant"; content: unknown }[] = [];
  // The model is chosen from the chat's first question and kept for the chat (model.ts).
  let model: string;
  if (input.conversationId) {
    const conv = await getOwnConversation(scope.user, input.conversationId);
    // A chat isn't locked to one client (§164): asked about another of the person's clients
    // (the caller opened a scope for it, so access is already checked), it carries on there.
    if (conv.clientId !== scope.client.id) {
      await prisma.dispatchConversation.update({ where: { id: conv.id }, data: { clientId: scope.client.id } });
      movedTo = scope.client.name;
    }
    conversationId = conv.id;
    // Chats from before the Haiku switch carry on with the model they started with.
    model = conv.model ?? DISPATCH_MODELS.deep;
    history = await loadMessages(conv.id);
    if (history.length >= MAX_CHAT_MESSAGES || roughTokens(history) >= MAX_CHAT_TOKENS) {
      throw new DispatchLimitError(
        "This chat has got long, and from here every answer gets slower and dearer. Start a new chat (the pencil, top right) and carry on: I'll still have everything in Foundry to hand.",
      );
    }
  } else {
    model = DISPATCH_MODELS[chooseDispatchTier({ question, pictures: input.images?.length ?? 0 })];
    const conv = await createConversation(scope.user, {
      clientId: scope.client.id,
      surface: scope.surface,
      title: question.replace(/\s+/g, " ").slice(0, 80),
      model,
      slackChannelId: input.slack?.channelId,
      slackThreadTs: input.slack?.threadTs,
    });
    conversationId = conv.id;
  }
  emit.conversation(conversationId);

  // ── This question ──
  const firstTurn = history.length === 0;
  const content: Block[] = [];
  if (firstTurn) {
    const focus = input.focusTaskId
      ? await prisma.task.findFirst({
          where: { id: input.focusTaskId, clientId: scope.client.id, workspaceId: scope.user.workspaceId },
          select: { id: true, title: true },
        })
      : null;
    const { ownClients, activeOnly } = await import("./own-clients");
    const { clientTeam } = await import("@/server/client-team");
    const { peopleContext } = await import("./people-context");
    const [own, team, people] = await Promise.all([
      ownClients(scope.user).then(activeOnly),
      clientTeam(scope.user.workspaceId, scope.client.id),
      peopleContext(scope.user),
    ]);
    content.push({
      type: "text",
      text: chatContext({
        askerName: scope.user.name ?? scope.user.email,
        roleLabel: ROLES.find((r) => r.id === scope.user.role)?.label ?? scope.user.role,
        askerTitle: people.askerTitle,
        leadership: people.leadership,
        clientName: scope.client.name,
        clientCount: own.length,
        room: roomFor(scope),
        team: team.map((t) => t.name),
        today: new Date().toISOString().slice(0, 10),
        focusTask: focus ? { ref: taskRef(focus.id), title: focus.title } : null,
      }),
    });
  }
  if (movedTo) {
    const { clientTeam } = await import("@/server/client-team");
    const team = (await clientTeam(scope.user.workspaceId, scope.client.id)).map((t) => t.name).slice(0, 20);
    content.push({
      type: "text",
      text: `<chat_context>\nNow on client: ${movedTo}${team.length ? `\n${movedTo}'s team: ${team.join(", ")}` : ""}\n</chat_context>`,
    });
  }
  const attached = (input.images ?? []).slice(0, MAX_IMAGES_PER_QUESTION);
  for (const img of attached) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  }
  content.push({ type: "text", text: question });
  await appendMessage(conversationId, "user", content, { question: true });
  const messages: Param[] = [...(history as Param[]), { role: "user", content }];

  // ── The key: the workspace's own Anthropic key from Settings ──
  const ws = await prisma.workspace.findUnique({
    where: { id: scope.user.workspaceId },
    select: { anthropicApiKey: true, platformAiKeysAllowed: true },
  });
  const apiKey = aiKeyFor("ANTHROPIC", ws, "workspace");
  if (!apiKey) {
    emit.notice("Dispatch needs an Anthropic key in Settings → Integrations before it can answer.");
    return { conversationId, outcome: "no_key", model, clientName: scope.client.name };
  }
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  // Haiku answers without thinking (cheapest; it isn't needed to look things up). Sonnet thinks
  // briefly, and a declined request is retried on Anthropic's fallback model in the same call;
  // Haiku 5.5 has no server-side fallback.
  const isHaiku = model === DISPATCH_MODELS.everyday;
  const modelParams = isHaiku
    ? { thinking: { type: "disabled" as const }, output_config: { effort: "low" as const } }
    : {
        thinking: { type: "adaptive" as const },
        output_config: { effort: "low" as const },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      };
  const tools = toolDefinitions() as Anthropic.Beta.BetaToolUnion[];

  // Shared by every tool call in this question: attached pictures already used some slots.
  const toolCtx = { conversationId, imagesLeft: MAX_IMAGES_PER_QUESTION - attached.length };

  // Text from an earlier round (before a lookup) and the next round's are separate paragraphs.
  let wroteText = false;

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    let roundStarted = false;
    const started = Date.now();
    let final: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Cached prefix: tools, then this exact text. Never put anything per-person here.
        system: [{ type: "text", text: DISPATCH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        // On the last allowed round the model must answer with what it has.
        ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
        messages,
        ...modelParams,
        // Automatic caching for the growing conversation.
        cache_control: { type: "ephemeral" },
      });
      stream.on("text", (delta) => {
        if (!roundStarted && wroteText) emit.text("\n\n");
        roundStarted = true;
        wroteText = true;
        emit.text(delta);
      });
      final = await stream.finalMessage();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      recordAiUsage({
        module: "DISPATCH",
        workspaceId: scope.user.workspaceId,
        userId: scope.user.id,
        operation: scope.surface,
        provider: "anthropic",
        model,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        latencyMs: Date.now() - started,
        success: false,
        errorKind: raw.slice(0, 120),
      });
      emit.notice(describeAiError(raw));
      return { conversationId, outcome: "failed", model, clientName: scope.client.name };
    }

    const usage = usageFromAnthropic(final.usage);
    recordAiUsage({
      module: "DISPATCH",
      workspaceId: scope.user.workspaceId,
      userId: scope.user.id,
      operation: scope.surface,
      provider: "anthropic",
      model: final.model || model,
      usage,
      latencyMs: Date.now() - started,
      success: final.stop_reason !== "refusal",
    });

    // Stored exactly as received, so the history replays unchanged.
    await appendMessage(conversationId, "assistant", final.content, {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cachedInputTokens,
      cacheWrite: usage.cacheWriteTokens ?? 0,
    });
    messages.push({ role: "assistant", content: final.content as Block[] });

    if (final.stop_reason === "refusal") {
      emit.text("\n\nI can't answer that one: the AI I run on turned it down. Try asking it another way, or tell me more about what you're after.");
      break;
    }
    if (final.stop_reason !== "tool_use") break;

    // ── Run every tool the model asked for, together, as the asker ──
    const calls = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    for (const c of calls) emit.status(toolStatus(c.name));
    const outcomes = await Promise.all(calls.map((c) => runTool(scope, c.name, c.input, toolCtx)));
    const results: Block[] = outcomes.map((o, i) => ({
      type: "tool_result",
      tool_use_id: calls[i].id,
      // A picture goes back with its text, for the model to look at.
      content: o.images?.length
        ? [
            { type: "text" as const, text: o.text },
            ...o.images.map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } })),
          ]
        : o.text,
      ...(o.isError ? { is_error: true } : {}),
    }));
    // Next is the last round, where no more lookups are allowed. Say so, or the model answers
    // as if mid-search (the live test got "Try the repo structure." and nothing else). A text
    // block after the tool results is append-only, so the cache and thinking are untouched.
    if (round + 1 === MAX_TOOL_ROUNDS) {
      results.push({
        type: "text",
        text: "That was your last lookup for this question. Answer now with what you found. Say plainly what you couldn't find or open and why, and what the person could do next.",
      });
    }
    for (const o of outcomes) {
      if (o.action) emit.action(o.action);
      if (o.sources?.length) emit.sources(o.sources);
    }
    // switch_client: the rest of this question, and the chat from now on, is about that client.
    const switched = outcomes.find((o) => o.switchTo)?.switchTo;
    if (switched && switched.client.id !== scope.client.id) {
      scope = switched;
      await prisma.dispatchConversation.update({ where: { id: conversationId }, data: { clientId: scope.client.id } });
      emit.client?.({ slug: scope.client.slug, name: scope.client.name });
    }
    // All results in ONE user message (splitting them teaches the model to stop calling tools
    // in parallel).
    await appendMessage(conversationId, "user", results);
    messages.push({ role: "user", content: results });
  }

  return { conversationId, outcome: "answered", model, clientName: scope.client.name };
}

/** Plain text of the latest assistant reply in stored content blocks (for Slack). */
export function replyText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return (content as { type?: string; text?: string }[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

