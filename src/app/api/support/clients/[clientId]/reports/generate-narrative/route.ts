import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { resolveAiConfig, completeText } from "@/server/ai-provider";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import { getPerformanceMetricsForPeriod } from "@/server/support";

function fmtDuration(ms: number | null): string {
  if (ms === null) return "n/a";
  const h = ms / 3600_000;
  if (h < 1) return `${Math.round(ms / 60_000)} minutes`;
  if (h < 24) return `${h.toFixed(1)} hours`;
  return `${(h / 24).toFixed(1)} days`;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface GeneratedNarrative {
  overviewText: string;
  performanceText: string;
  summaryText: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      periodStart?: string;
      periodEnd?: string;
      periodLabel?: string;
      totalTickets?: number;
    };

    const periodStart = body.periodStart ? new Date(body.periodStart) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : new Date();
    const periodLabel = body.periodLabel ?? periodStart.toLocaleString("en-GB", { month: "long", year: "numeric" });

    const [client, workspace] = await Promise.all([
      prisma.supportClient.findUnique({ where: { id: clientId }, select: { name: true } }),
      prisma.workspace.findFirst({
        where: { slug: DEFAULT_WORKSPACE_SLUG },
        select: {
          id: true,
          aiProvider: true,
          anthropicApiKey: true, anthropicModel: true,
          openaiApiKey: true, openaiModel: true,
          geminiApiKey: true, geminiModel: true,
          localLlmUrl: true, localLlmModel: true,
        },
      }),
    ]);
    if (!workspace) return apiError("Workspace not found", 404);

    // Pull conversations (the unit of triage) for the period.
    const tickets = await prisma.supportConversation.findMany({
      where: {
        clientId,
        receivedAt: { gte: periodStart, lte: periodEnd },
      },
      select: {
        issueType: true,
        priority: true,
        status: true,
        source: true,
        sentiment: true,
      },
    });

    // Aggregate the triage data.
    const total = tickets.length;
    const byIssueType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const bySentiment: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const t of tickets) {
      const issue = t.issueType ?? "other";
      byIssueType[issue] = (byIssueType[issue] ?? 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      const sentiment = (t.sentiment ?? "NEUTRAL").toLowerCase();
      bySentiment[sentiment] = (bySentiment[sentiment] ?? 0) + 1;
    }

    // Also fetch conversation-level sentiment for the period (incl. conversations without tickets).
    const convSentiments = await prisma.supportConversation.groupBy({
      by: ["sentiment"],
      where: { clientId, receivedAt: { gte: periodStart, lte: periodEnd } },
      _count: { sentiment: true },
    });

    const sentimentSummary = convSentiments
      .map((s) => `${s.sentiment.toLowerCase()}: ${s._count.sentiment}`)
      .join(", ");

    const lines: string[] = [
      `Client: ${client?.name ?? clientId}`,
      `Period: ${periodLabel}`,
      `Total tickets created: ${total}`,
    ];

    if (Object.keys(byIssueType).length > 0) {
      lines.push(`Issue types: ${Object.entries(byIssueType).map(([k, v]) => `${k} (${v})`).join(", ")}`);
    }
    if (Object.keys(byPriority).length > 0) {
      lines.push(`Priority breakdown: ${Object.entries(byPriority).map(([k, v]) => `${k.toLowerCase()} (${v})`).join(", ")}`);
    }
    if (Object.keys(byStatus).length > 0) {
      const resolved = (byStatus["CLOSED"] ?? 0) + (byStatus["IGNORED"] ?? 0);
      const open = total - resolved;
      lines.push(`Status: ${resolved} closed, ${open} still open/in-progress`);
    }
    if (sentimentSummary) {
      lines.push(`Conversation sentiment (all channels): ${sentimentSummary}`);
    }

    // Performance KPIs from ticket timestamps — gives the narrative real, citable figures.
    try {
      const perf = await getPerformanceMetricsForPeriod(
        clientId,
        periodStart.toISOString().slice(0, 10),
        periodEnd.toISOString().slice(0, 10),
      );
      if (perf.respondedCount > 0 || perf.resolvedCount > 0) {
        lines.push(
          `Performance: avg first response ${fmtDuration(perf.avgFirstResponseMs)} (median ${fmtDuration(perf.medianFirstResponseMs)}); ` +
            `${perf.slaFrtCompliancePct ?? 0}% replied within the ${perf.slaTargetHours}h SLA target; ` +
            `avg resolution ${fmtDuration(perf.avgResolutionMs)}; resolution rate ${perf.resolutionRate}% (${perf.resolvedCount}/${perf.totalTickets}).`,
        );
      }
    } catch {
      // Metrics are best-effort enrichment — never block narrative generation.
    }

    const config = resolveAiConfig(workspace);
    const inputsHash = hashInputs(lines);
    const cacheResult = await cachedOrCompute<GeneratedNarrative>({
      workspaceId: workspace.id,
      cacheKey: `care-report-narrative:${clientId}`,
      inputsHash,
      compute: async () => {
        const raw = await completeText({
          config,
          system: `You write three narrative sections for a monthly client support report. British English. Factual, concise, professional.
Return ONLY a JSON object in this exact format — no preamble, no markdown fences:
{
  "overviewText": "3-4 sentences summarising the month's support activity, volume, and standout themes",
  "performanceText": "2-3 sentences on response quality, resolution rate, any SLA notes, and backlog",
  "summaryText": "2-3 sentences closing summary with a brief outlook or recommendation for next month"
}`,
          user: lines.join("\n"),
          maxTokens: 800,
          tier: "light",
        });
        let result: GeneratedNarrative = { overviewText: "", performanceText: "", summaryText: "" };
        try {
          const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = fence ? fence[1] : raw;
          const start = jsonStr.indexOf("{");
          const end = jsonStr.lastIndexOf("}");
          if (start !== -1 && end !== -1) {
            result = JSON.parse(jsonStr.slice(start, end + 1)) as GeneratedNarrative;
          }
        } catch {
          result = { overviewText: raw.trim(), performanceText: "", summaryText: "" };
        }
        return { response: result, modelUsed: workspace.aiProvider };
      },
    });

    return apiOk({ ...cacheResult.response, ticketCount: total });
  } catch (error) {
    return fromError(error);
  }
}
