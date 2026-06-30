"use client";

import { useEffect, useMemo, useState } from "react";
import { PaperAirplaneIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useMyDay, usePushProjectUpdate, useSlackPushPrefs } from "@/hooks/use-tasks";
import {
  DEFAULT_PUSH_PREFS,
  NO_CATEGORY_ID,
  PROJECT_UPDATE_GROUP_LABELS,
  PROJECT_UPDATE_STATUS_GROUPS,
  type FeatureBlockDTO,
  type ProjectUpdateStatusGroup,
  type TaskCardDetail,
  type TaskDTO,
} from "@/types/tasks";

function timeOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function inStatusGroup(t: TaskDTO, g: ProjectUpdateStatusGroup): boolean {
  if (g === "DOING") return t.status === "DOING" || t.status === "IN_REVIEW";
  if (g === "DONE") return t.status === "DONE";
  return t.status === "TODO" || t.status === "BACKLOG";
}

function catKey(t: TaskDTO): string {
  return t.featureBlock?.id ?? NO_CATEGORY_ID;
}

// Mirrors MAX_TASKS_PER_CARD in src/server/slack/blocks.ts — Slack caps each
// group at 8 rows and folds the rest into a "+N more" line. The preview shows
// the same so it matches what actually posts.
const PREVIEW_CAP = 8;

export function ProjectUpdateComposer({
  clientId,
  clientName,
  blocks,
  tasks,
  onClose,
}: {
  clientId: string;
  clientName: string;
  blocks: FeatureBlockDTO[];
  tasks: TaskDTO[];
  onClose: () => void;
}) {
  const { data: prefs } = useSlackPushPrefs();
  const { data: myDay } = useMyDay();
  const push = usePushProjectUpdate();

  // All category keys for this client (blocks + the "no category" bucket).
  const allCatKeys = useMemo(
    () => [...blocks.map((b) => b.id), NO_CATEGORY_ID],
    [blocks],
  );

  const [detail, setDetail] = useState<TaskCardDetail>(DEFAULT_PUSH_PREFS.detail);
  const [statusGroups, setStatusGroups] = useState<Set<ProjectUpdateStatusGroup>>(
    new Set(DEFAULT_PUSH_PREFS.statusGroups),
  );
  const [includedCats, setIncludedCats] = useState<Set<string>>(new Set(allCatKeys));
  const [note, setNote] = useState("");
  const [amChecked, setAmChecked] = useState(false);
  const [pmChecked, setPmChecked] = useState(false);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [toRollup, setToRollup] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed from the dev's saved defaults once they load. Excluded categories →
  // include everything else, so newly-created blocks are included by default.
  useEffect(() => {
    if (!prefs) return;
    setDetail(prefs.detail);
    setStatusGroups(new Set(prefs.statusGroups));
    setIncludedCats(new Set(allCatKeys.filter((k) => !prefs.excludedCategoryIds.includes(k))));
    setNote(prefs.defaultNote ?? "");
  }, [prefs, allCatKeys]);

  // Reflect today's standup state on the AM/PM checkboxes.
  const amSentAt = timeOf(myDay?.update.amPushedAt ?? null);
  const pmSentAt = timeOf(myDay?.update.pmPushedAt ?? null);
  useEffect(() => {
    if (!myDay) return;
    setAmChecked(Boolean(myDay.update.amPushedAt));
    setPmChecked(Boolean(myDay.update.pmPushedAt));
  }, [myDay]);

  // Live preview — partition + filter exactly as the server will.
  const preview = useMemo(() => {
    const kept = tasks.filter((t) => includedCats.has(catKey(t)));
    return PROJECT_UPDATE_STATUS_GROUPS.filter((g) => statusGroups.has(g))
      .map((g) => ({ group: g, tasks: kept.filter((t) => inStatusGroup(t, g)) }))
      .filter((g) => g.tasks.length > 0);
  }, [tasks, includedCats, statusGroups]);
  const previewCount = preview.reduce((n, g) => n + g.tasks.length, 0);

  function toggleStatus(g: ProjectUpdateStatusGroup) {
    setStatusGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }
  function toggleCat(key: string) {
    setIncludedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const nothingToSay = previewCount === 0 && !note.trim();

  async function handlePush() {
    setError(null);
    const markPhases: ("AM" | "PM")[] = [];
    if (amChecked) markPhases.push("AM");
    if (pmChecked) markPhases.push("PM");
    try {
      await push.mutateAsync({
        clientId,
        categoryIds: [...includedCats],
        statusGroups: [...statusGroups],
        detail,
        note: note.trim() || undefined,
        markPhases: markPhases.length ? markPhases : undefined,
        toRollup,
        saveAsDefaults: saveDefaults,
      });
      setPushed(true);
      setTimeout(onClose, 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed");
    }
  }

  return (
    <Modal open onClose={onClose} panelClassName="flex max-h-[85vh] w-full max-w-3xl flex-col">
      <div className="shrink-0 border-b border-[var(--border-2)] px-6 py-4">
        <p className="widget-data-label">PUSH TO SLACK</p>
        <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">
          Project update — {clientName}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-4)]">
          Posts the current board to this client&apos;s internal Slack channel.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden sm:grid-cols-2">
        {/* ── Controls ── */}
        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          {/* Standup tie-in */}
          <div>
            <p className="widget-data-label mb-2 text-[var(--text-3)]">COUNTS AS MY STANDUP</p>
            <div className="flex flex-wrap gap-2">
              <PhaseChip
                label="Morning (AM)"
                sentAt={amSentAt}
                checked={amChecked}
                onChange={setAmChecked}
              />
              <PhaseChip
                label="End of day (PM)"
                sentAt={pmSentAt}
                checked={pmChecked}
                onChange={setPmChecked}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
              Leave both off for an ad-hoc push. Tick one to also turn your standup dot green.
            </p>
          </div>

          {/* Detail */}
          <div>
            <p className="widget-data-label mb-2 text-[var(--text-3)]">DETAIL</p>
            <div className="flex flex-col gap-1.5">
              <RadioRow
                label="Titles only"
                checked={detail === "TITLES"}
                onSelect={() => setDetail("TITLES")}
              />
              <RadioRow
                label="Titles + descriptions"
                checked={detail === "TITLES_AND_DESCRIPTIONS"}
                onSelect={() => setDetail("TITLES_AND_DESCRIPTIONS")}
              />
            </div>
          </div>

          {/* Status groups */}
          <div>
            <p className="widget-data-label mb-2 text-[var(--text-3)]">INCLUDE</p>
            <div className="flex flex-col gap-1.5">
              {PROJECT_UPDATE_STATUS_GROUPS.map((g) => (
                <CheckRow
                  key={g}
                  label={PROJECT_UPDATE_GROUP_LABELS[g]}
                  checked={statusGroups.has(g)}
                  onChange={() => toggleStatus(g)}
                />
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="widget-data-label mb-2 text-[var(--text-3)]">CATEGORIES</p>
            <div className="flex flex-col gap-1.5">
              {blocks.map((b) => (
                <CheckRow
                  key={b.id}
                  label={b.name}
                  checked={includedCats.has(b.id)}
                  onChange={() => toggleCat(b.id)}
                />
              ))}
              <CheckRow
                label="No category"
                checked={includedCats.has(NO_CATEGORY_ID)}
                onChange={() => toggleCat(NO_CATEGORY_ID)}
                muted
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="widget-data-label mb-2 text-[var(--text-3)]">
              NOTE <span className="font-normal lowercase text-[var(--text-4)]">(optional)</span>
            </p>
            <textarea
              className="app-textarea w-full"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to flag for the client?"
            />
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="min-h-0 overflow-y-auto border-t border-[var(--border-2)] bg-[var(--surface-1)] px-6 py-5 sm:border-l sm:border-t-0">
          <div className="flex items-center justify-between">
            <p className="widget-data-label text-[var(--text-3)]">PREVIEW</p>
            <span className="widget-timestamp">
              {previewCount} task{previewCount === 1 ? "" : "s"}
            </span>
          </div>
          {preview.length === 0 ? (
            <p className="mt-4 text-xs text-[var(--text-4)]">
              {note.trim() ? "A note-only update will be posted." : "Nothing selected to post yet."}
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {preview.map(({ group, tasks: groupTasks }) => {
                const visible = groupTasks.slice(0, PREVIEW_CAP);
                const more = groupTasks.length - visible.length;
                return (
                  <div key={group}>
                    <p className="mb-1.5 text-xs font-semibold text-[var(--text-1)]">
                      {PROJECT_UPDATE_GROUP_LABELS[group]}{" "}
                      <span className="text-[var(--text-4)]">· {groupTasks.length}</span>
                    </p>
                    <div className="space-y-1.5">
                      {visible.map((t) => (
                        <div
                          key={t.id}
                          className="rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
                        >
                          <p className="truncate text-sm text-[var(--text-1)]">{t.title}</p>
                          {detail === "TITLES_AND_DESCRIPTIONS" && t.description?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-4)]">
                              {t.description}
                            </p>
                          ) : null}
                        </div>
                      ))}
                      {more > 0 ? (
                        <p className="px-1 pt-0.5 text-[11px] text-[var(--text-4)]">
                          +{more} more in Foundry
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-2)] px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <CheckRow
            label="Save as my defaults"
            checked={saveDefaults}
            onChange={() => setSaveDefaults((v) => !v)}
          />
          <CheckRow
            label="Also post to team roll-up"
            title="Sends a copy to the central DevOps roll-up channel, on top of this client's channel."
            checked={toRollup}
            onChange={() => setToRollup((v) => !v)}
          />
        </div>
        <div className="flex items-center gap-3">
          {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
          {pushed ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircleIcon className="h-4 w-4" /> Pushed to Slack
            </span>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={push.isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
                onClick={handlePush}
                loading={push.isPending}
                disabled={nothingToSay}
              >
                Push to Slack
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** An AM/PM tie-in chip. When the phase is already sent today it renders muted
 *  ("looks disabled") with a sent time, but stays toggleable. */
function PhaseChip({
  label,
  sentAt,
  checked,
  onChange,
}: {
  label: string;
  sentAt: string | null;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-xs font-medium transition",
        checked
          ? "border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--text-1)]"
          : "border-[var(--border-2)] bg-white text-[var(--text-2)] hover:bg-[var(--surface-1)]",
        sentAt ? "opacity-70" : "",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]"
      />
      {label}
      {sentAt ? (
        <span className="text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
          ✓ {sentAt}
        </span>
      ) : null}
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
  muted,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  muted?: boolean;
  title?: string;
}) {
  return (
    <label
      title={title}
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-2)]"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]"
      />
      <span className={cn("truncate", muted ? "text-[var(--text-4)]" : "")}>{label}</span>
    </label>
  );
}

function RadioRow({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-2)]">
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="h-3.5 w-3.5 cursor-pointer accent-[var(--brand-700)]"
      />
      {label}
    </label>
  );
}
