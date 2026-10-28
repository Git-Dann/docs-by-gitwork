"use client";

/**
 * A client's Google Drive folder — the Drive tab of Portal's Documents card and of the wiki's
 * Resources page (team and client). Renders inside its host's card; it has no header of its own.
 *
 * Three views: what was added most recently, what was edited most recently, and the folder
 * itself to browse. Nothing is copied into Foundry; every look is a live read, so a file put
 * in Drive shows on the next look.
 *
 *   - TEAM (`mode: "internal"`): read with your own Google sign-in. Preview is Google's own
 *     viewer, which uses the Google account signed in to this browser.
 *   - CLIENT (`mode: "public"`): read through their share link. They have no Google access of
 *     their own, so files are served by Foundry: Docs and Slides as PDF, images as images,
 *     everything else as a download.
 */

import { useMemo, useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  DocumentIcon,
  DocumentTextIcon,
  FilmIcon,
  FolderIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  SwatchIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { Modal } from "@/components/ui/modal";
import { useClientDrive } from "@/hooks/use-proposals";
import { driveBase, type DriveTarget } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import {
  DRIVE_KIND_LABEL,
  clientCanOpen,
  clientPreviewKind,
  driveOpenUrl,
  drivePreviewUrl,
  type ClientDriveFile,
  type ClientDriveView,
  type DriveFileKind,
} from "@/lib/client-drive";

const KIND_ICON: Record<DriveFileKind, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  folder: FolderIcon,
  doc: DocumentTextIcon,
  sheet: TableCellsIcon,
  slides: PresentationChartBarIcon,
  form: ClipboardDocumentListIcon,
  drawing: SwatchIcon,
  pdf: DocumentIcon,
  image: PhotoIcon,
  video: FilmIcon,
  audio: MusicalNoteIcon,
  archive: ArchiveBoxIcon,
  text: DocumentTextIcon,
  file: DocumentIcon,
};

const VIEWS: { v: ClientDriveView; label: string; hint: string }[] = [
  { v: "added", label: "Added", hint: "Newest files first, by when they were added" },
  { v: "edited", label: "Edited", hint: "Newest files first, by when they were last changed" },
  { v: "folder", label: "Browse", hint: "The folder itself" },
];

function fileUrl(target: DriveTarget, id: string, inline = false): string {
  return `${driveBase(target)}/file/${encodeURIComponent(id)}${inline ? "?inline=1" : ""}`;
}

function thumbUrl(target: DriveTarget, id: string): string {
  return `${driveBase(target)}/thumbnail/${encodeURIComponent(id)}`;
}

function Thumb({ target, file, className }: { target: DriveTarget; file: ClientDriveFile; className: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICON[file.kind];
  if (file.hasThumbnail && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbUrl(target, file.id)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <span className={`${className} flex items-center justify-center bg-[var(--surface-1)] text-[var(--text-3)]`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function stamp(file: ClientDriveFile, view: ClientDriveView): string | null {
  const added = view === "added";
  const at = added ? file.createdTime : file.modifiedTime;
  if (!at) return null;
  const when = formatRelative(at);
  if (added) return `Added ${when}`;
  return file.modifiedBy ? `Edited ${when} by ${file.modifiedBy}` : `Edited ${when}`;
}

export function ClientDriveFiles({
  target,
  pageSize = 10,
  onLinkFolder,
}: {
  target: DriveTarget;
  /** Rows per page. A folder can hold hundreds; the card never grows past this. */
  pageSize?: number;
  /** Team only: offered when no folder is linked yet (opens Edit client). */
  onLinkFolder?: () => void;
}) {
  const isClient = target.mode === "public";
  const [view, setView] = useState<ClientDriveView>("added");
  const [folder, setFolder] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { data, isLoading, isFetching, refetch } = useClientDrive(target, view, folder);

  const files = useMemo(() => data?.files ?? [], [data]);
  const pages = Math.max(1, Math.ceil(files.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = files.slice(current * pageSize, (current + 1) * pageSize);
  const previewable = files.filter((f) => f.kind !== "folder");
  const previewIndex = previewId ? previewable.findIndex((f) => f.id === previewId) : -1;
  const ok = data?.state === "ok";

  function open(file: ClientDriveFile) {
    if (file.kind === "folder") {
      setView("folder");
      setFolder(file.id);
      setPage(0);
      return;
    }
    setPreviewId(file.id);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-1)] px-4 py-2.5">
        <div
          role="tablist"
          aria-label="Drive view"
          className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
        >
          {VIEWS.map((o) => {
            const on = o.v === view;
            return (
              <button
                key={o.v}
                type="button"
                role="tab"
                aria-selected={on}
                title={o.hint}
                onClick={() => {
                  setView(o.v);
                  setPage(0);
                  if (o.v !== "folder") setFolder(null);
                }}
                className={`inline-flex h-full items-center whitespace-nowrap rounded-[6px] px-2.5 text-[11px] uppercase tracking-[0.05em] transition-colors ${
                  on
                    ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]"
                }`}
                style={{ fontFamily: MONO }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto flex min-w-0 items-center gap-1">
          {ok && data.folderName ? (
            <span
              className="hidden min-w-0 truncate text-[11px] uppercase tracking-[0.05em] text-[var(--text-4)] sm:inline"
              style={{ fontFamily: MONO }}
              title={data.folderName}
            >
              {data.folderName}
            </span>
          ) : null}
          {!isClient && data?.folderUrl ? (
            <a
              href={data.folderUrl}
              target="_blank"
              rel="noreferrer"
              title="Open the folder in Google Drive"
              aria-label="Open the folder in Google Drive"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--brand-700)]"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            title="Check Drive again"
            aria-label="Check Drive again"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </span>
      </div>

      {view === "folder" && ok && data.crumbs.length > 0 ? (
        <nav aria-label="Folder" className="flex flex-wrap items-center gap-1 px-4 pt-3 text-[12px]">
          {data.crumbs.map((c, i) => {
            const last = i === data.crumbs.length - 1;
            return (
              <span key={c.id} className="flex min-w-0 items-center gap-1">
                {i > 0 ? <ChevronRightIcon className="h-3 w-3 shrink-0 text-[var(--text-4)]" /> : null}
                {last ? (
                  <span className="max-w-[220px] truncate font-medium text-[var(--text-1)]" title={c.name}>
                    {c.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFolder(i === 0 ? null : c.id);
                      setPage(0);
                    }}
                    className="max-w-[180px] truncate text-[var(--brand-700)] hover:underline"
                    title={c.name}
                  >
                    {c.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="p-3" data-drive-list>
        {isLoading && !data ? (
          <p className="px-2 py-8 text-center text-[13px] text-[var(--text-4)]">Reading Drive…</p>
        ) : !ok ? (
          <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-[var(--border-2)] px-6 py-8 text-center">
            <p className="max-w-sm text-[13px] text-[var(--text-3)]">{data?.message ?? "Couldn't read Drive."}</p>
            {data?.state === "no_folder" && onLinkFolder ? (
              <button type="button" onClick={onLinkFolder} className="app-button app-button-secondary app-button-xs">
                Add the Drive folder link
              </button>
            ) : null}
          </div>
        ) : files.length === 0 ? (
          <p className="px-2 py-8 text-center text-[13px] text-[var(--text-4)]">
            {view === "folder" ? "This folder is empty." : "No files in this folder yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shown.map((file) => {
              const sub = [
                DRIVE_KIND_LABEL[file.kind],
                view !== "folder" ? file.path : null,
                view !== "folder" ? stamp(file, view) : file.modifiedTime ? `Edited ${formatRelative(file.modifiedTime)}` : null,
              ].filter(Boolean) as string[];
              const external = isClient
                ? clientCanOpen(file.mimeType) && file.kind !== "folder"
                  ? fileUrl(target, file.id)
                  : null
                : driveOpenUrl(file);
              return (
                <li key={file.id} className="group flex items-center gap-1 rounded-[8px] hover:bg-[var(--surface-1)]">
                  <button
                    type="button"
                    onClick={() => open(file)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-[8px] px-2 py-1.5 text-left"
                    data-drive-file={file.kind}
                  >
                    <Thumb target={target} file={file} className="h-10 w-10 shrink-0 rounded-[6px] border border-[var(--border-1)]" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium text-[var(--text-1)]" title={file.name}>
                        {file.name}
                      </span>
                      <span
                        className="truncate text-[10.5px] tracking-[0.02em] text-[var(--text-3)]"
                        style={{ fontFamily: MONO }}
                        title={sub.join(" · ")}
                      >
                        {sub.join(" · ")}
                      </span>
                    </span>
                  </button>
                  {external ? (
                    <a
                      href={external}
                      target={isClient ? undefined : "_blank"}
                      rel="noreferrer"
                      title={isClient ? "Download" : "Open in Google Drive"}
                      aria-label={isClient ? `Download ${file.name}` : `Open ${file.name} in Google Drive`}
                      className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-3)] transition-colors hover:bg-[var(--surface-0)] hover:text-[var(--brand-700)]"
                    >
                      {isClient ? <ArrowDownTrayIcon className="h-4 w-4" /> : <ArrowTopRightOnSquareIcon className="h-4 w-4" />}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {ok && pages > 1 ? (
          <div className="flex items-center justify-between px-1 pt-2.5" data-drive-pager>
            <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {current * pageSize + 1}–{Math.min(files.length, (current + 1) * pageSize)} of {files.length}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous page"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-30"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-30"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </span>
          </div>
        ) : null}
        {ok && data.partial && view !== "folder" ? (
          <p className="mt-2 px-2 text-[11px] text-[var(--text-4)]">
            This folder has more subfolders than the recent list searches, so a file deep in it
            may be missing here. Browse to see everything.
          </p>
        ) : null}
      </div>

      {previewIndex >= 0 ? (
        <DrivePreview
          target={target}
          files={previewable}
          index={previewIndex}
          onIndex={(i) => setPreviewId(previewable[i]?.id ?? null)}
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </>
  );
}

function DrivePreview({
  target,
  files,
  index,
  onIndex,
  onClose,
}: {
  target: DriveTarget;
  files: ClientDriveFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const file = files[index];
  const isClient = target.mode === "public";
  const go = (step: number) => onIndex((index + step + files.length) % files.length);

  let body: React.ReactNode;
  if (!isClient) {
    const src = drivePreviewUrl(file);
    body = src ? (
      <iframe
        key={file.id}
        src={src}
        title={file.name}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
        allow="fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full rounded-[6px] border-0 bg-[var(--surface-0)]"
        data-drive-preview="google"
      />
    ) : (
      <NoPreview file={file} target={target} />
    );
  } else {
    const kind = clientPreviewKind(file.mimeType);
    body =
      kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={file.id}
          src={fileUrl(target, file.id, true)}
          alt={file.name}
          className="max-h-full max-w-full rounded-[6px] object-contain"
          data-drive-preview="image"
        />
      ) : kind === "pdf" ? (
        <iframe
          key={file.id}
          src={fileUrl(target, file.id, true)}
          title={file.name}
          className="h-full w-full rounded-[6px] border-0 bg-[var(--surface-0)]"
          data-drive-preview="pdf"
        />
      ) : (
        <NoPreview file={file} target={target} />
      );
  }

  const action = isClient
    ? clientCanOpen(file.mimeType)
      ? { href: fileUrl(target, file.id), label: "Download", icon: ArrowDownTrayIcon, newTab: false }
      : null
    : (() => {
        const href = driveOpenUrl(file);
        return href ? { href, label: "Open in Drive", icon: ArrowTopRightOnSquareIcon, newTab: true } : null;
      })();
  const Icon = KIND_ICON[file.kind];

  return (
    <Modal open onClose={onClose} title="DRIVE" panelClassName="app-dialog-fixed w-full max-w-5xl">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--surface-1)] p-3 sm:p-4">
        {body}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-1)] px-4 py-3">
        <span className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-0">
          <Icon className="h-4 w-4 shrink-0 text-[var(--text-3)]" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-1)]" title={file.name}>
            {file.name}
          </span>
        </span>
        {files.length > 1 ? (
          <span className="flex items-center gap-1">
            <button type="button" className="app-button app-button-secondary app-button-xs" aria-label="Previous" onClick={() => go(-1)}>
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] text-[var(--text-3)]" style={{ fontFamily: MONO }}>
              {index + 1} / {files.length}
            </span>
            <button type="button" className="app-button app-button-secondary app-button-xs" aria-label="Next" onClick={() => go(1)}>
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
        {action ? (
          <a
            href={action.href}
            target={action.newTab ? "_blank" : undefined}
            rel="noreferrer"
            className="app-button app-button-secondary app-button-xs"
          >
            <action.icon className="h-3.5 w-3.5" />
            {action.label}
          </a>
        ) : null}
      </div>
      {!isClient ? (
        <p className="shrink-0 px-4 pb-3 text-[11px] text-[var(--text-4)]">
          The preview uses the Google account signed in to this browser. Blank? Use Open in Drive.
        </p>
      ) : null}
    </Modal>
  );
}

function NoPreview({ file, target }: { file: ClientDriveFile; target: DriveTarget }) {
  const isClient = target.mode === "public";
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-drive-preview="none">
      {file.hasThumbnail ? (
        <Thumb target={target} file={file} className="h-48 w-auto max-w-full rounded-[8px] border border-[var(--border-1)]" />
      ) : (
        <Thumb target={target} file={file} className="h-16 w-16 rounded-[8px]" />
      )}
      <p className="max-w-md break-words text-[15px] font-medium text-[var(--text-1)]">{file.name}</p>
      <p className="text-[12px] text-[var(--text-3)]">
        {isClient
          ? clientCanOpen(file.mimeType)
            ? `${DRIVE_KIND_LABEL[file.kind]} — download it to open.`
            : "This can't be opened here."
          : "No preview for this kind of file. Open it in Drive."}
      </p>
    </div>
  );
}

