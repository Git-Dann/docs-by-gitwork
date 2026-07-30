/**
 * Dispatch — turning an evidence pack into an answer.
 *
 * Two layers, and the order matters:
 *
 *   1. `composeDeterministicAnswer` — a pure function over the evidence pack. This is the FLOOR.
 *      It always runs, needs no API key, and cannot hallucinate because it only formats counts
 *      and titles it was handed. If AI is unconfigured, rate-limited or broken, Dispatch still
 *      answers; it just answers plainly.
 *   2. `runAnswer` — ONE light-tier (Haiku) call, wrapped in the workspace AI-response cache,
 *      that rewrites the same facts into something readable. Cost-disciplined exactly like the
 *      Foreman narrative: stable system prompt (so it's prompt-cached), small token cap, and a
 *      cache key of (subject + question) × a hash of the evidence — so re-asking an unchanged
 *      question is free.
 *
 * The `unverified` list is NOT the model's to write. It is derived from the evidence pack's
 * blind spots and merged in afterwards; the model may only ADD caveats, never remove one. That
 * makes "it says what it couldn't confirm" a structural property rather than a prompt request
 * the model is free to ignore on a confident-sounding day.
 */

import {
  completeText,
  parseJsonObject,
  resolveAiConfig,
  type WorkspaceAiFields,
} from "@/server/ai-provider";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import type { DispatchAnswer, DispatchEvidence, EvidenceTask } from "./types";

const SYSTEM_PROMPT = `You are Dispatch, the delivery coordinator for Gitwork, a design-and-build
agency. A teammate has asked you a question in Slack. You are given a QUESTION and an EVIDENCE
pack gathered deterministically from Foundry (the agency's system of record).

Your single hard rule: you may only state what is in the evidence pack. You did not look anything
up and you cannot check anything. If the evidence does not settle the question, say plainly that
it doesn't.

Rules:
  - Never infer that work is complete, on track, or fine. "No overdue tasks" is only meaningful
    if tasks have due dates — the pack tells you when they don't.
  - Never invent task names, people, dates, clients or numbers. Only use what is in the pack.
  - Quote specifics: task titles, counts, dates, owners. A coordinator's value is precision.
  - If "truncated" is true, the lists are capped — say "at least N", never imply you listed all.
  - If the pack is thin or empty, say so directly. That is a useful answer, not a failure.
  - "headline": ONE sentence — the honest state of the thing asked about.
  - "bullets": 2-6 short lines of supporting specifics, most important first. Slack mrkdwn is
    allowed (*bold*, \`code\`). No markdown headings, no numbered lists.
  - "unverified": anything you deliberately are NOT claiming, and why. Leave it empty if the
    evidence genuinely settles the question — caveats already derived from the data are added
    for you, so only add ones you spotted yourself.

Respond with ONLY a JSON object: { "headline": "...", "bullets": ["..."], "unverified": ["..."] }.`;

const MAX_BULLETS = 6;
const MAX_UNVERIFIED = 6;

// ─── Deterministic floor ────────────────────────────────────────────────────

function taskLine(t: EvidenceTask, opts: { showDue?: boolean; showOwner?: boolean } = {}): string {
  const bits = [`*${t.title}*`];
  if (opts.showOwner && t.assignees.length > 0) bits.push(`— ${t.assignees.join(", ")}`);
  if (opts.showDue && t.dueDate) bits.push(`(due ${t.dueDate.slice(0, 10)})`);
  if (t.blockedReason) bits.push(`— blocked: ${t.blockedReason}`);
  return bits.join(" ");
}

/**
 * A complete, honest answer with no AI involved. Pure — exported for unit tests and used
 * verbatim whenever the AI path is unavailable.
 */
export function composeDeterministicAnswer(ev: DispatchEvidence): DispatchAnswer {
  const c = ev.counts;
  const label = ev.subject.label;
  const bullets: string[] = [];

  if (c.overdue > 0) {
    bullets.push(
      `${c.overdue} overdue: ${ev.overdue.slice(0, 3).map((t) => taskLine(t, { showDue: true })).join("; ")}`,
    );
  }
  if (c.blocked > 0) {
    bullets.push(`${c.blocked} blocked: ${ev.blocked.slice(0, 3).map((t) => taskLine(t)).join("; ")}`);
  }
  if (c.doing > 0) {
    bullets.push(
      `${c.doing} in flight: ${ev.doing.slice(0, 3).map((t) => taskLine(t, { showOwner: true })).join("; ")}`,
    );
  }
  if (c.dueSoon > 0) {
    bullets.push(
      `${c.dueSoon} due soon: ${ev.dueSoon.slice(0, 3).map((t) => taskLine(t, { showDue: true })).join("; ")}`,
    );
  }
  if (c.doneInWindow > 0) {
    bullets.push(
      `${c.doneInWindow} completed recently: ${ev.recentlyDone.slice(0, 3).map((t) => taskLine(t)).join("; ")}`,
    );
  }
  for (const f of ev.foremanFindings.slice(0, 2)) {
    bullets.push(`Foreman flagged: ${f.headline}`);
  }

  let headline: string;
  if (c.openTasks === 0 && c.doneInWindow === 0) {
    headline = `Nothing tracked for ${label} on the board right now.`;
  } else if (c.overdue > 0) {
    headline = `${label}: ${c.overdue} overdue, ${c.doing} in flight, ${c.openTasks} open in total.`;
  } else {
    headline = `${label}: ${c.doing} in flight, ${c.dueSoon} due soon, ${c.openTasks} open in total.`;
  }

  return {
    headline,
    bullets: bullets.slice(0, MAX_BULLETS),
    unverified: derivedCaveats(ev),
  };
}

/** The caveats the evidence itself demands. Never model-authored, never droppable. */
function derivedCaveats(ev: DispatchEvidence): string[] {
  const out = ev.blindSpots.map((b) => b.detail);
  if (ev.truncated) {
    out.push("Lists are capped — there may be more items than shown.");
  }
  return out.slice(0, MAX_UNVERIFIED);
}

// ─── AI layer ───────────────────────────────────────────────────────────────

/**
 * Compact, order-stable projection of the evidence for the model + the cache key. Dropping ids
 * and keeping only what's answerable keeps the prompt small and the cache hit-rate high (an
 * unchanged board re-answers for £0).
 */
function promptInputs(ev: DispatchEvidence) {
  const t = (list: EvidenceTask[]) =>
    list.map((x) => ({
      title: x.title,
      status: x.status,
      due: x.dueDate?.slice(0, 10) ?? null,
      done: x.completedAt?.slice(0, 10) ?? null,
      owners: x.assignees,
      client: x.clientName,
      block: x.blockName,
      blocked: x.blockedReason,
    }));
  return {
    subject: { kind: ev.subject.kind, label: ev.subject.label },
    asOf: ev.asOf.slice(0, 10),
    counts: ev.counts,
    truncated: ev.truncated,
    client: ev.client,
    overdue: t(ev.overdue),
    doing: t(ev.doing),
    dueSoon: t(ev.dueSoon),
    recentlyDone: t(ev.recentlyDone),
    blocked: t(ev.blocked),
    blocks: ev.blocks.map((b) => ({
      name: b.name,
      start: b.startDate?.slice(0, 10) ?? null,
      end: b.endDate?.slice(0, 10) ?? null,
      progress: b.totalTasks > 0 ? `${b.doneTasks}/${b.totalTasks}` : "no tasks",
    })),
    milestones: ev.milestones.map((m) => ({ name: m.name, date: m.date.slice(0, 10) })),
    meetings: ev.meetings.map((m) => ({
      title: m.title,
      when: m.startedAt?.slice(0, 10) ?? null,
      summary: m.summary?.slice(0, 600) ?? null,
      decisions: m.decisions,
      openActions: m.openActionItems,
    })),
    documents: ev.documents.map((d) => ({
      title: d.title,
      type: d.type,
      status: d.status,
      accepted: d.acceptedAt?.slice(0, 10) ?? null,
      firstViewed: d.firstViewedAt?.slice(0, 10) ?? null,
    })),
    foreman: ev.foremanFindings,
    blindSpots: ev.blindSpots,
  };
}

interface RawAnswer {
  headline?: unknown;
  bullets?: unknown;
  unverified?: unknown;
}

function strings(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, cap);
}

export interface AnswerResult {
  answer: DispatchAnswer;
  aiModel: string | null;
  cached: boolean;
  /** True when the AI path was skipped or failed and the deterministic floor was served. */
  fellBack: boolean;
}

export async function runAnswer(opts: {
  workspaceId: string;
  aiFields: WorkspaceAiFields;
  question: string;
  evidence: DispatchEvidence;
}): Promise<AnswerResult> {
  const floor = composeDeterministicAnswer(opts.evidence);
  const config = resolveAiConfig(opts.aiFields);

  if (!config.apiKey) {
    return { answer: floor, aiModel: null, cached: false, fellBack: true };
  }

  const inputs = promptInputs(opts.evidence);
  const subject = opts.evidence.subject;
  const subjectKey = subject.kind === "workspace" ? "workspace" : `${subject.kind}:${subject.id}`;
  // Question in the cache KEY (so different questions coexist), evidence in the HASH (so a
  // changed board invalidates). Same question + unchanged board = free.
  const cacheKey = `dispatch-answer:${subjectKey}:${hashInputs(opts.question.toLowerCase().trim())}`;

  let result: Awaited<ReturnType<typeof cachedOrCompute<{ raw: RawAnswer | null }>>> = null;
  try {
    result = await cachedOrCompute<{ raw: RawAnswer | null }>({
      workspaceId: opts.workspaceId,
      cacheKey,
      inputsHash: hashInputs(inputs),
      compute: async () => {
        const text = await completeText({
          config,
          system: SYSTEM_PROMPT,
          user: JSON.stringify({ question: opts.question, evidence: inputs }),
          maxTokens: 900,
          tier: "light",
          usageContext: { module: "SLACK", workspaceId: opts.workspaceId, operation: "dispatch-answer" },
        });
        return { response: { raw: parseJsonObject<RawAnswer>(text) }, modelUsed: config.model };
      },
    });
  } catch (err) {
    // A broken AI path must never cost the asker their answer — serve the floor.
    console.warn("[dispatch] answer generation failed", (err as Error).message);
    return { answer: floor, aiModel: null, cached: false, fellBack: true };
  }

  const raw = result?.response.raw;
  const headline = typeof raw?.headline === "string" ? raw.headline.trim() : "";
  const bullets = strings(raw?.bullets, MAX_BULLETS);

  if (!headline && bullets.length === 0) {
    return { answer: floor, aiModel: result?.modelUsed ?? null, cached: result?.cached ?? false, fellBack: true };
  }

  // Derived caveats are authoritative and go first; the model may only append.
  const derived = derivedCaveats(opts.evidence);
  const modelAdded = strings(raw?.unverified, MAX_UNVERIFIED).filter((u) => !derived.includes(u));

  return {
    answer: {
      headline: headline || floor.headline,
      bullets: bullets.length > 0 ? bullets : floor.bullets,
      unverified: [...derived, ...modelAdded].slice(0, MAX_UNVERIFIED),
    },
    aiModel: result?.modelUsed ?? null,
    cached: result?.cached ?? false,
    fellBack: false,
  };
}
