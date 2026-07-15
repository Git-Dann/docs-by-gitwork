"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  MegaphoneIcon,
  PaperAirplaneIcon,
  SunIcon,
  MoonIcon,
  ChevronUpIcon,
  ChevronDownIcon,
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

const PAGE_SIZE = 5;

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
  const [page, setPage] = useState(0);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = devs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

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
        setPmResult("No #updates channel set — pick one in Settings → Integrations (Daily PM updates).");
      } else if (r.devCount === 0) {
        setPmResult(`No developers have posted a ${phaseWord} update yet today.`);
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
    <section className={cn("widget-card", className)}>
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{String(index).padStart(2, "0")}</span>
          {" // DAILY ROLL-UP"}
        </span>
        <div className="flex items-center gap-2">
          {total > 0 ? (
            <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
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
            <ArrowPathIcon className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="widget-body space-y-3">
        {isPending ? (
          <div className="h-32 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : total === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">
            No developers on the roster yet — run the team seed to populate it.
          </p>
        ) : (
          <>
            {/* Paginated roster — 5 per page */}
            <div className="space-y-1.5">
              {pageRows.map((d) => (
                <div
                  key={d.user.id}
                  className="flex items-center gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
                >
                  <TaskAvatar user={d.user} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-1)]">{d.user.name}</p>
                    <p className="text-[11px] text-[var(--text-4)]">
                      {d.doingCount} doing · {d.doneCount} done today
                    </p>
                  </div>
                  <PushDot label="AM" on={Boolean(d.amPushedAt)} />
                  <PushDot label="PM" on={Boolean(d.pmPushedAt)} />
                </div>
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between pt-0.5">
                <span className="widget-timestamp">
                  {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => p - 1)}
                    title="Previous"
                    className="rounded-[4px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] disabled:opacity-30"
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    title="Next"
                    className="rounded-[4px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] disabled:opacity-30"
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

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
                  <p className="text-xs font-medium text-[var(--text-2)]">Daily updates</p>
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
        title={phase === "AM" ? "REVIEW MORNING UPDATE" : "REVIEW END-OF-DAY UPDATE"}
        panelClassName="w-full max-w-lg"
      >
        <div className="widget-body space-y-3">
          {preview.isPending ? (
            <div className="h-40 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
          ) : preview.isError ? (
            <p className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Couldn&apos;t load the preview — {preview.error instanceof Error ? preview.error.message : "please try again."}
            </p>
          ) : !preview.data?.configured ? (
            <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No <strong>#updates</strong> channel is set. Pick one in Settings → Integrations
              (&ldquo;Daily PM updates&rdquo;) before sending.
            </p>
          ) : preview.data.devCount === 0 ? (
            <p className="rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-xs text-[var(--text-3)]">
              No developers have posted a {phase === "AM" ? "morning" : "PM"} update yet today — nothing to send.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-[var(--text-4)]">
                This posts to <strong>#updates</strong> — {preview.data.devCount} dev
                {preview.data.devCount === 1 ? "" : "s"}, {preview.data.taskCount} task
                {preview.data.taskCount === 1 ? "" : "s"} {phase === "AM" ? "in progress" : "done today"}.
                Grouped by project. Review before sending.
              </p>
              <div className="max-h-[46vh] space-y-3 overflow-y-auto">
                {preview.data.projects.map((p) => (
                  <div
                    key={p.clientSlug}
                    className="rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-[var(--text-1)]">{p.clientName}</p>
                    <div className="mt-1.5 space-y-2">
                      {p.devs.map((d) => (
                        <div key={d.name}>
                          <p className="text-[12px] font-medium text-[var(--text-2)]">@{d.name}</p>
                          {d.tasks.length > 0 ? (
                            <ul className="mt-0.5 space-y-0.5">
                              {d.tasks.map((t) => (
                                <li key={t.taskId} className="text-[12px] text-[var(--text-2)]">
                                  • {t.title}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-0.5 text-[12px] italic text-[var(--text-4)]">No tasks.</p>
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
                    <p className="text-sm font-semibold text-[var(--text-1)]">Other updates</p>
                    <div className="mt-1.5 space-y-1.5">
                      {preview.data.otherDevs.map((d) => (
                        <div key={d.name}>
                          <p className="text-[12px] font-medium text-[var(--text-2)]">@{d.name}</p>
                          {d.note?.trim() ? (
                            <p className="mt-0.5 border-l-2 border-[var(--border-2)] pl-2 text-[12px] text-[var(--text-3)]">
                              {d.note.trim()}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[12px] italic text-[var(--text-4)]">
                              {phase === "AM" ? "No tasks in progress." : "No tasks done today."}
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

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-2)] pt-3">
            <Button type="button" variant="secondary" onClick={() => setReviewing(false)}>
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

function PushDot({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      title={`${label} ${on ? "pushed" : "pending"}`}
      className="inline-flex items-center gap-1 text-[10px] font-medium"
      style={{ fontFamily: "var(--font-mono)", color: on ? "#16A34A" : "#94A3B8" }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: on ? "#16A34A" : "#CBD5E1" }} />
      {label}
    </span>
  );
}
