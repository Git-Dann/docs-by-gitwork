import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManagePulse, canGenerateAi, canSeeAllClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccess } from "@/server/client-assignments";
import { assignedClientIds } from "@/server/tasks";
import { pulseScanCreateSchema } from "@/server/validators";
import { createPulseScanRecord, runAnalysis, listPulseScans } from "@/server/pulse";
import { getRequestUser } from "@/server/auth/request-user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get("clientId") ?? undefined;
    // Scope to the viewer's clients. Null user = trusted API_KEY / legacy caller → unscoped
    // (preserved). A restricted developer only ever receives their assigned clients' scans.
    const user = await getEffectiveUserOrNull(request);
    const clientIds = user && !canSeeAllClients(user) ? await assignedClientIds(user) : null;
    const scans = await listPulseScans({
      clientId,
      clientIds,
      // A scoped viewer always sees their own scans, even ones with no client.
      triggeredByUserId: clientIds ? (user?.id ?? null) : null,
    });
    return apiOk({ scans });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Running a scan spends AI tokens (synthesis/discovery run after the free checks), so it
    // needs BOTH the Pulse-manage action AND the AI-generation gate. Admins hold both; a scoped
    // developer holds neither, and Staff (pulse.manage but not ai.generate) can't spend on scans.
    const scanUser = await getEffectiveUserOrNull(request);
    assertCan(scanUser, canManagePulse, "create Pulse scans");
    assertCan(scanUser, canGenerateAi, "run AI-powered Pulse scans");
    const body = pulseScanCreateSchema.parse(await request.json());

    // ⚠️ `clientId` arrives in the BODY and was passed straight through. A scoped
    // viewer — a restricted developer, or a guest with no assignments at all — could
    // therefore file a scan against any Gitwork client just by naming its id. The
    // picker not offering it is not a control; this is.
    if (body.clientId) await assertClientAccess(scanUser, body.clientId);

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
      // ⚠️ Fall back to the SESSION user, not just the mobile JWT. This used to be
      // mobile-only ("web callers are attributed to null"), which was harmless while
      // attribution only picked push targets — but the scan list now scopes on it, so a
      // web scan attributed to nobody is a scan its author cannot find.
      triggeredByUserId: requestUser?.id ?? scanUser?.id ?? null,
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
