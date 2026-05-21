import { callAI, extractJson } from "./ai-client";
import type { AgentContext, IngestedConversation, IssueType, AgentPriority, AgentSentiment, RawIngestItem } from "./types";

const SYSTEM_PROMPT = `You are an intelligent support triage system for Gitwork, a UK digital design-and-build agency.

You review incoming messages from customer channels (email, Discord, Reddit, YouTube) and decide which ones are genuine support signals that need a human response.

A genuine support signal is:
- A bug report or technical issue
- A billing or account question
- A feature request with clear intent
- A complaint or negative experience
- A question about how to use the product
- An urgent or time-sensitive request

NOT a support signal — skip these:
- Spam or automated messages
- Pure praise with no action needed ("Great product!")
- Off-topic discussions
- Trolling or irrelevant content
- Already-resolved conversations

For each genuine signal, you will:
1. Write a clear, concise subject line (improve on the raw title if needed)
2. Write a 1-2 sentence preview summarising the customer's issue
3. Classify it: issueType, priority, sentiment
4. Decide if it needs a formal ticket (createTicket: true for bugs, billing issues, complex problems)
5. If creating a ticket, write a short ticketTitle

Return a JSON object in this exact format:
{
  "items": [
    {
      "externalId": "string — must match input",
      "subject": "string — concise issue title",
      "preview": "string — 1-2 sentence summary",
      "issueType": "bug|billing|feature_request|question|complaint|other",
      "priority": "urgent|high|normal|low",
      "sentiment": "positive|neutral|negative",
      "createTicket": true|false,
      "ticketTitle": "string — only if createTicket is true, otherwise empty"
    }
  ]
}

If nothing is a genuine signal, return: { "items": [] }`;

interface IngestDecision {
  externalId: string;
  subject: string;
  preview: string;
  issueType: IssueType;
  priority: AgentPriority;
  sentiment: AgentSentiment;
  createTicket: boolean;
  ticketTitle: string;
}

export async function runIngestAgent(
  ctx: AgentContext,
  rawItems: RawIngestItem[],
): Promise<IngestedConversation[]> {
  if (rawItems.length === 0) return [];

  const sourceName = ctx.connection.source.toLowerCase();
  const userPrompt = `Client: ${ctx.client.name}
Source: ${sourceName}

Review these ${rawItems.length} incoming items and identify genuine support signals.

${rawItems
  .map((item, i) =>
    `--- Item ${i + 1} ---
ID: ${item.externalId}
From: ${item.customerLabel}
Subject/Title: ${item.rawSubject}
Content: ${item.rawBody.slice(0, 600)}${item.rawBody.length > 600 ? "…" : ""}`,
  )
  .join("\n\n")}`;

  let decisions: IngestDecision[] = [];

  try {
    const response = await callAI(ctx, SYSTEM_PROMPT, userPrompt, 3000);
    const parsed = extractJson<{ items: IngestDecision[] }>(response, { items: [] });
    decisions = parsed.items ?? [];
  } catch (err) {
    // If AI fails, ingest all items with default classification (fail-safe)
    console.error("[ingest-agent] AI call failed, falling back to full ingest:", err);
    return rawItems.map((item) => ({
      externalId: item.externalId,
      customerLabel: item.customerLabel,
      subject: item.rawSubject || "(no subject)",
      preview: item.rawBody.slice(0, 200),
      issueType: "other" as IssueType,
      priority: "normal" as AgentPriority,
      sentiment: "neutral" as AgentSentiment,
      createTicket: false,
      ticketTitle: "",
      receivedAt: item.receivedAt,
      threadItems: item.threadItems,
    }));
  }

  // Map AI decisions back to full RawIngestItem data
  const decisionMap = new Map(decisions.map((d) => [d.externalId, d]));

  return rawItems
    .filter((item) => decisionMap.has(item.externalId))
    .map((item) => {
      const d = decisionMap.get(item.externalId)!;
      return {
        externalId: item.externalId,
        customerLabel: item.customerLabel,
        subject: d.subject || item.rawSubject,
        preview: d.preview || item.rawBody.slice(0, 200),
        issueType: d.issueType ?? "other",
        priority: d.priority ?? "normal",
        sentiment: d.sentiment ?? "neutral",
        createTicket: d.createTicket ?? false,
        ticketTitle: d.ticketTitle ?? "",
        receivedAt: item.receivedAt,
        threadItems: item.threadItems,
      };
    });
}
