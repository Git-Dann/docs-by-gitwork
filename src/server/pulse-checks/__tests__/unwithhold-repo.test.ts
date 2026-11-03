import { describe, it, expect, vi, afterEach } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import type { ExtendedCheckContext } from "../_types";
import { evaluateContainerChecks } from "../containers";
import { evaluateCiWorkflowChecks } from "../ci-workflows";
import { evaluateBackendServiceChecks, springDotted } from "../backend-service";
import { evaluateServiceDepthChecks } from "../service-depth";
import { evaluateWebSourceChecks } from "../web-repo-source";
import { evaluateOperationalDepthChecks, localeCatalogues } from "../operational-depth";
import { evaluateAiAppSafety } from "../ai-app-safety";
import { runAuthExtended } from "../auth-extended";
import { runApiBehaviourChecks } from "../api-behaviour";
import { WITHHELD } from "../check-relevance-data";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Un-withhold, repository families (Oct 2026). Every check here was held back
// because its verdict was not supported by what Pulse observed. Each fix is tested
// in both directions: the input that must produce the finding, and a realistic
// correct input that must not. Where a real repository exposed the bug, its own
// lines are used, named in the test (fetched from GitHub, October 2026).
// ─────────────────────────────────────────────────────────────────────────────

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const find = (checks: PulseScanCheckInput[], key: string) => checks.find((c) => c.checkKey === key);
const statusOf = (checks: PulseScanCheckInput[], key: string) => find(checks, key)?.status;

const UNWITHHELD = [
  "docker_base_image_pinned", "docker_nonroot_user", "ci_dangerous_triggers", "ci_privileged_injection",
  "svc_cors_wildcard", "svc_django_content_type_nosniff", "svc_django_debug", "svc_django_secret_key",
  "svc_graceful_shutdown", "svc_spring_actuator_exposure", "auth_x_login_rate_limit", "auth_x_timing_safe_compare",
  "obs_x_log_retention_config", "pulse_accessibility_keyboard", "pulse_accessibility_semantics",
  "pulse_browser_journeys", "pulse_ci_untrusted_checkout", "pulse_ci_untrusted_privilege", "pulse_code_flow_gate",
  "pulse_container_nonroot", "pulse_supply_chain_gate", "pulse_upload_limit", "pulse_webhook_replay",
  "web_jwt_verification", "web_plaintext_api_calls", "auth_depth_generic_login_errors",
  "email_depth_address_validation", "email_depth_retry_backoff", "email_depth_stream_separation",
  "global_depth_currency_precision", "global_depth_translation_parity", "global_depth_unicode_normalization",
  "infra_depth_dead_letter_queue", "infra_depth_iac_plan_gate", "auth_login_autocomplete", "auth_signup_autocomplete",
  "ai_output_validation", "api_error_machine_readable", "api_trace_method",
];

describe("the slice is shown again", () => {
  it("no fixed key is still withheld", () => {
    for (const key of UNWITHHELD) expect(WITHHELD[key], key).toBeUndefined();
  });
});

// ── Containers ──────────────────────────────────────────────────────────────
describe("docker_base_image_pinned", () => {
  it("passes ordinary hyphenated tags (gothinkster realworld: node:lts-alpine)", () => {
    const realworld = "FROM docker.io/node:lts-alpine\n\nENV HOST=0.0.0.0\nWORKDIR /app\nCMD [ \"node\", \"api\" ]\n";
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: realworld })), "docker_base_image_pinned")).toBe("PASS");
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: "FROM python:3.12-slim\nUSER app\n" })), "docker_base_image_pinned")).toBe("PASS");
  });

  it("passes a tag built from a build argument (spring-petclinic devcontainer: java:0-${VARIANT})", () => {
    const df = "ARG VARIANT=17-bullseye\nFROM mcr.microsoft.com/vscode/devcontainers/java:0-${VARIANT}\n";
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: df })), "docker_base_image_pinned")).toBe("PASS");
  });

  it("still warns on a base with no tag at all", () => {
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: "FROM python\nUSER app\n" })), "docker_base_image_pinned")).toBe("WARN");
  });
});

describe("docker_nonroot_user and pulse_container_nonroot", () => {
  // blampe/rreading-glasses, Dockerfile (final stage), verbatim.
  const distroless = [
    "FROM --platform=$BUILDPLATFORM golang:1.26.0-alpine AS build",
    "WORKDIR /app",
    "RUN go mod download",
    "FROM gcr.io/distroless/static:nonroot AS app",
    "COPY --from=build /app/main /main",
    "EXPOSE 8788",
    'CMD ["/main"]',
  ].join("\n");

  it("passes a distroless :nonroot base with no USER line", () => {
    const checks = evaluateContainerChecks(snap({ Dockerfile: distroless }));
    expect(statusOf(checks, "docker_nonroot_user")).toBe("PASS");
    expect(statusOf(evaluateWebSourceChecks(snap({ Dockerfile: distroless, "main.go": "package main" })), "pulse_container_nonroot")).toBe("PASS");
  });

  it("fails an official image with no USER (realworld: addgroup/adduser but never USER)", () => {
    const realworld = "FROM docker.io/node:lts-alpine\nRUN addgroup --system api && adduser --system -G api api\nCMD [ \"node\", \"api\" ]\n";
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: realworld })), "docker_nonroot_user")).toBe("FAIL");
    expect(statusOf(evaluateWebSourceChecks(snap({ Dockerfile: realworld, "src/main.ts": "x" })), "pulse_container_nonroot")).toBe("WARN");
  });

  it("is inconclusive, not a failure, on a base whose default user Pulse does not know", () => {
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: "FROM ghcr.io/acme/runtime:1.4\nCMD [\"/app\"]\n" })), "docker_nonroot_user")).toBe("INCONCLUSIVE");
  });

  it("inherits USER from the stage the final stage builds on", () => {
    const df = "FROM node:20-slim AS base\nUSER node\nFROM base AS runner\nCMD [\"node\", \"server.js\"]\n";
    expect(statusOf(evaluateContainerChecks(snap({ Dockerfile: df })), "docker_nonroot_user")).toBe("PASS");
  });

  it("does not grade a dev container, or read Dockerfile.dockerignore as a Dockerfile", () => {
    const checks = evaluateContainerChecks(snap({ ".devcontainer/Dockerfile": "FROM mcr.microsoft.com/devcontainers/base:ubuntu\n" }));
    expect(statusOf(checks, "docker_nonroot_user")).toBe("SKIPPED");
    const ignore = evaluateContainerChecks(snap({ Dockerfile: distroless, "Dockerfile.dockerignore": "*\n!go.mod\n" }));
    expect(statusOf(ignore, "docker_nonroot_user")).toBe("PASS");
  });

  it("pulse_container_nonroot says nothing about a repo with no Dockerfile, whatever its workflows say", () => {
    const checks = evaluateWebSourceChecks(snap({
      ".github/workflows/ci.yml": "on: push\njobs:\n  test:\n    steps:\n      - name: Download artifact from build job\n        uses: actions/download-artifact@v4\n",
      "src/index.ts": "export const x = 1;",
    }));
    expect(find(checks, "pulse_container_nonroot")).toBeUndefined();
  });
});

// ── CI workflows ────────────────────────────────────────────────────────────
describe("ci_dangerous_triggers", () => {
  it("reads triggers at any indentation (4-space `on:` block)", () => {
    const wf = "name: Label\non:\n    pull_request_target:\n        types: [opened]\njobs:\n    label:\n        runs-on: ubuntu-latest\n        steps:\n            - uses: actions/labeler@v5\n";
    expect(statusOf(evaluateCiWorkflowChecks(snap({ ".github/workflows/label.yml": wf })), "ci_dangerous_triggers")).toBe("WARN");
  });

  it("does not read a nested key as a trigger", () => {
    const wf = "on:\n    push:\n        branches:\n            - pull_request_target\njobs:\n    a:\n        runs-on: ubuntu-latest\n";
    expect(statusOf(evaluateCiWorkflowChecks(snap({ ".github/workflows/ci.yml": wf })), "ci_dangerous_triggers")).toBe("PASS");
  });
});

describe("ci_privileged_injection", () => {
  it("fails the unspaced ${{ctx}} form under pull_request_target", () => {
    const wf = 'on: pull_request_target\njobs:\n  greet:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "${{github.event.pull_request.title}}"\n';
    expect(statusOf(evaluateCiWorkflowChecks(snap({ ".github/workflows/greet.yml": wf })), "ci_privileged_injection")).toBe("FAIL");
  });

  it("passes the same step under an unprivileged pull_request trigger", () => {
    const wf = 'on: pull_request\njobs:\n  greet:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "${{github.event.pull_request.title}}"\n';
    expect(statusOf(evaluateCiWorkflowChecks(snap({ ".github/workflows/greet.yml": wf })), "ci_privileged_injection")).toBe("PASS");
  });
});

// ── Backend service ─────────────────────────────────────────────────────────
const django = (settings: Record<string, string>, extra: Record<string, string> = {}) =>
  evaluateBackendServiceChecks(snap({ "manage.py": "import django", ...settings, ...extra }));
const insecureKey = ["django", "insecure", "a(!_5+l3$#l1f4n!x+&ns_+8$4q@df*3rh$n#2h@l$2gti7!7-"].join("-");

describe("svc_django_debug", () => {
  it("warns on an environment read whose committed fallback is debug ON (autodo-app/autodo)", () => {
    const checks = django({ "main/settings.py": 'DEBUG = os.environ.get("DEBUG", "True") == "True"\n' });
    expect(statusOf(checks, "svc_django_debug")).toBe("WARN");
  });

  it("warns on a bare string fallback, which Python treats as true", () => {
    expect(statusOf(django({ "settings.py": 'DEBUG = os.environ.get("DEBUG", "False")\n' }), "svc_django_debug")).toBe("WARN");
  });

  it("passes fallbacks that are off when unset", () => {
    for (const line of [
      'DEBUG = os.getenv("DEBUG") == "1"',
      'DEBUG = os.environ.get("DEBUG", "False") == "True"',
      'DEBUG = env.bool("DJANGO_DEBUG", default=False)',
      "DEBUG: bool = False", // PokeAPI/pokeapi config/settings.py, verbatim
    ]) {
      expect(statusOf(django({ "settings.py": `${line}\n` }), "svc_django_debug"), line).toBe("PASS");
    }
  });

  it("judges production on production.py, not the shared base (wagtail/bakerydemo)", () => {
    const checks = django({
      "bakerydemo/settings/base.py": "DEBUG = True\n",
      "bakerydemo/settings/dev.py": "from .base import *\nDEBUG = True\n",
      "bakerydemo/settings/production.py": "from .base import *\nDEBUG = False\n",
    });
    expect(statusOf(checks, "svc_django_debug")).toBe("PASS");
  });

  it("still fails a committed DEBUG = True", () => {
    expect(statusOf(django({ "settings.py": "DEBUG = True\n" }), "svc_django_debug")).toBe("FAIL");
  });
});

describe("svc_django_secret_key", () => {
  it("fails a real key committed as the environment fallback (PokeAPI/pokeapi)", () => {
    const checks = django({ "config/settings.py": `SECRET_KEY = os.environ.get("SECRET_KEY", "${insecureKey}")\n` });
    expect(statusOf(checks, "svc_django_secret_key")).toBe("FAIL");
  });

  it("passes a key read from the environment with no fallback", () => {
    expect(statusOf(django({ "settings.py": 'SECRET_KEY = os.environ["SECRET_KEY"]\n' }), "svc_django_secret_key")).toBe("PASS");
  });

  it("passes when production.py overrides the base key inside an if/else (wagtail/bakerydemo)", () => {
    const checks = django({
      "bakerydemo/settings/base.py": `SECRET_KEY = "c6u0-9c!7nilj_ysatsda0(f@e_2mws2f!6m0n^o*4#*q#kzp)"\n`,
      "bakerydemo/settings/production.py": [
        "from .base import *",
        'if "DJANGO_SECRET_KEY" in os.environ:',
        '    SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]',
        "else:",
        '    SECRET_KEY = "".join(',
        "        [random.SystemRandom().choice(string.printable) for i in range(50)]",
        "    )",
      ].join("\n"),
    });
    expect(statusOf(checks, "svc_django_secret_key")).toBe("PASS");
  });
});

describe("svc_django_content_type_nosniff", () => {
  it("passes when unset: Django 3.0 and later send nosniff by default", () => {
    expect(statusOf(django({ "settings.py": "DEBUG = False\n" }), "svc_django_content_type_nosniff")).toBe("PASS");
  });

  it("warns when explicitly disabled, or unset on a pinned Django 2.2", () => {
    expect(statusOf(django({ "settings.py": "SECURE_CONTENT_TYPE_NOSNIFF = False\n" }), "svc_django_content_type_nosniff")).toBe("WARN");
    expect(statusOf(django({ "settings.py": "DEBUG = False\n" }, { "requirements.txt": "Django==2.2.28\n" }), "svc_django_content_type_nosniff")).toBe("WARN");
  });
});

describe("svc_spring_actuator_exposure", () => {
  // HomeAdvisor/Kafdrop, src/main/resources/application.yml, verbatim (3-space indent).
  const kafdrop = [
    "server:", "   port: 9000", "", "metrics.jmx.domain: ${spring.jmx.default_domain}-metrics", "management:",
    "   endpoints:", "      web:", "         basePath: /sm/debug", "         exposure:", '            include: "*"',
    "      jmx:", "         domain: ${spring.jmx.default_domain}", "         exposure:", '            include: "*"',
  ].join("\n");
  const spring = (props: Record<string, string>) => evaluateBackendServiceChecks(snap({ "pom.xml": "<project/>", ...props }));

  it("fails the nested YAML form", () => {
    expect(springDotted(kafdrop)).toContain('management.endpoints.web.exposure.include="*"');
    expect(statusOf(spring({ "src/main/resources/application.yml": kafdrop }), "svc_spring_actuator_exposure")).toBe("FAIL");
  });

  it("fails the list form, and still fails the dotted form (spring-projects/spring-petclinic)", () => {
    const list = "management:\n  endpoints:\n    web:\n      exposure:\n        include:\n          - \"*\"\n";
    expect(statusOf(spring({ "src/main/resources/application.yml": list }), "svc_spring_actuator_exposure")).toBe("FAIL");
    expect(statusOf(spring({ "src/main/resources/application.properties": "management.endpoints.web.exposure.include=*\n" }), "svc_spring_actuator_exposure")).toBe("FAIL");
  });

  it("passes a named list, and only the JMX exposure being wildcard", () => {
    const named = "management:\n  endpoints:\n    web:\n      exposure:\n        include: health,info\n    jmx:\n      exposure:\n        include: \"*\"\n";
    expect(statusOf(spring({ "src/main/resources/application.yml": named }), "svc_spring_actuator_exposure")).toBe("PASS");
  });
});

describe("svc_cors_wildcard", () => {
  const node = (src: string) => evaluateBackendServiceChecks(snap({ "package.json": '{"dependencies":{"express":"^4"}}', "src/app.ts": src }));

  it("fails origin reflection with credentials (thedenisnikulin/chattitude-app-backend)", () => {
    expect(statusOf(node("    cors({ credentials: true, origin: true }),\n"), "svc_cors_wildcard")).toBe("FAIL");
  });

  it("fails Starlette's allow-all with credentials, which echoes the Origin (SalesforceAIResearch/enterprise-deep-research)", () => {
    const app = 'app.add_middleware(\n    CORSMiddleware,\n    allow_origins=["*"],\n    allow_credentials=True,\n    allow_methods=["*"],\n    allow_headers=["*"],\n)\n';
    expect(statusOf(evaluateBackendServiceChecks(snap({ "requirements.txt": "fastapi", "app.py": app })), "svc_cors_wildcard")).toBe("FAIL");
  });

  it("fails django-cors-headers allow-all with credentials", () => {
    const checks = django({ "settings.py": "CORS_ALLOW_ALL_ORIGINS = True\nCORS_ALLOW_CREDENTIALS = True\n" });
    expect(statusOf(checks, "svc_cors_wildcard")).toBe("FAIL");
  });

  it("passes allow-all without credentials (PokeAPI/pokeapi), and an origin in one file with credentials in another", () => {
    expect(statusOf(django({ "config/settings.py": "CORS_ALLOW_ALL_ORIGINS = True\n" }), "svc_cors_wildcard")).toBe("PASS");
    const split = evaluateBackendServiceChecks(snap({
      "package.json": '{"dependencies":{"express":"^4"}}',
      "src/public.ts": 'app.use("/feed", cors({ origin: "*" }));',
      "src/auth.ts": "fetch(url, { credentials: true });",
    }));
    expect(statusOf(split, "svc_cors_wildcard")).toBe("PASS");
  });
});

describe("svc_graceful_shutdown", () => {
  it("skips a Next.js app (vercel/commerce), where the platform drains requests", () => {
    const checks = evaluateBackendServiceChecks(snap({ "package.json": '{"dependencies":{"next":"15.0.0"}}', "app/page.tsx": "export default function Page() {}" }));
    expect(statusOf(checks, "svc_graceful_shutdown")).toBe("SKIPPED");
  });

  it("warns a Node server this repository starts without SIGTERM handling, passes one with it", () => {
    const pkg = '{"dependencies":{"express":"^4"}}';
    const bare = evaluateBackendServiceChecks(snap({ "package.json": pkg, "src/index.ts": "app.listen(PORT, () => console.log('up'));" }));
    expect(statusOf(bare, "svc_graceful_shutdown")).toBe("WARN");
    const drains = evaluateBackendServiceChecks(snap({
      "package.json": pkg,
      "src/index.ts": "const server = app.listen(PORT);\nprocess.on('SIGTERM', () => server.close());",
    }));
    expect(statusOf(drains, "svc_graceful_shutdown")).toBe("PASS");
  });

  it("reads Spring's server.shutdown, and Boot's version default (spring-petclinic: Boot 4.1)", () => {
    const pom = "<parent>\n    <artifactId>spring-boot-starter-parent</artifactId>\n    <version>4.1.0</version>\n  </parent>";
    expect(statusOf(evaluateBackendServiceChecks(snap({ "pom.xml": pom })), "svc_graceful_shutdown")).toBe("PASS");
    const old = "<parent>\n    <artifactId>spring-boot-starter-parent</artifactId>\n    <version>2.7.18</version>\n  </parent>";
    expect(statusOf(evaluateBackendServiceChecks(snap({ "pom.xml": old })), "svc_graceful_shutdown")).toBe("INCONCLUSIVE");
  });
});

// ── Service depth ───────────────────────────────────────────────────────────
describe("auth_x_login_rate_limit", () => {
  const pkg = '{"dependencies":{"express":"^4","bcryptjs":"^2","lodash":"^4"}}';

  it("warns where the code checks passwords itself with no limiter (gothinkster realworld)", () => {
    const login = "export const login = async (userPayload: any) => {\n    const match = await bcrypt.compare(password, user.password);\n};";
    expect(statusOf(evaluateServiceDepthChecks(snap({ "package.json": pkg, "src/app/routes/auth/auth.service.ts": login })), "auth_x_login_rate_limit")).toBe("WARN");
  });

  it("does not count lodash's throttle as a limiter", () => {
    const files = { "package.json": pkg, "src/auth.ts": "const ok = await bcrypt.compare(pw, hash); const save = throttle(persist, 500);" };
    expect(statusOf(evaluateServiceDepthChecks(snap(files)), "auth_x_login_rate_limit")).toBe("WARN");
  });

  it("passes with express-rate-limit, and skips sign-in handled by a hosted provider", () => {
    const limited = { "package.json": '{"dependencies":{"express-rate-limit":"^7","bcryptjs":"^2"}}', "src/auth.ts": "const ok = await bcrypt.compare(pw, hash);" };
    expect(statusOf(evaluateServiceDepthChecks(snap(limited)), "auth_x_login_rate_limit")).toBe("PASS");
    const hosted = { "package.json": '{"dependencies":{"@clerk/nextjs":"^5"}}', "app/sign-in/page.tsx": "<SignIn /> // password reset is handled by Clerk" };
    expect(statusOf(evaluateServiceDepthChecks(snap(hosted)), "auth_x_login_rate_limit")).toBe("SKIPPED");
  });
});

describe("auth_x_timing_safe_compare", () => {
  it("warns on a plain comparison of a secret (vercel/commerce lib/shopify/index.ts)", () => {
    const src = '  const secret = req.nextUrl.searchParams.get("secret");\n  if (!secret || secret !== process.env.SHOPIFY_REVALIDATION_SECRET) {\n';
    expect(statusOf(evaluateServiceDepthChecks(snap({ "lib/shopify/index.ts": src })), "auth_x_timing_safe_compare")).toBe("WARN");
  });

  it("does not treat a tokenizer comparing tokens as a secret comparison", () => {
    const lexer = 'if (token === "(") depth++; if (next.token === prev.token) merge(); const apiKeyName = "x";';
    expect(statusOf(evaluateServiceDepthChecks(snap({ "src/lexer.ts": lexer })), "auth_x_timing_safe_compare")).toBe("SKIPPED");
  });

  it("passes timingSafeEqual with no plain comparison", () => {
    const ok = "const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));";
    expect(statusOf(evaluateServiceDepthChecks(snap({ "src/webhook.ts": ok })), "auth_x_timing_safe_compare")).toBe("PASS");
  });
});

describe("obs_x_log_retention_config", () => {
  // matijse/eufy-ha-mqtt-bridge, index.js, verbatim.
  const eufy = [
    "const winston = require('winston')",
    "winston.configure({",
    "  transports: [",
    "    new winston.transports.File({ filename: './data/error.log', level: 'error' }),",
    "    new winston.transports.File({ filename: './data/combined.log' }),",
    "  ],",
    "})",
  ].join("\n");

  it("warns on file logs with no rotation", () => {
    expect(statusOf(evaluateServiceDepthChecks(snap({ "package.json": '{"dependencies":{"winston":"^3"}}', "index.js": eufy })), "obs_x_log_retention_config")).toBe("WARN");
  });

  it("skips logging to standard output, and passes a rotating transport", () => {
    const stdout = { "package.json": '{"dependencies":{"pino":"^9"}}', "src/log.ts": "export const log = pino();" };
    expect(statusOf(evaluateServiceDepthChecks(snap(stdout)), "obs_x_log_retention_config")).toBe("SKIPPED");
    const rotating = { "package.json": '{"dependencies":{"winston":"^3","winston-daily-rotate-file":"^5"}}', "index.js": "new winston.transports.DailyRotateFile({ filename: 'app-%DATE%.log', maxFiles: '14d' })" };
    expect(statusOf(evaluateServiceDepthChecks(snap(rotating)), "obs_x_log_retention_config")).toBe("PASS");
  });
});

// ── Web repo source: delivery evidence ──────────────────────────────────────
const UI = "src/app/page.tsx";

describe("pulse_supply_chain_gate", () => {
  it("passes yarn npm audit in a workflow (calcom/cal.com security-audit.yml)", () => {
    const wf = "name: Security Audit\njobs:\n  audit:\n    steps:\n      - name: Fail on critical vulnerabilities\n        run: yarn npm audit --all --recursive --severity critical\n";
    expect(statusOf(evaluateWebSourceChecks(snap({ ".github/workflows/security-audit.yml": wf, "src/a.ts": "x" })), "pulse_supply_chain_gate")).toBe("PASS");
  });

  it("passes dependency-review-action and Trivy, warns with no scanner", () => {
    for (const step of ["uses: actions/dependency-review-action@v4", "uses: aquasecurity/trivy-action@0.28.0"]) {
      const wf = `on: pull_request\njobs:\n  s:\n    steps:\n      - ${step}\n`;
      expect(statusOf(evaluateWebSourceChecks(snap({ ".github/workflows/s.yml": wf, "src/a.ts": "x" })), "pulse_supply_chain_gate"), step).toBe("PASS");
    }
    const none = "on: pull_request\njobs:\n  t:\n    steps:\n      - run: npm test\n";
    expect(statusOf(evaluateWebSourceChecks(snap({ ".github/workflows/t.yml": none, "src/a.ts": "x" })), "pulse_supply_chain_gate")).toBe("WARN");
  });
});

describe("pulse_code_flow_gate", () => {
  it("passes CodeQL (nodejs/node codeql.yml)", () => {
    const wf = "on:\n  schedule:\n    - cron: 0 0 * * *\njobs:\n  analyze:\n    steps:\n      - name: Initialize CodeQL\n        uses: github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2  # v4.38.2\n";
    expect(statusOf(evaluateWebSourceChecks(snap({ ".github/workflows/codeql.yml": wf, "src/a.ts": "x" })), "pulse_code_flow_gate")).toBe("PASS");
  });

  it("is inconclusive, never a pass, on the words 'data flow' in a comment", () => {
    const checks = evaluateWebSourceChecks(snap({ "src/a.ts": "// data flow: input -> parse -> render\nexport const a = 1;" }));
    expect(statusOf(checks, "pulse_code_flow_gate")).toBe("INCONCLUSIVE");
  });
});

describe("pulse_browser_journeys", () => {
  it("passes when CI runs a package script that runs Playwright (calcom/cal.com e2e.yml)", () => {
    const pkg = JSON.stringify({ scripts: { e2e: "NEXT_PUBLIC_IS_E2E=1 yarn playwright test --project=@calcom/web" }, devDependencies: { "@playwright/test": "^1" } });
    const wf = "jobs:\n  e2e:\n    steps:\n      - run: yarn e2e --shard=${{ matrix.shard }}/${{ strategy.job-total }} --workers=4\n";
    expect(statusOf(evaluateWebSourceChecks(snap({ "package.json": pkg, ".github/workflows/e2e.yml": wf, [UI]: "x" })), "pulse_browser_journeys")).toBe("PASS");
  });

  it("skips an API with no UI (gothinkster realworld), however its scripts are named", () => {
    const pkg = JSON.stringify({ scripts: { "test:e2e": "jest --config e2e" } });
    expect(statusOf(evaluateWebSourceChecks(snap({ "package.json": pkg, "src/main.ts": "app.listen(3000)" })), "pulse_browser_journeys")).toBe("SKIPPED");
  });

  it("warns a runner that no CI step runs", () => {
    const pkg = JSON.stringify({ devDependencies: { "@playwright/test": "^1" } });
    const wf = "on: push\njobs:\n  t:\n    steps:\n      - run: npm test\n";
    expect(statusOf(evaluateWebSourceChecks(snap({ "package.json": pkg, ".github/workflows/t.yml": wf, [UI]: "x" })), "pulse_browser_journeys")).toBe("WARN");
  });
});

describe("pulse_accessibility_keyboard and pulse_accessibility_semantics", () => {
  it("keyboard passes a real keyboard test (ng-bootstrap/ng-bootstrap nav.spec.ts)", () => {
    const spec = "\t\t\tawait userEvent.tab();\n\t\t\tawait expect.element(tester.links.nth(0)).toHaveFocus();";
    expect(statusOf(evaluateWebSourceChecks(snap({ "src/nav/nav.spec.ts": spec, "src/nav/nav.tsx": "x" })), "pulse_accessibility_keyboard")).toBe("PASS");
  });

  it("semantics passes role queries (mckaywrigley/chatbot-ui login.spec.ts)", () => {
    const spec = "  await page.getByRole('button', { name: 'Login' }).click();";
    expect(statusOf(evaluateWebSourceChecks(snap({ "__tests__/playwright-test/tests/login.spec.ts": spec, [UI]: "x" })), "pulse_accessibility_semantics")).toBe("PASS");
  });

  it("neither passes on a test merely named 'a11y test'", () => {
    const spec = "describe('a11y test', () => { it('renders', () => { render(<App />); }); });";
    const checks = evaluateWebSourceChecks(snap({ "src/app.test.tsx": spec, [UI]: "x" }));
    expect(statusOf(checks, "pulse_accessibility_keyboard")).toBe("WARN");
    expect(statusOf(checks, "pulse_accessibility_semantics")).toBe("WARN");
  });
});

describe("pulse_ci_untrusted_checkout and pulse_ci_untrusted_privilege", () => {
  // awslabs/amazon-kinesis-client-python, .github/workflows/python.yml, verbatim lines.
  const kinesis = [
    "on:",
    "  push:",
    "    branches: [ master, '*-test' ]",
    "  pull_request_target:",
    "    branches: [ master, '*-test' ]",
    "    types: [opened, synchronize]",
    "jobs:",
    "  sample-run:",
    "    permissions:",
    "      id-token: write",
    "    steps:",
    "      # For pull_request_target, checkout PR head instead of merge commit",
    "      - name: Checkout code",
    "        uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ github.event_name == 'pull_request_target' && github.event.pull_request.head.sha || github.ref }}",
    "      - name: Configure AWS Credentials",
    "        uses: aws-actions/configure-aws-credentials@v4",
    "        with:",
    "          role-to-assume: ${{ secrets.AWS_ARN_GHA }}",
  ].join("\n");

  it("fails both on a privileged workflow that checks out the PR head with secrets", () => {
    const checks = evaluateWebSourceChecks(snap({ ".github/workflows/python.yml": kinesis, "src/a.py": "x = 1" }));
    expect(statusOf(checks, "pulse_ci_untrusted_checkout")).toBe("FAIL");
    expect(statusOf(checks, "pulse_ci_untrusted_privilege")).toBe("FAIL");
  });

  it("says nothing for a repo with no workflows, only a Dockerfile (gothinkster realworld)", () => {
    const checks = evaluateWebSourceChecks(snap({ Dockerfile: "FROM docker.io/node:lts-alpine\n", "src/main.ts": "x" }));
    expect(find(checks, "pulse_ci_untrusted_checkout")).toBeUndefined();
    expect(find(checks, "pulse_ci_untrusted_privilege")).toBeUndefined();
  });

  it("passes a privileged labeller that never runs PR code, and a checkout of the base ref", () => {
    const label = "on: pull_request_target\npermissions:\n  pull-requests: write\njobs:\n  l:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: main\n      - uses: actions/labeler@v5\n        with:\n          repo-token: ${{ secrets.GITHUB_TOKEN }}\n";
    const checks = evaluateWebSourceChecks(snap({ ".github/workflows/label.yml": label, "src/a.ts": "x" }));
    expect(statusOf(checks, "pulse_ci_untrusted_checkout")).toBe("PASS");
    expect(statusOf(checks, "pulse_ci_untrusted_privilege")).toBe("PASS");
  });
});

describe("pulse_upload_limit", () => {
  it("warns on multer with no limits (trufflesecurity/xsshunter app.js)", () => {
    const app = "var multer = require('multer');\nvar upload = multer({ dest: '/tmp/' })\n    app.post('/js_callback', upload.single('screenshot'), validate({body: JSCallbackSchema}), async (req, res) => {";
    expect(statusOf(evaluateWebSourceChecks(snap({ "app.js": app })), "pulse_upload_limit")).toBe("WARN");
  });

  it("is not triggered by Zod arrays, Supabase .single() or a text form", () => {
    const src = 'const tags = z.array(z.string()); const { data } = await supabase.from("p").select().single(); const form = await request.formData(); const name = form.get("name");';
    expect(find(evaluateWebSourceChecks(snap({ "src/app.ts": src })), "pulse_upload_limit")).toBeUndefined();
  });

  it("passes multer with a fileSize limit", () => {
    const app = "const upload = multer({ dest: 'uploads/', limits: { fileSize: 5 * 1024 * 1024 } }); app.post('/u', upload.single('f'), h);";
    expect(statusOf(evaluateWebSourceChecks(snap({ "app.js": app })), "pulse_upload_limit")).toBe("PASS");
  });
});

describe("pulse_webhook_replay", () => {
  it("passes Stripe's constructEvent, which checks the signature and a timestamp window", () => {
    const route = 'export async function POST(req: Request) {\n  const body = await req.text()\n  const signature = headers().get("Stripe-Signature") as string\n  event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET)\n}';
    expect(statusOf(evaluateWebSourceChecks(snap({ "app/api/webhooks/stripe/route.ts": route })), "pulse_webhook_replay")).toBe("PASS");
  });

  it("warns on a handler with no signature check, whatever timestamps the app uses", () => {
    const route = "export async function POST(req: Request) { const event = await req.json(); await db.log.create({ data: { timestamp: Date.now(), event } }); }";
    expect(statusOf(evaluateWebSourceChecks(snap({ "app/api/webhook/route.ts": route })), "pulse_webhook_replay")).toBe("WARN");
  });

  it("warns on a signature with no replay window, passes one that de-duplicates deliveries", () => {
    const sigOnly = "app.post('/webhook', (req, res) => { const sig = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex'); verify(sig, req.headers['x-hub-signature-256']); });";
    const checks = evaluateWebSourceChecks(snap({ "src/webhook.ts": sigOnly }));
    expect(statusOf(checks, "pulse_webhook_replay")).toBe("WARN");
    const dedupe = `${sigOnly}\nconst id = req.headers['x-github-delivery']; if (await seen(id)) return;`;
    expect(statusOf(evaluateWebSourceChecks(snap({ "src/webhook.ts": dedupe })), "pulse_webhook_replay")).toBe("PASS");
  });
});

describe("web_jwt_verification", () => {
  it("is not triggered by Python requests' TLS flag (tonmcg/US_County_Level_Election_Results_08-24 app.py)", () => {
    const checks = evaluateWebSourceChecks(snap({ "app.py": "    response = requests.get(url, verify=False)\n" }));
    expect(find(checks, "web_jwt_verification")).toBeUndefined();
  });

  it("warns on decoding with verification off (shinnytech/tqsdk-python auth.py)", () => {
    const src = '        content = jwt.decode(self._access_token, options={"verify_signature": False})\n';
    expect(statusOf(evaluateWebSourceChecks(snap({ "tqsdk/auth.py": src })), "web_jwt_verification")).toBe("WARN");
  });

  it("fails accepting the none algorithm", () => {
    const src = 'const claims = jwt.verify(token, key, { algorithms: ["HS256", "none"] });';
    expect(statusOf(evaluateWebSourceChecks(snap({ "src/auth.ts": src })), "web_jwt_verification")).toBe("FAIL");
  });
});

describe("web_plaintext_api_calls", () => {
  it("warns on a fetch to a plain http:// host (openai/openai-realtime-solar-system app/api/iss/route.ts)", () => {
    const src = 'export async function GET() {\n  try {\n    const response = await fetch("http://api.open-notify.org/iss-now.json");\n';
    expect(statusOf(evaluateWebSourceChecks(snap({ "app/api/iss/route.ts": src })), "web_plaintext_api_calls")).toBe("WARN");
  });

  it("is not triggered by an SVG namespace, JSON-LD @context, or a private host", () => {
    const src = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" />',
      'const ld = { "@context": "http://schema.org", "@type": "Organization" };',
      'const res = await fetch("http://api.internal/health"); const r2 = await fetch("http://192.168.1.10/status");',
    ].join("\n");
    expect(find(evaluateWebSourceChecks(snap({ "src/page.tsx": src })), "web_plaintext_api_calls")).toBeUndefined();
  });
});

// ── Operational depth ───────────────────────────────────────────────────────
const depth = (files: Record<string, string>, key: string, extra: string[] = []) =>
  statusOf(evaluateOperationalDepthChecks(snap(files, extra)), key);

describe("auth_depth_generic_login_errors", () => {
  it("does not pin a profile helper's 'User not found' on the login (mckaywrigley/chatbot-ui)", () => {
    const helper = '  const user = (await supabase.auth.getUser()).data.user\n  if (!user) {\n    throw new Error("User not found")\n  }';
    expect(depth({ "lib/server/server-chat-helpers.ts": helper }, "auth_depth_generic_login_errors")).toBe("SKIPPED");
    // The real sign-in, app/[locale]/login/page.tsx, passes the provider's message through.
    const login = "    const { data, error } = await supabase.auth.signInWithPassword({\n      email,\n      password\n    })\n\n    if (error) {\n      return redirect(`/login?message=${error.message}`)\n    }";
    const both = { "lib/server/server-chat-helpers.ts": helper, "app/[locale]/login/page.tsx": login };
    expect(depth(both, "auth_depth_generic_login_errors")).toBe("PASS");
  });

  it("warns where the password-checking code names a missing account, passes the realworld generic error", () => {
    const leaky = "if (!user) return res.status(404).json({ error: 'User not found' });\nconst match = await bcrypt.compare(password, user.password);";
    expect(depth({ "src/routes/login.ts": leaky }, "auth_depth_generic_login_errors")).toBe("WARN");
    const realworld = "    const match = await bcrypt.compare(password, user.password);\n    throw new HttpException(403, {\n      errors: {\n        'email or password': ['is invalid'],\n      },\n    });";
    expect(depth({ "src/app/routes/auth/auth.service.ts": realworld }, "auth_depth_generic_login_errors")).toBe("PASS");
  });
});

describe("email_depth_address_validation", () => {
  it("warns on a request-supplied recipient with no validation, passes a zod .email() schema parse", () => {
    expect(depth({ "src/invite.ts": "const { email } = req.body;\nawait sendEmail({ to: email });" }, "email_depth_address_validation")).toBe("WARN");
    const zod = 'const schema = z.object({ email: z.string().email() });\nconst { email } = schema.parse(req.body);\nconst { email: raw } = req.body;\nawait sendEmail({ to: email });';
    expect(depth({ "src/invite.ts": zod }, "email_depth_address_validation")).toBe("PASS");
  });

  it("skips mail to an address the app already holds", () => {
    expect(depth({ "lib/auth.ts": "await sendEmail({ to: user.email, subject: \"Welcome\" });" }, "email_depth_address_validation")).toBe("SKIPPED");
  });
});

describe("email_depth_retry_backoff", () => {
  it("does not credit backoff in an unrelated file to the mailer", () => {
    const files = {
      "src/lib/http.ts": "export const client = axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay });",
      "src/lib/mail.ts": 'import { Resend } from "resend"; export const send = (m) => resend.emails.send(m);',
    };
    expect(depth(files, "email_depth_retry_backoff")).toBe("WARN");
  });

  it("passes backoff on the email queue job", () => {
    const q = 'await emailQueue.add("welcome", data, { attempts: 5, backoff: { type: "exponential", delay: 1000 } });';
    expect(depth({ "src/queues/email.ts": q }, "email_depth_retry_backoff")).toBe("PASS");
  });
});

describe("email_depth_stream_separation", () => {
  it("skips a newsletter sign-up form that sends no mail", () => {
    expect(depth({ "components/newsletter.tsx": "<form action=\"/api/subscribe\"><input name=\"email\" /> Join our newsletter</form>" }, "email_depth_stream_separation")).toBe("SKIPPED");
  });

  it("warns bulk mail sent from the same address as receipts, passes a marketing provider", () => {
    const same = 'export const sendNewsletter = (to: string) => sendEmail({ to, from: "hello@example.test" });';
    expect(depth({ "packages/emails/newsletter.ts": same }, "email_depth_stream_separation")).toBe("WARN");
    expect(depth({ "packages/emails/newsletter.ts": same, "package.json": '{"dependencies":{"@mailchimp/mailchimp_marketing":"^3"}}' }, "email_depth_stream_separation")).toBe("PASS");
  });
});

describe("global_depth_currency_precision", () => {
  it("passes integer minor units (calcom/cal.com Payment model), warns a Float amount", () => {
    const cal = "model Payment {\n  id            Int            @id @default(autoincrement())\n  amount        Int\n  fee           Int\n  currency      String\n}";
    expect(depth({ "packages/prisma/schema.prisma": cal }, "global_depth_currency_precision")).toBe("PASS");
    expect(depth({ "prisma/schema.prisma": "model Order {\n  unitAmount Float\n  currency String\n}" }, "global_depth_currency_precision")).toBe("WARN");
  });

  it("skips Tailwind list-decimal and a Stripe price id (shadcn-ui/taxonomy)", () => {
    const files = {
      "components/mdx-components.tsx": '<ol className={cn("my-6 ml-6 list-decimal", className)} {...props} />',
      "app/api/users/stripe/route.ts": "      line_items: [{ price: proPlan.stripePriceId, quantity: 1 }],",
      "prisma/schema.prisma": "model User {\n  stripePriceId String?\n}",
    };
    expect(depth(files, "global_depth_currency_precision")).toBe("SKIPPED");
  });
});

describe("global_depth_translation_parity", () => {
  it("passes Lingo.dev over real catalogues (calcom/cal.com)", () => {
    const wf = "jobs:\n  i18n:\n    steps:\n      - uses: lingodotdev/lingo.dev@cee3eb86550ca4905fc99fe90786fb7523288a61 # main\n";
    const catalogues = ["packages/i18n/locales/de/common.json", "packages/i18n/locales/en/common.json", "packages/i18n/locales/fr/common.json"];
    expect(localeCatalogues(catalogues)).toBe(3);
    expect(depth({ ".github/workflows/i18n.yml": wf }, "global_depth_translation_parity", catalogues)).toBe("PASS");
  });

  it("warns two catalogues with no parity check, skips a single-language app that mentions i18n", () => {
    expect(depth({ "public/locales/en/translation.json": "{}", "public/locales/de/translation.json": "{}" }, "global_depth_translation_parity")).toBe("WARN");
    expect(depth({ "next.config.js": "module.exports = { i18n: { locales: ['en'], defaultLocale: 'en' } }", "messages/en.json": "{}" }, "global_depth_translation_parity")).toBe("SKIPPED");
  });
});

describe("global_depth_unicode_normalization", () => {
  it("warns a unique username with no normalisation (chatbot-ui profiles migration)", () => {
    const sql = "    username TEXT NOT NULL UNIQUE CHECK (char_length(username) >= 3 AND char_length(username) <= 25),";
    expect(depth({ "supabase/migrations/20240108234541_add_profiles.sql": sql }, "global_depth_unicode_normalization")).toBe("WARN");
  });

  it("passes NFC normalisation, skips unique emails and slugs", () => {
    expect(depth({ "prisma/schema.prisma": "model User {\n  username String @unique\n}", "src/u.ts": 'const u = input.normalize("NFC");' }, "global_depth_unicode_normalization")).toBe("PASS");
    expect(depth({ "prisma/schema.prisma": "model User {\n  email String @unique\n  slug String @unique\n}" }, "global_depth_unicode_normalization")).toBe("SKIPPED");
  });
});

describe("infra_depth_dead_letter_queue", () => {
  it("skips a Celery mention in a settings comment (wagtail/bakerydemo production.py)", () => {
    const prod = "# Do not use the same Redis instance for other things like Celery!\nCACHES = {}\n";
    expect(depth({ "bakerydemo/settings/production.py": prod }, "infra_depth_dead_letter_queue")).toBe("SKIPPED");
  });

  it("credits Sidekiq's dead set (discourse/discourse Gemfile), warns Celery with no DLQ", () => {
    expect(depth({ Gemfile: 'gem "sidekiq", ">= 7.3.10"', "app/jobs/x.rb": "class X; end" }, "infra_depth_dead_letter_queue")).toBe("PASS");
    expect(depth({ "app/tasks.py": "from celery import shared_task\n@shared_task\ndef send(): pass" }, "infra_depth_dead_letter_queue")).toBe("WARN");
  });
});

describe("infra_depth_iac_plan_gate", () => {
  it("skips 'terraform' in prose and a workflow that only mentions it", () => {
    expect(depth({ "README.md": "Deploy with Terraform.", "src/deploy.ts": "const hint = \"Run terraform apply from infra/\";" }, "infra_depth_iac_plan_gate")).toBe("SKIPPED");
  });

  it("warns Terraform with no plan step in CI, passes one with terraform plan on pull requests", () => {
    const tf = 'terraform {\n  required_version = ">= 1.5"\n}\nresource "aws_s3_bucket" "b" {}\n';
    const apply = "on: push\njobs:\n  a:\n    steps:\n      - run: terraform apply -auto-approve\n";
    expect(depth({ "infra/main.tf": tf, ".github/workflows/deploy.yml": apply }, "infra_depth_iac_plan_gate")).toBe("WARN");
    const plan = "on: pull_request\njobs:\n  p:\n    steps:\n      - run: terraform plan -out=tfplan\n";
    expect(depth({ "infra/main.tf": tf, ".github/workflows/plan.yml": plan }, "infra_depth_iac_plan_gate")).toBe("PASS");
  });
});

// ── URL families ────────────────────────────────────────────────────────────
function authCtx(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(), catchAll200: false,
  };
}

describe("auth_login_autocomplete and auth_signup_autocomplete", () => {
  it("are inconclusive on a page with no password field (linear.app homepage)", async () => {
    const checks = await runAuthExtended(authCtx('<main><a href="/login">Log in</a><a href="/signup">Sign up</a></main>'));
    expect(statusOf(checks, "auth_login_autocomplete")).toBe("INCONCLUSIVE");
    expect(statusOf(checks, "auth_signup_autocomplete")).toBe("INCONCLUSIVE");
  });

  it("warn on a login field with no autocomplete, and a signup form with two unlabelled fields", async () => {
    const login = await runAuthExtended(authCtx('<form><input type="email" name="email"><input type=password name="password"></form>'));
    expect(statusOf(login, "auth_login_autocomplete")).toBe("WARN");
    expect(statusOf(login, "auth_signup_autocomplete")).toBe("INCONCLUSIVE");
    const signup = await runAuthExtended(authCtx('<form><input type="password" name="pw"><input type="password" name="pw2"></form>'));
    expect(statusOf(signup, "auth_signup_autocomplete")).toBe("WARN");
  });

  it("pass labelled fields", async () => {
    const page = '<input type="password" autocomplete="current-password"><input autocomplete="new-password" type="password">';
    const checks = await runAuthExtended(authCtx(page));
    expect(statusOf(checks, "auth_login_autocomplete")).toBe("PASS");
    expect(statusOf(checks, "auth_signup_autocomplete")).toBe("PASS");
  });
});

describe("ai_output_validation", () => {
  const usesAi = 'fetch("/api/chat", { method: "POST" });';
  it("is inconclusive on JSON.parse alone, which every bundle has", () => {
    const checks = evaluateAiAppSafety("", `${usesAi} const d = JSON.parse(text); const u = new URL(href);`);
    expect(statusOf(checks!, "ai_output_validation")).toBe("INCONCLUSIVE");
  });

  it("passes a schema-bound structured-output call", () => {
    const checks = evaluateAiAppSafety("", `${usesAi} const { object } = useObject({ api: "/api/chat", schema });`);
    expect(statusOf(checks!, "ai_output_validation")).toBe("PASS");
  });
});

describe("api_trace_method and api_error_machine_readable", () => {
  type Stub = { status: number; headers?: Record<string, string>; body?: string };
  function stub(fixtures: { base?: Stub; options?: Stub; error?: Stub }) {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      const u = String(url);
      const r = init.method === "OPTIONS" ? fixtures.options : u.includes("__pulse_probe_") ? fixtures.error : u.includes("?query=") ? undefined : fixtures.base;
      const s = r ?? { status: 404, body: "" };
      return { status: s.status, headers: new Headers(s.headers ?? {}), text: async () => s.body ?? "" } as unknown as Response;
    }));
  }
  const ctx = (platform: string): ExtendedCheckContext => ({
    pageResult: { ok: true, status: 200, headers: {}, html: "", responseTimeMs: 10, finalUrl: "https://example.com" },
    httpsUrl: "https://example.com", hostname: "example.com", platform,
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: "", catchAll200: false,
  });
  afterEach(() => vi.unstubAllGlobals());

  it("TRACE: no Allow header is inconclusive; a listed TRACE warns; a list without it passes", async () => {
    stub({ options: { status: 204 } });
    expect(statusOf(await runApiBehaviourChecks(ctx("API_BACKEND")), "api_trace_method")).toBe("INCONCLUSIVE");
    stub({ options: { status: 204, headers: { allow: "GET, POST, TRACE" } } });
    expect(statusOf(await runApiBehaviourChecks(ctx("API_BACKEND")), "api_trace_method")).toBe("WARN");
    stub({ options: { status: 204, headers: { allow: "GET, HEAD, OPTIONS" } } });
    expect(statusOf(await runApiBehaviourChecks(ctx("API_BACKEND")), "api_trace_method")).toBe("PASS");
  });

  it("error format: a web app's HTML 404 is inconclusive; a JSON API's HTML error warns", async () => {
    const html404 = { status: 404, headers: { "content-type": "text/html" }, body: "<html><h1>404 Not Found</h1></html>" };
    stub({ base: { status: 200, headers: { "content-type": "text/html" }, body: "<html></html>" }, error: html404 });
    expect(statusOf(await runApiBehaviourChecks(ctx("WEB_APP")), "api_error_machine_readable")).toBe("INCONCLUSIVE");
    stub({ base: { status: 200, headers: { "content-type": "application/json" }, body: "{}" }, error: html404 });
    expect(statusOf(await runApiBehaviourChecks(ctx("WEB_APP")), "api_error_machine_readable")).toBe("WARN");
  });
});
