"use client";

import { useMemo, useRef, useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  LinkIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import {
  useCreateWikiLinkDoc,
  useUploadWikiFileDoc,
  useDeleteWikiDoc,
  useAddDocToWiki,
  useLinkableWikiDocuments,
} from "@/hooks/use-wiki";
import type { WikiDocumentDTO } from "@/lib/api";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const PAGE_SIZE = 8;

type Kind = "FOUNDRY" | "LINK" | "FILE";
const KIND_META: Record<Kind, { icon: typeof LinkIcon; label: string; tint: string; color: string }> = {
  FOUNDRY: { icon: DocumentTextIcon, label: "Foundry document", tint: "rgba(37,99,235,0.10)", color: "#1D4ED8" },
  LINK: { icon: LinkIcon, label: "Link", tint: "rgba(0,0,0,0.05)", color: "#57534E" },
  FILE: { icon: PaperClipIcon, label: "File", tint: "rgba(16,185,129,0.12)", color: "#059669" },
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Sub-label under a doc title — never the raw URL. */
function metaFor(d: WikiDocumentDTO): string {
  if (d.kind === "FILE") return [d.fileName, formatSize(d.fileSize)].filter(Boolean).join(" · ");
  if (d.kind === "FOUNDRY") return "Foundry document";
  return d.host ?? "Link";
}

/** Where a doc opens: external URL, or the file download path under `fileBase`. */
function hrefFor(d: WikiDocumentDTO, fileBase: string): string {
  if (d.kind === "FILE") return `${fileBase}/documents/${d.id}/file`;
  return d.url ?? "#";
}

function DocRow({
  doc,
  fileBase,
  action,
}: {
  doc: WikiDocumentDTO;
  fileBase: string;
  action?: React.ReactNode;
}) {
  const meta = KIND_META[doc.kind as Kind];
  const Icon = meta.icon;
  const isFile = doc.kind === "FILE";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <a
        href={hrefFor(doc, fileBase)}
        target="_blank"
        rel="noreferrer"
        className="group flex min-w-0 flex-1 items-center gap-3"
      >
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]"
          style={{ background: meta.tint, color: meta.color }}
        >
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-[var(--text-1)] group-hover:text-[var(--brand-700)]">
            {doc.title}
          </span>
          <span className="block truncate text-[12px] text-[var(--text-4)]">{metaFor(doc)}</span>
        </span>
        {isFile ? (
          <ArrowDownTrayIcon className="h-4 w-4 shrink-0 text-[var(--text-4)] transition group-hover:text-[var(--brand-700)]" />
        ) : (
          <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0 text-[var(--text-4)] transition group-hover:text-[var(--brand-700)]" />
        )}
      </a>
      {action}
    </li>
  );
}

function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-30"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Public / read-only list ─────────────────────────────────────────────────
export function DocumentsList({
  documents,
  fileBase,
}: {
  documents: WikiDocumentDTO[];
  /** Base path for file downloads: `/api/wiki/<token>` or `/api/clients/<slug>/wiki`. */
  fileBase: string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(documents.length / PAGE_SIZE) || 1;
  const shown = documents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // DOCUMENTS"}
        </span>
      </div>
      <div className="p-6">
        {documents.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            No documents yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-[rgba(0,0,0,0.08)]">
            <ul className="divide-y divide-[rgba(0,0,0,0.06)]">
              {shown.map((d) => (
                <DocRow key={d.id} doc={d} fileBase={fileBase} />
              ))}
            </ul>
            <div className="border-t border-[rgba(0,0,0,0.06)]">
              <Pager page={page} pages={pages} total={documents.length} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Editor / manager (workspace) ────────────────────────────────────────────
const inputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-[14px] text-[var(--text-1)] outline-none focus:border-[var(--brand-500)]";

export function DocumentsManager({ slug, documents }: { slug: string; documents: WikiDocumentDTO[] }) {
  const createLink = useCreateWikiLinkDoc(slug);
  const uploadFile = useUploadWikiFileDoc(slug);
  const remove = useDeleteWikiDoc(slug);
  const addFoundry = useAddDocToWiki(slug);
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"link" | "foundry" | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Everything the server will actually accept: this client's docs plus any doc
  // not yet assigned to a client. Previously this read the client-detail
  // `proposals` array — docs matched to the client by FK or name — so a doc with
  // no client set was never offered even though adding one is exactly how it gets
  // associated. With most docs unassigned in practice, the picker looked empty
  // and claimed everything was "already here". Lazy: only fetched when open.
  const linkable = useLinkableWikiDocuments(slug, mode === "foundry");
  const candidateDocs = linkable.data?.documents ?? [];

  const pages = Math.ceil(documents.length / PAGE_SIZE) || 1;
  const shown = useMemo(
    () => documents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [documents, page],
  );
  const fileBase = `/api/clients/${slug}/wiki`;

  async function submitLink() {
    if (!title.trim() || !url.trim()) {
      setError("Title and URL are required.");
      return;
    }
    try {
      await createLink.mutateAsync({ title: title.trim(), url: url.trim() });
      setTitle("");
      setUrl("");
      setMode(null);
      setError(null);
    } catch {
      setError("Couldn't add that link — check the URL.");
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("title", file.name.replace(/\.[^.]+$/, ""));
    try {
      await uploadFile.mutateAsync(form);
    } catch {
      setError("Couldn't upload that file (max 15MB).");
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header flex items-center justify-between">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // DOCUMENTS"}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "foundry" ? null : "foundry"));
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
          >
            <DocumentTextIcon className="h-3.5 w-3.5" /> Add Foundry doc
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("link");
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add link
          </button>
          <button
            type="button"
            disabled={uploadFile.isPending}
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="h-3.5 w-3.5" /> {uploadFile.isPending ? "Uploading…" : "Upload"}
          </button>
          <input ref={fileInput} type="file" className="hidden" onChange={onFilePicked} />
        </div>
      </div>

      <div className="space-y-3 p-6">
        <p className="text-[13px] text-[var(--text-4)]">
          Paste a link (Google Docs, a Foundry doc, anything) or upload a file. Clients see a clean,
          paginated list.
        </p>

        {mode === "foundry" && (
          <div className="space-y-2.5 rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-[var(--text-1)]">
                Add one of this client&rsquo;s Foundry documents
              </p>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="text-[12px] text-[var(--text-3)] transition hover:text-[var(--text-1)]"
              >
                Close
              </button>
            </div>
            <p className="text-[12px] text-[var(--text-4)]">
              Adding shares the document so the client can open it, and lists it on this view-only page.
            </p>
            {linkable.isPending ? (
              <p className="py-2 text-[13px] text-[var(--text-4)]">Loading documents…</p>
            ) : linkable.isError ? (
              <p className="py-2 text-[13px] text-[var(--danger-500)]">
                Couldn&rsquo;t load documents. Close and reopen to retry.
              </p>
            ) : candidateDocs.length === 0 ? (
              // Distinguish "nothing exists to add" from "everything's added" —
              // the old copy always claimed the latter, which read as a dead end
              // on a client that simply has no Foundry documents yet.
              <p className="py-2 text-[13px] text-[var(--text-4)]">
                {documents.some((d) => d.kind === "FOUNDRY")
                  ? "Every Foundry document is already listed here."
                  : "No Foundry documents available to add. Create one in Docs, then come back — documents that aren’t assigned to a client will show up here too."}
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-auto">
                {candidateDocs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
                  >
                    <DocumentTextIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]">
                      {doc.title}
                    </span>
                    {/* Adding an unassigned doc also assigns it to this client —
                        say so, rather than surprising the reader after the fact. */}
                    {doc.unassigned ? (
                      <span
                        title="Not assigned to a client yet — adding it assigns it to this one"
                        className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                      >
                        Unassigned
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={addFoundry.isPending}
                      onClick={async () => {
                        setError(null);
                        try {
                          await addFoundry.mutateAsync(doc.id);
                        } catch {
                          setError("Couldn't add that document.");
                        }
                      }}
                      className="shrink-0 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-2.5 rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Onboarding pack)"
            />
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/…"
              style={{ fontFamily: MONO }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={createLink.isPending}
                onClick={submitLink}
                className="rounded-[7px] bg-[var(--brand-600)] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
              >
                {createLink.isPending ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-[7px] border border-[var(--border-2)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-[12px] text-rose-600">{error}</p>}

        {documents.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            No documents yet. Add a link or upload a file to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-[rgba(0,0,0,0.08)]">
            <ul className="divide-y divide-[rgba(0,0,0,0.06)]">
              {shown.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  fileBase={fileBase}
                  action={
                    <button
                      type="button"
                      title="Delete"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete "${d.title}"?`)) remove.mutate(d.id);
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  }
                />
              ))}
            </ul>
            <div className="border-t border-[rgba(0,0,0,0.06)]">
              <Pager page={page} pages={pages} total={documents.length} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
