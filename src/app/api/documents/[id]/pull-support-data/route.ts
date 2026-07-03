import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { pullSupportDataIntoDocument } from "@/server/support-report-doc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/documents/[id]/pull-support-data
// Body: { clientId (support client), periodStart, periodEnd, periodLabel }
// Fills the open REPORT document's data sections from the client's live support data,
// leaving the narrative sections untouched.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      periodStart?: string;
      periodEnd?: string;
      periodLabel?: string;
    };

    if (!body.clientId || !body.periodStart || !body.periodEnd || !body.periodLabel) {
      return apiError("clientId, periodStart, periodEnd and periodLabel are required", 400);
    }

    const result = await pullSupportDataIntoDocument({
      documentId: id,
      clientId: body.clientId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      periodLabel: body.periodLabel,
    });

    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
