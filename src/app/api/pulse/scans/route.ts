import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { pulseScanCreateSchema } from "@/server/validators";
import { createPulseScanRecord, runAnalysis, listPulseScans } from "@/server/pulse";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

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
    const { scan, aiConfig } = await createPulseScanRecord({
      projectName: body.projectName,
      inputType: body.inputType,
      inputUrl: body.inputUrl,
      inputGithubRepo: body.inputGithubRepo,
      inputDescription: body.inputDescription,
      clientId: body.clientId,
    });

    // after() keeps the serverless function alive after the response is sent.
    // Without this, Vercel freezes the process once the HTTP response completes,
    // leaving the scan stuck in RUNNING state forever.
    after(() =>
      runAnalysis(scan.id, {
        inputType: body.inputType,
        inputUrl: body.inputUrl,
        inputGithubRepo: body.inputGithubRepo,
        inputDescription: body.inputDescription,
        projectName: body.projectName,
        clientId: body.clientId,
      }, aiConfig)
    );

    return apiOk({ scan }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
