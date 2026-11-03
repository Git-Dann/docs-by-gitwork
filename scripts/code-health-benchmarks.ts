/**
 * Measure well-known open-source codebases with Pulse's own code-health measure, so a
 * client's figures can be read against something ("complexity density 41" means nothing
 * on its own; "simpler than 9 of 14 reference frameworks" does).
 *
 *   node --max-old-space-size=8192 --liftoff-only --import tsx scripts/code-health-benchmarks.ts [cloneDir]
 *
 * For each reference: shallow-clone the latest STABLE release tag (never a moving branch,
 * so the figure is reproducible), list tracked files with `git ls-files`, and run
 * `analyseCheckout` — the exact function a Pulse scan runs, with the same skips, caps and
 * time budget. Writes src/server/code-health/benchmarks.json.
 *
 * ⚠️ Run it through node with `--liftoff-only` (V8 runs out of Zone memory optimising the
 * Swift grammar otherwise; the flag is refused in NODE_OPTIONS, so `npx tsx` cannot pass it).
 *
 * Must run from the repo root: the tree-sitter wasm files are resolved from
 * process.cwd()/node_modules (grammar.ts).
 *
 * ⚠️ Re-run whenever the measure changes (languages.ts, measure.ts, rules.ts, analyse.ts
 * skips). Comparing a client measured by today's rules with references measured by older
 * ones is the one thing this file must never do — bump MEASURE_VERSION when you re-run.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyseCheckout } from "@/server/code-health/analyse";
import type { CodeLanguage } from "@/types/code-health";

const MEASURE_VERSION = "code-health measure as of 2026-10 (analyse.ts + rules.ts score v1)";

interface Reference {
  name: string;
  repo: string;
  /** Picks the release tags to consider; capture group 1 is the version. */
  tag: RegExp;
}

// A stable tag is digits.digits(.digits) with no pre-release suffix.
const V = String.raw`(\d+\.\d+(?:\.\d+)?)`;
const tagRe = (prefix: string) => new RegExp(`^${prefix}${V}$`);

const REFERENCES: Reference[] = [
  { name: "Express", repo: "expressjs/express", tag: tagRe("v") },
  { name: "Fastify", repo: "fastify/fastify", tag: tagRe("v") },
  { name: "NestJS", repo: "nestjs/nest", tag: tagRe("v") },
  { name: "Radix Themes", repo: "radix-ui/themes", tag: tagRe("") },
  { name: "FastAPI", repo: "fastapi/fastapi", tag: tagRe("") },
  { name: "Flask", repo: "pallets/flask", tag: tagRe("") },
  { name: "Django", repo: "django/django", tag: tagRe("") },
  { name: "Laravel", repo: "laravel/framework", tag: tagRe("v") },
  { name: "Symfony Console", repo: "symfony/console", tag: tagRe("v") },
  { name: "Gson", repo: "google/gson", tag: tagRe("gson-parent-") },
  { name: "OkHttp", repo: "square/okhttp", tag: tagRe("parent-") },
  { name: "Exposed", repo: "JetBrains/Exposed", tag: tagRe("") },
  { name: "Gin", repo: "gin-gonic/gin", tag: tagRe("v") },
  { name: "chi", repo: "go-chi/chi", tag: tagRe("v") },
  { name: "Sinatra", repo: "sinatra/sinatra", tag: tagRe("v") },
  { name: "Rack", repo: "rack/rack", tag: tagRe("v") },
  { name: "Alamofire", repo: "Alamofire/Alamofire", tag: tagRe("") },
  { name: "Kingfisher", repo: "onevcat/Kingfisher", tag: tagRe("") },
  { name: "dart http", repo: "dart-lang/http", tag: tagRe("http-v") },
  { name: "Bloc", repo: "felangel/bloc", tag: tagRe("bloc-v") },
];

const git = (args: string[], cwd?: string) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();

function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function latestStableTag(ref: Reference): string | null {
  const out = git(["ls-remote", "--tags", "--refs", `https://github.com/${ref.repo}.git`]);
  let best: { tag: string; v: string } | null = null;
  for (const line of out.split("\n")) {
    const tag = line.replace(/^.*refs\/tags\//, "");
    const m = ref.tag.exec(tag);
    if (m && (!best || cmpVersion(m[1], best.v) > 0)) best = { tag, v: m[1] };
  }
  return best?.tag ?? null;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

async function main() {
  const root = process.argv[2] ?? join(process.cwd(), "..", "bench");
  mkdirSync(root, { recursive: true });
  const measured: unknown[] = [];
  const dropped: { name: string; repo: string; reason: string }[] = [];

  for (const ref of REFERENCES) {
    const t0 = Date.now();
    try {
      const tag = latestStableTag(ref);
      const dir = join(root, ref.repo.replace("/", "__"));
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      git(["clone", "--quiet", "--depth", "1", ...(tag ? ["--branch", tag] : []), `https://github.com/${ref.repo}.git`, dir]);
      const commit = git(["rev-parse", "HEAD"], dir);
      const files = git(["ls-files"], dir).split("\n").filter(Boolean);
      const { report } = await analyseCheckout({ repo: ref.repo, branch: tag, commit, dir, files });
      const loc = report.totals.loc;
      if (!loc) throw new Error("no production code measured");
      const primary = report.languages[0]?.language as CodeLanguage;
      const debt = Object.values(report.debtCounts).reduce((s, n) => s + n, 0);
      const entry = {
        name: ref.name,
        repo: ref.repo,
        ref: tag ?? "(default branch)",
        commit,
        measuredAt: report.measuredAt,
        language: primary,
        languages: report.languages,
        truncated: report.coverage.truncated,
        metrics: {
          score: report.score,
          loc,
          files: report.totals.files,
          complexityPerKloc: report.totals.complexityPerKloc,
          complexLocShare: report.totals.complexLocShare,
          averageComplexity: report.totals.averageComplexity,
          debtPerKloc: round((debt / loc) * 1000, 2),
          effortDaysPerKloc: round(((report.effort?.days ?? 0) / loc) * 1000, 3),
        },
      };
      measured.push(entry);
      console.log(
        `${ref.name.padEnd(16)} ${String(entry.ref).padEnd(22)} ${commit.slice(0, 8)} score ${report.score} loc ${loc} c/kloc ${entry.metrics.complexityPerKloc}` +
          `${report.coverage.truncated ? " TRUNCATED" : ""} (${Math.round((Date.now() - t0) / 1000)}s)`,
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message.split("\n")[0] : String(e);
      dropped.push({ name: ref.name, repo: ref.repo, reason });
      console.error(`DROPPED ${ref.name}: ${reason}`);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    measureVersion: MEASURE_VERSION,
    note: "Generated by scripts/code-health-benchmarks.ts. Do not edit by hand; re-run when the measure changes.",
    references: measured,
    dropped,
  };
  const target = join(process.cwd(), "src/server/code-health/benchmarks.json");
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${measured.length} references (${dropped.length} dropped) to ${target}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
