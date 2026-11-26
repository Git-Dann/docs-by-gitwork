/**
 * Dispatch talking when there's no client to go on (§167): a Slack channel that isn't a client's
 * own, or someone who isn't on any clients yet. Dan, 26 Nov 2026: "we do not have canned
 * responses... it needs to be more open in its conversation, not necessarily in its context".
 *
 * This used to be a fixed "Which client is this about? You're on A, B, C…" reply, which also
 * listed the person's clients in front of the whole channel. Now it's one model call, on the
 * cheap model, with the same cached prefix as every other question, and `tool_choice: none`:
 * nothing is looked up, so nothing about any client can come out of it. The context tells the
 * model where it is and to point project questions at the client's channel or a DM.
 *
 * Not stored as a chat (a chat belongs to a client); the Slack thread it's in is read instead,
 * so a reply in the thread still follows on (§172).
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { DISPATCH_SYSTEM_PROMPT, noClientContext, ukNow } from "@/lib/dispatch/prompt";
import { MAX_QUESTION_CHARS } from "@/lib/dispatch/limits";
import { DISPATCH_MODELS } from "@/server/ai-provider";
import { aiKeyFor } from "@/server/ai-keys";
import { recordAiUsage, usageFromAnthropic } from "@/server/ai-usage";
import { describeAiError } from "@/lib/ai-error-words";
import { ROLES } from "@/types/auth";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { toolDefinitions } from "./tools";

/** A short reply is the point; this caps a runaway one. */
const SMALL_TALK_MAX_TOKENS = 600;

export async function chatWithoutClient(input: {
  user: EffectiveUser;
  question: string;
  where: "channel" | "no_clients";
  /** The thread or the channel's recent messages, wrapped as a <source> (§172): its only memory. */
  slackContext?: string | null;
}): Promise<{ text: string; model: string; ok: boolean }> {
  const model = DISPATCH_MODELS.everyday;
  const ws = await prisma.workspace.findUnique({
    where: { id: input.user.workspaceId },
    select: { anthropicApiKey: true, platformAiKeysAllowed: true },
  });
  const apiKey = aiKeyFor("ANTHROPIC", ws, "workspace");
  if (!apiKey) {
    return { text: "I'd love to chat, but nobody's given me an Anthropic key yet. It goes in Foundry under Settings → Integrations.", model, ok: false };
  }
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const { peopleContext } = await import("./people-context");
  const { listMemories } = await import("./memory");
  const [people, memories] = await Promise.all([peopleContext(input.user), listMemories(input.user)]);
  const started = Date.now();
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: SMALL_TALK_MAX_TOKENS,
      // The same cached prefix as every question (system prompt, then tools); with
      // tool_choice none the tools are there for the cache, never called.
      system: [{ type: "text", text: DISPATCH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions() as Anthropic.Beta.BetaToolUnion[],
      tool_choice: { type: "none" },
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: noClientContext({
                askerName: input.user.name ?? input.user.email,
                roleLabel: ROLES.find((r) => r.id === input.user.role)?.label ?? input.user.role,
                askerTitle: people.askerTitle,
                leadership: people.leadership,
                memories: memories.map((m) => m.text),
                today: ukNow(),
                where: input.where,
              }),
            },
            ...(input.slackContext ? [{ type: "text" as const, text: input.slackContext }] : []),
            { type: "text", text: input.question.trim().slice(0, MAX_QUESTION_CHARS) },
          ],
        },
      ],
    });
    recordAiUsage({
      module: "DISPATCH",
      workspaceId: input.user.workspaceId,
      userId: input.user.id,
      operation: "slack",
      provider: "anthropic",
      model: res.model || model,
      usage: usageFromAnthropic(res.usage),
      latencyMs: Date.now() - started,
      success: res.stop_reason !== "refusal",
    });
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { text: text || "I'm here, but I came up blank on that one. Try me again?", model, ok: Boolean(text) };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    recordAiUsage({
      module: "DISPATCH",
      workspaceId: input.user.workspaceId,
      userId: input.user.id,
      operation: "slack",
      provider: "anthropic",
      model,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      latencyMs: Date.now() - started,
      success: false,
      errorKind: raw.slice(0, 120),
    });
    return { text: describeAiError(raw), model, ok: false };
  }
}
