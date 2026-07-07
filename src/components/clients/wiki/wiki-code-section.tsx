"use client";

import { useState } from "react";
import {
  ArrowDownTrayIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
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
  return (
    <div className="overflow-hidden rounded-[8px] border border-[var(--border-1)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-1)] bg-[var(--surface-1)] px-3 py-1.5">
        <span className="min-w-0 truncate text-[12px] font-medium text-[var(--text-2)]" style={{ fontFamily: MONO }}>
          {file.filename}
          {file.language ? <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]">{file.language}</span> : null}
        </span>
        <CopyButton text={file.content} />
      </div>
      <pre className="max-h-[360px] overflow-auto bg-[var(--surface-0)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-2)]" style={{ fontFamily: MONO }}>
        <code>{file.content}</code>
      </pre>
    </div>
  );
}

function VersionView({
  moduleName,
  version,
  defaultOpen,
  isInternal,
  slug,
}: {
  moduleName: string;
  version: WikiCodeVersionRecord;
  defaultOpen: boolean;
  isInternal: boolean;
  slug: string;
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
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRightIcon className={`h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-[14px] font-semibold text-[var(--text-1)]" style={{ fontFamily: MONO }}>{version.label}</span>
          {version.isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-brand)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--brand-700)]">
              <StarSolid className="h-3 w-3" /> Current
            </span>
          )}
          <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {version.files.length} file{version.files.length === 1 ? "" : "s"} · {fmtDate(version.createdAt)}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadVersionZip(moduleName, version)}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-600)] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download .zip
          </button>
          {isInternal && !version.isCurrent && (
            <button
              type="button"
              onClick={() => void setCurrent.mutateAsync({ versionId: version.id, makeCurrent: true })}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            >
              <StarIcon className="h-3.5 w-3.5" /> Make current
            </button>
          )}
          {isInternal && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete version ${version.label}?`)) void deleteVersion.mutateAsync(version.id);
              }}
              aria-label="Delete version"
              className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] px-2 py-1 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-[var(--border-1)]">
          {version.notes && <ReleaseNotes text={version.notes} />}
          <div className="space-y-3 p-3.5">
            {version.files.length > 1 && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                {version.files.length} files
              </p>
            )}
            {version.files.map((f) => (
              <FileView key={f.id} file={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Internal: add-version form ──────────────────────────────────────────────
type DraftFile = { filename: string; language: string; content: string };
const emptyFile = (): DraftFile => ({ filename: "", language: "", content: "" });

function AddVersionForm({ slug, moduleId, onDone }: { slug: string; moduleId: string; onDone: () => void }) {
  const create = useCreateCodeVersion(slug);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [files, setFiles] = useState<DraftFile[]>([emptyFile()]);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const clean: CodeFileInput[] = files
      .filter((f) => f.filename.trim() && f.content.length > 0)
      .map((f) => ({ filename: f.filename.trim(), language: f.language.trim() || null, content: f.content }));
    if (!label.trim()) return setError("Add a version label (e.g. v1.0).");
    if (clean.length === 0) return setError("Add at least one file with a name and content.");
    try {
      await create.mutateAsync({ moduleId, label: label.trim(), notes: notes.trim() || null, files: clean, makeCurrent });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this version.");
    }
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Version label (e.g. v1.2.0)" className="app-input" />
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--text-2)]">
          <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} className="h-4 w-4 accent-[var(--brand-600)]" />
          Set as current version
        </label>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Release notes (optional) — what changed in this version" rows={2} className="app-input resize-y py-2.5 leading-relaxed" />
      <div className="space-y-3">
        {files.map((f, i) => (
          <div key={i} className="space-y-2 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-0)] p-3">
            <div className="flex gap-2">
              <input value={f.filename} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, filename: e.target.value } : x)))} placeholder="filename (e.g. main.cpp)" className="app-input flex-1" />
              <input value={f.language} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, language: e.target.value } : x)))} placeholder="lang (optional)" className="app-input w-32" />
              {files.length > 1 && (
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label="Remove file" className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] px-2 text-[var(--text-4)] transition hover:border-rose-300 hover:text-rose-600">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <textarea value={f.content} onChange={(e) => setFiles((p) => p.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))} placeholder="Paste the file contents…" rows={6} className="app-input resize-y py-2.5 font-mono text-[12px] leading-relaxed" style={{ fontFamily: MONO }} />
          </div>
        ))}
        <button type="button" onClick={() => setFiles((p) => [...p, emptyFile()])} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--brand-700)] transition hover:opacity-80">
          <PlusIcon className="h-4 w-4" /> Add another file
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-[8px] border border-[var(--border-2)] px-3.5 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={create.isPending} className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60">
          {create.isPending ? "Saving…" : "Save version"}
        </button>
      </div>
    </div>
  );
}

function ModuleView({ module, slug, isInternal }: { module: WikiCodeModuleRecord; slug: string; isInternal: boolean }) {
  const [adding, setAdding] = useState(false);
  const deleteModule = useDeleteCodeModule(slug);

  return (
    <div className="space-y-3 rounded-[12px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-[var(--text-1)]">{module.name}</h3>
          {module.description && <p className="mt-0.5 text-[13px] leading-6 text-[var(--text-3)]">{module.description}</p>}
        </div>
        {isInternal && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]">
              <PlusIcon className="h-4 w-4" /> New version
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete module "${module.name}" and all its versions?`)) void deleteModule.mutateAsync(module.id);
              }}
              aria-label="Delete module"
              className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] px-2 py-1.5 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isInternal && adding && <AddVersionForm slug={slug} moduleId={module.id} onDone={() => setAdding(false)} />}

      {module.versions.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--text-4)]">
          No versions yet.{isInternal ? " Add the first version above." : ""}
        </p>
      ) : (
        <div className="space-y-2.5">
          {module.versions.map((v, i) => (
            <VersionView key={v.id} moduleName={module.name} version={v} defaultOpen={i === 0} isInternal={isInternal} slug={slug} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddModuleForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const create = useCreateCodeModule(slug);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the module a name (e.g. Receiver).");
    try {
      await create.mutateAsync({ name: name.trim(), description: description.trim() || null });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this module.");
    }
  }

  return (
    <div className="space-y-3 rounded-[10px] border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Module name (e.g. Receiver, Sender)" className="app-input" />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className="app-input" />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-[8px] border border-[var(--border-2)] px-3.5 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={create.isPending} className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60">
          {create.isPending ? "Adding…" : "Add module"}
        </button>
      </div>
    </div>
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

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // CODE HANDOVER"}
        </span>
        {isInternal && (
          <button
            type="button"
            onClick={() => setAddingModule((a) => !a)}
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
            earlier versions are kept below.
          </p>
        )}

        {isInternal && addingModule && <AddModuleForm slug={slug} onDone={() => setAddingModule(false)} />}

        {section.modules.length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-10 text-center text-sm text-[var(--text-4)]">
            No code modules yet.{isInternal ? " Add one (e.g. Receiver, Sender) to start." : ""}
          </p>
        ) : (
          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr))]">
            {section.modules.map((m) => (
              <ModuleView key={m.id} module={m} slug={slug} isInternal={isInternal} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
