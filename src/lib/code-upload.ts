/**
 * What a Code Handover version will accept from an upload: picked files, a dropped or
 * picked folder, or a .zip. Pure (no DOM), so the New version / Edit version popup and
 * the tests use the same rules.
 *
 * The limits mirror the server (`fileSchema` + `files.max(50)` in the versions routes), so
 * a file the popup accepts is never refused on save. Anything left out is reported with a
 * reason, never dropped silently.
 */

import { unzipSync } from "fflate";

/** Per-file limit, matching the server's `content: z.string().max(500_000)`. */
export const MAX_CODE_FILE_CHARS = 500_000;
/** Files per version, matching the server's `files: z.array(...).max(50)`. */
export const MAX_FILES_PER_VERSION = 50;
/** Filename limit, matching the server's `filename: z.string().max(200)`. */
export const MAX_FILENAME_CHARS = 200;

export interface DraftFile {
  filename: string;
  language: string;
  content: string;
}

export interface UploadEntry {
  /** Path inside the upload: a plain name, a folder-relative path, or a zip entry name. */
  path: string;
  bytes: Uint8Array;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface PreparedUpload {
  files: DraftFile[];
  skipped: SkippedFile[];
  /** System and build files left out on purpose (not worth listing one by one). */
  ignored: number;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  c: "c", h: "cpp", cpp: "cpp", cc: "cpp", hpp: "cpp", ino: "cpp", py: "python", js: "js", ts: "ts",
  tsx: "ts", jsx: "js", json: "json", swift: "swift", kt: "kotlin", java: "java", go: "go", rs: "rust",
  sh: "sh", yml: "yaml", yaml: "yaml", md: "md", txt: "",
};

export function languageFor(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return LANGUAGE_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? "";
}

/** Folders that hold tooling, dependencies or build output, never handed-over source. */
const JUNK_DIRS = new Set(["__MACOSX", ".git", "node_modules", ".pio", "build"]);
/** Files the OS writes next to everything. */
const JUNK_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Forward slashes, no leading "./" or "/", no empty segments. Null for a path that climbs out ("..") or is empty. */
export function normalisePath(raw: string): string | null {
  const parts = raw.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
  if (parts.length === 0 || parts.includes("..")) return null;
  return parts.join("/");
}

export function isJunkPath(path: string): boolean {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  if (JUNK_FILES.has(name) || name.startsWith("._")) return true;
  return parts.slice(0, -1).some((dir) => JUNK_DIRS.has(dir));
}

/**
 * Drop a single folder every path shares, so a zipped or picked "receiver-firmware/"
 * yields "src/radio.h", not "receiver-firmware/src/radio.h", and lines up with the names
 * the previous version used.
 */
export function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0) return paths;
  const first = paths.map((p) => p.split("/"));
  if (first.some((parts) => parts.length < 2)) return paths;
  const root = first[0][0];
  if (!first.every((parts) => parts[0] === root)) return paths;
  return first.map((parts) => parts.slice(1).join("/"));
}

/** Text or a reason it isn't usable. NUL bytes mean binary (a compiled .bin, an image). */
export function decodeTextFile(bytes: Uint8Array): { ok: true; content: string } | { ok: false; reason: string } {
  if (bytes.includes(0)) return { ok: false, reason: "not a text file" };
  const content = new TextDecoder("utf-8").decode(bytes);
  if (content.length > MAX_CODE_FILE_CHARS) return { ok: false, reason: "over 500,000 characters" };
  return { ok: true, content };
}

/** The entries inside a .zip, folders left out. Throws on a file that isn't a valid zip. */
export function zipEntries(bytes: Uint8Array): UploadEntry[] {
  const out = unzipSync(bytes);
  return Object.entries(out)
    .filter(([name]) => !name.endsWith("/"))
    .map(([path, data]) => ({ path, bytes: data }));
}

export function isZipName(name: string): boolean {
  return /\.zip$/i.test(name);
}

/** Turn raw upload entries into draft files, with everything left out accounted for. */
export function prepareUpload(entries: UploadEntry[]): PreparedUpload {
  const skipped: SkippedFile[] = [];
  let ignored = 0;
  const kept: UploadEntry[] = [];
  for (const e of entries) {
    const path = normalisePath(e.path);
    if (!path) {
      skipped.push({ path: e.path, reason: "not a usable path" });
      continue;
    }
    if (isJunkPath(path)) {
      ignored++;
      continue;
    }
    kept.push({ path, bytes: e.bytes });
  }
  const paths = stripCommonRoot(kept.map((e) => e.path));
  const files: DraftFile[] = [];
  const seen = new Set<string>();
  kept.forEach((e, i) => {
    const path = paths[i];
    if (path.length > MAX_FILENAME_CHARS) {
      skipped.push({ path, reason: "path longer than 200 characters" });
      return;
    }
    if (seen.has(path)) return;
    const decoded = decodeTextFile(e.bytes);
    if (!decoded.ok) {
      skipped.push({ path, reason: decoded.reason });
      return;
    }
    seen.add(path);
    files.push({ filename: path, language: languageFor(path), content: decoded.content });
  });
  return { files, skipped, ignored };
}

/**
 * Uploaded files replace drafts of the same name, keep the rest, and drop a blank starter
 * row. Returns at most MAX_FILES_PER_VERSION; anything past that is reported as skipped,
 * because the server would refuse the whole version otherwise.
 */
export function mergeDraftFiles(current: DraftFile[], incoming: DraftFile[]): { files: DraftFile[]; overLimit: string[] } {
  const byName = new Map(incoming.map((f) => [f.filename.trim(), f]));
  const kept = current
    .filter((f) => f.filename.trim() || f.content)
    .map((f) => byName.get(f.filename.trim()) ?? f);
  const keptNames = new Set(kept.map((f) => f.filename.trim()));
  const added = incoming.filter((f) => !keptNames.has(f.filename.trim()));
  const merged = [...kept, ...added];
  const overLimit = merged.slice(MAX_FILES_PER_VERSION).map((f) => f.filename);
  const files = merged.slice(0, MAX_FILES_PER_VERSION);
  return { files: files.length ? files : [{ filename: "", language: "", content: "" }], overLimit };
}

/** One plain sentence about an upload, or null when there's nothing worth saying. */
export function describeUpload(added: number, skipped: SkippedFile[], ignored: number, overLimit: string[]): string | null {
  const parts: string[] = [];
  if (added) parts.push(`Added ${added} file${added === 1 ? "" : "s"}. A file with the same name was replaced.`);
  if (skipped.length) {
    const shown = skipped.slice(0, 4).map((s) => `${s.path} (${s.reason})`);
    const more = skipped.length - shown.length;
    parts.push(`Skipped ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`);
  }
  if (overLimit.length) {
    parts.push(
      `Left out ${overLimit.length} file${overLimit.length === 1 ? "" : "s"} over the ${MAX_FILES_PER_VERSION}-file limit for a version.`,
    );
  }
  if (ignored) parts.push(`Ignored ${ignored} system or build file${ignored === 1 ? "" : "s"}.`);
  return parts.length ? parts.join(" ") : null;
}
