import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertSuperAdminOrApiKey, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { seedBuiltInStarters } from "@/server/starters-catalog";
import { seedStarterAdditions } from "@/server/starters-additions-seed";

export const dynamic = "force-dynamic";

// Manual re-seed of the built-in Starters catalog. The catalog is already seeded automatically
// on boot via ensureBaseRecords() → seedBuiltInStarters(); this route just lets a Super Admin
// force a refresh (idempotent upsert by slug + prune of stale built-ins).
export async function POST(request: Request) {
  try {
    assertSuperAdminOrApiKey(await getEffectiveUserOrNull(request));
    const { workspace } = await ensureBaseRecords();
    const count = await seedBuiltInStarters(workspace.id);
    const additionsCount = await seedStarterAdditions(workspace.id);
    return apiOk({ count: count + additionsCount });
  } catch (error) {
    return fromError(error);
  }
}
