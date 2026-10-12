/**
 * CRM sync — reads what happened with a lead and keeps its stage honest.
 *
 *   sources (Gmail · Slack · Scribe meetings · Docs proposals · e-signature requests)
 *     → touchpoints (facts, deduped, stored)
 *     → decideStageMove (pure rules)        → stage moves on FACTS
 *     → one light-tier AI read of new text  → stage SUGGESTIONS + proposed ACTIONS, never applied
 *
 * Privacy boundary, and why it is shaped like this: a person's mailbox is read ONLY when they
 * have opted in (`WorkspaceMember.crmMailboxEnabled`), ONLY for messages to/from the lead's own
 * domains, and only the subject + the person on their side are stored — never bodies. Gmail
 * access elsewhere in Foundry is strictly per-user because a workspace-shared path once leaked
 * one person's inbox to everyone (see /api/integrations/gmail); this keeps that property.
 *
 * Failure model: every source is read independently. One that fails is reported in words and
 * does NOT advance `crmLastSyncedAt`, so the next run re-covers its window rather than skipping
 * it — "we couldn't look" must never become "nothing happened" (CLAUDE.md §35).
 */

import { google } from "googleapis";
import type { LeadStage } from "@prisma/client";
import type { CrmSyncResult, CrmSyncStatus } from "@/types/crm";
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { googleClientForRefreshToken } from "@/server/google-auth";
import { getSlackBotToken } from "@/server/slack/client";
import { deriveClientDomains } from "@/server/meetings";
import { resolveAiConfig, completeText, parseJsonObject } from "@/server/ai-provider";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";

export type { CrmSyncResult, CrmSyncStatus };
import {
  LEAD_STAGES,
  STAGE_LABEL,
  decideStageMove,
  factFromTouchpoint,
  normaliseActionSuggestions,
  normaliseActionTitle,
  normaliseSuggestions,
  type StageFact,
} from "@/lib/crm/lead-stage-engine";
import {
  buildGmailQuery,
  cleanSlackText,
  clip,
  emailDirection,
  firstLeadAddress,
  normaliseDomains,
  normaliseMessageId,
  parseAddressList,
} from "@/lib/crm/signals";

const CLAIM_TTL_MS = 5 * 60_000;
const FIRST_SYNC_LOOKBACK_DAYS = 180;
/** Re-read a little of the previous window — mail can arrive late, clocks drift. Dedupe absorbs it. */
const OVERLAP_MS = 2 * 86_400_000;
const MAX_EMAILS_PER_MAILBOX = 100;
const MAX_SLACK_MESSAGES = 200;
/** Only recent wording is worth reading — a five-month-old "not now" isn't news. */
const JUDGE_WINDOW_DAYS = 30;
const MAX_JUDGED_MESSAGES = 40;
const SLACK_API = "https://slack.com/api";

/** A signal read from a source this run, before it is stored. */
interface Signal {
  source: "gmail" | "slack" | "meeting" | "document";
  externalId: string;
  type: "EMAIL" | "SLACK" | "MEETING" | "PROPOSAL";
  direction: "inbound" | "outbound" | "internal" | null;
  note: string | null;
  occurredAt: Date;
  counterpartEmail: string | null;
  counterpartName: string | null;
  /** Text for the AI read — held in memory for this run only, never stored. */
  text: string | null;
}

function empty(status: CrmSyncStatus): CrmSyncResult {
  return {
    status,
    added: 0,
    moved: null,
    suggested: 0,
    actionsProposed: 0,
    errors: [],
    suggestionsSkipped: null,
    counts: { mailboxes: 0, emails: 0, slackMessages: 0, meetings: 0, documentEvents: 0 },
  };
}

/** The domains that identify a lead: what was typed for it plus its website / contact email. */
export function effectiveLeadDomains(client: {
  crmEmailDomains: string[];
  website: string | null;
  primaryContactEmail: string | null;
}): string[] {
  return normaliseDomains([...client.crmEmailDomains, ...deriveClientDomains(client)]);
}

// ── Sources ──────────────────────────────────────────────────────────────────

async function readGmail(
  workspaceId: string,
  domains: string[],
  after: Date,
): Promise<{ signals: Signal[]; mailboxes: number; errors: string[] }> {
  const query = buildGmailQuery(domains, after);
  if (!query) return { signals: [], mailboxes: 0, errors: [] };

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, crmMailboxEnabled: true, ...ACTIVE_MEMBER },
    select: { user: { select: { name: true, email: true, googleOAuthRefreshToken: true } } },
  });

  const signals: Signal[] = [];
  const errors: string[] = [];
  let mailboxes = 0;

  for (const { user } of members) {
    const who = user.name?.trim() || user.email;
    if (!user.googleOAuthRefreshToken) {
      errors.push(`${who} turned on “Use my Gmail” but Google isn't connected — sign out and back in.`);
      continue;
    }
    const auth = googleClientForRefreshToken(user.googleOAuthRefreshToken);
    if (!auth) {
      errors.push("Google sign-in isn't configured on this server, so no mailbox can be read.");
      break;
    }
    try {
      const gmail = google.gmail({ version: "v1", auth });
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const res = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: Math.min(50, MAX_EMAILS_PER_MAILBOX - ids.length),
          pageToken,
        });
        for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken && ids.length < MAX_EMAILS_PER_MAILBOX);

      for (let i = 0; i < ids.length; i += 20) {
        const batch = await Promise.all(
          ids.slice(i, i + 20).map((id) =>
            gmail.users.messages.get({
              userId: "me",
              id,
              format: "metadata",
              metadataHeaders: ["From", "To", "Cc", "Subject", "Message-ID"],
            }),
          ),
        );
        for (const res of batch) {
          const headers = res.data.payload?.headers ?? [];
          const header = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
          const direction = emailDirection(header("From"), domains);
          const counterpart =
            direction === "inbound"
              ? parseAddressList(header("From"))[0] ?? null
              : firstLeadAddress([header("To"), header("Cc")], domains);
          const subject = header("Subject")?.trim() || "(no subject)";
          signals.push({
            source: "gmail",
            externalId: normaliseMessageId(header("Message-ID")) ?? `gmail:${res.data.id}`,
            type: "EMAIL",
            direction,
            note: clip(subject, 200),
            occurredAt: res.data.internalDate ? new Date(Number(res.data.internalDate)) : new Date(),
            counterpartEmail: counterpart?.email ?? null,
            counterpartName: counterpart?.name ?? null,
            text: `${subject} — ${res.data.snippet ?? ""}`.trim(),
          });
        }
      }
      mailboxes += 1;
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      errors.push(
        /invalid_grant/i.test(message)
          ? `${who}'s Google access has expired or was revoked — sign out and back in.`
          : `Couldn't read ${who}'s Gmail: ${message}`,
      );
    }
  }
  return { signals, mailboxes, errors };
}

const SLACK_ERRORS: Record<string, string> = {
  not_in_channel: "The Foundry bot isn't in this lead's Slack channel — /invite it there.",
  channel_not_found: "This lead's Slack channel no longer exists, or the bot can't see it.",
  missing_scope: "The Slack app is missing the permission to read channel history — reinstall it.",
  invalid_auth: "The Slack bot token is invalid — reconnect Slack in Settings.",
};

async function readSlack(
  workspaceId: string,
  channelId: string | null,
  after: Date,
): Promise<{ signals: Signal[]; error: string | null }> {
  if (!channelId) return { signals: [], error: null };
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slackBotToken: true, slackBotTokenEncrypted: true },
  });
  const token = getSlackBotToken(ws);
  if (!token) return { signals: [], error: "Slack isn't connected, so this lead's channel can't be read." };

  try {
    const url = `${SLACK_API}/conversations.history?channel=${encodeURIComponent(channelId)}&oldest=${(after.getTime() / 1000).toFixed(6)}&limit=${MAX_SLACK_MESSAGES}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      messages?: Array<{ type?: string; subtype?: string; text?: string; ts?: string }>;
    };
    if (!data.ok) {
      return { signals: [], error: SLACK_ERRORS[data.error ?? ""] ?? `Slack refused the read (${data.error ?? "unknown"}).` };
    }
    const signals: Signal[] = [];
    for (const m of data.messages ?? []) {
      if (m.type !== "message" || m.subtype || !m.ts) continue;
      const text = cleanSlackText(m.text ?? "");
      if (!text) continue;
      signals.push({
        source: "slack",
        externalId: `${channelId}:${m.ts}`,
        type: "SLACK",
        direction: "internal",
        note: clip(text, 280),
        occurredAt: new Date(Number(m.ts) * 1000),
        counterpartEmail: null,
        counterpartName: null,
        text,
      });
    }
    return { signals, error: null };
  } catch (err) {
    return { signals: [], error: `Couldn't reach Slack: ${(err as Error).message}` };
  }
}

async function readMeetings(clientId: string): Promise<Signal[]> {
  const meetings = await prisma.meeting.findMany({
    where: { clientId, startedAt: { lte: new Date() } },
    select: { id: true, title: true, startedAt: true },
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  return meetings.map((m) => ({
    source: "meeting" as const,
    externalId: m.id,
    type: "MEETING" as const,
    direction: null,
    note: clip(m.title, 200),
    occurredAt: m.startedAt ?? new Date(),
    counterpartEmail: null,
    counterpartName: null,
    text: null,
  }));
}

function docSignal(externalId: string, note: string, at: Date): Signal {
  return {
    source: "document",
    externalId,
    type: "PROPOSAL",
    direction: null,
    note,
    occurredAt: at,
    counterpartEmail: null,
    counterpartName: null,
    text: null,
  };
}

/**
 * Proposals (drafted / shared / accepted / declined) and contracts (any e-signature request on a
 * document for this lead). A document is the lead's when it is linked by id OR names the lead —
 * proposals are often written before the lead record is wired to them.
 */
async function readDocuments(workspaceId: string, client: { id: string; name: string }): Promise<Signal[]> {
  const docs = await prisma.document.findMany({
    where: {
      workspaceId,
      OR: [{ clientId: client.id }, { clientName: { equals: client.name, mode: "insensitive" } }],
    },
    select: {
      id: true,
      title: true,
      documentType: true,
      createdAt: true,
      sharedAt: true,
      acceptedAt: true,
      declinedAt: true,
      signatureRequests: {
        where: { status: { in: ["SENT", "COMPLETED"] } },
        select: { id: true, sentAt: true, completedAt: true, status: true },
      },
    },
  });

  const signals: Signal[] = [];
  for (const d of docs) {
    const title = clip(d.title || "Untitled document", 120);
    if (d.documentType === "PROPOSAL") {
      signals.push(docSignal(`${d.id}:drafted`, `Proposal “${title}” drafted`, d.createdAt));
      if (d.sharedAt) signals.push(docSignal(`${d.id}:shared`, `Proposal “${title}” shared with them`, d.sharedAt));
      if (d.acceptedAt) signals.push(docSignal(`${d.id}:accepted`, `Proposal “${title}” accepted`, d.acceptedAt));
      if (d.declinedAt) signals.push(docSignal(`${d.id}:declined`, `Proposal “${title}” declined`, d.declinedAt));
    }
    for (const r of d.signatureRequests) {
      if (r.sentAt) signals.push(docSignal(`sig:${r.id}:contract_sent`, `“${title}” sent for signature`, r.sentAt));
      if (r.status === "COMPLETED" && r.completedAt) {
        signals.push(docSignal(`sig:${r.id}:contract_signed`, `“${title}” signed by all parties`, r.completedAt));
      }
    }
  }
  return signals;
}

// ── Judgement (suggestions + proposed actions only) ──────────────────────────

const JUDGE_SYSTEM = `You read recent messages about ONE sales lead for a software agency. You do two things.

1. STAGES — say whether any message clearly shows the deal reached a new stage:
${LEAD_STAGES.filter((s) => s !== "NEW").map((s) => `   ${s} = ${STAGE_LABEL[s]}`).join("\n")}
   QUALIFIED means their need, budget or timeline was confirmed. ON_HOLD means they said "not now" / "come back later". WON means they agreed, signed or told us to go ahead. LOST means they declined, chose someone else or are not proceeding.

2. ACTIONS — list concrete things WE now need to do for this lead (e.g. "Send revised quote", "Book a call with their CTO"). Only actions a message actually asks for or commits us to. Use a due date (YYYY-MM-DD) only when the message gives or clearly implies one.

Rules:
- Only report what a message says HAS happened or been asked. Plans and hopes are not evidence.
- Messages marked "internal" are Gitwork talking among ourselves. They may report what happened ("Valu signed this morning") or commit us to an action, but an internal plan is never evidence of a stage.
- Be conservative. A wrong WON or LOST is costly. Return empty lists when nothing is clear.
- Cite exactly one message id per item, copied from the input.

Reply with JSON only:
{"suggestions":[{"stage":"WON","messageId":"<id>","reason":"<one short sentence>"}],"actions":[{"title":"<imperative, under 12 words>","due":"YYYY-MM-DD or null","messageId":"<id>","reason":"<one short sentence>"}]}`;

interface JudgeResult {
  suggestions: ReturnType<typeof normaliseSuggestions>;
  actions: ReturnType<typeof normaliseActionSuggestions>;
  skipped: string | null;
}

async function judgeSignals(opts: {
  workspaceId: string;
  clientId: string;
  leadName: string;
  current: LeadStage | null;
  signals: Signal[];
  existingActionTitles: ReadonlySet<string>;
  canComputeAi: boolean;
  now: Date;
}): Promise<JudgeResult> {
  const none: JudgeResult = { suggestions: [], actions: [], skipped: null };
  const cutoff = opts.now.getTime() - JUDGE_WINDOW_DAYS * 86_400_000;
  const candidates = opts.signals
    .filter((s) => s.text && (s.source === "gmail" || s.source === "slack") && s.occurredAt.getTime() >= cutoff)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, MAX_JUDGED_MESSAGES);
  if (candidates.length === 0 || opts.current === "WON") return none;
  if (!opts.canComputeAi) {
    return { ...none, skipped: "Suggestions need someone with AI access to sync — they'll appear on the next scheduled run." };
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: opts.workspaceId },
    select: {
      aiProvider: true,
      anthropicApiKey: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });
  if (!ws) return none;
  const config = resolveAiConfig(ws);
  if (!config.apiKey && config.provider !== "LOCAL") {
    return { ...none, skipped: "No AI provider is configured, so wording-based suggestions are off." };
  }

  const messages = candidates.map((s) => ({
    id: s.externalId,
    kind: s.source === "slack" ? "internal" : s.direction === "inbound" ? "email from them" : "email from us",
    date: s.occurredAt.toISOString().slice(0, 10),
    text: clip(s.text ?? "", 600),
  }));
  const payload = { lead: opts.leadName, today: opts.now.toISOString().slice(0, 10), currentStage: opts.current ?? "NEW", messages };

  try {
    const result = await cachedOrCompute<{ raw: unknown }>({
      workspaceId: opts.workspaceId,
      cacheKey: `crm-judge:${opts.clientId}:${hashInputs(messages.map((m) => m.id))}`,
      inputsHash: hashInputs(payload),
      compute: async () => {
        const text = await completeText({
          config,
          system: JUDGE_SYSTEM,
          user: JSON.stringify(payload),
          maxTokens: 900,
          tier: "light",
          usageContext: { module: "CRM", workspaceId: opts.workspaceId, operation: "crm-judge" },
        });
        return { response: { raw: parseJsonObject<unknown>(text) }, modelUsed: config.model };
      },
    });
    const raw = result?.response.raw ?? null;
    const validMessageIds = new Set(messages.map((m) => m.id));
    return {
      suggestions: normaliseSuggestions(raw, { current: opts.current, validMessageIds }),
      actions: normaliseActionSuggestions(raw, {
        validMessageIds,
        existingTitles: opts.existingActionTitles,
        now: opts.now,
      }),
      skipped: null,
    };
  } catch (err) {
    // The read is optional. A failed call costs the suggestions, never the facts.
    console.warn("[crm] judgement failed", { clientId: opts.clientId, model: config.model, error: (err as Error).message });
    return { ...none, skipped: `The AI read failed (${config.model}), so no suggestions this run.` };
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Sync one lead. `canComputeAi` gates the token-spending read (ai.generate); facts and stage
 * moves always run.
 */
export async function syncLeadCrm(clientId: string, opts: { canComputeAi: boolean }): Promise<CrmSyncResult> {
  const now = new Date();
  const claimed = await prisma.workspaceClient.updateMany({
    where: {
      id: clientId,
      OR: [{ crmSyncStartedAt: null }, { crmSyncStartedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } }],
    },
    data: { crmSyncStartedAt: now },
  });
  if (claimed.count === 0) {
    const exists = await prisma.workspaceClient.findUnique({ where: { id: clientId }, select: { id: true } });
    return empty(exists ? "busy" : "not_found");
  }

  try {
    const client = await prisma.workspaceClient.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        status: true,
        website: true,
        primaryContactEmail: true,
        crmEmailDomains: true,
        crmAutoEnabled: true,
        crmLastSyncedAt: true,
        slackInternalChannelId: true,
        slackChannelId: true,
        leadStage: true,
        leadStagePinned: true,
        leadStageChangedAt: true,
        leadOwnerId: true,
      },
    });
    if (!client) return empty("not_found");
    if (!client.crmAutoEnabled) return empty("not_enabled");
    if (client.status !== "LEAD") return empty("not_a_lead");

    const result = empty("synced");
    const after = client.crmLastSyncedAt
      ? new Date(client.crmLastSyncedAt.getTime() - OVERLAP_MS)
      : new Date(now.getTime() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
    const domains = effectiveLeadDomains(client);
    const channelId = (client.slackInternalChannelId ?? client.slackChannelId ?? "").trim() || null;

    const [gmail, slack, meetings, documents] = await Promise.allSettled([
      readGmail(client.workspaceId, domains, after),
      readSlack(client.workspaceId, channelId, after),
      readMeetings(client.id),
      readDocuments(client.workspaceId, { id: client.id, name: client.name }),
    ]);

    const signals: Signal[] = [];
    let sourceFailed = false;
    if (gmail.status === "fulfilled") {
      signals.push(...gmail.value.signals);
      result.counts.mailboxes = gmail.value.mailboxes;
      result.counts.emails = gmail.value.signals.length;
      result.errors.push(...gmail.value.errors);
      if (gmail.value.errors.length > 0) sourceFailed = true;
    } else {
      sourceFailed = true;
      result.errors.push(`Couldn't read email: ${(gmail.reason as Error)?.message ?? "unknown error"}`);
    }
    if (slack.status === "fulfilled") {
      signals.push(...slack.value.signals);
      result.counts.slackMessages = slack.value.signals.length;
      if (slack.value.error) {
        sourceFailed = true;
        result.errors.push(slack.value.error);
      }
    } else {
      sourceFailed = true;
      result.errors.push(`Couldn't read Slack: ${(slack.reason as Error)?.message ?? "unknown error"}`);
    }
    if (meetings.status === "fulfilled") {
      signals.push(...meetings.value);
      result.counts.meetings = meetings.value.length;
    } else {
      result.errors.push("Couldn't read meetings.");
    }
    if (documents.status === "fulfilled") {
      signals.push(...documents.value);
      result.counts.documentEvents = documents.value.length;
    } else {
      result.errors.push("Couldn't read proposals and contracts.");
    }
    if (domains.length === 0) {
      result.errors.push("No email domain is known for this lead — add their website, a contact email or a domain.");
    }

    // ── Store new signals (dedupe on source + externalId, within the batch too) ──
    const unique = new Map<string, Signal>();
    for (const s of signals) unique.set(`${s.source}|${s.externalId}`, s);
    const fresh: Signal[] = [];
    const all = [...unique.values()];
    for (let i = 0; i < all.length; i += 500) {
      const chunk = all.slice(i, i + 500);
      const existing = await prisma.clientTouchpoint.findMany({
        where: { clientId: client.id, externalId: { in: chunk.map((s) => s.externalId) } },
        select: { source: true, externalId: true },
      });
      const have = new Set(existing.map((e) => `${e.source}|${e.externalId}`));
      for (const s of chunk) if (!have.has(`${s.source}|${s.externalId}`)) fresh.push(s);
    }
    if (fresh.length > 0) {
      await prisma.clientTouchpoint.createMany({
        data: fresh.map((s) => ({
          clientId: client.id,
          workspaceId: client.workspaceId,
          type: s.type,
          note: s.note,
          occurredAt: s.occurredAt,
          source: s.source,
          externalId: s.externalId,
          direction: s.direction,
          counterpartEmail: s.counterpartEmail,
          counterpartName: s.counterpartName,
        })),
      });
    }
    result.added = fresh.length;

    // ── Facts → stage (from everything stored, not just this run) ──
    const factRows = await prisma.clientTouchpoint.findMany({
      where: {
        clientId: client.id,
        OR: [
          { source: { in: ["gmail", "meeting", "document"] } },
          { source: null, type: { in: ["CALL", "EMAIL", "MEETING"] } },
        ],
      },
      select: { type: true, source: true, direction: true, externalId: true, note: true, occurredAt: true },
      orderBy: { occurredAt: "desc" },
      take: 2000,
    });
    const facts = factRows.map(factFromTouchpoint).filter((f): f is StageFact => f !== null);
    const decision = decideStageMove({
      current: client.leadStage,
      pinned: client.leadStagePinned,
      stageSince: client.leadStageChangedAt,
      facts,
    });
    let currentStage = client.leadStage;
    if (decision.move) {
      // Conditional on nothing having changed mid-sync — a person may have just set the stage.
      const applied = await prisma.workspaceClient.updateMany({
        where: { id: client.id, leadStagePinned: false, leadStage: client.leadStage },
        data: { leadStage: decision.to, leadStageChangedAt: now },
      });
      if (applied.count > 0) {
        await prisma.clientTouchpoint.create({
          data: {
            clientId: client.id,
            workspaceId: client.workspaceId,
            type: "STAGE",
            source: "system",
            note: `Moved to ${STAGE_LABEL[decision.to]} — ${decision.reason}`,
            occurredAt: now,
          },
        });
        result.moved = { from: client.leadStage, to: decision.to, reason: decision.reason };
        currentStage = decision.to;
      }
    }

    // ── Wording → stage suggestions + proposed actions (never applied) ──
    const existingActions = await prisma.leadAction.findMany({
      where: { clientId: client.id },
      select: { title: true },
    });
    const judged = await judgeSignals({
      workspaceId: client.workspaceId,
      clientId: client.id,
      leadName: client.name,
      current: currentStage,
      signals: fresh,
      existingActionTitles: new Set(existingActions.map((a) => normaliseActionTitle(a.title))),
      canComputeAi: opts.canComputeAi,
      now,
    });
    result.suggestionsSkipped = judged.skipped;

    const evidenceTouchpoints = new Map<string, string>();
    const evidenceIds = [...judged.suggestions, ...judged.actions].map((s) => s.messageId);
    if (evidenceIds.length > 0) {
      const rows = await prisma.clientTouchpoint.findMany({
        where: { clientId: client.id, externalId: { in: evidenceIds } },
        select: { id: true, externalId: true },
      });
      for (const r of rows) if (r.externalId) evidenceTouchpoints.set(r.externalId, r.id);
    }

    for (const s of judged.suggestions) {
      const evidence = fresh.find((f) => f.externalId === s.messageId);
      const externalId = `suggest:${s.messageId}:${s.stage}`;
      const already = await prisma.clientTouchpoint.findFirst({
        where: {
          clientId: client.id,
          OR: [{ externalId }, { suggestedStage: s.stage, suggestionState: "pending" }],
        },
        select: { id: true },
      });
      if (already) continue;
      await prisma.clientTouchpoint.create({
        data: {
          clientId: client.id,
          workspaceId: client.workspaceId,
          type: "SUGGESTION",
          source: "system",
          externalId,
          direction: evidence?.direction ?? null,
          note: s.reason,
          occurredAt: evidence?.occurredAt ?? now,
          suggestedStage: s.stage,
          suggestionState: "pending",
        },
      });
      result.suggested += 1;
    }

    for (const a of judged.actions) {
      const externalId = `action:${a.messageId}:${normaliseActionTitle(a.title).slice(0, 80)}`;
      const already = await prisma.leadAction.findFirst({
        where: { clientId: client.id, externalId },
        select: { id: true },
      });
      if (already) continue;
      await prisma.leadAction.create({
        data: {
          workspaceId: client.workspaceId,
          clientId: client.id,
          title: a.title,
          dueAt: a.dueAt,
          ownerId: client.leadOwnerId,
          state: "suggested",
          source: "ai",
          reason: a.reason || null,
          externalId,
          evidenceTouchpointId: evidenceTouchpoints.get(a.messageId) ?? null,
        },
      });
      result.actionsProposed += 1;
    }

    await prisma.workspaceClient.update({
      where: { id: client.id },
      data: {
        // A failed source keeps the old watermark so its window is re-read next time.
        ...(sourceFailed ? {} : { crmLastSyncedAt: now }),
        crmLastSyncError: result.errors.length ? result.errors.join("\n") : null,
      },
    });
    return result;
  } finally {
    await prisma.workspaceClient
      .update({ where: { id: clientId }, data: { crmSyncStartedAt: null } })
      .catch(() => undefined);
  }
}
