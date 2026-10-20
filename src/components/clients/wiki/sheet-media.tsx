"use client";

/**
 * Media cells in a Sheet (CLAUDE.md §73.1) — images, videos and files kept as links.
 *
 *   - `MediaChips`: how a cell reads — a kind icon + a tidy title per link, "+N" past what
 *     fits. Never a raw long URL; the full title is in `title=`.
 *   - `MediaViewer`: click a chip to look. Images inline; YouTube / Vimeo / Loom through
 *     their official players in a sandboxed iframe; direct video files in `<video>`;
 *     anything else (Drive, Figma, unknown) is an icon, a title and "Open in new tab".
 *   - `MediaListEditor`: add / remove / reorder / retitle the links.
 *
 * Nothing here fetches a URL itself (no thumbnails, no oEmbed — §73.1's no-SSRF rule
 * applies to the browser too: a thumbnail fetch would leak the viewer's IP to any host a
 * cell names). The iframe `src` is only ever `mediaEmbedUrl()` — built from a parsed id,
 * never the user's URL — and is refused unless it starts with an allow-listed origin.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  FilmIcon,
  FolderIcon,
  PhotoIcon,
  PlayCircleIcon,
  SwatchIcon,
  TrashIcon,
  VideoCameraIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { Modal } from "@/components/ui/modal";
import {
  EMBED_ORIGINS,
  MEDIA_KIND_LABEL,
  MEDIA_LIMITS,
  coerceMedia,
  mediaEmbedUrl,
  mediaKind,
  mediaTitle,
  type MediaKind,
} from "@/lib/wiki-sheet-media";
import type { SheetMediaItem } from "@/types/wiki-sheets";
import { SHEET_IMAGE_ACCEPT, SHEET_IMAGE_MAX_BYTES } from "@/lib/wiki-sheet-files";

/**
 * How this grid uploads an image (§73.2) — provided by `SheetGrid` for its own sheet and
 * side (team or client). Absent → no Upload button, links only.
 */
export type SheetImageUpload = (file: File) => Promise<SheetMediaItem>;
export const SheetImageUploadContext = createContext<SheetImageUpload | null>(null);

const KIND_ICON: Record<MediaKind, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  image: PhotoIcon,
  video: FilmIcon,
  youtube: PlayCircleIcon,
  vimeo: PlayCircleIcon,
  loom: VideoCameraIcon,
  drive: FolderIcon,
  figma: SwatchIcon,
  file: DocumentIcon,
};

/** Token colours only, so the icon reads in light and dark. */
const KIND_TONE: Record<MediaKind, string> = {
  image: "text-[var(--brand-600,#1D4ED8)]",
  video: "text-[var(--brand-600,#1D4ED8)]",
  youtube: "text-[var(--danger-500)]",
  vimeo: "text-[var(--brand-600,#1D4ED8)]",
  loom: "text-[var(--brand-600,#1D4ED8)]",
  drive: "text-[var(--success-500)]",
  figma: "text-[var(--warning-500)]",
  file: "text-[var(--text-3)]",
};

export function MediaIcon({ kind, className = "h-3.5 w-3.5" }: { kind: MediaKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon className={`shrink-0 ${className} ${KIND_TONE[kind]}`} aria-hidden="true" data-media-kind={kind} />;
}

/** The chips for one cell. `max` = how many fit; the rest collapse into "+N". */
export function MediaChips({
  items,
  max = 2,
  wrap = false,
  onOpen,
}: {
  items: readonly SheetMediaItem[];
  max?: number;
  wrap?: boolean;
  onOpen: (index: number) => void;
}) {
  const shown = wrap ? items : items.slice(0, Math.max(1, max));
  const more = items.length - shown.length;
  return (
    <span className={`flex min-w-0 items-center gap-1 ${wrap ? "flex-wrap" : "overflow-hidden"}`} data-media-chips>
      {shown.map((m, i) => {
        const kind = mediaKind(m.url) ?? "file";
        const title = mediaTitle(m);
        return (
          <button
            key={`${m.url}-${i}`}
            type="button"
            title={`${title} · ${MEDIA_KIND_LABEL[kind]}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(i);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-flex max-w-[160px] min-w-0 items-center gap-1 rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[12px] text-[var(--text-2)] ring-1 ring-[var(--border-1)] hover:text-[var(--text-1)] hover:ring-[var(--border-2,rgba(0,0,0,0.2))]"
            data-media-chip
          >
            <MediaIcon kind={kind} />
            <span className="min-w-0 truncate">{title}</span>
          </button>
        );
      })}
      {more > 0 && (
        <button
          type="button"
          title={items.slice(shown.length).map(mediaTitle).join(", ")}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(shown.length);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded-[4px] px-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]"
          style={{ fontFamily: MONO }}
        >
          +{more}
        </button>
      )}
    </span>
  );
}

/** Only a URL built by `mediaEmbedUrl` AND starting with an allow-listed origin is framed. */
export function safeEmbed(url: string): string | null {
  const embed = mediaEmbedUrl(url);
  if (!embed) return null;
  return EMBED_ORIGINS.some((o) => embed.startsWith(`${o}/`)) ? embed : null;
}

export function MediaViewer({
  items,
  start,
  onClose,
}: {
  items: readonly SheetMediaItem[];
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(0, start), items.length - 1));
  const [failed, setFailed] = useState(false);
  const item = items[index];
  const go = useCallback(
    (d: number) => {
      setFailed(false);
      setIndex((i) => (i + d + items.length) % items.length);
    },
    [items.length],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (items.length < 2) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, items.length]);
  if (!item) return null;
  const kind = mediaKind(item.url) ?? "file";
  const title = mediaTitle(item);
  const embed = kind === "youtube" || kind === "vimeo" || kind === "loom" ? safeEmbed(item.url) : null;

  let body: React.ReactNode;
  if (kind === "image" && !failed) {
    body = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt={title}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full rounded-[6px] object-contain"
        data-media-view="image"
      />
    );
  } else if (embed) {
    body = (
      <iframe
        src={embed}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="fullscreen; picture-in-picture; encrypted-media"
        referrerPolicy="strict-origin-when-cross-origin"
        className="aspect-video max-h-full w-full rounded-[6px] border-0 bg-black"
        data-media-view="embed"
      />
    );
  } else if (kind === "video" && !failed) {
    body = (
      <video
        src={item.url}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full rounded-[6px] bg-black"
        data-media-view="video"
      />
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-3 text-center" data-media-view="link">
        <MediaIcon kind={kind} className="h-10 w-10" />
        <p className="max-w-md text-[15px] font-medium break-words text-[var(--text-1)]">{title}</p>
        <p className="text-[12px] text-[var(--text-3)]">
          {failed ? "This couldn't be shown here." : `${MEDIA_KIND_LABEL[kind]} — opens on its own site.`}
        </p>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="app-button app-button-primary app-button-sm"
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          Open in new tab
        </a>
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} title="MEDIA" panelClassName="app-dialog-fixed w-full max-w-4xl">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--surface-1)] p-3 sm:p-4">{body}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-1)] px-4 py-3">
        {/* Its own line on a phone, so the title isn't squeezed to three letters by the controls. */}
        <span className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-0">
          <MediaIcon kind={kind} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]" title={title}>
            {title}
          </span>
        </span>
        {items.length > 1 && (
          <span className="flex items-center gap-1">
            <button type="button" className="app-button app-button-secondary app-button-xs" aria-label="Previous" onClick={() => go(-1)}>
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] text-[var(--text-3)]" style={{ fontFamily: MONO }}>
              {index + 1} / {items.length}
            </span>
            <button type="button" className="app-button app-button-secondary app-button-xs" aria-label="Next" onClick={() => go(1)}>
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="app-button app-button-secondary app-button-xs"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          Open original
        </a>
      </div>
    </Modal>
  );
}

/**
 * Add / remove / reorder / retitle links. Edits a local copy; `onSave` gets the list (or
 * null for "none") and `onCancel` drops it. Used in the cell popover and the phone dialog.
 */
export function MediaListEditor({
  value,
  label,
  onChange,
  autoFocus,
}: {
  value: readonly SheetMediaItem[];
  label: string;
  onChange: (next: SheetMediaItem[]) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const upload = useContext(SheetImageUploadContext);
  const fileInput = useRef<HTMLInputElement>(null);
  const items = useMemo(() => [...value], [value]);
  // Uploads land after the user may have edited the list, so read the latest list on landing.
  const latest = useRef(items);
  latest.current = items;
  const uploadFiles = async (files: File[]) => {
    if (!upload) return;
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.name));
    if (!images.length) return setError("Only PNG, JPEG, GIF or WebP images can be uploaded.");
    const room = MEDIA_LIMITS.maxItems - latest.current.length;
    if (room <= 0) return setError(`${label} holds at most ${MEDIA_LIMITS.maxItems} items per cell.`);
    const big = images.find((f) => f.size > SHEET_IMAGE_MAX_BYTES);
    if (big) return setError(`"${big.name}" is over 10 MB.`);
    setError(null);
    for (const f of images.slice(0, room)) {
      setUploading((n) => n + 1);
      try {
        const item = await upload(f);
        onChange([...latest.current, item]);
        latest.current = [...latest.current, item];
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const add = () => {
    const res = coerceMedia([...items, ...draft.split(/\s+/).filter(Boolean)], label);
    if (!res.ok) return setError(res.error);
    setError(null);
    setDraft("");
    onChange(res.value ?? []);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div
      className="space-y-2"
      data-media-editor
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        if (upload && files.length) {
          e.preventDefault();
          void uploadFiles(files);
        }
      }}
      onDragOver={(e) => {
        if (upload && e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = Array.from(e.dataTransfer.files ?? []);
        if (upload && files.length) {
          e.preventDefault();
          void uploadFiles(files);
        }
      }}
    >
      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((m, i) => {
            const kind = mediaKind(m.url) ?? "file";
            return (
              <li key={`${m.url}-${i}`} className="flex items-center gap-1.5">
                <MediaIcon kind={kind} />
                <input
                  value={m.title ?? ""}
                  placeholder={mediaTitle({ url: m.url })}
                  aria-label={`Title for link ${i + 1}`}
                  maxLength={MEDIA_LIMITS.maxTitle}
                  title={m.url}
                  onChange={(e) =>
                    onChange(items.map((x, k) => (k === i ? (e.target.value ? { url: x.url, title: e.target.value } : { url: x.url }) : x)))
                  }
                  className="app-input h-8 min-w-0 flex-1 py-0 text-base sm:text-[13px]"
                />
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-[4px] p-1 text-[var(--text-4)] hover:text-[var(--text-1)] disabled:opacity-30">
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded-[4px] p-1 text-[var(--text-4)] hover:text-[var(--text-1)] disabled:opacity-30">
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Remove link" onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded-[4px] p-1 text-[var(--text-4)] hover:text-[var(--danger-500)]">
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length < MEDIA_LIMITS.maxItems && (
        <div className="flex gap-1.5">
          <input
            autoFocus={autoFocus}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (draft.trim()) add();
              }
            }}
            inputMode="url"
            placeholder="Paste an image or video link"
            aria-label="Add a link"
            className="app-input h-8 min-w-0 flex-1 py-0 text-base sm:text-[13px]"
          />
          <button type="button" className="app-button app-button-secondary app-button-xs" disabled={!draft.trim()} onClick={add}>
            Add
          </button>
          {upload && (
            <>
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs inline-flex items-center gap-1"
                disabled={uploading > 0}
                onClick={() => fileInput.current?.click()}
                data-media-upload
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                {uploading > 0 ? "Uploading…" : "Upload"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={SHEET_IMAGE_ACCEPT}
                multiple
                hidden
                aria-label="Upload images"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void uploadFiles(files);
                }}
              />
            </>
          )}
        </div>
      )}
      {upload && items.length < MEDIA_LIMITS.maxItems && (
        <p className="text-[11px] text-[var(--text-4)]">Paste a link, or upload, paste or drop an image (up to 10 MB).</p>
      )}
      {error && <p className="text-[12px] text-[var(--danger-500)]">{error}</p>}
    </div>
  );
}
