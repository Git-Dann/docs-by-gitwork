/**
 * A client's Google Drive folder in Portal — the pure half. No fetch, no googleapis.
 *
 * The folder is the one saved on the client record (`googleDriveFolderUrl`). Files are read
 * with the VIEWER's own Google sign-in, never a shared account, so a developer only ever sees
 * what Drive already lets them see. Nothing is copied into Foundry.
 */

/** Drive ids are URL-safe base64. A shared drive's root id is short (~19 chars), so allow it. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export function isDriveId(value: string | null | undefined): value is string {
  return typeof value === "string" && DRIVE_ID.test(value);
}

/**
 * The folder id in a saved Drive folder link, or null. Accepts every shape people paste:
 * `/drive/folders/<id>`, `/drive/u/1/folders/<id>`, `/drive/mobile/folders/<id>`,
 * `/folderview?id=<id>`, `/open?id=<id>`, and a bare id. Anything not on drive.google.com is
 * null, so a website or a Doc link is never mistaken for a folder.
 */
export function driveFolderIdFromUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (DRIVE_ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() !== "drive.google.com") return null;
  const fromPath = /\/folders\/([A-Za-z0-9_-]+)/.exec(u.pathname)?.[1];
  const id = fromPath ?? u.searchParams.get("id");
  return isDriveId(id) ? id : null;
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFileKind =
  | "folder"
  | "doc"
  | "sheet"
  | "slides"
  | "form"
  | "drawing"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "text"
  | "file";

/** A short family for a file, for its icon and its label. */
export function driveFileKind(mimeType: string | null | undefined): DriveFileKind {
  const m = (mimeType ?? "").toLowerCase();
  if (m === FOLDER_MIME) return "folder";
  if (m === "application/vnd.google-apps.document" || m.includes("wordprocessingml") || m === "application/msword") return "doc";
  if (m === "application/vnd.google-apps.spreadsheet" || m.includes("spreadsheetml") || m === "text/csv" || m === "application/vnd.ms-excel") return "sheet";
  if (m === "application/vnd.google-apps.presentation" || m.includes("presentationml") || m === "application/vnd.ms-powerpoint") return "slides";
  if (m === "application/vnd.google-apps.form") return "form";
  if (m === "application/vnd.google-apps.drawing") return "drawing";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/zip" || m.includes("compressed") || m.includes("x-tar") || m.includes("x-7z")) return "archive";
  if (m.startsWith("text/") || m === "application/json") return "text";
  return "file";
}

export const DRIVE_KIND_LABEL: Record<DriveFileKind, string> = {
  folder: "Folder",
  doc: "Doc",
  sheet: "Sheet",
  slides: "Slides",
  form: "Form",
  drawing: "Drawing",
  pdf: "PDF",
  image: "Image",
  video: "Video",
  audio: "Audio",
  archive: "Archive",
  text: "Text",
  file: "File",
};

/**
 * The embeddable preview for a file, or null when it has none (a folder, a Form).
 *
 * ⚠️ Built from a validated id and a fixed origin — never from a link Drive returned — so the
 * iframe can only ever point at Google's own viewer.
 */
export function drivePreviewUrl(file: { id: string; mimeType: string | null | undefined }): string | null {
  if (!isDriveId(file.id)) return null;
  const id = encodeURIComponent(file.id);
  switch (file.mimeType) {
    case FOLDER_MIME:
    case "application/vnd.google-apps.form":
      return null;
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${id}/preview`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${id}/preview`;
    default:
      return `https://drive.google.com/file/d/${id}/preview`;
  }
}

/** The page that opens a file (or a folder) in Drive itself. Fixed origin, validated id. */
export function driveOpenUrl(file: { id: string; mimeType: string | null | undefined }): string | null {
  if (!isDriveId(file.id)) return null;
  const id = encodeURIComponent(file.id);
  switch (file.mimeType) {
    case FOLDER_MIME:
      return `https://drive.google.com/drive/folders/${id}`;
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${id}/edit`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${id}/edit`;
    default:
      return `https://drive.google.com/file/d/${id}/view`;
  }
}

/* ── the wire format ── */

export type ClientDriveView = "added" | "edited" | "folder";

/** A `view` query parameter, defaulting to recently added. */
export function parseDriveView(value: string | null | undefined): ClientDriveView {
  return value === "edited" || value === "folder" ? value : "added";
}

export interface ClientDriveFile {
  id: string;
  name: string;
  mimeType: string;
  kind: DriveFileKind;
  createdTime: string | null;
  modifiedTime: string | null;
  /** Who last changed it, as Drive names them. */
  modifiedBy: string | null;
  /** The folder it sits in, by name — "Designs / Round 2". Null at the top of the client folder. */
  path: string | null;
  size: number | null;
  /** Whether a small preview image can be fetched through Foundry. */
  hasThumbnail: boolean;
}

export interface ClientDriveCrumb {
  id: string;
  name: string;
}

/**
 * Why there are no files to show. Every state the card can be in is a sentence the developer
 * can act on — "we couldn't look" is never shown as "the folder is empty" (§35).
 */
export type ClientDriveState =
  | "ok"
  /** The client record has no Drive folder link, or it isn't a folder link. */
  | "no_folder"
  /** This person hasn't connected Google to Foundry. */
  | "not_connected"
  /** Their Google sign-in predates the Drive scope, or was revoked. */
  | "reconnect"
  /** Drive says this person can't see the folder. */
  | "no_access"
  /** Drive didn't answer. */
  | "error"
  /** The client's copy: the team member it is read through can't read it any more. */
  | "unavailable";

export interface ClientDriveResponse {
  state: ClientDriveState;
  /** The saved folder link, so the card can always offer "Open in Drive". */
  folderUrl: string | null;
  folderName: string | null;
  view: ClientDriveView;
  files: ClientDriveFile[];
  /** Folder view only: the client folder first, the open folder last. */
  crumbs: ClientDriveCrumb[];
  /** Recent views only: true when the client folder has more subfolders than were searched. */
  partial: boolean;
  message: string | null;
}

export const DRIVE_STATE_MESSAGE: Record<Exclude<ClientDriveState, "ok">, string> = {
  no_folder: "No Google Drive folder is linked to this client.",
  not_connected: "Connect your Google account to see this client's Drive files here.",
  reconnect: "Your Google sign-in needs refreshing to read Drive. Sign out of Foundry and back in.",
  no_access: "Your Google account can't see this folder. Ask for access in Drive.",
  error: "Google Drive didn't answer. Try again in a moment.",
  unavailable: "These files aren't available right now. Gitwork needs to reconnect this folder.",
};

/* ── the wiki section ── */

/**
 * Drive files in a client's wiki (a tab of Resources). No files ride in the DTO — they are read live, so a
 * file added to Drive shows on the next look, with no sync to fall behind.
 */
export interface WikiDriveSection {
  /** Shown to the CLIENT. The team can always look with their own Google sign-in. */
  enabled: boolean;
  /** The client record has a Drive FOLDER link (not a file, not blank). Known even while off. */
  linked: boolean;
  /**
   * Team copy only: whose Google sign-in reads the folder for the client, and whether that
   * sign-in still works (connected, and still on the team). Always null in the client's copy.
   */
  reader: { name: string; ready: boolean } | null;
}

export const EMPTY_DRIVE: WikiDriveSection = { enabled: false, linked: false, reader: null };

/** Sort newest first by the view's own clock, falling back to the other. Stable. */
export function sortRecent(files: readonly ClientDriveFile[], view: "added" | "edited"): ClientDriveFile[] {
  const at = (f: ClientDriveFile) => Date.parse((view === "added" ? f.createdTime : f.modifiedTime) ?? f.modifiedTime ?? f.createdTime ?? "") || 0;
  return files
    .map((f, i) => ({ f, i }))
    .sort((a, b) => at(b.f) - at(a.f) || a.i - b.i)
    .map(({ f }) => f);
}

/**
 * How the CLIENT's copy previews a file inside Foundry. Google Docs and Slides are exported
 * to PDF by the file route, so they preview as PDFs; a Word file is served as itself, so it
 * can only be downloaded. Images in a safe type show as images. Anything else: download.
 */
export function clientPreviewKind(mimeType: string | null | undefined): "pdf" | "image" | "none" {
  switch (mimeType) {
    case "application/pdf":
    case "application/vnd.google-apps.document":
    case "application/vnd.google-apps.presentation":
      return "pdf";
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
    case "application/vnd.google-apps.drawing":
      return "image";
    default:
      return "none";
  }
}

/** Whether the client's copy can fetch this file at all (folders and Forms have no bytes). */
export function clientCanOpen(mimeType: string | null | undefined): boolean {
  return mimeType !== FOLDER_MIME && mimeType !== "application/vnd.google-apps.form";
}
