import { describe, it, expect } from "vitest";
import { evaluateContainerChecks } from "../containers";
import type { RepoSnapshot } from "../native-mobile";

function snap(files: Record<string, string>, unreadPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...unreadPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const byKey = (checks: ReturnType<typeof evaluateContainerChecks>, key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

// Shape of calcom/cal.com's root Dockerfile.
const CALCOM = [
  "FROM --platform=$BUILDPLATFORM node:20 AS builder",
  "WORKDIR /calcom",
  "ARG DATABASE_URL",
  "ARG NEXTAUTH_SECRET=secret",
  "ARG CALENDSO_ENCRYPTION_KEY=secret",
  "COPY . .",
  "RUN yarn install",
  "FROM node:20 AS builder-two",
  "WORKDIR /calcom",
  "COPY --from=builder /calcom ./",
  "FROM node:20 AS runner",
  "WORKDIR /calcom",
  "RUN apt-get update && apt-get install -y --no-install-recommends netcat-openbsd wget && rm -rf /var/lib/apt/lists/*",
  "COPY --from=builder-two /calcom ./",
  "ENV NODE_ENV=production",
  "EXPOSE 3000",
  "HEALTHCHECK --interval=30s --timeout=30s --retries=5 \\",
  "  CMD wget --spider http://localhost:3000 || exit 1",
  'CMD ["/calcom/scripts/start.sh"]',
  "",
].join("\n");

// djangoproject.com's Dockerfile (single stage, purges build deps in the same RUN).
const DJANGO = [
  "FROM python:3.12-slim-trixie",
  "WORKDIR /usr/src/app",
  "RUN apt-get update \\",
  "    && apt-get install --assume-yes --no-install-recommends \\",
  "        gettext git postgresql-common make rsync \\",
  "    && apt-get distclean",
  "ARG REQ_FILE=requirements/prod.txt",
  'ARG BUILD_DEPENDENCIES="g++ gcc libc6-dev libpq-dev zlib1g-dev"',
  "COPY ./requirements ./requirements",
  "RUN apt-get update \\",
  "    && apt-get install --assume-yes --no-install-recommends ${BUILD_DEPENDENCIES} \\",
  "    && python3 -m pip install --no-cache-dir -r ${REQ_FILE} \\",
  "    && apt-get purge --assume-yes --auto-remove ${BUILD_DEPENDENCIES} \\",
  "    && apt-get distclean",
  "COPY . .",
  "RUN python -m django compilemessages --ignore .venv",
  "",
].join("\n");

describe("FROM parsing (docker_base_image_latest / docker_slim_base)", () => {
  it("does not read --platform as an image reference", () => {
    const checks = evaluateContainerChecks(snap({ Dockerfile: CALCOM }));
    expect(byKey(checks, "docker_base_image_latest").status).toBe("PASS");
    const slim = byKey(checks, "docker_slim_base");
    expect(slim.status).toBe("WARN"); // node:20 really is a full base
    expect(slim.detail).toContain("node:20");
    expect(slim.detail).not.toContain("--platform");
  });

  it("does not treat an earlier stage alias as an untagged image", () => {
    const text = "FROM node:22-slim AS base\nFROM base AS build\nRUN npm ci\nFROM base\nUSER node\n";
    const checks = evaluateContainerChecks(snap({ Dockerfile: text }));
    expect(byKey(checks, "docker_base_image_latest").status).toBe("PASS");
    expect(byKey(checks, "docker_slim_base").status).toBe("PASS");
  });

  it("still warns on a real :latest or untagged base, flags included", () => {
    expect(
      byKey(evaluateContainerChecks(snap({ Dockerfile: "FROM --platform=linux/amd64 node:latest\nUSER node\n" })), "docker_base_image_latest").status,
    ).toBe("WARN");
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: "FROM node\nUSER node\n" })), "docker_base_image_latest").status).toBe(
      "WARN",
    );
  });
});

describe("docker_no_secrets_in_env grades only what ships", () => {
  it("passes a placeholder ARG in a discarded builder stage", () => {
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: CALCOM })), "docker_no_secrets_in_env").status).toBe("PASS");
  });

  it("still fails a literal credential in the final stage", () => {
    const text = "FROM node:20 AS build\nRUN npm ci\nFROM node:20-slim\nENV API_KEY=" + "sk_" + "live_realvalue123\nUSER node\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_no_secrets_in_env").status).toBe("FAIL");
  });

  it("still fails a credential inherited through FROM <stage>", () => {
    const text = "FROM node:20-slim AS base\nENV API_KEY=" + "sk_" + "live_realvalue123\nFROM base\nUSER node\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_no_secrets_in_env").status).toBe("FAIL");
  });
});

describe("docker_multistage_build wording", () => {
  it("keeps the WARN for a single-stage build but does not claim everything ships", () => {
    const c = byKey(evaluateContainerChecks(snap({ Dockerfile: DJANGO })), "docker_multistage_build");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toContain("Everything the build needed");
    expect(c.detail).toContain("did not remove in the same RUN");
  });

  it("passes a multi-stage build", () => {
    const text = "FROM node:22-slim AS build\nRUN npm ci\nFROM node:22-slim\nUSER node\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_multistage_build").status).toBe("PASS");
  });
});

describe("docker_healthcheck", () => {
  const WITH = "FROM node:22-slim\nUSER node\nHEALTHCHECK CMD node hc.js\nCMD [\"node\", \"a.js\"]\n";
  const WITHOUT = "FROM node:20-alpine\nUSER node\nCMD [\"npm\", \"run\", \"start\"]\n";

  it("names only the Dockerfiles that lack a HEALTHCHECK", () => {
    const c = byKey(
      evaluateContainerChecks(snap({ "apps/studio/Dockerfile": WITH, "apps/lite-studio/Dockerfile": WITHOUT })),
      "docker_healthcheck",
    );
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("apps/lite-studio/Dockerfile");
    expect(c.detail).not.toContain("apps/studio/Dockerfile");
    expect(c.detail).not.toContain("No HEALTHCHECK is declared");
  });

  it("is inconclusive, not PASS, when other Dockerfiles were not read", () => {
    const c = byKey(evaluateContainerChecks(snap({ Dockerfile: WITH }, ["apps/api/v2/Dockerfile"])), "docker_healthcheck");
    expect(c.status).toBe("INCONCLUSIVE");
  });

  it("passes when every Dockerfile was read and declares one", () => {
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: WITH })), "docker_healthcheck").status).toBe("PASS");
  });

  it("still warns when the only Dockerfile has none", () => {
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: WITHOUT })), "docker_healthcheck").status).toBe("WARN");
  });
});

describe("compose_no_docker_socket", () => {
  // supabase .agents/skills/test-the-docs/sandbox/compose.yaml (trimmed).
  const DIND = [
    "services:",
    "  dind:",
    "    image: docker:27-dind",
    "    privileged: true",
    "    command: ['dockerd', '--host=tcp://0.0.0.0:2375', '--host=unix:///var/run/docker.sock']",
    "  runner-stack:",
    "    environment:",
    "      DOCKER_HOST: tcp://127.0.0.1:2375",
    "    volumes:",
    "      - type: bind",
    "        source: ${TTD_WORK_DIR:?set TTD_WORK_DIR}",
    "        target: /work",
    "",
  ].join("\n");

  it("does not fail dockerd's own socket flag inside a DinD service", () => {
    const checks = evaluateContainerChecks(snap({ ".agents/sandbox/compose.yaml": DIND }));
    expect(byKey(checks, "compose_no_docker_socket").status).toBe("PASS");
    expect(byKey(checks, "compose_no_privileged").status).toBe("FAIL");
  });

  it("fails a real mount with a variable host side (supabase docker-compose.logs.yml)", () => {
    const body = "services:\n  vector:\n    image: timberio/vector:0.28.1-alpine\n    volumes:\n      - ${DOCKER_SOCKET_LOCATION}:/var/run/docker.sock:ro,z\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker/docker-compose.logs.yml": body })), "compose_no_docker_socket").status).toBe(
      "FAIL",
    );
  });

  it("fails a long-form bind mount", () => {
    const body = "services:\n  a:\n    image: x:1\n    volumes:\n      - type: bind\n        source: /var/run/docker.sock\n        target: /var/run/docker.sock\n";
    expect(byKey(evaluateContainerChecks(snap({ "compose.yaml": body })), "compose_no_docker_socket").status).toBe("FAIL");
  });

  it("is inconclusive when other compose files were not read", () => {
    const c = byKey(
      evaluateContainerChecks(snap({ ".agents/sandbox/compose.yaml": DIND }, ["docker/docker-compose.logs.yml"])),
      "compose_no_docker_socket",
    );
    expect(c.status).toBe("INCONCLUSIVE");
  });
});

describe("compose_no_plaintext_secrets", () => {
  // djangoproject.com docker-compose.yml (trimmed).
  const DJANGO_COMPOSE = [
    "services:",
    "    web:",
    "        command: python manage.py runserver 0.0.0.0:8000",
    "        environment:",
    "            - SECRET_KEY=foo",
    "            - SQL_PASSWORD=secret",
    "            - TRAC_PASSWORD=secret",
    "    db:",
    "        image: postgres:17-trixie",
    "        environment:",
    "            - POSTGRES_PASSWORD=secret",
    "",
  ].join("\n");

  it("downgrades placeholder dev credentials to WARN", () => {
    const c = byKey(evaluateContainerChecks(snap({ "docker-compose.yml": DJANGO_COMPOSE })), "compose_no_plaintext_secrets");
    expect(c.status).toBe("WARN");
    expect(c.detail).toContain("placeholder");
  });

  it("still fails a non-placeholder literal", () => {
    const body = "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: hunter2secret\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": body })), "compose_no_plaintext_secrets").status).toBe("FAIL");
  });

  it("still fails when a real literal sits alongside placeholders", () => {
    const body = DJANGO_COMPOSE + "            - STRIPE_API_KEY=" + "sk_" + "live_51Habcdef\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": body })), "compose_no_plaintext_secrets").status).toBe("FAIL");
  });

  it("passes interpolation", () => {
    const body = "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: ${DB_PASSWORD}\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": body })), "compose_no_plaintext_secrets").status).toBe("PASS");
  });
});

describe("compose_restart_policy", () => {
  const NO_RESTART = "services:\n  runner:\n    image: node:22-slim\n    command: ['sleep', 'infinity']\n";

  it("does not claim absence when other compose files were not read", () => {
    const c = byKey(
      evaluateContainerChecks(snap({ ".agents/sandbox/compose.yaml": NO_RESTART }, ["docker/docker-compose.yml"])),
      "compose_restart_policy",
    );
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).not.toContain("No service declares a restart policy");
  });

  it("still warns when every compose file was read and none declares a policy", () => {
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": NO_RESTART })), "compose_restart_policy").status).toBe("WARN");
  });

  it("recognises quoted and unquoted policies", () => {
    const quoted = "services:\n  a:\n    image: x:1\n    restart: \"unless-stopped\"\n";
    const plain = "services:\n  a:\n    image: x:1\n    restart: unless-stopped\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": quoted })), "compose_restart_policy").status).toBe("PASS");
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": plain })), "compose_restart_policy").status).toBe("PASS");
  });
});

// Reviewer follow-ups for the revised fixes: each narrowed a FAIL, so each gets a case
// whose verdict must NOT have changed.
describe("revisions keep their negative cases", () => {
  it("docker_no_secrets_in_env: a global ARG default before the first FROM still FAILs", () => {
    const text = "ARG API_TOKEN=" + "sk_" + "live_abcdef123\nFROM node:20-slim\nARG API_TOKEN\nRUN ./deploy.sh\nUSER node\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_no_secrets_in_env").status).toBe("FAIL");
  });

  it("compose_no_docker_socket: a flow-style volumes list mounting the socket still FAILs", () => {
    const quoted = 'services:\n  a:\n    image: x:1\n    volumes: ["/var/run/docker.sock:/var/run/docker.sock"]\n';
    const bare = "services:\n  a:\n    image: x:1\n    volumes: [/var/run/docker.sock:/tmp/docker.sock]\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": quoted })), "compose_no_docker_socket").status).toBe("FAIL");
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": bare })), "compose_no_docker_socket").status).toBe("FAIL");
  });

  it("compose_no_plaintext_secrets: a real value that merely starts with a placeholder word FAILs", () => {
    const text = "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: postgres!Prod2024\n";
    expect(byKey(evaluateContainerChecks(snap({ "docker-compose.yml": text })), "compose_no_plaintext_secrets").status).toBe("FAIL");
  });

  it("compose_no_plaintext_secrets: with nothing literal read but an unread compose file, it is INCONCLUSIVE at LOW", () => {
    const text = "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n";
    const c = byKey(
      evaluateContainerChecks(snap({ "docker-compose.yml": text }, ["docker/docker-compose.prod.yml"])),
      "compose_no_plaintext_secrets",
    );
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.confidence).toBe("LOW");
    // Fully read: still a confident PASS.
    const full = byKey(evaluateContainerChecks(snap({ "docker-compose.yml": text })), "compose_no_plaintext_secrets");
    expect(full.status).toBe("PASS");
    expect(full.confidence).toBe("HIGH");
  });

  it("docker_base_image_pinned: a stage alias is not reported as an unpinned image, a real one still is", () => {
    const aliased = "FROM node:22.4.1-slim AS base\nFROM base AS build\nRUN npm ci\nFROM base\nUSER node\n";
    const pinned = byKey(evaluateContainerChecks(snap({ Dockerfile: aliased })), "docker_base_image_pinned");
    // A hyphenated variant tag (22.4.1-slim) is a tag, and "base" is a stage, not an image.
    expect(pinned.status).toBe("PASS");
    const untagged = "FROM node\nUSER node\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: untagged })), "docker_base_image_pinned").status).toBe("WARN");
    const registryPort = "FROM registry.local:5000/team/app\nUSER node\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: registryPort })), "docker_base_image_pinned").status).toBe("WARN");
  });
});
