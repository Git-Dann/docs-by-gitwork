"use client";

import { useState } from "react";
import { CheckCircleIcon, MegaphoneIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useRollupRoster, usePublishRollup } from "@/hooks/use-tasks";
import { TaskAvatar } from "@/components/tasks/task-avatar";

export function DailyRollup({ enabled = true }: { enabled?: boolean }) {
  const { data, isPending } = useRollupRoster(enabled);
  const publish = usePublishRollup();
  const [result, setResult] = useState<string | null>(null);

  const devs = data?.devs ?? [];
  const total = devs.length;
  const amCount = devs.filter((d) => d.amPushedAt).length;
  const pmCount = devs.filter((d) => d.pmPushedAt).length;
  const pendingNames = devs.filter((d) => !d.pmPushedAt).map((d) => d.user.name);
  const allPushed = data?.allPushed ?? false;

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
          <span className="widget-header__label--number">02</span>
          {" // DAILY ROLL-UP"}
        </span>
        {total > 0 ? (
          <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
            AM {amCount}/{total} · PM {pmCount}/{total}
          </span>
        ) : null}
      </div>

      <div className="widget-body space-y-4">
        {isPending ? (
          <div className="h-32 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : total === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">
            No developers on the roster yet — run the team seed to populate it.
          </p>
        ) : (
          <>
            {/* Progress + gaps */}
            <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-2)]">End-of-day updates in</span>
                <span
                  className="text-xs font-semibold"
                  style={{ fontFamily: "var(--font-mono)", color: allPushed ? "#16A34A" : "var(--text-3)" }}
                >
                  {pmCount}/{total}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-2)]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${total ? (pmCount / total) * 100 : 0}%` }}
                />
              </div>
              {pendingNames.length > 0 ? (
                <p className="mt-2 text-[11px] text-[var(--text-4)]">
                  <span className="font-medium text-[var(--text-3)]">Pending:</span> {pendingNames.join(", ")}
                </p>
              ) : (
                <p className="mt-2 text-[11px] font-medium text-emerald-600">Everyone&rsquo;s in — ready to publish.</p>
              )}
            </div>

            {/* Per-dev roster */}
            <ul className="space-y-1.5">
              {devs.map((d) => (
                <li
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
                </li>
              ))}
            </ul>

            {/* Publish — enabled at all-in; override always available beneath. */}
            <div className="space-y-2 border-t border-[var(--border-2)] pt-4">
              <Button
                type="button"
                variant="primary"
                leadingIcon={<MegaphoneIcon className="h-4 w-4" />}
                onClick={() => doPublish(false)}
                disabled={!allPushed || publish.isPending}
                loading={publish.isPending}
              >
                {allPushed ? "Publish roll-up" : `Waiting on ${pendingNames.length}…`}
              </Button>
              {!allPushed ? (
                <button
                  type="button"
                  onClick={() => doPublish(true)}
                  disabled={publish.isPending}
                  className="block text-[11px] font-medium text-[var(--text-4)] underline-offset-2 transition hover:text-[var(--text-2)] hover:underline disabled:opacity-50"
                >
                  Publish anyway (override — e.g. someone&rsquo;s off)
                </button>
              ) : null}
              {result ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-2)]">
                  <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                  {result}
                </span>
              ) : null}
            </div>
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
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: on ? "#16A34A" : "#CBD5E1" }}
      />
      {label}
    </span>
  );
}
