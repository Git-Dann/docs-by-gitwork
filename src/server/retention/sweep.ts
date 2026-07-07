/**
 * Retention sweep — the RETENTION_SWEEP job body.
 *
 * For each workspace with an available cold store, runs every registered RetentionPolicy's
 * `tierDown`, moving aged data off the hot working set. A workspace with no cold store (Drive
 * selected but backup disabled/unconnected, and no `COLD_STORE_DIR`) is skipped cleanly. Bounded
 * per run by `batchLimit`; a backlog drains over subsequent runs. Best-effort per policy — one
 * policy's error doesn't abort the rest.
 */

import { prisma } from "@/lib/prisma";
import { getColdStore } from "@/server/retention/cold-store";
import { RETENTION_POLICIES, getPolicy } from "@/server/retention/policies";

export interface SweepResult {
  workspaces: number;
  tiered: Array<{ workspaceId: string; policyKey: string; archives: number; rows: number }>;
  skipped: number;
  errors: string[];
}

export async function runRetentionSweep(opts?: {
  policyKey?: string;
  batchLimit?: number;
}): Promise<SweepResult> {
  const batchLimit = opts?.batchLimit ?? 200;
  const policies = opts?.policyKey
    ? [getPolicy(opts.policyKey)].filter((p): p is NonNullable<typeof p> => Boolean(p))
    : RETENTION_POLICIES;

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, docsBackupEnabled: true, coldStoreFolderId: true },
  });

  const out: SweepResult = { workspaces: 0, tiered: [], skipped: 0, errors: [] };

  for (const ws of workspaces) {
    const store = await getColdStore(ws);
    if (!store) {
      out.skipped += 1;
      continue;
    }
    out.workspaces += 1;

    for (const policy of policies) {
      try {
        const res = await policy.tierDown({ store, workspaceId: ws.id, batchLimit });
        if (res.archives > 0) {
          out.tiered.push({ workspaceId: ws.id, policyKey: policy.key, ...res });
        }
      } catch (err) {
        out.errors.push(`${ws.id}/${policy.key}: ${String(err).slice(0, 160)}`);
      }
    }
  }

  return out;
}
