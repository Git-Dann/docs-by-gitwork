import { callAI, extractJson, type AiContext } from "./ai-client";
import { describeAiError } from "@/lib/ai-error-words";
import { prisma } from "@/lib/prisma";
import type { IssueType, AgentPriority, AgentSentiment } from "./types";
import type {
  ConversationPriority as PrismaConversationPriority,
  ConversationSentiment as PrismaSentiment,
} from "@prisma/client";

// Classify-only triage. The cockpit is monitor + triage + route, so the agent never
// creates tickets, drafts replies, or moves the conversation out of NEW — it only
// pre-fills sentiment / issueType / priority as *suggestions*. A human decides the
// status; leaving it NEW keeps "NEW = untouched by a human" meaningful.
const SYSTEM_PROMPT = `You are a support operations triage agent for Gitwork.
You analyse customer support conversations and provide a structured classification
to help a human operator triage them. You do NOT write replies.

Return a JSON object in this exact format:
{
  "issueType": "bug|billing|feature_request|question|complaint|other",
  "priority": "urgent|high|normal|low",
  "sentiment": "positive|neutral|negative",
  "nextAction": "1-2 sentence description of what a human should do next"
}`;

interface TriageDecision {
  issueType: IssueType;
  priority: AgentPriority;
  sentiment: AgentSentiment;
  nextAction: string;
}

const PRIORITY_MAP: Record<AgentPriority, PrismaConversationPriority> = {
  urgent: "URGENT",
  high: "HIGH",
  normal: "NORMAL",
  low: "LOW",
};

const ISSUE_TYPES: readonly IssueType[] = ["bug", "billing", "feature_request", "question", "complaint", "other"];
const PRIORITIES: readonly AgentPriority[] = ["urgent", "high", "normal", "low"];
const SENTIMENTS: readonly AgentSentiment[] = ["positive", "neutral", "negative"];

/** The parsed answer, or null when it is not one we can act on. */
function validDecision(parsed: unknown): TriageDecision | null {
  if (!parsed || typeof parsed !== "object") return null;
  const d = parsed as Partial<TriageDecision>;
  if (!ISSUE_TYPES.includes(d.issueType as IssueType)) return null;
  if (!PRIORITIES.includes(d.priority as AgentPriority)) return null;
  if (!SENTIMENTS.includes(d.sentiment as AgentSentiment)) return null;
  return {
    issueType: d.issueType as IssueType,
    priority: d.priority as AgentPriority,
    sentiment: d.sentiment as AgentSentiment,
    nextAction: typeof d.nextAction === "string" ? d.nextAction : "",
  };
}

export async function triageConversation(
  ctx: AiContext,
  conversationId: string,
): Promise<void> {
  const conversation = await prisma.supportConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 10 },
      client: { select: { name: true } },
    },
  });

  const threadText = conversation.messages
    .map((m) => `[${m.direction === "outbound" ? "Support" : "Customer"}] ${m.body}`)
    .join("\n\n");

  const userPrompt = `Client: ${conversation.client.name}
Source: ${conversation.source}
From: ${conversation.customerLabel}
Subject: ${conversation.subject}

${threadText || conversation.preview || "(no content)"}`;

  /*
   * ⚠️ A failed classification must not be written as a classification.
   *
   * This used to start from `other / normal / neutral`, catch its own failure, keep those
   * defaults, write them to the row AND record an `agent_classified` audit entry — so an AI
   * outage produced a conversation that looked triaged, carried a confident "Other / Normal /
   * Neutral", and left a log saying the agent had classified it. That is §53.5 exactly: the
   * check that could not run became a confident assertion, and it is what put 389 junk rows on
   * a client's wiki. "We could not look" is a different fact from "there is nothing here", and
   * the UI can only say so if the fields are left alone.
   */
  let decision: TriageDecision | null = null;
  let failure: string | null = null;

  try {
    const response = await callAI(ctx, SYSTEM_PROMPT, userPrompt, 512, "light");
    /*
     * ⚠️ `extractJson` returns its FALLBACK when the model answers with prose, or with JSON
     * missing the fields. Passing a real decision as that fallback is the same bug one layer
     * down: unparseable output would be stored as a confident "other / normal / neutral". So the
     * fallback is null, and anything that does not name all three values is a failure too — an
     * empty `{}` parses perfectly and classifies nothing.
     */
    decision = validDecision(extractJson<unknown>(response, null));
    if (!decision) failure = "The AI answered, but not with a classification we could read.";
  } catch (err) {
    failure = describeAiError(err instanceof Error ? err.message : String(err));
  }

  if (!decision) {
    // Nothing is written to the conversation: no sentiment, no issueType, no priority, no tag.
    // The row keeps whatever it had, which for a new one is null — "not classified".
    await prisma.supportAuditLog.create({
      data: {
        clientId: conversation.clientId,
        actorId: "agent:triage",
        action: "enrichment_failed",
        target: conversationId,
        metadata: { reason: failure ?? "The AI returned nothing usable." },
      },
    }).catch(() => {});
    return;
  }

  const sentimentMap: Record<AgentSentiment, PrismaSentiment> = {
    positive: "POSITIVE",
    neutral: "NEUTRAL",
    negative: "NEGATIVE",
  };

  // Annotate only — sentiment, an issueType tag + the issueType field, and a suggested
  // priority. Status stays NEW so the operator still decides what needs action.
  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: {
      sentiment: sentimentMap[decision.sentiment] ?? "NEUTRAL",
      issueType: decision.issueType,
      priority: PRIORITY_MAP[decision.priority] ?? "NORMAL",
      tags: { push: decision.issueType },
    },
  });

  await prisma.supportAuditLog.create({
    data: {
      clientId: conversation.clientId,
      actorId: "agent:triage",
      action: "agent_classified",
      target: conversationId,
      metadata: {
        issueType: decision.issueType,
        priority: decision.priority,
        sentiment: decision.sentiment,
        nextAction: decision.nextAction,
      },
    },
  });
}
