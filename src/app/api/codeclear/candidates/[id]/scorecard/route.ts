import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { codeClearDetailInclude, serializeCandidateDetails } from "@/server/codeclear";
import { analysisStateLabel, statusLabel, tierLabel } from "@/types/codeclear";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function truncate(value: string, maxLength = 110) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;
    const candidate = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      include: codeClearDetailInclude,
    });

    if (!candidate) {
      return apiError("Candidate not found.", 404);
    }

    const detail = serializeCandidateDetails(candidate);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const accent = rgb(0.2, 0.36, 1);
    const ink = rgb(0.09, 0.09, 0.11);
    const muted = rgb(0.38, 0.38, 0.42);
    let y = 790;

    const drawLine = (label: string, value: string, options?: { boldValue?: boolean }) => {
      page.drawText(label, { x: 48, y, size: 10, font: bold, color: muted });
      page.drawText(value, {
        x: 180,
        y,
        size: 11,
        font: options?.boldValue ? bold : font,
        color: ink,
      });
      y -= 22;
    };

    page.drawText("CodeClear Scorecard", {
      x: 48,
      y,
      size: 24,
      font: bold,
      color: ink,
    });
    y -= 30;

    page.drawText(detail.name, {
      x: 48,
      y,
      size: 16,
      font: bold,
      color: accent,
    });
    y -= 22;

    page.drawText(`@${detail.githubHandle} • ${detail.primaryStack}`, {
      x: 48,
      y,
      size: 11,
      font,
      color: muted,
    });
    y -= 32;

    drawLine("Status", statusLabel(detail.status));
    drawLine("Tier", tierLabel(detail.tier));
    drawLine("Analysis state", analysisStateLabel(detail.analysisState));
    drawLine("Email", detail.email ?? "—");
    drawLine("Location", detail.location ?? "—");
    drawLine("Re-check due", detail.recheckDueAt ? detail.recheckDueAt.slice(0, 10) : "—");

    y -= 8;
    page.drawText("Verification", {
      x: 48,
      y,
      size: 13,
      font: bold,
      color: ink,
    });
    y -= 22;

    drawLine("Overall score", detail.score ? String(detail.score.overallScore) : "Not finalized", {
      boldValue: true,
    });
    drawLine(
      "Technical depth",
      detail.score ? String(detail.score.technicalDepth) : detail.scoreDraft?.technicalDepth?.toString() ?? "—",
    );
    drawLine(
      "Code quality",
      detail.score ? String(detail.score.codeQuality) : detail.scoreDraft?.codeQuality?.toString() ?? "—",
    );
    drawLine(
      "AI fluency",
      detail.score ? String(detail.score.aiFluency) : detail.scoreDraft?.aiFluency?.toString() ?? "—",
    );
    drawLine(
      "Delivery readiness",
      detail.score
        ? String(detail.score.deliveryReadiness)
        : detail.scoreDraft?.deliveryReadiness?.toString() ?? "—",
    );

    y -= 8;
    page.drawText("Latest analysis summary", {
      x: 48,
      y,
      size: 13,
      font: bold,
      color: ink,
    });
    y -= 22;

    const summary =
      detail.latestGitHubAnalysis?.llmSummary ??
      detail.score?.taskAiReview ??
      detail.scoreDraft?.taskAiReview ??
      "No GitHub analysis summary available yet.";
    page.drawText(truncate(summary, 190), {
      x: 48,
      y,
      size: 11,
      font,
      color: ink,
      maxWidth: 500,
      lineHeight: 15,
    });
    y -= 70;

    page.drawText("Recent notes", {
      x: 48,
      y,
      size: 13,
      font: bold,
      color: ink,
    });
    y -= 22;

    const notes = detail.notes.slice(0, 3);
    if (!notes.length) {
      page.drawText("No notes captured yet.", {
        x: 48,
        y,
        size: 11,
        font,
        color: muted,
      });
      y -= 20;
    } else {
      for (const note of notes) {
        page.drawText(`• ${truncate(note.body, 120)}`, {
          x: 48,
          y,
          size: 11,
          font,
          color: ink,
          maxWidth: 500,
          lineHeight: 15,
        });
        y -= 20;
      }
    }

    y -= 12;
    page.drawText("Placements", {
      x: 48,
      y,
      size: 13,
      font: bold,
      color: ink,
    });
    y -= 22;

    const placements = detail.placements.slice(0, 3);
    if (!placements.length) {
      page.drawText("No placements logged yet.", {
        x: 48,
        y,
        size: 11,
        font,
        color: muted,
      });
    } else {
      for (const placement of placements) {
        page.drawText(
          `• ${placement.clientName} — ${placement.projectName} (${placement.startDate.slice(0, 10)})`,
          {
            x: 48,
            y,
            size: 11,
            font,
            color: ink,
            maxWidth: 500,
          },
        );
        y -= 20;
      }
    }

    const pdfBytes = await pdf.save();
    const filename = `${safeFilename(detail.name)}-codeclear-scorecard.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
