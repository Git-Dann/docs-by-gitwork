"use client";

import { CloudArrowUpIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useArchiveClientToDrive, useClientDriveArchiveStatus } from "@/hooks/use-proposals";

/**
 * Compact "Archive to Drive" control for the client detail actions row. Reads the client's Drive
 * archive status and lets an operator (re-)trigger the export. The export itself runs as a durable
 * background job (BackgroundJob queue) — this only enqueues it, so the click returns instantly.
 * Auto-triggered on archive/delete; this is the manual / re-run path.
 */
export function ClientDriveArchiveButton({ slug }: { slug: string }) {
  const status = useClientDriveArchiveStatus(slug);
  const archive = useArchiveClientToDrive(slug);

  const archivedAt = status.data?.archivedToDriveAt;
  const folderUrl = status.data?.folderUrl;
  const label = archive.isPending
    ? "Queuing…"
    : archive.isSuccess
      ? "Queued ✓"
      : archivedAt
        ? "Re-archive to Drive"
        : "Archive to Drive";

  return (
    <div className="flex items-center gap-1">
      {folderUrl && (
        <a
          href={folderUrl}
          target="_blank"
          rel="noreferrer"
          title={archivedAt ? `Archived to Drive ${new Date(archivedAt).toLocaleDateString()}` : "Open Drive archive"}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brand-700)] opacity-70 transition hover:opacity-100"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <CheckCircleIcon className="h-3.5 w-3.5" />
          In Drive ↗
        </a>
      )}
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={() => archive.mutate()}
        disabled={archive.isPending}
        title="Export all of this client's data to Google Drive"
      >
        <CloudArrowUpIcon className="h-3 w-3" />
        {label}
      </Button>
    </div>
  );
}
