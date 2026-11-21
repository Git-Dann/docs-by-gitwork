/**
 * One reader for the ~156 tests that assert on source text.
 *
 * Those sweeps are this repo's main structural guard, and they keep failing for the wrong
 * reason: a test greps for a string and matches its own ⚠️ comment, or CLAUDE.md's prose,
 * rather than code. Four instances in one PR last week (CLAUDE.md §42.16).
 *
 * 23 tests already strip comments first — in EIGHT different implementations that disagree
 * on four cases:
 *
 *   a greedy "slash slash to end of line"   corrupts a `https://…` that is really in the code
 *   a "whole line only" line-comment rule    leaves a trailing `foo() // prisma` in place
 *   neither of the above                     leaves a JSX comment in place
 *   all of them                              mangle a regex literal containing an escaped slash
 *
 * `stripComments` below is a character scanner, not a regex, because the distinction between
 * "a comment" and "two slashes inside a string or a regex" is not a regular language. It
 * blanks what it removes rather than deleting it, so every offset and line number survives —
 * the same trick `scripts/audit-ui-standards.mjs` uses.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = process.cwd();

/** Replace every character with a space, keeping newlines so line numbers do not move. */
function blank(text: string): string {
  let out = "";
  for (const ch of text) out += ch === "\n" ? "\n" : " ";
  return out;
}

const REGEX_CAN_FOLLOW = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/;

/**
 * Strip line and block comments (including JSX `{\/* … *\/}`) from TypeScript source,
 * leaving strings, template literals and regex literals untouched.
 *
 * ⚠️ Not a parser. Where it cannot tell, it keeps the code: an unterminated string or regex
 * (one that would have to span a newline) is rewound and treated as ordinary characters,
 * so the worst case is a comment that survives, never code that silently disappears.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  // The last non-whitespace character emitted as code. A `/` after `=` or `(` opens a regex;
  // a `/` after an identifier or `)` is division.
  let prev = "";
  let mode: "code" | "template" = "code";
  // Brace depth recorded at each open `${`, so we know which `}` closes the interpolation.
  const tplBrace: number[] = [];
  let brace = 0;

  const startsRegex = (): boolean => {
    if (prev === "") return true;
    if (REGEX_CAN_FOLLOW.has(prev)) return true;
    return REGEX_KEYWORDS.test(out.trimEnd());
  };

  while (i < src.length) {
    const c = src[i];

    if (mode === "template") {
      if (c === "\\") {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === "`") {
        out += c;
        prev = "`";
        mode = "code";
        i += 1;
        continue;
      }
      // An interpolation is ordinary code again — including any comment inside it.
      if (c === "$" && src[i + 1] === "{") {
        out += "${";
        tplBrace.push(brace);
        prev = "{";
        mode = "code";
        i += 2;
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    const d = src[i + 1];

    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }

    if (c === "/" && d === "/") {
      let end = src.indexOf("\n", i);
      if (end === -1) end = src.length;
      out += blank(src.slice(i, end));
      i = end;
      continue;
    }

    if (c === '"' || c === "'") {
      const end = scanQuoted(src, i, c);
      if (end !== -1) {
        out += src.slice(i, end);
        prev = c;
        i = end;
        continue;
      }
      // Unterminated before a newline — not a string after all, so fall through and keep it.
    }

    if (c === "`") {
      out += c;
      mode = "template";
      i += 1;
      continue;
    }

    if (c === "/" && startsRegex()) {
      const end = scanRegex(src, i);
      if (end !== -1) {
        out += src.slice(i, end);
        prev = "/";
        i = end;
        continue;
      }
      // Unterminated before a newline — division, or a stray slash.
    }

    if (c === "{") {
      brace += 1;
    } else if (c === "}") {
      if (tplBrace.length > 0 && brace === tplBrace[tplBrace.length - 1]) {
        tplBrace.pop();
        out += c;
        mode = "template";
        i += 1;
        continue;
      }
      brace -= 1;
    }

    out += c;
    if (!/\s/.test(c)) prev = c;
    i += 1;
  }

  return out;
}

/** End index (exclusive) of a quoted string starting at `start`, or -1 if it runs past a newline. */
function scanQuoted(src: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") return -1;
    if (c === quote) return i + 1;
    i += 1;
  }
  return -1;
}

/** End index (exclusive) of a regex literal (flags included), or -1 if it runs past a newline. */
function scanRegex(src: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") return -1;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i += 1;
      while (i < src.length && /[a-z]/.test(src[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return -1;
}

export type ReadOptions = {
  /** "strip" (the default) removes comments; "keep" returns the file verbatim. */
  comments?: "strip" | "keep";
};

/** Read a repo-relative (or absolute) file, comments stripped unless asked otherwise. */
export function readSource(path: string, opts: ReadOptions = {}): string {
  const text = readFileSync(resolve(REPO_ROOT, path), "utf8");
  return opts.comments === "keep" ? text : stripComments(text);
}

export type WalkOptions = {
  /** File suffixes to return. Default: `.ts` and `.tsx`. */
  ext?: readonly string[];
  /** Directory names to skip. Default: `node_modules` and `__tests__`. */
  skip?: readonly string[];
};

const DEFAULT_SKIP = ["node_modules", "__tests__"] as const;

/** Every matching file under `dir`, recursively. Paths are absolute. */
export function walkSource(dir: string, opts: WalkOptions = {}): string[] {
  const ext = opts.ext ?? [".ts", ".tsx"];
  const skip = new Set(opts.skip ?? DEFAULT_SKIP);
  const out: string[] = [];
  const root = resolve(REPO_ROOT, dir);

  const walk = (d: string) => {
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) {
        if (!skip.has(entry)) walk(p);
      } else if (ext.some((e) => entry.endsWith(e))) {
        out.push(p);
      }
    }
  };

  walk(root);
  return out;
}

/** Every `route.ts` under `dir`, recursively. */
export function routeFiles(dir: string): string[] {
  return walkSource(dir, { ext: ["route.ts"] });
}

export type Handler = { method: string; body: string };

const HANDLER_SPLIT = /(?=export async function (?:GET|POST|PUT|PATCH|DELETE|HEAD)\b)/;
const HANDLER_NAME = /^export async function (GET|POST|PUT|PATCH|DELETE|HEAD)\b/;

/**
 * Split a route file into its exported handlers.
 *
 * ⚠️ Assert per handler, never per file: 63 of the ungated route files export more than one,
 * so a file-level grep hides an ungated GET behind a gated POST.
 */
export function handlers(src: string): Handler[] {
  // ⚠️ No .slice(1) here. String.split with a zero-width lookahead emits NO leading empty
  // string when the match is at index 0, so slicing drops the first handler of any file that
  // opens with one. Filtering on the method is correct either way.
  const fns = src
    .split(HANDLER_SPLIT)
    .map((body) => ({ method: HANDLER_NAME.exec(body)?.[1] ?? "", body }))
    .filter((h) => h.method !== "");

  // ⚠️ `export const GET = ping;` is a handler too, and a splitter that only knows
  // `export async function` cannot see it — which makes the route invisible to every sweep
  // built on this, and an invisible route is an ungated one. The logic lives in a named
  // function above, so the whole file is the body.
  const consts = [...src.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE|HEAD)\s*=/gm)]
    .map((m) => ({ method: m[1], body: src }))
    .filter((c) => !fns.some((f) => f.method === c.method));

  return [...fns, ...consts];
}

/** Anything above the first handler: imports, constants and any module-scope guard. */
export function preamble(src: string): string {
  const first = src.split(HANDLER_SPLIT)[0] ?? "";
  return HANDLER_NAME.test(first) ? "" : first;
}

/**
 * Fail loudly when a walk finds less than it should.
 *
 * Seven sweeps hand-roll this. Without it a renamed directory leaves the test asserting over
 * an empty array — passing, for ever.
 */
export function sawFiles<T>(files: T[], atLeast: number, what: string): T[] {
  if (files.length < atLeast) {
    throw new Error(
      `${what}: found ${files.length}, expected at least ${atLeast}. The walk is broken, ` +
        `and this sweep would pass for ever.`,
    );
  }
  return files;
}

export type GrepHit = { file: string; line: number; code: string };

export type GrepOptions = {
  /** Pathspecs passed to git. Default: `*.ts` and `*.tsx`. */
  pathspec?: readonly string[];
  /** Repo-relative paths to drop from the result — pass `here(import.meta.url)` for the test itself. */
  exclude?: readonly string[];
  /** Drop hits whose line is only a comment. Default true. */
  skipComments?: boolean;
};

/**
 * `git grep -nE` over TRACKED files.
 *
 * ⚠️ Tracked is the point, and the trap: a sweep run before its own file is committed does not
 * see itself, then matches itself the moment it lands. Pass `exclude: [here(import.meta.url)]`.
 * ⚠️ The pathspec is the other trap: without it the sweep reads Markdown too, and fails the
 * moment CLAUDE.md describes the bug the sweep exists to catch.
 */
export function gitGrep(pattern: string, opts: GrepOptions = {}): GrepHit[] {
  const pathspec = opts.pathspec ?? ["*.ts", "*.tsx"];
  let raw = "";
  try {
    raw = execFileSync("git", ["grep", "-n", "-E", pattern, "--", ...pathspec], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (err) {
    // git grep exits 1 when nothing matched. Anything else is a real failure.
    const e = err as { status?: number };
    if (e.status === 1) return [];
    throw err;
  }

  const exclude = new Set(opts.exclude ?? []);
  const skipComments = opts.skipComments !== false;

  return raw
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const m = /^([^:]+):(\d+):(.*)$/.exec(row);
      return m ? { file: m[1], line: Number(m[2]), code: m[3].trim() } : null;
    })
    .filter((hit): hit is GrepHit => hit !== null)
    .filter((hit) => !exclude.has(hit.file))
    .filter((hit) => !skipComments || !/^(\/\/|\/\*|\*)/.test(hit.code));
}

/** The repo-relative path of the calling file. `here(import.meta.url)`. */
export function here(importMetaUrl: string): string {
  return relative(REPO_ROOT, fileURLToPath(importMetaUrl));
}
