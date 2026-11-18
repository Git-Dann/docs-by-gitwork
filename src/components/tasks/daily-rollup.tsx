"use client";

import { groupForReport } from "@/lib/standup-report";
import { useState } from "react";
import {
  CheckCircleIcon,
  MegaphoneIcon,
  PaperAirplaneIcon,
  SunIcon,
  MoonIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import type { DailyUpdatePhase } from "@/lib/api";

import {
  useRollupRoster,
  usePublishRollup,
  usePushPmUpdates,
  usePmUpdatesPreview,
} from "@/hooks/use-tasks";

import { TaskAvatar } from "@/components/tasks/task-avatar";
import { Skeleton } from "@/components/ui/motion/skeleton";

export function DailyRollup({
  enabled = true,
  canPublish = true,
  index = 2,
  className,
}: {
  enabled?: boolean;
  /** When false the card renders as monitor-only (no Publish / Publish-anyway
   *  buttons). Super admins watching the roster shouldn't see the publishing
   *  CTAs — that's the DevOps lead's surface (`tasks.publish` permission). */
  canPublish?: boolean;
  /** Sequential dashboard number, supplied by the HQ overview. */
  index?: number;
  /** Extra classes on the card root (e.g. h-full to match a sibling's height). */
  className?: string;
}) {
  const { data, isPending, isFetching, refetch } = useRollupRoster(enabled);
  const publish = usePublishRollup();
  const pushPm = usePushPmUpdates();
  const [result, setResult] = useState<string | null>(null);
  const [pmResult, setPmResult] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Review-before-send: opening the modal fetches the compiled preview for the
  // chosen phase (AM = in-progress, PM = done-today).
  const [reviewing, setReviewing] = useState(false);
  const [phase, setPhase] = useState<DailyUpdatePhase>("PM");
  const preview = usePmUpdatesPreview(reviewing, phase);

  const devs = data?.devs ?? [];
  const total = devs.length;
  const amCount = devs.filter((d) => d.amPushedAt).length;
  const pmCount = devs.filter((d) => d.pmPushedAt).length;
  const allPushed = data?.allPushed ?? false;

  const selectedDev = devs.find((d) => d.user.id === selected) ?? null;

  async function doPublish(override: boolean) {
    setResult(null);
    try {
      const r = await publish.mutateAsync(override);
      setResult(
        r.channel
          ? `Published ${r.taskCount} task${r.taskCount === 1 ? "" : "s"} across ${r.clientCount} client${r.clientCount === 1 ? "" : "s"}.`
          : "Saved, but no roll-up Slack channel is configured.",
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Publish failed");
    }
  }

  async function doPushPm() {
    setPmResult(null);
    try {
      const r = await pushPm.mutateAsync(phase);
      const phaseWord = phase === "AM" ? "morning" : "end-of-day";
      if (!r.configured) {
        setPmResult(
          "No #updates channel set — pick one in Settings → Integrations (Daily PM updates).",
        );
      } else if (r.devCount === 0) {
        setPmResult(
          `No developers have posted a ${phaseWord} update yet today.`,
        );
      } else {
        setPmResult(
          `Pushed ${r.devCount} ${phaseWord} update${r.devCount === 1 ? "" : "s"} (${r.taskCount} task${r.taskCount === 1 ? "" : "s"}) to #updates.`,
        );
      }
      setReviewing(false);
    } catch (e) {
      setPmResult(e instanceof Error ? e.message : "Push failed");
    }
  }

  function openReview(next: DailyUpdatePhase) {
    setPmResult(null);
    setPhase(next);
    setReviewing(true);
  }

  return (
    <section className={cn("widget-card", className)} data-hq-card="rollup">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">
            {String(index).padStart(2, "0")}
          </span>
          {" // DAILY ROLL-UP"}
        </span>
        <div className="flex items-center gap-2">
          {total > 0 ? (
            <span
              className="widget-header__status"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              AM {amCount}/{total} · PM {pmCount}/{total}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh roll-up"
            aria-label="Refresh roll-up"
            className="rounded-[4px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
          >
            <ArrowPathIcon
              className={cn("h-4 w-4", isFetching && "animate-spin")}
            />
          </button>
        </div>
      </div>

      <div className="widget-body space-y-3">
        {isPending ? (
          <Skeleton className="h-32 rounded-[8px]" />
        ) : total === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">
            No developers on the roster yet — run the team seed to populate it.
          </p>
        ) : (
          <>
            {/* The whole team at a glance: one face per developer, with their morning and
                end-of-day standup as two marks under it. Pick a face to see their day.
                Was a paged list of five, so most of the team was always off-screen. */}
            <div>
              <div className="flex items-center gap-3">
                <RollupBar label="AM" n={amCount} total={total} colour="var(--brand-500)" />
                <RollupBar label="PM" n={pmCount} total={total} colour="var(--text-3)" />
              </div>
              <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5" aria-label="Developers">
                {devs.map((d) => {
                  const on = selected === d.user.id;
                  const first = d.user.name.trim().split(/\s+/)[0] ?? d.user.name;
                  return (
                    <li key={d.user.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(on ? null : d.user.id)}
                        aria-pressed={on}
                        title={`${d.user.name}: AM ${d.amPushedAt ? "posted" : "not posted"}, PM ${d.pmPushedAt ? "posted" : "not posted"}`}
                        className={cn(
                          "flex w-full flex-col items-center gap-1 rounded-[8px] border px-1 py-2 transition-colors",
                          on
                            ? "border-[var(--brand-500)] bg-[var(--surface-brand-soft)]"
                            : "border-transparent hover:bg-[var(--surface-1)]",
                        )}
                      >
                        <span className={cn("rounded-full", !d.amPushedAt && !d.pmPushedAt && "opacity-60")}>
                          <TaskAvatar user={d.user} size={30} />
                        </span>
                        <span className="w-full truncate text-center text-[11px] text-[var(--text-2)]">{first}</span>
                        <span className="flex items-center gap-1" aria-hidden>
                          <PushMark on={Boolean(d.amPushedAt)} colour="var(--brand-500)" />
                          <PushMark on={Boolean(d.pmPushedAt)} colour="var(--text-3)" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selectedDev ? (
                <div className="mt-2 flex items-center gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                  <TaskAvatar user={selectedDev.user} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-1)]">{selectedDev.user.name}</p>
                    <p className="text-[11px] text-[var(--text-4)]">
                      {selectedDev.doingCount} doing · {selectedDev.doneCount} done today
                    </p>
                  </div>
                  <PushDot label="AM" at={selectedDev.amPushedAt} />
                  <PushDot label="PM" at={selectedDev.pmPushedAt} />
                </div>
              ) : null}
            </div>

            {/* Publish — primary CTA left, override secondary right. Skipped
                when the viewer is here purely to monitor (super admin). */}
            {canPublish ? (
              <div className="border-t border-[var(--border-2)] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    leadingIcon={<MegaphoneIcon className="h-4 w-4" />}
                    onClick={() => doPublish(false)}
                    disabled={!allPushed || publish.isPending}
                    loading={publish.isPending}
                  >
                    Publish roll-up
                  </Button>
                  {!allPushed ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => doPublish(true)}
                      disabled={publish.isPending}
                    >
                      Publish anyway
                    </Button>
                  ) : null}
                </div>
                {result ? (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-2)]">
                    <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                    {result}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Push to Slack — compiles each dev's update grouped by project then
                developer, to the dedicated #updates channel. AM = in-progress,
                PM = done-today; both use the identical card format. Shown to
                anyone who can see this card (admins monitoring + the DevOps lead),
                unlike the client-grouped "Publish roll-up" above which is the
                lead's tool only. */}
            <div className="border-t border-[var(--border-2)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-2)]">
                    Daily updates
                  </p>
                  <p className="text-[11px] text-[var(--text-4)]">
                    Compile every dev&apos;s update to #updates, by project
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    leadingIcon={<SunIcon className="h-4 w-4" />}
                    onClick={() => openReview("AM")}
                    disabled={pushPm.isPending}
                  >
                    Morning
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    leadingIcon={<MoonIcon className="h-4 w-4" />}
                    onClick={() => openReview("PM")}
                    disabled={pushPm.isPending}
                  >
                    End of day
                  </Button>
                </div>
              </div>
              {pmResult ? (
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-2)]">
                  <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                  {pmResult}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>

      <Modal
        open={reviewing}
        onClose={() => setReviewing(false)}
        title={
          phase === "AM" ? "REVIEW MORNING UPDATE" : "REVIEW END-OF-DAY UPDATE"
        }
        /* The height is the PANEL's, not the content's: this dialog renders anything
           from two lines to forty, and DESIGN.md's fixed-height rule exists so it does
           not resize between them. Bounded by the viewport, never by what is inside. */
        panelClassName="flex h-[80vh] max-h-[680px] min-h-[min(460px,80vh)] w-full max-w-lg flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {preview.isPending ? (
            <div className="min-h-0 flex-1 p-4">
              <Skeleton className="h-full rounded-[8px]" />
            </div>
          ) : preview.isError ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <p className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                Couldn&apos;t load the preview —{" "}
                {preview.error instanceof Error
                  ? preview.error.message
                  : "please try again."}
              </p>
            </div>
          ) : !preview.data?.configured ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No <strong>#updates</strong> channel is set. Pick one in
                Settings → Integrations (&ldquo;Daily PM updates&rdquo;) before
                sending.
              </p>
            </div>
          ) : preview.data.devCount === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <p className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-center text-xs text-[var(--text-3)]">
                No developers have posted a {phase === "AM" ? "morning" : "PM"}{" "}
                update yet today — nothing to send.
              </p>
            </div>
          ) : (
            <>
              <p className="shrink-0 px-4 pt-4 text-[11px] text-[var(--text-4)]">
                This posts to <strong>#updates</strong> —{" "}
                {preview.data.devCount} dev
                {preview.data.devCount === 1 ? "" : "s"},{" "}
                {preview.data.taskCount} task
                {preview.data.taskCount === 1 ? "" : "s"}{" "}
                {phase === "AM" ? "in progress" : "done today or still in progress"}. Grouped by
                project. Review before sending.
              </p>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {preview.data.projects.map((p) => (
                  <div
                    key={p.clientSlug}
                    className="rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-[var(--text-1)]">
                      {p.clientName}
                    </p>
                    <div className="mt-1.5 space-y-2">
                      {p.devs.map((d) => (
                        <div key={d.name}>
                          <p className="text-[12px] font-medium text-[var(--text-2)]">
                            @{d.name}
                          </p>
                          {d.tasks.length > 0 ? (
                            // Same grouping and nesting as the Slack card (standup-report.ts),
                            // so what is reviewed here is what gets posted.
                            <div className="mt-0.5 space-y-1">
                              {groupForReport(d.tasks, phase).map((g) => (
                                <div key={g.key}>
                                  <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]">
                                    {g.label}
                                  </p>
                                  <ul className="space-y-0.5">
                                    {g.rows.map((r) => (
                                      <li
                                        key={`${g.key}-${r.kind}-${r.taskId}`}
                                        className={
                                          r.kind === "subtask"
                                            ? "pl-4 text-[12px] text-[var(--text-3)]"
                                            : "text-[12px] text-[var(--text-2)]"
                                        }
                                      >
                                        {r.kind === "subtask" ? "↳" : "•"} {r.title}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[12px] italic text-[var(--text-4)]">
                              No tasks.
                            </p>
                          )}
                          {d.note?.trim() ? (
                            <p className="mt-1 border-l-2 border-[var(--border-2)] pl-2 text-[12px] text-[var(--text-3)]">
                              {d.note.trim()}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {preview.data.otherDevs.length > 0 ? (
                  <div className="rounded-[8px] border border-dashed border-[var(--border-2)] bg-white px-3 py-2">
                    <p className="text-sm font-semibold text-[var(--text-1)]">
                      Other updates
                    </p>
                    <div className="mt-1.5 space-y-1.5">
                      {preview.data.otherDevs.map((d) => (
                        <div key={d.name}>
                          <p className="text-[12px] font-medium text-[var(--text-2)]">
                            @{d.name}
                          </p>
                          {d.note?.trim() ? (
                            <p className="mt-0.5 border-l-2 border-[var(--border-2)] pl-2 text-[12px] text-[var(--text-3)]">
                              {d.note.trim()}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[12px] italic text-[var(--text-4)]">
                              {phase === "AM"
                                ? "No tasks in progress."
                                : "No tasks done today."}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-2)] px-4 py-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReviewing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
              onClick={doPushPm}
              disabled={
                pushPm.isPending ||
                preview.isPending ||
                !preview.data?.configured ||
                (preview.data?.devCount ?? 0) === 0
              }
              loading={pushPm.isPending}
            >
              Send to #updates
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function PushDot({ label, at }: { label: string; at: string | null }) {
  const time = at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <span
      title={`${label} ${at ? `posted at ${time}` : "not posted yet"}`}
      className={cn("inline-flex items-center gap-1 text-[10px] font-medium", at ? "text-[var(--success-500)]" : "text-[var(--text-4)]")}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", at ? "bg-[var(--success-500)]" : "bg-[var(--border-1)]")} />
      {label}
      {time ? ` ${time}` : ""}
    </span>
  );
}

/** One standup under a face: filled when posted, an outline when not. */
function PushMark({ on, colour }: { on: boolean; colour: string }) {
  return (
    <span
      className="h-1.5 w-3 rounded-[2px] border"
      style={{ background: on ? colour : "transparent", borderColor: on ? colour : "var(--border-1)" }}
    />
  );
}

/** "AM 14/19" with a proportional bar. */
function RollupBar({ label, n, total, colour }: { label: string; n: number; total: number; colour: string }) {
  const pct = total > 0 ? (n / total) * 100 : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between text-[10px] text-[var(--text-3)]" style={{ fontFamily: "var(--font-mono)" }}>
        <span>{label}</span>
        <span className="tabular-nums">
          {n}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-[2px] bg-[var(--surface-2)]">
        <div className="h-full transition-[width] duration-700" style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  );
}
