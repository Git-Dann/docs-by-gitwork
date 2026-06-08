import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { resolveAiConfig, completeText } from "@/server/ai-provider";
import type { AnalyticsReportMetric } from "@/types/support";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { metrics: AnalyticsReportMetric[], periodLabel?: string }
// Returns a one-paragraph trend narrative ("Subscribers up 12% (+142)…") for the report.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      metrics?: AnalyticsReportMetric[];
      periodLabel?: string;
    };
    const metrics = body.metrics ?? [];
    if (metrics.length === 0) return apiError("No metrics provided", 400);

    const client = await prisma.supportClient.findUnique({
      where: { id: clientId },
      select: { name: true },
    });

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        aiProvider: true,
        anthropicApiKey: true, anthropicModel: true,
        openaiApiKey: true, openaiModel: true,
        geminiApiKey: true, geminiModel: true,
        localLlmUrl: true, localLlmModel: true,
      },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    // Compact the metrics into a line-per-metric with the month-over-month delta.
    const lines = metrics.map((m) => {
      const cur = `${m.unit ?? ""}${m.value.toLocaleString()}`;
      if (typeof m.previous !== "number") return `- ${m.label}: ${cur}`;
      const delta = m.value - m.previous;
      const pct = m.previous ? Math.round((delta / m.previous) * 100) : null;
      const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      return `- ${m.label}: ${cur} (${dir} ${Math.abs(delta).toLocaleString()}${pct !== null ? `, ${pct > 0 ? "+" : ""}${pct}%` : ""} vs last month)`;
    });

    const config = resolveAiConfig(workspace);
    const narrative = await completeText({
      config,
      system:
        "You write the analytics summary for a monthly client support report. British English. " +
        "One short paragraph (2–4 sentences), factual and specific, leading with the most material " +
        "month-over-month changes (e.g. \"Subscribers grew 12% (+142)\"). No preamble, no bullet points, no sign-off.",
      user: `Client: ${client?.name ?? "the client"}${body.periodLabel ? ` · Period: ${body.periodLabel}` : ""}\n\nMetrics:\n${lines.join("\n")}`,
      maxTokens: 400,
    });

    return apiOk({ narrative: narrative.trim() });
  } catch (error) {
    return fromError(error);
  }
}
