/**
 * A client's history for the Portal page (src/components/clients/client-lifecycle.tsx): the
 * lifecycle milestones the server already works out, plus everything else on the client record
 * that carries a date (developers joining and leaving, Pulse scans, studies, platforms, designs,
 * links, CRM touchpoints). Pure, so the ordering and the honesty rules are testable.
 *
 * Nothing here is new data. It only puts the dates the page already has in one place.
 */

import type { ClientDetailRecord, ClientLifecycleEvent } from "@/types/client";

export type HistoryKind = "milestone" | "people" | "work";

export const HISTORY_KIND_LABELS: Record<HistoryKind, string> = {
  milestone: "Milestones",
  people: "People",
  work: "Work",
};

export type HistoryEvent = {
  id: string;
  kind: HistoryKind;
  label: string;
  detail: string;
  /** ISO. For an `ongoing` event this is only when the record last changed, so don't show it. */
  at: string;
  status: ClientLifecycleEvent["status"];
  /** True now, rather than a moment that happened (see ClientLifecycleEvent.ongoing). */
  ongoing: boolean;
  href: string | null;
};

type HistorySource = Pick<
  ClientDetailRecord,
  "lifecycle" | "placements" | "pulseScans" | "studies" | "platforms" | "designs" | "documentLinks" | "touchpoints"
>;

const TOUCHPOINT_LABEL: Record<string, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
  MESSAGE: "Message",
};

function valid(at: string | null | undefined): at is string {
  return Boolean(at) && !Number.isNaN(Date.parse(at as string));
}

/**
 * Where an event sorts: ongoing states and things still waiting are "now" and lead the list;
 * everything else is newest first.
 */
function rank(e: HistoryEvent): number {
  return e.ongoing || e.status === "waiting" ? Number.POSITIVE_INFINITY : Date.parse(e.at);
}

/** Every dated thing on the client record, newest first. */
export function buildClientHistory(r: HistorySource): HistoryEvent[] {
  const out: HistoryEvent[] = [];

  for (const e of r.lifecycle) {
    if (!valid(e.at)) continue;
    out.push({
      id: `lifecycle:${e.id}`,
      kind: "milestone",
      label: e.label,
      detail: e.detail,
      at: e.at,
      status: e.status,
      ongoing: Boolean(e.ongoing),
      href: null,
    });
  }

  for (const p of r.placements) {
    const who = p.candidateName;
    if (valid(p.startDate)) {
      out.push({
        id: `placement:${p.id}:start`,
        kind: "people",
        label: `${who} joined`,
        detail: [p.projectName, p.allocationPercent < 100 ? `${p.allocationPercent}% of their time` : null].filter(Boolean).join(" · ") || "Placed on this client.",
        at: p.startDate,
        status: "done",
        ongoing: false,
        href: `/app/staff/${p.candidateId}`,
      });
    }
    if (valid(p.endDate)) {
      out.push({
        id: `placement:${p.id}:end`,
        kind: "people",
        label: `${who} moved off`,
        detail: p.projectName || "Placement ended.",
        at: p.endDate,
        status: "done",
        ongoing: false,
        href: `/app/staff/${p.candidateId}`,
      });
    }
  }

  for (const s of r.pulseScans) {
    if (!valid(s.createdAt)) continue;
    out.push({
      id: `pulse:${s.id}`,
      kind: "work",
      label: s.healthScore !== null ? `Pulse scan · ${s.healthScore}` : "Pulse scan",
      detail: s.projectName,
      at: s.createdAt,
      status: "done",
      ongoing: false,
      href: `/app/pulse/${s.id}`,
    });
  }

  for (const s of r.studies) {
    if (!valid(s.createdAt)) continue;
    out.push({
      id: `study:${s.id}`,
      kind: "work",
      label: "Research study",
      detail: s.title,
      at: s.createdAt,
      status: "done",
      ongoing: false,
      href: `/app/study/${s.id}`,
    });
  }

  for (const [list, noun] of [
    [r.platforms, "Platform added"],
    [r.designs, "Design added"],
    [r.documentLinks, "Link added"],
  ] as const) {
    for (const item of list) {
      if (!valid(item.createdAt)) continue;
      out.push({
        id: `${noun}:${item.id}`,
        kind: "work",
        label: noun,
        detail: item.name,
        at: item.createdAt,
        status: "done",
        ongoing: false,
        href: null,
      });
    }
  }

  for (const t of r.touchpoints) {
    if (!valid(t.occurredAt)) continue;
    const label = TOUCHPOINT_LABEL[t.type] ?? "Activity";
    out.push({
      id: `touchpoint:${t.id}`,
      kind: "people",
      label: t.counterpartName ? `${label} with ${t.counterpartName}` : label,
      detail: t.note?.trim() || (t.authorName ? `Logged by ${t.authorName}` : "Logged in the CRM."),
      at: t.occurredAt,
      status: "done",
      ongoing: false,
      href: null,
    });
  }

  return out.sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));
}

/**
 * The milestones for the compact timeline, oldest first, ongoing states last. Only the newest
 * `max` are kept, with how many earlier ones were left out.
 */
export function timelineMilestones(
  lifecycle: ClientLifecycleEvent[],
  max = 6,
): { shown: ClientLifecycleEvent[]; earlier: number } {
  const dated = lifecycle.filter((e) => valid(e.at));
  const sorted = [...dated].sort((a, b) => {
    const ra = a.ongoing || a.status === "waiting" ? Number.POSITIVE_INFINITY : Date.parse(a.at);
    const rb = b.ongoing || b.status === "waiting" ? Number.POSITIVE_INFINITY : Date.parse(b.at);
    return ra - rb || a.id.localeCompare(b.id);
  });
  const shown = sorted.slice(-max);
  return { shown, earlier: sorted.length - shown.length };
}
