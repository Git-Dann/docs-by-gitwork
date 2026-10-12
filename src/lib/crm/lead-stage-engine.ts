/**
 * The CRM's lead-stage rules — pure, so each rule is a unit test rather than a judgement call.
 *
 * Two kinds of evidence, treated differently on purpose:
 *
 *  - FACTS move the stage automatically. Something observably happened: an email either way, a
 *    meeting took place, a proposal was drafted / shared / accepted / declined, a contract went
 *    out or was signed, or a person logged a call/email/meeting by hand.
 *  - WORDING only ever produces a SUGGESTION (`normaliseSuggestions`). "We're going ahead" in an
 *    email is strong, but it is a reading — an automatic LOST from a misread reply is the
 *    expensive mistake. A suggestion waits for a click.
 *
 * Internal Slack is never a fact. Gitwork talking about a lead is not contact with the lead.
 *
 * The pipeline (agreed Oct 2026):
 *
 *   New · Contacted · Discovery · Qualified · Scoping · Proposal sent · In discussion ·
 *   Contract out · Won · Lost · On hold
 *
 *   Contacted      ← an email either way, or a call/email logged by hand        (fact)
 *   Discovery      ← a meeting with them took place                             (fact)
 *   Qualified      ← need / budget / timeline confirmed                         (suggestion only)
 *   Scoping        ← a proposal for them exists in Docs (drafted)               (fact)
 *   Proposal sent  ← that proposal was shared with them                         (fact)
 *   In discussion  ← they emailed us AFTER the latest proposal was shared       (fact)
 *   Contract out   ← an e-signature request went out (sent / completed)         (fact)
 *   Won            ← a proposal accepted, or a signature request completed      (fact)
 *   Lost           ← the latest proposal event is a decline                     (fact)
 *   On hold        ← "not now, come back in Q2"                                 (suggestion only)
 *
 * Rules every automatic move satisfies (all in `decideStageMove`):
 *  1. A PINNED stage (set by hand) is never touched.
 *  2. WON is never left automatically.
 *  3. Ordinary progress only moves FORWARD. Old evidence still counts — switching automation on
 *     catches a lead up to where its history shows it got to.
 *  4. Leaving LOST needs evidence NEWER than the moment it became LOST: an acceptance / signed
 *     contract (→ WON), a contract out, or a fresh proposal. An unknown "since" never leaves it.
 *  5. Leaving ON HOLD needs ANY fact newer than the hold; the lead then resumes at the furthest
 *     stage its whole history supports.
 *  6. A decline only marks a lead LOST if it is the latest proposal event AND newer than the
 *     current stage — an old decline must not override a decision made after it.
 */

import type { LeadStage } from "@/types/client";

export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "New lead",
  CONTACTED: "Contacted",
  DISCOVERY: "Discovery",
  QUALIFIED: "Qualified",
  SCOPING: "Scoping",
  PROPOSAL_SENT: "Proposal sent",
  IN_DISCUSSION: "In discussion",
  CONTRACT_SENT: "Contract out",
  WON: "Won",
  LOST: "Lost",
  ON_HOLD: "On hold",
};

/**
 * Display order — the pipeline left to right, outcomes last. THE single list of stages: the Zod
 * schema, MCP's tool schema and every picker read this, and a test pins it to the Prisma enum, so
 * a stage added in one place and forgotten in another fails CI instead of silently 400ing.
 */
export const LEAD_STAGES = [
  "NEW",
  "CONTACTED",
  "DISCOVERY",
  "QUALIFIED",
  "SCOPING",
  "PROPOSAL_SENT",
  "IN_DISCUSSION",
  "CONTRACT_SENT",
  "WON",
  "LOST",
  "ON_HOLD",
] as const satisfies readonly LeadStage[];

/** How each stage is reached — rendered beside the picker so nobody has to guess. */
export const STAGE_TRIGGER: Record<LeadStage, { how: "fact" | "suggestion" | "manual"; when: string }> = {
  NEW: { how: "manual", when: "Lead created" },
  CONTACTED: { how: "fact", when: "An email either way, or a call logged" },
  DISCOVERY: { how: "fact", when: "A meeting with them took place" },
  QUALIFIED: { how: "suggestion", when: "Need, budget or timeline confirmed" },
  SCOPING: { how: "fact", when: "A proposal for them exists in Docs" },
  PROPOSAL_SENT: { how: "fact", when: "The proposal is shared with them" },
  IN_DISCUSSION: { how: "fact", when: "They reply after the proposal" },
  CONTRACT_SENT: { how: "fact", when: "A contract goes out for signature" },
  WON: { how: "fact", when: "Proposal accepted or contract signed" },
  LOST: { how: "fact", when: "Latest proposal declined" },
  ON_HOLD: { how: "suggestion", when: "They've said “not now”" },
};

/** Rank on the ordinary ladder. WON / LOST / ON_HOLD are outcomes, handled by explicit rules. */
const LADDER_RANK: Record<LeadStage, number> = {
  NEW: 0,
  CONTACTED: 1,
  DISCOVERY: 2,
  QUALIFIED: 3,
  SCOPING: 4,
  PROPOSAL_SENT: 5,
  IN_DISCUSSION: 6,
  CONTRACT_SENT: 7,
  WON: -1,
  LOST: -1,
  ON_HOLD: -1,
};

export function isLadderStage(stage: LeadStage): boolean {
  return LADDER_RANK[stage] >= 0;
}

export type FactKind =
  | "contact"
  | "meeting"
  | "proposal_drafted"
  | "proposal_shared"
  | "proposal_accepted"
  | "proposal_declined"
  | "contract_sent"
  | "contract_signed";

export interface StageFact {
  kind: FactKind;
  at: Date;
  /** Plain-English description of the evidence — becomes the "why" on the stage move. */
  label: string;
  /** For contact facts: "inbound" means THEY emailed us. Only a synced email knows this. */
  direction?: "inbound" | "outbound" | null;
}

/** The fields of a stored touchpoint the engine reads. */
export interface TouchpointLike {
  type: string;
  source: string | null;
  direction: string | null;
  externalId: string | null;
  note: string | null;
  occurredAt: Date;
}

/** `<documentId>:<event>` (proposals) and `sig:<requestId>:<event>` (contracts) — our own format. */
const DOCUMENT_EVENTS: Record<string, FactKind> = {
  drafted: "proposal_drafted",
  shared: "proposal_shared",
  accepted: "proposal_accepted",
  declined: "proposal_declined",
  contract_sent: "contract_sent",
  contract_signed: "contract_signed",
};

/** Turn one stored touchpoint into a fact, or null when it is not evidence of anything. */
export function factFromTouchpoint(t: TouchpointLike): StageFact | null {
  const note = t.note?.trim() || null;

  // Logged by hand — a person is attesting it happened. Direction is unknown.
  if (!t.source) {
    if (t.type === "CALL") return { kind: "contact", at: t.occurredAt, label: note ? `Call logged: ${note}` : "Call logged", direction: null };
    if (t.type === "EMAIL") return { kind: "contact", at: t.occurredAt, label: note ? `Email logged: ${note}` : "Email logged", direction: null };
    if (t.type === "MEETING") return { kind: "meeting", at: t.occurredAt, label: note ? `Meeting logged: ${note}` : "Meeting logged" };
    return null;
  }

  if (t.source === "gmail") {
    if (t.direction === "inbound") return { kind: "contact", at: t.occurredAt, label: note ? `Email from them: “${note}”` : "Email from them", direction: "inbound" };
    if (t.direction === "outbound") return { kind: "contact", at: t.occurredAt, label: note ? `Email to them: “${note}”` : "Email to them", direction: "outbound" };
    return null;
  }

  if (t.source === "meeting") {
    return { kind: "meeting", at: t.occurredAt, label: note ? `Meeting: ${note}` : "Meeting held" };
  }

  if (t.source === "document") {
    const event = t.externalId?.split(":").pop() ?? "";
    const kind = DOCUMENT_EVENTS[event];
    return kind ? { kind, at: t.occurredAt, label: note ?? "Document event" } : null;
  }

  return null;
}

export type StageDecision =
  | { move: true; to: LeadStage; reason: string; factAt: Date }
  | { move: false; why: "pinned" | "won" | "lost_held" | "on_hold" | "no_facts" | "no_change" };

function latest(facts: readonly StageFact[], kinds: readonly FactKind[]): StageFact | null {
  let best: StageFact | null = null;
  for (const f of facts) if (kinds.includes(f.kind) && (!best || f.at > best.at)) best = f;
  return best;
}

/** The furthest ladder stage the evidence supports, with the fact that supports it. */
export function ladderTarget(facts: readonly StageFact[]): { stage: LeadStage; fact: StageFact } | null {
  const contract = latest(facts, ["contract_sent"]);
  if (contract) return { stage: "CONTRACT_SENT", fact: contract };

  const shared = latest(facts, ["proposal_shared"]);
  if (shared) {
    // In discussion = THEY wrote to us after the proposal went out. Our own chasing doesn't count.
    let reply: StageFact | null = null;
    for (const f of facts) {
      if (f.kind === "contact" && f.direction === "inbound" && f.at > shared.at && (!reply || f.at > reply.at)) reply = f;
    }
    if (reply) return { stage: "IN_DISCUSSION", fact: reply };
    return { stage: "PROPOSAL_SENT", fact: shared };
  }

  const drafted = latest(facts, ["proposal_drafted"]);
  if (drafted) return { stage: "SCOPING", fact: drafted };
  const meeting = latest(facts, ["meeting"]);
  if (meeting) return { stage: "DISCOVERY", fact: meeting };
  const contact = latest(facts, ["contact"]);
  if (contact) return { stage: "CONTACTED", fact: contact };
  return null;
}

/** Decide whether the facts move the lead, and to what. Never mutates anything. */
export function decideStageMove(input: {
  current: LeadStage | null;
  pinned: boolean;
  /** When the current stage was set. Null = unknown (stages set before the CRM existed). */
  stageSince: Date | null;
  facts: readonly StageFact[];
}): StageDecision {
  if (input.pinned) return { move: false, why: "pinned" };
  const current: LeadStage = input.current ?? "NEW";
  if (current === "WON") return { move: false, why: "won" };
  if (input.facts.length === 0) return { move: false, why: "no_facts" };

  const facts = input.facts;
  const since = input.stageSince;
  const isNewer = (f: StageFact | null): f is StageFact => !!f && !!since && f.at > since;
  const won = latest(facts, ["proposal_accepted", "contract_signed"]);

  if (current === "LOST") {
    // Rule 4 — only fresh evidence reopens a lost lead, and an unknown "since" never does.
    if (isNewer(won)) return { move: true, to: "WON", reason: won.label, factAt: won.at };
    const contract = latest(facts, ["contract_sent"]);
    if (isNewer(contract)) return { move: true, to: "CONTRACT_SENT", reason: contract.label, factAt: contract.at };
    const shared = latest(facts, ["proposal_shared"]);
    if (isNewer(shared)) return { move: true, to: "PROPOSAL_SENT", reason: shared.label, factAt: shared.at };
    return { move: false, why: "lost_held" };
  }

  if (current === "ON_HOLD") {
    // Rule 5 — any fresh fact brings it back, to wherever the whole history says it got to.
    if (isNewer(won)) return { move: true, to: "WON", reason: won.label, factAt: won.at };
    const fresh = facts.filter((f) => isNewer(f));
    if (fresh.length === 0) return { move: false, why: "on_hold" };
    const target = ladderTarget(facts);
    if (!target) return { move: false, why: "on_hold" };
    const newest = fresh.reduce((a, b) => (b.at > a.at ? b : a));
    return { move: true, to: target.stage, reason: `Back in touch — ${newest.label}`, factAt: newest.at };
  }

  // On the ladder. An acceptance or signed contract is decisive.
  if (won) return { move: true, to: "WON", reason: won.label, factAt: won.at };

  // Rule 6 — a decline counts only as the LATEST proposal event and only if newer than the stage.
  const lastProposalEvent = latest(facts, ["proposal_shared", "proposal_declined"]);
  if (lastProposalEvent?.kind === "proposal_declined" && (!since || lastProposalEvent.at > since)) {
    return { move: true, to: "LOST", reason: lastProposalEvent.label, factAt: lastProposalEvent.at };
  }

  // Rule 3 — forward only.
  const target = ladderTarget(facts);
  if (target && LADDER_RANK[target.stage] > LADDER_RANK[current]) {
    return { move: true, to: target.stage, reason: target.fact.label, factAt: target.fact.at };
  }
  return { move: false, why: "no_change" };
}

// ── Suggestions (judgement from wording) ─────────────────────────────────────

export interface CrmSuggestion {
  stage: LeadStage;
  /** The externalId of the message the suggestion is drawn from. */
  messageId: string;
  reason: string;
}

const MAX_SUGGESTIONS = 2;
const MAX_REASON = 240;

/**
 * Validate the stages the model proposed. The model is a reader, not a decider: a stage we don't
 * have, a message it wasn't shown, or a move backwards is dropped. WON / LOST / ON_HOLD are news
 * from any open stage. From LOST or ON_HOLD any other stage is kept — they may have come back.
 */
export function normaliseSuggestions(
  raw: unknown,
  ctx: { current: LeadStage | null; validMessageIds: ReadonlySet<string> },
): CrmSuggestion[] {
  const current: LeadStage = ctx.current ?? "NEW";
  if (current === "WON") return [];
  const list = listField(raw, "suggestions");

  const out: CrmSuggestion[] = [];
  const seen = new Set<LeadStage>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { stage, messageId, reason } = item as Record<string, unknown>;
    if (typeof stage !== "string" || !(LEAD_STAGES as readonly string[]).includes(stage)) continue;
    const s = stage as LeadStage;
    if (s === "NEW" || s === current || seen.has(s)) continue;
    if (typeof messageId !== "string" || !ctx.validMessageIds.has(messageId)) continue;
    if (typeof reason !== "string" || !reason.trim()) continue;

    const keep =
      current === "LOST" || current === "ON_HOLD"
        ? true
        : !isLadderStage(s) || LADDER_RANK[s] > LADDER_RANK[current];
    if (!keep) continue;

    seen.add(s);
    out.push({ stage: s, messageId, reason: reason.trim().slice(0, MAX_REASON) });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

// ── Actions (judgement from wording) ─────────────────────────────────────────

export interface CrmActionSuggestion {
  title: string;
  dueAt: Date | null;
  messageId: string;
  reason: string;
}

const MAX_ACTIONS = 3;
const MAX_TITLE = 140;
const DAY_MS = 86_400_000;

/** Lower-case, punctuation-free, single-spaced — two wordings of one action collide. */
export function normaliseActionTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Validate the actions the model read out of the messages. A due date must be a real calendar
 * date, no more than a week in the past (overdue is useful) and within a year (anything further
 * is almost always a misread). An action that already exists on the lead is dropped.
 */
export function normaliseActionSuggestions(
  raw: unknown,
  ctx: { validMessageIds: ReadonlySet<string>; existingTitles: ReadonlySet<string>; now: Date },
): CrmActionSuggestion[] {
  const out: CrmActionSuggestion[] = [];
  const seen = new Set(ctx.existingTitles);
  for (const item of listField(raw, "actions")) {
    if (!item || typeof item !== "object") continue;
    const { title, due, messageId, reason } = item as Record<string, unknown>;
    if (typeof title !== "string") continue;
    const clean = title.replace(/\s+/g, " ").trim();
    if (clean.length < 3) continue;
    const key = normaliseActionTitle(clean);
    if (!key || seen.has(key)) continue;
    if (typeof messageId !== "string" || !ctx.validMessageIds.has(messageId)) continue;

    let dueAt: Date | null = null;
    if (typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due)) {
      const d = new Date(`${due}T09:00:00.000Z`);
      const valid = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === due;
      if (valid && d.getTime() >= ctx.now.getTime() - 7 * DAY_MS && d.getTime() <= ctx.now.getTime() + 365 * DAY_MS) {
        dueAt = d;
      }
    }

    seen.add(key);
    out.push({
      title: clean.slice(0, MAX_TITLE),
      dueAt,
      messageId,
      reason: typeof reason === "string" ? reason.trim().slice(0, MAX_REASON) : "",
    });
    if (out.length >= MAX_ACTIONS) break;
  }
  return out;
}

function listField(raw: unknown, field: string): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const value = (raw as Record<string, unknown>)[field];
  return Array.isArray(value) ? value : [];
}
