"use client";

import { useState } from "react";
import { ArrowUturnLeftIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useRestoreStarterVersion, useStarterVersion, useStarterVersions } from "@/hooks/use-starters";
import { useToast } from "@/components/ui/toast";

// Version history for a starter (Super-Admin). Every content-changing save auto-snapshots the prior
// state; each row can be viewed and restored (restore snapshots the current state first).
export function StarterVersionsPanel({ starterId }: { starterId: string }) {
  const { data: versions, isLoading } = useStarterVersions(starterId);
  const restore = useRestoreStarterVersion(starterId);
  const { success, error } = useToast();
  const [viewingId, setViewingId] = useState<string | null>(null);

  const onRestore = async (versionId: string, version: number) => {
    if (!confirm(`Restore version v${version}? The current state is snapshotted first, so this is reversible.`)) return;
    try {
      await restore.mutateAsync(versionId);
      success(`Restored to v${version}`);
    } catch {
      error("Couldn't restore that version");
    }
  };

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">03</span>
          {" // VERSION HISTORY"}
        </span>
        <span className="widget-header-right widget-data-label">{versions?.length ?? 0} SAVED</span>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : !versions || versions.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-[var(--text-3)]">
            <ClockIcon className="h-4 w-4 text-[var(--text-4)]" />
            No history yet — every save from here on is snapshotted so you can roll back.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-3)]">
            {versions.map((v) => (
              <li key={v.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="widget-data-label-bright w-10 shrink-0">v{v.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[var(--text-2)]">{v.changelog ?? "Saved edit"}</p>
                    <p className="font-mono text-[11px] text-[var(--text-4)]">{new Date(v.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    onClick={() => setViewingId(viewingId === v.id ? null : v.id)}
                  >
                    {viewingId === v.id ? "Hide" : "View"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                    onClick={() => onRestore(v.id, v.version)}
                    disabled={restore.isPending}
                  >
                    <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                    Restore
                  </button>
                </div>
                {viewingId === v.id && <VersionSnapshot starterId={starterId} versionId={v.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function VersionSnapshot({ starterId, versionId }: { starterId: string; versionId: string }) {
  const { data, isLoading } = useStarterVersion(starterId, versionId);
  if (isLoading) return <div className="mt-2 h-16 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />;
  if (!data) return null;
  const snap = data.snapshot;
  return (
    <div className="mt-2 space-y-2 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-3)]">
        <span>
          <span className="widget-data-label">Name</span> {snap.name}
        </span>
        <span>
          <span className="widget-data-label">Type</span> {snap.type}
        </span>
        <span>
          <span className="widget-data-label">Status</span> {snap.status}
        </span>
      </div>
      {snap.content?.promptText ? (
        <div>
          <p className="widget-data-label mb-1">Prompt text</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[6px] bg-[var(--surface-0)] p-2 font-mono text-[12px] text-[var(--text-2)]">
            {snap.content.promptText}
          </pre>
        </div>
      ) : null}
      {snap.description ? (
        <div>
          <p className="widget-data-label mb-1">Description</p>
          <p className="whitespace-pre-wrap text-[12px] text-[var(--text-3)]">{snap.description}</p>
        </div>
      ) : null}
    </div>
  );
}
