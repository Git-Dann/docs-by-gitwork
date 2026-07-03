import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { generateSupportReportDocument } from "@/server/support-report-doc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/support/clients/[clientId]/reports/generate-doc
// Body: { periodStart, periodEnd, periodLabel, author?, force? }
// Pulls live ticket + analytics data and builds a Docs `Document` (type REPORT),
// returning its id so the caller can open the Docs builder at /app/docs/[id].
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
      author?: string;
      force?: boolean;
    };

    if (!body.periodStart || !body.periodEnd || !body.periodLabel) {
      return apiError("periodStart, periodEnd and periodLabel are required", 400);
    }

    const documentId = await generateSupportReportDocument({
      clientId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      periodLabel: body.periodLabel,
      author: body.author,
      force: body.force,
    });

    return apiOk({ documentId });
  } catch (error) {
    return fromError(error);
  }
}
