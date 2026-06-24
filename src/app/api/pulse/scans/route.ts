import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { pulseScanCreateSchema } from "@/server/validators";
import { createPulseScanRecord, runAnalysis, listPulseScans } from "@/server/pulse";
import { getRequestUser } from "@/server/auth/request-user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
    const scans = await listPulseScans({ clientId });
    return apiOk({ scans });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "create Pulse scans");
    const body = pulseScanCreateSchema.parse(await request.json());

    // For URL/GITHUB_REPO scans, projectDescription supplements the main input as inputDescription.
    // For FREE_TEXT scans, inputDescription IS the main input — use it directly.
    const inputDescriptionForRecord =
      body.inputType === "FREE_TEXT"
        ? body.inputDescription
        : body.projectDescription ?? body.inputDescription;

    // Mobile JWT callers have a real userId — attribute the scan to them so
    // completion push targets only their devices. Web/API_KEY callers are
    // attributed to null and notify the whole workspace.
    const requestUser = getRequestUser(request);

    const { scan, aiConfig } = await createPulseScanRecord({
      projectName: body.projectName,
      inputType: body.inputType,
      inputUrl: body.inputUrl,
      inputGithubRepo: body.inputGithubRepo,
      inputDescription: inputDescriptionForRecord,
      platform: body.platform,
      clientId: body.clientId,
      aiProvider: body.aiProvider,
      competitorUrls: body.competitorUrls,
      targetMarkets: body.targetMarkets,
      triggeredByUserId: requestUser?.id ?? null,
    });

    after(() =>
      runAnalysis(scan.id, {
        inputType: body.inputType,
        inputUrl: body.inputUrl,
        inputGithubRepo: body.inputGithubRepo,
        inputDescription: inputDescriptionForRecord,
        projectName: body.projectName,
        platform: body.platform,
        clientId: body.clientId,
        competitorUrls: body.competitorUrls,
        // testEmail and testPassword flow into runAnalysis only — never stored in DB
        testEmail: body.testEmail,
        testPassword: body.testPassword,
      }, aiConfig)
    );

    return apiOk({ scan }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
