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
  const [confirmOverride, setConfirmOverride] = useState(false);

  async function doPublish(override: boolean) {
    setResult(null);
    try {
      const r = await publish.mutateAsync(override);
      setResult(
        r.channel
          ? `Published ${r.taskCount} task${r.taskCount === 1 ? "" : "s"} across ${r.clientCount} client${r.clientCount === 1 ? "" : "s"}.`
          : "Saved, but no roll-up Slack channel is configured.",
      );
      setConfirmOverride(false);
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
        {data ? (
          <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
            {data.devs.filter((d) => d.pmPushedAt).length}/{data.devs.length} pushed
          </span>
        ) : null}
      </div>

      <div className="widget-body space-y-4">
        {isPending ? (
          <div className="h-32 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : !data || data.devs.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">
            No active developers with assigned tasks today.
          </p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {data.devs.map((d) => (
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

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-2)] pt-4">
              {data.allPushed || confirmOverride ? (
                <Button
                  type="button"
                  variant="primary"
                  leadingIcon={<MegaphoneIcon className="h-4 w-4" />}
                  onClick={() => doPublish(!data.allPushed)}
                  loading={publish.isPending}
                >
                  {data.allPushed ? "Publish roll-up" : "Publish anyway"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmOverride(true)}
                >
                  Not everyone has pushed — override?
                </Button>
              )}
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
