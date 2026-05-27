import type { PulseScanCheckInput } from "@/types/pulse";

export type { PulseScanCheckInput };

export type FetchResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  html: string;
  responseTimeMs: number;
  finalUrl: string;
};

export type ProjectContext = {
  isPaymentEnabled: boolean;
  isAuthEnabled: boolean;
  isSaas: boolean;
  isMobileApp: boolean;
  hasBackend: boolean;
};

export interface ExtendedCheckContext {
  pageResult: FetchResult;
  httpsUrl: string;
  hostname: string;
  platform: string;
  ctx: ProjectContext;
  htmlLower: string;
}

const FETCH_TIMEOUT_MS = 8_000;

export async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function headRequest(url: string): Promise<number> {
  try {
    const res = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    return res.status;
  } catch {
    return 0;
  }
}

export async function checkDnsRecord(name: string, type: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
      { headers: { Accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const json = await res.json() as { Answer?: { data: string }[] };
    return (json.Answer ?? []).map((a) => a.data);
  } catch {
    return [];
  }
}

export function skip(
  category: string,
  checks: Array<[string, string]>,
  reason: string,
): PulseScanCheckInput[] {
  return checks.map(([checkKey, label]) => ({
    category, checkKey, label, status: "SKIPPED" as const, detail: reason,
  }));
}

export function platformIs(platform: string, ...platforms: string[]): boolean {
  return platforms.includes(platform.toUpperCase());
}
