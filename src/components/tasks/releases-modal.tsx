"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon, PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
import { RELEASE_LIMITS, releaseLabel, safeReleaseDocUrl } from "@/lib/tasks/releases";
import { useCreateRelease, useDeleteRelease, useReleaseNumbering, useReleases, useUpdateRelease } from "@/hooks/use-tasks";
import { useClientProjects } from "@/hooks/use-projects";
import type { ReleaseDTO } from "@/types/tasks";

type Draft = { version: string; name: string; startDate: string; endDate: string; docUrl: string; projectId: string; changelogVersion: string };
const EMPTY: Draft = { version: "", name: "", startDate: "", endDate: "", docUrl: "", projectId: "", changelogVersion: "" };

function toDraft(r: ReleaseDTO): Draft {
  return {
    version: r.version,
    name: r.name ?? "",
    startDate: r.startDate?.slice(0, 10) ?? "",
    endDate: r.endDate?.slice(0, 10) ?? "",
    docUrl: r.docUrl ?? "",
    projectId: r.projectId ?? "",
    changelogVersion: r.changelogVersion ?? "",
  };
}

/**
 * A client's releases ("v2.0.0 · Q4 Refinement Session"): add, edit, delete. Each change saves
 * when it's made. Deleting a release keeps its tasks; they just leave the release.
 */
export function ReleasesModal({ clientId, clientSlug, onClose }: { clientId: string; clientSlug?: string | null; onClose: () => void }) {
  const releases = useReleases(clientId);
  // The client's live projects (§150), so a release can be put in one. Hidden when there are none.
  const projectsQuery = useClientProjects(clientSlug ?? null);
  const projects = projectsQuery.data?.projects ?? [];
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const create = useCreateRelease();
  const update = useUpdateRelease();
  const del = useDeleteRelease();
  const numbering = useReleaseNumbering(clientId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = releases.data ?? [];
  const datesBackwards = Boolean(draft.startDate && draft.endDate && draft.endDate < draft.startDate);
  const badDoc = draft.docUrl.trim().length > 0 && safeReleaseDocUrl(draft.docUrl) === null;
  const canSave = draft.version.trim().length > 0 && !datesBackwards && !badDoc;
  const saving = create.isPending || update.isPending;

  function startEdit(r: ReleaseDTO) {
    setEditingId(r.id);
    setDraft(toDraft(r));
    setError(null);
  }

  function reset() {
    setEditingId(null);
    setDraft(EMPTY);
  }

  async function save() {
    if (!canSave) return;
    setError(null);
    const input = {
      version: draft.version.trim(),
      name: draft.name.trim() || null,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
      docUrl: draft.docUrl.trim() || null,
      ...(projects.length ? { projectId: draft.projectId || null } : {}),
    };
    try {
      if (editingId) await update.mutateAsync({ id: editingId, input: { ...input, changelogVersion: draft.changelogVersion.trim() || null } });
      else await create.mutateAsync({ clientId, ...input });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the release.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await del.mutateAsync(id);
      setConfirmingId(null);
      if (editingId === id) reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the release.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Releases" panelClassName="app-dialog-fixed w-full max-w-xl">
      <p className="shrink-0 border-b border-[var(--border-2)] px-5 py-3 text-[13px] text-[var(--text-2)]">
        The version a task ships in. The board, the timeline and the client&apos;s wiki can group tasks by
        release. Without dates, a release&apos;s bar is estimated from its tasks&apos; due dates.
      </p>
      <label className="flex shrink-0 cursor-pointer items-start gap-2.5 border-b border-[var(--border-2)] px-5 py-3 text-[13px] text-[var(--text-2)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={numbering.on}
          disabled={numbering.loading || numbering.set.isPending}
          onChange={(e) => numbering.set.mutate(e.target.checked)}
          data-release-numbering
        />
        <span>
          <span className="font-medium text-[var(--text-1)]">Number releases by the changelog</span>
          <span className="block text-[12px] text-[var(--text-4)]">
            Shows each release&apos;s changelog version (set it when editing a release) instead of its own number,
            here, on the board, the timeline and the client&apos;s wiki.
          </span>
        </span>
      </label>

      <ul className="min-h-0 flex-1 divide-y divide-[var(--border-2)] overflow-y-auto">
        {releases.isLoading ? (
          <li className="px-5 py-8 text-center text-[13px] text-[var(--text-4)]">Loading…</li>
        ) : list.length === 0 ? (
          <li className="px-5 py-8 text-center text-[13px] text-[var(--text-4)]">
            No releases yet. Add the first one below, e.g. v2.0.0.
          </li>
        ) : (
          list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-1)]" title={releaseLabel(r)}>
                  {releaseLabel(r)}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-[var(--text-4)]">
                  {r.doneCount}/{r.taskCount} done
                  {r.startDate && r.endDate
                    ? ` · ${formatDate(r.startDate)} – ${formatDate(r.endDate)}`
                    : " · dates estimated from tasks"}
                  {r.projectId && projectName.has(r.projectId) ? ` · ${projectName.get(r.projectId)}` : ""}
                </p>
                {r.docUrl ? (
                  <a
                    href={r.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-[var(--brand-700)] hover:underline"
                  >
                    Release doc
                    <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </div>
              {confirmingId === r.id ? (
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[12px] text-[var(--text-3)]">Delete? Its tasks stay.</span>
                  <Button size="sm" variant="danger" loading={del.isPending} onClick={() => void remove(r.id)}>
                    Delete
                  </Button>
                  <Button size="sm" variant="tertiary" onClick={() => setConfirmingId(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${r.version}`}
                    onClick={() => startEdit(r)}
                    className="rounded-[6px] p-2 text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${r.version}`}
                    onClick={() => setConfirmingId(r.id)}
                    className="rounded-[6px] p-2 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)]"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </span>
              )}
            </li>
          ))
        )}
      </ul>

      <form
        className="shrink-0 space-y-2 border-t border-[var(--border-2)] px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="widget-data-label text-[var(--text-4)]">{editingId ? "Edit release" : "Add a release"}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <input
            aria-label="Version"
            placeholder="v2.0.0"
            className="app-input text-[16px] sm:text-[13px]"
            value={draft.version}
            maxLength={RELEASE_LIMITS.version}
            onChange={(e) => setDraft({ ...draft, version: e.target.value })}
          />
          <input
            aria-label="Name"
            placeholder="Name, optional (e.g. Q4 Refinement Session)"
            className="app-input text-[16px] sm:text-[13px]"
            value={draft.name}
            maxLength={RELEASE_LIMITS.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-[var(--text-4)]">
            Starts
            <input
              type="date"
              className="app-input mt-1 w-full text-[16px] sm:text-[13px]"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
          </label>
          <label className="text-[11px] text-[var(--text-4)]">
            Ends
            <input
              type="date"
              className="app-input mt-1 w-full text-[16px] sm:text-[13px]"
              value={draft.endDate}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            />
          </label>
        </div>
        <input
          aria-label="Release doc link"
          placeholder="Release doc link, optional (https://…)"
          type="url"
          inputMode="url"
          className="app-input w-full text-[16px] sm:text-[13px]"
          value={draft.docUrl}
          maxLength={RELEASE_LIMITS.docUrl}
          onChange={(e) => setDraft({ ...draft, docUrl: e.target.value })}
        />
        {editingId ? (
          <input
            aria-label="Changelog version"
            placeholder="Changelog version, optional (e.g. 2.0.4)"
            className="app-input w-full text-[16px] sm:text-[13px]"
            value={draft.changelogVersion}
            maxLength={RELEASE_LIMITS.version}
            onChange={(e) => setDraft({ ...draft, changelogVersion: e.target.value })}
          />
        ) : null}
        {projects.length ? (
          <select
            aria-label="Project"
            className="app-select w-full text-[16px] sm:text-[13px]"
            value={draft.projectId}
            onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
        {datesBackwards ? (
          <p className="text-[12px] text-[var(--danger-500)]">The end date is before the start date.</p>
        ) : null}
        {badDoc ? <p className="text-[12px] text-[var(--danger-500)]">Use a link that starts with https://.</p> : null}
        {error ? <p className="text-[12px] text-[var(--danger-500)]">{error}</p> : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          {editingId ? (
            <Button type="button" variant="tertiary" onClick={reset}>
              Cancel edit
            </Button>
          ) : (
            <Button type="button" variant="tertiary" onClick={onClose}>
              Done
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            leadingIcon={editingId ? undefined : <PlusIcon className="h-4 w-4" />}
            disabled={!canSave}
            loading={saving}
          >
            {editingId ? "Save release" : "Add release"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
