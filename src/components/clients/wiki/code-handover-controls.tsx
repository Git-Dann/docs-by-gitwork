"use client";

/**
 * Code Handover's lock, variants and history (CLAUDE.md §153; rules in src/lib/wiki-code-rules.ts):
 *  - `LockButton`: a padlock. A Gitwork person locks with one click; unlocking opens
 *    `UnlockDialog`, which needs "Unlock Code" typed, and the unlock is recorded by name.
 *  - `NewVariantDialog`: copies a Master-line version into a new variant (e.g. one venue).
 *  - `CodeHistoryDialog`: the module's timeline (uploads, edits, Live and Master, locks,
 *    unlocks, variants, deletions), each with who did it and whether they're a client. An edit
 *    can be seen as a diff and put back.
 */
import { useMemo, useState } from "react";
import { ArrowUturnLeftIcon, ArrowsRightLeftIcon, LockClosedIcon, LockOpenIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import { useCodeEvents, useCreateCodeVariant, useRestoreCodeVersion, useSetCodeLock } from "@/hooks/use-wiki";
import type { WikiCodeEventRecord, WikiCodeModuleRecord, WikiCodeVersionRecord } from "@/lib/api";
import { UNLOCK_PHRASE, actorTag, eventSentence, isUnlockPhrase, type CodeSnapshot } from "@/lib/wiki-code-rules";
import { CodeCompareDialog } from "./code-compare";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The padlock. Locked: anyone who can edit may open the unlock dialog. Unlocked: only Gitwork may lock. */
export function LockButton({ slug, module, canLock }: { slug: string; module: WikiCodeModuleRecord; canLock: boolean }) {
  const setLock = useSetCodeLock(slug);
  const toast = useToast();
  const [unlocking, setUnlocking] = useState(false);
  const locked = Boolean(module.lockedAt);
  if (!locked && !canLock) return null;
  return (
    <>
      <button
        type="button"
        aria-pressed={locked}
        aria-label={locked ? `Unlock ${module.name}` : `Lock ${module.name}`}
        title={locked ? `Locked by ${module.lockedByName ?? "someone at Gitwork"}. Click to unlock.` : "Lock the code so nobody can change it"}
        disabled={setLock.isPending}
        onClick={() => {
          if (locked) return setUnlocking(true);
          setLock.mutate(
            { moduleId: module.id, locked: true },
            {
              onSuccess: () => toast.success(`${module.name} is locked`),
              onError: (e) => toast.error("Couldn't lock it", e instanceof Error ? e.message : undefined),
            },
          );
        }}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-[7px] border transition",
          locked
            ? "border-[var(--warning-500)] bg-[var(--warning-50)] text-[var(--warning-500)] hover:brightness-95"
            : "border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-0)] hover:text-[var(--text-1)]",
        )}
      >
        {locked ? <LockClosedIcon className="h-4 w-4" /> : <LockOpenIcon className="h-4 w-4" />}
      </button>
      {unlocking ? <UnlockDialog slug={slug} module={module} onClose={() => setUnlocking(false)} /> : null}
    </>
  );
}

function UnlockDialog({ slug, module, onClose }: { slug: string; module: WikiCodeModuleRecord; onClose: () => void }) {
  const setLock = useSetCodeLock(slug);
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ready = isUnlockPhrase(typed);
  async function unlock() {
    setError(null);
    try {
      await setLock.mutateAsync({ moduleId: module.id, locked: false, confirm: typed });
      toast.success(`${module.name} is unlocked`, "Your name is on the history.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't unlock it.");
    }
  }
  return (
    <Modal open onClose={onClose} title={`UNLOCK ${module.name.toUpperCase()}`} panelClassName="w-full max-w-md">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void unlock();
        }}
      >
        <p className="text-[14px] leading-6 text-[var(--text-2)]">
          {module.lockedByName ? `${module.lockedByName} locked this code` : "This code is locked"}
          {module.lockedAt ? ` on ${fmtWhen(module.lockedAt)}` : ""}. Unlocking lets anyone who can edit it change the
          versions, and your name goes on its history.
        </p>
        <label className="block">
          <span className="app-field-label">
            Type <span className="font-semibold text-[var(--text-1)]">{UNLOCK_PHRASE}</span> to unlock
          </span>
          <input
            className="app-input mt-1 w-full text-base sm:text-[14px]"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={UNLOCK_PHRASE}
            autoComplete="off"
            aria-label={`Type ${UNLOCK_PHRASE}`}
          />
        </label>
        {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
            Keep it locked
          </button>
          <button type="submit" className="app-button app-button-danger app-button-sm" disabled={!ready || setLock.isPending}>
            {setLock.isPending ? "Unlocking…" : "Unlock"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Copy a Master-line version into a new variant (e.g. one venue's code). */
export function NewVariantDialog({
  slug,
  module,
  base,
  onClose,
  onCreated,
}: {
  slug: string;
  module: WikiCodeModuleRecord;
  /** The Master-line version it starts as a copy of. */
  base: WikiCodeVersionRecord;
  onClose: () => void;
  onCreated: (variantId: string) => void;
}) {
  const create = useCreateCodeVariant(slug);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the variant a name, e.g. the venue.");
    try {
      const v = await create.mutateAsync({ moduleId: module.id, name: name.trim(), notes: notes.trim() || null, baseVersionId: base.id });
      onCreated(v.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the variant.");
    }
  }
  return (
    <Modal open onClose={onClose} title={`NEW VARIANT · ${module.name.toUpperCase()}`} panelClassName="w-full max-w-lg">
      <div className="space-y-4 p-5">
        <p className="text-[13px] leading-6 text-[var(--text-3)]">
          A variant starts as a full copy of Master <span className="font-mono text-[var(--text-1)]">{base.label}</span> and gets
          its own versions from then on. It keeps watching Master and says when Master has moved on.
        </p>
        <label className="block">
          <span className="app-field-label">Name</span>
          <input className="app-input mt-1 w-full text-base sm:text-[14px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Ivy" autoFocus />
        </label>
        <label className="block">
          <span className="app-field-label">What&apos;s different (optional)</span>
          <input className="app-input mt-1 w-full text-base sm:text-[14px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Radio on channel 9" />
        </label>
        {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="app-button app-button-primary app-button-sm" disabled={create.isPending} onClick={() => void save()}>
            {create.isPending ? "Making…" : "Make variant"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const asVersion = (id: string, s: CodeSnapshot, label: string, createdAt: string): WikiCodeVersionRecord => ({
  id,
  label,
  notes: s.notes,
  isCurrent: false,
  isMaster: false,
  variantId: null,
  createdAt,
  updatedAt: createdAt,
  createdByName: null,
  createdByClient: false,
  updatedByName: null,
  files: s.files.map((f, i) => ({ id: `${id}-${i}`, filename: f.filename, language: f.language, content: f.content })),
});

/** The module's history, newest first. */
export function CodeHistoryDialog({
  slug,
  modules,
  canRestore,
  onClose,
}: {
  slug: string;
  /** Every module on the wiki: one history covers them all, with a filter. */
  modules: WikiCodeModuleRecord[];
  /** Gitwork and clients may put an edit back, unless its module is locked. */
  canRestore: boolean;
  onClose: () => void;
}) {
  const events = useCodeEvents(slug, true);
  const restore = useRestoreCodeVersion(slug);
  const toast = useToast();
  const [diff, setDiff] = useState<WikiCodeEventRecord | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const versionIds = useMemo(() => new Set(modules.flatMap((m) => m.versions.map((v) => v.id))), [modules]);
  const lockedModules = useMemo(() => new Set(modules.filter((m) => m.lockedAt).map((m) => m.id)), [modules]);
  const shown = (events.data ?? []).filter((e) => moduleFilter === "all" || e.moduleId === moduleFilter);

  const diffVersions = diff && diff.before && diff.after
    ? [asVersion(`${diff.id}-b`, diff.before, `Before (${diff.before.label})`, new Date(Date.parse(diff.createdAt) - 1000).toISOString()), asVersion(`${diff.id}-a`, diff.after, `After (${diff.after.label})`, diff.createdAt)]
    : null;

  // The diff replaces the history while it's open (two dialogs stacked would both close on Escape).
  if (diff && diffVersions) {
    return (
      <CodeCompareDialog
        open
        onClose={() => setDiff(null)}
        moduleName={diff.moduleName}
        versions={diffVersions}
        initialFromId={diffVersions[0].id}
        initialToId={diffVersions[1].id}
      />
    );
  }

  return (
    <Modal open onClose={onClose} title="HISTORY · CODE HANDOVER" panelClassName="app-dialog-fixed w-full max-w-2xl">
      {modules.length > 1 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border-1)] px-5 py-2.5" role="tablist" aria-label="Show history for">
          {[{ id: "all", name: "All modules" }, ...modules].map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={moduleFilter === m.id}
              onClick={() => setModuleFilter(m.id)}
              className={cn(
                "rounded-[6px] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] transition",
                moduleFilter === m.id ? "bg-[var(--surface-brand)] text-[var(--brand-700)]" : "text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {events.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : events.isError ? (
          <p className="text-sm text-[var(--danger-500)]">{events.error instanceof Error ? events.error.message : "Couldn't load the history."}</p>
        ) : !shown.length ? (
          <p className="text-sm text-[var(--text-3)]">Nothing has been recorded yet. Changes from now on appear here.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-[var(--border-2)] pl-5" data-code-history>
            {shown.map((e) => {
              const restorable = canRestore && !lockedModules.has(e.moduleId) && e.kind === "version_edited" && e.before && e.versionId && versionIds.has(e.versionId);
              return (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface-0)]",
                      e.kind === "unlocked" || e.kind.endsWith("_deleted")
                        ? "bg-[var(--danger-500)]"
                        : e.kind === "locked"
                          ? "bg-[var(--warning-500)]"
                          : e.actorIsClient
                            ? "bg-[var(--brand-400)]"
                            : "bg-[var(--brand-600)]",
                    )}
                  />
                  <p className="text-[13px] leading-5 text-[var(--text-2)]">
                    {modules.length > 1 && moduleFilter === "all" ? (
                      <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">{e.moduleName}</span>
                    ) : null}
                    <span className="font-semibold text-[var(--text-1)]">{e.actorName}</span>{" "}
                    <span
                      className={cn(
                        "mr-1 inline-flex rounded-[4px] px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.08em]",
                        e.actorIsClient ? "bg-[var(--warning-50)] text-[var(--warning-500)]" : "bg-[var(--surface-brand)] text-[var(--brand-700)]",
                      )}
                    >
                      {actorTag(e.actorIsClient)}
                    </span>{" "}
                    {eventSentence(e)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                    {fmtWhen(e.createdAt)}
                  </p>
                  {e.kind === "version_edited" || e.kind === "restored" ? (
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      {e.before && e.after ? (
                        <button type="button" onClick={() => setDiff(e)} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--brand-700)] hover:underline">
                          <ArrowsRightLeftIcon className="h-3.5 w-3.5" /> See what changed
                        </button>
                      ) : null}
                      {restorable ? (
                        <button
                          type="button"
                          disabled={restore.isPending}
                          onClick={() => {
                            if (!window.confirm(`Put ${e.before!.label} back to how it was before this change?`)) return;
                            restore.mutate(
                              { versionId: e.versionId!, eventId: e.id },
                              {
                                onSuccess: () => toast.success("Put back", "The earlier copy is restored, and that's on the history too."),
                                onError: (err) => toast.error("Couldn't put it back", err instanceof Error ? err.message : undefined),
                              },
                            );
                          }}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] hover:underline"
                        >
                          <ArrowUturnLeftIcon className="h-3.5 w-3.5" /> Put this back
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Modal>
  );
}
