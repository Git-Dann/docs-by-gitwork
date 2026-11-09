// GET/PUT /api/backstage/commitments/settings → which sources the caller lets Commitments read.
import { apiOk, fromError } from "@/lib/api-response";
import { commitmentsUser } from "@/server/commitments-route";
import { getCommitmentSettings, updateCommitmentSettings } from "@/server/commitments";
import { commitmentSettingsSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return apiOk({ settings: await getCommitmentSettings(await commitmentsUser(req)) });
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await commitmentsUser(req);
    const body = commitmentSettingsSchema.parse(await req.json());
    return apiOk({ settings: await updateCommitmentSettings(user, body) });
  } catch (e) {
    return fromError(e);
  }
}
