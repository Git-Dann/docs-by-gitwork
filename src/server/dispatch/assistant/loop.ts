/**
 * One Dispatch question, start to finish: the model reads with tools, proposes changes, and
 * answers, streaming as it goes. Used by the in-app panel and by Slack.
 *
 * Cost (a $200 pot shared with every AI feature):
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
import { DISPATCH_SYSTEM_PROMPT, chatContext } from "@/lib/dispatch/prompt";
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
import { DISPATCH_MODEL } from "@/server/ai-provider";
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

export async function runTurn(input: TurnInput): Promise<{ conversationId: string; outcome: TurnOutcome }> {
  const { scope, emit } = input;
  const question = input.question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!question) throw new DispatchLimitError("Ask me something first.");

  if ((await questionsInLastHour(scope.user)) >= QUESTIONS_PER_HOUR) {
    throw new DispatchLimitError(`That's ${QUESTIONS_PER_HOUR} questions in an hour. Give it a little while.`);
  }

  // ── The conversation ──
  let conversationId: string;
  let history: { role: "user" | "assistant"; content: unknown }[] = [];
  if (input.conversationId) {
    const conv = await getOwnConversation(scope.user, input.conversationId);
    if (conv.clientId !== scope.client.id) {
      throw new DispatchLimitError("This chat is about a different client. Start a new one.");
    }
    conversationId = conv.id;
    history = await loadMessages(conv.id);
    if (history.length >= MAX_CHAT_MESSAGES || roughTokens(history) >= MAX_CHAT_TOKENS) {
      throw new DispatchLimitError("This chat has got long. Start a new one to keep answers quick and cheap.");
    }
  } else {
    const conv = await createConversation(scope.user, {
      clientId: scope.client.id,
      surface: scope.surface,
      title: question.replace(/\s+/g, " ").slice(0, 80),
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
    content.push({
      type: "text",
      text: chatContext({
        askerName: scope.user.name ?? scope.user.email,
        roleLabel: ROLES.find((r) => r.id === scope.user.role)?.label ?? scope.user.role,
        clientName: scope.client.name,
        today: new Date().toISOString().slice(0, 10),
        focusTask: focus ? { ref: taskRef(focus.id), title: focus.title } : null,
      }),
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
    return { conversationId, outcome: "no_key" };
  }
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const tools = toolDefinitions() as Anthropic.Beta.BetaToolUnion[];

  // Shared by every tool call in this question: attached pictures already used some slots.
  const toolCtx = { conversationId, imagesLeft: MAX_IMAGES_PER_QUESTION - attached.length };

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    const started = Date.now();
    let final: Anthropic.Beta.BetaMessage;
    try {
      const stream = client.beta.messages.stream({
        model: DISPATCH_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Cached prefix: tools, then this exact text. Never put anything per-person here.
        system: [{ type: "text", text: DISPATCH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        // On the last allowed round the model must answer with what it has.
        ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        // Automatic caching for the growing conversation.
        cache_control: { type: "ephemeral" },
        // A declined request is retried on Anthropic's fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      stream.on("text", (delta) => emit.text(delta));
      final = await stream.finalMessage();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      recordAiUsage({
        module: "DISPATCH",
        workspaceId: scope.user.workspaceId,
        userId: scope.user.id,
        operation: scope.surface,
        provider: "anthropic",
        model: DISPATCH_MODEL,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        latencyMs: Date.now() - started,
        success: false,
        errorKind: raw.slice(0, 120),
      });
      emit.notice(describeAiError(raw));
      return { conversationId, outcome: "failed" };
    }

    const usage = usageFromAnthropic(final.usage);
    recordAiUsage({
      module: "DISPATCH",
      workspaceId: scope.user.workspaceId,
      userId: scope.user.id,
      operation: scope.surface,
      provider: "anthropic",
      model: final.model || DISPATCH_MODEL,
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
      emit.text("\n\nI can't help with that one.");
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
    for (const o of outcomes) {
      if (o.action) emit.action(o.action);
      if (o.sources?.length) emit.sources(o.sources);
    }
    // All results in ONE user message (splitting them teaches the model to stop calling tools
    // in parallel).
    await appendMessage(conversationId, "user", results);
    messages.push({ role: "user", content: results });
  }

  return { conversationId, outcome: "answered" };
}

/** Plain text of the latest assistant reply in stored content blocks (for Slack). */
export function replyText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return (content as { type?: string; text?: string }[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

