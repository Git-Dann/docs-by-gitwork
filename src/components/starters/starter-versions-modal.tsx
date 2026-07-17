"use client";

import { useEffect, useState } from "react";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { useRestoreStarterVersion, useStarterVersion, useStarterVersions } from "@/hooks/use-starters";
import { useToast } from "@/components/ui/toast";

// Version history as a fixed-height, two-column popup (the DESIGN.md "list + inspector" pattern):
// versions on the left, the selected snapshot on the right. Super-Admin only. Auto-snapshot on save
// captures history; Restore snapshots the current state first, so it's reversible.
export function StarterVersionsModal({ open, onClose, starterId }: { open: boolean; onClose: () => void; starterId: string }) {
  const { data: versions, isLoading } = useStarterVersions(starterId, open);
  const restore = useRestoreStarterVersion(starterId);
  const { success, error } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    if (versions && versions.length > 0) {
      setSelectedId((cur) => (cur && versions.some((v) => v.id === cur) ? cur : versions[0].id));
    }
  }, [open, versions]);

  const onRestore = async (versionId: string, version: number) => {
    if (!confirm(`Restore version v${version}? The current state is snapshotted first, so this is reversible.`)) return;
    try {
      await restore.mutateAsync(versionId);
      success(`Restored to v${version}`);
      onClose();
    } catch {
      error("Couldn't restore that version");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Version history" panelClassName="w-full max-w-3xl">
      {isLoading ? (
        <div className="h-[460px] animate-pulse bg-[var(--surface-1)]" />
      ) : !versions || versions.length === 0 ? (
        <div className="flex h-[460px] items-center justify-center px-6 text-center text-[13px] text-[var(--text-3)]">
          No history yet — every save is snapshotted so you can roll back.
        </div>
      ) : (
        <div className="grid h-[460px] grid-cols-[minmax(0,300px)_minmax(0,1fr)] divide-x divide-[var(--border-2)]">
          {/* Left — version list */}
          <ul className="overflow-y-auto p-2">
            {versions.map((v) => {
              const active = v.id === selectedId;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={
                      "w-full rounded-[8px] px-2.5 py-2 text-left transition " +
                      (active ? "bg-[var(--surface-brand)]" : "hover:bg-[var(--surface-1)]")
                    }
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="widget-data-label-bright">v{v.version}</span>
                      <span className="truncate text-[13px] text-[var(--text-2)]">{v.changelog ?? "Saved edit"}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--text-4)]">{new Date(v.createdAt).toLocaleString()}</div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Right — selected snapshot */}
          <div className="overflow-y-auto p-4">
            {selectedId ? (
              <VersionDetail starterId={starterId} versionId={selectedId} restoring={restore.isPending} onRestore={onRestore} />
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function VersionDetail({
  starterId,
  versionId,
  restoring,
  onRestore,
}: {
  starterId: string;
  versionId: string;
  restoring: boolean;
  onRestore: (versionId: string, version: number) => void;
}) {
  const { data, isLoading } = useStarterVersion(starterId, versionId);
  if (isLoading) return <div className="h-40 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />;
  if (!data) return null;
  const snap = data.snapshot;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-3)]">
          <span>
            <span className="widget-data-label">Version</span> v{data.version}
          </span>
          <span>
            <span className="widget-data-label">Type</span> {snap.type}
          </span>
          <span>
            <span className="widget-data-label">Status</span> {snap.status}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          onClick={() => onRestore(versionId, data.version)}
          disabled={restoring}
        >
          <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
          Restore
        </button>
      </div>

      <div>
        <p className="widget-data-label mb-1">Name</p>
        <p className="text-[13px] text-[var(--text-2)]">{snap.name}</p>
      </div>

      {snap.content?.promptText ? (
        <div>
          <p className="widget-data-label mb-1">Prompt text</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2 font-mono text-[12px] text-[var(--text-2)]">
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
