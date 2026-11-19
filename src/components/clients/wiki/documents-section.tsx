"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { embedFor } from "@/lib/wiki/embed";
import {
  PlusIcon,
  TrashIcon,
  LinkIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  PencilSquareIcon,
  PlayIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import {
  useCreateWikiLinkDoc,
  useUploadWikiFileDoc,
  useDeleteWikiDoc,
  useUpdateWikiDoc,
  useAddDocToWiki,
  useLinkableWikiDocuments,
} from "@/hooks/use-wiki";
import type { DriveTarget, WikiDocumentDTO } from "@/lib/api";
import { EMPTY_DRIVE, type WikiDriveSection } from "@/lib/client-drive";
import { WikiDriveTab, hasDriveTab } from "@/components/clients/wiki/wiki-drive-section";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { PlatformMark, detectPlatformMark } from "@/lib/platform-icons";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
// 12 a page: the grid is 4-up at xl, so 8 left a ragged final row of 4.
const PAGE_SIZE = 12;

/**
 * Every card is exactly this tall, whatever its title does.
 *
 * ⚠️ The cover used to size itself to the title (`min-h-[128px]` plus a 3-line
 * clamp), so a 2-line title and a 3-line title produced visibly different bands
 * of colour side by side. A fixed cover plus a 2-line clamp is what makes the
 * grid read as one set rather than as a ransom note.
 */
const COVER_H = 132;

type Kind = "FOUNDRY" | "LINK" | "FILE";
const KIND_META: Record<Kind, { icon: typeof LinkIcon; label: string }> = {
  FOUNDRY: { icon: DocumentTextIcon, label: "Foundry document" },
  LINK: { icon: LinkIcon, label: "Link" },
  FILE: { icon: PaperClipIcon, label: "File" },
};

const KIND_TABS: Array<"ALL" | Kind> = ["ALL", "FOUNDRY", "LINK", "FILE"];
const KIND_TAB_LABEL: Record<"ALL" | Kind, string> = {
  ALL: "All",
  FOUNDRY: "Foundry",
  LINK: "Links",
  FILE: "Files",
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAdded(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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

/**
 * What a resource is, said once: the service's official logo when the link is on one we know
 * (Loom, Figma, Google Docs… via simple-icons), otherwise a neutral outline icon for the kind.
 * Cards are neutral surfaces (tokens, so they follow dark mode); colour is never decoration here.
 */
function CardKind({ doc }: { doc: WikiDocumentDTO }) {
  const meta = KIND_META[doc.kind as Kind] ?? KIND_META.LINK;
  const mark = doc.kind === "LINK" ? detectPlatformMark(doc.url) : null;
  const branded = mark?.kind === "brand";
  const Icon = meta.icon;
  const label = branded ? mark.label : doc.kind === "FILE" ? fileKindLabel(doc) : meta.label;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {branded ? (
        <PlatformMark url={doc.url} size="sm" />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-3)] bg-[var(--surface-0)] text-[var(--text-3)]">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]" title={label}>
        {label}
      </span>
    </span>
  );
}

/** "PDF", "PNG"… from the file name, else "File". */
function fileKindLabel(d: WikiDocumentDTO): string {
  const ext = (d.fileName ?? "").match(/\.([a-z0-9]{1,5})$/i)?.[1];
  return ext ? `File · ${ext.toUpperCase()}` : "File";
}

function CardTitle({ doc }: { doc: WikiDocumentDTO }) {
  return (
    <span className="mt-3 block">
      {/* ⚠️ Fixed two-line box, set INLINE (not `line-clamp-2`): in this subtree the utility's
          `display:-webkit-box` lost to another display rule and the title was hard-cut mid-word.
          `title` keeps the full text reachable (audit:clipping's TRUNCATED rule). */}
      <span
        data-resource-title=""
        className="h-[44px] font-[family-name:var(--font-display)] text-[18px] font-normal leading-[1.2] tracking-[-0.3px] text-[var(--text-1)]"
        style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden",
        }}
        title={doc.title}
      >
        {doc.title}
      </span>
      <span
        className="mt-1.5 block truncate font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-3)]"
        title={metaFor(doc)}
      >
        {metaFor(doc)}
      </span>
    </span>
  );
}

/** One card in the grid — the Docs product's gradient-cover-card, adapted to
 *  what a Wiki doc actually has (no blocks/status/ref code, so those slots
 *  are dropped rather than faked). The whole cover opens/downloads the doc;
 *  `action` (delete, in the manager) sits in the footer row. */
function WikiDocCard({
  doc,
  fileBase,
  action,
  onPlay,
}: {
  doc: WikiDocumentDTO;
  fileBase: string;
  action?: React.ReactNode;
  /** Present only in surfaces that can host the player dialog. */
  onPlay?: (doc: WikiDocumentDTO) => void;
}) {
  const isFile = doc.kind === "FILE";
  const OpenIcon = isFile ? ArrowDownTrayIcon : ArrowTopRightOnSquareIcon;
  // A Loom walkthrough is the thing people actually drop in here, and a card
  // saying "loom.com" tells you nothing about which recording it is.
  //
  // ⚠️ The player is NOT mounted in the grid. Twelve third-party iframes on one
  // page is what made previews load only some of the time — each card raced the
  // others for Loom's embed endpoint and the losers rendered an empty box, which
  // looked exactly like a broken card. Nothing is requested from a third party
  // until someone asks to watch, and then it plays big in a dialog rather than
  // in a 300px tile.
  const embed = embedFor(doc.url);
  // Any resolvable embed previews in the dialog, not just video — a Figma file or
  // a Google Doc is worth a look in place too. The icon says which it is.
  const previewable = Boolean(embed);
  const isVideo = embed?.kind === "video";
  return (
    <article className="group/wikidoc flex flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] transition hover:border-[var(--border-1)] hover:shadow-[var(--shadow-sm)]">
      {previewable && onPlay ? (
        <button
          type="button"
          onClick={() => onPlay(doc)}
          title={`${isVideo ? "Play" : "Preview"} "${doc.title}"`}
          className="relative flex w-full flex-col justify-between border-b border-[var(--border-3)] bg-[var(--surface-1)] p-4 text-left"
          style={{ height: COVER_H }}
        >
          <span className="pr-8">
            <CardKind doc={doc} />
          </span>
          <span
            className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)]"
            aria-hidden="true"
          >
            {isVideo ? <PlayIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
          </span>
          <CardTitle doc={doc} />
        </button>
      ) : (
        <a
          href={hrefFor(doc, fileBase)}
          target="_blank"
          rel="noreferrer"
          title={isFile ? "Download" : "Open"}
          className="relative flex flex-col justify-between border-b border-[var(--border-3)] bg-[var(--surface-1)] p-4"
          style={{ height: COVER_H }}
        >
          <span className="pr-8">
            <CardKind doc={doc} />
          </span>
          <span
            className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-2)] opacity-0 transition group-focus-within/wikidoc:opacity-100 group-hover/wikidoc:opacity-100"
            aria-hidden="true"
          >
            <OpenIcon className="h-3.5 w-3.5" />
          </span>
          <CardTitle doc={doc} />
        </a>
      )}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-4)]">
          Added {formatAdded(doc.addedAt)}
        </p>
        {action}
      </div>
    </article>
  );
}

/**
 * The player. One iframe, mounted only while the dialog is open, so the grid
 * makes no third-party requests at all and a Loom walkthrough is watched at a
 * usable size instead of inside a 300px tile.
 *
 * ⚠️ The dialog's title is a SHORT, fixed string, and the resource's own title
 * goes in the footer where it can truncate. Passing the resource title to
 * `<Modal title>` put a long unbreakable string into `.widget-header`'s fixed
 * nowrap band: measured at 390px the panel gained 255px of horizontal overflow,
 * and because a browser scrolls even an `overflow:hidden` box to reveal the
 * element a dialog focuses on open, the whole panel shifted 256px to the left.
 * It reads as a broken dialog, and it is invisible until measured.
 */
function ResourcePlayer({
  doc,
  onClose,
}: {
  doc: WikiDocumentDTO | null;
  onClose: () => void;
}) {
  const embed = doc ? embedFor(doc.url) : null;
  return (
    <Modal
      open={Boolean(doc && embed)}
      onClose={onClose}
      title="01 // PREVIEW"
      panelClassName="w-full max-w-4xl"
    >
      {doc && embed ? (
        <>
          <div className="bg-black" style={{ aspectRatio: String(embed.ratio) }}>
            <iframe
              src={embed.src}
              title={doc.title}
              // ⚠️ `referrerPolicy` keeps the client's wiki URL — which is behind
              // a share token — out of a third party's referrer logs.
              allowFullScreen
              referrerPolicy="no-referrer"
              className="h-full w-full border-0"
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-2)] px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-2)]" title={doc.title}>
              {doc.title}
            </span>
            <a
              href={doc.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--brand-600)] hover:underline"
            >
              Open on {embed.provider}
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/** Rename a resource, or repoint it at a different URL. */
function ResourceEditor({
  doc,
  onClose,
  onSave,
  saving,
}: {
  doc: WikiDocumentDTO | null;
  onClose: () => void;
  onSave: (input: { title: string; url?: string }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(doc?.title ?? "");
    setUrl(doc?.url ?? "");
    setError(null);
  }, [doc]);

  // A FILE has no URL to edit — its bytes are the resource — so only the title
  // is offered rather than showing a field that cannot be saved.
  const canEditUrl = doc?.kind === "LINK";

  function submit() {
    const t = title.trim();
    if (!t) {
      setError("Give it a title.");
      return;
    }
    if (canEditUrl) {
      const u = url.trim();
      // The route validates this too; checking here means the person is told in
      // the field rather than by a failed request.
      if (!/^https?:\/\/\S+$/i.test(u)) {
        setError("That does not look like a link. It needs to start with http:// or https://.");
        return;
      }
      onSave({ title: t, url: u });
      return;
    }
    onSave({ title: t });
  }

  return (
    <Modal open={Boolean(doc)} onClose={onClose} title="01 // EDIT RESOURCE" panelClassName="w-full max-w-lg">
      <div className="space-y-3 px-5 py-4">
        <label className="block">
          <span className="widget-data-label">Title</span>
          <input
            className="app-input mt-1.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What this is"
          />
        </label>
        {canEditUrl ? (
          <label className="block">
            <span className="widget-data-label">Link</span>
            <input
              className="app-input mt-1.5"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.loom.com/share/…"
            />
          </label>
        ) : null}
        {error ? <p className="text-[13px] text-[var(--danger-500)]">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={submit} loading={saving}>
          Save
        </Button>
      </div>
    </Modal>
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
    <div className="flex items-center justify-between px-1 py-2.5">
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

/** Search box + kind tabs (All/Foundry/Links/Files, each with a live count —
 *  the same filter-tab convention as the Requests intake list). Counts are
 *  taken off the full set, not the search-filtered one, so they don't jitter
 *  as you type. */
function DocumentsToolbar({
  documents,
  search,
  onSearch,
  kind,
  onKind,
}: {
  documents: WikiDocumentDTO[];
  search: string;
  onSearch: (v: string) => void;
  kind: "ALL" | Kind;
  onKind: (k: "ALL" | Kind) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search resources…"
          className="app-input pl-9"
        />
      </div>
      <Segmented
        label="Show"
        className="flex-wrap"
        value={kind}
        onChange={onKind}
        options={KIND_TABS.map((tab) => ({
          value: tab,
          label: KIND_TAB_LABEL[tab],
          count: tab === "ALL" ? documents.length : documents.filter((d) => d.kind === tab).length,
        }))}
      />
    </div>
  );
}

/** Search + kind filter, applied client-side — the Wiki's whole document set
 *  for one client is always small enough to filter in the browser. */
function useFilteredDocs(documents: WikiDocumentDTO[]) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"ALL" | Kind>("ALL");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (kind !== "ALL" && d.kind !== kind) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.fileName ?? "").toLowerCase().includes(q) ||
        (d.host ?? "").toLowerCase().includes(q)
      );
    });
  }, [documents, search, kind]);

  function selectKind(next: "ALL" | Kind) {
    setKind(next);
    setPage(0);
  }
  function selectSearch(next: string) {
    setSearch(next);
    setPage(0);
  }

  return { search, kind, page, setPage, filtered, selectKind, selectSearch };
}

/** The 4-across card grid + pager, shared by the public list and the manager. */
function DocumentsGrid({
  docs,
  fileBase,
  page,
  onPage,
  actionFor,
  emptyLabel,
  onPlay,
}: {
  docs: WikiDocumentDTO[];
  fileBase: string;
  page: number;
  onPage: (p: number) => void;
  actionFor?: (doc: WikiDocumentDTO) => React.ReactNode;
  emptyLabel: string;
  onPlay?: (doc: WikiDocumentDTO) => void;
}) {
  const pages = Math.ceil(docs.length / PAGE_SIZE) || 1;
  const shown = docs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (docs.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((d) => (
          <WikiDocCard key={d.id} doc={d} fileBase={fileBase} action={actionFor?.(d)} onPlay={onPlay} />
        ))}
      </div>
      <Pager page={page} pages={pages} total={docs.length} onPage={onPage} />
    </div>
  );
}

// ── Public / read-only list ─────────────────────────────────────────────────
export function DocumentsList({
  documents,
  fileBase,
  drive = EMPTY_DRIVE,
  driveTarget,
}: {
  documents: WikiDocumentDTO[];
  /** Base path for file downloads: `/api/wiki/<token>` or `/api/clients/<slug>/wiki`. */
  fileBase: string;
  /** The client's Google Drive files, when the team has shown them — a second tab. */
  drive?: WikiDriveSection;
  driveTarget?: DriveTarget;
}) {
  const { search, kind, page, setPage, filtered, selectKind, selectSearch } = useFilteredDocs(documents);
  const [playing, setPlaying] = useState<WikiDocumentDTO | null>(null);
  const withDrive = Boolean(driveTarget) && hasDriveTab(drive, "client");
  // With no resources yet, open on Drive rather than on an empty list.
  const [tab, setTab] = useState<ResourcesTab>(documents.length === 0 && withDrive ? "drive" : "resources");

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // RESOURCES"}
        </span>
      </div>
      <div className="space-y-4 p-6">
        {withDrive ? <ResourcesTabs value={tab} onChange={setTab} count={documents.length} /> : null}
        {withDrive && tab === "drive" && driveTarget ? (
          <WikiDriveTab drive={drive} target={driveTarget} />
        ) : documents.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            No resources yet.
          </p>
        ) : (
          <>
            <DocumentsToolbar documents={documents} search={search} onSearch={selectSearch} kind={kind} onKind={selectKind} />
            <DocumentsGrid
              docs={filtered}
              fileBase={fileBase}
              page={page}
              onPage={setPage}
              emptyLabel="No resources match your search."
              onPlay={setPlaying}
            />
          </>
        )}
      </div>
      <ResourcePlayer doc={playing} onClose={() => setPlaying(null)} />
    </section>
  );
}

// ── Editor / manager (workspace) ────────────────────────────────────────────
const inputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 text-[14px] text-[var(--text-1)] outline-none focus:border-[var(--brand-500)]";

export function DocumentsManager({
  slug,
  documents,
  drive = EMPTY_DRIVE,
}: {
  slug: string;
  documents: WikiDocumentDTO[];
  /** The client's Google Drive folder — a second tab, read with your own Google sign-in. */
  drive?: WikiDriveSection;
}) {
  const withDrive = hasDriveTab(drive, "team");
  const [tab, setTab] = useState<ResourcesTab>(documents.length === 0 && withDrive ? "drive" : "resources");
  const createLink = useCreateWikiLinkDoc(slug);
  const uploadFile = useUploadWikiFileDoc(slug);
  const remove = useDeleteWikiDoc(slug);
  const update = useUpdateWikiDoc(slug);
  const [playing, setPlaying] = useState<WikiDocumentDTO | null>(null);
  const [editing, setEditing] = useState<WikiDocumentDTO | null>(null);
  const addFoundry = useAddDocToWiki(slug);
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"link" | "foundry" | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { search, kind, page, setPage, filtered, selectKind, selectSearch } = useFilteredDocs(documents);

  // Everything the server will actually accept: this client's docs plus any doc
  // not yet assigned to a client. Previously this read the client-detail
  // `proposals` array — docs matched to the client by FK or name — so a doc with
  // no client set was never offered even though adding one is exactly how it gets
  // associated. With most docs unassigned in practice, the picker looked empty
  // and claimed everything was "already here". Lazy: only fetched when open.
  const linkable = useLinkableWikiDocuments(slug, mode === "foundry");
  const candidateDocs = linkable.data?.documents ?? [];

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
          {" // RESOURCES"}
        </span>
        {/* ⚠️ `.widget-header` is a fixed 36px band with `overflow: hidden`, so a
            row that does not fit is CLIPPED, not scrolled — measured at 390px,
            these three ran 29px past the right edge and 13px above the band, and
            Upload was unreachable on a phone. Same defect as the Backstage
            calendar header. The labels drop below `sm`, which takes the row from
            ~340px to ~110px and stops it wrapping inside the band; `title` keeps
            each one identifiable. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            title="Add Foundry doc"
            onClick={() => {
              setMode((m) => (m === "foundry" ? null : "foundry"));
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
          >
            <DocumentTextIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Add Foundry doc</span>
          </button>
          <button
            type="button"
            title="Add link"
            onClick={() => {
              setMode("link");
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Add link</span>
          </button>
          <button
            type="button"
            title="Upload a file"
            disabled={uploadFile.isPending}
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{uploadFile.isPending ? "Uploading…" : "Upload"}</span>
          </button>
          <input ref={fileInput} type="file" className="hidden" onChange={onFilePicked} />
        </div>
      </div>

      <div className="space-y-3 p-6">
        {withDrive ? <ResourcesTabs value={tab} onChange={setTab} count={documents.length} /> : null}
        {withDrive && tab === "drive" ? (
          <WikiDriveTab drive={drive} target={{ mode: "internal", slug }} />
        ) : (
        <>
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
                    className="flex items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2"
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
                        className="shrink-0 rounded-[4px] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]"
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
                      className="shrink-0 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
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
            No resources yet. Add a link or upload a file to get started.
          </p>
        ) : (
          <>
            <DocumentsToolbar documents={documents} search={search} onSearch={selectSearch} kind={kind} onKind={selectKind} />
            <DocumentsGrid
              docs={filtered}
              fileBase={fileBase}
              page={page}
              onPage={setPage}
              emptyLabel="No resources match your search."
              onPlay={setPlaying}
              actionFor={(d) => (
                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => setEditing(d)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete "${d.title}"?`)) remove.mutate(d.id);
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </span>
              )}
            />
          </>
        )}
        </>
        )}
      </div>

      <ResourcePlayer doc={playing} onClose={() => setPlaying(null)} />
      <ResourceEditor
        doc={editing}
        saving={update.isPending}
        onClose={() => setEditing(null)}
        onSave={(input) => {
          if (!editing) return;
          update.mutate(
            { id: editing.id, input },
            { onSuccess: () => setEditing(null) },
          );
        }}
      />
    </section>
  );
}

type ResourcesTab = "resources" | "drive";

/** Resources or the client's Google Drive folder — the same segmented control Sheets uses. */
function ResourcesTabs({
  value,
  onChange,
  count,
}: {
  value: ResourcesTab;
  onChange: (v: ResourcesTab) => void;
  count: number;
}) {
  const options: { v: ResourcesTab; label: string; count?: number }[] = [
    { v: "resources", label: "Resources", count },
    { v: "drive", label: "Google Drive" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Resources or Google Drive"
      data-resources-tabs
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
    >
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.v)}
            className={`inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 text-[11px] uppercase tracking-[0.05em] transition-colors ${
              on
                ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]"
            }`}
            style={{ fontFamily: MONO }}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={`rounded-[4px] px-1 text-[10px] ${on ? "bg-[var(--brand-50)] text-[var(--brand-700)]" : "bg-[var(--surface-0)] text-[var(--text-3)]"}`}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
