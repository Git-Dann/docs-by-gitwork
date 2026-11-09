import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { aiAnswersConfigSchema } from "@/server/validators";
import { assertAtLeastAdmin, assertInternal, requireAuthedUser } from "@/server/auth/effective-user";
import { setAiAnswersConfig } from "@/server/ai-answers";
import { parseAiAnswersConfig } from "@/lib/ai-answers";

export const dynamic = "force-dynamic";

/** PUT /api/pulse/ai-search/answers/config — the questions, our names and domains, and which assistants to ask. Admins. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertInternal(user);
    assertAtLeastAdmin(user);
    const input = aiAnswersConfigSchema.parse(await request.json());
    return apiOk({ config: await setAiAnswersConfig(user.workspaceId, parseAiAnswersConfig(input)) });
  } catch (error) {
    return fromError(error);
  }
}
