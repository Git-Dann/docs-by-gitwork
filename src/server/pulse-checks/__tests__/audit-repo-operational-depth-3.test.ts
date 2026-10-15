import { describe, expect, it } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "../native-mobile";
import { evaluateOperationalDepthChecks } from "../operational-depth";

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const status = (files: Record<string, string>, key: string, extraPaths: string[] = []) => {
  const check = evaluateOperationalDepthChecks(snap(files, extraPaths)).find(
    (c: PulseScanCheckInput) => c.checkKey === key,
  );
  if (!check) throw new Error(`no check ${key}`);
  return check.status;
};

describe("audit repo-operational-depth-3", () => {
  it("ignores transitive package names in lockfiles", () => {
    const lockOnly = {
      "pnpm-lock.yaml":
        "packages:\n  /@opentelemetry/api-metrics@0.31.0:\n  /@opentelemetry/sdk-trace-base@1.8.0:\n  /@sentry/node@7.0.0:\nsnapshots:\n",
      "app/page.tsx": "export default function Page() { return <main>Hello</main>; }",
    };
    expect(status(lockOnly, "obs_depth_trace_sampling")).toBe("SKIPPED");
    expect(status(lockOnly, "obs_depth_release_markers")).toBe("SKIPPED");
    expect(status(lockOnly, "obs_depth_latency_histogram")).toBe("SKIPPED");
    expect(status(lockOnly, "infra_depth_restore_drill")).toBe("SKIPPED");

    const realTracing = {
      "package.json": '{"dependencies":{"@opentelemetry/sdk-trace-node":"^1.8.0"}}',
      "src/tracing.ts": "import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';\nconst provider = new NodeTracerProvider();",
    };
    expect(status(realTracing, "obs_depth_trace_sampling")).toBe("WARN");
  });

  it("infra_depth_resource_limits: CI service containers are not workloads", () => {
    expect(
      status({ ".github/workflows/tests.yml": "jobs:\n  build:\n    services:\n      postgres:\n        image: postgres:16" }, "infra_depth_resource_limits"),
    ).toBe("SKIPPED");
    expect(
      status({ "e2e/src/support/global-teardown.ts": "// Put clean up logic here (e.g. stopping services, docker-compose, etc.)." }, "infra_depth_resource_limits"),
    ).toBe("SKIPPED");
    expect(
      status({ "docker-compose.yml": "services:\n  database:\n    container_name: database\n    image: postgres\n    restart: always" }, "infra_depth_resource_limits"),
    ).toBe("WARN");
    expect(
      status({ "apps/api/v2/docker-compose.yaml": "services:\n  api:\n    image: api\n    deploy:\n      resources:\n        limits:\n          memory: 512M" }, "infra_depth_resource_limits"),
    ).toBe("PASS");
  });

  it("infra_depth_restore_drill: CDK snapshot flags are not backups", () => {
    expect(
      status({ "agentcore/cdk/cdk.json": '{"context":{"@aws-cdk/core:validateSnapshotRemovalPolicy": true}}' }, "infra_depth_restore_drill"),
    ).toBe("SKIPPED");
    expect(
      status({ "scripts/backup.sh": "pg_dump production > backup.dump" }, "infra_depth_restore_drill"),
    ).toBe("WARN");
  });

  it("legal_depth_child_consent: React children are not children's data", () => {
    expect(
      status({ "app/(auth)/layout.tsx": "export default function AuthLayout({ children }) { return <div className=\"min-h-screen\">{children}</div>; }" }, "legal_depth_child_consent"),
    ).toBe("SKIPPED");
    expect(
      status({ "src/signup.ts": "const { dateOfBirth } = body; if (age(dateOfBirth) < 13) return reject();" }, "legal_depth_child_consent"),
    ).toBe("WARN");
  });

  it("obs_depth_latency_histogram: prose about metrics is not instrumentation", () => {
    expect(
      status({ "blogs/deployment-notes.md": "## Metrics\nWe watched the CloudWatch metrics after deploy." }, "obs_depth_latency_histogram"),
    ).toBe("SKIPPED");
    expect(
      status({ "src/metrics.ts": 'metrics.increment("http_requests_total");' }, "obs_depth_latency_histogram"),
    ).toBe("WARN");
  });

  it("obs_depth_queue_metrics: tightened subject and required evidence", () => {
    expect(
      status({ "cdk.json": '{"@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption": true}' }, "obs_depth_queue_metrics"),
    ).toBe("SKIPPED");
    expect(
      status({ "Gemfile": "gem 'sidekiq'", "app/services/user_activator.rb": "user.enqueue_welcome_message('welcome_user') # queue_welcome_message" }, "obs_depth_queue_metrics"),
    ).toBe("WARN");
    expect(
      status({ "Gemfile": "gem 'sidekiq'", "app/services/problem_check/sidekiq_check.rb": 'override_key: "dashboard.problem.queue_size", queue_size: Jobs.queued' }, "obs_depth_queue_metrics"),
    ).toBe("PASS");
  });

  it("obs_depth_slow_query_visibility: metadataBase is not a database", () => {
    expect(
      status({ "app/layout.tsx": "export const metadata = { metadataBase: new URL(baseUrl) };" }, "obs_depth_slow_query_visibility"),
    ).toBe("SKIPPED");
    expect(
      status({ ".env.example": "DATABASE_URL=postgres://localhost/app" }, "obs_depth_slow_query_visibility"),
    ).toBe("WARN");
  });

  it("obs_depth_structured_redaction: Rails filter_parameters counts as redaction", () => {
    const prod = "config.logger = ActiveSupport::TaggedLogging.new(Logger.new(STDOUT))";
    expect(
      status({
        "config/environments/production.rb": prod,
        "config/initializers/filter_parameter_logging.rb": "Rails.application.config.filter_parameters += %i[password api_key second_factor_token]",
      }, "obs_depth_structured_redaction"),
    ).toBe("PASS");
    expect(status({ "config/environments/production.rb": prod }, "obs_depth_structured_redaction")).toBe("FAIL");
    expect(
      status({
        "config/initializers/filter_parameter_logging.rb": "Rails.application.config.filter_parameters += %i[password]",
        "app/login.rb": "logger.info(password)",
      }, "obs_depth_structured_redaction"),
    ).toBe("FAIL");
  });

  it("obs_depth_utc_timestamps: 'prevent' is not an event, Ruby .utc is UTC", () => {
    expect(
      status({ "lib/auth.ts": "// Set this to prevent Gmail from threading emails.\nheaders: { 'X-Entity-Ref-ID': new Date().getTime() + '' }" }, "obs_depth_utc_timestamps"),
    ).toBe("SKIPPED");
    expect(
      status({ "lib/audit.rb": 'Rails.logger.info("audit at #{Time.now.utc.iso8601}")' }, "obs_depth_utc_timestamps"),
    ).toBe("PASS");
    expect(
      status({ "src/log.ts": 'logger.info({ timestamp: new Date().toLocaleString(), event: "started" });' }, "obs_depth_utc_timestamps"),
    ).toBe("WARN");
  });

  it("pages_depth_account_deletion_route: unsampled route paths count as evidence", () => {
    const files = { "apps/web/modules/settings/my-account/general-view.tsx": "export default function GeneralView() { return null; }" };
    expect(
      status(files, "pages_depth_account_deletion_route", ["apps/web/playwright/auth/delete-account.e2e.ts"]),
    ).toBe("PASS");
    expect(
      status(files, "pages_depth_account_deletion_route", ["apps/web/modules/settings/my-account/appearance-view.tsx"]),
    ).toBe("WARN");
  });
});
