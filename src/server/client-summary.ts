/**
 * The client summary board — fetching only. The triage and ordering are pure and live
 * in `src/lib/client-summary.ts`.
 *
 * ⚠️ Everything here is BATCHED. The natural shape of this page is one query per client
 * per signal, and at thirteen clients and four signals that is fifty-two round trips on
 * every load. §42.13 records the same mistake shipping in the Care HQ tile, which fired
 * a pair of queries per row and pulled a hundred conversation rows purely to count
 * them. Three grouped queries serve the whole board here.
 *
 * ## Scoping
 *
 * The client set comes from `listDerivedClients`, which already applies the viewer's
 * `ClientAssignment` scoping and the `clients.viewFinancials` gate. A restricted
 * developer therefore sees their own clients on this board and no others — the board
 * must not become a way around scoping that every other Portal surface applies.
 */
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { canViewClientFinancials } from "@/server/auth/effective-user";
import { computeDistinctDevCount } from "@/server/client-metrics";
import { listDerivedClients } from "@/server/clients";
import { getClientQueueSummaries } from "@/server/support";
import { buildSummaryBoard, type SummaryClientInput } from "@/lib/client-summary";

const WINDOW_DAYS = 7;

export interface ClientSummaryBoard extends ReturnType<typeof buildSummaryBoard> {
  /** Distinct people across the visible clients — never a sum of per-client counts. */
  devTotal: number;
  generatedAt: string;
}

/** Per-client task movement, in ONE pass rather than one query per client. */
async function taskMovement(clientIds: string[], since: Date) {
  if (clientIds.length === 0) return new Map<string, { delivered: number; inFlight: number; planned: number }>();
  const rows = await prisma.task.findMany({
    where: { clientId: { in: clientIds }, parentId: null, archivedAt: null },
    select: { clientId: true, status: true, startedAt: true, completedAt: true },
  });
  const out = new Map<string, { delivered: number; inFlight: number; planned: number }>();
  for (const id of clientIds) out.set(id, { delivered: 0, inFlight: 0, planned: 0 });
  for (const t of rows) {
    if (!t.clientId) continue;
    const bucket = out.get(t.clientId);
    if (!bucket) continue;
    // ⚠️ Same rule as RoundUp: `status` decides WHETHER, the stamp only says WHEN. A
    // DONE task with no completedAt is delivered — just not in this week's figure.
    if (t.status === "DONE") {
      if (t.completedAt && t.completedAt >= since) bucket.delivered += 1;
    } else if (t.startedAt) {
      bucket.inFlight += 1;
    } else {
      bucket.planned += 1;
    }
  }
  return out;
}

/** Open blockers per client — work we cannot move until they answer. */
async function blockerCounts(clientIds: string[]) {
  const out = new Map<string, number>();
  if (clientIds.length === 0) return out;
  const grouped = await prisma.task.groupBy({
    by: ["clientId"],
    where: {
      clientId: { in: clientIds },
      archivedAt: null,
      blockedAt: { not: null },
      blockedResponse: null,
    },
    _count: { _all: true },
  });
  for (const row of grouped) if (row.clientId) out.set(row.clientId, row._count._all);
  return out;
}

export async function loadClientSummaryBoard(
  user: EffectiveUser | null,
  now = new Date(),
): Promise<ClientSummaryBoard> {
  const { clients } = await listDerivedClients({
    status: "ACTIVE",
    includePulse: true,
    includeFinancials: user ? canViewClientFinancials(user) : false,
  });
  const ids = clients.map((c) => c.id);
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [movement, blockers, care, careLinks, flags] = await Promise.all([
    taskMovement(ids, since),
    blockerCounts(ids),
    // Already batched across the whole workspace — see §42.9.
    getClientQueueSummaries().catch(
      () => ({}) as Awaited<ReturnType<typeof getClientQueueSummaries>>,
    ),
    /**
     * ⚠️ `getClientQueueSummaries` is keyed by SUPPORT client id, not Portal client id.
     * Indexing it with a WorkspaceClient id matches nothing and returns 0 awaiting for
     * everyone — silently, and plausibly, because 0 is a perfectly ordinary answer.
     * The same client is `wedge` in Portal and "Big Wedge Golf" in Care (§42.15), so
     * the link is the stored `workspaceClientId` and never a name.
     */
    prisma.supportClient.findMany({
      where: { workspaceClientId: { in: ids } },
      select: { id: true, workspaceClientId: true },
    }),
    prisma.workspaceClient.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        summaryNote: true,
        summaryDetail: true,
        summaryNoteAt: true,
        summaryHidden: true,
      },
    }),
  ]);

  const careIdFor = new Map(
    careLinks.flatMap((l) => (l.workspaceClientId ? [[l.workspaceClientId, l.id] as const] : [])),
  );
  const flagById = new Map(flags.map((f) => [f.id, f]));
  const inputs: SummaryClientInput[] = clients.map((c) => {
    const m = movement.get(c.id) ?? { delivered: 0, inFlight: 0, planned: 0 };
    const f = flagById.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      hidden: f?.summaryHidden ?? false,
      health: c.health?.level ?? null,
      devCount: c.devCount,
      waitingOnClient: blockers.get(c.id) ?? 0,
      awaitingReply: care[careIdFor.get(c.id) ?? ""]?.awaiting ?? 0,
      deliveredThisWeek: m.delivered,
      inFlight: m.inFlight,
      planned: m.planned,
      note: f?.summaryNote ?? null,
      detail: f?.summaryDetail ?? null,
      noteAt: f?.summaryNoteAt?.toISOString() ?? null,
    };
  });

  const board = buildSummaryBoard(inputs, now);
  // Counted over the VISIBLE clients only, so the figure agrees with the cards below it.
  const { workspace } = await ensureBaseRecords();
  const devTotal = await computeDistinctDevCount(
    workspace.id,
    board.cards.map((c) => c.id),
  );
  return { ...board, devTotal, generatedAt: now.toISOString() };
}

/**
 * Apply one edit to a client's summary card.
 *
 * ⚠️ Scoped to the workspace via `updateMany`, not `update({ where: { id } })`. The id
 * arrives from the browser, and a bare id-keyed update would let a caller who passes
 * `canManageClients` write a row belonging to any workspace — `updateClientRecord`
 * keys on `workspaceId_slug` for the same reason. A miss updates NOTHING and is
 * reported as a miss rather than silently succeeding.
 */
async function updateSummaryFields(
  clientId: string,
  data: { summaryNote?: string | null; summaryNoteAt?: Date | null; summaryHidden?: boolean },
): Promise<boolean> {
  const { workspace } = await ensureBaseRecords();
  const { count } = await prisma.workspaceClient.updateMany({
    where: { id: clientId, workspaceId: workspace.id },
    data,
  });
  return count > 0;
}

/**
 * Write the summary line and/or the fuller update.
 *
 * ⚠️ The stamp moves with the text and is never set by hand — an age that can be
 * edited independently of its content is worse than no age at all. It is cleared only
 * when BOTH fields are empty, because it means "when did anyone last write about this
 * client", not "when was this particular box last touched".
 */
export function setClientSummaryNote(
  clientId: string,
  next: { note?: string | null; detail?: string | null },
  current: { note: string | null; detail: string | null },
): Promise<boolean> {
  const note = next.note === undefined ? current.note : next.note;
  const detail = next.detail === undefined ? current.detail : next.detail;
  const data: { summaryNote?: string | null; summaryDetail?: string | null; summaryNoteAt: Date | null } =
    { summaryNoteAt: note || detail ? new Date() : null };
  if (next.note !== undefined) data.summaryNote = next.note;
  if (next.detail !== undefined) data.summaryDetail = next.detail;
  return updateSummaryFields(clientId, data);
}

/** The stored prose, so a partial write can preserve the field it does not touch. */
export async function getClientSummaryText(clientId: string) {
  const row = await prisma.workspaceClient.findUnique({
    where: { id: clientId },
    select: { summaryNote: true, summaryDetail: true },
  });
  return { note: row?.summaryNote ?? null, detail: row?.summaryDetail ?? null };
}

export function setClientSummaryHidden(clientId: string, hidden: boolean): Promise<boolean> {
  return updateSummaryFields(clientId, { summaryHidden: hidden });
}
