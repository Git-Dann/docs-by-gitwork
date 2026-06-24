import { callAI, extractJson, type AiContext } from "./ai-client";
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

  let decision: TriageDecision = {
    issueType: "other",
    priority: "normal",
    sentiment: "neutral",
    nextAction: "Review and triage",
  };

  try {
    const response = await callAI(ctx, SYSTEM_PROMPT, userPrompt, 512, "light");
    decision = extractJson<TriageDecision>(response, decision);
  } catch {
    // Keep defaults on failure
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
