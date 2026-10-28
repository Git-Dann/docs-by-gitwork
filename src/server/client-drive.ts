/**
 * A client's Google Drive folder, read for Portal and the client's wiki (team only).
 *
 * ⚠️ Always with the VIEWER's own Google sign-in (`getUserGoogleAuth`), never a workspace
 * account. Drive's own sharing therefore decides what each person sees, and a developer who
 * can't open the folder in Drive can't open it here either. That is also why the wiki shows it
 * to the team only: a client on the share link has no Gitwork Google account to read with.
 *
 * Nothing is stored. Each read is a few Drive list calls; the card caches for a minute.
 */

import type { drive_v3 } from "googleapis";
import {
  DRIVE_STATE_MESSAGE,
  FOLDER_MIME,
  driveFileKind,
  isDriveId,
  sortRecent,
  type ClientDriveCrumb,
  type ClientDriveFile,
  type ClientDriveResponse,
  type ClientDriveState,
  type ClientDriveView,
} from "@/lib/client-drive";

type Drive = drive_v3.Drive;

/** How deep, and how many folders, the recent views search under the client folder. */
export const RECENT_MAX_DEPTH = 5;
export const RECENT_MAX_FOLDERS = 120;
/** Files shown in a recent view. */
export const RECENT_LIMIT = 30;
/** Parents per `files.list` query — Drive caps the query string, and 40 ids stays well under it. */
const PARENTS_PER_QUERY = 40;
/** Hops walked up from a file to prove it sits under the client folder. */
const MAX_ANCESTRY_HOPS = 15;

const SHARED = { supportsAllDrives: true } as const;
const LIST = { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: "allDrives" } as const;

const FILE_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,size,parents,hasThumbnail,lastModifyingUser(displayName)";

export class DriveReadError extends Error {
  constructor(readonly state: Exclude<ClientDriveState, "ok" | "no_folder" | "not_connected">) {
    super(state);
  }
}

/**
 * What a Drive failure means for the card. A 404 is "you can't see it" — Drive answers 404,
 * not 403, for a folder this account has no access to. A missing scope or a revoked grant is a
 * sign-in problem, which the person can fix; everything else is Drive not answering.
 */
export function classifyDriveError(err: unknown): DriveReadError["state"] {
  const e = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number; data?: { error?: unknown } };
    errors?: { reason?: string }[];
    message?: string;
  };
  const status = Number(e?.response?.status ?? e?.status ?? e?.code) || 0;
  const reasons = (e?.errors ?? []).map((r) => r?.reason ?? "").join(" ");
  const text = `${reasons} ${e?.message ?? ""} ${JSON.stringify(e?.response?.data?.error ?? "")}`.toLowerCase();
  if (text.includes("invalid_grant") || status === 401) return "reconnect";
  if (status === 403 && (text.includes("insufficient") || text.includes("scope"))) return "reconnect";
  if (status === 404 || status === 403) return "no_access";
  return "error";
}

async function call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new DriveReadError(classifyDriveError(err));
  }
}

function quote(id: string): string {
  // Ids are validated before they get here; the escape is belt and braces.
  return `'${id.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parentsClause(ids: readonly string[]): string {
  return `(${ids.map((id) => `${quote(id)} in parents`).join(" or ")})`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface RootFolder {
  id: string;
  name: string;
}

/** The client folder itself. Null when the saved link points at a file rather than a folder. */
export async function readRoot(drive: Drive, rootId: string): Promise<RootFolder | null> {
  const meta = await call(() => drive.files.get({ fileId: rootId, fields: "id,name,mimeType", ...SHARED }));
  if (meta.mimeType !== FOLDER_MIME) return null;
  return { id: meta.id ?? rootId, name: meta.name ?? "Drive folder" };
}

interface FolderNode {
  name: string;
  parent: string | null;
}

/**
 * Every folder under the client folder, breadth first, to `RECENT_MAX_DEPTH` and at most
 * `RECENT_MAX_FOLDERS`. `partial` says the limit was hit, so the card can say the recent list
 * may be missing something deep in the tree rather than implying it searched everything.
 */
export async function walkFolders(
  drive: Drive,
  root: RootFolder,
): Promise<{ folders: Map<string, FolderNode>; partial: boolean }> {
  const folders = new Map<string, FolderNode>([[root.id, { name: root.name, parent: null }]]);
  let frontier = [root.id];
  let partial = false;
  for (let depth = 0; depth < RECENT_MAX_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const ids of chunk(frontier, PARENTS_PER_QUERY)) {
      let pageToken: string | undefined;
      do {
        const res = await call(() =>
          drive.files.list({
            q: `${parentsClause(ids)} and mimeType = '${FOLDER_MIME}' and trashed = false`,
            fields: "nextPageToken,files(id,name,parents)",
            pageSize: 1000,
            pageToken,
            ...LIST,
          }),
        );
        for (const f of res.files ?? []) {
          if (!f.id || folders.has(f.id)) continue;
          if (folders.size >= RECENT_MAX_FOLDERS) {
            partial = true;
            break;
          }
          const parent = (f.parents ?? []).find((p) => folders.has(p)) ?? root.id;
          folders.set(f.id, { name: f.name ?? "Untitled folder", parent });
          next.push(f.id);
        }
        pageToken = folders.size >= RECENT_MAX_FOLDERS ? undefined : (res.nextPageToken ?? undefined);
      } while (pageToken);
    }
    frontier = next;
  }
  return { folders, partial };
}

/** "Designs / Round 2" for a file in that folder; null for one at the top of the client folder. */
export function folderPath(folders: Map<string, FolderNode>, folderId: string | null | undefined): string | null {
  const names: string[] = [];
  let id = folderId ?? null;
  for (let hops = 0; id && hops < RECENT_MAX_DEPTH + 2; hops++) {
    const node = folders.get(id);
    if (!node || node.parent === null) break;
    names.unshift(node.name);
    id = node.parent;
  }
  return names.length ? names.join(" / ") : null;
}

function toFile(f: drive_v3.Schema$File, path: string | null): ClientDriveFile | null {
  if (!f.id || !isDriveId(f.id)) return null;
  const mimeType = f.mimeType ?? "application/octet-stream";
  return {
    id: f.id,
    name: f.name ?? "Untitled",
    mimeType,
    kind: driveFileKind(mimeType),
    createdTime: f.createdTime ?? null,
    modifiedTime: f.modifiedTime ?? null,
    modifiedBy: f.lastModifyingUser?.displayName ?? null,
    path,
    size: f.size ? Number(f.size) || null : null,
    hasThumbnail: Boolean(f.hasThumbnail),
  };
}

/** The newest files anywhere under the client folder — by when they were added, or last edited. */
export async function recentFiles(
  drive: Drive,
  root: RootFolder,
  view: "added" | "edited",
): Promise<{ files: ClientDriveFile[]; partial: boolean }> {
  const { folders, partial } = await walkFolders(drive, root);
  const orderBy = view === "added" ? "createdTime desc" : "modifiedTime desc";
  const batches = await Promise.all(
    chunk([...folders.keys()], PARENTS_PER_QUERY).map((ids) =>
      call(() =>
        drive.files.list({
          q: `${parentsClause(ids)} and mimeType != '${FOLDER_MIME}' and trashed = false`,
          orderBy,
          fields: `files(${FILE_FIELDS})`,
          pageSize: RECENT_LIMIT,
          ...LIST,
        }),
      ),
    ),
  );
  const seen = new Set<string>();
  const files: ClientDriveFile[] = [];
  for (const batch of batches) {
    for (const f of batch.files ?? []) {
      if (!f.id || seen.has(f.id)) continue;
      seen.add(f.id);
      const parent = (f.parents ?? []).find((p) => folders.has(p));
      const file = toFile(f, folderPath(folders, parent));
      if (file) files.push(file);
    }
  }
  return { files: sortRecent(files, view).slice(0, RECENT_LIMIT), partial };
}

/* ── is this file under the client folder? ── */

/** A file's parent, remembered for ten minutes. Folder structure, not access — every read still
 * goes through the viewer's own token first. */
const PARENT_CACHE = new Map<string, { parent: string | null; name: string; at: number }>();
const PARENT_TTL_MS = 10 * 60 * 1000;
const PARENT_CACHE_MAX = 5000;

async function parentOf(drive: Drive, id: string): Promise<{ parent: string | null; name: string }> {
  const hit = PARENT_CACHE.get(id);
  if (hit && Date.now() - hit.at < PARENT_TTL_MS) return hit;
  const meta = await call(() => drive.files.get({ fileId: id, fields: "name,parents", ...SHARED }));
  const entry = { parent: meta.parents?.[0] ?? null, name: meta.name ?? "Untitled", at: Date.now() };
  if (PARENT_CACHE.size >= PARENT_CACHE_MAX) PARENT_CACHE.clear();
  PARENT_CACHE.set(id, entry);
  return entry;
}

/**
 * The crumbs from the client folder down to `id`, or null when `id` is NOT under the client
 * folder. ⚠️ This is what stops the card being a way to browse any folder the viewer can see:
 * a folder id from the URL is only listed once it is proven to sit inside this client's folder.
 */
export async function crumbsTo(drive: Drive, root: RootFolder, id: string): Promise<ClientDriveCrumb[] | null> {
  if (id === root.id) return [{ id: root.id, name: root.name }];
  const chain: ClientDriveCrumb[] = [];
  let current: string | null = id;
  for (let hops = 0; current && hops < MAX_ANCESTRY_HOPS; hops++) {
    if (current === root.id) return [{ id: root.id, name: root.name }, ...chain];
    let step: { parent: string | null; name: string };
    try {
      step = await parentOf(drive, current);
    } catch (err) {
      // Climbing out of the client's folder reaches folders the reader can't see, which Drive
      // answers with 404. That is "not under this folder", not an outage.
      if (err instanceof DriveReadError && err.state === "no_access") return null;
      throw err;
    }
    const { parent, name } = step;
    chain.unshift({ id: current, name });
    current = parent;
  }
  return null;
}

/** One folder's contents: folders first, then files, by name. */
export async function folderContents(drive: Drive, folderId: string): Promise<ClientDriveFile[]> {
  const res = await call(() =>
    drive.files.list({
      q: `${quote(folderId)} in parents and trashed = false`,
      orderBy: "folder,name_natural",
      fields: `files(${FILE_FIELDS})`,
      pageSize: 300,
      ...LIST,
    }),
  );
  return (res.files ?? []).map((f) => toFile(f, null)).filter((f): f is ClientDriveFile => f !== null);
}

export interface DriveReadResult {
  view: ClientDriveView;
  folderName: string;
  files: ClientDriveFile[];
  crumbs: ClientDriveCrumb[];
  partial: boolean;
}

/**
 * The card's read. Throws `DriveReadError` for "you can't see it" / "reconnect" / "Drive
 * didn't answer", and returns null when the saved link is not a folder.
 */
export async function readClientDrive(
  drive: Drive,
  rootId: string,
  view: ClientDriveView,
  folderId: string | null,
): Promise<DriveReadResult | null> {
  const root = await readRoot(drive, rootId);
  if (!root) return null;
  if (view === "folder") {
    const target = folderId && isDriveId(folderId) ? folderId : root.id;
    const crumbs = await crumbsTo(drive, root, target);
    // Not under this client's folder: show the client folder, never the other one.
    if (!crumbs) {
      return { view, folderName: root.name, files: await folderContents(drive, root.id), crumbs: [root], partial: false };
    }
    return { view, folderName: root.name, files: await folderContents(drive, target), crumbs, partial: false };
  }
  const { files, partial } = await recentFiles(drive, root, view);
  return { view, folderName: root.name, files, crumbs: [root], partial };
}

/**
 * A file's thumbnail bytes, read with the viewer's token — but only for a file under the
 * client folder. Null when there is none, or the file is elsewhere.
 */
export async function readThumbnail(
  drive: Drive,
  accessToken: string,
  rootId: string,
  fileId: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const meta = await call(() => drive.files.get({ fileId, fields: "name,parents,thumbnailLink", ...SHARED }));
  if (!meta.thumbnailLink) return null;
  const parent = meta.parents?.[0];
  if (!parent) return null;
  const root = await readRoot(drive, rootId);
  if (!root || !(await crumbsTo(drive, root, parent))) return null;
  // Only Google's own image host — the link came from Drive, but the fetch runs on our server.
  let url: URL;
  try {
    url = new URL(meta.thumbnailLink);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/(^|\.)googleusercontent\.com$/.test(url.hostname)) return null;
  // Drive's links end in a size suffix (`=s220`); ask for one wide enough for a 2× row thumbnail.
  const sized = url.toString().replace(/=s\d+$/, "=s320");
  const res = await fetch(sized, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "error" });
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !/^image\/(png|jpeg|gif|webp)$/.test(contentType.split(";")[0].trim())) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) return null;
  return { bytes, contentType: contentType.split(";")[0].trim() };
}

/* ── a file's bytes, for the client's copy ── */

/** The most Foundry streams for one file. Larger ones open in Drive instead. */
export const FILE_MAX_BYTES = 100 * 1024 * 1024;

/** Google's own formats have no bytes of their own; they are exported. */
const EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/pdf", ext: "pdf" },
  "application/vnd.google-apps.presentation": { mime: "application/pdf", ext: "pdf" },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: "xlsx",
  },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: "png" },
};

/**
 * Types shown inline in the browser. Everything else is a download, so nothing from a Drive
 * folder can render as a page on Foundry's own origin.
 */
export const INLINE_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

/** What a file will be served as — `null` when Foundry won't serve it (a folder, a Form, too big). */
export function servedAs(
  mimeType: string,
  size: number | null,
  name: string,
): { mime: string; filename: string } | null {
  if (mimeType === FOLDER_MIME || mimeType === "application/vnd.google-apps.form") return null;
  const exported = EXPORTS[mimeType];
  if (exported) return { mime: exported.mime, filename: `${name.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.${exported.ext}` };
  if (mimeType.startsWith("application/vnd.google-apps.")) return null;
  if (size !== null && size > FILE_MAX_BYTES) return null;
  return { mime: mimeType || "application/octet-stream", filename: name };
}

/**
 * One file under the client folder, as a stream. Null when it isn't under the folder, or
 * isn't something Foundry serves.
 */
export async function readFileForClient(
  drive: Drive,
  rootId: string,
  fileId: string,
): Promise<{ body: ReadableStream<Uint8Array>; mime: string; filename: string } | null> {
  const meta = await call(() => drive.files.get({ fileId, fields: "name,mimeType,size,parents", ...SHARED }));
  const parent = meta.parents?.[0];
  if (!parent) return null;
  const root = await readRoot(drive, rootId);
  if (!root || !(await crumbsTo(drive, root, parent))) return null;
  const size = meta.size ? Number(meta.size) || null : null;
  const plan = servedAs(meta.mimeType ?? "", size, meta.name ?? "file");
  if (!plan) return null;
  const { Readable } = await import("node:stream");
  const res = EXPORTS[meta.mimeType ?? ""]
    ? await call(() =>
        drive.files.export({ fileId, mimeType: plan.mime }, { responseType: "stream" }) as Promise<{
          data: NodeJS.ReadableStream;
        }>,
      )
    : await call(() =>
        drive.files.get({ fileId, alt: "media", ...SHARED }, { responseType: "stream" }) as Promise<{
          data: NodeJS.ReadableStream;
        }>,
      );
  const body = Readable.toWeb(res as unknown as InstanceType<typeof Readable>) as unknown as ReadableStream<Uint8Array>;
  return { body, mime: plan.mime, filename: plan.filename };
}

/* ── one response shape for both readers ── */

/**
 * The whole card response for a reader. Every failure is a `state`, never a throw, so the
 * card always has something true to say. `fallback` is what a missing reader means: for the
 * team it is "connect your Google"; for the client it is "unavailable" (their problem is ours).
 */
export async function driveResponse(
  drive: Drive | null,
  input: {
    folderUrl: string | null;
    rootId: string | null;
    view: ClientDriveView;
    folder: string | null;
    missingReader: ClientDriveState;
    /** The client's copy: every reader failure collapses to "unavailable". */
    forClient?: boolean;
  },
): Promise<ClientDriveResponse> {
  const reply = (state: ClientDriveState, rest: Partial<ClientDriveResponse> = {}): ClientDriveResponse => ({
    state,
    folderUrl: input.forClient ? null : input.folderUrl,
    folderName: null,
    view: input.view,
    files: [],
    crumbs: [],
    partial: false,
    message: state === "ok" ? null : DRIVE_STATE_MESSAGE[state],
    ...rest,
  });
  if (!input.rootId) return reply("no_folder");
  if (!drive) return reply(input.missingReader);
  try {
    const result = await readClientDrive(drive, input.rootId, input.view, input.folder);
    if (!result) return reply("no_folder", { message: input.forClient ? null : "The Drive link on this client is a file, not a folder." });
    return reply("ok", result);
  } catch (err) {
    if (!(err instanceof DriveReadError)) throw err;
    return reply(input.forClient && err.state !== "error" ? "unavailable" : err.state);
  }
}
