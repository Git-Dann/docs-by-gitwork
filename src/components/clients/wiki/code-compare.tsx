"use client";

/**
 * Compare two versions of a Code Handover module: which files changed and every line that
 * changed in them, with a patch to download. Read-only, so the client's share page offers
 * it too: they see the same code either way.
 *
 * The rules are in `src/lib/code-diff.ts`. This file only draws them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownTrayIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import type { WikiCodeVersionRecord } from "@/lib/api";
import {
  changedSpan,
  compareVersions,
  worthEmphasising,
  pairChangedLines,
  previousVersionOf,
  summariseComparison,
  unifiedPatch,
  type DiffHunk,
  type DiffOp,
  type FileChange,
  type FileChangeStatus,
} from "@/lib/code-diff";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** A file with more changed lines than this starts folded, so a big rewrite can't stall the view. */
export const FOLD_ABOVE_LINES = 400;

const STATUS_LABEL: Record<FileChangeStatus, { short: string; long: string; cls: string }> = {
  modified: { short: "M", long: "Changed", cls: "text-[var(--warning-500)]" },
  added: { short: "A", long: "Added", cls: "text-[var(--success-500)]" },
  removed: { short: "D", long: "Removed", cls: "text-[var(--danger-500)]" },
  renamed: { short: "R", long: "Renamed", cls: "text-[var(--brand-700)]" },
  unchanged: { short: "·", long: "Unchanged", cls: "text-[var(--text-4)]" },
};

/** Oldest first, so "from" reads naturally before "to" in both pickers. */
function byDate(versions: WikiCodeVersionRecord[]): WikiCodeVersionRecord[] {
  return [...versions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** The pair to open on: the given "to" (or the current version) against the one before it. */
export function defaultComparePair(
  versions: WikiCodeVersionRecord[],
  toId?: string | null,
): { fromId: string; toId: string } | null {
  if (versions.length < 2) return null;
  const to = versions.find((v) => v.id === toId) ?? versions.find((v) => v.isCurrent) ?? byDate(versions).at(-1)!;
  const from = previousVersionOf(versions, to.id) ?? byDate(versions).find((v) => v.id !== to.id)!;
  return { fromId: from.id, toId: to.id };
}

function Counts({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="whitespace-nowrap text-[11px]" style={{ fontFamily: MONO }}>
      <span className="text-[var(--success-500)]">+{added}</span>{" "}
      <span className="text-[var(--danger-500)]">−{removed}</span>
    </span>
  );
}

function LineText({ op, partner }: { op: DiffOp; partner: DiffOp | null }) {
  if (!partner || op.kind === "same") return <>{op.text || " "}</>;
  const oldLine = op.kind === "del" ? op.text : partner.text;
  const newLine = op.kind === "add" ? op.text : partner.text;
  const text = op.text;
  if (!worthEmphasising(oldLine, newLine)) return <>{text || " "}</>;
  const { prefix, suffix } = changedSpan(oldLine, newLine);
  const mid = text.slice(prefix, text.length - suffix);
  if (!mid) return <>{text || " "}</>;
  return (
    <>
      {text.slice(0, prefix)}
      <mark
        className={`rounded-[2px] text-inherit ${
          op.kind === "add"
            ? "bg-[color-mix(in_srgb,var(--success-500)_30%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--danger-500)_28%,transparent)]"
        }`}
      >
        {mid}
      </mark>
      {text.slice(text.length - suffix)}
    </>
  );
}

function DiffRows({ ops, offset, pairs, all }: { ops: DiffOp[]; offset: number; pairs: Map<number, number>; all: DiffOp[] }) {
  return (
    <>
      {ops.map((op, i) => {
        const idx = offset + i;
        const partnerIdx = pairs.get(idx);
        const rowCls =
          op.kind === "add" ? "bg-[var(--success-50)]" : op.kind === "del" ? "bg-[var(--danger-50)]" : "";
        const sign = op.kind === "add" ? "+" : op.kind === "del" ? "−" : " ";
        return (
          <div key={idx} className={`flex min-w-full ${rowCls}`} data-diff-line={op.kind}>
            <span className="w-10 shrink-0 select-none pr-2 text-right text-[var(--text-4)]">{op.oldNo ?? ""}</span>
            <span className="w-10 shrink-0 select-none pr-2 text-right text-[var(--text-4)]">{op.newNo ?? ""}</span>
            <span
              className={`w-5 shrink-0 select-none text-center ${
                op.kind === "add" ? "text-[var(--success-500)]" : op.kind === "del" ? "text-[var(--danger-500)]" : ""
              }`}
              aria-hidden
            >
              {sign}
            </span>
            <span className="whitespace-pre pr-4 text-[var(--text-1)]">
              <span className="sr-only">{op.kind === "add" ? "Added: " : op.kind === "del" ? "Removed: " : ""}</span>
              <LineText op={op} partner={partnerIdx !== undefined ? all[partnerIdx] : null} />
            </span>
            {op.noEol ? (
              <span className="shrink-0 select-none pr-3 text-[10px] text-[var(--text-4)]" title="No newline at the end of the file">
                ⏎̸
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function Gap({ lines }: { lines: number }) {
  if (lines <= 0) return null;
  return (
    <div className="select-none border-y border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-1 text-[11px] text-[var(--text-4)]">
      ⋯ {lines} unchanged line{lines === 1 ? "" : "s"}
    </div>
  );
}

function FileDiff({ file, wholeFile }: { file: FileChange; wholeFile: boolean }) {
  const [unfolded, setUnfolded] = useState(false);
  const big = file.added + file.removed > FOLD_ABOVE_LINES;
  const ops = useMemo(() => file.ops ?? [], [file.ops]);
  const pairs = useMemo(() => pairChangedLines(ops), [ops]);

  if (file.tooLarge) {
    return (
      <p className="px-3 py-4 text-[12px] leading-5 text-[var(--text-3)]">
        This file changed too much to compare line by line (about +{file.added} −{file.removed}). Download both
        versions, or the patch, to see it in full.
      </p>
    );
  }
  if (file.status === "renamed" && file.hunks.length === 0) {
    return <p className="px-3 py-3 text-[12px] text-[var(--text-3)]">Renamed only. The contents are identical.</p>;
  }
  if (file.hunks.length === 0) {
    return <p className="px-3 py-3 text-[12px] text-[var(--text-3)]">{file.note ?? "No line changes."}</p>;
  }
  if (big && !unfolded) {
    return (
      <div className="px-3 py-4 text-[12px] text-[var(--text-3)]">
        {file.added + file.removed} changed lines.{" "}
        <button type="button" onClick={() => setUnfolded(true)} className="font-medium text-[var(--brand-700)] hover:underline">
          Show the changes
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto text-[12px] leading-[1.6]" style={{ fontFamily: MONO }}>
      <div className="inline-block min-w-full">
        {wholeFile ? (
          <DiffRows ops={ops} offset={0} pairs={pairs} all={ops} />
        ) : (
          <HunkList hunks={file.hunks} ops={ops} pairs={pairs} />
        )}
      </div>
    </div>
  );
}

function HunkList({ hunks, ops, pairs }: { hunks: DiffHunk[]; ops: DiffOp[]; pairs: Map<number, number> }) {
  let cursor = 0;
  return (
    <>
      {hunks.map((h, i) => {
        const start = ops.indexOf(h.ops[0], cursor);
        const gap = start - cursor;
        cursor = start + h.ops.length;
        const tail = i === hunks.length - 1 ? ops.length - cursor : 0;
        return (
          <div key={i}>
            <Gap lines={gap} />
            <DiffRows ops={h.ops} offset={start} pairs={pairs} all={ops} />
            <Gap lines={tail} />
          </div>
        );
      })}
    </>
  );
}

function triggerDownload(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/x-diff" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CodeCompareDialog({
  open,
  onClose,
  moduleName,
  versions,
  initialToId = null,
}: {
  open: boolean;
  onClose: () => void;
  moduleName: string;
  versions: WikiCodeVersionRecord[];
  /** Opened from a version's "changes" chip: compare that version with the one before it. */
  initialToId?: string | null;
}) {
  const ordered = useMemo(() => byDate(versions), [versions]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [wholeFile, setWholeFile] = useState(false);
  const fileRefs = useRef(new Map<string, HTMLDivElement>());

  // Each opening starts on the pair it was opened for. Versions refetching while it's
  // open must not undo a choice, so they're deliberately not a dependency.
  useEffect(() => {
    if (!open) return;
    const pair = defaultComparePair(versions, initialToId);
    setFromId(pair?.fromId ?? "");
    setToId(pair?.toId ?? "");
    setWholeFile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialToId]);

  const from = ordered.find((v) => v.id === fromId) ?? null;
  const to = ordered.find((v) => v.id === toId) ?? null;
  const comparison = useMemo(
    () => (from && to && from.id !== to.id ? compareVersions(from.files, to.files, { ignoreWhitespace }) : null),
    [from, to, ignoreWhitespace],
  );
  const changed = comparison?.files.filter((f) => f.status !== "unchanged") ?? [];
  const unchanged = comparison?.files.filter((f) => f.status === "unchanged") ?? [];

  const label = (v: WikiCodeVersionRecord) => `${v.label}${v.isCurrent ? " (current)" : ""}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`COMPARE · ${moduleName.toUpperCase()}`}
      panelClassName="app-dialog-fixed h-[88vh] max-h-[880px] w-full max-w-6xl"
    >
      <div className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 border-b border-[var(--border-1)] px-4 py-3 sm:px-5">
        <label className="min-w-0 flex-1 text-[11px] font-medium text-[var(--text-3)] sm:flex-none">
          From
          <select className="app-select-compact mt-1 w-full sm:w-44" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {ordered.map((v) => (
              <option key={v.id} value={v.id}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setFromId(toId);
            setToId(fromId);
          }}
          aria-label="Swap the versions"
          title="Swap"
          className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-2)] text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
        </button>
        <label className="min-w-0 flex-1 text-[11px] font-medium text-[var(--text-3)] sm:flex-none">
          To
          <select className="app-select-compact mt-1 w-full sm:w-44" value={toId} onChange={(e) => setToId(e.target.value)}>
            {ordered.map((v) => (
              <option key={v.id} value={v.id}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto sm:basis-auto">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand-600)]"
            />
            Ignore whitespace
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-[var(--text-2)]">
            <input
              type="checkbox"
              checked={wholeFile}
              onChange={(e) => setWholeFile(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand-600)]"
            />
            Whole files
          </label>
          <button
            type="button"
            disabled={!comparison || comparison.changedFiles === 0}
            onClick={() => {
              if (!from || !to) return;
              const name = `${moduleName}-${from.label}-to-${to.label}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
              triggerDownload(`${name}.patch`, unifiedPatch(from.files, to.files));
            }}
            title="A patch you can apply with git apply"
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" /> Download .patch
          </button>
        </div>
      </div>

      {!comparison ? (
        <p className="m-5 rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-10 text-center text-[13px] text-[var(--text-4)]">
          Choose two different versions to compare.
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
          {/* File list: where each change is, at a glance. Hidden on a phone, where the
              files simply follow one another. */}
          <nav aria-label="Files" className="hidden min-h-0 overflow-y-auto border-r border-[var(--border-1)] bg-[var(--surface-1)] p-2 md:block">
            <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {summariseComparison(comparison)}
            </p>
            {comparison.files.map((f) => {
              const s = STATUS_LABEL[f.status];
              const muted = f.status === "unchanged";
              return (
                <button
                  key={f.filename}
                  type="button"
                  disabled={muted}
                  onClick={() => fileRefs.current.get(f.filename)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  title={f.oldFilename ? `${f.oldFilename} → ${f.filename}` : f.filename}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition enabled:hover:bg-[var(--surface-0)]"
                >
                  <span className={`w-3 shrink-0 text-[11px] font-semibold ${s.cls}`} style={{ fontFamily: MONO }} aria-hidden>
                    {s.short}
                  </span>
                  <span className="sr-only">{s.long}: </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[12px] ${muted ? "text-[var(--text-4)]" : "text-[var(--text-1)]"}`}
                    style={{ fontFamily: MONO }}
                  >
                    {f.filename}
                  </span>
                  {!muted && <Counts added={f.added} removed={f.removed} />}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 space-y-4 overflow-y-auto p-3 sm:p-4">
            <p className="text-[13px] text-[var(--text-2)] md:hidden">{summariseComparison(comparison)}</p>
            {to?.notes ? (
              <div className="rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] px-3.5 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                  What&apos;s new in {to.label}
                </p>
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-3)]">{to.notes}</p>
              </div>
            ) : null}

            {changed.length === 0 ? (
              <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-10 text-center text-[13px] text-[var(--text-4)]">
                {from?.label} and {to?.label} contain the same code
                {ignoreWhitespace ? ", apart from whitespace" : ""}.
              </p>
            ) : (
              changed.map((f) => {
                const s = STATUS_LABEL[f.status];
                return (
                  <div
                    key={f.filename}
                    ref={(el) => {
                      if (el) fileRefs.current.set(f.filename, el);
                      else fileRefs.current.delete(f.filename);
                    }}
                    className="scroll-mt-2 overflow-hidden rounded-[8px] border border-[var(--border-1)]"
                    data-diff-file={f.filename}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-1.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${s.cls}`} style={{ fontFamily: MONO }}>
                        {s.long}
                      </span>
                      <span className="min-w-0 break-all text-[12px] font-medium text-[var(--text-1)]" style={{ fontFamily: MONO }}>
                        {f.oldFilename ? `${f.oldFilename} → ` : ""}
                        {f.filename}
                      </span>
                      <span className="ml-auto">
                        <Counts added={f.added} removed={f.removed} />
                      </span>
                    </div>
                    <FileDiff file={f} wholeFile={wholeFile} />
                  </div>
                );
              })
            )}
            {unchanged.length > 0 && changed.length > 0 ? (
              <p className="text-[12px] text-[var(--text-4)]">
                {unchanged.length} file{unchanged.length === 1 ? "" : "s"} unchanged:{" "}
                <span style={{ fontFamily: MONO }}>{unchanged.map((f) => f.filename).join(", ")}</span>
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
