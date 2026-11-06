/**
 * Compare two versions of handed-over code, line by line. Pure and dependency-free, so the
 * wiki's Code Handover compare view, the "changes since" chip on each version and the
 * New version popup's live summary all run the same rules.
 *
 * Files are matched by filename. A file whose only change is its name is reported as
 * renamed. The line diff is Myers' O(ND) algorithm over interned lines, after trimming the
 * common start and end (which is where almost every real edit leaves most of the file).
 * When two files differ by more than `MAX_EDITS` lines the diff is not attempted: the file
 * is marked `tooLarge` and the counts come from a cheap line tally instead, which is said
 * in the UI. It never guesses an alignment it can't afford to compute.
 */

export interface DiffFileInput {
  filename: string;
  language?: string | null;
  content: string;
}

export type DiffOpKind = "same" | "add" | "del";

export interface DiffOp {
  kind: DiffOpKind;
  text: string;
  /** 1-based line in the old file (null for an added line). */
  oldNo: number | null;
  /** 1-based line in the new file (null for a removed line). */
  newNo: number | null;
  /** This line is the file's last and has no newline after it. */
  noEol?: boolean;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  ops: DiffOp[];
}

export type FileChangeStatus = "added" | "removed" | "modified" | "renamed" | "unchanged";

export interface FileChange {
  filename: string;
  /** Set for a rename: the name it had before. */
  oldFilename: string | null;
  language: string | null;
  status: FileChangeStatus;
  added: number;
  removed: number;
  /** Every line, in order. Null when the file was too different to diff. */
  ops: DiffOp[] | null;
  hunks: DiffHunk[];
  tooLarge: boolean;
  /** A plain sentence for anything the line counts don't show (line endings, final newline). */
  note: string | null;
}

export interface VersionComparison {
  files: FileChange[];
  added: number;
  removed: number;
  /** Files added, removed, renamed or modified. */
  changedFiles: number;
}

/** Above this many changed lines in one file, the line-by-line diff is not attempted. */
export const MAX_EDITS = 2000;
/** Unchanged lines kept either side of a change. */
export const CONTEXT_LINES = 3;

interface Lines {
  lines: string[];
  /** The text ended with a newline. */
  eol: boolean;
  /** The text used Windows line endings anywhere. */
  crlf: boolean;
}

export function splitLines(text: string): Lines {
  const crlf = text.includes("\r\n");
  const normal = text.replace(/\r\n?/g, "\n");
  if (normal === "") return { lines: [], eol: true, crlf };
  const eol = normal.endsWith("\n");
  const lines = (eol ? normal.slice(0, -1) : normal).split("\n");
  return { lines, eol, crlf };
}

function lineKey(line: string, ignoreWhitespace: boolean): string {
  return ignoreWhitespace ? line.replace(/\s+/g, " ").trim() : line;
}

/**
 * Myers' shortest edit script between two integer sequences. Returns null when more than
 * `maxEdits` insertions + deletions would be needed. Memory is O(D²) in the edits only,
 * because each step keeps just the diagonals it could have reached.
 */
function myers(a: Int32Array, b: Int32Array, maxEdits: number): DiffOpKind[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxEdits);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;

  for (let d = 0; d <= max && !found; d++) {
    // Snapshot the diagonals step d may read: [-(d+1), d+1].
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;

  const script: DiffOpKind[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const snap = trace[d];
    const at = (k: number) => snap[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      script.push("same");
      x--;
      y--;
    }
    if (d > 0) script.push(x === prevX ? "add" : "del");
    x = prevX;
    y = prevY;
  }
  return script.reverse();
}

/**
 * The line ops between two texts, or null when they're too different to diff.
 * The last line of a text with no final newline carries a marker in its comparison key,
 * so adding or removing that newline shows as a change to the line rather than vanishing.
 */
export function diffTexts(
  oldText: string,
  newText: string,
  opts: { ignoreWhitespace?: boolean; maxEdits?: number } = {},
): { ops: DiffOp[] | null; old: Lines; next: Lines } {
  const ignoreWhitespace = opts.ignoreWhitespace ?? false;
  const maxEdits = opts.maxEdits ?? MAX_EDITS;
  const old = splitLines(oldText);
  const next = splitLines(newText);

  const ids = new Map<string, number>();
  const intern = (src: Lines) =>
    Int32Array.from(src.lines, (line, i) => {
      let key = lineKey(line, ignoreWhitespace);
      if (!src.eol && i === src.lines.length - 1) key += "\u0000noeol";
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      return id;
    });
  const a = intern(old);
  const b = intern(next);

  // Trim the common start and end before running Myers on what's left.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const middle = myers(a.subarray(start, endA), b.subarray(start, endB), maxEdits);
  if (!middle) return { ops: null, old, next };

  const script: DiffOpKind[] = [
    ...new Array<DiffOpKind>(start).fill("same"),
    ...middle,
    ...new Array<DiffOpKind>(a.length - endA).fill("same"),
  ];
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  for (const kind of script) {
    if (kind === "same") {
      ops.push({
        kind,
        text: next.lines[j],
        oldNo: i + 1,
        newNo: j + 1,
        ...(!next.eol && j === next.lines.length - 1 ? { noEol: true } : {}),
      });
      i++;
      j++;
    } else if (kind === "del") {
      ops.push({ kind, text: old.lines[i], oldNo: i + 1, newNo: null, ...(!old.eol && i === old.lines.length - 1 ? { noEol: true } : {}) });
      i++;
    } else {
      ops.push({ kind, text: next.lines[j], oldNo: null, newNo: j + 1, ...(!next.eol && j === next.lines.length - 1 ? { noEol: true } : {}) });
      j++;
    }
  }
  return { ops, old, next };
}

/** Every old line removed, then every new line added. */
export function wholeFileReplace(oldText: string, newText: string): DiffOp[] {
  const old = splitLines(oldText);
  const next = splitLines(newText);
  return [
    ...old.lines.map((text, i): DiffOp => ({
      kind: "del",
      text,
      oldNo: i + 1,
      newNo: null,
      ...(!old.eol && i === old.lines.length - 1 ? { noEol: true } : {}),
    })),
    ...next.lines.map((text, j): DiffOp => ({
      kind: "add",
      text,
      oldNo: null,
      newNo: j + 1,
      ...(!next.eol && j === next.lines.length - 1 ? { noEol: true } : {}),
    })),
  ];
}

/** Group ops into hunks with `context` unchanged lines either side; close hunks merge. */
export function toHunks(ops: DiffOp[], context = CONTEXT_LINES): DiffHunk[] {
  const changed: number[] = [];
  ops.forEach((op, idx) => {
    if (op.kind !== "same") changed.push(idx);
  });
  if (changed.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  for (const idx of changed) {
    const lo = Math.max(0, idx - context);
    const hi = Math.min(ops.length - 1, idx + context);
    const last = ranges[ranges.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else ranges.push([lo, hi]);
  }

  return ranges.map(([lo, hi]) => {
    const slice = ops.slice(lo, hi + 1);
    // Where this hunk starts in each file: the first line number it carries, or the line
    // just before it when it only adds (git's convention, which `git apply` relies on).
    const before = ops.slice(0, lo);
    const oldBefore = before.filter((o) => o.kind !== "add").length;
    const newBefore = before.filter((o) => o.kind !== "del").length;
    const oldLines = slice.filter((o) => o.kind !== "add").length;
    const newLines = slice.filter((o) => o.kind !== "del").length;
    return {
      oldStart: oldLines === 0 ? oldBefore : oldBefore + 1,
      oldLines,
      newStart: newLines === 0 ? newBefore : newBefore + 1,
      newLines,
      ops: slice,
    };
  });
}

/** Rough added/removed counts from a line tally, used only when the diff is too large. */
function tally(oldLines: string[], newLines: string[], ignoreWhitespace: boolean): { added: number; removed: number } {
  const counts = new Map<string, number>();
  for (const l of oldLines) {
    const k = lineKey(l, ignoreWhitespace);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let added = 0;
  for (const l of newLines) {
    const k = lineKey(l, ignoreWhitespace);
    const c = counts.get(k) ?? 0;
    if (c > 0) counts.set(k, c - 1);
    else added++;
  }
  let removed = 0;
  for (const c of counts.values()) removed += c;
  return { added, removed };
}

function changeFor(
  filename: string,
  oldFilename: string | null,
  language: string | null,
  oldText: string | null,
  newText: string | null,
  opts: { ignoreWhitespace: boolean; maxEdits: number },
): FileChange {
  const { ops, old, next } = diffTexts(oldText ?? "", newText ?? "", opts);
  const added = ops ? ops.filter((o) => o.kind === "add").length : tally(old.lines, next.lines, opts.ignoreWhitespace).added;
  const removed = ops ? ops.filter((o) => o.kind === "del").length : tally(old.lines, next.lines, opts.ignoreWhitespace).removed;

  let status: FileChangeStatus;
  if (oldText === null) status = "added";
  else if (newText === null) status = "removed";
  else if (oldFilename && oldFilename !== filename) status = "renamed";
  else status = added || removed ? "modified" : "unchanged";

  let note: string | null = null;
  if (oldText !== null && newText !== null && added === 0 && removed === 0 && oldText !== newText) {
    if (old.crlf !== next.crlf) note = `Only the line endings changed (${next.crlf ? "now Windows" : "now Unix"}).`;
    else if (opts.ignoreWhitespace) note = "Only whitespace changed.";
  }

  return {
    filename,
    oldFilename: status === "renamed" ? oldFilename : null,
    language,
    status,
    added,
    removed,
    ops,
    hunks: ops ? toHunks(ops) : [],
    tooLarge: ops === null,
    note,
  };
}

const STATUS_ORDER: Record<FileChangeStatus, number> = { modified: 0, renamed: 1, added: 2, removed: 3, unchanged: 4 };

/**
 * Every file in either version, with what happened to it. Files are matched by name; a
 * removed file and an added file with identical contents are paired as a rename. Changed
 * files come first, in the order the new version lists them.
 */
export function compareVersions(
  fromFiles: DiffFileInput[],
  toFiles: DiffFileInput[],
  opts: { ignoreWhitespace?: boolean; maxEdits?: number } = {},
): VersionComparison {
  const o = { ignoreWhitespace: opts.ignoreWhitespace ?? false, maxEdits: opts.maxEdits ?? MAX_EDITS };
  const fromByName = new Map(fromFiles.map((f) => [f.filename.trim(), f]));
  const toNames = new Set(toFiles.map((f) => f.filename.trim()));

  const goneFiles = fromFiles.filter((f) => !toNames.has(f.filename.trim()));
  const newFiles = toFiles.filter((f) => !fromByName.has(f.filename.trim()));
  const renamedFrom = new Map<string, DiffFileInput>();
  for (const nf of newFiles) {
    const match = goneFiles.find(
      (g) => !renamedFrom.has(g.filename.trim()) && g.content.replace(/\r\n?/g, "\n") === nf.content.replace(/\r\n?/g, "\n"),
    );
    if (match) renamedFrom.set(match.filename.trim(), nf);
  }
  const renamedTo = new Map([...renamedFrom].map(([oldName, nf]) => [nf.filename.trim(), oldName]));

  const order = new Map<string, number>();
  const files: FileChange[] = [];
  toFiles.forEach((f, idx) => {
    const name = f.filename.trim();
    order.set(name, idx);
    const before = fromByName.get(name);
    const renamedFromName = renamedTo.get(name) ?? null;
    if (before) {
      files.push(changeFor(name, null, f.language ?? before.language ?? null, before.content, f.content, o));
    } else if (renamedFromName) {
      const old = fromByName.get(renamedFromName)!;
      files.push(changeFor(name, renamedFromName, f.language ?? null, old.content, f.content, o));
    } else {
      files.push(changeFor(name, null, f.language ?? null, null, f.content, o));
    }
  });
  goneFiles.forEach((g, idx) => {
    const name = g.filename.trim();
    if (renamedFrom.has(name)) return;
    order.set(name, toFiles.length + idx);
    files.push(changeFor(name, null, g.language ?? null, g.content, null, o));
  });

  files.sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || (order.get(x.filename) ?? 0) - (order.get(y.filename) ?? 0));

  const changed = files.filter((f) => f.status !== "unchanged");
  return {
    files,
    added: changed.reduce((s, f) => s + f.added, 0),
    removed: changed.reduce((s, f) => s + f.removed, 0),
    changedFiles: changed.length,
  };
}

/**
 * A unified patch (git's format) between two versions, so a developer can `git apply` it.
 * Always exact: whitespace is never ignored here, whatever the view is set to.
 */
export function unifiedPatch(fromFiles: DiffFileInput[], toFiles: DiffFileInput[]): string {
  const { files } = compareVersions(fromFiles, toFiles);
  const fromByName = new Map(fromFiles.map((f) => [f.filename.trim(), f.content]));
  const toByName = new Map(toFiles.map((f) => [f.filename.trim(), f.content]));
  const out: string[] = [];
  for (const f of files) {
    if (f.status === "unchanged") continue;
    // Too different to diff line by line: the patch replaces the whole file, which is
    // still exact, just not minimal.
    const hunks = f.tooLarge
      ? toHunks(wholeFileReplace(fromByName.get(f.oldFilename ?? f.filename) ?? "", toByName.get(f.filename) ?? ""))
      : f.hunks;
    const oldName = f.oldFilename ?? f.filename;
    out.push(`diff --git a/${oldName} b/${f.filename}`);
    if (f.status === "added") out.push("new file mode 100644", "--- /dev/null", `+++ b/${f.filename}`);
    else if (f.status === "removed") out.push("deleted file mode 100644", `--- a/${f.filename}`, "+++ /dev/null");
    else if (f.status === "renamed") {
      out.push("similarity index 100%", `rename from ${oldName}`, `rename to ${f.filename}`);
      if (hunks.length === 0) continue;
      out.push(`--- a/${oldName}`, `+++ b/${f.filename}`);
    } else out.push(`--- a/${f.filename}`, `+++ b/${f.filename}`);
    for (const h of hunks) {
      const range = (start: number, count: number) => (count === 1 ? `${start}` : `${start},${count}`);
      out.push(`@@ -${range(h.oldStart, h.oldLines)} +${range(h.newStart, h.newLines)} @@`);
      for (const op of h.ops) {
        out.push(`${op.kind === "add" ? "+" : op.kind === "del" ? "-" : " "}${op.text}`);
        if (op.noEol) out.push("\\ No newline at end of file");
      }
    }
  }
  return out.length ? `${out.join("\n")}\n` : "";
}

/**
 * The common start and end of two lines, so the part that actually changed can be
 * emphasised. Returns the length of each; the changed middle is what's between them.
 */
export function changedSpan(oldLine: string, newLine: string): { prefix: number; suffix: number } {
  let prefix = 0;
  const max = Math.min(oldLine.length, newLine.length);
  while (prefix < max && oldLine[prefix] === newLine[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldLine[oldLine.length - 1 - suffix] === newLine[newLine.length - 1 - suffix]
  ) {
    suffix++;
  }
  // Widen to whole words, so 9600 → 115200 reads as one changed number, not "96" → "1152".
  const word = (c: string | undefined) => c !== undefined && /\w/.test(c);
  while (prefix > 0 && word(oldLine[prefix - 1]) && (word(oldLine[prefix]) || word(newLine[prefix]))) prefix--;
  while (
    suffix > 0 &&
    word(oldLine[oldLine.length - suffix]) &&
    (word(oldLine[oldLine.length - suffix - 1]) || word(newLine[newLine.length - suffix - 1]))
  ) {
    suffix--;
  }
  return { prefix, suffix };
}

/**
 * Whether to emphasise the changed middle of a line. Only when the two lines share
 * something besides indentation: a rewritten line would otherwise light up end to end,
 * which says nothing the row colour doesn't.
 */
export function worthEmphasising(oldLine: string, newLine: string): boolean {
  const { prefix, suffix } = changedSpan(oldLine, newLine);
  const indent = Math.min(oldLine.length - oldLine.trimStart().length, newLine.length - newLine.trimStart().length);
  return Math.max(0, prefix - indent) + suffix > 0;
}

/**
 * Pairs each removed line with the added line in the same position of a change block
 * (a run of removals followed by a run of additions), for in-line emphasis. Returns a map
 * from an op's index to its partner's index.
 */
export function pairChangedLines(ops: DiffOp[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let i = 0;
  while (i < ops.length) {
    if (ops[i].kind !== "del") {
      i++;
      continue;
    }
    const dels: number[] = [];
    while (i < ops.length && ops[i].kind === "del") dels.push(i++);
    const adds: number[] = [];
    while (i < ops.length && ops[i].kind === "add") adds.push(i++);
    for (let p = 0; p < Math.min(dels.length, adds.length); p++) {
      pairs.set(dels[p], adds[p]);
      pairs.set(adds[p], dels[p]);
    }
  }
  return pairs;
}

/** The version created just before this one, by date. Null for the first. */
export function previousVersionOf<T extends { id: string; createdAt: string }>(versions: T[], id: string): T | null {
  const sorted = [...versions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const idx = sorted.findIndex((v) => v.id === id);
  return idx > 0 ? sorted[idx - 1] : null;
}

/** "2 files · +12 −3", or "No changes". */
export function summariseComparison(c: Pick<VersionComparison, "changedFiles" | "added" | "removed">): string {
  if (c.changedFiles === 0) return "No changes";
  return `${c.changedFiles} file${c.changedFiles === 1 ? "" : "s"} · +${c.added} −${c.removed}`;
}
