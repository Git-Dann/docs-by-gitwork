#!/usr/bin/env node
// Mirror the permissively-licensed starter upstreams into the Gitwork-owned starter library
// (Git-Dann/starter-library) so the library never depends on someone else's repo staying up.
//
// Usage:
//   node scripts/mirror-starters.mjs --dry-run                 # show the plan, write nothing
//   node scripts/mirror-starters.mjs --dest ../starter-library # clone + assemble into <dest>
//
// It shallow-clones each `mirror` entry from scripts/starters/mirror-manifest.json, pins the
// commit SHA, strips .git, keeps the upstream LICENSE (fails loudly if one is missing), writes a
// per-folder SOURCE.md, and emits top-level manifest.json + NOTICES.md + README.md. Idempotent:
// re-running refreshes each folder to the latest upstream commit. Licence-blocked upstreams
// (`excluded`) are never cloned — they're rewritten Gitwork-native.
//
// No dependencies — Node built-ins only. Requires `git` on PATH.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(scriptDir, "starters", "mirror-manifest.json");
// Match LICENSE / LICENCE / License.md / COPYING / UNLICENSE / LICENSE-MIT, etc.
const LICENSE_RE = /^(licen[sc]e|copying|unlicense)/i;

function parseArgs(argv) {
  const args = { dryRun: false, dest: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--dest") args.dest = argv[++i];
  }
  return args;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
}

function hasLicense(dir) {
  return readdirSync(dir).some((f) => LICENSE_RE.test(f));
}

function targetFor(dest, slug, slugCounts, repo) {
  const repoName = repo.split("/").pop();
  return slugCounts[slug] > 1 ? join(dest, slug, repoName) : join(dest, slug);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const { mirror, excluded, noSource } = manifest;

  const slugCounts = {};
  for (const e of mirror) slugCounts[e.slug] = (slugCounts[e.slug] ?? 0) + 1;

  console.log(`\nStarter library mirror → ${manifest.destRepo}`);
  console.log(`  ${mirror.length} repos to mirror · ${excluded.length} excluded (licence) · ${noSource.length} no-source\n`);

  if (args.dryRun || !args.dest) {
    console.log("PLAN (no writes):");
    for (const e of mirror) {
      const rel = slugCounts[e.slug] > 1 ? `${e.slug}/${e.repo.split("/").pop()}` : e.slug;
      console.log(`  mirror   ${e.repo}  (${e.licence})  →  <dest>/${rel}`);
    }
    for (const e of excluded) console.log(`  EXCLUDE  ${e.repo}  (${e.licence}) — ${e.reason}`);
    for (const e of noSource) console.log(`  no-source ${e.slug} — ${e.reason}`);
    if (!args.dest) console.log("\nPass --dest <path-to-cloned-starter-library> to write.");
    return;
  }

  const dest = args.dest;
  if (!existsSync(dest)) {
    console.error(`\nError: --dest "${dest}" does not exist. Create + clone Git-Dann/starter-library first.`);
    process.exit(1);
  }

  const retrieved = new Date().toISOString().slice(0, 10);
  const records = [];
  const skipped = [];

  for (const e of mirror) {
    const url = `https://github.com/${e.repo}`;
    const target = targetFor(dest, e.slug, slugCounts, e.repo);
    console.log(`\n→ ${e.repo}  →  ${target}`);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });

    git(["clone", "--depth", "1", url, target]);
    const sha = git(["rev-parse", "HEAD"], target);
    rmSync(join(target, ".git"), { recursive: true, force: true });

    // Compliance guard: never vendor a repo without its licence. Skip + report rather than
    // abort the whole run, so one problem repo doesn't block the rest.
    if (!hasLicense(target)) {
      console.warn(`  ⚠ No LICENSE file in ${e.repo} — skipping (won't vendor without its licence).`);
      rmSync(target, { recursive: true, force: true });
      skipped.push({ ...e, reason: "No LICENSE file at repo root" });
      continue;
    }

    writeFileSync(
      join(target, "SOURCE.md"),
      `# Source\n\n- Upstream: ${url}\n- Licence: ${e.licence}\n- Pinned commit: ${sha}\n- Retrieved: ${retrieved}\n\nMirrored into the Gitwork starter library. The upstream LICENSE is retained in this folder.\n`,
    );
    records.push({ slug: e.slug, repo: e.repo, url, licence: e.licence, sha, retrieved, path: target.replace(`${dest}/`, "") });
    console.log(`  ✓ ${sha.slice(0, 8)} (${e.licence})`);
  }

  writeFileSync(join(dest, "manifest.json"), JSON.stringify({ destRepo: manifest.destRepo, retrieved, mirrored: records, skipped, excluded, noSource }, null, 2) + "\n");

  const noticesRows = records.map((r) => `- **${r.path}** — [${r.repo}](${r.url}) · ${r.licence} · \`${r.sha.slice(0, 8)}\``).join("\n");
  writeFileSync(
    join(dest, "NOTICES.md"),
    `# Third-party notices\n\nEach folder retains its upstream LICENSE. Mirrored ${retrieved}.\n\n${noticesRows}\n\n## Excluded (not mirrored)\n\n${excluded.map((e) => `- ${e.repo} — ${e.licence}: ${e.reason}`).join("\n")}\n`,
  );

  writeFileSync(
    join(dest, "README.md"),
    `# Gitwork Starter Library\n\nGitwork-owned mirror of the Prompt→Production starter sources, so the library never depends on an upstream staying online. One folder per starter (a starter with several sources is subfoldered).\n\nGenerated by \`scripts/mirror-starters.mjs\` in \`docs-by-gitwork\`. See \`manifest.json\` for pinned commits and \`NOTICES.md\` for licences. Re-run the script to refresh.\n\nLicence-blocked upstreams are excluded and rewritten Gitwork-native — see \`NOTICES.md\`.\n`,
  );

  if (skipped.length) {
    console.log(`\n⚠ Skipped ${skipped.length} (no LICENSE found): ${skipped.map((s) => s.repo).join(", ")}`);
  }
  console.log(`\n✓ Mirrored ${records.length} repos into ${dest}. Review, then commit & push to ${manifest.destRepo}.`);
}

main();
