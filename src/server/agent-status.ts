/**
 * agent-status.ts — tiny in-process beacon for Claude agent state, powering the
 * "Foundry Micro" Stream Deck surface (the animated Claw'd key). Claude Code hooks
 * POST `{ sessionId, state }` as an agent moves through idle → thinking → needs-you
 * → done; the deck's local bridge polls the latest state and animates accordingly.
 *
 * Foundry runs as a single long-lived container (CLAUDE.md §23), so a module-level
 * Map persists across requests — same pattern as `golf-cache.ts`. A `globalThis`
 * guard keeps it alive across dev hot-reloads (mirrors `src/lib/prisma.ts`). Entries
 * self-expire so a crashed/closed session drops off. No schema change, no persistence
 * needed — this is ephemeral presence, not a record.
 */

export const AGENT_STATES = ["idle", "thinking", "needs-you", "done", "error"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

interface Entry {
  state: AgentState;
  label?: string;
  updatedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __agentStatus: Map<string, Entry> | undefined;
}

const store = globalThis.__agentStatus ?? new Map<string, Entry>();
if (process.env.NODE_ENV !== "production") globalThis.__agentStatus = store;

/** A session is considered stale (agent gone) after this long with no update. */
export const AGENT_STATUS_TTL_MS = 5 * 60 * 1000;

export interface AgentStatusDTO {
  sessionId: string;
  state: AgentState;
  label?: string;
  updatedAt: string;
}

export function setAgentStatus(sessionId: string, state: AgentState, label?: string): void {
  store.set(sessionId, { state, label, updatedAt: Date.now() });
}

function pruneExpired(now: number): void {
  for (const [id, entry] of store) {
    if (now - entry.updatedAt > AGENT_STATUS_TTL_MS) store.delete(id);
  }
}

/** All live sessions, newest first. */
export function listAgentStatus(): AgentStatusDTO[] {
  const now = Date.now();
  pruneExpired(now);
  return [...store.entries()]
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([sessionId, e]) => ({
      sessionId,
      state: e.state,
      label: e.label,
      updatedAt: new Date(e.updatedAt).toISOString(),
    }));
}

/**
 * The single state the deck should show. `needs-you` always wins (it needs the human),
 * then `thinking`/`error`, else the most-recent session's state, else idle.
 */
export function summaryAgentState(): AgentState {
  const live = listAgentStatus();
  if (live.length === 0) return "idle";
  if (live.some((a) => a.state === "needs-you")) return "needs-you";
  if (live.some((a) => a.state === "thinking")) return "thinking";
  if (live.some((a) => a.state === "error")) return "error";
  return live[0].state;
}
