import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Shared schedule range queries — used by both /api/clients/[slug]/schedule
 * (per-client roster) and /api/codeclear/schedule (workspace-wide timeline).
 *
 * "In range" = the placement's date range overlaps [from, to]:
 *   placement.startDate <= to AND (placement.endDate IS NULL OR placement.endDate >= from)
 *
 * That captures open-ended engagements that are still active in the window.
 */

export interface ScheduleBlock {
  id: string;
  candidate: {
    id: string;
    name: string;
    githubHandle: string;
    primaryStack: string;
    avatarUrl: string | null;
    tier: "TIER_1" | "TIER_2" | "TIER_3";
    effectiveTier: "TIER_1" | "TIER_2" | "TIER_3";
  };
  client: {
    id: string | null;
    name: string;
    slug: string | null;
  };
  projectName: string;
  startDate: string;
  endDate: string | null;
  allocationPercent: number;
  notes: string | null;
}

/**
 * Parses ?from= and ?to= search params. Defaults: from = today, to = today + 30d.
 * Throws if either value is present but unparseable.
 */
export function parseScheduleRange(searchParams: URLSearchParams): {
  from: Date;
  to: Date;
} {
  const now = new Date();
  const defaultFrom = startOfDay(now);
  const defaultTo = startOfDay(addDays(now, 30));

  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  const from = fromRaw ? parseStrict(fromRaw) : defaultFrom;
  const to = toRaw ? parseStrict(toRaw) : defaultTo;

  if (from.getTime() > to.getTime()) {
    // Swap rather than throw — gentler for clients.
    return { from: to, to: from };
  }
  return { from, to };
}

function parseStrict(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date in schedule range: ${value}`);
  }
  return parsed;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Mirrors effectiveTier in src/server/codeclear-scoring.ts. */
function deriveEffectiveTier(
  tier: "TIER_1" | "TIER_2" | "TIER_3",
  manualOverride: "TIER_1" | "TIER_2" | "TIER_3" | null,
): "TIER_1" | "TIER_2" | "TIER_3" {
  return manualOverride ?? tier;
}

/**
 * Range-overlap WHERE clause. Open-ended placements (endDate IS NULL) are
 * always included if they started on/before `to`.
 */
function rangeOverlapWhere(from: Date, to: Date): Prisma.PlacementWhereInput {
  return {
    AND: [
      { startDate: { lte: to } },
      { OR: [{ endDate: null }, { endDate: { gte: from } }] },
    ],
  };
}

const scheduleInclude = {
  candidate: {
    select: {
      id: true,
      name: true,
      githubHandle: true,
      primaryStack: true,
      avatarUrl: true,
      tier: true,
      tierManualOverride: true,
    },
  },
  client: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.PlacementInclude;

type PlacementWithIncludes = Prisma.PlacementGetPayload<{
  include: typeof scheduleInclude;
}>;

function serializeBlock(placement: PlacementWithIncludes): ScheduleBlock {
  return {
    id: placement.id,
    candidate: {
      id: placement.candidate.id,
      name: placement.candidate.name,
      githubHandle: placement.candidate.githubHandle,
      primaryStack: placement.candidate.primaryStack,
      avatarUrl: placement.candidate.avatarUrl ?? null,
      tier: placement.candidate.tier,
      effectiveTier: deriveEffectiveTier(
        placement.candidate.tier,
        placement.candidate.tierManualOverride,
      ),
    },
    client: placement.client
      ? {
          id: placement.client.id,
          name: placement.client.name,
          slug: placement.client.slug,
        }
      : { id: null, name: placement.clientName, slug: null },
    projectName: placement.projectName,
    startDate: placement.startDate.toISOString(),
    endDate: placement.endDate ? placement.endDate.toISOString() : null,
    allocationPercent: placement.allocationPercent,
    notes: placement.notes,
  };
}

/** Per-client schedule. */
export async function getClientSchedule(args: {
  workspaceId: string;
  clientId: string;
  from: Date;
  to: Date;
}): Promise<ScheduleBlock[]> {
  const rows = await prisma.placement.findMany({
    where: {
      clientId: args.clientId,
      candidate: { workspaceId: args.workspaceId },
      ...rangeOverlapWhere(args.from, args.to),
    },
    include: scheduleInclude,
    orderBy: [{ startDate: "asc" }, { candidate: { name: "asc" } }],
  });
  return rows.map(serializeBlock);
}

/** Workspace-wide schedule (every block from every dev). */
export async function getWorkspaceSchedule(args: {
  workspaceId: string;
  from: Date;
  to: Date;
}): Promise<ScheduleBlock[]> {
  const rows = await prisma.placement.findMany({
    where: {
      candidate: { workspaceId: args.workspaceId },
      ...rangeOverlapWhere(args.from, args.to),
    },
    include: scheduleInclude,
    orderBy: [{ startDate: "asc" }, { candidate: { name: "asc" } }],
  });
  return rows.map(serializeBlock);
}
