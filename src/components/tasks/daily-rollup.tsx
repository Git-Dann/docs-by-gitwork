"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  MegaphoneIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useRollupRoster, usePublishRollup } from "@/hooks/use-tasks";
import { TaskAvatar } from "@/components/tasks/task-avatar";

const PAGE_SIZE = 5;

export function DailyRollup({
  enabled = true,
  canPublish = true,
  index = 2,
}: {
  enabled?: boolean;
  /** When false the card renders as monitor-only (no Publish / Publish-anyway
   *  buttons). Super admins watching the roster shouldn't see the publishing
   *  CTAs — that's the DevOps lead's surface (`tasks.publish` permission). */
  canPublish?: boolean;
  /** Sequential dashboard number, supplied by the HQ overview. */
  index?: number;
}) {
  const { data, isPending } = useRollupRoster(enabled);
  const publish = usePublishRollup();
  const [result, setResult] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{String(index).padStart(2, "0")}</span>
          {" // DAILY ROLL-UP"}
        </span>
        {total > 0 ? (
          <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
            AM {amCount}/{total} · PM {pmCount}/{total}
          </span>
        ) : null}
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
          </>
        )}
      </div>
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
