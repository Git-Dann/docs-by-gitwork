"use client";

import {
  ArrowPathIcon,
  CodeBracketIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCodeClearCandidate,
  useCreatePlacement,
  useDeletePlacement,
  useRunPlacementValidation,
  useUpdatePlacement,
} from "@/hooks/use-codeclear";
import { useClientDetail, useClientList } from "@/hooks/use-proposals";
import { cn, formatDate } from "@/lib/format";
import type { CodeClearPlacementRecord } from "@/types/codeclear";

/**
 * Dev-scoped schedule editor. Lists every placement (active + upcoming +
 * closed) with inline edit for client, project, dates, allocation %, notes.
 * Add new row + delete. Used by:
 *   - Pipeline (opens in a modal scoped to one dev)
 *   - The dev profile page (Engagements / schedule section)
 *
 * Edits go through the standard Placement endpoints; React Query
 * invalidation in the hooks fans the update out to every surface
 * (registry, Pipeline, profile, Portal client page).
 *
 * Optional `lockClientId` pins the editor to a single client — used by
 * the Portal client view so admins can't accidentally reassign a dev
 * to a different client from inside the client's own page.
 */
export function ScheduleEditor({
  candidateId,
  lockClientId,
  showCandidateColumn = false,
}: {
  candidateId: string;
  /** When set, the client picker is hidden and any new row is created against this clientId. */
  lockClientId?: string;
  /** True when shown inside a Portal client view — surfaces the dev name in the header. */
  showCandidateColumn?: boolean;
}) {
  const candidateQuery = useCodeClearCandidate(candidateId);
  const clientsQuery = useClientList();
  const createMutation = useCreatePlacement(candidateId);
  const updateMutation = useUpdatePlacement(candidateId);
  const deleteMutation = useDeletePlacement(candidateId);
  const runValidationMutation = useRunPlacementValidation(candidateId);

  const candidate = candidateQuery.data?.candidate ?? null;
  const clients = clientsQuery.data?.clients ?? [];
  const placements = candidate?.placements ?? [];
  // The candidate's GitHub handle is required for any scoped scan — the
  // scoped-scan endpoint also enforces this, but we use it here to disable
  // the Run button up-front and surface a helpful hint.
  const candidateHandle = candidate?.githubHandle ?? null;

  const [newRowOpen, setNewRowOpen] = useState(false);

  return (
    <div className="space-y-3">
      {showCandidateColumn && candidate ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">{candidate.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--text-4)]">
              @{candidate.githubHandle}
            </p>
          </div>
        </div>
      ) : null}

      {candidateQuery.isLoading ? (
        <div className="space-y-2">
          <div className="h-12 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
          <div className="h-12 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        </div>
      ) : placements.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-6 text-center text-sm text-[var(--text-4)]">
          No scheduled blocks yet. Add one below.
        </div>
      ) : (
        <ul className="space-y-2">
          {placements.map((placement) => (
            <PlacementRow
              key={placement.id}
              placement={placement}
              clients={clients}
              lockClientId={lockClientId}
              candidateHandle={candidateHandle}
              isMutating={updateMutation.isPending || deleteMutation.isPending}
              isRunningValidation={
                runValidationMutation.isPending &&
                runValidationMutation.variables === placement.id
              }
              onSave={(input) =>
                updateMutation.mutateAsync({ placementId: placement.id, input })
              }
              onDelete={() => {
                if (window.confirm("Remove this scheduled block?")) {
                  deleteMutation.mutate(placement.id);
                }
              }}
              onRunValidation={() => runValidationMutation.mutate(placement.id)}
            />
          ))}
        </ul>
      )}

      {newRowOpen ? (
        <NewPlacementRow
          clients={clients}
          lockClientId={lockClientId}
          isSaving={createMutation.isPending}
          onCancel={() => setNewRowOpen(false)}
          onSave={async (input) => {
            await createMutation.mutateAsync({
              clientId: input.clientId,
              clientName: input.clientName,
              projectName: input.projectName,
              startDate: input.startDate,
              endDate: input.endDate,
              allocationPercent: input.allocationPercent,
              notes: input.notes,
            });
            setNewRowOpen(false);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
          onClick={() => setNewRowOpen(true)}
        >
          Add scheduled block
        </Button>
      )}
    </div>
  );
}

// ─── Row components ───────────────────────────────────────────────────────────

type EditFormValue = {
  clientId: string | null;
  clientName: string;
  projectName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // "" or YYYY-MM-DD
  allocationPercent: string; // string for controlled inputs
  notes: string;
  // Per-engagement repo scope — drives the scoped GitHub validation scan.
  clientPlatformId: string | null;
  repoPaths: string[];
  repoBranch: string;
};

function toEditValue(placement: CodeClearPlacementRecord): EditFormValue {
  return {
    clientId: placement.clientId,
    clientName: placement.clientName,
    projectName: placement.projectName,
    startDate: placement.startDate.slice(0, 10),
    endDate: placement.endDate ? placement.endDate.slice(0, 10) : "",
    allocationPercent: String(placement.allocationPercent),
    notes: placement.notes ?? "",
    clientPlatformId: placement.clientPlatformId,
    repoPaths: placement.repoPaths,
    repoBranch: placement.repoBranch ?? "",
  };
}

function PlacementRow({
  placement,
  clients,
  lockClientId,
  candidateHandle,
  isMutating,
  isRunningValidation,
  onSave,
  onDelete,
  onRunValidation,
}: {
  placement: CodeClearPlacementRecord;
  clients: Array<{ id: string; name: string; slug?: string }>;
  lockClientId?: string;
  candidateHandle: string | null;
  isMutating: boolean;
  isRunningValidation: boolean;
  onSave: (input: {
    clientId?: string | null;
    clientName?: string;
    projectName?: string;
    startDate?: string;
    endDate?: string | null;
    allocationPercent?: number;
    notes?: string | null;
    clientPlatformId?: string | null;
    repoPaths?: string[];
    repoBranch?: string | null;
  }) => Promise<unknown>;
  onDelete: () => void;
  onRunValidation: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<EditFormValue>(() => toEditValue(placement));

  // Look up the slug for the placement's current client so we can fetch its
  // platforms. We use the EDITED value when the form is open so changing the
  // client also refreshes the platform list. Falls back to the placement's
  // saved clientId for the read view + initial edit state.
  const activeClientId = editing ? value.clientId : placement.clientId;
  const activeClient = clients.find((c) => c.id === activeClientId) ?? null;
  // useClientDetail() is keyed on slug — only fires when we actually have one,
  // and React Query dedupes the same slug across multiple rows on the page.
  const clientDetailQuery = useClientDetail(activeClient?.slug ?? "");
  const platforms = clientDetailQuery.data?.platforms ?? [];

  function startEdit() {
    setValue(toEditValue(placement));
    setEditing(true);
  }

  async function commit() {
    const next: Parameters<typeof onSave>[0] = {
      projectName: value.projectName,
      startDate: value.startDate,
      endDate: value.endDate || null,
      allocationPercent: Number(value.allocationPercent) || 100,
      notes: value.notes || null,
      // Repo scope — always sent so clearing the platform / paths writes through.
      clientPlatformId: value.clientPlatformId,
      repoPaths: value.repoPaths,
      repoBranch: value.repoBranch.trim() === "" ? null : value.repoBranch.trim(),
    };
    if (!lockClientId) {
      next.clientId = value.clientId;
      const matched = clients.find((c) => c.id === value.clientId);
      if (matched) next.clientName = matched.name;
    }
    await onSave(next);
    setEditing(false);
  }

  // Status derived from dates, not from whether endDate is set:
  //   - past:    endDate set AND endDate < now
  //   - upcoming: startDate > now
  //   - active:  otherwise (started, not yet ended)
  const nowMs = Date.now();
  const startMs = new Date(placement.startDate).getTime();
  const endMs = placement.endDate ? new Date(placement.endDate).getTime() : null;
  const isPast = endMs !== null && endMs < nowMs;
  const isUpcoming = !isPast && startMs > nowMs;
  const isOpenEnded = !placement.endDate;

  if (!editing) {
    // Scope summary props for the footer block. Three states: no platform
    // linked → empty hint, platform linked but no repo URL → "add a repo URL
    // to this platform in Portal", platform with repo URL → show targets +
    // last-scan + Run button.
    const hasPlatform = Boolean(placement.clientPlatformId);
    const hasRepoUrl = Boolean(placement.clientPlatformRepoUrl);
    const scopedSummary = formatScopedScanSummary(placement);

    return (
      <li className="rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              isPast
                ? "bg-[var(--text-4)]"
                : isUpcoming
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
            aria-hidden
            title={isPast ? "Past" : isUpcoming ? "Upcoming" : "Active"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="text-sm font-semibold text-[var(--text-1)]">{placement.clientName}</p>
              <span className="text-xs text-[var(--text-4)]">·</span>
              <p className="truncate text-xs text-[var(--text-3)]">{placement.projectName}</p>
              <span className="ml-auto inline-flex items-center rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]">
                {placement.allocationPercent}%
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-[var(--text-4)]">
              {formatDate(placement.startDate)}
              {isOpenEnded ? " → present" : ` → ${formatDate(placement.endDate!)}`}
            </p>
            {placement.notes ? (
              <p className="mt-1 text-xs italic text-[var(--text-4)]">{placement.notes}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="secondary" size="xs" onClick={startEdit}>
              Edit
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="xs"
              leadingIcon={<TrashIcon className="h-3 w-3" />}
              onClick={onDelete}
              disabled={isMutating}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* ── Repo scope footer — per-engagement scoped validation. */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[8px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
          <CodeBracketIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
              Repo scope
            </p>
            {hasPlatform && hasRepoUrl ? (
              <div className="mt-0.5 space-y-0.5">
                <p className="truncate text-xs text-[var(--text-2)]">
                  {placement.clientPlatformName}
                  {placement.repoPaths.length > 0 ? (
                    <>
                      <span className="text-[var(--text-4)]"> · </span>
                      <span className="font-mono text-[11px] text-[var(--text-3)]">
                        {placement.repoPaths.join(", ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--text-4)]"> · whole repo</span>
                  )}
                  {placement.repoBranch ? (
                    <span className="font-mono text-[11px] text-[var(--text-4)]">
                      {" "}@{placement.repoBranch}
                    </span>
                  ) : null}
                </p>
                <p className="font-mono text-[10px] text-[var(--text-4)]">{scopedSummary}</p>
              </div>
            ) : hasPlatform && !hasRepoUrl ? (
              <p className="mt-0.5 text-[11px] text-amber-700">
                Linked to {placement.clientPlatformName}, but it has no repo URL.
                Add one in Portal → this client → Platforms.
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                Edit this block to link a platform and tag the paths this dev owns.
              </p>
            )}
          </div>
          {hasPlatform && hasRepoUrl ? (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              leadingIcon={
                isRunningValidation ? (
                  <ArrowPathIcon className="h-3 w-3 animate-spin" />
                ) : (
                  <SparklesIcon className="h-3 w-3" />
                )
              }
              onClick={onRunValidation}
              disabled={isRunningValidation || !candidateHandle}
              title={
                !candidateHandle
                  ? "This developer has no GitHub handle on file."
                  : undefined
              }
            >
              {isRunningValidation ? "Scanning…" : "Run scoped validation"}
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-4 py-3">
      <PlacementEditFields
        value={value}
        onChange={setValue}
        clients={clients}
        lockClientId={lockClientId}
        platforms={platforms}
        platformsLoading={clientDetailQuery.isLoading}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={commit}
          disabled={isMutating || !value.startDate || !value.projectName.trim()}
        >
          Save
        </Button>
      </div>
    </li>
  );
}

/**
 * Build a compact "Last scanned …" or "Never scanned" suffix used in the
 * read-view repo-scope summary block.
 */
function formatScopedScanSummary(placement: CodeClearPlacementRecord): string {
  if (!placement.lastScopedScanAt) return "Never scanned for this engagement.";
  const dt = new Date(placement.lastScopedScanAt);
  const diffMs = Date.now() - dt.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "Last scanned today.";
  if (days === 1) return "Last scanned yesterday.";
  if (days < 30) return `Last scanned ${days}d ago.`;
  return `Last scanned ${formatDate(placement.lastScopedScanAt)}.`;
}

function NewPlacementRow({
  clients,
  lockClientId,
  isSaving,
  onSave,
  onCancel,
}: {
  clients: Array<{ id: string; name: string }>;
  lockClientId?: string;
  isSaving: boolean;
  onSave: (input: {
    clientId: string | undefined;
    clientName: string;
    projectName: string;
    startDate: string;
    endDate: string | null;
    allocationPercent: number;
    notes: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [value, setValue] = useState<EditFormValue>({
    clientId: lockClientId ?? null,
    clientName: lockClientId
      ? (clients.find((c) => c.id === lockClientId)?.name ?? "")
      : "",
    projectName: "Active engagement",
    startDate: today,
    endDate: "",
    allocationPercent: "100",
    notes: "",
    // Repo scope can't be set until a Placement exists (the platform picker
    // depends on the chosen client's platforms). Defaults are noop fields
    // the new-row form doesn't render — admin sets these via Edit after save.
    clientPlatformId: null,
    repoPaths: [],
    repoBranch: "",
  });

  async function commit() {
    const matched = clients.find((c) => c.id === value.clientId);
    const clientName = lockClientId
      ? (clients.find((c) => c.id === lockClientId)?.name ?? value.clientName)
      : (matched?.name ?? value.clientName);
    if (!clientName.trim() || !value.projectName.trim() || !value.startDate) return;
    await onSave({
      clientId: value.clientId ?? undefined,
      clientName,
      projectName: value.projectName,
      startDate: value.startDate,
      endDate: value.endDate || null,
      allocationPercent: Number(value.allocationPercent) || 100,
      notes: value.notes || null,
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand-soft)] px-4 py-3">
      <PlacementEditFields
        value={value}
        onChange={setValue}
        clients={clients}
        lockClientId={lockClientId}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={commit}
          loading={isSaving}
          disabled={
            isSaving ||
            !value.projectName.trim() ||
            !value.startDate ||
            (!lockClientId && !value.clientId)
          }
          leadingIcon={isSaving ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : null}
        >
          Add block
        </Button>
      </div>
    </div>
  );
}

function PlacementEditFields({
  value,
  onChange,
  clients,
  lockClientId,
  platforms,
  platformsLoading = false,
}: {
  value: EditFormValue;
  onChange: (next: EditFormValue) => void;
  clients: Array<{ id: string; name: string }>;
  lockClientId?: string;
  /** Optional — supplied by the edit view (per existing placement). The
   * new-row form omits it because there's no client picked yet at render
   * time. */
  platforms?: Array<{ id: string; name: string; repoUrl: string | null }>;
  platformsLoading?: boolean;
}) {
  function patch<K extends keyof EditFormValue>(key: K, next: EditFormValue[K]) {
    onChange({ ...value, [key]: next });
  }
  // Free-text → array conversion for the paths field. Persisted as String[]
  // (e.g. ["apps/web", "packages/auth"]). Empty entries are filtered out.
  const pathsAsText = value.repoPaths.join(", ");
  function patchPathsFromText(text: string) {
    const next = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    patch("repoPaths", next);
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {lockClientId ? null : (
        <label className="space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
            Client
          </span>
          <select
            value={value.clientId ?? ""}
            onChange={(event) => patch("clientId", event.target.value || null)}
            className="app-select h-9 w-full text-xs"
          >
            <option value="">Select a client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Project
        </span>
        <input
          value={value.projectName}
          onChange={(event) => patch("projectName", event.target.value)}
          className="app-input h-9 w-full text-xs"
          placeholder="e.g. Sprint 2 platform"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Start
        </span>
        <input
          type="date"
          value={value.startDate}
          onChange={(event) => patch("startDate", event.target.value)}
          className="app-input h-9 w-full text-xs"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          End <span className="text-[var(--text-4)] normal-case">(blank = open)</span>
        </span>
        <input
          type="date"
          value={value.endDate}
          onChange={(event) => patch("endDate", event.target.value)}
          className="app-input h-9 w-full text-xs"
        />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Allocation %
        </span>
        <input
          type="number"
          min={1}
          max={100}
          value={value.allocationPercent}
          onChange={(event) => patch("allocationPercent", event.target.value)}
          className="app-input h-9 w-full text-xs"
        />
      </label>
      <label className="space-y-1 sm:col-span-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
          Notes
        </span>
        <input
          value={value.notes}
          onChange={(event) => patch("notes", event.target.value)}
          className="app-input h-9 w-full text-xs"
          placeholder="Optional"
        />
      </label>

      {/* ── Repo scope inputs (only rendered when the parent supplies a
            platforms list, i.e. for existing placements with a known client). */}
      {platforms !== undefined ? (
        <div className="rounded-[8px] border border-dashed border-[var(--brand-300)] bg-white px-3 py-2.5 sm:col-span-2">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">
            <CodeBracketIcon className="h-3 w-3" aria-hidden />
            Repo scope
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-3)]">
            Pin this engagement to a specific repo + paths so a scoped GitHub
            validation scan only counts work this dev did for this client.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
                Platform
              </span>
              <select
                value={value.clientPlatformId ?? ""}
                onChange={(event) =>
                  patch("clientPlatformId", event.target.value || null)
                }
                className="app-select h-9 w-full text-xs"
                disabled={platformsLoading}
              >
                <option value="">
                  {platformsLoading
                    ? "Loading platforms…"
                    : platforms.length === 0
                      ? "No platforms on this client yet"
                      : "— not linked —"}
                </option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.repoUrl ? "" : " (no repo URL)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
                Branch <span className="text-[var(--text-4)] normal-case">(optional)</span>
              </span>
              <input
                value={value.repoBranch}
                onChange={(event) => patch("repoBranch", event.target.value)}
                className="app-input h-9 w-full text-xs"
                placeholder="default branch"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]">
                Paths <span className="text-[var(--text-4)] normal-case">(comma-separated, blank = whole repo)</span>
              </span>
              <input
                value={pathsAsText}
                onChange={(event) => patchPathsFromText(event.target.value)}
                className="app-input h-9 w-full text-xs"
                placeholder="apps/web, packages/auth"
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
