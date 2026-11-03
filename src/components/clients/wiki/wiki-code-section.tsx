"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent, type SVGProps } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  PencilSquareIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { Modal } from "@/components/ui/modal";
import type {
  CodeFileInput,
  WikiCodeHandoverSection,
  WikiCodeModuleRecord,
  WikiCodeVersionRecord,
} from "@/lib/api";
import {
  useCreateCodeModule,
  useCreateCodeVersion,
  useDeleteCodeModule,
  useDeleteCodeVersion,
  useUpdateCodeVersion,
} from "@/hooks/use-wiki";
import { compareVersions, previousVersionOf, summariseComparison, type VersionComparison } from "@/lib/code-diff";
import { CodeCompareDialog } from "./code-compare";
import { CODE_HL_CSS, NumberedCode } from "./code-highlight";
import {
  describeUpload,
  isZipName,
  mergeDraftFiles,
  prepareUpload,
  zipEntries,
  type DraftFile,
  type UploadEntry,
} from "@/lib/code-upload";
import { COMPARE_PARAM, parseComparePair, withoutComparePair, type ComparePair } from "@/lib/code-compare-link";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadVersionZip(moduleName: string, version: WikiCodeVersionRecord) {
  const { zipSync, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  for (const f of version.files) files[f.filename] = strToU8(f.content);
  const zip = zipSync(files, { level: 6 });
  const slug = `${moduleName}-${version.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  triggerDownload(`${slug}.zip`, new Blob([zip], { type: "application/zip" }));
}

function downloadFile(file: { filename: string; content: string }) {
  // Keep the path's last part: a browser won't save into folders from a download.
  const name = file.filename.split("/").pop() || "file.txt";
  triggerDownload(name, new Blob([file.content], { type: "text/plain;charset=utf-8" }));
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> : <ClipboardIcon className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// Overflow "⋯" menu — keeps destructive/secondary actions off the row so there
// aren't loose trash icons everywhere.
type MenuItem = { label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; onClick: () => void; danger?: boolean };
function RowMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  // Portal-positioned so the menu escapes the wiki card's `overflow: hidden`
  // (an in-flow absolute menu clips at the card edge). Fixed to the viewport,
  // right-aligned under the button, flipping up when it'd run off the bottom.
  const [pos, setPos] = useState<{ up: boolean; top: number; bottom: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estH = items.length * 40 + 12;
    const up = r.bottom + estH > window.innerHeight - 8;
    setPos({
      up,
      top: r.bottom + 6,
      bottom: window.innerHeight - r.top + 6,
      right: Math.max(8, window.innerWidth - r.right),
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-2)] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
      >
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </button>
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              right: pos.right,
              ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
            }}
            className="z-[100] w-44 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-[var(--surface-0)] py-1 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.3)]"
          >
            {items.map((it, i) => {
              const Icon = it.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition hover:bg-[var(--surface-1)] ${it.danger ? "text-rose-600" : "text-[var(--text-2)]"}`}
                >
                  <Icon className="h-4 w-4" /> {it.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Release notes — clamped to a few lines so a long changelog doesn't bury the
 *  code (which is the deliverable). Expandable when there's more to read. */
function ReleaseNotes({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 180;
  return (
    <div className="border-b border-[var(--border-1)] bg-[var(--surface-0)] px-3.5 py-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        What&apos;s new
      </p>
      <p className={`whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-3)] ${!expanded && long ? "line-clamp-3" : ""}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:opacity-80"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}


function FileView({ file }: { file: WikiCodeVersionRecord["files"][number] }) {
  const lineCount = useMemo(() => file.content.replace(/\n$/, "").split("\n").length, [file.content]);
  return (
    <div className="min-w-0 overflow-hidden rounded-[8px] border border-[var(--border-1)]" data-code-file={file.filename}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-1.5">
        <span className="min-w-0 truncate text-[12px] font-medium text-[var(--text-2)]" style={{ fontFamily: MONO }} title={file.filename}>
          {file.filename}
          <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">
            {file.language ? `${file.language} · ` : ""}
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <CopyButton text={file.content} />
          <button
            type="button"
            onClick={() => downloadFile(file)}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download
          </button>
        </span>
      </div>
      <NumberedCode code={file.content} />
    </div>
  );
}

/** Above this many files the picker is a dropdown; a wall of chips stops being quick to scan. */
export const FILE_CHIPS_MAX = 12;

/**
 * A version's files. One file is shown as it is; several get a picker above the code (chips,
 * or a dropdown past FILE_CHIPS_MAX), so a 20-file version isn't 20 code boxes. Above the
 * code rather than beside it: a module card is often half the page wide, and a side rail
 * would leave the code a sliver.
 */
function VersionFiles({ files }: { files: WikiCodeVersionRecord["files"] }) {
  const [selectedId, setSelectedId] = useState(files[0]?.id ?? "");
  const selected = files.find((f) => f.id === selectedId) ?? files[0];
  if (!selected) return <p className="text-[13px] text-[var(--text-4)]">No files in this version.</p>;
  if (files.length === 1) return <FileView file={selected} />;
  return (
    <div className="space-y-2.5">
      {files.length > FILE_CHIPS_MAX ? (
        <label className="block">
          <span className="sr-only">File</span>
          <select className="app-select w-full" value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.filename}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <nav aria-label="Files in this version" className="flex flex-wrap gap-1.5">
          {files.map((f) => {
            const active = f.id === selected.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedId(f.id)}
                aria-current={active ? "true" : undefined}
                title={f.filename}
                className={`max-w-full truncate rounded-[6px] border px-2 py-1 text-[12px] transition ${
                  active
                    ? "border-[var(--brand-500)] bg-[var(--surface-brand)] font-medium text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                }`}
                style={{ fontFamily: MONO }}
              >
                {f.filename}
              </button>
            );
          })}
        </nav>
      )}
      <FileView key={selected.id} file={selected} />
    </div>
  );
}

function VersionView({
  moduleName,
  version,
  defaultOpen,
  isInternal,
  slug,
  changes,
  onCompare,
  onEdit,
}: {
  moduleName: string;
  version: WikiCodeVersionRecord;
  defaultOpen: boolean;
  isInternal: boolean;
  slug: string;
  /** What changed since the version before it. Null for the first version. */
  changes: { since: string; comparison: VersionComparison } | null;
  onCompare: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const setCurrent = useUpdateCodeVersion(slug);
  const deleteVersion = useDeleteCodeVersion(slug);

  return (
    <div className={`rounded-[10px] border ${version.isCurrent ? "border-[var(--brand-500)]" : "border-[var(--border-1)]"}`}>
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          // Wraps, and is never narrower than its label + date: below that the Download
          // group drops to its own line instead. Unbounded, a phone crushed the date into a
          // one-word column that ran under the Download button and hid the Current badge.
          className="flex min-w-[180px] flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
        >
          <ChevronRightIcon className={`h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-[14px] font-semibold text-[var(--text-1)]" style={{ fontFamily: MONO }}>{version.label}</span>
          {version.isCurrent && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--surface-brand)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--brand-700)]">
              <StarSolid className="h-3 w-3" /> Current
            </span>
          )}
          <span className="whitespace-nowrap text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {version.files.length} file{version.files.length === 1 ? "" : "s"} · {fmtDate(version.createdAt)}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {/* The current version is the one to take, so it alone gets the filled button;
              older ones are there for reference. */}
          <button
            type="button"
            onClick={() => void downloadVersionZip(moduleName, version)}
            className={
              version.isCurrent
                ? "inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
                : "inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            }
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download .zip
          </button>
          {isInternal && (
            <RowMenu
              label={`Version ${version.label} actions`}
              items={[
                { label: "Edit version", icon: PencilSquareIcon, onClick: onEdit },
                ...(changes
                  ? [{ label: `Compare with ${changes.since}`, icon: ArrowsRightLeftIcon, onClick: onCompare }]
                  : []),
                ...(version.isCurrent
                  ? []
                  : [
                      {
                        label: "Make current",
                        icon: StarIcon,
                        onClick: () => void setCurrent.mutateAsync({ versionId: version.id, makeCurrent: true }),
                      },
                    ]),
                {
                  label: "Delete version",
                  icon: TrashIcon,
                  danger: true,
                  onClick: () => {
                    if (window.confirm(`Delete version ${version.label}?`)) void deleteVersion.mutateAsync(version.id);
                  },
                },
              ]}
            />
          )}
        </div>
      </div>
      {changes ? (
        <div className="-mt-1 px-3.5 pb-2.5 pl-9">
          <button
            type="button"
            onClick={onCompare}
            className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] text-left text-[11px] text-[var(--text-3)] transition hover:text-[var(--brand-700)]"
            style={{ fontFamily: MONO }}
          >
            <ArrowsRightLeftIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={`Changes since ${changes.since}`}>
              Since {changes.since}:{" "}
              {changes.comparison.changedFiles === 0 ? (
                "no changes"
              ) : (
                <>
                  {changes.comparison.changedFiles} file{changes.comparison.changedFiles === 1 ? "" : "s"} ·{" "}
                  <span className="text-[var(--success-500)]">+{changes.comparison.added}</span>{" "}
                  <span className="text-[var(--danger-500)]">−{changes.comparison.removed}</span>
                </>
              )}
            </span>
            <span className="shrink-0 font-medium text-[var(--brand-700)]">See changes</span>
          </button>
        </div>
      ) : null}
      {open && (
        <div className="border-t border-[var(--border-1)]">
          {version.notes && <ReleaseNotes text={version.notes} />}
          <div className="p-3.5">
            <VersionFiles files={version.files} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Internal: add / edit version form ───────────────────────────────────────
const emptyFile = (): DraftFile => ({ filename: "", language: "", content: "" });

/** Picked or dropped files (and the files inside any .zip) as upload entries. */
async function entriesFromFiles(list: Iterable<File>, pathOf: (f: File) => string = (f) => f.webkitRelativePath || f.name) {
  const entries: UploadEntry[] = [];
  const unreadable: { path: string; reason: string }[] = [];
  for (const file of list) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isZipName(file.name)) {
      try {
        entries.push(...zipEntries(bytes));
      } catch {
        unreadable.push({ path: file.name, reason: "not a readable .zip" });
      }
    } else {
      entries.push({ path: pathOf(file), bytes });
    }
  }
  return { entries, unreadable };
}

/** Everything in a drop, walking into dropped folders and keeping their paths. */
async function filesFromDrop(dt: DataTransfer): Promise<Array<{ file: File; path: string }>> {
  const roots = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  if (roots.length === 0) return Array.from(dt.files).map((file) => ({ file, path: file.name }));
  const out: Array<{ file: File; path: string }> = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail));
      out.push({ file, path: entry.fullPath.replace(/^\//, "") });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns a batch at a time; keep asking until it returns nothing.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child);
      }
    }
  }
  for (const root of roots) await walk(root);
  return out;
}

function AddVersionModal({
  slug,
  moduleId,
  moduleName,
  base,
  editing = null,
  open,
  onClose,
}: {
  slug: string;
  moduleId: string;
  moduleName: string;
  /** The current version. A new version starts from its files, so only what changed is edited. */
  base: WikiCodeVersionRecord | null;
  /** Set to edit this version instead of adding one. Its files are replaced on save. */
  editing?: WikiCodeVersionRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateCodeVersion(slug);
  const update = useUpdateCodeVersion(slug);
  const pending = create.isPending || update.isPending;
  // What the live summary compares against: the saved version when editing it.
  const compareBase = editing ?? base;
  const [dragging, setDragging] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [files, setFiles] = useState<DraftFile[]>([emptyFile()]);
  const [fromBase, setFromBase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const baseFiles = (b: WikiCodeVersionRecord): DraftFile[] =>
    b.files.map((f) => ({ filename: f.filename, language: f.language ?? "", content: f.content }));

  // `webkitdirectory` isn't a React prop; set it on the element so the picker takes a folder.
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
  });

  // Each opening starts from the current version's files when there is one, or from the
  // version being edited.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setLabel(editing.label);
      setNotes(editing.notes ?? "");
      setMakeCurrent(false);
      setFromBase(true);
      setFiles(baseFiles(editing));
      return;
    }
    setFromBase(Boolean(base));
    setFiles(base ? baseFiles(base) : [emptyFile()]);
    // `base` changing under an open form must not overwrite what's being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // What the draft changes against the version it started from, as you type.
  const draftChanges = useMemo(() => {
    if (!compareBase) return null;
    const draft = files
      .filter((f) => f.filename.trim() && f.content.length > 0)
      .map((f) => ({ filename: f.filename.trim(), content: f.content }));
    return compareVersions(compareBase.files, draft);
  }, [compareBase, files]);

  function reset() {
    setLabel("");
    setNotes("");
    setMakeCurrent(true);
    setFiles([emptyFile()]);
    setFromBase(false);
    setError(null);
    setNotice(null);
  }

  async function addUpload(list: Iterable<File>, pathOf?: (f: File) => string) {
    const { entries, unreadable } = await entriesFromFiles(list, pathOf);
    const prepared = prepareUpload(entries);
    const merged = mergeDraftFiles(files, prepared.files);
    setFiles(merged.files);
    setNotice(describeUpload(prepared.files.length, [...unreadable, ...prepared.skipped], prepared.ignored, merged.overLimit));
  }

  async function onUpload(list: FileList | null, input: HTMLInputElement | null) {
    if (!list || list.length === 0) return;
    await addUpload(Array.from(list));
    if (input) input.value = "";
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = await filesFromDrop(e.dataTransfer);
    const paths = new Map(dropped.map((d) => [d.file, d.path]));
    await addUpload(
      dropped.map((d) => d.file),
      (f) => paths.get(f) ?? f.name,
    );
  }
  function close() {
    reset();
    onClose();
  }

  async function save() {
    setError(null);
    const clean: CodeFileInput[] = files
      .filter((f) => f.filename.trim() && f.content.length > 0)
      .map((f) => ({ filename: f.filename.trim(), language: f.language.trim() || null, content: f.content }));
    if (!label.trim()) return setError("Add a version label (e.g. v1.0).");
    if (clean.length === 0) return setError("Add at least one file with a name and content.");
    try {
      if (editing) {
        await update.mutateAsync({
          versionId: editing.id,
          label: label.trim(),
          notes: notes.trim() || null,
          files: clean,
          ...(makeCurrent ? { makeCurrent: true } : {}),
        });
      } else {
        await create.mutateAsync({ moduleId, label: label.trim(), notes: notes.trim() || null, files: clean, makeCurrent });
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this version.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`${editing ? "EDIT VERSION" : "NEW VERSION"} · ${moduleName.toUpperCase()}`}
      panelClassName="app-dialog-fixed w-full max-w-3xl"
    >
      {/* Height lives on the PANEL (`app-dialog-fixed`), not on a `max-h-[46vh]` scroll
          region — that capped the tall case and still let a one-file version collapse
          the box, so opening two in a row moved it under the cursor (§46). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left — version meta */}
        <div className="min-h-0 space-y-4 overflow-y-auto border-b border-[var(--border-1)] p-5 md:border-b-0 md:border-r">
          <label className="block">
            <span className="app-field-label">Version label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. v1.2.0" className="app-input" autoFocus />
          </label>
          <label className="block">
            <span className="app-field-label">Release notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed in this version (optional)"
              rows={5}
              className="app-input resize-y py-2.5 leading-relaxed"
            />
          </label>
          {editing?.isCurrent ? null : (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--text-2)]">
              <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} className="h-4 w-4 accent-[var(--brand-600)]" />
              {editing ? "Make this the current version" : "Set as the current version"}
            </label>
          )}
          {editing ? (
            <div className="rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                Changes from the saved {editing.label}
              </p>
              <p className="mt-1 text-[13px] text-[var(--text-2)]" data-draft-changes>
                {draftChanges ? summariseComparison(draftChanges) : "No changes"}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-4)]">
                Saving replaces this version&apos;s files with the ones listed here.
              </p>
            </div>
          ) : base ? (
            <div className="rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                Changes from {base.label}
              </p>
              <p className="mt-1 text-[13px] text-[var(--text-2)]" data-draft-changes>
                {draftChanges ? summariseComparison(draftChanges) : "No changes"}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-4)]">
                {fromBase
                  ? `Started from ${base.label}'s files. Replace what changed; anything you remove is removed from this version.`
                  : "Started empty. Only the files you add will be in this version."}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (fromBase) {
                    setFiles([emptyFile()]);
                    setFromBase(false);
                  } else {
                    setFiles(baseFiles(base));
                    setFromBase(true);
                  }
                  setNotice(null);
                }}
                className="mt-1.5 text-[12px] font-medium text-[var(--brand-700)] hover:underline"
              >
                {fromBase ? "Start empty instead" : `Start from ${base.label}'s files`}
              </button>
            </div>
          ) : null}
        </div>

        {/* Right — files. The whole pane takes a drop: files, a folder or a .zip. */}
        <div
          className={`min-h-0 space-y-3 overflow-y-auto p-5 transition ${dragging ? "bg-[var(--surface-brand)] outline-dashed outline-2 -outline-offset-8 outline-[var(--brand-500)]" : ""}`}
          data-drop-zone
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => void onDrop(e)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="app-field-label">Files</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                <ArrowUpTrayIcon className="h-4 w-4" /> Upload files
              </button>
              <button
                type="button"
                onClick={() => folderRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                <FolderIcon className="h-4 w-4" /> Upload folder
              </button>
            </span>
            <input
              ref={uploadRef}
              type="file"
              multiple
              className="hidden"
              aria-label="Upload code files or a .zip"
              onChange={(e) => void onUpload(e.target.files, e.target)}
            />
            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              aria-label="Upload a folder"
              onChange={(e) => void onUpload(e.target.files, e.target)}
            />
          </div>
          <p className="text-[12px] text-[var(--text-4)]">
            Drop files, a folder or a .zip here. Folders keep their paths, so <span style={{ fontFamily: MONO }}>src/radio.h</span> stays{" "}
            <span style={{ fontFamily: MONO }}>src/radio.h</span>.
          </p>
          {notice ? <p className="text-[12px] text-[var(--text-3)]" data-upload-notice>{notice}</p> : null}
          <div className="space-y-3 pr-0.5">
            {files.map((f, i) => (
              <div key={i} className="space-y-2 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-3">
                <div className="flex gap-2">
                  <input value={f.filename} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, filename: e.target.value } : x)))} placeholder="filename (e.g. main.cpp)" className="app-input flex-1" />
                  <input value={f.language} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, language: e.target.value } : x)))} placeholder="lang" className="app-input w-24" />
                  {files.length > 1 && (
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label="Remove file" className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] px-2 text-[var(--text-4)] transition hover:border-rose-300 hover:text-rose-600">
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <textarea value={f.content} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} placeholder="Paste the file contents…" rows={7} className="app-input resize-y py-2.5 text-[12px] leading-relaxed" style={{ fontFamily: MONO }} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setFiles((p) => [...p, emptyFile()])} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--brand-700)] transition hover:opacity-80">
            <PlusIcon className="h-4 w-4" /> Add another file
          </button>
        </div>
      </div>

      {error && <p className="shrink-0 px-5 text-sm text-rose-600">{error}</p>}
      <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-1)] p-4">
        <button type="button" onClick={close} className="rounded-[8px] border border-[var(--border-2)] px-3.5 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={pending} className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60">
          {pending ? "Saving…" : editing ? "Save changes" : "Save version"}
        </button>
      </div>
    </Modal>
  );
}

/** Versions shown before "Show N older versions". The current version is always first. */
export const VISIBLE_VERSIONS = 3;

function ModuleView({
  module,
  slug,
  isInternal,
  linkedPair,
  onLinkedPairClosed,
}: {
  module: WikiCodeModuleRecord;
  slug: string;
  isInternal: boolean;
  /** Opened from a shared compare link: start with the compare view open on this pair. */
  linkedPair: ComparePair | null;
  onLinkedPairClosed: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [comparing, setComparing] = useState<{ toId: string | null; fromId?: string | null } | null>(
    linkedPair ? { toId: linkedPair.toId, fromId: linkedPair.fromId } : null,
  );
  const deleteModule = useDeleteCodeModule(slug);
  const current = module.versions.find((v) => v.isCurrent) ?? null;

  // What each version changed since the one before it, for the line under each row.
  const changesById = useMemo(() => {
    const map = new Map<string, { since: string; comparison: VersionComparison }>();
    for (const v of module.versions) {
      const prev = previousVersionOf(module.versions, v.id);
      if (prev) map.set(v.id, { since: prev.label, comparison: compareVersions(prev.files, v.files) });
    }
    return map;
  }, [module.versions]);

  return (
    <div className="space-y-3 rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-[var(--text-1)]">{module.name}</h3>
          {module.description && <p className="mt-0.5 text-[13px] leading-6 text-[var(--text-3)]">{module.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {module.versions.length >= 2 && (
            <button
              type="button"
              onClick={() => setComparing({ toId: null })}
              className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-0)]"
            >
              <ArrowsRightLeftIcon className="h-4 w-4" /> Compare
            </button>
          )}
        {isInternal && (
          <>
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-0)]">
              <PlusIcon className="h-4 w-4" /> New version
            </button>
            <RowMenu
              label={`${module.name} actions`}
              items={[
                {
                  label: "Delete module",
                  icon: TrashIcon,
                  danger: true,
                  onClick: () => {
                    if (window.confirm(`Delete module "${module.name}" and all its versions?`)) void deleteModule.mutateAsync(module.id);
                  },
                },
              ]}
            />
          </>
        )}
        </div>
      </div>

      {isInternal && (
        <AddVersionModal
          slug={slug}
          moduleId={module.id}
          moduleName={module.name}
          base={current}
          editing={module.versions.find((v) => v.id === editingId) ?? null}
          open={adding || editingId !== null}
          onClose={() => {
            setAdding(false);
            setEditingId(null);
          }}
        />
      )}
      {module.versions.length >= 2 && (
        <CodeCompareDialog
          open={comparing !== null}
          onClose={() => {
            if (linkedPair) onLinkedPairClosed();
            setComparing(null);
          }}
          moduleId={module.id}
          moduleName={module.name}
          versions={module.versions}
          initialToId={comparing?.toId ?? null}
          initialFromId={comparing?.fromId ?? null}
          mode={isInternal ? "internal" : "public"}
        />
      )}

      {module.versions.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--text-4)]">
          No versions yet.{isInternal ? " Use “New version” to add one." : ""}
        </p>
      ) : (
        <div className="space-y-2.5">
          {(showAll ? module.versions : module.versions.slice(0, VISIBLE_VERSIONS)).map((v) => (
            <VersionView
              key={v.id}
              moduleName={module.name}
              version={v}
              defaultOpen={false}
              isInternal={isInternal}
              slug={slug}
              changes={changesById.get(v.id) ?? null}
              onCompare={() => setComparing({ toId: v.id })}
              onEdit={() => setEditingId(v.id)}
            />
          ))}
          {module.versions.length > VISIBLE_VERSIONS ? (
            <button
              type="button"
              onClick={() => setShowAll((x) => !x)}
              className="w-full rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-[12px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-0)] hover:text-[var(--text-1)]"
            >
              {showAll
                ? "Show fewer versions"
                : `Show ${module.versions.length - VISIBLE_VERSIONS} older version${module.versions.length - VISIBLE_VERSIONS === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AddModuleModal({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const create = useCreateCodeModule(slug);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the module a name (e.g. Receiver).");
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || null });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this module.");
    }
  }

  return (
    <Modal open={open} onClose={close} title="NEW MODULE" panelClassName="w-full max-w-2xl">
      <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
        {/* Left — what a module is */}
        <div className="hidden border-r border-[var(--border-1)] bg-[var(--surface-1)] p-5 sm:block">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--surface-brand)] text-[var(--brand-700)]">
            <PlusIcon className="h-5 w-5" />
          </div>
          <p className="text-[13px] leading-6 text-[var(--text-3)]">
            A module is one piece of hardware — e.g. <span className="text-[var(--text-2)]">Receiver</span> or{" "}
            <span className="text-[var(--text-2)]">Sender</span>. You&apos;ll add versioned firmware inside it next.
          </p>
        </div>

        {/* Right — the fields */}
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="app-field-label">Module name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Receiver" className="app-input" autoFocus />
          </label>
          <label className="block">
            <span className="app-field-label">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className="app-input" />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-1)] p-4">
        <button type="button" onClick={close} className="rounded-[8px] border border-[var(--border-2)] px-3.5 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={create.isPending} className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60">
          {create.isPending ? "Adding…" : "Add module"}
        </button>
      </div>
    </Modal>
  );
}

export function WikiCodeSection({
  slug,
  section,
  mode,
}: {
  slug: string;
  section: WikiCodeHandoverSection;
  mode: "internal" | "public";
}) {
  const isInternal = mode === "internal";
  const [addingModule, setAddingModule] = useState(false);
  // A shared compare link (`?compare=`), read once on arrival. Ignored unless it names a
  // module and two versions that are actually here.
  const [linkedPair, setLinkedPair] = useState<ComparePair | null>(null);
  useEffect(() => {
    const pair = parseComparePair(new URLSearchParams(window.location.search).get(COMPARE_PARAM));
    if (!pair) return;
    const mod = section.modules.find((m) => m.id === pair.moduleId);
    const ids = new Set(mod?.versions.map((v) => v.id));
    if (ids.has(pair.fromId) && ids.has(pair.toId)) setLinkedPair(pair);
    // Arrival only: a refetch must not reopen a dialog the reader has closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clearLinkedPair = () => {
    setLinkedPair(null);
    window.history.replaceState(window.history.state, "", withoutComparePair(window.location.href));
  };

  return (
    <section className="widget-card">
      <style>{CODE_HL_CSS}</style>
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // CODE HANDOVER"}
        </span>
        {isInternal && (
          <button
            type="button"
            onClick={() => setAddingModule(true)}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add module
          </button>
        )}
      </div>
      <div className="space-y-6 p-6">
        {!isInternal && (
          <p className="max-w-2xl text-[13px] leading-6 text-[var(--text-3)]">
            Source for your hardware, ready to copy or download and flash. The current version is shown first;
            earlier versions are kept below. Use Compare to see exactly what changed between any two.
          </p>
        )}

        {isInternal && <AddModuleModal slug={slug} open={addingModule} onClose={() => setAddingModule(false)} />}

        {section.modules.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-10 text-center text-sm text-[var(--text-4)]">
            No code modules yet.{isInternal ? " Add one (e.g. Receiver, Sender) to start." : ""}
          </p>
        ) : (
          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr))]">
            {section.modules.map((m) => (
              <ModuleView
                // Remount when a link arrives, so the module opens its compare view on it.
                key={`${m.id}:${linkedPair?.moduleId === m.id ? "linked" : ""}`}
                module={m}
                slug={slug}
                isInternal={isInternal}
                linkedPair={linkedPair?.moduleId === m.id ? linkedPair : null}
                onLinkedPairClosed={clearLinkedPair}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
