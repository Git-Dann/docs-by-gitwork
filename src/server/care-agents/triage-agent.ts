import { callAI, extractJson, type AiContext } from "./ai-client";
import { prisma } from "@/lib/prisma";
import type { IssueType, AgentPriority, AgentSentiment } from "./types";
import type {
  SupportTicketPriority,
  ConversationSentiment as PrismaSentiment,
} from "@prisma/client";

const SYSTEM_PROMPT = `You are a support operations triage agent for Gitwork.
You analyse customer support conversations and provide structured classification.

Return a JSON object in this exact format:
{
  "issueType": "bug|billing|feature_request|question|complaint|other",
  "priority": "urgent|high|normal|low",
  "sentiment": "positive|neutral|negative",
  "nextAction": "1-2 sentence description of what needs to happen next",
  "createTicket": true|false
}`;

interface TriageDecision {
  issueType: IssueType;
  priority: AgentPriority;
  sentiment: AgentSentiment;
  nextAction: string;
  createTicket: boolean;
}

const PRIORITY_MAP: Record<AgentPriority, SupportTicketPriority> = {
  urgent: "URGENT",
  high: "HIGH",
  normal: "NORMAL",
  low: "LOW",
};

export async function triageConversation(
  ctx: AiContext,
  conversationId: string,
): Promise<{ ticketId?: string }> {
  const conversation = await prisma.supportConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 10 },
      client: { select: { name: true } },
      tickets: { take: 1 },
    },
  });

  // Already has a ticket — skip ticket creation but still update classification
  const hasTicket = conversation.tickets.length > 0;

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
    nextAction: "Review and respond to customer",
    createTicket: false,
  };

  try {
    const response = await callAI(ctx, SYSTEM_PROMPT, userPrompt, 512);
    decision = extractJson<TriageDecision>(response, decision);
  } catch {
    // Keep defaults on failure
  }

  // Update conversation sentiment + tags
  const sentimentMap: Record<AgentSentiment, PrismaSentiment> = {
    positive: "POSITIVE",
    neutral: "NEUTRAL",
    negative: "NEGATIVE",
  };

  await prisma.supportConversation.update({
    where: { id: conversationId },
    data: {
      sentiment: sentimentMap[decision.sentiment] ?? "NEUTRAL",
      tags: { push: decision.issueType },
    },
  });

  // Create ticket if needed and not already present
  if (decision.createTicket && !hasTicket) {
    const ticket = await prisma.supportTicket.create({
      data: {
        clientId: conversation.clientId,
        conversationId,
        title: conversation.subject,
        customerLabel: conversation.customerLabel,
        status: "OPEN",
        priority: PRIORITY_MAP[decision.priority] ?? "NORMAL",
        source: conversation.source,
        nextAction: decision.nextAction,
        issueType: decision.issueType,
      },
    });

    await prisma.supportAuditLog.create({
      data: {
        clientId: conversation.clientId,
        actorId: "agent:triage",
        action: "agent_ticket_created",
        target: ticket.id,
        metadata: { conversationId, issueType: decision.issueType, priority: decision.priority },
      },
    });

    return { ticketId: ticket.id };
  }

  return {};
}
