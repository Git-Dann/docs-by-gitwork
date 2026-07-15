/**
 * Curator — deterministic Starter lifecycle pass (no LLM).
 *
 * Workspace-authored, non-pinned, non-built-in starters age ACTIVE → STALE → ARCHIVED by
 * inactivity (measured from `lastUsedAt`, falling back to `createdAt`). Built-ins (`isDefault`)
 * and pinned starters are never mutated — only surfaced in the report. Never deletes.
 */

import { prisma } from "@/lib/prisma";
import type { CuratorConfig, CuratorTransition, StarterLifecycleState, TransitionKind } from "./types";

export interface StarterLifecycleInput {
  id: string;
  name: string;
  isDefault: boolean;
  pinned: boolean;
  curatorState: StarterLifecycleState;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const DAY_MS = 86_400_000;

/**
 * Decide the next lifecycle state for one starter, or null if it stays put. Pure + DB-free so it's
 * unit-testable. A starter idle past the archive threshold archives directly (skipping STALE).
 */
export function decideStarterTransition(
  s: StarterLifecycleInput,
  config: CuratorConfig,
  now: Date,
): { to: StarterLifecycleState; kind: TransitionKind } | null {
  // Exempt: shipped built-ins, pinned, already terminal.
  if (s.isDefault || s.pinned || s.curatorState === "ARCHIVED") return null;

  const ref = s.lastUsedAt ?? s.createdAt;
  const idleDays = (now.getTime() - ref.getTime()) / DAY_MS;

  if (idleDays >= config.archiveAfterDays) {
    return { to: "ARCHIVED", kind: "starter_archive" };
  }
  if (idleDays >= config.staleAfterDays && s.curatorState === "ACTIVE") {
    return { to: "STALE", kind: "starter_stale" };
  }
  return null;
}

/** A living starter offered to the LLM consolidation pass (to spot near-duplicates). */
export interface StarterCandidate {
  id: string;
  name: string;
  summary: string;
  tags: string[];
  usageCount: number;
  daysSinceUsed: number | null;
  state: StarterLifecycleState;
}

export interface StartersPassResult {
  scanned: number;
  transitions: CuratorTransition[];
  candidates: StarterCandidate[];
}

/**
 * Run the deterministic pass for a workspace. Applies transitions unless `dryRun`. Returns the
 * transitions and the set of living (non-archived) starters for the optional LLM pass.
 */
export async function runStartersPass(
  workspaceId: string,
  config: CuratorConfig,
  now: Date,
  dryRun: boolean,
): Promise<StartersPassResult> {
  // Only workspace-authored starters are managed (built-ins have workspaceId=null and are
  // re-seeded on boot; a duplicated built-in is workspace-owned with isDefault=false).
  const rows = await prisma.starter.findMany({
    where: { workspaceId, isDefault: false },
    select: {
      id: true,
      name: true,
      summary: true,
      tags: true,
      usageCount: true,
      isDefault: true,
      pinned: true,
      curatorState: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  const transitions: CuratorTransition[] = [];

  for (const s of rows) {
    const decision = decideStarterTransition(
      {
        id: s.id,
        name: s.name,
        isDefault: s.isDefault,
        pinned: s.pinned,
        curatorState: s.curatorState as StarterLifecycleState,
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
      },
      config,
      now,
    );
    if (!decision) continue;

    transitions.push({
      kind: decision.kind,
      target: s.id,
      targetLabel: s.name,
      from: s.curatorState as StarterLifecycleState,
      to: decision.to,
    });

    if (!dryRun) {
      await prisma.starter.update({
        where: { id: s.id },
        data: {
          curatorState: decision.to,
          // Archiving also hides it from the active library list (existing filter on isArchived).
          ...(decision.to === "ARCHIVED" ? { isArchived: true } : {}),
        },
      });
    }
  }

  // Living starters (after this pass) become the LLM consolidation candidate set.
  const candidates: StarterCandidate[] = rows
    .map((s) => {
      const applied = transitions.find((t) => t.target === s.id);
      const state = (applied?.to ?? s.curatorState) as StarterLifecycleState;
      return { s, state };
    })
    .filter(({ state }) => state !== "ARCHIVED")
    .map(({ s, state }) => ({
      id: s.id,
      name: s.name,
      summary: s.summary,
      tags: s.tags,
      usageCount: s.usageCount,
      daysSinceUsed: s.lastUsedAt
        ? Math.floor((now.getTime() - s.lastUsedAt.getTime()) / DAY_MS)
        : null,
      state,
    }));

  return { scanned: rows.length, transitions, candidates };
}
