import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { moveOnboardingToWorkflow } from "@/server/onboarding";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await moveOnboardingToWorkflow(id);
    return apiOk({ slug: result.slug });
  } catch (error) {
    return fromError(error);
  }
}
