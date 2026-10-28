"use client";

/**
 * The Drive tab of a client's Resources page: the files in their linked Google Drive folder.
 *
 * The team always sees it (read with their own Google sign-in). The CLIENT sees it once someone
 * switches "Show to the client" on — their copy is then read with that teammate's Google sign-in,
 * so the team view says whose it is, and offers to take it over when that sign-in stops working
 * (someone left, or signed out of Google).
 */

import { useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ClientDriveFiles } from "@/components/clients/client-drive-files";
import { useSetWikiDriveEnabled } from "@/hooks/use-wiki";
import type { DriveTarget } from "@/lib/api";
import type { WikiDriveSection } from "@/lib/client-drive";

/** Whether this viewer gets a Drive tab on Resources at all. */
export function hasDriveTab(drive: WikiDriveSection, audience: "team" | "client"): boolean {
  return audience === "team" ? drive.linked : drive.enabled && drive.linked;
}

export function WikiDriveTab({ drive, target }: { drive: WikiDriveSection; target: DriveTarget }) {
  return (
    <div className="flex flex-col gap-3">
      {target.mode === "internal" ? <ClientShareSwitch drive={drive} slug={target.slug} /> : null}
      <div className="overflow-hidden rounded-[10px] border border-[var(--border-1)]" data-wiki-drive>
        <ClientDriveFiles target={target} pageSize={12} />
      </div>
    </div>
  );
}

function ClientShareSwitch({ drive, slug }: { drive: WikiDriveSection; slug: string }) {
  const set = useSetWikiDriveEnabled(slug);
  const [error, setError] = useState<string | null>(null);
  const run = (enabled: boolean) => {
    setError(null);
    set.mutate(enabled, { onError: (e) => setError(e instanceof Error ? e.message : "Couldn't change that.") });
  };
  const reader = drive.reader;
  const broken = drive.enabled && (!reader || !reader.ready);

  let text: string;
  if (!drive.enabled) text = "Only Gitwork can see these files. Show them to the client on their wiki?";
  else if (broken)
    text = `The client can't see these files right now: ${
      reader ? `${reader.name}'s Google sign-in no longer works for Foundry` : "nobody's Google account is reading the folder"
    }. Read it as yourself to fix it.`;
  else text = `The client sees these files, read with ${reader!.name}'s Google account. Below is what your own account can see.`;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[8px] border px-4 py-3 text-[13px] ${
        broken
          ? "border-[var(--warning-500)] bg-[var(--warning-50)] text-[var(--text-1)]"
          : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-2)]"
      }`}
      data-drive-share
    >
      {broken ? <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-[var(--warning-500)]" /> : null}
      {/* A floor on the sentence, so on a phone the buttons wrap below it instead of
          squeezing it into a one-word column. */}
      <span className="min-w-[min(100%,240px)] flex-1">
        {text}
        {error ? <span className="mt-1 block text-[var(--danger-500)]">{error}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {drive.enabled ? (
          <>
            <button
              type="button"
              disabled={set.isPending}
              onClick={() => run(true)}
              className="app-button app-button-secondary app-button-xs"
              title="Read the folder for the client with your Google account instead"
            >
              Read as me
            </button>
            <button
              type="button"
              disabled={set.isPending}
              onClick={() => run(false)}
              className="app-button app-button-secondary app-button-xs"
            >
              Hide from client
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={set.isPending}
            onClick={() => run(true)}
            className="app-button app-button-primary app-button-xs"
            title="The client's copy is read with your Google account"
          >
            {set.isPending ? "Checking…" : "Show to client"}
          </button>
        )}
      </span>
    </div>
  );
}
