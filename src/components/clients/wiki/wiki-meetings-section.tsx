"use client";

/**
 * Meetings — what was agreed in each call, for the client.
 *
 * Only meetings someone chose to share are in `meetings.meetings` (the server never loads
 * the others into the DTO). For Gitwork the section adds a picker listing every meeting
 * Scribe has notes for, each with a share switch, and says plainly that nothing is shared
 * until it is switched on.
 */

import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { MONO, SERIF } from "@/components/analytics/analytics-widgets";
import { Markdown } from "@/lib/markdown";
import type { WikiMeeting, WikiMeetingsSection } from "@/server/wiki-meetings";
import { useSetWikiMeetingShared, useWikiShareableMeetings } from "@/hooks/use-wiki";

export function meetingDate(iso: string | null): string {
  if (!iso) return "Date not recorded";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Open actions across the shared meetings — the number the dashboard card leads with. */
export function openActionCount(meetings: WikiMeeting[]): number {
  return meetings.reduce((n, m) => n + m.actions.filter((a) => !a.done).length, 0);
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]"
      style={{ fontFamily: MONO }}
    >
      {children}
    </p>
  );
}

function MeetingCard({ meeting, n }: { meeting: WikiMeeting; n: number }) {
  const open = meeting.actions.filter((a) => !a.done).length;
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{String(n).padStart(2, "0")}</span>
          {` // ${meetingDate(meeting.startedAt).toUpperCase()}`}
        </span>
        {meeting.actions.length > 0 ? (
          <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
            {open === 0 ? "ALL ACTIONS DONE" : `${open} OPEN`}
          </span>
        ) : null}
      </div>
      <div className="space-y-4 p-5">
        <h3
          className="break-words text-[20px] leading-snug text-[var(--text-1)]"
          style={{ fontFamily: SERIF, fontWeight: 600 }}
        >
          {meeting.title}
        </h3>
        {meeting.summary ? (
          <Markdown compact className="space-y-3">
            {meeting.summary}
          </Markdown>
        ) : null}
        {(meeting.decisions.length > 0 || meeting.actions.length > 0) && (
          <div className="grid gap-5 md:grid-cols-2">
            {meeting.decisions.length > 0 ? (
              <div className="min-w-0">
                <Label>Decisions</Label>
                <ul className="space-y-1.5">
                  {meeting.decisions.map((d, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-[var(--text-2)]">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-600)]" />
                      <span className="min-w-0 break-words">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {meeting.actions.length > 0 ? (
              <div className="min-w-0">
                <Label>Actions</Label>
                <ul className="space-y-1.5">
                  {meeting.actions.map((a) => (
                    <li key={a.id} className="flex gap-2 text-[13px]">
                      {a.done ? (
                        <CheckCircleIcon className="mt-px h-4 w-4 shrink-0 text-[var(--success-500)]" aria-label="Done" />
                      ) : (
                        <span aria-label="Open" className="mt-[3px] h-3 w-3 shrink-0 rounded-full border-2 border-[var(--border-2)]" />
                      )}
                      <span className="min-w-0">
                        <span className={`break-words ${a.done ? "text-[var(--text-4)] line-through" : "text-[var(--text-2)]"}`}>
                          {a.title}
                        </span>
                        {a.owner ? (
                          <span className="ml-1.5 text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                            {a.owner}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export function WikiMeetingsSectionView({
  meetings,
  slug,
  editable = false,
}: {
  meetings: WikiMeetingsSection;
  slug?: string;
  editable?: boolean;
}) {
  return (
    <div className="space-y-4">
      {editable && slug ? <SharePicker slug={slug} /> : null}
      {meetings.meetings.length === 0 ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // MEETINGS"}
            </span>
          </div>
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {editable
              ? "No meetings are shared yet. Switch one on above to show it here."
              : "Notes from our calls will appear here."}
          </p>
        </section>
      ) : (
        meetings.meetings.map((m, i) => <MeetingCard key={m.id} meeting={m} n={i + 1} />)
      )}
    </div>
  );
}

/** Gitwork only: every meeting with notes, each with a share switch. */
function SharePicker({ slug }: { slug: string }) {
  const list = useWikiShareableMeetings(slug, true);
  const share = useSetWikiMeetingShared(slug);
  const rows = list.data?.meetings ?? [];

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          {"SHARE WITH CLIENT"}
        </span>
        <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
          GITWORK ONLY
        </span>
      </div>
      <div className="p-5">
        <p className="mb-3 text-[13px] text-[var(--text-3)]">
          Nothing is shared until you switch it on. A shared meeting shows its title, date,
          summary, decisions and actions — never the transcript or who attended.
        </p>
        {list.isLoading ? (
          <p className="text-[13px] text-[var(--text-4)]">Loading meetings…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-[var(--text-4)]">
            No meetings with notes for this client yet. Scribe adds them from Portal.
          </p>
        ) : (
          <ul className="max-h-[320px] divide-y divide-[var(--border-1)] overflow-y-auto rounded-[8px] border border-[var(--border-1)]">
            {rows.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[var(--text-1)]" title={m.title}>
                    {m.title}
                  </p>
                  <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                    {meetingDate(m.startedAt)}
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-[var(--text-3)]">
                  <input
                    type="checkbox"
                    checked={m.shared}
                    disabled={share.isPending}
                    onChange={(e) => share.mutate({ meetingId: m.id, shared: e.target.checked })}
                    className="h-4 w-4 accent-[var(--brand-600)]"
                  />
                  {m.shared ? "Shared" : "Share"}
                </label>
              </li>
            ))}
          </ul>
        )}
        {share.isError ? (
          <p className="mt-2 text-[13px] text-[var(--danger-500)]">Could not update. Try again.</p>
        ) : null}
      </div>
    </section>
  );
}
