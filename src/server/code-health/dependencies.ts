import { lstat, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { isExampleOrFixturePath, isVendoredPath } from "@/server/pulse-checks/native-mobile";
import type {
  DependencyAudit,
  PackageAdvisory,
  VulnerabilitySeverity,
  VulnerablePackage,
} from "@/types/code-health";

/**
 * Third-party library audit for the code-health measure.
 *
 * Reads the lockfiles in a checkout (exact, pinned versions), then asks the OSV database
 * (osv.dev) which of those versions carry a published advisory. It is a lookup, not a
 * guess: nothing here infers a version from a range, and a manifest without a lockfile
 * is reported as such rather than resolved.
 *
 * Honesty rules (CLAUDE.md §35): when OSV cannot be reached or answers badly the result is
 * `unavailable` with an empty `vulnerable` list, never `checked` with nothing found. The
 * audit never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** OSV ecosystem names, spelled exactly as OSV spells them. */
export type OsvEcosystem = "npm" | "PyPI" | "Packagist" | "RubyGems" | "Go" | "crates.io" | "Pub";

export interface LockedPackage {
  ecosystem: OsvEcosystem;
  name: string;
  version: string;
  /** Declared by the project itself (true), pulled in transitively (false), or unknown. */
  direct: boolean | null;
}

export type LockfileKind =
  | "package-lock"
  | "yarn"
  | "pnpm"
  | "poetry"
  | "pipfile"
  | "requirements"
  | "uv"
  | "composer"
  | "gemfile"
  | "go-sum"
  | "cargo"
  | "pubspec"
  | "podfile";

export const MAX_PACKAGES = 5_000;
export const MAX_LOCKFILE_BYTES = 20 * 1024 * 1024;
export const OSV_BATCH_SIZE = 500;
export const MAX_ADVISORY_FETCHES = 300;
const ADVISORY_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_ROUNDS = 5;
const OSV_API = "https://api.osv.dev/v1";

const SEVERITY_RANK: Record<VulnerabilitySeverity, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
  unknown: 0,
};

// ── Lockfile discovery ───────────────────────────────────────────────────────

/** Which lockfile a path is, or null. Lockfiles in vendored, example or test trees are not the product. */
export function lockfileKind(path: string): LockfileKind | null {
  if (isVendoredPath(path) || isExampleOrFixturePath(path)) return null;
  if (/(^|\/)\.(yarn|pnpm-store|venv|tox)\//.test(path) || /(^|\/)(venv|site-packages)\//.test(path)) return null;
  const base = posix.basename(path);
  switch (base) {
    case "package-lock.json":
    case "npm-shrinkwrap.json":
      return "package-lock";
    case "yarn.lock":
      return "yarn";
    case "pnpm-lock.yaml":
      return "pnpm";
    case "poetry.lock":
      return "poetry";
    case "Pipfile.lock":
      return "pipfile";
    case "uv.lock":
      return "uv";
    case "composer.lock":
      return "composer";
    case "Gemfile.lock":
    case "gems.locked":
      return "gemfile";
    case "go.sum":
      return "go-sum";
    case "Cargo.lock":
      return "cargo";
    case "pubspec.lock":
      return "pubspec";
    case "Podfile.lock":
      return "podfile";
  }
  if (/^requirements[\w.-]*\.txt$/i.test(base)) return "requirements";
  return null;
}

const KIND_ECOSYSTEM: Record<Exclude<LockfileKind, "podfile">, OsvEcosystem> = {
  "package-lock": "npm",
  yarn: "npm",
  pnpm: "npm",
  poetry: "PyPI",
  pipfile: "PyPI",
  requirements: "PyPI",
  uv: "PyPI",
  composer: "Packagist",
  gemfile: "RubyGems",
  "go-sum": "Go",
  cargo: "crates.io",
  pubspec: "Pub",
};

/** Manifests that declare dependencies, and the lockfile names that would pin them. */
const MANIFEST_LOCKS: { manifest: string; ecosystem: string; locks: string[] }[] = [
  { manifest: "package.json", ecosystem: "npm", locks: ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml"] },
  { manifest: "pyproject.toml", ecosystem: "PyPI", locks: ["poetry.lock", "uv.lock", "Pipfile.lock", "pdm.lock"] },
  { manifest: "Pipfile", ecosystem: "PyPI", locks: ["Pipfile.lock"] },
  { manifest: "setup.py", ecosystem: "PyPI", locks: ["poetry.lock", "uv.lock", "Pipfile.lock"] },
  { manifest: "composer.json", ecosystem: "Packagist", locks: ["composer.lock"] },
  { manifest: "Gemfile", ecosystem: "RubyGems", locks: ["Gemfile.lock"] },
  { manifest: "Cargo.toml", ecosystem: "crates.io", locks: ["Cargo.lock"] },
  { manifest: "pubspec.yaml", ecosystem: "Pub", locks: ["pubspec.lock"] },
  { manifest: "Podfile", ecosystem: "CocoaPods", locks: ["Podfile.lock"] },
];

// ── Small helpers ────────────────────────────────────────────────────────────

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

const looksLikeVersion = (v: string) => /^v?\d/.test(v);

/** Split "name@version" where name may be scoped (@scope/name). */
function splitNameAt(spec: string): [string, string] | null {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return null;
  return [spec.slice(0, at), spec.slice(at + 1)];
}

/** PEP 503 name normalisation, which is also how OSV matches PyPI names. */
export function normalisePyPiName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function depNamesFromPackageJson(text: string | null | undefined): Map<string, string> | null {
  if (!text) return null;
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>;
    const out = new Map<string, string>();
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const deps = pkg[field];
      if (deps && typeof deps === "object") {
        for (const [k, v] of Object.entries(deps as Record<string, unknown>)) out.set(k, String(v));
      }
    }
    return out;
  } catch {
    return null;
  }
}

// ── npm: package-lock.json / npm-shrinkwrap.json ─────────────────────────────

interface NpmV1Dep {
  version?: string;
  dependencies?: Record<string, NpmV1Dep>;
}

export function parsePackageLock(text: string, packageJson?: string | null): LockedPackage[] {
  const lock = JSON.parse(text) as {
    packages?: Record<string, { name?: string; version?: string; link?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
    dependencies?: Record<string, NpmV1Dep>;
  };
  const out: LockedPackage[] = [];

  if (lock.packages && typeof lock.packages === "object") {
    // lockfileVersion 2/3. Direct = declared by the root or a workspace (keys without node_modules/).
    const directNames = new Set<string>();
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (key.includes("node_modules/") || !entry) continue;
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
        for (const n of Object.keys(entry[field] ?? {})) directNames.add(n);
      }
    }
    for (const [key, entry] of Object.entries(lock.packages)) {
      if (key === "" || !entry || entry.link) continue;
      const idx = key.lastIndexOf("node_modules/");
      if (idx < 0) continue; // a workspace folder: the project's own code
      const name = entry.name ?? key.slice(idx + "node_modules/".length);
      const version = entry.version;
      if (!name || !version || !looksLikeVersion(version)) continue;
      const nesting = key.split("node_modules/").length - 1;
      out.push({ ecosystem: "npm", name, version, direct: directNames.has(name) && nesting === 1 });
    }
    return out;
  }

  // lockfileVersion 1: a `dependencies` tree. The top level is hoisted, not necessarily
  // declared, so directness needs the package.json beside it.
  const declared = depNamesFromPackageJson(packageJson);
  const walk = (deps: Record<string, NpmV1Dep> | undefined, depth: number) => {
    for (const [name, dep] of Object.entries(deps ?? {})) {
      if (dep?.version && looksLikeVersion(dep.version)) {
        out.push({ ecosystem: "npm", name, version: dep.version, direct: declared ? depth === 0 && declared.has(name) : null });
      }
      walk(dep?.dependencies, depth + 1);
    }
  };
  walk(lock.dependencies, 0);
  return out;
}

// ── npm: yarn.lock (classic v1 and berry v2+) ────────────────────────────────

export function parseYarnLock(text: string, packageJson?: string | null): LockedPackage[] {
  const declared = depNamesFromPackageJson(packageJson);
  const out: LockedPackage[] = [];
  const lines = text.split(/\r?\n/);
  let key: string | null = null;
  let version: string | null = null;
  let resolution: string | null = null;

  const flush = () => {
    if (key === null) return;
    // Classic quotes each spec; berry quotes the whole list. Strip both.
    const specs = key.split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const first = specs[0];
    key = null;
    if (!first || first === "__metadata") return;
    let name: string | null = null;
    let ver = version;
    if (resolution) {
      // Berry: "name@npm:1.2.3". Anything but the npm protocol is a workspace, patch, git or file.
      const r = splitNameAt(unquote(resolution));
      if (!r || !r[1].startsWith("npm:")) return;
      name = r[0];
      ver = r[1].slice(4);
    } else {
      const s = splitNameAt(first);
      if (!s) return;
      name = s[0];
      if (/:\/\/|^(github|gitlab|bitbucket|git|git\+[a-z]+|file|link|workspace|patch|portal):/.test(s[1])) return;
    }
    if (!name || !ver || !looksLikeVersion(ver)) return;
    let direct: boolean | null = null;
    if (declared) {
      const range = declared.get(name);
      direct = range !== undefined && specs.some((s) => s === `${name}@${range}` || s === `${name}@npm:${range}`);
    }
    out.push({ ecosystem: "npm", name, version: ver, direct });
  };

  for (const raw of lines) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      flush();
      key = raw.replace(/:\s*$/, "");
      version = null;
      resolution = null;
      continue;
    }
    if (key === null) continue;
    const m = /^ {2}(version|resolution):?\s+(.+)$/.exec(raw);
    if (m) {
      if (m[1] === "version") version = unquote(m[2]);
      else resolution = m[2].trim();
    }
  }
  flush();
  return out;
}

// ── npm: pnpm-lock.yaml (v5, v6, v9) ─────────────────────────────────────────

/** "/name@1.2.3(peer@1)", "name@1.2.3", "/@s/n/1.2.3_peer" → [name, version]. */
function parsePnpmKey(rawKey: string): [string, string] | null {
  let k = unquote(rawKey).replace(/^\//, "");
  k = k.replace(/\(.*$/, "");
  const at = splitNameAt(k);
  if (at && looksLikeVersion(at[1])) return [at[0], at[1].replace(/_.*$/, "")];
  // v5: name/version
  const slash = k.lastIndexOf("/");
  if (slash > 0) {
    const v = k.slice(slash + 1).replace(/_.*$/, "");
    if (looksLikeVersion(v)) return [k.slice(0, slash), v];
  }
  return null;
}

export function parsePnpmLock(text: string): LockedPackage[] {
  const lines = text.split(/\r?\n/);
  const packages = new Map<string, [string, string]>();
  const direct = new Set<string>();
  let sawDeclarations = false;
  let section = "";
  let depBlockIndent = -1; // indent of a dependencies:/devDependencies: line in scope
  let pendingName: string | null = null;
  let pendingIndent = -1;
  const DEP_FIELDS = /^(dependencies|devDependencies|optionalDependencies):\s*$/;

  for (const raw of lines) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (indent === 0) {
      section = line.replace(/:.*$/, "");
      depBlockIndent = DEP_FIELDS.test(line) ? 0 : -1; // v5/v6 single-project top-level deps
      if (depBlockIndent === 0) sawDeclarations = true;
      pendingName = null;
      continue;
    }
    if (section === "packages") {
      if (indent === 2 && line.endsWith(":")) {
        const p = parsePnpmKey(line.slice(0, -1));
        if (p) packages.set(`${p[0]}@${p[1]}`, p);
      }
      continue;
    }
    if (section === "importers" || depBlockIndent === 0) {
      if (depBlockIndent >= 0 && indent <= depBlockIndent) depBlockIndent = -1;
      if (DEP_FIELDS.test(line)) {
        depBlockIndent = indent;
        sawDeclarations = true;
        pendingName = null;
        continue;
      }
      if (depBlockIndent < 0) continue;
      if (indent === depBlockIndent + 2) {
        const m = /^(['"]?[^:'"]+['"]?):\s*(.*)$/.exec(line);
        if (!m) continue;
        const name = unquote(m[1]);
        if (m[2]) {
          // v5 compact: "name: 1.2.3"
          const v = unquote(m[2]).replace(/[(_].*$/, "");
          if (looksLikeVersion(v)) direct.add(`${name}@${v}`);
          pendingName = null;
        } else {
          pendingName = name;
          pendingIndent = indent;
        }
        continue;
      }
      if (pendingName && indent === pendingIndent + 2) {
        const m = /^version:\s*(.+)$/.exec(line);
        if (m) {
          const v = unquote(m[1]).replace(/[(_].*$/, "");
          if (looksLikeVersion(v)) direct.add(`${pendingName}@${v}`);
        }
      }
    }
  }
  return [...packages.values()].map(([name, version]) => ({
    ecosystem: "npm" as const,
    name,
    version,
    direct: sawDeclarations ? direct.has(`${name}@${version}`) : null,
  }));
}

// ── TOML-ish [[package]] blocks (poetry.lock, uv.lock, Cargo.lock) ───────────

interface TomlPackageBlock {
  name: string | null;
  version: string | null;
  source: string | null;
  /** Raw text of the block, sub-tables included, for dependency lists. */
  body: string;
}

function tomlPackageBlocks(text: string): TomlPackageBlock[] {
  const blocks: TomlPackageBlock[] = [];
  let cur: TomlPackageBlock | null = null;
  let inSubTable = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "[[package]]") {
      if (cur) blocks.push(cur);
      cur = { name: null, version: null, source: null, body: "" };
      inSubTable = false;
      continue;
    }
    if (/^\[/.test(line)) {
      // [package.x] sub-tables stay with the current package; any other table ends it.
      if (cur && /^\[\[?package\./.test(line)) inSubTable = true;
      else if (cur) {
        blocks.push(cur);
        cur = null;
      }
    }
    if (!cur) continue;
    cur.body += raw + "\n";
    if (inSubTable) continue;
    const m = /^(name|version|source)\s*=\s*(.+)$/.exec(line);
    if (m) {
      const val = m[2].trim();
      if (m[1] === "source") cur.source = val;
      else cur[m[1] as "name" | "version"] = unquote(val);
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

export function parsePoetryLock(text: string): LockedPackage[] {
  return tomlPackageBlocks(text)
    .filter((b) => b.name && b.version && looksLikeVersion(b.version))
    .filter((b) => !/\[package\.source\][^[]*type\s*=\s*"(git|directory|file|url)"/.test(b.body))
    .map((b) => ({ ecosystem: "PyPI" as const, name: normalisePyPiName(b.name!), version: b.version!, direct: null }));
}

export function parseUvLock(text: string): LockedPackage[] {
  const blocks = tomlPackageBlocks(text);
  const isLocal = (b: TomlPackageBlock) => !!b.source && /\b(editable|virtual|directory|path|git)\s*=/.test(b.source);
  const directNames = new Set<string>();
  let sawRoot = false;
  for (const b of blocks.filter(isLocal)) {
    sawRoot = true;
    for (const m of b.body.matchAll(/\{\s*name\s*=\s*"([^"]+)"/g)) directNames.add(normalisePyPiName(m[1]));
  }
  return blocks
    .filter((b) => b.name && b.version && looksLikeVersion(b.version) && !isLocal(b))
    .map((b) => {
      const name = normalisePyPiName(b.name!);
      return { ecosystem: "PyPI" as const, name, version: b.version!, direct: sawRoot ? directNames.has(name) : null };
    });
}

export function parseCargoLock(text: string): LockedPackage[] {
  const blocks = tomlPackageBlocks(text);
  const directNames = new Set<string>();
  let sawRoot = false;
  for (const b of blocks.filter((x) => !x.source)) {
    sawRoot = true;
    const arr = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(b.body);
    if (!arr) continue;
    for (const m of arr[1].matchAll(/"([^"\s]+)/g)) directNames.add(m[1]);
  }
  return blocks
    .filter((b) => b.name && b.version && b.source && /^"?registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index|^"?sparse\+https:\/\/index\.crates\.io/.test(b.source))
    .map((b) => ({ ecosystem: "crates.io" as const, name: b.name!, version: b.version!, direct: sawRoot ? directNames.has(b.name!) : null }));
}

// ── PyPI: Pipfile.lock, requirements*.txt ────────────────────────────────────

export function parsePipfileLock(text: string): LockedPackage[] {
  const lock = JSON.parse(text) as Record<string, Record<string, { version?: string }> | undefined>;
  const out: LockedPackage[] = [];
  for (const section of ["default", "develop"]) {
    for (const [name, entry] of Object.entries(lock[section] ?? {})) {
      const v = entry?.version?.replace(/^===?/, "");
      if (v && looksLikeVersion(v)) out.push({ ecosystem: "PyPI", name: normalisePyPiName(name), version: v, direct: null });
    }
  }
  return out;
}

export function parseRequirements(text: string): { packages: LockedPackage[]; unpinned: number } {
  // pip-compile output lists transitive packages too, annotated "# via". Hand-written files are direct.
  const compiled = /#\s+via\b/.test(text);
  const joined = text.replace(/\\\r?\n/g, " ");
  const packages: LockedPackage[] = [];
  let unpinned = 0;
  for (const raw of joined.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line || line.startsWith("-") || /:\/\//.test(line.split(/\s/)[0])) continue;
    const req = line.replace(/\s--hash=\S+/g, "").replace(/;.*$/, "").trim();
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*===?\s*([^\s,]+)$/.exec(req);
    if (m && looksLikeVersion(m[2]) && !m[2].includes("*")) {
      packages.push({ ecosystem: "PyPI", name: normalisePyPiName(m[1]), version: m[2], direct: compiled ? null : true });
    } else if (/^[A-Za-z0-9]/.test(req)) {
      unpinned++;
    }
  }
  return { packages, unpinned };
}

// ── Packagist: composer.lock ─────────────────────────────────────────────────

export function parseComposerLock(text: string, composerJson?: string | null): LockedPackage[] {
  const lock = JSON.parse(text) as { packages?: { name?: string; version?: string }[]; "packages-dev"?: { name?: string; version?: string }[] };
  let declared: Set<string> | null = null;
  if (composerJson) {
    try {
      const c = JSON.parse(composerJson) as { require?: Record<string, string>; "require-dev"?: Record<string, string> };
      declared = new Set([...Object.keys(c.require ?? {}), ...Object.keys(c["require-dev"] ?? {})].map((n) => n.toLowerCase()));
    } catch {
      declared = null;
    }
  }
  const out: LockedPackage[] = [];
  for (const p of [...(lock.packages ?? []), ...(lock["packages-dev"] ?? [])]) {
    if (!p?.name || !p.version) continue;
    const version = p.version.replace(/^v(?=\d)/, "");
    if (!looksLikeVersion(version)) continue; // dev-main and the like are not releases
    out.push({ ecosystem: "Packagist", name: p.name, version, direct: declared ? declared.has(p.name.toLowerCase()) : null });
  }
  return out;
}

// ── RubyGems: Gemfile.lock ───────────────────────────────────────────────────

export function parseGemfileLock(text: string): LockedPackage[] {
  const specs: [string, string][] = [];
  const declared = new Set<string>();
  let section = "";
  let inSpecs = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (!/^\s/.test(raw)) {
      section = raw.trim();
      inSpecs = false;
      continue;
    }
    if (section === "GEM") {
      if (/^ {2}specs:\s*$/.test(raw)) inSpecs = true;
      else if (/^ {2}\S/.test(raw)) inSpecs = false;
      else if (inSpecs) {
        const m = /^ {4}([^\s(]+) \(([^)]+)\)\s*$/.exec(raw);
        // "1.10.0-x86_64-linux": the platform is not part of the version OSV knows.
        if (m) specs.push([m[1], m[2].split("-")[0]]);
      }
    } else if (section === "DEPENDENCIES") {
      const m = /^ {2}([^\s!(]+)/.exec(raw);
      if (m) declared.add(m[1]);
    }
  }
  const haveDecl = declared.size > 0;
  return specs
    .filter(([, v]) => looksLikeVersion(v))
    .map(([name, version]) => ({ ecosystem: "RubyGems" as const, name, version, direct: haveDecl ? declared.has(name) : null }));
}

// ── Go: go.sum (+ go.mod) ────────────────────────────────────────────────────

/** OSV's Go data spells versions without the leading "v" and without "+incompatible". */
export function goVersionForOsv(v: string): string {
  return v.replace(/^v/, "").replace(/\+incompatible$/, "");
}

export function compareVersions(a: string, b: string): number {
  const ta = a.replace(/^v/, "").match(/\d+|[A-Za-z]+/g) ?? [];
  const tb = b.replace(/^v/, "").match(/\d+|[A-Za-z]+/g) ?? [];
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    const x = ta[i];
    const y = tb[i];
    if (x === undefined) return /^\d/.test(y!) ? -1 : 1; // 1.0 < 1.0.1, but 1.0 > 1.0rc1
    if (y === undefined) return /^\d/.test(x) ? 1 : -1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (nx !== ny) {
      return nx ? 1 : -1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * The module build list. With go.mod, its `require` block IS the build list (Go ≥ 1.17
 * records indirect requirements too). Without it, go.sum lines that hash a module's full
 * content (no "/go.mod" suffix), highest version per module: go.sum also carries older
 * versions whose go.mod was only consulted, and reporting those would invent findings.
 */
export function parseGoModules(goSum: string, goMod?: string | null): LockedPackage[] {
  if (goMod) {
    const out: LockedPackage[] = [];
    const reqLine = /^\s*(?:require\s+)?([^\s()]+)\s+(v\S+)(\s*\/\/\s*indirect)?\s*$/;
    let inBlock = false;
    for (const raw of goMod.split(/\r?\n/)) {
      const line = raw.trim();
      if (/^require\s*\($/.test(line)) {
        inBlock = true;
        continue;
      }
      if (inBlock && line === ")") {
        inBlock = false;
        continue;
      }
      if (!inBlock && !line.startsWith("require ")) continue;
      const m = reqLine.exec(line.replace(/^require\s+/, ""));
      if (m) out.push({ ecosystem: "Go", name: m[1], version: goVersionForOsv(m[2]), direct: !m[3] });
    }
    if (out.length > 0) return out;
  }
  const best = new Map<string, string>();
  for (const raw of goSum.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 3 || parts[1].endsWith("/go.mod")) continue;
    const prev = best.get(parts[0]);
    if (!prev || compareVersions(parts[1], prev) > 0) best.set(parts[0], parts[1]);
  }
  return [...best].map(([name, v]) => ({ ecosystem: "Go" as const, name, version: goVersionForOsv(v), direct: null }));
}

// ── Pub: pubspec.lock ────────────────────────────────────────────────────────

export function parsePubspecLock(text: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  let inPackages = false;
  let cur: { name: string; version?: string; source?: string; dependency?: string } | null = null;
  const flush = () => {
    if (cur && cur.version && looksLikeVersion(cur.version) && cur.source === "hosted") {
      const d = cur.dependency;
      out.push({ ecosystem: "Pub", name: cur.name, version: cur.version, direct: d ? d.startsWith("direct") : null });
    }
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (indent === 0) {
      flush();
      inPackages = line === "packages:";
      continue;
    }
    if (!inPackages) continue;
    if (indent === 2 && line.endsWith(":")) {
      flush();
      cur = { name: unquote(line.slice(0, -1)) };
      continue;
    }
    if (cur && indent === 4) {
      const m = /^(version|source|dependency):\s*(.+)$/.exec(line);
      if (m) cur[m[1] as "version" | "source" | "dependency"] = unquote(m[2]);
    }
  }
  flush();
  return out;
}

// ── CVSS 3.x base score ──────────────────────────────────────────────────────

function roundUp1(x: number): number {
  const i = Math.round(x * 100_000);
  return i % 10_000 === 0 ? i / 100_000 : (Math.floor(i / 10_000) + 1) / 10;
}

/** CVSS 3.0/3.1 base score from a vector string, or null if it cannot be read. */
export function cvss3BaseScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m: Record<string, string> = {};
  for (const part of vector.split("/").slice(1)) {
    const [k, v] = part.split(":");
    if (k && v) m[k] = v;
  }
  const AV = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[m.AV];
  const AC = { L: 0.77, H: 0.44 }[m.AC];
  const UI = { N: 0.85, R: 0.62 }[m.UI];
  const S = m.S;
  const cia = (x: string) => ({ H: 0.56, L: 0.22, N: 0 } as Record<string, number>)[x];
  const C = cia(m.C);
  const I = cia(m.I);
  const A = cia(m.A);
  const PR = S === "C" ? { N: 0.85, L: 0.68, H: 0.5 }[m.PR] : { N: 0.85, L: 0.62, H: 0.27 }[m.PR];
  if ([AV, AC, UI, PR, C, I, A].some((x) => x === undefined) || (S !== "U" && S !== "C")) return null;
  const iss = 1 - (1 - C!) * (1 - I!) * (1 - A!);
  const impact = S === "U" ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const exploitability = 8.22 * AV! * AC! * PR! * UI!;
  if (impact <= 0) return 0;
  return S === "U" ? roundUp1(Math.min(impact + exploitability, 10)) : roundUp1(Math.min(1.08 * (impact + exploitability), 10));
}

export function severityFromScore(score: number): VulnerabilitySeverity {
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

// ── OSV ──────────────────────────────────────────────────────────────────────

export interface OsvVuln {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  withdrawn?: string;
  severity?: { type?: string; score?: string }[];
  database_specific?: { severity?: string };
  affected?: {
    package?: { ecosystem?: string; name?: string };
    ranges?: { type?: string; events?: { introduced?: string; fixed?: string; last_affected?: string; limit?: string }[] }[];
    database_specific?: { severity?: string };
    ecosystem_specific?: { severity?: string };
  }[];
}

const LABEL_SEVERITY: Record<string, VulnerabilitySeverity> = {
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "moderate",
  MEDIUM: "moderate",
  LOW: "low",
};

export function advisorySeverity(v: OsvVuln): VulnerabilitySeverity {
  const label = v.database_specific?.severity?.toUpperCase();
  if (label && LABEL_SEVERITY[label]) return LABEL_SEVERITY[label];
  for (const s of v.severity ?? []) {
    if (s.type === "CVSS_V3" && s.score) {
      const score = cvss3BaseScore(s.score);
      if (score !== null) return severityFromScore(score);
    }
  }
  for (const a of v.affected ?? []) {
    const l = (a.database_specific?.severity ?? a.ecosystem_specific?.severity)?.toUpperCase();
    if (l && LABEL_SEVERITY[l]) return LABEL_SEVERITY[l];
  }
  return "unknown";
}

function sameName(ecosystem: string, a: string, b: string): boolean {
  if (ecosystem === "PyPI") return normalisePyPiName(a) === normalisePyPiName(b);
  if (ecosystem === "Packagist") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** The lowest fixed version for this package; the lowest above the installed version when there is one. */
export function fixedVersionFor(v: OsvVuln, pkg: Pick<LockedPackage, "ecosystem" | "name" | "version">): string | null {
  const fixed: string[] = [];
  for (const a of v.affected ?? []) {
    if (a.package?.ecosystem !== pkg.ecosystem || !a.package.name || !sameName(pkg.ecosystem, a.package.name, pkg.name)) continue;
    for (const r of a.ranges ?? []) {
      if (r.type === "GIT") continue;
      for (const e of r.events ?? []) if (e.fixed) fixed.push(e.fixed);
    }
  }
  if (fixed.length === 0) return null;
  fixed.sort(compareVersions);
  return fixed.find((f) => compareVersions(f, pkg.version) > 0) ?? fixed[0];
}

function summaryOf(v: OsvVuln): string {
  const s = v.summary?.trim() || (v.details ?? "").trim().split(/(?<=[.!?])\s|\n/)[0] || "";
  return s.length > 200 ? `${s.slice(0, 197)}...` : s;
}

export type OsvQueryResult =
  | {
      ok: true;
      /** Advisories per input package, in input order. Withdrawn advisories are already removed. */
      advisories: PackageAdvisory[][];
      notes: string[];
    }
  | { ok: false; reason: string };

async function osvJson(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

/** Look every package up in OSV. Never throws: a failure is `{ ok: false, reason }`. */
export async function queryOsv(packages: LockedPackage[], fetchImpl: typeof fetch = fetch): Promise<OsvQueryResult> {
  const ids: string[][] = packages.map(() => []);
  try {
    for (let start = 0; start < packages.length; start += OSV_BATCH_SIZE) {
      let pending = packages.slice(start, start + OSV_BATCH_SIZE).map((p, j) => ({ index: start + j, pkg: p, token: undefined as string | undefined }));
      for (let round = 0; pending.length > 0 && round < MAX_PAGE_ROUNDS; round++) {
        const body = {
          queries: pending.map(({ pkg, token }) => ({
            package: { ecosystem: pkg.ecosystem, name: pkg.name },
            version: pkg.version,
            ...(token ? { page_token: token } : {}),
          })),
        };
        const data = (await osvJson(fetchImpl, `${OSV_API}/querybatch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })) as { results?: { vulns?: { id?: string }[]; next_page_token?: string }[] };
        if (!Array.isArray(data?.results) || data.results.length !== pending.length) {
          throw new Error("an answer that did not match the question");
        }
        const next: typeof pending = [];
        data.results.forEach((r, j) => {
          for (const v of r?.vulns ?? []) if (typeof v?.id === "string") ids[pending[j].index].push(v.id);
          if (r?.next_page_token) next.push({ ...pending[j], token: r.next_page_token });
        });
        pending = next;
      }
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `The OSV vulnerability database could not be queried (${why}), so the libraries were not checked.` };
  }

  const notes: string[] = [];
  const unique = [...new Set(ids.flat())];
  const toFetch = unique.slice(0, MAX_ADVISORY_FETCHES);
  if (unique.length > toFetch.length) {
    notes.push(`${unique.length} advisories matched; details were read for the first ${toFetch.length}, the rest are listed by id with unknown severity.`);
  }
  const details = new Map<string, OsvVuln>();
  let failed = 0;
  await pool(toFetch, ADVISORY_CONCURRENCY, async (id) => {
    try {
      const v = (await osvJson(fetchImpl, `${OSV_API}/vulns/${encodeURIComponent(id)}`)) as OsvVuln;
      if (v && typeof v.id === "string") details.set(id, v);
      else failed++;
    } catch {
      failed++;
    }
  });
  if (failed > 0) notes.push(`Details for ${failed} advisor${failed === 1 ? "y" : "ies"} could not be read; ${failed === 1 ? "it is" : "they are"} listed by id with unknown severity.`);

  const advisories = packages.map((pkg, i) => {
    const list: PackageAdvisory[] = [];
    const seen = new Set<string>();
    // GHSA first: it carries the severity label, and its PYSEC/RUSTSEC twins are aliases.
    const own = [...new Set(ids[i])].sort((a, b) => Number(b.startsWith("GHSA-")) - Number(a.startsWith("GHSA-")));
    for (const id of own) {
      if (seen.has(id)) continue;
      const v = details.get(id);
      if (v?.withdrawn) continue;
      const aliases = v?.aliases ?? [];
      list.push({
        id,
        aliases,
        summary: v ? summaryOf(v) : "",
        severity: v ? advisorySeverity(v) : "unknown",
        fixedIn: v ? fixedVersionFor(v, pkg) : null,
        url: `https://osv.dev/vulnerability/${id}`,
      });
      seen.add(id);
      for (const a of aliases) seen.add(a);
    }
    // A later advisory whose own aliases name a kept one is the same vulnerability.
    return list.filter((a, k) => !list.slice(0, k).some((b) => a.aliases.includes(b.id)));
  });
  return { ok: true, advisories, notes };
}

// ── The audit ────────────────────────────────────────────────────────────────

function emptyCounts(): Record<VulnerabilitySeverity, number> {
  return { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
}

const ECOSYSTEM_LABEL: Record<string, string> = { npm: "npm", PyPI: "Python", Packagist: "PHP", RubyGems: "Ruby", Go: "Go", "crates.io": "Rust", Pub: "Dart" };

async function readSmall(dir: string, rel: string): Promise<string | null> {
  try {
    const p = join(dir, rel);
    const st = await lstat(p);
    if (!st.isFile() || st.size > MAX_LOCKFILE_BYTES) return null;
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

function sortVulnerable(a: VulnerablePackage, b: VulnerablePackage): number {
  const s = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (s !== 0) return s;
  const rank = (d: boolean | null) => (d === true ? 0 : d === null ? 1 : 2);
  const d = rank(a.direct) - rank(b.direct);
  if (d !== 0) return d;
  return a.name.localeCompare(b.name) || a.version.localeCompare(b.version);
}

export async function auditDependencies(input: {
  dir: string;
  files: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<DependencyAudit> {
  const now = input.now ?? Date.now;
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = (status: DependencyAudit["status"], reason: string | null): DependencyAudit => ({
    status,
    reason,
    lockfiles: [],
    packages: 0,
    vulnerable: [],
    counts: emptyCounts(),
    checkedAt: new Date(now()).toISOString(),
  });

  try {
    const fileSet = new Set(input.files);
    const found = input.files
      .map((path) => ({ path, kind: lockfileKind(path) }))
      .filter((f): f is { path: string; kind: LockfileKind } => f.kind !== null)
      .sort((a, b) => a.path.localeCompare(b.path));
    const supported = found.filter((f) => f.kind !== "podfile");

    if (supported.length === 0) {
      const sibling = (dirOf: string, name: string) => (dirOf ? `${dirOf}/${name}` : name);
      const unlocked: string[] = [];
      for (const path of input.files) {
        if (isVendoredPath(path) || isExampleOrFixturePath(path)) continue;
        const name = posix.basename(path);
        const rule = MANIFEST_LOCKS.find((r) => r.manifest === name);
        if (!rule) continue;
        const d = posix.dirname(path) === "." ? "" : posix.dirname(path);
        if (!rule.locks.some((l) => fileSet.has(sibling(d, l)))) unlocked.push(path);
      }
      const podfiles = found.filter((f) => f.kind === "podfile");
      const parts: string[] = [];
      if (podfiles.length > 0) {
        parts.push(`${podfiles.map((p) => p.path).join(", ")} (CocoaPods) is not covered by the OSV vulnerability database, so its libraries were not checked.`);
      }
      const plainUnlocked = unlocked.filter((p) => posix.basename(p) !== "Podfile" || podfiles.length === 0);
      if (plainUnlocked.length > 0) {
        const shown = plainUnlocked.slice(0, 4);
        const more = plainUnlocked.length - shown.length;
        parts.push(
          `${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""} ${plainUnlocked.length === 1 ? "has" : "have"} no lockfile, so versions are not pinned and cannot be checked against known vulnerabilities.`,
        );
      }
      if (parts.length === 0) parts.push("No lockfile was found, so there were no pinned library versions to check.");
      return base("no_lockfile", parts.join(" "));
    }

    const notes: string[] = [];
    const unreadable: string[] = [];
    const lockfiles: DependencyAudit["lockfiles"] = [];
    // key → package (+ first lockfile it was seen in)
    const merged = new Map<string, LockedPackage & { lockfile: string }>();

    for (const lf of supported) {
      const ecosystem = KIND_ECOSYSTEM[lf.kind as Exclude<LockfileKind, "podfile">];
      let size = 0;
      try {
        const st = await lstat(join(input.dir, lf.path));
        if (!st.isFile()) continue;
        size = st.size;
      } catch {
        unreadable.push(`${lf.path} could not be read`);
        continue;
      }
      if (size > MAX_LOCKFILE_BYTES) {
        unreadable.push(`${lf.path} is larger than ${MAX_LOCKFILE_BYTES / 1024 / 1024} MB and was skipped`);
        continue;
      }
      const text = await readSmall(input.dir, lf.path);
      if (text === null) {
        unreadable.push(`${lf.path} could not be read`);
        continue;
      }
      const d = posix.dirname(lf.path) === "." ? "" : `${posix.dirname(lf.path)}/`;
      const sib = (name: string) => (fileSet.has(`${d}${name}`) ? readSmall(input.dir, `${d}${name}`) : Promise.resolve(null));
      let pkgs: LockedPackage[];
      try {
        switch (lf.kind) {
          case "package-lock":
            pkgs = parsePackageLock(text, await sib("package.json"));
            break;
          case "yarn":
            pkgs = parseYarnLock(text, await sib("package.json"));
            break;
          case "pnpm":
            pkgs = parsePnpmLock(text);
            break;
          case "poetry":
            pkgs = parsePoetryLock(text);
            break;
          case "pipfile":
            pkgs = parsePipfileLock(text);
            break;
          case "uv":
            pkgs = parseUvLock(text);
            break;
          case "requirements": {
            const r = parseRequirements(text);
            pkgs = r.packages;
            if (r.unpinned > 0) notes.push(`${lf.path}: ${r.unpinned} requirement${r.unpinned === 1 ? " is" : "s are"} not pinned to an exact version and ${r.unpinned === 1 ? "was" : "were"} not checked.`);
            break;
          }
          case "composer":
            pkgs = parseComposerLock(text, await sib("composer.json"));
            break;
          case "gemfile":
            pkgs = parseGemfileLock(text);
            break;
          case "go-sum":
            pkgs = parseGoModules(text, await sib("go.mod"));
            break;
          case "cargo":
            pkgs = parseCargoLock(text);
            break;
          case "pubspec":
            pkgs = parsePubspecLock(text);
            break;
          default:
            pkgs = [];
        }
      } catch {
        unreadable.push(`${lf.path} could not be parsed`);
        continue;
      }
      lockfiles.push({ path: lf.path, ecosystem, packages: pkgs.length });
      for (const p of pkgs) {
        const key = `${p.ecosystem}\u0000${p.name}\u0000${p.version}`;
        const prev = merged.get(key);
        if (!prev) merged.set(key, { ...p, lockfile: lf.path });
        else if (p.direct === true) prev.direct = true;
        else if (prev.direct === null && p.direct === false) prev.direct = false;
      }
    }

    if (lockfiles.length === 0) {
      return base("unavailable", `No lockfile could be read: ${unreadable.join("; ")}.`);
    }
    if (unreadable.length > 0) notes.push(`${unreadable.join("; ")}.`);
    if (found.some((f) => f.kind === "podfile")) notes.push("Podfile.lock (CocoaPods) is not covered by the OSV database and was not checked.");

    let all = [...merged.values()];
    if (all.length > MAX_PACKAGES) {
      const rank = (d: boolean | null) => (d === true ? 0 : d === null ? 1 : 2);
      all = all.sort((a, b) => rank(a.direct) - rank(b.direct)).slice(0, MAX_PACKAGES);
      notes.push(`${merged.size} packages were found; the first ${MAX_PACKAGES} (declared ones first) were checked.`);
    }

    const result: DependencyAudit = { ...base("checked", null), lockfiles, packages: all.length };
    if (all.length === 0) {
      result.reason = notes.length > 0 ? notes.join(" ") : null;
      return result;
    }

    const osv = await queryOsv(all, fetchImpl);
    if (!osv.ok) {
      return { ...base("unavailable", osv.reason), lockfiles, packages: all.length };
    }
    notes.push(...osv.notes);

    const vulnerable: VulnerablePackage[] = [];
    all.forEach((p, i) => {
      const adv = osv.advisories[i];
      if (adv.length === 0) return;
      const severity = adv.reduce<VulnerabilitySeverity>((w, a) => (SEVERITY_RANK[a.severity] > SEVERITY_RANK[w] ? a.severity : w), "unknown");
      vulnerable.push({
        ecosystem: p.ecosystem,
        name: p.name,
        version: p.version,
        lockfile: p.lockfile,
        direct: p.direct,
        advisories: [...adv].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]),
        severity,
      });
    });
    vulnerable.sort(sortVulnerable);
    for (const v of vulnerable) result.counts[v.severity]++;
    result.vulnerable = vulnerable;
    result.reason = notes.length > 0 ? notes.join(" ") : null;
    return result;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return base("unavailable", `The library audit could not run (${why}).`);
  }
}

/** For report copy: "npm", "Python", … */
export function ecosystemLabel(ecosystem: string): string {
  return ECOSYSTEM_LABEL[ecosystem] ?? ecosystem;
}
