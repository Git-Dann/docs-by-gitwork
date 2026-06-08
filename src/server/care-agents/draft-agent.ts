import { callAI, type AiContext } from "./ai-client";
import { prisma } from "@/lib/prisma";

const SYSTEM_PROMPT = `You are a professional support agent at Gitwork, a UK-based digital design-and-build agency.
You manage client support operations on Gitwork's behalf.

Tone guidelines:
- Professional and warm, never stiff or corporate
- Direct and concise — no waffle, no filler phrases
- Solutions-focused with clear next steps
- British English spelling

Do NOT open with "I hope this email finds you well" or similar stale openers.
Sign off as: Gitwork Support

Reply ONLY with the message body — no subject line, no metadata, no preamble.`;

export async function generateDraftReply(
  ctx: AiContext,
  conversationId: string,
  ticketId?: string,
): Promise<string> {
  const conversation = await prisma.supportConversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      client: { select: { name: true } },
    },
  });

  const threadText = conversation.messages
    .map((m) => `[${m.direction === "outbound" ? "Support" : "Customer"}] ${m.body}`)
    .join("\n\n");

  const userPrompt = `Support conversation — client: ${conversation.client.name}
Subject: ${conversation.subject}
Customer: ${conversation.customerLabel}
Channel: ${conversation.source.toLowerCase()}

--- Thread ---
${threadText || "(No messages yet — write an opening reply.)"}
---

Write a professional reply to the customer's most recent message.`;

  const draft = await callAI(ctx, SYSTEM_PROMPT, userPrompt, 1024);

  // Save as a pending draft action
  const action = await prisma.draftSupportAction.create({
    data: {
      clientId: conversation.clientId,
      ticketId: ticketId ?? null,
      type: "REPLY",
      title: `Re: ${conversation.subject}`,
      body: draft.trim(),
      status: "PENDING_APPROVAL",
      risk: "LOW",
    },
  });

  await prisma.supportAuditLog.create({
    data: {
      clientId: conversation.clientId,
      actorId: "agent:draft",
      action: "agent_draft_created",
      target: action.id,
      metadata: { conversationId, ticketId },
    },
  });

  return draft.trim();
}
