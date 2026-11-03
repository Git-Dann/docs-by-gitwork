/**
 * The facts the wiki dashboard's footer closes on — pure, so they can be tested
 * without rendering, and so the footer cannot invent a figure the DTO lacks.
 *
 * ⚠️ Every fact is OMITTED when there is nothing behind it, never zeroed. "0
 * resources" on a brand-new client reads as something missing; no line at all
 * reads as nothing yet.
 */
import type { WikiDTO } from "@/lib/api";

/**
 * When anything on this wiki last moved — a page edit, a request, a document or
 * a pushed standup. Null when the wiki has never had any of them.
 *
 * Only timestamps the DTO already carries; a wiki whose only activity is in a
 * section this does not read reports an older date, never a newer one.
 */
export function latestWikiActivity(
  wiki: Pick<WikiDTO, "pages" | "intakeItems" | "documents" | "standups">,
): string | null {
  const stamps: string[] = [];
  for (const p of wiki.pages ?? []) stamps.push(p.updatedAt);
  for (const i of wiki.intakeItems ?? []) stamps.push(i.updatedAt);
  for (const d of wiki.documents?.documents ?? []) stamps.push(d.addedAt);
  const days = [wiki.standups?.today, ...(wiki.standups?.history ?? [])];
  for (const day of days) {
    for (const dev of day?.devs ?? []) {
      if (dev.pmPushedAt) stamps.push(dev.pmPushedAt);
      if (dev.amPushedAt) stamps.push(dev.amPushedAt);
    }
  }
  let best: number | null = null;
  for (const s of stamps) {
    const t = Date.parse(s);
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

export interface FooterFact {
  label: string;
  value: string;
  /** A status colour, only for the systems readout. */
  tone?: "up" | "degraded" | "down";
}

/** The footer's readout row, in reading order. */
export function footerFacts(input: {
  lastActivity: string | null;
  lastActivityLabel: string | null;
  resources: number;
  activeMonitors: number;
  worstMonitor: string | null;
}): FooterFact[] {
  const facts: FooterFact[] = [];
  if (input.lastActivity && input.lastActivityLabel) {
    facts.push({ label: "Last updated", value: input.lastActivityLabel });
  }
  if (input.resources > 0) {
    facts.push({
      label: input.resources === 1 ? "Resource" : "Resources",
      value: String(input.resources),
    });
  }
  if (input.activeMonitors > 0) {
    const status: Record<string, FooterFact> = {
      UP: { label: "Systems", value: "All up", tone: "up" },
      DEGRADED: { label: "Systems", value: "Degraded", tone: "degraded" },
      DOWN: { label: "Systems", value: "Down", tone: "down" },
    };
    // UNKNOWN (no check has run yet) is not a status worth stating.
    const s = status[input.worstMonitor ?? ""];
    if (s) facts.push(s);
  }
  return facts;
}
