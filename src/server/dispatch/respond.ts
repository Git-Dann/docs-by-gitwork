/**
 * Dispatch — the orchestrator. question in, grounded answer out.
 *
 * Order is deliberate: every cheap, deterministic gate runs before anything that costs money or
 * discloses anything. Disabled → stop. External channel → stop. Rate limited → stop. No subject
 * matched → stop and SAY SO (an answer about the wrong client is the worst possible output).
 * Only then do we gather evidence, and only then does a token get spent.
 */

import { prisma } from "@/lib/prisma";
import { TEAM_ROSTER, normalizeRosterName } from "@/lib/team-roster-aliases";
import type { WorkspaceAiFields } from "@/server/ai-provider";
import { runAnswer } from "./answer";
import { resolveDispatchConfig } from "./config";
import { gatherEvidence } from "./evidence";
import { resolveSubject, type ClientCandidate, type PersonCandidate } from "./resolve";
import type { DispatchConfig, DispatchResult } from "./types";

const AI_FIELDS = {
  aiProvider: true,
  anthropicApiKey: true,
  anthropicModel: true,
  openaiApiKey: true,
  openaiModel: true,
  geminiApiKey: true,
  geminiModel: true,
  localLlmUrl: true,
  localLlmModel: true,
} as const;

export interface AnswerQuestionArgs {
  workspaceId: string;
  question: string;
  /** Slack channel the question came from — the rate-limit bucket. */
  channelId: string;
  /** True when the channel is externally shared (Slack Connect). Gated separately. */
  isExternalChannel?: boolean;
  now?: Date;
}

export async function answerQuestion(args: AnswerQuestionArgs): Promise<DispatchResult> {
  const now = args.now ?? new Date();
  const empty = { subject: null, answer: null, evidence: null, aiModel: null, cached: false };

  const ws = await prisma.workspace.findUnique({
    where: { id: args.workspaceId },
    select: { id: true, dispatchConfig: true, ...AI_FIELDS },
  });
  if (!ws) return { ...empty, status: "error", message: "Workspace not found." };

  const config = resolveDispatchConfig(ws.dispatchConfig);
  if (!config.enabled) {
    return { ...empty, status: "error", message: "Dispatch is switched off for this workspace." };
  }

  // Internal delivery state is not client-facing. This is a disclosure gate, not a preference.
  if (args.isExternalChannel && !config.allowExternalChannels) {
    return {
      ...empty,
      status: "error",
      message:
        "This is a shared channel with people outside Gitwork, so I won't post internal delivery detail here. Ask me in an internal channel or a DM.",
    };
  }

  if (!(await withinRateLimit(args.workspaceId, args.channelId, config, now))) {
    return {
      ...empty,
      status: "rate_limited",
      message: `That's more than ${config.perChannelPerHour} questions in this channel in an hour — give me a moment.`,
    };
  }

  const question = args.question.trim();
  if (!question) {
    return {
      ...empty,
      status: "no_subject",
      message: "Ask me about a client or a teammate — e.g. “where are we with Acme?”.",
    };
  }

  const candidates = await loadCandidates(args.workspaceId);
  const resolved = resolveSubject(question, candidates);

  if (!resolved.subject) {
    return {
      ...empty,
      status: "no_subject",
      message:
        "I couldn't tell which client or person that's about. Name one explicitly — e.g. “where are we with Acme?” or “what has Priya been working on?”.",
    };
  }

  const evidence = await gatherEvidence({
    workspaceId: args.workspaceId,
    subject: resolved.subject,
    personFilter: resolved.personFilter,
    config,
    now,
  });

  const { answer, aiModel, cached } = await runAnswer({
    workspaceId: args.workspaceId,
    aiFields: ws as WorkspaceAiFields,
    question,
    evidence,
  });

  return { status: "answered", subject: resolved.subject, answer, evidence, aiModel, cached, message: null };
}

/**
 * Per-channel budget over a rolling hour. Counts every exchange row regardless of outcome — a
 * flood of unanswerable questions costs DB work and Slack calls too, so it has to count.
 */
async function withinRateLimit(
  workspaceId: string,
  channelId: string,
  config: DispatchConfig,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const used = await prisma.dispatchExchange.count({
    where: { workspaceId, channelId, createdAt: { gte: since } },
  });
  return used <= config.perChannelPerHour;
}

/** Clients and teammates a question could be about. Archived clients stay in — "what happened
 *  with X?" about a wrapped-up project is a fair question. */
async function loadCandidates(
  workspaceId: string,
): Promise<{ clients: ClientCandidate[]; people: PersonCandidate[] }> {
  const [clients, members] = await Promise.all([
    prisma.workspaceClient.findMany({
      where: { workspaceId },
      select: { id: true, name: true, slug: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  // The roster carries the alternate spellings people actually type ("Aashir" for
  // "Mohammad Aashir"), keyed by email so it survives display-name drift in the User row.
  const aliasByEmail = new Map<string, string[]>();
  for (const entry of TEAM_ROSTER) {
    if (entry.aliases?.length) aliasByEmail.set(entry.email.toLowerCase(), entry.aliases);
  }

  const people: PersonCandidate[] = [];
  for (const m of members) {
    const u = m.user;
    if (!u?.email) continue;
    const name = u.name?.trim() || u.email.split("@")[0];
    const aliases = aliasByEmail.get(u.email.toLowerCase()) ?? [];
    // A bare first name is how people actually refer to each other, but only when it's
    // unambiguous across the workspace — otherwise "Ali" could be three people.
    people.push({ id: u.id, name, email: u.email, aliases });
  }

  const firstNameCounts = new Map<string, number>();
  for (const p of people) {
    const first = normalizeRosterName(p.name).split(" ")[0];
    if (first) firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }
  for (const p of people) {
    const first = normalizeRosterName(p.name).split(" ")[0];
    if (first && firstNameCounts.get(first) === 1 && !p.aliases?.includes(first)) {
      p.aliases = [...(p.aliases ?? []), first];
    }
  }

  return { clients, people };
}
