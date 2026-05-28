import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { pulseScanCreateSchema } from "@/server/validators";
import { createPulseScanRecord, runAnalysis, listPulseScans } from "@/server/pulse";

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
    const body = pulseScanCreateSchema.parse(await request.json());

    // For URL/GITHUB_REPO scans, projectDescription supplements the main input as inputDescription.
    // For FREE_TEXT scans, inputDescription IS the main input — use it directly.
    const inputDescriptionForRecord =
      body.inputType === "FREE_TEXT"
        ? body.inputDescription
        : body.projectDescription ?? body.inputDescription;

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
