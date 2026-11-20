/**
 * Drafts a client's weekly update (rules in src/lib/weekly-update.ts). Never sends anything.
 *
 * The AI pass is one standard-tier call, cached on the week's facts, so opening the same week
 * again costs nothing until something changes. Without AI (no key, no permission, a failed call
 * or a reply that fails the checks) the plain draft is returned, with the reason in words.
 */

import { prisma } from "@/lib/prisma";
import { describeAiError } from "@/lib/ai-error-words";
import { completeText, parseJsonObject, resolveAiConfig } from "@/server/ai-provider";
import { getCachedAiResponse, hashInputs, setCachedAiResponse } from "@/server/ai-cache";
import { canGenerateAi, type EffectiveUser } from "@/server/auth/effective-user";
import { loadDeliveryTimeline } from "@/server/client-delivery-timeline";
import {
  WEEKLY_UPDATE_SYSTEM,
  parseWeeklyDraft,
  plainDraft,
  promptFacts,
  weeklyFacts,
  type WeeklyDraft,
  type WeeklyUpdateResult,
} from "@/lib/weekly-update";

export type { WeeklyUpdateResult } from "@/lib/weekly-update";

export async function draftWeeklyUpdate(
  user: EffectiveUser,
  clientId: string,
  opts: { week: "this" | "last"; regenerate?: boolean; now?: Date },
): Promise<WeeklyUpdateResult | null> {
  const now = opts.now ?? new Date();
  const timeline = await loadDeliveryTimeline(user.workspaceId, clientId, { weeks: 2, now });
  if (!timeline) return null;
  const week = timeline.weeks[opts.week === "last" ? 1 : 0] ?? timeline.weeks[0];
  const author = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
  const facts = weeklyFacts(timeline, week, { author: author?.name ?? "", now });
  const to = timeline.contacts.map((c) => c.email).filter((e): e is string => Boolean(e));
  const plain = plainDraft(facts);
  const base = { facts, to, week: { start: week.start, label: week.label }, failed: timeline.failed };

  if (!canGenerateAi(user)) {
    return { ...base, draft: plain, source: "plain", reason: "You don't have AI drafting, so this is the plain version.", cached: false };
  }

  const cacheKey = `weekly-update:${clientId}:${week.start}`;
  const inputsHash = hashInputs(facts);
  if (!opts.regenerate) {
    const hit = await getCachedAiResponse<WeeklyDraft>({ workspaceId: user.workspaceId, cacheKey, inputsHash });
    if (hit) return { ...base, draft: hit.response, source: "ai", reason: null, cached: true };
  }

  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: user.workspaceId },
    select: {
      aiProvider: true,
      anthropicApiKey: true,
      platformAiKeysAllowed: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });
  const config = resolveAiConfig(ws);
  if (!config.apiKey && config.provider !== "LOCAL") {
    return { ...base, draft: plain, source: "plain", reason: "No AI provider is set up, so this is the plain version.", cached: false };
  }

  try {
    const raw = await completeText({
      config,
      system: WEEKLY_UPDATE_SYSTEM,
      user: `The facts of the week:\n${promptFacts(facts)}`,
      maxTokens: 1400,
      usageContext: { module: "OTHER", workspaceId: user.workspaceId, userId: user.id, operation: "portal.weekly_update" },
    });
    const draft = parseWeeklyDraft(parseJsonObject<unknown>(raw), facts);
    if (!draft) {
      return { ...base, draft: plain, source: "plain", reason: "The AI draft didn't pass the checks, so this is the plain version.", cached: false };
    }
    await setCachedAiResponse({ workspaceId: user.workspaceId, cacheKey, inputsHash, response: draft, modelUsed: config.model });
    return { ...base, draft, source: "ai", reason: null, cached: false };
  } catch (err) {
    return { ...base, draft: plain, source: "plain", reason: `${describeAiError(err instanceof Error ? err.message : String(err))} This is the plain version.`, cached: false };
  }
}
