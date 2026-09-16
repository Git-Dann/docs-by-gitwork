import { CATEGORIES } from "../pulse-checks/categories";
import type { PulseScanCheckInput, DeployAgentInsights } from "@/types/pulse";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";

const VERCEL_API = "https://api.vercel.com";
const FETCH_TIMEOUT_MS = 8_000;

async function vercelFetch<T>(path: string, token: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${VERCEL_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface VercelDeployment {
  uid: string;
  url: string;
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  buildingAt?: number;
  ready?: number;
  createdAt: number;
}

interface VercelDeploymentsResponse {
  deployments: VercelDeployment[];
}

interface VercelBuildLog {
  text: string;
  type: "output" | "error" | "warning";
}

interface VercelBuildLogsResponse {
  logs?: VercelBuildLog[];
}

function extractWarnings(logs: VercelBuildLog[]): string[] {
  const warnings: string[] = [];
  for (const log of logs) {
    const text = log.text ?? "";
    if (
      log.type === "warning" ||
      /warning|deprecated|ts-ignore|@ts-expect/i.test(text)
    ) {
      const clean = text.replace(/\x1b\[[0-9;]*m/g, "").trim();
      if (clean.length > 10 && clean.length < 200) {
        warnings.push(clean);
      }
    }
  }
  return [...new Set(warnings)].slice(0, 10);
}

/**
 * Returns the response headers, or the reason there are none. A bare `{}` could
 * not tell "this host sent no platform headers" (so it is not Vercel) from "the
 * HEAD request failed" (so we have no idea) — and the caller read both as
 * "not Vercel", quietly downgrading an unreachable host to a clean skip.
 */
async function fetchHeaders(url: string): Promise<{ headers: Record<string, string>; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetchScannableUrl(url, {
      method: "HEAD",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { headers };
  } catch (error) {
    return { headers: {}, error: error instanceof Error ? error.message : "HEAD request failed" };
  }
}

/** Detect hosting platform from HTTP response headers. */
function detectPlatformFromHeaders(
  headers: Record<string, string>,
): DeployAgentInsights["platform"] {
  const server = headers["server"]?.toLowerCase() ?? "";
  if (headers["x-vercel-id"] || headers["x-vercel-cache"] || server.includes("vercel")) return "vercel";
  if (headers["x-nf-request-id"] || server.includes("netlify")) return "netlify";
  if (headers["railway-request-id"] || headers["x-railway-request-id"]) return "railway";
  // Catch-all for other detected hosting (Cloudflare, Render, Fly, GitHub Pages, Heroku, AWS…)
  if (
    headers["cf-ray"] ||
    server.includes("github") ||
    headers["x-render-origin-server"] ||
    headers["fly-request-id"] ||
    (headers["via"] && headers["via"].includes("vegur")) || // Heroku
    headers["x-amz-cf-id"] ||
    headers["x-amz-request-id"]
  ) return "other";
  return null;
}

export async function runDeployAgent(
  urlOrAppName: string,
): Promise<{ checks: PulseScanCheckInput[]; insights: DeployAgentInsights; collectorError?: string }> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const checks: PulseScanCheckInput[] = [];

  const rawUrl = urlOrAppName.startsWith("http") ? urlOrAppName : `https://${urlOrAppName}`;
  const hostname = new URL(rawUrl).hostname;

  const isVercelHostname = /\.vercel\.app$/i.test(hostname);
  let isVercel = isVercelHostname;
  let detectedPlatform: DeployAgentInsights["platform"] = isVercelHostname ? "vercel" : null;

  let headerProbeError: string | undefined;
  if (!isVercelHostname) {
    const probe = await fetchHeaders(rawUrl);
    headerProbeError = probe.error;
    detectedPlatform = detectPlatformFromHeaders(probe.headers);
    isVercel = detectedPlatform === "vercel";
  }

  if (!isVercel || !token) {
    return {
      checks: [],
      insights: {
        platform: detectedPlatform,
        recentDeployments: null,
        failedDeployments: null,
        avgBuildMs: null,
        buildWarnings: [],
        recentErrorPatterns: [],
      },
      // Only a failed probe is a collector failure. A successful probe that found
      // no Vercel signals is a real, correct answer, and a missing VERCEL_TOKEN is
      // a configuration choice — neither is an error.
      ...(headerProbeError ? { collectorError: `platform detection failed: ${headerProbeError}` } : {}),
    };
  }

  const appName = hostname.replace(/\.vercel\.app$/, "");

  const deploymentsData = await vercelFetch<VercelDeploymentsResponse>(
    `/v6/deployments?app=${encodeURIComponent(appName)}&limit=15`,
    token,
  );

  const deployments = deploymentsData?.deployments ?? [];
  const recentDeployments = deployments.length;
  const failedDeployments = deployments.filter((d) => d.state === "ERROR").length;
  const readyDeployments = deployments.filter((d) => d.state === "READY" && d.ready && d.buildingAt);
  const avgBuildMs =
    readyDeployments.length > 0
      ? Math.round(
          readyDeployments.reduce((sum, d) => sum + (d.ready! - d.buildingAt!), 0) /
            readyDeployments.length,
        )
      : null;

  // Deployment frequency / success rate check
  if (recentDeployments > 0) {
    const successRate = (recentDeployments - failedDeployments) / recentDeployments;
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "deployment_success_rate",
      label: "Deployment success rate",
      status: successRate >= 0.9 ? "PASS" : successRate >= 0.7 ? "WARN" : "FAIL",
      detail: `${recentDeployments - failedDeployments}/${recentDeployments} recent deployments succeeded (${Math.round(successRate * 100)}% success rate).`,
    });
  }

  // Build time check
  if (avgBuildMs !== null) {
    const avgBuildSec = avgBuildMs / 1000;
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "build_time",
      label: "Average build time",
      status: avgBuildSec < 60 ? "PASS" : avgBuildSec < 180 ? "WARN" : "FAIL",
      detail: `Average build time: ${Math.round(avgBuildSec)}s. ${avgBuildSec >= 180 ? "Slow builds delay deployments and increase costs." : ""}`.trim(),
    });
  }

  // Fetch build logs from the most recent successful deployment
  let buildWarnings: string[] = [];
  const latestReady = deployments.find((d) => d.state === "READY");
  if (latestReady) {
    const logsData = await vercelFetch<VercelBuildLogsResponse>(
      `/v2/deployments/${latestReady.uid}/events`,
      token,
    );
    if (logsData?.logs) {
      buildWarnings = extractWarnings(logsData.logs);
    }

    if (buildWarnings.length > 0) {
      checks.push({
        category: CATEGORIES.CODE_QUALITY,
        checkKey: "build_warnings",
        label: "Build warnings in latest deployment",
        status: buildWarnings.length > 10 ? "FAIL" : "WARN",
        detail: `${buildWarnings.length} build warning${buildWarnings.length !== 1 ? "s" : ""} detected in the latest deployment.`,
        evidence: buildWarnings.slice(0, 3).join(" | "),
      });
    }
  }

  return {
    checks,
    insights: {
      platform: "vercel",
      recentDeployments,
      failedDeployments,
      avgBuildMs,
      buildWarnings,
      recentErrorPatterns: [],
    },
  };
}
