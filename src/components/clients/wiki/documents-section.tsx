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
import type { WikiDocumentDTO } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

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
const KIND_META: Record<Kind, { icon: typeof LinkIcon; label: string; tint: string; color: string }> = {
  FOUNDRY: { icon: DocumentTextIcon, label: "Foundry document", tint: "rgba(37,99,235,0.10)", color: "#1D4ED8" },
  LINK: { icon: LinkIcon, label: "Link", tint: "rgba(0,0,0,0.05)", color: "#57534E" },
  FILE: { icon: PaperClipIcon, label: "File", tint: "rgba(16,185,129,0.12)", color: "#059669" },
};

const KIND_TABS: Array<"ALL" | Kind> = ["ALL", "FOUNDRY", "LINK", "FILE"];
const KIND_TAB_LABEL: Record<"ALL" | Kind, string> = {
  ALL: "All",
  FOUNDRY: "Foundry",
  LINK: "Links",
  FILE: "Files",
};

// Same technique as the Docs card grid (`proposal-list.tsx`'s DocCard /
// DOC_COVER_PALETTE) — a deterministic hash picks one of six soft tints, so a
// doc keeps the same look across renders. Duplicated locally since that one
// isn't exported; the palette itself is identical for visual consistency.
const DOC_COVER_PALETTE = [
  { from: "#EFF6FF", to: "#DBEAFE", ink: "#1E3A8A" }, // blue
  { from: "#F5F3FF", to: "#EDE9FE", ink: "#5B21B6" }, // violet
  { from: "#ECFDF5", to: "#D1FAE5", ink: "#065F46" }, // emerald
  { from: "#FFFBEB", to: "#FEF3C7", ink: "#92400E" }, // amber
  { from: "#FFF1F2", to: "#FFE4E6", ink: "#9F1239" }, // rose
  { from: "#F8FAFC", to: "#F1F5F9", ink: "#334155" }, // slate
] as const;

function docCoverPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return DOC_COVER_PALETTE[Math.abs(hash) % DOC_COVER_PALETTE.length];
}

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

type Palette = (typeof DOC_COVER_PALETTE)[number];

function CardKind({
  meta,
  Icon,
  palette,
}: {
  meta: (typeof KIND_META)[Kind];
  Icon: (typeof KIND_META)[Kind]["icon"];
  palette: Palette;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{ color: palette.ink, opacity: 0.7 }}
    >
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px]"
        style={{ background: meta.tint, color: meta.color }}
      >
        <Icon className="h-2.5 w-2.5" />
      </span>
      {meta.label}
    </span>
  );
}

function CardTitle({ doc, palette }: { doc: WikiDocumentDTO; palette: Palette }) {
  return (
    <span className="mt-3 block">
      {/* ⚠️ Fixed two-line box, not `line-clamp-3`. The clamp alone still let a
          one-line title and a three-line title produce different card heights;
          reserving the space is what keeps the grid even. `title` keeps the full
          text reachable, which a bare truncation would not (audit:clipping). */}
      {/* ⚠️ The clamp is set INLINE, not via `line-clamp-2`.
          The utility works by setting `display:-webkit-box`, and in this subtree
          something else wins the display (measured: the computed value came back
          `flow-root`), so the class silently stopped clamping and the title was
          hard-cut by the fixed height, mid-word and with no ellipsis. An inline
          style cannot lose that race. `title` keeps the full text reachable,
          which a bare truncation would not (audit:clipping's TRUNCATED rule). */}
      <span
        data-resource-title=""
        className="h-[44px] font-[family-name:var(--font-display)] text-[18px] font-normal leading-[1.2] tracking-[-0.3px]"
        style={{
          color: palette.ink,
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
        className="mt-1.5 block truncate font-mono text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: palette.ink, opacity: 0.65 }}
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
  const meta = KIND_META[doc.kind as Kind];
  const Icon = meta.icon;
  const isFile = doc.kind === "FILE";
  const palette = docCoverPalette(doc.id);
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
    <article className="group/wikidoc flex flex-col overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-white transition hover:border-[var(--border-1)] hover:shadow-[var(--shadow-sm)]">
      {previewable && onPlay ? (
        <button
          type="button"
          onClick={() => onPlay(doc)}
          title={`${isVideo ? "Play" : "Preview"} "${doc.title}"`}
          className="relative flex w-full flex-col justify-between p-4 text-left"
          style={{
            height: COVER_H,
            backgroundImage: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
          }}
        >
          <CardKind meta={meta} Icon={Icon} palette={palette} />
          <span
            className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-white/60"
            style={{ color: palette.ink }}
            aria-hidden="true"
          >
            {isVideo ? <PlayIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
          </span>
          <CardTitle doc={doc} palette={palette} />
        </button>
      ) : (
        <a
          href={hrefFor(doc, fileBase)}
          target="_blank"
          rel="noreferrer"
          title={isFile ? "Download" : "Open"}
          className="relative flex flex-col justify-between p-4"
          style={{
            height: COVER_H,
            backgroundImage: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
          }}
        >
          <CardKind meta={meta} Icon={Icon} palette={palette} />
          <span
            className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-white/50 opacity-0 transition group-hover/wikidoc:opacity-100"
            style={{ color: palette.ink }}
          >
            <OpenIcon className="h-3.5 w-3.5" />
          </span>
          <CardTitle doc={doc} palette={palette} />
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
      <div className="flex flex-wrap items-center gap-1.5">
        {KIND_TABS.map((tab) => {
          const count = tab === "ALL" ? documents.length : documents.filter((d) => d.kind === tab).length;
          const active = kind === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onKind(tab)}
              className={[
                "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition",
                active
                  ? "bg-[var(--brand-600)] text-white"
                  : "text-[var(--text-3)] ring-1 ring-[var(--border-1)] hover:bg-[var(--surface-1)]",
              ].join(" ")}
              style={{ fontFamily: MONO }}
            >
              {KIND_TAB_LABEL[tab]} <span className={active ? "text-white/70" : "text-[var(--text-4)]"}>{count}</span>
            </button>
          );
        })}
      </div>
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
      <p className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
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
}: {
  documents: WikiDocumentDTO[];
  /** Base path for file downloads: `/api/wiki/<token>` or `/api/clients/<slug>/wiki`. */
  fileBase: string;
}) {
  const { search, kind, page, setPage, filtered, selectKind, selectSearch } = useFilteredDocs(documents);
  const [playing, setPlaying] = useState<WikiDocumentDTO | null>(null);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // RESOURCES"}
        </span>
      </div>
      <div className="space-y-4 p-6">
        {documents.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
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
  "w-full rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-[14px] text-[var(--text-1)] outline-none focus:border-[var(--brand-500)]";

export function DocumentsManager({ slug, documents }: { slug: string; documents: WikiDocumentDTO[] }) {
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
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
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
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Add link</span>
          </button>
          <button
            type="button"
            title="Upload a file"
            disabled={uploadFile.isPending}
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <ArrowUpTrayIcon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{uploadFile.isPending ? "Uploading…" : "Upload"}</span>
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
