// ─────────────────────────────────────────────────────────────────────────────
// CLI TOOL / PUBLISHED npm PACKAGE CHECK FAMILY.
//
// WHY THIS EXISTS. "CLI tool" has been selectable in the scan dropdown since the
// beginning with ZERO checks behind it — and it is the most aggressive entry in
// the whole menu, skipping thirteen categories. So a CLI scan removed most of
// Pulse's web checks and put nothing in their place: the score came almost
// entirely from README/licence/CI hygiene.
//
// WHAT MAKES A CLI DIFFERENT. Two things, and both are about DISTRIBUTION rather
// than the code itself:
//
//   1. It runs on other people's machines with their privileges, installed by a
//      command most people run without reading. That makes npm lifecycle scripts,
//      `bin` naming and publish provenance security-critical in a way they never
//      are for an application you deploy yourself. npm is disabling install
//      scripts by default in v12 precisely because of this.
//
//   2. Its interface is argv, stdout/stderr and the exit code — a contract other
//      programs depend on. A CLI that writes errors to stdout, or exits 0 on
//      failure, silently breaks every script that pipes it, and no test in the
//      repo will notice.
//
// SCOPE. This family runs for a package with a `bin` entry that is not a web
// application and not `private: true` (see detectProjectShape). A private
// package is never published, so publishing hygiene cannot apply to it.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, stripCStyleComments } from "./native-mobile";
import { anyDependency, parsePackageManifest, type PackageManifest } from "./project-shape";

/** Below this sampled-file coverage, absence findings self-downgrade to LOW. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/**
 * Binary names that collide with something already on PATH.
 *
 * npm links every `bin` entry into `node_modules/.bin`, which npm puts FIRST on
 * PATH when running scripts. A dependency shipping a `bin` called `node` or `sh`
 * therefore intercepts those commands for every script in the installing project —
 * a shell-injection path that fires even under `--ignore-scripts`.
 */
const RESERVED_BIN_NAMES = new Set([
  "node", "npm", "npx", "yarn", "pnpm", "bun", "sh", "bash", "zsh", "env",
  "git", "python", "python3", "pip", "make", "cc", "gcc", "ls", "cat", "rm",
]);

/**
 * Lifecycle scripts npm runs automatically at install time on the user's machine.
 *
 * Written as an object rather than a three-string array on purpose:
 * categories.reconcile.test.ts reads every check module as TEXT and treats a bare
 * three-string array literal as a `[category, key, label]` tuple — so listing the
 * three script names that way had the middle one reported as an unregistered
 * checkKey. (Twice, in fact: once as real code, and once as the example in this
 * very comment explaining the first.) Restructuring here keeps that drift guard
 * strict; loosening its heuristic to accommodate this file would blunt the one
 * test that stops the catalogue silently drifting.
 */
const INSTALL_LIFECYCLE: Record<string, string> = {
  preinstall: "before the package's own dependencies are installed",
  install: "during installation",
  postinstall: "immediately after installation completes",
};

interface CliContext {
  pkg: PackageManifest;
  /** Sampled JS/TS source with comments stripped. */
  source: string;
  /** Raw source, comments intact. */
  sourceRaw: string;
  /** Contents of the files named by `bin`, where we managed to read them. */
  binSources: Map<string, string>;
  /** README contents, if read. */
  readme: string;
  /** CI workflow contents joined. */
  ci: string;
  /** Sampled fraction of the repo's JS/TS files (0–1). */
  coverage: number;
  paths: string[];
}

/** Normalise `bin` — it is either a string (name = package name) or a map. */
export function binEntries(pkg: PackageManifest): Array<{ name: string; path: string }> {
  const bin = pkg.bin;
  if (!bin) return [];
  if (typeof bin === "string") {
    const name = (pkg.name ?? "").split("/").pop() ?? "";
    return name ? [{ name, path: bin }] : [];
  }
  return Object.entries(bin).map(([name, path]) => ({ name, path: String(path) }));
}

function buildContext(snapshot: RepoSnapshot, pkg: PackageManifest): CliContext {
  const jsPaths = snapshot.paths.filter((p) => /\.(js|mjs|cjs|ts)$/i.test(p) && !isVendoredPath(p));
  const read: string[] = [];
  const binSources = new Map<string, string>();
  let readme = "";
  let ci = "";

  const binPaths = new Set(binEntries(pkg).map((b) => b.path.replace(/^\.\//, "").toLowerCase()));

  for (const [path, text] of snapshot.files) {
    const lower = path.toLowerCase();
    if (/^readme(\.md|\.markdown|\.rst|\.txt)?$/i.test(path)) readme += "\n" + text;
    else if (/^\.github\/workflows\/.*\.ya?ml$/i.test(path)) ci += "\n" + text;
    else if (/\.(js|mjs|cjs|ts|tsx)$/i.test(path) && !isVendoredPath(path)) {
      read.push(text);
      if (binPaths.has(lower)) binSources.set(path, text);
    }
    if (binPaths.has(lower)) binSources.set(path, text);
  }

  const sourceRaw = read.join("\n");
  return {
    pkg,
    source: stripCStyleComments(sourceRaw),
    sourceRaw,
    binSources,
    readme,
    ci,
    coverage: jsPaths.length === 0 ? 0 : Math.min(1, read.length / jsPaths.length),
    paths: snapshot.paths,
  };
}

function absence(ctx: CliContext, check: Omit<PulseScanCheckInput, "confidence">): PulseScanCheckInput {
  const sound = ctx.coverage >= SOUND_ABSENCE_COVERAGE;
  return {
    ...check,
    confidence: sound ? "HIGH" : "LOW",
    detail: sound
      ? check.detail
      : `${check.detail} (Based on ${Math.round(ctx.coverage * 100)}% of this project's source files — below the ` +
        `threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`,
  };
}

export function evaluateCliChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const pkgText = snapshot.files.get("package.json") ?? null;
  const pkg = parsePackageManifest(pkgText);
  if (!pkg) return [];

  const ctx = buildContext(snapshot, pkg);
  return [
    ...supplyChainChecks(ctx),
    ...packagingChecks(ctx),
    ...interfaceChecks(ctx),
  ];
}

// ── Supply chain ────────────────────────────────────────────────────────────
function supplyChainChecks(ctx: CliContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const scripts = ctx.pkg.scripts ?? {};

  // Install lifecycle scripts run automatically on the installing machine.
  const installScripts = Object.keys(INSTALL_LIFECYCLE).filter(
    (s) => typeof scripts[s] === "string" && scripts[s].trim() !== "",
  );
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "cli_install_scripts",
    label: "No automatic install-time scripts",
    status: installScripts.length === 0 ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: installScripts.length === 0
      ? `No preinstall/install/postinstall scripts — nothing of yours executes automatically when someone installs ` +
        `this package.`
      : `This package declares ${installScripts.map((s) => `\`${s}\``).join(", ")}, which npm executes on the ` +
        `installing machine, with that user's privileges, as part of \`npm install\`. That is the mechanism behind ` +
        `essentially every npm supply-chain worm, and it is why pnpm, Yarn and Bun already block install scripts by ` +
        `default and npm is doing the same in v12 — so this will also start silently NOT running for many of your ` +
        `users. If the script builds a native binding or downloads a platform binary, move it to first-run or to a ` +
        `postinstall the user opts into; if it only builds your own TypeScript, move it to \`prepack\` so it runs at ` +
        `publish time instead.`,
    evidence: installScripts.join(", "),
  });

  // A bin name that shadows a real command.
  const bins = binEntries(ctx.pkg);
  const collisions = bins.filter((b) => RESERVED_BIN_NAMES.has(b.name.toLowerCase()));
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "cli_bin_name_safe",
    label: "Binary names do not shadow system commands",
    status: collisions.length === 0 ? "PASS" : "FAIL",
    confidence: "HIGH",
    detail: collisions.length === 0
      ? `${bins.length} binary name(s) declared, none colliding with a common system command.`
      : `The \`bin\` field declares ${collisions.map((c) => `\`${c.name}\``).join(", ")}. npm links every bin into ` +
        `\`node_modules/.bin\`, which it places FIRST on PATH when running scripts — so in any project that installs ` +
        `this package, your binary intercepts that command for every npm script. This works even under ` +
        `\`--ignore-scripts\`, and it is indistinguishable from a deliberate hijack. Rename it to something ` +
        `namespaced to this tool.`,
    evidence: collisions.map((c) => c.name).join(", ") || undefined,
  });

  // Publish provenance — cryptographic proof the artefact came from this repo.
  const provenanceInPkg = ctx.pkg.publishConfig?.provenance === true;
  const provenanceInCi = /--provenance|id-token:\s*write/i.test(ctx.ci);
  const trustedPublish = /npm publish/i.test(ctx.ci);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "cli_publish_provenance",
    label: "Releases are published with provenance",
    status: provenanceInPkg || provenanceInCi ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: provenanceInPkg || provenanceInCi
      ? `Publish provenance is configured, so each release carries a signed attestation linking it to this repository ` +
        `and the workflow that built it.`
      : `No publish provenance found (\`publishConfig.provenance\` or \`--provenance\` with \`id-token: write\` in CI). ` +
        `Provenance is what lets an installer verify that the tarball on the registry was built from this source by ` +
        `your CI, rather than published from a laptop with a stolen token — the exact attack that has hit multiple ` +
        `widely-used packages. It is a few lines in a GitHub Actions workflow${trustedPublish
          ? " and you already publish from CI, so this is close to free"
          : ", and moving publishing into CI is the prerequisite"}.`,
  });

  // A committed lockfile is what makes a build reproducible and auditable.
  const hasLockfile = ctx.paths.some((p) => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(p));
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "cli_lockfile_committed",
    label: "A dependency lockfile is committed",
    status: hasLockfile ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: hasLockfile
      ? `A lockfile is committed, so CI and contributors resolve the same dependency tree.`
      : `No lockfile committed. Every install then resolves ranges afresh, so the code your CI tests is not ` +
        `necessarily the code you publish, and a compromised patch release of a transitive dependency is pulled in ` +
        `silently with no diff to review. Commit the lockfile and use \`npm ci\` in CI.`,
  });

  // Secrets in source ship in the tarball.
  const SECRET_LITERAL = /(api[_-]?key|apiKey|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i;
  if (SECRET_LITERAL.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "cli_embedded_secret",
      label: "No secrets embedded in the published package",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A long secret-shaped literal appears in source. Whatever is in the published tarball is public the moment it ` +
        `reaches the registry, and unpublishing does not recall the copies already mirrored and cached. Rotate the ` +
        `key, then read it from an environment variable or a config file in the user's home directory at runtime.`,
    });
  }

  // Accepting a secret as a command-line argument leaks it to `ps` and history.
  const secretArg = /--(api[-_]?key|token|password|secret)\b/i.test(ctx.sourceRaw + ctx.readme);
  if (secretArg) {
    const supportsEnv = /process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "cli_secret_via_argv",
      label: "Secrets are not passed as command-line arguments",
      status: supportsEnv ? "WARN" : "FAIL",
      confidence: "MEDIUM",
      detail: supportsEnv
        ? `A \`--token\`/\`--password\`-style flag is documented, and environment-variable input is also supported. ` +
          `Prefer the environment variable in your documented examples — whichever one the README shows is the one ` +
          `people will paste.`
        : `A secret is accepted as a command-line argument. Anything in argv is visible to every other process on the ` +
          `machine via \`ps\`, is written verbatim into the user's shell history file, and is captured in CI logs. ` +
          `Read it from an environment variable or prompt on stdin instead, and keep the flag only as a deprecated ` +
          `alias if you must.`,
    });
  }

  return checks;
}

// ── Packaging correctness ───────────────────────────────────────────────────
function packagingChecks(ctx: CliContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const pkg = ctx.pkg;

  // `files` (or .npmignore) controls what actually ships. Its absence is how
  // .env files and local notes end up on the registry.
  const hasFiles = Array.isArray(pkg.files) && pkg.files.length > 0;
  const hasNpmignore = ctx.paths.some((p) => /^\.npmignore$/i.test(p));
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "cli_files_allowlist",
    label: "Published contents are explicitly allow-listed",
    status: hasFiles ? "PASS" : hasNpmignore ? "WARN" : "WARN",
    confidence: "HIGH",
    detail: hasFiles
      ? `A \`files\` allow-list is declared, so only the listed paths are published.`
      : hasNpmignore
        ? `Publishing is controlled by \`.npmignore\`, which is a DENY-list — anything new you add is published by ` +
          `default until someone remembers to exclude it. A \`files\` allow-list in package.json inverts that and is ` +
          `the safer default.`
        : `Neither a \`files\` allow-list nor \`.npmignore\`. npm then publishes almost the entire working directory, ` +
          `which is how local \`.env\` files, scratch scripts and internal notes end up publicly downloadable from ` +
          `the registry. Add a \`files\` array listing only the built output and the README, and verify with ` +
          `\`npm pack --dry-run\`.`,
  });

  // engines.node — without it, the package installs on runtimes it cannot run on.
  const enginesNode = pkg.engines?.node;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_engines_declared",
    label: "A supported Node version range is declared",
    status: enginesNode ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: enginesNode
      ? `\`engines.node\` is \`${enginesNode}\`.`
      : `No \`engines.node\` range. The package will install cleanly on any Node version and then fail at runtime with ` +
        `a syntax error or a missing built-in — which reads to the user as "this tool is broken" rather than "I am on ` +
        `Node 16". Declaring a range makes the failure happen at install time with an actionable message, and it is ` +
        `what hosting platforms read to pick a build runtime.`,
    evidence: enginesNode,
  });

  // A shebang on the bin entry, or the file is not executable as a command.
  const bins = binEntries(pkg);
  if (bins.length > 0) {
    const readBins = bins.filter((b) => {
      const key = b.path.replace(/^\.\//, "");
      return ctx.binSources.has(key) || [...ctx.binSources.keys()].some((k) => k.toLowerCase() === key.toLowerCase());
    });
    const missingShebang = readBins.filter((b) => {
      const entry = [...ctx.binSources.entries()].find(([k]) => k.toLowerCase() === b.path.replace(/^\.\//, "").toLowerCase());
      return entry ? !entry[1].startsWith("#!") : false;
    });
    // Only assert when we actually read the file — a bin pointing at built output
    // that isn't committed is normal and must not be reported as missing.
    if (readBins.length > 0) {
      checks.push({
        category: CATEGORIES.CODE_QUALITY,
        checkKey: "cli_bin_shebang",
        label: "Executable entry points start with a shebang",
        status: missingShebang.length === 0 ? "PASS" : "FAIL",
        confidence: "HIGH",
        detail: missingShebang.length === 0
          ? `Every readable \`bin\` entry begins with a \`#!\` line.`
          : `${missingShebang.map((b) => `\`${b.path}\``).join(", ")} has no \`#!/usr/bin/env node\` shebang. On ` +
            `macOS and Linux npm symlinks the bin file directly, so the shell executes it as a script in whatever ` +
            `language it guesses — the user gets a syntax error from \`sh\`, not from Node. It works on Windows ` +
            `(npm generates a wrapper .cmd there), which is exactly why this ships undetected from a Windows machine.`,
        evidence: missingShebang.map((b) => b.path).join(", ") || undefined,
      });
    }
  }

  // Metadata that determines whether the package is usable and findable.
  //
  // Written out rather than generated from a loop: a computed `checkKey` cannot be
  // matched by categories.reconcile.test.ts, which is the guard that stops a check
  // emitting a key the registry has never heard of. A template literal here would
  // silently opt these three out of the only mechanism that keeps the catalogue honest.
  const metadata: Array<[string, string, boolean, string]> = [
    ["cli_pkg_license", "license", Boolean(pkg.license),
      "Without a licence field the package is legally \"all rights reserved\" by default — many companies' "
      + "dependency policies block unlicensed packages outright, and nobody can safely contribute to it."],
    ["cli_pkg_description", "description", Boolean(pkg.description && pkg.description.length > 10),
      "The description is what appears in registry search results and in `npm ls` output — without one the package "
      + "is hard to find and unidentifiable inside someone else's dependency tree."],
    ["cli_pkg_repository", "repository", Boolean(pkg.repository),
      "Without a `repository` field the registry page has no source link, so users cannot read the code they are "
      + "about to execute on their machine, file an issue, or check provenance."],
  ];
  for (const [checkKey, field, present, why] of metadata) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey,
      label: `package.json declares ${field}`,
      status: present ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: present ? `\`${field}\` is declared.` : `No \`${field}\` in package.json. ${why}`,
    });
  }

  // Type declarations, for a package written in TypeScript.
  const isTypeScript = ctx.paths.some((p) => /\.ts$/i.test(p) && !isVendoredPath(p) && !/\.d\.ts$/i.test(p));
  if (isTypeScript) {
    const shipsTypes = Boolean(pkg.types) || Boolean(pkg.exports) ||
      ctx.paths.some((p) => /\.d\.ts$/i.test(p));
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "cli_types_published",
      label: "TypeScript declarations are published",
      status: shipsTypes ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: shipsTypes
        ? `Type declarations are declared via \`types\`/\`exports\`.`
        : `The package is written in TypeScript but declares no \`types\` entry and ships no \`.d.ts\`. Anyone ` +
          `importing it programmatically gets \`any\`, losing exactly the safety the source was written with — and ` +
          `the compiler will error under \`noImplicitAny\`. Set \`types\` (or a \`types\` condition in \`exports\`) ` +
          `and emit declarations.`,
    });
  }

  return checks;
}

// ── Command-line interface contract ─────────────────────────────────────────
function interfaceChecks(ctx: CliContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const allSource = ctx.source + [...ctx.binSources.values()].join("\n");

  // An argument parser gives --help, --version, validation and error messages for
  // free. Hand-rolled argv slicing is where the missing pieces below come from.
  const parser = anyDependency(
    ctx.pkg,
    /^(commander|yargs|meow|cac|minimist|arg|clipanion|oclif|@oclif\/|citty|sade|caporal|args)$/,
  ) || /parseArgs\s*\(/.test(allSource);
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_argument_parser",
    label: "Uses a real argument parser",
    status: parser ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: parser
      ? `An argument parser is in use, so flags, help text and validation are handled consistently.`
      : `No argument-parsing library and no \`util.parseArgs\` found — arguments appear to be read straight from ` +
        `\`process.argv\`. Hand-rolled parsing is where CLIs lose \`--help\`, mis-handle \`--flag=value\` versus ` +
        `\`--flag value\`, silently ignore typo'd flags, and accept \`-\` filenames as options. Node ships ` +
        `\`util.parseArgs\` in core, so this no longer needs a dependency.`,
  });

  // --help. The single most-used feature of any CLI.
  const hasHelp = parser || /--help|showHelp|printUsage|\bhelp\b\s*:/i.test(allSource);
  checks.push(absence(ctx, {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_help_flag",
    label: "Responds to --help",
    status: hasHelp ? "PASS" : "WARN",
    detail: hasHelp
      ? `Help output is handled.`
      : `No \`--help\` handling found. It is the first thing anyone types against an unfamiliar command, and without ` +
        `it the tool is only usable by people who already read the README — which, for a CLI, is a minority of the ` +
        `people running it.`,
  }));

  // --version. Needed for any bug report to be actionable.
  const hasVersion = parser || /--version|\bversion\b\s*:|require\(.*package\.json.*\)\.version|pkg\.version/i.test(allSource);
  checks.push(absence(ctx, {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_version_flag",
    label: "Responds to --version",
    status: hasVersion ? "PASS" : "WARN",
    detail: hasVersion
      ? `Version output is handled.`
      : `No \`--version\` handling found. Every bug report then begins with a round trip to establish which version ` +
        `the user is on, and users have no way to confirm an upgrade actually took effect.`,
  }));

  // Non-zero exit on failure. This is the contract that CI and shell scripts read.
  const exitsNonZero = /process\.exit\s*\(\s*[1-9]|process\.exitCode\s*=\s*[1-9]/.test(allSource);
  checks.push(absence(ctx, {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_exit_codes",
    label: "Exits non-zero on failure",
    status: exitsNonZero ? "PASS" : "WARN",
    detail: exitsNonZero
      ? `A non-zero exit code is set on failure paths.`
      : `No \`process.exit(1)\` or \`process.exitCode\` assignment found. A CLI that always exits 0 reports success ` +
        `even when it failed, so \`&&\` chains continue, CI steps go green, and a broken deploy proceeds. The exit ` +
        `code is the only part of your interface that automation actually reads.`,
  }));

  // Errors on stderr, not stdout — otherwise piping the tool mixes them into data.
  const usesStderr = /console\.error|process\.stderr\.write/.test(allSource);
  checks.push(absence(ctx, {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_stderr_for_errors",
    label: "Errors are written to stderr",
    status: usesStderr ? "PASS" : "WARN",
    detail: usesStderr
      ? `Errors are written to stderr, so piping stdout carries only the tool's data.`
      : `No \`console.error\`/\`process.stderr\` use found — diagnostics appear to go to stdout. Anyone piping this ` +
        `tool into another (\`tool | jq\`) then gets error text mixed into the data stream, which breaks the parse ` +
        `instead of surfacing the error. Data on stdout, everything else on stderr.`,
  }));

  // Colour output should respect NO_COLOR and non-TTY stdout.
  const usesColour = anyDependency(ctx.pkg, /^(chalk|kleur|picocolors|colorette|ansi-colors|colors)$/) ||
    /\[\d+m|\\x1b\[\d+m/.test(ctx.sourceRaw);
  if (usesColour) {
    const respectsTty = /NO_COLOR|isTTY|FORCE_COLOR|supportsColor/i.test(allSource) ||
      anyDependency(ctx.pkg, /^(chalk|picocolors|kleur|colorette)$/);
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "cli_color_respects_tty",
      label: "Colour output respects NO_COLOR and non-TTY output",
      status: respectsTty ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: respectsTty
        ? `Colour handling goes through a library that detects TTY and honours NO_COLOR/FORCE_COLOR.`
        : `Raw ANSI escape codes are emitted with no \`isTTY\` or \`NO_COLOR\` check. When the output is redirected to ` +
          `a file or piped into another program, the escape sequences go with it — log files fill with \`\\x1b[32m\` ` +
          `and downstream parsers break on data that no longer matches. Use a library like \`picocolors\` that ` +
          `disables itself automatically, or gate on \`process.stdout.isTTY\`.`,
    });
  }

  // A README with usage. For a CLI the README IS the documentation.
  const hasUsage = /```[\s\S]{0,40}(\$|npx|npm i|yarn|pnpm)|\n#+\s*(usage|getting started|install)/i.test(ctx.readme);
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "cli_readme_usage",
    label: "README documents installation and usage",
    status: ctx.readme ? (hasUsage ? "PASS" : "WARN") : "WARN",
    confidence: ctx.readme ? "HIGH" : "MEDIUM",
    detail: !ctx.readme
      ? `No README was read for this repository. For a CLI the README is the entire documentation surface — it is ` +
        `what the registry page shows and the only thing most users will read.`
      : hasUsage
        ? `The README carries an install/usage section with example commands.`
        : `The README has no usage section with runnable example commands. A CLI's README is rendered as the package ` +
          `page on the registry and is the only documentation most users see; without a copy-pasteable first command, ` +
          `the adoption cost is a support conversation per user.`,
  });

  // Unhandled promise rejections in a CLI produce a bare stack trace and, on
  // modern Node, a hard crash — with no indication of what the user did wrong.
  const handlesRejections = /unhandledRejection|uncaughtException|\.catch\s*\(/.test(allSource);
  checks.push(absence(ctx, {
    category: CATEGORIES.OBSERVABILITY,
    checkKey: "cli_error_handling",
    label: "Top-level errors are handled",
    status: handlesRejections ? "PASS" : "WARN",
    detail: handlesRejections
      ? `Error handling is present on async entry points.`
      : `No top-level \`.catch\`, \`unhandledRejection\` or \`uncaughtException\` handling found. An async failure ` +
        `then surfaces as a raw Node stack trace referring to your internal file paths — which tells the user ` +
        `nothing about what they did wrong, and on current Node versions terminates the process abruptly. Catch at ` +
        `the entry point and print a message that names the problem and the fix.`,
    }));

  // Node built-ins that the package would need declared to work cross-platform.
  if (/require\(['"]child_process['"]\)|from\s+['"]child_process['"]/.test(ctx.source)) {
    const usesExecSync = /\bexec(Sync)?\s*\(\s*[`'"]/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "cli_shell_injection",
      label: "Child processes are spawned without a shell",
      status: usesExecSync ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: usesExecSync
        ? `\`exec\`/\`execSync\` runs its argument through a shell, so any user-supplied value interpolated into that ` +
          `string is a command-injection point — a filename containing \`; rm -rf\` is enough. Use \`execFile\` or ` +
          `\`spawn\` with an argument ARRAY, which passes arguments to the program directly and never involves a shell.`
        : `Child processes are spawned without going through a shell.`,
    });
  }

  return checks;
}
