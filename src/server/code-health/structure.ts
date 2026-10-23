import { posix } from "node:path";
import type { CodeLanguage, DependencyCycle, FileMeasure, HubModule, StructureReport } from "@/types/code-health";

/**
 * Structural coupling: the import graph the code itself declares.
 *
 * Deterministic and pure. Imports are read from the source text (comments stripped,
 * string literals masked so an import inside a string is never read as one), resolved
 * to tracked files, and the graph is measured for cycles, hubs and depth.
 *
 * This reads text, not a syntax tree, so it is an approximation of each language's real
 * module resolution. Where a specifier looks like it belongs to the repository but no
 * file can be found, it is counted as unresolved and reported as a share, so a thin
 * graph is visible as thin rather than read as "loosely coupled".
 */

// ---------------------------------------------------------------------------------------
// Lexing: comments out, strings masked
// ---------------------------------------------------------------------------------------

interface LexStyle {
  /** `//` line comments. */
  slash: boolean;
  /** `#` line comments. */
  hash: boolean;
  /** `/* … *\/` block comments. */
  block: boolean;
  /** Block comments nest (Kotlin, Dart, Swift). */
  nested: boolean;
  /** Backtick strings (JS template literals, Go raw strings). */
  backtick: boolean;
  /** Backslash escapes inside backtick strings (JS yes, Go raw strings no). */
  backtickEscapes: boolean;
  /** `"""` / `'''` multi-line strings. */
  triple: boolean;
  /** Ruby `=begin … =end`. */
  rubyBlock: boolean;
  /** PHP 8 `#[Attribute]` is code, not a comment. */
  phpAttr: boolean;
}

const C_LIKE: LexStyle = { slash: true, hash: false, block: true, nested: false, backtick: false, backtickEscapes: false, triple: false, rubyBlock: false, phpAttr: false };
const JS_STYLE: LexStyle = { ...C_LIKE, backtick: true, backtickEscapes: true };

const STYLE: Record<CodeLanguage, LexStyle> = {
  typescript: JS_STYLE,
  tsx: JS_STYLE,
  javascript: JS_STYLE,
  java: { ...C_LIKE, triple: true },
  kotlin: { ...C_LIKE, nested: true, triple: true },
  swift: { ...C_LIKE, nested: true, triple: true },
  dart: { ...C_LIKE, nested: true, triple: true },
  go: { ...C_LIKE, backtick: true },
  php: { ...C_LIKE, hash: true, phpAttr: true },
  python: { ...C_LIKE, slash: false, block: false, hash: true, triple: true },
  ruby: { ...C_LIKE, slash: false, block: false, hash: true, rubyBlock: true },
};

/** A masked string literal in the lexed text: \u0001<index>\u0002. */
const STR = "\\u0001(\\d+)\\u0002";

export interface Lexed {
  /** The source with comments removed and every string literal replaced by a placeholder. */
  masked: string;
  /** Decoded value of each string literal, by placeholder index. */
  strings: string[];
  /** The literal exactly as written, quotes included, by placeholder index. */
  raw: string[];
}

/**
 * Strip comments and mask strings. Strings are lexed before comments, so a `//` inside
 * a URL literal does not start a comment, and an `import "x"` inside a string literal
 * becomes a placeholder that no import pattern can match.
 *
 * Known limit: a JS regex literal containing a quote (`/"/g`) opens a string that runs
 * to the end of that line. A bare newline closes a single-line literal, so the damage
 * is confined to the one line.
 */
export function lexSource(source: string, language: CodeLanguage): Lexed {
  const st = STYLE[language];
  const strings: string[] = [];
  const raw: string[] = [];
  let out = "";
  let i = 0;
  const n = source.length;

  const pushString = (start: number, stop: number, delim: number) => {
    const text = source.slice(start, stop);
    const closed = text.length >= delim * 2 && text.slice(-delim) === text.slice(0, delim);
    const inner = text.slice(delim, closed ? text.length - delim : text.length).replace(/\n$/, "");
    raw.push(text);
    strings.push(inner.replace(/\\(.)/g, "$1"));
    out += `\u0001${strings.length - 1}\u0002`;
    // Keep the line structure for patterns anchored to a line start.
    const newlines = text.split("\n").length - 1;
    if (newlines) out += "\n".repeat(newlines);
  };

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (st.rubyBlock && c === "=" && (i === 0 || source[i - 1] === "\n") && source.startsWith("=begin", i)) {
      const end = source.indexOf("\n=end", i);
      const stop = end === -1 ? n : (source.indexOf("\n", end + 5) === -1 ? n : source.indexOf("\n", end + 5));
      out += "\n".repeat(source.slice(i, stop).split("\n").length - 1);
      i = stop;
      continue;
    }

    if (st.triple && (source.startsWith('"""', i) || source.startsWith("'''", i))) {
      const delim = source.slice(i, i + 3);
      const end = source.indexOf(delim, i + 3);
      const stop = end === -1 ? n : end + 3;
      pushString(i, stop, 3);
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || (st.backtick && c === "`")) {
      const isBacktick = c === "`";
      const escapes = !isBacktick || st.backtickEscapes;
      let j = i + 1;
      while (j < n) {
        if (escapes && source[j] === "\\") { j += 2; continue; }
        if (source[j] === c) { j++; break; }
        // An unterminated single-line literal must not swallow the rest of the file.
        if (!isBacktick && source[j] === "\n") break;
        j++;
      }
      pushString(i, Math.min(j, n), 1);
      i = Math.min(j, n);
      continue;
    }

    if (st.slash && c === "/" && next === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }

    if (st.hash && c === "#" && !(st.phpAttr && next === "[")) {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }

    if (st.block && c === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (st.nested && source.startsWith("/*", i)) { depth++; i += 2; }
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else { if (source[i] === "\n") out += "\n"; i++; }
      }
      out += " ";
      continue;
    }

    out += c;
    i++;
  }
  return { masked: out, strings, raw };
}

// ---------------------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------------------

const re = (src: string, flags = "g") => new RegExp(src.replace(/STR/g, STR), flags);

const JS_PATTERNS = [
  // import x from "y", import { a, type b } from "y", import * as ns from "y". NOT `import type`:
  // TypeScript erases it, so it is no runtime dependency and cannot make a runtime cycle.
  re(String.raw`(?<![.\w$])import\s+(?!type\s+(?!from\b)[\w$\{*])(?:[\w$]+\s*,?\s*)?(?:\*\s*as\s+[\w$]+|\{[^}]*\})?\s*from\s*STR`),
  // import "y" (side effects only)
  re(String.raw`(?<![.\w$])import\s*STR`),
  // export * from "y", export * as ns from "y", export { a } from "y". NOT `export type … from`.
  re(String.raw`(?<![.\w$])export\s+(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*STR`),
  // require("y"), and TS's import x = require("y")
  re(String.raw`(?<![.\w$])require\s*\(\s*STR\s*\)`),
  // import("y") with a literal; a computed specifier cannot be resolved and is skipped
  re(String.raw`(?<![.\w$])import\s*\(\s*STR\s*[,)]`),
];

/**
 * The import specifiers in one file, in order of first appearance, de-duplicated.
 *
 * Type-only imports (`import type`, `export type … from`) are left out. TypeScript erases
 * them, so they never load a module, and a loop made only of them is not a cycle anything
 * can trip over at runtime. Counting them reported large "cycles" in well-structured
 * libraries (zod's v4 core) that are type references between files, nothing more. An
 * `import { type A, b }` still counts: `b` is a value.
 *
 * Python from-imports are reported as `module:name` (`from ..core import config` is
 * `..core:config`), because `name` may be a submodule or a symbol and the resolver needs
 * to know which part is which. `from x import *` is just `x`.
 */
export function extractImports(path: string, language: CodeLanguage, source: string): string[] {
  // Swift imports name modules (`import UIKit`, `import MyFeature`), not files, and
  // every file in a module sees every other without an import. There is nothing in the
  // text to resolve to a file, so Swift contributes no edges.
  if (language === "swift") return [];

  const { masked, strings } = lexSource(source, language);
  const found: string[] = [];
  const add = (s: string | undefined) => {
    const v = s?.trim();
    if (v && !found.includes(v)) found.push(v);
  };
  const str = (idx: string) => strings[Number(idx)];

  switch (language) {
    case "typescript":
    case "tsx":
    case "javascript": {
      const hits: { at: number; spec: string }[] = [];
      for (const p of JS_PATTERNS) for (const m of masked.matchAll(p)) hits.push({ at: m.index ?? 0, spec: str(m[1]) });
      hits.sort((a, b) => a.at - b.at).forEach((h) => add(h.spec));
      break;
    }
    case "python": {
      // Module-level imports only (column 0). An indented import runs inside a function,
      // or under `if TYPE_CHECKING:`, and that is exactly how Python code breaks a cycle on
      // purpose: it never runs at load time. Counting it reported httpie's deliberate lazy
      // imports as cycles. The cost: an internal import inside a module-level `try:` is
      // missed too, which can only under-report a cycle, never invent one.
      const hits: { at: number; specs: string[] }[] = [];
      for (const m of masked.matchAll(/^from[ \t]+(\.+[\w.]*|[\w.]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n;]*(?:\\\n[^\n;]*)*)/gm)) {
        const base = m[1];
        const names = pythonNames(m[2]);
        const specs = names.includes("*") || names.length === 0
          ? [base]
          : names.map((name) => `${base}:${name}`);
        hits.push({ at: m.index ?? 0, specs });
      }
      for (const m of masked.matchAll(/^import[ \t]+([^\n;]*(?:\\\n[^\n;]*)*)/gm)) {
        hits.push({ at: m.index ?? 0, specs: pythonNames(m[1]) });
      }
      hits.sort((a, b) => a.at - b.at).forEach((h) => h.specs.forEach(add));
      break;
    }
    case "go": {
      const hits: { at: number; spec: string }[] = [];
      for (const m of masked.matchAll(/(?<![\w.])import[ \t]*\(([^)]*)\)/g)) {
        for (const s of m[1].matchAll(re(STR))) hits.push({ at: (m.index ?? 0) + (s.index ?? 0), spec: str(s[1]) });
      }
      for (const m of masked.matchAll(re(String.raw`(?<![\w.])import[ \t]+(?:[\w.]+[ \t]+)?STR`))) hits.push({ at: m.index ?? 0, spec: str(m[1]) });
      hits.sort((a, b) => a.at - b.at).forEach((h) => add(h.spec));
      break;
    }
    case "java":
    case "kotlin": {
      for (const m of masked.matchAll(/^[ \t]*import[ \t]+(static[ \t]+)?(\w+(?:\.\w+)*(?:\.\*)?)/gm)) {
        let name = m[2];
        if (m[1]) {
          // import static a.b.C.member / a.b.C.* : the dependency is the class C.
          name = name.endsWith(".*") ? name.slice(0, -2) : name.slice(0, name.lastIndexOf("."));
        }
        add(name);
      }
      break;
    }
    case "php": {
      const hits: { at: number; specs: string[] }[] = [];
      for (const m of masked.matchAll(/^[ \t]*use[ \t]+(?:function[ \t]+|const[ \t]+)?([^;]+);/gm)) {
        hits.push({ at: m.index ?? 0, specs: phpUseNames(m[1]) });
      }
      const req = re(String.raw`(?<![\w$>:])(?:require|include)(?:_once)?\b[ \t]*\(?[ \t]*(__DIR__[ \t]*\.[ \t]*|dirname\(__FILE__\)[ \t]*\.[ \t]*)?STR`);
      for (const m of masked.matchAll(req)) {
        const s = str(m[2]);
        // `__DIR__ . '/x.php'` is relative to this file; mark it so the resolver knows.
        hits.push({ at: m.index ?? 0, specs: [m[1] && s.startsWith("/") ? `.${s}` : s] });
      }
      hits.sort((a, b) => a.at - b.at).forEach((h) => h.specs.forEach(add));
      break;
    }
    case "dart": {
      // import / export / part 'x.dart'. `part of` names the library it belongs to,
      // which is the same edge the other way round, so it is not read.
      for (const m of masked.matchAll(re(String.raw`(?<![\w.])(?:import|export|part)[ \t]+STR`))) add(str(m[1]));
      break;
    }
    case "ruby": {
      for (const m of masked.matchAll(re(String.raw`(?<![\w.])(require_relative|require)\b[ \t]*\(?[ \t]*STR`))) {
        const s = str(m[2]);
        // require_relative is always file-relative; mark it so the resolver can tell.
        add(m[1] === "require_relative" && !s.startsWith(".") && !s.startsWith("/") ? `./${s}` : s);
      }
      break;
    }
  }
  void path;
  return found;
}

function pythonNames(list: string): string[] {
  return list
    .replace(/\\\n/g, " ")
    .replace(/[()]/g, " ")
    .split(",")
    .map((x) => x.trim().match(/^([\w.]+|\*)/)?.[1] ?? "")
    .filter(Boolean);
}

function phpUseNames(body: string): string[] {
  const clean = (s: string) => s.trim().replace(/^(?:function|const)\s+/, "").replace(/\s+as\s+\w+$/i, "").replace(/^\\/, "").trim();
  const valid = (s: string) => /^[\w\\]+$/.test(s);
  const brace = body.indexOf("{");
  if (brace >= 0) {
    const prefix = clean(body.slice(0, brace)).replace(/\\$/, "");
    const inner = body.slice(brace + 1, body.lastIndexOf("}") >= 0 ? body.lastIndexOf("}") : undefined);
    return inner.split(",").map(clean).filter(valid).map((x) => `${prefix}\\${x}`).filter(valid);
  }
  return body.split(",").map(clean).filter(valid);
}

// ---------------------------------------------------------------------------------------
// Repository configuration
// ---------------------------------------------------------------------------------------

export interface TsPathConfig {
  /** Directory of the tsconfig/jsconfig, repo-relative ("" for the root). */
  dir: string;
  /** compilerOptions.baseUrl resolved to a repo-relative directory, or null. */
  baseUrl: string | null;
  /** compilerOptions.paths, with targets already resolved to repo-relative templates. */
  paths: { pattern: string; targets: string[] }[];
}

export interface RepoImportConfig {
  /** One entry per directory holding a tsconfig.json / jsconfig.json (or a sibling tsconfig.*.json). */
  ts: TsPathConfig[];
  /** go.mod `module` lines: imports starting with `module` map into `dir`. */
  goModules: { dir: string; module: string }[];
  /** composer.json autoload / autoload-dev `psr-4`: namespace prefix (no trailing \) to directories. */
  psr4: { prefix: string; dirs: string[] }[];
  /** pubspec.yaml `name:`: `package:<name>/x` maps to `<dir>lib/x`. */
  dartPackages: { dir: string; name: string }[];
}

const TS_CONFIG_FILE = /(^|\/)(tsconfig|jsconfig)(\.[\w-]+)?\.json$/;
const IGNORED_DIR = /(^|\/)(node_modules|vendor|\.git|bower_components)\//;

const dirOf = (p: string) => {
  const d = posix.dirname(p);
  return d === "." ? "" : d;
};
const joinRel = (...parts: string[]) => {
  const j = posix.normalize(posix.join(...parts.filter((x) => x !== "")));
  return j === "." ? "" : j.replace(/^\.\//, "").replace(/\/$/, "");
};

/** JSON with comments and trailing commas, as tsconfig allows. Null when unreadable. */
export function parseJsonc(text: string): unknown {
  const { masked, raw } = lexSource(text, "javascript");
  const noTrailing = masked.replace(/,(\s*[}\]])/g, "$1");
  const restored = noTrailing.replace(/\u0001(\d+)\u0002/g, (_, i) => {
    const r = raw[Number(i)];
    // JSON only has double-quoted strings; re-quote anything else rather than fail.
    return r.startsWith('"') ? r : JSON.stringify(r.slice(1, -1));
  });
  try {
    return JSON.parse(restored);
  } catch {
    return null;
  }
}

type CompilerOpts = { baseUrl?: string; paths?: Record<string, string[]> };

/** Read a tsconfig, following relative `extends` (a few levels). Each option keeps the dir it came from. */
function readTsOptions(read: (p: string) => string | null, path: string, depth = 0): { baseUrl?: { v: string; dir: string }; paths?: { v: Record<string, string[]>; dir: string } } {
  const text = read(path);
  if (text === null || depth > 4) return {};
  const json = parseJsonc(text) as { extends?: string | string[]; compilerOptions?: CompilerOpts } | null;
  if (!json || typeof json !== "object") return {};
  const dir = dirOf(path);
  let inherited: ReturnType<typeof readTsOptions> = {};
  const ext = Array.isArray(json.extends) ? json.extends : json.extends ? [json.extends] : [];
  for (const e of ext) {
    // Only relative extends can be followed; a package (`@tsconfig/next`) is not in the repo.
    if (typeof e !== "string" || !e.startsWith(".")) continue;
    const target = joinRel(dir, e.endsWith(".json") ? e : `${e}.json`);
    inherited = { ...inherited, ...readTsOptions(read, target, depth + 1) };
  }
  const co = json.compilerOptions ?? {};
  return {
    baseUrl: typeof co.baseUrl === "string" ? { v: co.baseUrl, dir } : inherited.baseUrl,
    paths: co.paths && typeof co.paths === "object" ? { v: co.paths, dir } : inherited.paths,
  };
}

/**
 * Read the config files that change how imports resolve. `read` returns a file's
 * contents or null; `files` is every tracked path. Reads, at any depth (vendored trees
 * excluded): tsconfig.json / jsconfig.json (plus sibling tsconfig.*.json when the main
 * one has no paths, the Vite "solution" layout), go.mod, composer.json, pubspec.yaml.
 */
export function buildImportConfig(read: (path: string) => string | null, files: string[]): RepoImportConfig {
  const config: RepoImportConfig = { ts: [], goModules: [], psr4: [], dartPackages: [] };
  const usable = files.filter((f) => !IGNORED_DIR.test(f));

  const tsByDir = new Map<string, string[]>();
  for (const f of usable) {
    if (!TS_CONFIG_FILE.test(f)) continue;
    const d = dirOf(f);
    tsByDir.set(d, [...(tsByDir.get(d) ?? []), f]);
  }
  for (const [dir, list] of [...tsByDir.entries()].slice(0, 200)) {
    // The plain tsconfig.json / jsconfig.json first; siblings only fill in what it lacks.
    const rank = (f: string) => (/^(ts|js)config\.json$/.test(posix.basename(f)) ? 0 : 1);
    const ordered = [...list].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    let baseUrl: string | null = null;
    let paths: TsPathConfig["paths"] = [];
    for (const f of ordered) {
      const o = readTsOptions(read, f);
      const bu = o.baseUrl ? joinRel(o.baseUrl.dir, o.baseUrl.v) : null;
      if (baseUrl === null && bu !== null) baseUrl = bu;
      if (paths.length === 0 && o.paths) {
        // Targets are relative to baseUrl when set, else to the config that declared them.
        const root = bu ?? o.paths.dir;
        paths = Object.entries(o.paths.v)
          .filter(([, t]) => Array.isArray(t))
          .map(([pattern, targets]) => ({ pattern, targets: targets.filter((t) => typeof t === "string").map((t) => joinRel(root, t)) }));
      }
      if (baseUrl !== null && paths.length) break;
    }
    config.ts.push({ dir, baseUrl, paths });
  }
  config.ts.sort((a, b) => b.dir.length - a.dir.length);

  for (const f of usable) {
    const base = posix.basename(f);
    if (base === "go.mod") {
      const m = read(f)?.match(/^module\s+"?([^\s"]+)"?/m);
      if (m) config.goModules.push({ dir: dirOf(f), module: m[1] });
    } else if (base === "composer.json") {
      const json = parseJsonc(read(f) ?? "") as Record<string, { "psr-4"?: Record<string, string | string[]> }> | null;
      for (const key of ["autoload", "autoload-dev"]) {
        const psr = json?.[key]?.["psr-4"];
        if (!psr || typeof psr !== "object") continue;
        for (const [prefix, d] of Object.entries(psr)) {
          const dirs = (Array.isArray(d) ? d : [d]).filter((x) => typeof x === "string").map((x) => joinRel(dirOf(f), x));
          config.psr4.push({ prefix: prefix.replace(/\\+$/, ""), dirs });
        }
      }
    } else if (base === "pubspec.yaml") {
      const m = read(f)?.match(/^name:\s*['"]?([\w]+)/m);
      if (m) config.dartPackages.push({ dir: dirOf(f), name: m[1] });
    }
  }
  config.goModules.sort((a, b) => b.module.length - a.module.length);
  config.psr4.sort((a, b) => b.prefix.length - a.prefix.length);
  return config;
}

// ---------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------

type Resolution = { kind: "external" } | { kind: "internal"; targets: string[] };
const EXTERNAL: Resolution = { kind: "external" };
const internal = (targets: string[]): Resolution => ({ kind: "internal", targets });

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
/** NodeNext: a `.js` specifier names the emitted file, so the source is the `.ts` beside it. */
const JS_SWAP: Record<string, string[]> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };

interface ResolveContext {
  fileSet: Set<string>;
  dirFiles: Map<string, string[]>;
  config: RepoImportConfig;
  /** Java/Kotlin files by stem, and by the last two segments of their directory. */
  jvmByStem: Map<string, string[]>;
  jvmDirsByTail: Map<string, string[]>;
  jvmPairs: Set<string>;
  /** Roots a Python absolute import can be read from, and the top-level names under them. */
  pyRoots: string[];
  pyTop: Set<string>;
  /** Directories that exist (any file below them). */
  dirs: Set<string>;
}

function buildContext(files: string[], config: RepoImportConfig): ResolveContext {
  const fileSet = new Set(files);
  const dirFiles = new Map<string, string[]>();
  const dirs = new Set<string>();
  const jvmByStem = new Map<string, string[]>();
  const jvmDirsByTail = new Map<string, string[]>();
  const jvmPairs = new Set<string>();
  const pyPackageRoots = new Set<string>(["", "src"]);

  for (const f of files) {
    const d = dirOf(f);
    dirFiles.set(d, [...(dirFiles.get(d) ?? []), f]);
    let p = d;
    while (p && !dirs.has(p)) { dirs.add(p); p = dirOf(p); }

    if (/\.(java|kt|kts)$/.test(f)) {
      const stem = posix.basename(f).replace(/\.\w+$/, "");
      jvmByStem.set(stem, [...(jvmByStem.get(stem) ?? []), f]);
      const parts = d.split("/").filter(Boolean);
      const tail = parts.slice(-2).join("/");
      const list = jvmDirsByTail.get(tail) ?? [];
      if (!list.includes(d)) jvmDirsByTail.set(tail, [...list, d]);
      for (let k = 0; k + 1 < parts.length; k++) jvmPairs.add(`${parts[k]}/${parts[k + 1]}`);
    }
    if (f.endsWith("/__init__.py")) {
      // The parent of the outermost package is a root absolute imports are read from.
      let pkg = d;
      while (dirOf(pkg) && fileSet.has(`${dirOf(pkg)}/__init__.py`)) pkg = dirOf(pkg);
      pyPackageRoots.add(dirOf(pkg));
    }
  }
  const pyRoots = [...pyPackageRoots].slice(0, 50);
  const pyTop = new Set<string>();
  for (const f of files) {
    if (!f.endsWith(".py")) continue;
    for (const r of pyRoots) {
      const prefix = r ? `${r}/` : "";
      if (!f.startsWith(prefix)) continue;
      const first = f.slice(prefix.length).split("/")[0].replace(/\.py$/, "");
      if (first) pyTop.add(`${r}|${first}`);
    }
  }
  return { fileSet, dirFiles, config, jvmByStem, jvmDirsByTail, jvmPairs, pyRoots, pyTop, dirs };
}

function firstExisting(ctx: ResolveContext, candidates: string[]): string[] {
  for (const c of candidates) if (c && ctx.fileSet.has(c)) return [c];
  return [];
}

function jsCandidates(base: string): string[] {
  const out = [base];
  const ext = posix.extname(base);
  for (const swap of JS_SWAP[ext] ?? []) out.push(base.slice(0, -ext.length) + swap);
  for (const e of JS_EXTS) out.push(base + e);
  for (const e of JS_EXTS) out.push(base ? `${base}/index${e}` : `index${e}`);
  return out;
}

function resolveJs(ctx: ResolveContext, file: string, spec: string): Resolution {
  const fromDir = dirOf(file);
  if (spec.startsWith("./") || spec.startsWith("../") || spec === "." || spec === "..") {
    return internal(firstExisting(ctx, jsCandidates(joinRel(fromDir, spec))));
  }
  if (spec.startsWith("/")) return internal(firstExisting(ctx, jsCandidates(joinRel(spec.slice(1)))));

  // The nearest tsconfig governs, as it does for the compiler.
  const ts = ctx.config.ts.find((c) => c.dir === "" || file.startsWith(`${c.dir}/`));
  if (ts && ts.paths.length) {
    let best: { prefix: string; star: string; targets: string[] } | null = null;
    for (const { pattern, targets } of ts.paths) {
      const star = pattern.indexOf("*");
      if (star === -1) {
        if (pattern === spec) { best = { prefix: pattern, star: "", targets }; break; }
        continue;
      }
      const pre = pattern.slice(0, star);
      const suf = pattern.slice(star + 1);
      if (spec.startsWith(pre) && spec.endsWith(suf) && spec.length >= pre.length + suf.length && (!best || pre.length > best.prefix.length)) {
        best = { prefix: pre, star: spec.slice(pre.length, spec.length - suf.length), targets };
      }
    }
    if (best) {
      for (const t of best.targets) {
        const hit = firstExisting(ctx, jsCandidates(joinRel(t.replace("*", best.star))));
        if (hit.length) return internal(hit);
      }
      return internal([]);
    }
  }
  if (ts && ts.baseUrl !== null) {
    const hit = firstExisting(ctx, jsCandidates(joinRel(ts.baseUrl, spec)));
    if (hit.length) return internal(hit);
  }
  // No alias configured where we looked, but `@/` and `~/` are never npm packages:
  // they are the near-universal src alias, so try it rather than call it external.
  if ((!ts || ts.paths.length === 0) && (spec.startsWith("@/") || spec.startsWith("~/"))) {
    const rest = spec.slice(2);
    const roots = ts ? [joinRel(ts.dir, "src"), ts.dir] : ["src", ""];
    for (const r of roots) {
      const hit = firstExisting(ctx, jsCandidates(joinRel(r, rest)));
      if (hit.length) return internal(hit);
    }
    return internal([]);
  }
  return EXTERNAL; // a bare package: react, @scope/pkg, node:fs
}

function pyModuleFile(ctx: ResolveContext, base: string): string[] {
  return firstExisting(ctx, [`${base}.py`, `${base}/__init__.py`].map((x) => joinRel(x)));
}

function resolvePython(ctx: ResolveContext, file: string, spec: string): Resolution {
  // `from a.b import c` arrives as `a.b:c`. c may be a submodule or a name defined in
  // a.b, so the submodule is tried first and then the module itself.
  const colon = spec.indexOf(":");
  const mod = colon >= 0 ? spec.slice(0, colon) : spec;
  const name = colon >= 0 ? spec.slice(colon + 1) : null;
  const dots = mod.match(/^\.*/)?.[0].length ?? 0;
  const modSegs = mod.slice(dots) ? mod.slice(dots).split(".") : [];
  const segs = name ? [...modSegs, name] : modSegs;
  const tryFrom = (root: string): string[] => {
    const full = segs.length ? pyModuleFile(ctx, joinRel(root, segs.join("/"))) : [];
    if (full.length) return full;
    if (!name && segs.length) return [];
    return modSegs.length ? pyModuleFile(ctx, joinRel(root, modSegs.join("/"))) : firstExisting(ctx, [joinRel(root, "__init__.py")]);
  };
  if (dots > 0) {
    let base = dirOf(file);
    for (let k = 1; k < dots; k++) base = dirOf(base);
    return internal(tryFrom(base));
  }
  if (!segs.length) return EXTERNAL;
  let looksInternal = false;
  for (const root of ctx.pyRoots) {
    if (!ctx.pyTop.has(`${root}|${segs[0]}`)) continue;
    looksInternal = true;
    const hit = tryFrom(root);
    if (hit.length) return internal(hit);
  }
  // A name matching nothing in the repo is the standard library or an installed package.
  return looksInternal ? internal([]) : EXTERNAL;
}

function resolveGo(ctx: ResolveContext, spec: string): Resolution {
  const mod = ctx.config.goModules.find((m) => spec === m.module || spec.startsWith(`${m.module}/`));
  if (!mod) return EXTERNAL;
  const dir = joinRel(mod.dir, spec.slice(mod.module.length).replace(/^\//, ""));
  // Go imports a package, which is every non-test file in the directory.
  const files = (ctx.dirFiles.get(dir) ?? []).filter((f) => f.endsWith(".go") && !f.endsWith("_test.go"));
  return internal(files);
}

function jvmClassFiles(ctx: ResolveContext, segs: string[]): string[] {
  const stem = segs[segs.length - 1];
  const suffix = segs.join("/");
  return (ctx.jvmByStem.get(stem) ?? []).filter((f) => {
    const noExt = f.replace(/\.\w+$/, "");
    return noExt === suffix || noExt.endsWith(`/${suffix}`);
  });
}

function resolveJvm(ctx: ResolveContext, spec: string): Resolution {
  const wildcard = spec.endsWith(".*");
  const segs = (wildcard ? spec.slice(0, -2) : spec).split(".").filter(Boolean);
  if (!segs.length) return EXTERNAL;
  const pkgSegs = wildcard ? segs : segs.slice(0, -1);
  const pair = pkgSegs.length >= 2 ? `${pkgSegs[0]}/${pkgSegs[1]}` : null;
  const looksInternal = pair !== null && ctx.jvmPairs.has(pair);

  if (wildcard) {
    const dir = segs.join("/");
    const tail = segs.slice(-2).join("/");
    const dirs = (ctx.jvmDirsByTail.get(tail) ?? []).filter((d) => d === dir || d.endsWith(`/${dir}`));
    const files = dirs.flatMap((d) => (ctx.dirFiles.get(d) ?? []).filter((f) => /\.(java|kt|kts)$/.test(f)));
    if (files.length) return internal(files);
    // `import a.b.C.*` imports C's nested members: the dependency is C.
    const cls = jvmClassFiles(ctx, segs);
    if (cls.length) return internal(cls);
    return looksInternal ? internal([]) : EXTERNAL;
  }
  // a.b.C, then a.b.Outer for a nested a.b.Outer.Inner.
  for (let drop = 0; drop <= 2 && segs.length - drop >= 1; drop++) {
    const hit = jvmClassFiles(ctx, segs.slice(0, segs.length - drop));
    if (hit.length) return internal(hit.slice(0, 1));
  }
  return looksInternal ? internal([]) : EXTERNAL;
}

function resolvePhp(ctx: ResolveContext, file: string, spec: string): Resolution {
  if (spec.includes("/") || /\.(php|inc|phtml)$/i.test(spec)) {
    if (/^(\.\/)?vendor\//.test(spec)) return EXTERNAL;
    const fromFile = spec.startsWith("/") ? joinRel(spec.slice(1)) : joinRel(dirOf(file), spec);
    // An include path is also tried from the root, where most entry points live.
    return internal(firstExisting(ctx, [fromFile, joinRel(spec.replace(/^\//, ""))]));
  }
  const name = spec.replace(/^\\/, "");
  const rule = ctx.config.psr4.find((p) => p.prefix === "" || name === p.prefix || name.startsWith(`${p.prefix}\\`));
  if (!rule) return EXTERNAL;
  const rest = (rule.prefix ? name.slice(rule.prefix.length) : name).replace(/^\\/, "").replace(/\\/g, "/");
  const hit = firstExisting(ctx, rule.dirs.map((d) => joinRel(d, `${rest}.php`)));
  // An empty-prefix rule claims everything; only call a miss unresolved for a real prefix.
  return hit.length || rule.prefix ? internal(hit) : EXTERNAL;
}

function resolveDart(ctx: ResolveContext, file: string, spec: string): Resolution {
  if (spec.startsWith("dart:")) return EXTERNAL;
  const pkg = spec.match(/^package:([\w]+)\/(.+)$/);
  if (pkg) {
    const own = ctx.config.dartPackages.find((p) => p.name === pkg[1]);
    return own ? internal(firstExisting(ctx, [joinRel(own.dir, "lib", pkg[2])])) : EXTERNAL;
  }
  if (/^[a-z]+:/.test(spec)) return EXTERNAL;
  return internal(firstExisting(ctx, [joinRel(dirOf(file), spec)]));
}

function resolveRuby(ctx: ResolveContext, file: string, spec: string): Resolution {
  const withRb = (p: string) => (p.endsWith(".rb") ? p : `${p}.rb`);
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return internal(firstExisting(ctx, [withRb(joinRel(dirOf(file), spec))]));
  }
  const hit = firstExisting(ctx, [withRb(joinRel("lib", spec)), withRb(joinRel(spec)), withRb(joinRel("app", spec))]);
  if (hit.length) return internal(hit);
  // A gem unless it names something under the repo's own lib/.
  const first = spec.split("/")[0];
  return ctx.dirs.has(`lib/${first}`) ? internal([]) : EXTERNAL;
}

export interface ResolvedImports {
  /** Importing file to the tracked files it imports. Never contains a self-edge. */
  edges: Map<string, Set<string>>;
  /** Specifiers that looked internal (relative, alias, own module or package). */
  internalTried: number;
  /** Of those, the ones no tracked file matched. */
  unresolved: number;
}

export function resolveImports(input: {
  files: string[];
  imports: Map<string, string[]>;
  languageOf: Map<string, CodeLanguage>;
  config: RepoImportConfig;
}): ResolvedImports {
  const ctx = buildContext(input.files, input.config);
  const edges = new Map<string, Set<string>>();
  let internalTried = 0;
  let unresolved = 0;

  for (const [file, specs] of input.imports) {
    const language = input.languageOf.get(file);
    if (!language) continue;
    for (const spec of specs) {
      let r: Resolution;
      switch (language) {
        case "typescript": case "tsx": case "javascript": r = resolveJs(ctx, file, spec); break;
        case "python": r = resolvePython(ctx, file, spec); break;
        case "go": r = resolveGo(ctx, spec); break;
        case "java": case "kotlin": r = resolveJvm(ctx, spec); break;
        case "php": r = resolvePhp(ctx, file, spec); break;
        case "dart": r = resolveDart(ctx, file, spec); break;
        case "ruby": r = resolveRuby(ctx, file, spec); break;
        default: r = EXTERNAL;
      }
      if (r.kind === "external") continue;
      internalTried++;
      const targets = r.targets.filter((t) => t !== file);
      if (r.targets.length === 0) { unresolved++; continue; }
      if (!targets.length) continue; // resolved to itself (a Go file in its own package)
      const set = edges.get(file) ?? new Set<string>();
      for (const t of targets) set.add(t);
      edges.set(file, set);
    }
  }
  return { edges, internalTried, unresolved };
}

// ---------------------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------------------

const MAX_CYCLES = 10;
const MAX_HUBS = 10;
export const HUB_RULES = { fanIn: 8, complexity: 40, fanInAlone: 20 } as const;

/**
 * Strongly connected components, iteratively (Tarjan). A recursive version overflows the
 * stack on a long import chain, and repositories of 6,000 files have them. Components
 * come out in reverse topological order: one is emitted only after every component it
 * can reach.
 */
export function stronglyConnected(adj: number[][]): number[][] {
  const n = adj.length;
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const edgePos = new Int32Array(n);
  const stack: number[] = [];
  const call: number[] = [];
  const out: number[][] = [];
  let counter = 0;

  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    index[s] = low[s] = counter++;
    stack.push(s); onStack[s] = 1; call.push(s);
    while (call.length) {
      const v = call[call.length - 1];
      if (edgePos[v] < adj[v].length) {
        const w = adj[v][edgePos[v]++];
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w); onStack[w] = 1; call.push(w);
        } else if (onStack[w] && index[w] < low[v]) {
          low[v] = index[w];
        }
        continue;
      }
      call.pop();
      if (low[v] === index[v]) {
        const comp: number[] = [];
        let w: number;
        do { w = stack.pop()!; onStack[w] = 0; comp.push(w); } while (w !== v);
        out.push(comp);
      }
      if (call.length) {
        const p = call[call.length - 1];
        if (low[v] < low[p]) low[p] = low[v];
      }
    }
  }
  return out;
}

/** One shortest loop from `start` back to itself, staying inside its component. */
function shortestLoop(start: number, adj: number[][], inComp: (x: number) => boolean): number[] {
  const parent = new Map<number, number>();
  const queue: number[] = [];
  for (const w of adj[start]) {
    if (!inComp(w) || parent.has(w)) continue;
    parent.set(w, start);
    if (w === start) return [start, start];
    queue.push(w);
  }
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q];
    for (const w of adj[v]) {
      if (!inComp(w)) continue;
      if (w === start) {
        const path = [start];
        for (let x = v; x !== start; x = parent.get(x)!) path.push(x);
        // path is start, v, …, (first step) in reverse; rebuild forwards.
        return [start, ...path.slice(1).reverse(), start];
      }
      if (parent.has(w)) continue;
      parent.set(w, v);
      queue.push(w);
    }
  }
  return [start];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function analyseStructure(measured: FileMeasure[], resolved: ResolvedImports): StructureReport | null {
  const prod = measured.filter((f) => !f.isTest).sort((a, b) => a.path.localeCompare(b.path));
  const id = new Map(prod.map((f, i) => [f.path, i]));
  const adj: number[][] = prod.map(() => []);
  const fanIn = new Int32Array(prod.length);
  const languages = new Set<CodeLanguage>();
  let edgeCount = 0;

  prod.forEach((f, i) => {
    const targets = resolved.edges.get(f.path);
    if (!targets) return;
    const list = [...targets].map((t) => id.get(t)).filter((t): t is number => t !== undefined && t !== i).sort((a, b) => a - b);
    adj[i] = list;
    edgeCount += list.length;
    for (const t of list) fanIn[t]++;
    if (list.length) languages.add(f.language);
  });

  // A graph we could not build is not evidence of loose coupling.
  if (edgeCount === 0 && resolved.internalTried === 0) return null;

  const comps = stronglyConnected(adj);
  const compOf = new Int32Array(prod.length);
  comps.forEach((c, ci) => c.forEach((v) => (compOf[v] = ci)));

  // Longest chain in the condensation: components arrive with their successors already done.
  const depth = new Int32Array(comps.length);
  let maxDepth = 0;
  comps.forEach((c, ci) => {
    let d = 0;
    for (const v of c) for (const w of adj[v]) {
      const cw = compOf[w];
      if (cw !== ci && depth[cw] + 1 > d) d = depth[cw] + 1;
    }
    depth[ci] = d;
    if (d > maxDepth) maxDepth = d;
  });

  const cyclic = comps.filter((c) => c.length > 1);
  const cycles: DependencyCycle[] = cyclic
    .map((c) => {
      const sorted = [...c].sort((a, b) => a - b);
      const ci = compOf[sorted[0]];
      const loop = shortestLoop(sorted[0], adj, (x) => compOf[x] === ci);
      return { files: sorted.map((v) => prod[v].path), path: loop.map((v) => prod[v].path) };
    })
    .sort((a, b) => b.files.length - a.files.length || a.files[0].localeCompare(b.files[0]));

  const hubs: HubModule[] = prod
    .map((f, i) => {
      const fi = fanIn[i];
      const fo = adj[i].length;
      return {
        path: f.path,
        fanIn: fi,
        fanOut: fo,
        instability: fi + fo === 0 ? 0 : r3(fo / (fi + fo)),
        complexity: f.functions.reduce((s, fn) => s + fn.complexity, 0),
      };
    })
    .filter((h) => (h.fanIn >= HUB_RULES.fanIn && h.complexity >= HUB_RULES.complexity) || h.fanIn >= HUB_RULES.fanInAlone)
    .sort((a, b) => b.fanIn * b.complexity - a.fanIn * a.complexity || b.fanIn - a.fanIn || a.path.localeCompare(b.path))
    .slice(0, MAX_HUBS);

  return {
    modules: prod.length,
    edges: edgeCount,
    unresolvedShare: resolved.internalTried ? r3(resolved.unresolved / resolved.internalTried) : 0,
    languages: [...languages].sort(),
    cycles: cycles.slice(0, MAX_CYCLES),
    cycleCount: cyclic.length,
    filesInCycles: cyclic.reduce((s, c) => s + c.length, 0),
    hubs,
    maxDepth,
  };
}
