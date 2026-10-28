import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { CrawlObservation, FetchedPage } from "@/server/pulse-checks/site-crawl";

// The crawl-evidence post-pass has to be REACHED (live-path-guards.test.ts says why): these
// run the real runLiteScan with the network collectors replaced, and check what it returns
// and what it hands the persistence callback.

const HOME = "https://www.example.com/";
const doc = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><title>${title}</title></head><body><main>${body}</main></body></html>`;
const fetched = (url: string, body: string): FetchedPage => ({ url, finalUrl: url, status: 200, contentType: "text/html", headers: {}, body });

const homepageRows: PulseScanCheckInput[] = [
  { category: "Business Operations", checkKey: "supplier_due_diligence", label: "Sub-processor list published", status: "INCONCLUSIVE", detail: "The scanned page does not link a sub-processor list." },
  { category: "Business Operations", checkKey: "whistleblower_policy", label: "Whistleblowing channel published", status: "INCONCLUSIVE", detail: "The scanned page does not name a whistleblowing channel." },
  { category: "Security", checkKey: "unrelated_check", label: "Unrelated", status: "PASS" },
];

const observation: CrawlObservation = {
  home: fetched(HOME, doc("Example", "<p>Welcome to Example, the tool for teams.</p>")),
  pages: [],
  catchAll: { status: 404, body: "" },
  linkChecks: [],
  linksFound: 0,
  sitemap: { read: false, urlCount: 0, checks: [] },
  robotsBlocked: 0,
  budgetExhausted: false,
  trustPages: [{ topic: "subprocessors", fetch: fetched("https://www.example.com/legal/subprocessors", doc("Sub-processors | Example", "<h1>Sub-processors</h1><p>We use the following sub-processors to provide the service.</p>")) }],
};

const crawlAgent = vi.fn(async () => ({ checks: [] as PulseScanCheckInput[], observation }));

vi.mock("@/server/pulse-lite/url-guard", async (orig) => ({
  ...(await orig<typeof import("@/server/pulse-lite/url-guard")>()),
  assertScannableUrl: async (url: string) => ({ url }),
}));
vi.mock("@/server/pulse-scan", async (orig) => ({
  ...(await orig<typeof import("@/server/pulse-scan")>()),
  runUrlChecks: async (_url: string, _platform: string, onWave?: (c: PulseScanCheckInput[]) => void) => {
    onWave?.(homepageRows);
    return { checks: homepageRows, techStack: [], detectedMarkets: [], surfaceKind: "DEPLOYED_PRODUCT", store: null };
  },
}));
vi.mock("@/server/pulse-agents/site-crawl-agent", () => ({ runSiteCrawlAgent: () => crawlAgent() }));
vi.mock("@/server/pulse-agents/deploy-agent", () => ({ runDeployAgent: async () => ({ checks: [], insights: null }) }));
vi.mock("@/server/pulse-agents/browser-agent", () => ({ runBrowserAgent: async () => ({ checks: [], insights: null }) }));
vi.mock("@/server/pulse-agents/rendered-a11y-agent", () => ({ runRenderedA11yAgent: async () => ({ checks: [] }) }));
vi.mock("@/server/pulse-agents/consent-tracking-agent", () => ({ runConsentTrackingAgent: async () => ({ checks: [] }) }));

const { runLiteScan } = await import("../run-lite-scan");

beforeEach(() => crawlAgent.mockClear());

async function scan(renderJs: boolean) {
  const persisted: PulseScanCheckInput[] = [];
  const result = await runLiteScan({
    inputType: "URL",
    url: HOME,
    platform: "SAAS_APP",
    includePageSpeed: false,
    renderJs,
    onChecks: (batch) => { persisted.push(...batch); },
  });
  return { result, persisted };
}

describe("homepage-only checks answered from the crawl", () => {
  it("an internal scan upgrades a check from a crawled page, and stores one row for it", async () => {
    const { result, persisted } = await scan(true);
    expect(crawlAgent).toHaveBeenCalledTimes(1);
    const sub = result.checks.filter((c) => c.checkKey === "supplier_due_diligence");
    expect(sub).toHaveLength(1);
    expect(sub[0].status).toBe("PASS");
    expect(sub[0].detail).toContain("https://www.example.com/legal/subprocessors");
    // Persistence is append-only: the homepage's INCONCLUSIVE row was never written first.
    expect(persisted.filter((c) => c.checkKey === "supplier_due_diligence").map((c) => c.status)).toEqual(["PASS"]);
    // A check the crawled pages do not answer stays as the homepage left it.
    expect(result.checks.find((c) => c.checkKey === "whistleblower_policy")?.status).toBe("INCONCLUSIVE");
    // Checks outside the set are not held.
    expect(result.checks.find((c) => c.checkKey === "unrelated_check")?.status).toBe("PASS");
  });

  it("a scan that does not crawl (the public scan) keeps the homepage answer", async () => {
    const { result, persisted } = await scan(false);
    expect(crawlAgent).not.toHaveBeenCalled();
    expect(result.checks.find((c) => c.checkKey === "supplier_due_diligence")?.status).toBe("INCONCLUSIVE");
    expect(persisted.filter((c) => c.checkKey === "supplier_due_diligence")).toHaveLength(1);
  });
});
