// Shared system-status helpers — framework-free so both the server (wiki.ts) and
// the client editor/board import them. A status page is a ClientWikiPage of type
// SYSTEM_STATUS whose JSON content is `{ systems: SystemStatusItem[] }`.

export type SystemStatusLevel = "OPERATIONAL" | "DEGRADED" | "DOWN";

export interface SystemStatusItem {
  id: string;
  name: string;
  status: SystemStatusLevel;
  /** Optional short note shown beside the system (e.g. "Investigating latency"). */
  note?: string;
}

export interface SystemStatusContent {
  systems: SystemStatusItem[];
}

export const SYSTEM_STATUS_LEVELS: SystemStatusLevel[] = ["OPERATIONAL", "DEGRADED", "DOWN"];

/** Per-level presentation: dot colour, per-system label, and the overall banner copy. */
export const SYSTEM_STATUS_META: Record<
  SystemStatusLevel,
  { label: string; overall: string; color: string; tint: string }
> = {
  OPERATIONAL: {
    label: "Operational",
    overall: "All systems operational",
    color: "#10b981", // emerald-500
    tint: "rgba(16,185,129,0.12)",
  },
  DEGRADED: {
    label: "Degraded",
    overall: "Degraded performance",
    color: "#f59e0b", // amber-500
    tint: "rgba(245,158,11,0.14)",
  },
  DOWN: {
    label: "Down",
    overall: "Major outage",
    color: "#e11d48", // rose-600
    tint: "rgba(225,29,72,0.12)",
  },
};

/** Severity ordering — higher wins when deriving the overall status. */
const SEVERITY: Record<SystemStatusLevel, number> = {
  OPERATIONAL: 0,
  DEGRADED: 1,
  DOWN: 2,
};

function isLevel(v: unknown): v is SystemStatusLevel {
  return v === "OPERATIONAL" || v === "DEGRADED" || v === "DOWN";
}

/** Safely coerce stored JSON content into a SystemStatusContent. */
export function parseSystemStatus(content: unknown): SystemStatusContent {
  if (!content || typeof content !== "object") return { systems: [] };
  const raw = (content as { systems?: unknown }).systems;
  if (!Array.isArray(raw)) return { systems: [] };
  const systems: SystemStatusItem[] = raw
    .map((s, i): SystemStatusItem | null => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      if (!name.trim()) return null;
      return {
        id: typeof o.id === "string" && o.id ? o.id : `sys-${i}`,
        name,
        status: isLevel(o.status) ? o.status : "OPERATIONAL",
        note: typeof o.note === "string" && o.note.trim() ? o.note : undefined,
      };
    })
    .filter((s): s is SystemStatusItem => s !== null);
  return { systems };
}

/** Worst current status across all systems, or null when there are none. */
export function overallSystemStatus(systems: SystemStatusItem[]): SystemStatusLevel | null {
  if (!systems.length) return null;
  return systems.reduce<SystemStatusLevel>(
    (worst, s) => (SEVERITY[s.status] > SEVERITY[worst] ? s.status : worst),
    "OPERATIONAL",
  );
}
