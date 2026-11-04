/**
 * Demo Commitments for /demo/backstage (?area=commitments). Writes are applied in memory through
 * the real `transition` rule, so ticking, snoozing and accepting behave as they do for real.
 */
import { transition, type CommitmentState } from "@/lib/commitments";
import type { CommitmentDTO, CommitmentSettingsDTO, CommitmentsResponse } from "@/types/commitments";

function iso(daysFromNow: number, hour = 17): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function row(p: Partial<CommitmentDTO> & Pick<CommitmentDTO, "id" | "title">): CommitmentDTO {
  return {
    notes: null,
    dueAt: null,
    state: "open",
    source: "manual",
    counterpart: null,
    quote: null,
    evidenceLabel: null,
    evidenceUrl: null,
    evidenceAt: null,
    reason: null,
    snoozedUntil: null,
    doneAt: null,
    createdAt: iso(-3, 9),
    updatedAt: iso(-1, 9),
    ...p,
  };
}

const seed = (): CommitmentDTO[] => [
  row({
    id: "c1",
    title: "Send Northwind the revised build quote",
    dueAt: iso(-1),
    source: "gmail",
    counterpart: "Sam Lee",
    quote: "I'll send the revised quote over by Monday",
    evidenceLabel: "Re: Phase 2 scope",
    evidenceUrl: "https://mail.google.com/",
  }),
  row({ id: "c2", title: "Review Fairway's App Store screenshots", dueAt: iso(0), counterpart: "Jo Kent" }),
  row({
    id: "c3",
    title: "Follow up with Priya Anand after “Cadenza discovery”",
    dueAt: iso(2),
    source: "calendar",
    counterpart: "Priya Anand",
    evidenceLabel: "Cadenza discovery",
  }),
  row({ id: "c4", title: "Share the handover checklist with the team", dueAt: iso(12) }),
  row({ id: "c5", title: "Write up the Pulse findings for Halcyon" }),
  row({
    id: "s1",
    state: "suggested",
    title: "Check iOS release dates with the team",
    dueAt: iso(1),
    source: "slack",
    counterpart: "Northwind",
    quote: "leave it with me, I'll check with the team and come back tomorrow",
    evidenceLabel: "#Northwind",
    reason: "You said you'd come back tomorrow.",
  }),
  row({
    id: "s2",
    state: "suggested",
    title: "Book a call with their CTO",
    source: "gmail",
    counterpart: "Sam Lee",
    quote: "I'll book a call with your CTO next week so we can go through the API",
    evidenceLabel: "Re: Phase 2 scope",
    evidenceUrl: "https://mail.google.com/",
  }),
  row({
    id: "s3",
    state: "suggested",
    title: "Send the updated Gantt",
    source: "meeting",
    counterpart: "Fairway",
    quote: "Dan to send the updated Gantt after the call",
    evidenceLabel: "Fairway weekly",
  }),
  row({ id: "d1", state: "done", title: "Approve October expenses", doneAt: iso(-1, 11) }),
];

const settings: CommitmentSettingsDTO = {
  gmailEnabled: true,
  slackEnabled: true,
  meetingsEnabled: true,
  calendarEnabled: true,
  lastSyncedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
  syncing: false,
  sourceStatus: {
    gmail: { ok: true, message: "Read 18 sent emails.", at: new Date().toISOString() },
    slack: { ok: false, message: "1 channel couldn't be read (the bot may not be in it).", at: new Date().toISOString() },
    meeting: { ok: true, message: "3 open action items from your meetings.", at: new Date().toISOString() },
    calendar: { ok: true, message: "1 recent external meeting to follow up.", at: new Date().toISOString() },
  },
  slackConnected: true,
};

let store: CommitmentDTO[] | null = null;

export function resolveDemoCommitments(
  pathname: string,
  init?: { method?: string; body?: unknown },
): unknown | undefined {
  if (!pathname.startsWith("/api/backstage/commitments")) return undefined;
  store ??= seed();
  const method = (init?.method ?? "GET").toUpperCase();
  let body: Record<string, unknown> = {};
  try {
    body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    body = {};
  }
  if (pathname === "/api/backstage/commitments/sync") {
    return { result: { status: "ok", added: 0, sources: settings.sourceStatus } };
  }
  if (pathname === "/api/backstage/commitments/settings") {
    if (method === "PUT") Object.assign(settings, body);
    return { settings };
  }
  if (pathname === "/api/backstage/commitments") {
    if (method === "POST") {
      const c = row({
        id: `m${Date.now()}`,
        title: String(body.title ?? ""),
        dueAt: typeof body.dueAt === "string" ? body.dueAt : null,
        createdAt: new Date().toISOString(),
      });
      store.unshift(c);
      return { commitment: c };
    }
    const res: CommitmentsResponse = { commitments: store, settings };
    return res;
  }
  const id = pathname.split("/").pop() ?? "";
  const i = store.findIndex((c) => c.id === id);
  if (i < 0) return { error: "Commitment not found.", __status: 404 };
  if (method === "DELETE") {
    store.splice(i, 1);
    return { deleted: true };
  }
  const current = store[i];
  let next: CommitmentDTO = { ...current, ...(body as Partial<CommitmentDTO>), updatedAt: new Date().toISOString() };
  if (typeof body.state === "string") {
    const t = transition(
      {
        state: current.state,
        doneAt: current.doneAt ? new Date(current.doneAt) : null,
        snoozedUntil: current.snoozedUntil ? new Date(current.snoozedUntil) : null,
      },
      body.state as CommitmentState,
      new Date(),
    );
    if ("error" in t) return { error: t.error, __status: 400 };
    next = {
      ...next,
      state: t.state,
      doneAt: t.doneAt?.toISOString() ?? null,
      snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
    };
  }
  store[i] = next;
  return { commitment: next };
}
