import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  advisorySeverity,
  auditDependencies,
  cvss3BaseScore,
  fixedVersionFor,
  lockfileKind,
  parseCargoLock,
  parseComposerLock,
  parseGemfileLock,
  parseGoModules,
  parsePackageLock,
  parsePipfileLock,
  parsePnpmLock,
  parsePoetryLock,
  parsePubspecLock,
  parseRequirements,
  parseUvLock,
  parseGradleLockfile,
  parseNugetLock,
  parsePackageResolved,
  swiftUrlName,
  parseYarnLock,
  queryOsv,
  type LockedPackage,
} from "../dependencies";

/**
 * Fixtures are stored with a `.fixture` suffix so this repo's own dependency scanners
 * (Dependabot) never read the deliberately vulnerable pins in them as ours.
 */
const FIX = join(__dirname, "fixtures", "deps");
const fx = (p: string) => readFile(join(FIX, `${p}.fixture`), "utf8");

const pick = (pkgs: LockedPackage[], name: string, version?: string) => {
  const p = pkgs.find((x) => x.name === name && (version === undefined || x.version === version));
  if (!p) throw new Error(`no ${name}@${version ?? "*"} in ${pkgs.map((x) => `${x.name}@${x.version}`).join(", ")}`);
  return p;
};
const keys = (pkgs: LockedPackage[]) => pkgs.map((p) => `${p.name}@${p.version}`).sort();

// ── Parsers ─────────────────────────────────────────────────────────────────

describe("npm lockfiles", () => {
  it("reads a lockfileVersion 3 packages map, nested copies and directness", async () => {
    const pkgs = parsePackageLock(await fx("npm-v3/package-lock.json"));
    expect(keys(pkgs)).toEqual(["@babel/core@7.22.0", "express@4.17.1", "lodash@4.17.15", "minimist@1.2.0", "ms@2.0.0", "qs@6.11.0", "qs@6.7.0"]);
    expect(pkgs.every((p) => p.ecosystem === "npm")).toBe(true);
    expect(pick(pkgs, "lodash").direct).toBe(true);
    expect(pick(pkgs, "@babel/core").direct).toBe(true); // devDependency
    expect(pick(pkgs, "minimist").direct).toBe(true); // declared by a workspace
    expect(pick(pkgs, "qs", "6.7.0").direct).toBe(false); // nested under express
    expect(pick(pkgs, "qs", "6.11.0").direct).toBe(false);
    expect(pick(pkgs, "ms").direct).toBe(false);
    // the root "" entry, the link:true workspace entry and the git dependency are not packages
    expect(pkgs.some((p) => p.name === "app" || p.name === "@app/ui" || p.name === "git-dep")).toBe(false);
  });

  it("reads a lockfileVersion 1 dependency tree, direct from package.json", async () => {
    const pkgs = parsePackageLock(await fx("npm-v1/package-lock.json"), await fx("npm-v1/package.json"));
    expect(keys(pkgs)).toEqual(["lodash@4.17.15", "minimist@0.0.8", "minimist@1.2.0", "mkdirp@0.5.1"]);
    expect(pick(pkgs, "lodash").direct).toBe(true);
    expect(pick(pkgs, "mkdirp").direct).toBe(false);
    expect(pick(pkgs, "minimist", "0.0.8").direct).toBe(false);
    // without the manifest, directness is unknown rather than guessed
    expect(parsePackageLock(await fx("npm-v1/package-lock.json")).every((p) => p.direct === null)).toBe(true);
  });

  it("reads a classic yarn v1 lock", async () => {
    const pkgs = parseYarnLock(await fx("yarn-v1/yarn.lock"), await fx("yarn-v1/package.json"));
    expect(keys(pkgs)).toEqual(["@babel/code-frame@7.12.13", "@babel/highlight@7.13.10", "lodash@4.17.15"]);
    expect(pick(pkgs, "@babel/code-frame").direct).toBe(true);
    expect(pick(pkgs, "lodash").direct).toBe(true);
    expect(pick(pkgs, "@babel/highlight").direct).toBe(false);
    expect(parseYarnLock(await fx("yarn-v1/yarn.lock")).every((p) => p.direct === null)).toBe(true);
  });

  it("reads a yarn berry lock: npm: keys, skips workspace and patch entries", async () => {
    const pkgs = parseYarnLock(await fx("yarn-berry/yarn.lock"), await fx("yarn-berry/package.json"));
    expect(keys(pkgs)).toEqual(["@types/node@20.1.0", "lodash@4.17.15", "typescript@5.0.4"]);
    expect(pick(pkgs, "lodash").direct).toBe(true);
    expect(pick(pkgs, "typescript").direct).toBe(true);
    expect(pick(pkgs, "@types/node").direct).toBe(false);
  });

  it("reads a pnpm v6 lock: /name@version keys, peer suffixes, top-level dependencies", async () => {
    const pkgs = parsePnpmLock(await fx("pnpm-v6/pnpm-lock.yaml"));
    expect(keys(pkgs)).toEqual(["@types/node@20.1.0", "lodash@4.17.15", "loose-envify@1.4.0", "react-dom@18.2.0"]);
    expect(pick(pkgs, "react-dom").direct).toBe(true);
    expect(pick(pkgs, "@types/node").direct).toBe(true);
    expect(pick(pkgs, "loose-envify").direct).toBe(false);
  });

  it("reads a pnpm v9 lock: unprefixed keys, quoted scopes, importers for directness", async () => {
    const pkgs = parsePnpmLock(await fx("pnpm-v9/pnpm-lock.yaml"));
    expect(keys(pkgs)).toEqual(["@types/node@20.1.0", "lodash@4.17.15", "loose-envify@1.4.0", "minimist@1.2.0", "react-dom@18.2.0"]);
    expect(pick(pkgs, "lodash").direct).toBe(true);
    expect(pick(pkgs, "react-dom").direct).toBe(true);
    expect(pick(pkgs, "minimist").direct).toBe(true); // declared by a workspace importer
    expect(pick(pkgs, "loose-envify").direct).toBe(false);
  });
});

describe("Python lockfiles", () => {
  it("poetry.lock: [[package]] blocks, names normalised, local packages skipped", async () => {
    const pkgs = parsePoetryLock(await fx("python/poetry.lock"));
    expect(keys(pkgs)).toEqual(["django@2.2.0", "pytz@2023.3"]);
    expect(pkgs.every((p) => p.ecosystem === "PyPI" && p.direct === null)).toBe(true);
  });

  it("Pipfile.lock: default and develop, editable entries skipped", async () => {
    const pkgs = parsePipfileLock(await fx("python/Pipfile.lock"));
    expect(keys(pkgs)).toEqual(["flask-cors@3.0.0", "pytest@7.0.0", "requests@2.19.0"]);
  });

  it("requirements.txt: exact pins only, the rest counted", async () => {
    const { packages, unpinned } = parseRequirements(await fx("python/requirements.txt"));
    expect(keys(packages)).toEqual(["django@2.2.0", "pyyaml@5.3", "requests@2.19.0"]);
    expect(packages.every((p) => p.direct === true)).toBe(true);
    expect(unpinned).toBe(2); // numpy>=1.20, flask
  });

  it("requirements from pip-compile are not all direct", () => {
    const { packages } = parseRequirements("django==2.2.0\n    # via -r requirements.in\nsqlparse==0.4.0\n    # via django\n");
    expect(packages.every((p) => p.direct === null)).toBe(true);
  });

  it("uv.lock: registry packages, the editable root defines direct", async () => {
    const pkgs = parseUvLock(await fx("python/uv.lock"));
    expect(keys(pkgs)).toEqual(["pytest@8.0.0", "requests@2.31.0", "urllib3@1.26.0"]);
    expect(pick(pkgs, "requests").direct).toBe(true);
    expect(pick(pkgs, "pytest").direct).toBe(true);
    expect(pick(pkgs, "urllib3").direct).toBe(false);
  });
});

describe("other ecosystems", () => {
  it("composer.lock: packages + packages-dev, v-prefix dropped, dev branches skipped", async () => {
    const pkgs = parseComposerLock(await fx("php/composer.lock"), await fx("php/composer.json"));
    expect(keys(pkgs)).toEqual(["phpunit/phpunit@9.5.0", "psr/log@1.1.4", "symfony/http-kernel@5.4.1"]);
    expect(pkgs.every((p) => p.ecosystem === "Packagist")).toBe(true);
    expect(pick(pkgs, "symfony/http-kernel").direct).toBe(true);
    expect(pick(pkgs, "psr/log").direct).toBe(false);
  });

  it("Gemfile.lock: GEM specs only, platform suffix dropped, DEPENDENCIES for direct", async () => {
    const pkgs = parseGemfileLock(await fx("ruby/Gemfile.lock"));
    expect(keys(pkgs)).toEqual(["actionpack@5.2.0", "actionview@5.2.0", "nokogiri@1.10.0", "rack@2.0.1"]);
    expect(pick(pkgs, "actionpack").direct).toBe(true);
    expect(pick(pkgs, "nokogiri").direct).toBe(true);
    expect(pick(pkgs, "rack").direct).toBe(false);
  });

  it("go.mod is the build list when present: indirect marks transitive, versions in OSV's spelling", async () => {
    const pkgs = parseGoModules(await fx("go/go.sum"), await fx("go/go.mod"));
    expect(keys(pkgs)).toEqual(["github.com/dgrijalva/jwt-go@3.2.0", "github.com/gin-gonic/gin@1.6.0", "golang.org/x/text@0.3.0"]);
    expect(pick(pkgs, "github.com/gin-gonic/gin").direct).toBe(true);
    expect(pick(pkgs, "golang.org/x/text").direct).toBe(false);
  });

  it("go.sum alone: /go.mod-only lines dropped, highest version per module", async () => {
    const pkgs = parseGoModules(await fx("go/go.sum"));
    // gin v1.4.0 and pkg/errors appear only as /go.mod lines: consulted, not built.
    expect(keys(pkgs)).toEqual(["github.com/dgrijalva/jwt-go@3.2.0", "github.com/gin-gonic/gin@1.6.0", "golang.org/x/text@0.3.0"]);
    expect(pkgs.every((p) => p.direct === null)).toBe(true);
  });

  it("Cargo.lock: registry crates only, the workspace member defines direct", async () => {
    const pkgs = parseCargoLock(await fx("rust/Cargo.lock"));
    expect(keys(pkgs)).toEqual(["serde@1.0.100", "smallvec@0.6.9", "time@0.1.43"]);
    expect(pkgs.every((p) => p.ecosystem === "crates.io")).toBe(true);
    expect(pick(pkgs, "serde").direct).toBe(true);
    expect(pick(pkgs, "smallvec").direct).toBe(true);
    expect(pick(pkgs, "time").direct).toBe(false);
  });

  it("pubspec.lock: hosted only, direct main/dev vs transitive", async () => {
    const pkgs = parsePubspecLock(await fx("dart/pubspec.lock"));
    expect(keys(pkgs)).toEqual(["http@0.13.0", "lints@2.0.0", "path@1.8.0"]);
    expect(pick(pkgs, "http").direct).toBe(true);
    expect(pick(pkgs, "lints").direct).toBe(true);
    expect(pick(pkgs, "path").direct).toBe(false);
  });

  it("recognises lockfiles by name, and ignores vendored, example and test trees", () => {
    expect(lockfileKind("package-lock.json")).toBe("package-lock");
    expect(lockfileKind("apps/web/pnpm-lock.yaml")).toBe("pnpm");
    expect(lockfileKind("requirements-dev.txt")).toBe("requirements");
    expect(lockfileKind("ios/Podfile.lock")).toBe("podfile");
    expect(lockfileKind("node_modules/foo/package-lock.json")).toBeNull();
    expect(lockfileKind("vendor/x/composer.lock")).toBeNull();
    expect(lockfileKind("examples/demo/yarn.lock")).toBeNull();
    expect(lockfileKind("test/fixtures/Cargo.lock")).toBeNull();
    expect(lockfileKind("README.md")).toBeNull();
  });
});

// ── Severity ────────────────────────────────────────────────────────────────

describe("severity", () => {
  it("computes CVSS 3.x base scores", () => {
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(9.8);
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N")).toBe(3.1);
    expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N")).toBe(6.1); // scope changed
    expect(cvss3BaseScore("CVSS:4.0/AV:N")).toBeNull();
  });

  it("prefers the GHSA label, falls back to the CVSS vector", () => {
    expect(advisorySeverity({ id: "a", database_specific: { severity: "MODERATE" }, severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] })).toBe("moderate");
    expect(advisorySeverity({ id: "b", severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] })).toBe("critical");
    expect(advisorySeverity({ id: "c", severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N" }] })).toBe("low");
    expect(advisorySeverity({ id: "d" })).toBe("unknown");
  });

  it("fixedIn is the lowest fix for the matching package, above the installed version", () => {
    const vuln = {
      id: "GHSA-x",
      affected: [
        { package: { ecosystem: "npm", name: "other" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "0.0.1" }] }] },
        { package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "4.0.0" }, { fixed: "4.17.21" }] }] },
        { package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "4.17.0" }, { fixed: "4.17.19" }] }] },
        { package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "3.10.2" }] }] },
      ],
    };
    expect(fixedVersionFor(vuln, { ecosystem: "npm", name: "lodash", version: "4.17.15" })).toBe("4.17.19");
    expect(fixedVersionFor(vuln, { ecosystem: "npm", name: "lodash", version: "3.0.0" })).toBe("3.10.2");
    expect(fixedVersionFor(vuln, { ecosystem: "PyPI", name: "lodash", version: "1" })).toBeNull();
  });
});

// ── OSV + the audit ─────────────────────────────────────────────────────────

interface FakeOsv {
  /** "ecosystem:name@version" → ids */
  matches: Record<string, string[]>;
  vulns: Record<string, Record<string, unknown>>;
  failBatch?: number;
}

function fakeFetch(osv: FakeOsv) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("/querybatch")) {
      if (osv.failBatch) return new Response("boom", { status: osv.failBatch });
      const body = JSON.parse(String(init?.body)) as { queries: { package: { ecosystem: string; name: string }; version: string }[] };
      return Response.json({
        results: body.queries.map((q) => {
          const ids = osv.matches[`${q.package.ecosystem}:${q.package.name}@${q.version}`] ?? [];
          return ids.length ? { vulns: ids.map((id) => ({ id, modified: "2024-01-01T00:00:00Z" })) } : {};
        }),
      });
    }
    const id = decodeURIComponent(u.split("/vulns/")[1] ?? "");
    const v = osv.vulns[id];
    return v ? Response.json(v) : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

const LODASH_VULN = {
  id: "GHSA-p6mc-m468-83gw",
  aliases: ["CVE-2020-8203"],
  summary: "Prototype Pollution in lodash",
  database_specific: { severity: "HIGH" },
  affected: [{ package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "3.7.0" }, { fixed: "4.17.19" }] }] }],
};
const LODASH_CRIT = {
  id: "GHSA-35jh-r3h4-6jhm",
  aliases: ["CVE-2021-23337"],
  details: "Command injection in template. More text follows here.",
  severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
  affected: [{ package: { ecosystem: "npm", name: "lodash" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "4.17.21" }] }] }],
};
const WITHDRAWN = { id: "GHSA-wwww-wwww-wwww", withdrawn: "2024-01-01T00:00:00Z", summary: "Withdrawn", database_specific: { severity: "CRITICAL" } };
const QS_LOW = {
  id: "GHSA-qqqq-qqqq-qqqq",
  summary: "qs low",
  severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N" }],
  affected: [{ package: { ecosystem: "npm", name: "qs" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "6.7.3" }] }] }],
};

let tmp: string | null = null;
afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = null;
});

/** Build a checkout from fixtures: { "path/in/repo": "fixture/path" or literal text }. */
async function checkout(files: Record<string, string | { text: string }>) {
  tmp = await mkdtemp(join(tmpdir(), "deps-test-"));
  for (const [rel, src] of Object.entries(files)) {
    const dest = join(tmp, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, typeof src === "string" ? await fx(src) : src.text);
  }
  return { dir: tmp, files: Object.keys(files) };
}

const NOW = () => Date.parse("2026-10-23T12:00:00Z");

describe("auditDependencies", () => {
  it("finds vulnerable packages, sorts worst first, counts packages by their worst severity", async () => {
    const co = await checkout({ "package-lock.json": "npm-v3/package-lock.json", "package.json": "npm-v3/package.json" });
    const { impl } = fakeFetch({
      matches: { "npm:lodash@4.17.15": [LODASH_VULN.id, LODASH_CRIT.id], "npm:qs@6.7.0": [QS_LOW.id] },
      vulns: { [LODASH_VULN.id]: LODASH_VULN, [LODASH_CRIT.id]: LODASH_CRIT, [QS_LOW.id]: QS_LOW },
    });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("checked");
    expect(audit.reason).toBeNull();
    expect(audit.checkedAt).toBe("2026-10-23T12:00:00.000Z");
    expect(audit.lockfiles).toEqual([{ path: "package-lock.json", ecosystem: "npm", packages: 7 }]);
    expect(audit.packages).toBe(7);
    expect(audit.vulnerable.map((v) => `${v.name}@${v.version}:${v.severity}`)).toEqual(["lodash@4.17.15:critical", "qs@6.7.0:low"]);
    const lodash = audit.vulnerable[0];
    expect(lodash.direct).toBe(true);
    expect(lodash.lockfile).toBe("package-lock.json");
    expect(lodash.advisories[0]).toEqual({
      id: LODASH_CRIT.id,
      aliases: ["CVE-2021-23337"],
      summary: "Command injection in template.",
      severity: "critical",
      fixedIn: "4.17.21",
      url: `https://osv.dev/vulnerability/${LODASH_CRIT.id}`,
    });
    expect(lodash.advisories[1]).toMatchObject({ id: LODASH_VULN.id, severity: "high", fixedIn: "4.17.19" });
    expect(audit.counts).toEqual({ critical: 1, high: 0, moderate: 0, low: 1, unknown: 0 });
  });

  it("skips withdrawn advisories, and a package left with none is not vulnerable", async () => {
    const co = await checkout({ "package-lock.json": "npm-v3/package-lock.json" });
    const { impl } = fakeFetch({
      matches: { "npm:lodash@4.17.15": [WITHDRAWN.id, LODASH_VULN.id], "npm:minimist@1.2.0": [WITHDRAWN.id] },
      vulns: { [WITHDRAWN.id]: WITHDRAWN, [LODASH_VULN.id]: LODASH_VULN },
    });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.vulnerable.map((v) => v.name)).toEqual(["lodash"]);
    expect(audit.vulnerable[0].advisories.map((a) => a.id)).toEqual([LODASH_VULN.id]);
    expect(audit.vulnerable[0].severity).toBe("high");
  });

  it("OSV failing is 'unavailable' with nothing claimed, never 'checked'", async () => {
    const co = await checkout({ "package-lock.json": "npm-v3/package-lock.json" });
    const { impl } = fakeFetch({ matches: { "npm:lodash@4.17.15": [LODASH_VULN.id] }, vulns: {}, failBatch: 500 });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("unavailable");
    expect(audit.vulnerable).toEqual([]);
    expect(audit.counts).toEqual({ critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 });
    expect(audit.reason).toMatch(/OSV/);
    expect(audit.reason).toMatch(/not checked/);
  });

  it("a network error is also 'unavailable' and does not throw", async () => {
    const co = await checkout({ "requirements.txt": "python/requirements.txt" });
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("unavailable");
    expect(audit.vulnerable).toEqual([]);
  });

  it("an advisory whose details cannot be read is still reported, by id, with unknown severity", async () => {
    const co = await checkout({ "requirements.txt": "python/requirements.txt" });
    const { impl } = fakeFetch({ matches: { "PyPI:django@2.2.0": ["PYSEC-2019-1"] }, vulns: {} });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("checked");
    expect(audit.vulnerable[0]).toMatchObject({ name: "django", severity: "unknown", advisories: [{ id: "PYSEC-2019-1", severity: "unknown" }] });
    expect(audit.reason).toMatch(/could not be read/);
    expect(audit.reason).toMatch(/2 requirements are not pinned/);
  });

  it("dedupes the same package across lockfiles, keeping direct if any lockfile says so", async () => {
    const co = await checkout({
      "package-lock.json": "npm-v1/package-lock.json", // lodash, no package.json → direct unknown
      "web/yarn.lock": "yarn-v1/yarn.lock",
      "web/package.json": "yarn-v1/package.json", // lodash direct here
    });
    const { impl, calls } = fakeFetch({ matches: { "npm:lodash@4.17.15": [LODASH_VULN.id] }, vulns: { [LODASH_VULN.id]: LODASH_VULN } });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.lockfiles.map((l) => `${l.path}:${l.packages}`)).toEqual(["package-lock.json:4", "web/yarn.lock:3"]);
    expect(audit.packages).toBe(6); // 4 + 3, lodash@4.17.15 counted once
    expect(audit.vulnerable).toHaveLength(1);
    expect(audit.vulnerable[0]).toMatchObject({ name: "lodash", direct: true, lockfile: "package-lock.json" });
    expect(calls.filter((c) => c.endsWith("/querybatch"))).toHaveLength(1);
  });

  it("follows next_page_token for a query", async () => {
    const pkgs: LockedPackage[] = [{ ecosystem: "npm", name: "lodash", version: "4.17.15", direct: true }];
    let round = 0;
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/querybatch")) {
        const body = JSON.parse(String(init?.body)) as { queries: { page_token?: string }[] };
        round++;
        if (!body.queries[0].page_token) return Response.json({ results: [{ vulns: [{ id: LODASH_VULN.id }], next_page_token: "p2" }] });
        return Response.json({ results: [{ vulns: [{ id: LODASH_CRIT.id }] }] });
      }
      const id = u.split("/vulns/")[1];
      return Response.json(id === LODASH_VULN.id ? LODASH_VULN : LODASH_CRIT);
    }) as typeof fetch;
    const r = await queryOsv(pkgs, impl);
    expect(round).toBe(2);
    expect(r.ok && r.advisories[0].map((a) => a.id).sort()).toEqual([LODASH_CRIT.id, LODASH_VULN.id].sort());
  });

  it("ignores lockfiles under node_modules/, examples/ and fixtures", async () => {
    const co = await checkout({
      "node_modules/x/package-lock.json": "npm-v3/package-lock.json",
      "examples/demo/yarn.lock": "yarn-v1/yarn.lock",
      "src/__tests__/fixtures/Gemfile.lock": "ruby/Gemfile.lock",
      "package.json": "npm-v3/package.json",
    });
    const { impl, calls } = fakeFetch({ matches: {}, vulns: {} });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("no_lockfile");
    expect(audit.reason).toBe("package.json has no lockfile, so versions are not pinned and cannot be checked against known vulnerabilities.");
    expect(calls).toEqual([]);
  });

  it("a Podfile.lock alone is named as not covered by OSV", async () => {
    const co = await checkout({ "ios/Podfile.lock": { text: "PODS:\n  - Alamofire (5.0.0)\n" }, "ios/Podfile": { text: "pod 'Alamofire'\n" } });
    const audit = await auditDependencies({ ...co, fetchImpl: fakeFetch({ matches: {}, vulns: {} }).impl, now: NOW });
    expect(audit.status).toBe("no_lockfile");
    expect(audit.reason).toMatch(/Podfile\.lock \(CocoaPods\) is not covered by the OSV/);
  });

  it("checks every supported ecosystem against OSV with OSV's names", async () => {
    const co = await checkout({
      "poetry.lock": "python/poetry.lock",
      "composer.lock": "php/composer.lock",
      "Gemfile.lock": "ruby/Gemfile.lock",
      "go.sum": "go/go.sum",
      "go.mod": "go/go.mod",
      "Cargo.lock": "rust/Cargo.lock",
      "app/pubspec.lock": "dart/pubspec.lock",
      "web/pnpm-lock.yaml": "pnpm-v9/pnpm-lock.yaml",
    });
    const seen = new Set<string>();
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { queries: { package: { ecosystem: string } }[] };
      for (const q of body.queries) seen.add(q.package.ecosystem);
      return Response.json({ results: body.queries.map(() => ({})) });
    }) as typeof fetch;
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("checked");
    expect(audit.vulnerable).toEqual([]);
    expect([...seen].sort()).toEqual(["Go", "Packagist", "Pub", "PyPI", "RubyGems", "crates.io", "npm"]);
    expect(audit.lockfiles.map((l) => l.ecosystem).sort()).toEqual(["Go", "Packagist", "Pub", "PyPI", "RubyGems", "crates.io", "npm"]);
  });

  it("a lockfile that cannot be parsed is named, and the rest are still checked", async () => {
    const co = await checkout({ "package-lock.json": { text: "{ not json" }, "requirements.txt": { text: "django==2.2.0\n" } });
    const { impl } = fakeFetch({ matches: {}, vulns: {} });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("checked");
    expect(audit.packages).toBe(1);
    expect(audit.reason).toMatch(/package-lock\.json could not be parsed/);
  });
});


// ── Maven (Gradle), NuGet and Swift: real lockfiles from public repositories ──

describe("Gradle, NuGet and Swift Package Manager lockfiles", () => {
  it("knows the three lockfile names, including Xcode's own Package.resolved", () => {
    expect(lockfileKind("gradle.lockfile")).toBe("gradle");
    expect(lockfileKind("src/packages.lock.json")).toBe("nuget");
    expect(lockfileKind("App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved")).toBe("swiftpm");
    expect(lockfileKind("packages.json")).toBeNull();
  });

  it("reads Netflix/maestro's gradle.lockfile: every pinned coordinate, never the comments or `empty=`", async () => {
    const pkgs = parseGradleLockfile(await fx("maven/gradle.lockfile"));
    expect(pkgs).toHaveLength(68);
    expect(pkgs.every((p) => p.ecosystem === "Maven")).toBe(true);
    expect(pick(pkgs, "com.github.spotbugs:spotbugs", "4.10.3")).toBeTruthy();
    expect(pkgs.some((p) => p.name.startsWith("empty") || p.name.startsWith("#"))).toBe(false);
  });

  it("reads a packages.lock.json, with Direct/Transitive and the repo's own projects left out", () => {
    const pkgs = parseNugetLock(JSON.stringify({
      version: 1,
      dependencies: {
        "net8.0": {
          "Newtonsoft.Json": { type: "Direct", requested: "[12.0.1, )", resolved: "12.0.1" },
          "System.Buffers": { type: "Transitive", resolved: "4.5.1" },
          "MyCompany.Core": { type: "Project" },
        },
      },
    }));
    expect(keys(pkgs)).toEqual(["Newtonsoft.Json@12.0.1", "System.Buffers@4.5.1"]);
    expect(pick(pkgs, "Newtonsoft.Json").direct).toBe(true);
    expect(pick(pkgs, "System.Buffers").direct).toBe(false);
  });

  it("reads a real packages.lock.json (WinMemoryCleaner)", async () => {
    const pkgs = parseNugetLock(await fx("nuget/packages.lock.json"));
    expect(pkgs).toHaveLength(9);
    expect(pick(pkgs, "NUnit", "2.6.4").direct).toBe(true);
  });

  it("reads stripe-ios's Package.resolved: a versioned pin is checked, a branch/revision pin is not", async () => {
    const pkgs = parsePackageResolved(await fx("swift/Package.resolved"));
    // ocmock and OHHTTPStubs are pinned to a revision with no version: nothing for OSV to compare.
    expect(keys(pkgs)).toEqual(["github.com/uber/ios-snapshot-test-case@8.0.0"]);
    expect(pkgs[0].ecosystem).toBe("SwiftURL");
  });

  it("reads the v1 Package.resolved layout too", () => {
    const pkgs = parsePackageResolved(JSON.stringify({
      object: { pins: [{ package: "swift-nio", repositoryURL: "https://github.com/apple/swift-nio.git", state: { version: "2.29.0" } }] },
      version: 1,
    }));
    expect(keys(pkgs)).toEqual(["github.com/apple/swift-nio@2.29.0"]);
  });

  it("names a Swift package the way OSV does: no scheme, no .git (with either, OSV finds nothing)", () => {
    expect(swiftUrlName("https://github.com/apple/swift-nio.git")).toBe("github.com/apple/swift-nio");
    expect(swiftUrlName("https://github.com/apple/swift-nio")).toBe("github.com/apple/swift-nio");
    expect(swiftUrlName("git@github.com:apple/swift-nio.git")).toBe("github.com/apple/swift-nio");
    expect(swiftUrlName("https://GitHub.com/apple/swift-nio/")).toBe("github.com/apple/swift-nio");
  });

  it("asks OSV about a Swift package under its OSV name, end to end", async () => {
    const co = await checkout({ "App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved": { text: JSON.stringify({
      pins: [{ identity: "swift-nio", kind: "remoteSourceControl", location: "https://github.com/apple/swift-nio.git", state: { version: "2.29.0" } }],
      version: 2,
    }) } });
    const NIO = {
      id: "GHSA-test-nio",
      summary: "swift-nio test advisory",
      database_specific: { severity: "HIGH" },
      affected: [{ package: { ecosystem: "SwiftURL", name: "github.com/apple/swift-nio" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "2.29.1" }] }] }],
    };
    const { impl } = fakeFetch({ matches: { "SwiftURL:github.com/apple/swift-nio@2.29.0": [NIO.id] }, vulns: { [NIO.id]: NIO } });
    const audit = await auditDependencies({ ...co, fetchImpl: impl, now: NOW });
    expect(audit.status).toBe("checked");
    expect(audit.vulnerable.map((v) => `${v.name}@${v.version}`)).toEqual(["github.com/apple/swift-nio@2.29.0"]);
  });
});
