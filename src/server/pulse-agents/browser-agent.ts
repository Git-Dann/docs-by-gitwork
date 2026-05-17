import type { PulseScanCheckInput, BrowserAgentInsights } from "@/types/pulse";

const PSI_TIMEOUT_MS = 35_000;

interface LighthouseCategory { score: number | null }
interface LighthouseAudit { numericValue?: number; displayValue?: string }
interface PsiResponse {
  lighthouseResult?: {
    categories: {
      performance?: LighthouseCategory;
      accessibility?: LighthouseCategory;
      "best-practices"?: LighthouseCategory;
      seo?: LighthouseCategory;
    };
    audits: Record<string, LighthouseAudit>;
  };
  loadingExperience?: {
    overall_category?: string;
  };
}

function scoreStatus(
  score: number | null | undefined,
  good = 0.9,
  ok = 0.5,
): "PASS" | "WARN" | "FAIL" {
  if (score == null) return "FAIL";
  return score >= good ? "PASS" : score >= ok ? "WARN" : "FAIL";
}

export async function runBrowserAgent(
  url: string,
): Promise<{ checks: PulseScanCheckInput[]; insights: BrowserAgentInsights | null }> {
  const apiKey = process.env.GOOGLE_PSI_API_KEY?.trim();
  const checks: PulseScanCheckInput[] = [];

  try {
    const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    psiUrl.searchParams.set("url", url);
    psiUrl.searchParams.set("strategy", "mobile");
    psiUrl.searchParams.set("category", "performance");
    psiUrl.searchParams.set("category", "accessibility");
    psiUrl.searchParams.set("category", "best-practices");
    psiUrl.searchParams.set("category", "seo");
    if (apiKey) psiUrl.searchParams.set("key", apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);
    const res = await fetch(psiUrl.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return { checks: [], insights: null };

    const data = (await res.json()) as PsiResponse;
    const lhr = data.lighthouseResult;
    if (!lhr) return { checks: [], insights: null };

    const audits = lhr.audits;
    const cats = lhr.categories;
    const cruxCategory = data.loadingExperience?.overall_category ?? null;

    // Performance score
    const perfScore = cats.performance?.score ?? null;
    const perfPct = perfScore !== null ? Math.round(perfScore * 100) : null;
    checks.push({
      category: "Performance",
      checkKey: "psi_performance",
      label: "Lighthouse performance score (mobile)",
      status: scoreStatus(perfScore, 0.9, 0.5),
      detail:
        perfPct !== null
          ? `Performance: ${perfPct}/100${perfPct < 50 ? " — significant performance issues." : perfPct < 90 ? " — room to improve." : " — good."}`
          : "Could not retrieve Lighthouse performance score.",
    });

    // LCP
    const lcp = audits["largest-contentful-paint"]?.numericValue;
    if (lcp !== undefined) {
      const s = lcp / 1000;
      checks.push({
        category: "Performance",
        checkKey: "psi_lcp",
        label: "Largest Contentful Paint (LCP)",
        status: s <= 2.5 ? "PASS" : s <= 4 ? "WARN" : "FAIL",
        detail: `LCP: ${audits["largest-contentful-paint"]?.displayValue ?? `${s.toFixed(1)} s`}. Good: ≤2.5 s, needs improvement: ≤4 s.`,
      });
    }

    // CLS
    const cls = audits["cumulative-layout-shift"]?.numericValue;
    if (cls !== undefined) {
      checks.push({
        category: "Performance",
        checkKey: "psi_cls",
        label: "Cumulative Layout Shift (CLS)",
        status: cls <= 0.1 ? "PASS" : cls <= 0.25 ? "WARN" : "FAIL",
        detail: `CLS: ${audits["cumulative-layout-shift"]?.displayValue ?? cls.toFixed(3)}. Good: ≤0.1, needs improvement: ≤0.25.`,
      });
    }

    // FCP
    const fcp = audits["first-contentful-paint"]?.numericValue;
    if (fcp !== undefined) {
      const s = fcp / 1000;
      checks.push({
        category: "Performance",
        checkKey: "psi_fcp",
        label: "First Contentful Paint (FCP)",
        status: s <= 1.8 ? "PASS" : s <= 3 ? "WARN" : "FAIL",
        detail: `FCP: ${audits["first-contentful-paint"]?.displayValue ?? `${s.toFixed(1)} s`}. Good: ≤1.8 s, needs improvement: ≤3 s.`,
      });
    }

    // TBT
    const tbt = audits["total-blocking-time"]?.numericValue;
    if (tbt !== undefined) {
      checks.push({
        category: "Performance",
        checkKey: "psi_tbt",
        label: "Total Blocking Time (TBT)",
        status: tbt <= 200 ? "PASS" : tbt <= 600 ? "WARN" : "FAIL",
        detail: `TBT: ${audits["total-blocking-time"]?.displayValue ?? `${Math.round(tbt)} ms`}. Indicates main-thread blocking that degrades interactivity.`,
      });
    }

    // Accessibility
    const a11yScore = cats.accessibility?.score ?? null;
    const a11yPct = a11yScore !== null ? Math.round(a11yScore * 100) : null;
    checks.push({
      category: "Accessibility",
      checkKey: "psi_accessibility",
      label: "Lighthouse accessibility score",
      status: scoreStatus(a11yScore, 0.9, 0.7),
      detail:
        a11yPct !== null
          ? `Accessibility: ${a11yPct}/100${a11yPct < 70 ? " — significant accessibility barriers." : a11yPct < 90 ? " — some issues to address." : " — good."}`
          : "Could not retrieve accessibility score.",
    });

    // SEO
    const seoScore = cats.seo?.score ?? null;
    const seoPct = seoScore !== null ? Math.round(seoScore * 100) : null;
    checks.push({
      category: "SEO",
      checkKey: "psi_seo",
      label: "Lighthouse SEO score",
      status: scoreStatus(seoScore, 0.9, 0.7),
      detail:
        seoPct !== null
          ? `SEO: ${seoPct}/100${seoPct < 70 ? " — critical SEO issues." : seoPct < 90 ? " — SEO improvements available." : " — good."}`
          : "Could not retrieve SEO score.",
    });

    // Best practices
    const bpScore = cats["best-practices"]?.score ?? null;
    const bpPct = bpScore !== null ? Math.round(bpScore * 100) : null;
    checks.push({
      category: "Security",
      checkKey: "psi_best_practices",
      label: "Lighthouse best practices score",
      status: scoreStatus(bpScore, 0.9, 0.75),
      detail:
        bpPct !== null
          ? `Best practices: ${bpPct}/100${bpPct < 75 ? " — security/best-practice violations." : bpPct < 90 ? " — some issues." : " — good."}`
          : "Could not retrieve best practices score.",
    });

    // CrUX real-user data
    if (cruxCategory) {
      const isFast = cruxCategory === "FAST";
      const isAvg = cruxCategory === "AVERAGE";
      checks.push({
        category: "Performance",
        checkKey: "crux_overall",
        label: "Real-user experience (Chrome UX Report)",
        status: isFast ? "PASS" : isAvg ? "WARN" : "FAIL",
        detail: `Chrome User Experience Report: ${cruxCategory.toLowerCase()} — based on real visits to this URL.`,
      });
    }

    return {
      checks,
      insights: {
        performanceScore: perfPct,
        accessibilityScore: a11yPct,
        seoScore: seoPct,
        bestPracticesScore: bpPct,
        lcp: lcp !== undefined ? Math.round(lcp) : null,
        cls: cls !== undefined ? cls : null,
        fcp: fcp !== undefined ? Math.round(fcp) : null,
        tbt: tbt !== undefined ? Math.round(tbt) : null,
        cruxCategory,
      },
    };
  } catch {
    return { checks: [], insights: null };
  }
}
