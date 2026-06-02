import { type NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const BASE = "https://api.fellasloaded.com";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) return apiError("Missing endpoint param", 400);

  // Only allow the two analytics endpoints we need
  const allowed = [
    "/api/analytics/subscriptions/transactions/monthly_summary/",
    "/api/analytics/users/monthly/",
  ];
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (!allowed.some((a) => path.startsWith(a.split("?")[0]))) {
    return apiError("Endpoint not allowed", 403);
  }

  const token = req.headers.get("x-fellas-token");
  const qs = searchParams.get("qs") ?? "";
  const url = `${BASE}${path}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Foundry/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const upstream = await fetch(url, { headers, cache: "no-store" });
  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return apiError(`Upstream ${upstream.status}: ${body.slice(0, 200)}`, upstream.status);
  }

  const data = await upstream.json();
  return apiOk(data);
}
