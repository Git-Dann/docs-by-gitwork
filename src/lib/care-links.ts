/**
 * Where things live in Care, and where the retired /app/support links now go.
 *
 * Care used to be two UIs: the rebuilt cockpit at /app/care and the legacy dashboard at
 * /app/support, which alone owned add-client, tickets, monthly reports, workflow rules and the AI
 * agents. They are one Care now. Every old /app/support URL (notifications, emails, Slack, report
 * links, the iOS app) is a redirect into the matching place here — pure, so it is tested.
 */

/** The sections of one client's Care. `conversations` is the queue (index + record). */
export const CARE_SECTIONS = ["conversations", "reports", "automation", "settings"] as const;
export type CareSection = (typeof CARE_SECTIONS)[number];

export const CARE_SECTION_LABEL: Record<CareSection, string> = {
  conversations: "Conversations",
  reports: "Reports",
  automation: "Automation",
  settings: "Channels & settings",
};

export function isCareSection(value: string | null | undefined): value is CareSection {
  return !!value && (CARE_SECTIONS as readonly string[]).includes(value);
}

/**
 * The sections an ingest-only client has.
 *
 * Their mail is harvested, never answered, so there is no queue, no monthly report and
 * no workflow rule to look at — only the connector that keeps the mail flowing. Offering the other
 * four would be offering four empty screens and inviting someone to triage a queue that is not
 * theirs to triage.
 */
export const INGEST_ONLY_SECTIONS = ["settings"] as const satisfies readonly CareSection[];

export function careSectionsFor(client: { ingestOnly?: boolean | null; courseRequestOnly?: boolean | null }): readonly CareSection[] {
  return client.ingestOnly || client.courseRequestOnly ? INGEST_ONLY_SECTIONS : CARE_SECTIONS;
}

/** A link into Care: a client and (optionally) one of its sections. */
export function careHref(opts: { clientId?: string | null; section?: CareSection | null } = {}): string {
  const qs = new URLSearchParams();
  if (opts.clientId) qs.set("client", opts.clientId);
  if (opts.clientId && opts.section && opts.section !== "conversations") qs.set("section", opts.section);
  const s = qs.toString();
  return s ? `/app/care?${s}` : "/app/care";
}

export function careReportHref(reportId: string): string {
  return `/app/care/reports/${encodeURIComponent(reportId)}`;
}

/**
 * The legacy dashboard's deep links were `?client=<id>&tab=inbox|tickets|reports` and
 * `?panel=connectors|settings` (the panel wins over the tab — that is how the old page behaved).
 * Its "settings" panel held the AI agents, workflow rules and the Portal link; the rules and
 * agents are Care's Automation section now, so `panel=settings` goes there.
 *
 * ⚠️ `tab=tickets` is deliberately NOT listed: the Tickets tab was retired in Nov 2026 (the
 * cockpit never wrote a ticket, and the Kanban was a view of rows nothing created). It falls
 * through to null like any unknown tab, so an old Slack link lands on Conversations rather than
 * a section that no longer exists.
 */
export function legacySupportSection(params: { tab?: string | null; panel?: string | null }): CareSection | null {
  if (params.panel === "connectors") return "settings";
  if (params.panel === "settings") return "automation";
  if (params.tab === "reports") return "reports";
  if (params.tab === "inbox") return "conversations";
  return null;
}

/**
 * The redirect target for `/app/support?…`. Known keys are translated; any other query parameter
 * is carried across untouched, so nothing a link encoded is silently dropped.
 */
export function legacySupportRedirect(search: Record<string, string | string[] | undefined>): string {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const out = new URLSearchParams();
  const client = first(search.client);
  if (client) out.set("client", client);
  const section = legacySupportSection({ tab: first(search.tab), panel: first(search.panel) });
  if (client && section && section !== "conversations") out.set("section", section);
  for (const [key, value] of Object.entries(search)) {
    if (key === "client" || key === "tab" || key === "panel" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) out.append(key, v);
  }
  const s = out.toString();
  return s ? `/app/care?${s}` : "/app/care";
}

/** `/app/support/reports/<id>?…` → `/app/care/reports/<id>?…`, query preserved. */
export function legacyReportRedirect(reportId: string, search: Record<string, string | string[] | undefined>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) out.append(key, v);
  }
  const s = out.toString();
  return careReportHref(reportId) + (s ? `?${s}` : "");
}
