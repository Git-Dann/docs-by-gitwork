import { NextRequest, after } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, assertInternal, requireAuthedUser } from "@/server/auth/effective-user";
import { AnswerRunRefused, executeAnswerRun, getAiAnswersReport, startAnswerRun } from "@/server/ai-answers";

export const dynamic = "force-dynamic";

/** GET /api/pulse/ai-search/answers — the buyer questions, the last runs and which assistants can be asked. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertInternal(user);
    return apiOk({ report: await getAiAnswersReport(user.workspaceId) });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * POST /api/pulse/ai-search/answers — ask the buyer questions now. Admins: each run is paid
 * API calls. Returns at once; the run carries on in the background and the page polls it.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertInternal(user);
    assertAtLeastAdmin(user);
    const { run, created } = await startAnswerRun(user.workspaceId, { trigger: "manual", startedById: user.id });
    if (created) after(() => executeAnswerRun(run.id));
    return apiOk({ runId: run.id, alreadyRunning: !created });
  } catch (error) {
    if (error instanceof AnswerRunRefused) return apiError(error.message, 400);
    return fromError(error);
  }
}
