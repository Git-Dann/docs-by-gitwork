import { describe, it, expect } from "vitest";
import {
  CONTAINER_CHECK_KEYS,
  dockerInstructions,
  evaluateContainerChecks,
  finalStage,
  runsAsNonRoot,
} from "../containers";
import type { RepoSnapshot } from "../native-mobile";

function snap(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: Object.keys(files),
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

// A correct multi-stage Dockerfile. The negative control for the whole family.
const GOOD = `
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-install-recommends
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
RUN adduser --system --no-create-home app
COPY --from=build /app/dist ./dist
EXPOSE 3000
HEALTHCHECK CMD node healthcheck.js
USER app
ENTRYPOINT ["node", "dist/server.js"]
`;

describe("Dockerfile reading", () => {
  it("joins backslash continuations into one instruction", () => {
    const lines = dockerInstructions("RUN apt-get update \\\n && apt-get install -y curl \\\n && rm -rf /var/lib/apt/lists/*\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("apt-get install");
    expect(lines[0]).toContain("rm -rf /var/lib/apt/lists");
  });

  it("drops comments", () => {
    expect(dockerInstructions("# a comment\nFROM alpine\n")).toEqual(["FROM alpine"]);
  });
});

describe("multi-stage awareness", () => {
  // The single most important property of this family. A correct multi-stage build
  // installs compilers and runs as root in an EARLY stage; grading the whole file
  // reports every well-built image as a failure.
  it("finalStage starts at the last FROM", () => {
    const df = { path: "Dockerfile", text: GOOD, lines: dockerInstructions(GOOD) };
    const stage = finalStage(df);
    expect(stage.some((l) => l.includes("npm run build"))).toBe(false);
    expect(stage.some((l) => l.startsWith("USER app"))).toBe(true);
  });

  it("a build stage running as root does not fail the image", () => {
    const df = { path: "Dockerfile", text: GOOD, lines: dockerInstructions(GOOD) };
    expect(runsAsNonRoot(df)).toBe(true);
  });

  it("USER root in the final stage is still root", () => {
    const text = "FROM alpine\nUSER app\nUSER root\n";
    expect(runsAsNonRoot({ path: "d", text, lines: dockerInstructions(text) })).toBe(false);
  });

  it("uid 0 is root", () => {
    const text = "FROM alpine\nUSER 0:0\n";
    expect(runsAsNonRoot({ path: "d", text, lines: dockerInstructions(text) })).toBe(false);
  });
});

describe("no container files", () => {
  it("skips every check rather than failing a project that ships no container", () => {
    const checks = evaluateContainerChecks(snap({ "package.json": "{}" }));
    expect(checks).toHaveLength(CONTAINER_CHECK_KEYS.length);
    expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
  });
});

describe("stays quiet on a well-built image", () => {
  const checks = evaluateContainerChecks(
    snap({ Dockerfile: GOOD, ".dockerignore": ".git\n.env\nnode_modules\n" }),
  );

  it("reports no failures", () => {
    expect(checks.filter((c) => c.status === "FAIL").map((c) => c.checkKey)).toEqual([]);
  });

  for (const key of [
    "docker_nonroot_user",
    "docker_multistage_build",
    "docker_dockerignore",
    "docker_no_secrets_in_env",
    "docker_healthcheck",
    "docker_exec_form_entrypoint",
    "docker_workdir_set",
    "docker_slim_base",
    "docker_no_ssh_daemon",
  ]) {
    it(`${key} passes`, () => expect(byKey(checks, key).status).toBe("PASS"));
  }
});

describe("root user", () => {
  it("fails an image with no USER instruction", () => {
    const text = "FROM node:22\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"a.js\"]\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_nonroot_user").status).toBe("FAIL");
  });
});

describe("secrets in layers", () => {
  it("fails a literal credential in ENV", () => {
    const text = "FROM alpine\nENV API_KEY=sk_live_realvalue123\nUSER app\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_no_secrets_in_env").status).toBe("FAIL");
  });

  it("stays quiet when the value comes from a build arg at runtime", () => {
    const text = "FROM alpine\nARG API_KEY\nENV API_KEY=$API_KEY\nUSER app\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_no_secrets_in_env").status).toBe("PASS");
  });

  it("fails a copied .env file", () => {
    const text = "FROM alpine\nCOPY .env /app/.env\nUSER app\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_no_copy_env_file").status).toBe("FAIL");
  });
});

describe(".dockerignore", () => {
  it("warns when COPY . . has no .dockerignore at all", () => {
    const text = "FROM alpine\nCOPY . .\nUSER app\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_dockerignore").status).toBe("WARN");
  });

  it("warns when the .dockerignore exists but misses .env", () => {
    const checks = evaluateContainerChecks(
      snap({ Dockerfile: "FROM alpine\nCOPY . .\nUSER app\n", ".dockerignore": ".git\n" }),
    );
    expect(byKey(checks, "docker_dockerignore").status).toBe("WARN");
  });

  it("skips when nothing does a blanket copy — there is no risk to mitigate", () => {
    const text = "FROM alpine\nCOPY dist/ /app/dist/\nUSER app\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_dockerignore").status).toBe("SKIPPED");
  });
});

describe("entrypoint form", () => {
  it("warns on shell form, which breaks graceful shutdown", () => {
    const text = "FROM alpine\nUSER app\nCMD node server.js\n";
    expect(byKey(evaluateContainerChecks(snap({ Dockerfile: text })), "docker_exec_form_entrypoint").status).toBe("WARN");
  });
});

describe("compose", () => {
  const compose = (body: string) => evaluateContainerChecks(snap({ "docker-compose.yml": body }));

  it("fails a privileged service", () => {
    expect(byKey(compose("services:\n  a:\n    image: x:1\n    privileged: true\n"), "compose_no_privileged").status).toBe(
      "FAIL",
    );
  });

  it("fails a mounted docker socket", () => {
    const body = "services:\n  a:\n    image: x:1\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n";
    expect(byKey(compose(body), "compose_no_docker_socket").status).toBe("FAIL");
  });

  it("fails a literal password", () => {
    const body = "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: hunter2secret\n";
    expect(byKey(compose(body), "compose_no_plaintext_secrets").status).toBe("FAIL");
  });

  it("stays quiet when the password is interpolated", () => {
    const body = "services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: ${DB_PASSWORD}\n";
    expect(byKey(compose(body), "compose_no_plaintext_secrets").status).toBe("PASS");
  });

  it("warns on an untagged image", () => {
    expect(byKey(compose("services:\n  a:\n    image: redis\n"), "compose_pinned_images").status).toBe("WARN");
  });

  it("passes a tagged image", () => {
    expect(byKey(compose("services:\n  a:\n    image: redis:7.2\n    restart: always\n"), "compose_pinned_images").status).toBe(
      "PASS",
    );
  });
});
