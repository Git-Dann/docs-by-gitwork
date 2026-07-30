// ─────────────────────────────────────────────────────────────────────────────
// CONTAINER FAMILY — Dockerfile and Compose, read as configuration.
//
// WHY THIS EXISTS. A Dockerfile is the densest security configuration most
// projects own, and Pulse had no checks for it at all. It decides:
//
//   • what user the process runs as (the default is root, and root in a container
//     is root on the host the moment anything escapes or a volume is mounted);
//   • what ends up in the image — a `COPY . .` with no .dockerignore ships the
//     .git directory and any .env sitting in the working tree, and every layer is
//     independently extractable regardless of what a later `RUN rm` deletes;
//   • where the base image comes from, and whether it can change under you.
//
// Rules follow Docker's own Dockerfile best-practices guide and the container
// sections of the CIS Docker Benchmark. Citations per check live in
// docs/platform-check-sources.md.
//
// SHAPE-AGNOSTIC on purpose: a containerised Django service, Node API and Go
// binary have the same failure modes, and the file is read the same way for all
// of them. Every check SKIPs when there is no Dockerfile — a project that does not
// ship a container is not failing at containerisation.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";

const MAX_QUOTED = 4;

export interface Dockerfile {
  path: string;
  text: string;
  /** Instruction lines with continuations joined, comments stripped. */
  lines: string[];
}

/** Join `\`-continued lines and drop comments, so one instruction is one entry. */
export function dockerInstructions(text: string): string[] {
  const out: string[] = [];
  let buffer = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s+/, "");
    if (line.startsWith("#")) continue;
    if (line.trim() === "" && buffer === "") continue;
    if (line.endsWith("\\")) {
      buffer += line.slice(0, -1).trimEnd() + " ";
      continue;
    }
    out.push((buffer + line).trim());
    buffer = "";
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out.filter(Boolean);
}

export function dockerfiles(snapshot: RepoSnapshot): Dockerfile[] {
  const out: Dockerfile[] = [];
  for (const [path, text] of snapshot.files) {
    const base = path.split("/").pop() ?? "";
    if (/^Dockerfile(\.[\w.-]+)?$/i.test(base) || /\.dockerfile$/i.test(base)) {
      out.push({ path, text, lines: dockerInstructions(text) });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function composeFiles(snapshot: RepoSnapshot): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const [path, text] of snapshot.files) {
    const base = path.split("/").pop() ?? "";
    if (/^(docker-)?compose(\.[\w.-]+)?\.ya?ml$/i.test(base)) out.push({ path, text });
  }
  return out;
}

/** Instructions of a given type, e.g. FROM / USER / RUN. */
function instr(df: Dockerfile, keyword: string): string[] {
  const re = new RegExp(`^${keyword}\\s+(.*)$`, "i");
  return df.lines.map((l) => re.exec(l)?.[1]?.trim()).filter((v): v is string => Boolean(v));
}

/**
 * The FINAL stage's instructions.
 *
 * ⚠️ Load-bearing for every runtime check here. A multi-stage build routinely runs
 * as root, installs compilers and pulls in secrets in an EARLY stage — none of
 * which ships. Grading the whole file treats a correct multi-stage build as a
 * failure, which is the fastest way to make a container family worthless.
 */
export function finalStage(df: Dockerfile): string[] {
  const fromIndexes = df.lines.map((l, i) => (/^FROM\s/i.test(l) ? i : -1)).filter((i) => i >= 0);
  if (fromIndexes.length === 0) return df.lines;
  return df.lines.slice(fromIndexes[fromIndexes.length - 1]);
}

/** Does the final stage set a non-root USER? */
export function runsAsNonRoot(df: Dockerfile): boolean {
  const stage = finalStage(df);
  const users = stage.map((l) => /^USER\s+(.+)$/i.exec(l)?.[1]?.trim()).filter((v): v is string => Boolean(v));
  if (users.length === 0) return false;
  const last = users[users.length - 1].split(":")[0].trim();
  return last !== "root" && last !== "0";
}

function quote(items: string[]): string {
  const shown = [...new Set(items)].slice(0, MAX_QUOTED);
  const more = new Set(items).size - shown.length;
  return shown.join(", ") + (more > 0 ? `, +${more} more` : "");
}

const CATALOGUE: [string, string][] = [
  ["docker_nonroot_user", "The container does not run as root"],
  ["docker_base_image_pinned", "Base images are pinned to a digest or explicit version"],
  ["docker_base_image_latest", "No base image tracks :latest"],
  ["docker_multistage_build", "Build tooling is not shipped in the runtime image"],
  ["docker_dockerignore", "A .dockerignore keeps secrets and git history out of the image"],
  ["docker_no_secrets_in_env", "No credential is baked into an image layer"],
  ["docker_no_copy_env_file", "No .env file is copied into the image"],
  ["docker_healthcheck", "The image declares a HEALTHCHECK"],
  ["docker_no_apt_upgrade", "The build does not run a distribution-wide upgrade"],
  ["docker_apt_cleanup", "Package manager caches are removed in the same layer"],
  ["docker_pinned_packages", "Installed packages are version-pinned"],
  ["docker_no_curl_pipe_sh", "The build does not pipe a remote script into a shell"],
  ["docker_no_add_remote", "ADD is not used to fetch remote URLs"],
  ["docker_exec_form_entrypoint", "ENTRYPOINT/CMD use exec form so signals reach the process"],
  ["docker_no_sudo", "The image does not install sudo"],
  ["docker_workdir_set", "A WORKDIR is set rather than relying on /"],
  ["docker_expose_documented", "The image documents the port it listens on"],
  ["docker_no_ssh_daemon", "No SSH daemon is installed in the image"],
  ["docker_slim_base", "The base image is a slim or distroless variant"],
  ["compose_no_privileged", "No Compose service runs privileged"],
  ["compose_no_host_network", "No Compose service joins the host network namespace"],
  ["compose_no_docker_socket", "No Compose service mounts the Docker socket"],
  ["compose_no_plaintext_secrets", "Compose does not carry literal credentials"],
  ["compose_restart_policy", "Compose services declare a restart policy"],
  ["compose_no_host_root_mount", "No Compose service bind-mounts a sensitive host path"],
  ["compose_pinned_images", "Compose services pin their image versions"],
];

export const CONTAINER_CHECK_KEYS: string[] = CATALOGUE.map(([k]) => k);

export function evaluateContainerChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const dfs = dockerfiles(snapshot);
  const composes = composeFiles(snapshot);
  const checks: PulseScanCheckInput[] = [];

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    evidence?: string,
  ) => {
    checks.push({
      category: CATEGORIES.BUILD_PIPELINE,
      checkKey,
      label,
      status,
      confidence: "HIGH",
      detail,
      ...(evidence ? { evidence } : {}),
    });
  };

  const skipAll = (keys: string[], reason: string) => {
    for (const [key, label] of CATALOGUE) {
      if (keys.includes(key)) add(key, label, "SKIPPED", reason);
    }
  };

  const dockerKeys = CATALOGUE.filter(([k]) => k.startsWith("docker_")).map(([k]) => k);
  const composeKeys = CATALOGUE.filter(([k]) => k.startsWith("compose_")).map(([k]) => k);

  if (dfs.length === 0) {
    skipAll(
      dockerKeys,
      "No Dockerfile was found in this repository, so the container family did not run. A project that deploys " +
        "without containers (a static site, a managed platform build, a mobile app) is not failing these checks — " +
        "they did not apply.",
    );
  } else {
    const allLines = dfs.flatMap((d) => d.lines);
    const name = (p: string) => p;

    // 1. Root user — the single highest-value container finding.
    const rootImages = dfs.filter((d) => !runsAsNonRoot(d));
    add(
      "docker_nonroot_user",
      "The container does not run as root",
      rootImages.length === 0 ? "PASS" : "FAIL",
      rootImages.length === 0
        ? "Every image's final stage drops to a non-root USER, so the application process has no more privilege " +
          "inside the container than it needs."
        : `${quote(rootImages.map((d) => name(d.path)))} never set a non-root USER in the final stage, so the ` +
          "process runs as root. Root in a container maps to root on the host for anything shared with it — a " +
          "bind-mounted directory is written as root, and any container escape starts from uid 0 rather than from " +
          "an unprivileged account. Add a `USER app` (with a matching adduser) as the last instruction. Only the " +
          "FINAL stage is graded, so a multi-stage build that compiles as root is unaffected.",
    );

    // 2/3. Base image provenance.
    const froms = dfs.flatMap((d) => instr(d, "FROM").map((f) => ({ file: d.path, ref: f.split(/\s+/)[0] })));
    const unpinned = froms.filter((f) => !/@sha256:[0-9a-f]{64}/i.test(f.ref) && !/:[\w.]+$/.test(f.ref));
    const latest = froms.filter((f) => /:latest$/i.test(f.ref) || !/[:@]/.test(f.ref));
    add(
      "docker_base_image_pinned",
      "Base images are pinned to a digest or explicit version",
      unpinned.length === 0 ? "PASS" : "WARN",
      unpinned.length === 0
        ? "Every FROM names an explicit tag or digest, so the base is at least nominally reproducible."
        : `${quote(unpinned.map((f) => f.ref))} are referenced with no tag or digest. The build resolves to whatever ` +
          "the registry currently serves, so two builds of the same commit can produce different images — including " +
          "different OS packages and a different set of known vulnerabilities.",
    );
    add(
      "docker_base_image_latest",
      "No base image tracks :latest",
      latest.length === 0 ? "PASS" : "WARN",
      latest.length === 0
        ? "No base image tracks the :latest tag."
        : `${quote(latest.map((f) => f.ref))} track :latest. That tag moves whenever the publisher pushes, so a ` +
          "rebuild can pick up a new major version of the runtime with no change on your side — the classic cause " +
          "of 'it built fine last week'.",
    );

    // 4. Multi-stage.
    const singleStageWithBuildTools = dfs.filter((d) => {
      const stages = d.lines.filter((l) => /^FROM\s/i.test(l)).length;
      const buildsHere = /\b(npm\s+(ci|install)|yarn\s+install|pip\s+install|go\s+build|mvn\s+package|gradle\s+build|cargo\s+build|make\b)/i.test(
        d.lines.join("\n"),
      );
      return stages <= 1 && buildsHere;
    });
    add(
      "docker_multistage_build",
      "Build tooling is not shipped in the runtime image",
      dfs.every((d) => d.lines.filter((l) => /^FROM\s/i.test(l)).length > 1)
        ? "PASS"
        : singleStageWithBuildTools.length > 0
          ? "WARN"
          : "PASS",
      singleStageWithBuildTools.length === 0
        ? "Images either use a multi-stage build or install no build toolchain, so compilers, dev dependencies and " +
          "package caches are not shipped to production."
        : `${quote(singleStageWithBuildTools.map((d) => d.path))} build in a single stage. Everything the build ` +
          "needed — compilers, headers, dev dependencies, the package cache — ships to production, which enlarges " +
          "both the image and the set of things an attacker can use once inside it.",
    );

    // 5. .dockerignore.
    const hasIgnore = [...snapshot.files.keys()].some((p) => /(^|\/)\.dockerignore$/i.test(p));
    const ignoreText = [...snapshot.files.entries()].find(([p]) => /(^|\/)\.dockerignore$/i.test(p))?.[1] ?? "";
    const copiesAll = allLines.some((l) => /^COPY\s+\.\s|^COPY\s+\.\/?\s/i.test(l) || /^ADD\s+\.\s/i.test(l));
    const ignoresGit = /(^|\n)\s*\.git\b/.test(ignoreText);
    const ignoresEnv = /(^|\n)\s*(\*\*\/)?\.env/.test(ignoreText) || /(^|\n)\s*\*\.env/.test(ignoreText);
    add(
      "docker_dockerignore",
      "A .dockerignore keeps secrets and git history out of the image",
      !copiesAll ? "SKIPPED" : hasIgnore && ignoresGit && ignoresEnv ? "PASS" : "WARN",
      !copiesAll
        ? "No Dockerfile copies the whole working directory, so there is no blanket-copy risk for a .dockerignore " +
          "to mitigate."
        : hasIgnore && ignoresGit && ignoresEnv
          ? "A .dockerignore is present and excludes both .git and .env files, so a `COPY . .` cannot carry history " +
            "or local secrets into the image."
          : !hasIgnore
            ? "A Dockerfile copies the entire working directory (`COPY . .`) and there is no .dockerignore. That " +
              "ships the .git directory — which contains every version of every file ever committed, including any " +
              "secret later removed — plus any .env, local database or editor state present at build time. Image " +
              "layers are individually extractable, so deleting the files in a later RUN does not remove them."
            : `A .dockerignore exists but does not exclude ${[!ignoresGit && ".git", !ignoresEnv && ".env"]
                .filter(Boolean)
                .join(" or ")}. With a \`COPY . .\` those are copied into the image.`,
    );

    // 6/7. Secrets in the image.
    const secretEnv = allLines.filter((l) =>
      /^(ENV|ARG)\s+\w*(SECRET|PASSWORD|TOKEN|API_?KEY|PRIVATE_KEY|CREDENTIAL)\w*\s*[= ]\s*\S/i.test(l),
    );
    const realSecretEnv = secretEnv.filter((l) => !/\$\{?\w+\}?\s*$/.test(l) && !/(=|\s)(""|''|<|\$)/.test(l));
    add(
      "docker_no_secrets_in_env",
      "No credential is baked into an image layer",
      realSecretEnv.length === 0 ? "PASS" : "FAIL",
      realSecretEnv.length === 0
        ? "No ENV or ARG instruction assigns a literal credential. Values supplied at runtime or left as build args " +
          "with no default are not baked into the image."
        : `${quote(realSecretEnv)} set a credential as a literal in the Dockerfile. Every ENV and ARG value is stored ` +
          "in the image metadata and is readable by anyone who can pull the image, with `docker history` — including " +
          "from a registry the image was later pushed to. Rotate the value; removing the line does not un-publish it.",
      realSecretEnv.slice(0, MAX_QUOTED).join(" | "),
    );
    const copiesEnvFile = allLines.filter((l) => /^(COPY|ADD)\s+[^\s]*\.env(\.\w+)?\s/i.test(l));
    add(
      "docker_no_copy_env_file",
      "No .env file is copied into the image",
      copiesEnvFile.length === 0 ? "PASS" : "FAIL",
      copiesEnvFile.length === 0
        ? "No instruction copies a .env file into the image."
        : `${quote(copiesEnvFile)} copy a .env file into the image, so the file — and every credential in it — is a ` +
          "permanent, extractable layer. Supply configuration at runtime with `--env-file`, a secret manager, or the " +
          "orchestrator's own secret mechanism.",
    );

    // 8-19. Runtime + build hygiene.
    const hasHealth = dfs.every((d) => finalStage(d).some((l) => /^HEALTHCHECK\s/i.test(l)));
    add(
      "docker_healthcheck",
      "The image declares a HEALTHCHECK",
      hasHealth ? "PASS" : "WARN",
      hasHealth
        ? "Images declare a HEALTHCHECK, so the orchestrator can tell a running process from a working one."
        : "No HEALTHCHECK is declared. Without one, a container counts as healthy the moment its process starts — " +
          "so an app that boots and then fails to connect to its database is left in the load-balancer pool serving " +
          "errors, and a rolling deploy of a broken build completes successfully.",
    );

    const distUpgrade = allLines.filter((l) => /^RUN\b.*\b(apt-get\s+(dist-)?upgrade|yum\s+update\s+-y\s*$|apk\s+upgrade)/i.test(l));
    add(
      "docker_no_apt_upgrade",
      "The build does not run a distribution-wide upgrade",
      distUpgrade.length === 0 ? "PASS" : "WARN",
      distUpgrade.length === 0
        ? "The build does not run a blanket distribution upgrade, so the base image's package set is what the " +
          "publisher tested."
        : "The build runs a distribution-wide upgrade. That makes the image non-reproducible — the same commit " +
          "produces different package versions on different days — and it is the wrong lever anyway: update the base " +
          "image tag instead, which is tested as a set.",
    );

    const aptRuns = allLines.filter((l) => /^RUN\b.*apt-get\s+install/i.test(l));
    const aptCleaned = aptRuns.every((l) => /rm\s+-rf\s+\/var\/lib\/apt\/lists|--no-install-recommends/i.test(l));
    add(
      "docker_apt_cleanup",
      "Package manager caches are removed in the same layer",
      aptRuns.length === 0 ? "SKIPPED" : aptCleaned ? "PASS" : "WARN",
      aptRuns.length === 0
        ? "The build installs no apt packages, so there is no apt cache to clean."
        : aptCleaned
          ? "apt installs clean their package lists in the same RUN, so the cache does not persist as a layer."
          : "An apt-get install does not remove /var/lib/apt/lists in the same RUN instruction. Because each " +
            "instruction is its own layer, cleaning up in a later RUN leaves the cache in the image regardless — it " +
            "has to happen in the same command to have any effect on image size.",
    );

    const unpinnedPkgs = allLines.filter((l) =>
      /^RUN\b.*(apt-get\s+install|apk\s+add|yum\s+install)/i.test(l) && !/[\w-]+[=@][\d]/.test(l),
    );
    add(
      "docker_pinned_packages",
      "Installed packages are version-pinned",
      aptRuns.length === 0 && unpinnedPkgs.length === 0 ? "SKIPPED" : unpinnedPkgs.length === 0 ? "PASS" : "WARN",
      unpinnedPkgs.length === 0
        ? "System packages are installed with explicit versions, or none are installed."
        : "System packages are installed without version pins, so the image contents depend on when it was built " +
          "rather than on what is in the repository. This is a reproducibility problem before it is a security one.",
    );

    const curlPipe = allLines.filter((l) => /^RUN\b.*(curl|wget)[^|]*\|\s*(sudo\s+)?(ba)?sh/i.test(l));
    add(
      "docker_no_curl_pipe_sh",
      "The build does not pipe a remote script into a shell",
      curlPipe.length === 0 ? "PASS" : "WARN",
      curlPipe.length === 0
        ? "No build step downloads a script and executes it directly."
        : `${quote(curlPipe)} fetch a remote script and pipe it straight into a shell. Whatever that URL serves at ` +
          "build time runs with full privileges inside the image, and it is never reviewed, pinned or checksummed. " +
          "Download to a file, verify a checksum, then run it.",
    );

    const addRemote = allLines.filter((l) => /^ADD\s+https?:\/\//i.test(l));
    add(
      "docker_no_add_remote",
      "ADD is not used to fetch remote URLs",
      addRemote.length === 0 ? "PASS" : "WARN",
      addRemote.length === 0
        ? "Remote files are not fetched with ADD."
        : "ADD is used with a remote URL. ADD silently fetches and, for archives, extracts — with no checksum " +
          "verification and no way to see what changed. Docker's own guidance is to prefer COPY, and to use RUN with " +
          "an explicit download and checksum when a remote file is genuinely needed.",
    );

    const entrypoints = dfs.flatMap((d) => finalStage(d).filter((l) => /^(ENTRYPOINT|CMD)\s/i.test(l)));
    const shellForm = entrypoints.filter((l) => !/\[\s*"/.test(l));
    add(
      "docker_exec_form_entrypoint",
      "ENTRYPOINT/CMD use exec form so signals reach the process",
      entrypoints.length === 0 ? "SKIPPED" : shellForm.length === 0 ? "PASS" : "WARN",
      entrypoints.length === 0
        ? "No ENTRYPOINT or CMD is declared in the final stage, so there is no form to grade."
        : shellForm.length === 0
          ? "ENTRYPOINT/CMD use the JSON exec form, so the application is PID 1 and receives SIGTERM directly."
          : `${quote(shellForm)} use shell form. The application then runs as a child of /bin/sh, which does not ` +
            "forward signals — so SIGTERM on shutdown never reaches it, the orchestrator waits out its grace period " +
            "and kills it. In-flight requests are dropped on every single deploy.",
    );

    const sudo = allLines.filter((l) => /^RUN\b.*\b(install|add)\b.*\bsudo\b/i.test(l));
    add(
      "docker_no_sudo",
      "The image does not install sudo",
      sudo.length === 0 ? "PASS" : "WARN",
      sudo.length === 0
        ? "sudo is not installed in the image."
        : "sudo is installed. A container has no need for privilege escalation — it is started with the privileges " +
          "it should have — and its presence gives an attacker who lands in the container a documented route to root.",
    );

    const hasWorkdir = dfs.every((d) => finalStage(d).some((l) => /^WORKDIR\s/i.test(l)));
    add(
      "docker_workdir_set",
      "A WORKDIR is set rather than relying on /",
      hasWorkdir ? "PASS" : "WARN",
      hasWorkdir
        ? "Each image sets an explicit WORKDIR."
        : "No WORKDIR is set in the final stage, so relative paths resolve against / and application files are " +
          "written into the filesystem root alongside system directories.",
    );

    const hasExpose = dfs.some((d) => d.lines.some((l) => /^EXPOSE\s/i.test(l)));
    const looksLikeService = /\b(node|python|gunicorn|uvicorn|puma|rails|nginx|java|dotnet|go)\b/i.test(
      entrypoints.join(" "),
    );
    add(
      "docker_expose_documented",
      "The image documents the port it listens on",
      !looksLikeService ? "SKIPPED" : hasExpose ? "PASS" : "WARN",
      !looksLikeService
        ? "This image does not appear to run a long-lived network service, so there is no port to document."
        : hasExpose
          ? "The image declares EXPOSE, documenting the port it serves on."
          : "The image runs a network service but declares no EXPOSE. It is documentation rather than enforcement, " +
            "but its absence means nobody reading the image — or tooling that inspects it — can tell what port to " +
            "route to.",
    );

    const sshd = allLines.filter((l) => /\b(openssh-server|sshd)\b/i.test(l));
    add(
      "docker_no_ssh_daemon",
      "No SSH daemon is installed in the image",
      sshd.length === 0 ? "PASS" : "FAIL",
      sshd.length === 0
        ? "No SSH server is installed in the image."
        : "An SSH daemon is installed in the image. That adds a second, separately-credentialed way in that does " +
          "not go through the orchestrator, is rarely patched on the image's own schedule, and usually ships with " +
          "keys or a password baked into the layer. `docker exec` and `kubectl exec` already provide shell access.",
    );

    const slim = froms.every((f) => /(-slim|-alpine|distroless|:.*-slim|scratch)/i.test(f.ref));
    add(
      "docker_slim_base",
      "The base image is a slim or distroless variant",
      slim ? "PASS" : "WARN",
      slim
        ? "Base images are slim, Alpine, distroless or scratch, so the runtime carries few packages beyond the " +
          "application itself."
        : `${quote(froms.map((f) => f.ref))} use a full distribution base. A full image carries hundreds of packages ` +
          "the application never calls — every one of which is attack surface that has to be patched and shows up in " +
          "vulnerability scans. A -slim or distroless variant usually needs no application change.",
    );
  }

  // ── Compose ────────────────────────────────────────────────────────────────
  if (composes.length === 0) {
    skipAll(
      composeKeys,
      "No Docker Compose file was found in this repository, so the Compose checks did not run.",
    );
    return checks;
  }

  const body = composes.map((c) => c.text).join("\n");
  const cname = (re: RegExp) => composes.filter((c) => re.test(c.text)).map((c) => c.path);

  const priv = cname(/privileged:\s*true/i);
  add(
    "compose_no_privileged",
    "No Compose service runs privileged",
    priv.length === 0 ? "PASS" : "FAIL",
    priv.length === 0
      ? "No service is declared privileged."
      : `${quote(priv)} declare privileged: true. That disables essentially every container isolation boundary — ` +
        "the process gets all capabilities and access to host devices, which makes escaping to the host " +
        "straightforward rather than difficult. If a specific capability is needed, grant that one with cap_add.",
  );

  const hostNet = cname(/network_mode:\s*["']?host/i);
  add(
    "compose_no_host_network",
    "No Compose service joins the host network namespace",
    hostNet.length === 0 ? "PASS" : "WARN",
    hostNet.length === 0
      ? "No service uses host networking."
      : `${quote(hostNet)} use network_mode: host. The container then shares the host's network stack, so every port ` +
        "it opens is bound on the host regardless of the ports mapping, and it can reach anything the host can — " +
        "including services intended to be internal.",
  );

  const dockerSock = cname(/\/var\/run\/docker\.sock/i);
  add(
    "compose_no_docker_socket",
    "No Compose service mounts the Docker socket",
    dockerSock.length === 0 ? "PASS" : "FAIL",
    dockerSock.length === 0
      ? "No service mounts /var/run/docker.sock."
      : `${quote(dockerSock)} mount the Docker socket into a container. Access to that socket is equivalent to root ` +
        "on the host: anything that can talk to it can start a new privileged container with the host filesystem " +
        "mounted. This is the most direct container-to-host escalation there is, and it is a configuration choice " +
        "rather than a vulnerability.",
  );

  const plaintextSecret = /(^|\n)\s{2,}[-\s]*\w*(PASSWORD|SECRET|TOKEN|API_?KEY)\w*[=:]\s*(?!\$\{|\$\w|""|''|\s*$)["']?[\w./+-]{6,}/i.test(
    body,
  );
  add(
    "compose_no_plaintext_secrets",
    "Compose does not carry literal credentials",
    plaintextSecret ? "FAIL" : "PASS",
    plaintextSecret
      ? "A Compose file sets a password, secret, token or API key to a literal value rather than reading it from " +
        "the environment. Compose files are committed, so the credential is in the repository and in its history. " +
        "Use `${VAR}` interpolation with a local .env that is gitignored, or Compose's own `secrets:` support."
      : "Credentials in Compose are supplied by interpolation rather than written in as literals.",
  );

  const restart = /restart:\s*(always|unless-stopped|on-failure)/i.test(body);
  add(
    "compose_restart_policy",
    "Compose services declare a restart policy",
    restart ? "PASS" : "WARN",
    restart
      ? "Services declare a restart policy, so a crashed container comes back rather than staying down."
      : "No service declares a restart policy. The default is `no`: a container that exits — because the process " +
        "crashed, or the host rebooted — stays stopped until someone notices and starts it by hand.",
  );

  const hostRoot = /-\s*["']?(\/|\/etc|\/root|\/home|\/var\/lib)(:|\/)/.test(body);
  add(
    "compose_no_host_root_mount",
    "No Compose service bind-mounts a sensitive host path",
    hostRoot ? "WARN" : "PASS",
    hostRoot
      ? "A service bind-mounts a sensitive host path (/, /etc, /root, /home or /var/lib). Combined with a container " +
        "running as root — the default — that grants read and write access to host configuration and credentials " +
        "from inside the container."
      : "No service bind-mounts the host filesystem root or a system directory.",
  );

  const composeImages = [...body.matchAll(/^\s*image:\s*["']?([^"'\s]+)/gim)].map((m) => m[1]);
  const unpinnedCompose = composeImages.filter((i) => /:latest$/i.test(i) || !/[:@]/.test(i));
  add(
    "compose_pinned_images",
    "Compose services pin their image versions",
    composeImages.length === 0 ? "SKIPPED" : unpinnedCompose.length === 0 ? "PASS" : "WARN",
    composeImages.length === 0
      ? "No Compose service references a pre-built image, so there is nothing to pin."
      : unpinnedCompose.length === 0
        ? "Compose services reference images with explicit tags rather than :latest."
        : `${quote(unpinnedCompose)} use :latest or no tag. The stack that comes up depends on when it was last ` +
          "pulled, so two environments running the same committed file can be on different database or cache major " +
          "versions.",
  );

  return checks;
}
