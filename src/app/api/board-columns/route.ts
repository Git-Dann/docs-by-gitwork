import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getBoardColumns, setBoardColumns } from "@/server/board-columns";
import { boardColumnsSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return apiError("Missing clientId", 400);
    return apiOk(await getBoardColumns(user, clientId));
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const clientId = new URL(req.url).searchParams.get("clientId");
    if (!clientId) return apiError("Missing clientId", 400);
    const { columns } = boardColumnsSchema.parse(await req.json());
    return apiOk(await setBoardColumns(user, clientId, columns));
  } catch (e) {
    return fromError(e);
  }
}
