import { apiOk } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const commit = process.env.COMMIT_SHA ?? null;
  return apiOk({
    ok: true,
    service: "foundry-by-gitwork",
    version: process.env.npm_package_version ?? "0.1.0",
    // Deploy provenance — injected at Docker build via the deploy workflow.
    commit,
    commitShort: commit ? commit.slice(0, 7) : null,
    builtAt: process.env.BUILD_TIME ?? null,
    timestamp: new Date().toISOString(),
  });
}
