import { apiOk } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiOk({
    ok: true,
    service: "docs-by-gitwork",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
