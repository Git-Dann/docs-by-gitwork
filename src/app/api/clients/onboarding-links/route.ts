import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  createOnboardingLink,
  listOnboardingLinks,
} from "@/server/onboarding";
import { onboardingLinkCreateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listOnboardingLinks();
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "manage onboarding links");
    const body = onboardingLinkCreateSchema.parse(await request.json().catch(() => ({})));
    const link = await createOnboardingLink(body);
    return apiOk({ link }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
