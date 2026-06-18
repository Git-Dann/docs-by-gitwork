// Bulk task operations — select-all + batch edit / delete / create.
//   POST   /api/tasks/batch  { clientId, tasks } → bulk-create tasks for one client
//   PATCH  /api/tasks/batch  { ids, patch }      → apply one patch to many tasks
//   DELETE /api/tasks/batch  { ids }             → delete many tasks
// All are scoped: a restricted developer can only touch tasks on their clients.

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { batchCreateTasks, batchUpdateTasks, batchDeleteTasks } from "@/server/tasks";
import { taskBatchCreateSchema, taskBatchUpdateSchema, taskBatchDeleteSchema } from "@/server/validators";

export const dynamic = "force-dynamic";
// A large selection means many sequential updates — give it headroom.
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const { clientId, tasks } = taskBatchCreateSchema.parse(await req.json());
    return apiOk(await batchCreateTasks(user, clientId, tasks));
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const { ids, patch } = taskBatchUpdateSchema.parse(await req.json());
    return apiOk(await batchUpdateTasks(user, ids, patch));
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const { ids } = taskBatchDeleteSchema.parse(await req.json());
    return apiOk(await batchDeleteTasks(user, ids));
  } catch (e) {
    return fromError(e);
  }
}
