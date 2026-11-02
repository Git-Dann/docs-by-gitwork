import {
  GA4_LAG_DAYS,
  SEARCH_CONSOLE_LAG_DAYS,
  compareQueries,
  daysIn,
  periodsFor,
  summariseAiVisits,
  summariseQueries,
  type AiSearchRange,
  type AiSearchReport,
  type AiVisitRow,
  type QueryRow,
} from "@/lib/ai-search";

/**
 * A fixed AI search report for /demo/pulse/ai-search. Built from invented rows run through
 * the REAL summarising rules, so the demo can't show a number the page would never compute.
 * Deterministic: the same range always gives the same figures.
 */

const TOPICS = [
  "software development agency uk", "app development company manchester", "hire react developers",
  "mvp development agency", "ai app development agency", "nearshore developers uk",
  "flutter app developers", "saas development company", "fractional cto uk",
  "build an mvp in 12 weeks", "dedicated development team", "next.js agency",
  "ios app developers uk", "android app development agency", "product discovery workshop",
  "technical due diligence startup", "vibe coded app production ready", "app audit service",
  "outsourced development team pakistan", "staff augmentation developers",
  "gitwork", "gitwork foundry", "pulse production readiness scan", "how much does an app cost uk",
  "web app development cost", "react native agency", "ai integration consultants", "rescue a failing app project",
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const SUFFIXES = ["", " near me", " reviews", " pricing", " london", " 2026", " best"];

function queries(seed: number, shift: number, count: number): QueryRow[] {
  const r = rng(seed);
  const rows: QueryRow[] = [];
  // Topic × suffix, so every query is distinct (Search Console's are).
  for (let i = 0; i < count && i < TOPICS.length * SUFFIXES.length; i += 1) {
    const query = `${TOPICS[i % TOPICS.length]}${SUFFIXES[Math.floor(i / TOPICS.length)]}`;
    const brand = query.startsWith("gitwork");
    const position = brand ? 1 + r() * 1.5 : Math.max(1, 3 + r() * 45 - shift);
    const impressions = Math.round((brand ? 400 : 12) + r() * (brand ? 200 : 260) / (1 + position / 8));
    const ctr = position <= 3 ? 0.18 : position <= 10 ? 0.04 : 0.004;
    rows.push({ query, position: Math.round(position * 10) / 10, impressions, clicks: Math.round(impressions * ctr * (0.5 + r())) });
  }
  return rows;
}

const SOURCES: Array<[string, number]> = [
  ["chatgpt.com", 0.55], ["perplexity.ai", 0.2], ["claude.ai", 0.12], ["gemini.google.com", 0.08], ["copilot.microsoft.com", 0.05],
];

function visits(days: string[], seed: number, scale: number): AiVisitRow[] {
  const r = rng(seed);
  const rows: AiVisitRow[] = [];
  days.forEach((date, i) => {
    for (const [source, share] of SOURCES) {
      const n = Math.round((2 + i * 0.05) * scale * share * (0.4 + r() * 1.2));
      if (n > 0) rows.push({ date, source, sessions: n });
    }
  });
  return rows;
}

export function demoAiSearchReport(range: AiSearchRange, now = new Date()): AiSearchReport {
  const sc = periodsFor(range, now, SEARCH_CONSOLE_LAG_DAYS);
  const ga = periodsFor(range, now, GA4_LAG_DAYS);
  const nowQ = queries(range * 7, 4, 180);
  const beforeQ = queries(range * 7 + 1, 0, 150);
  const nowV = visits(daysIn(ga.current), range, 1.35);
  const beforeV = summariseAiVisits(visits(daysIn(ga.previous), range + 1, 1), ga.previous);
  const pages = ["/", "/services/mvp", "/services/ai", "/case-studies/fellas", "/blog/how-much-does-an-app-cost", "/contact"];
  const total = summariseAiVisits(nowV, ga.current).total;
  return {
    range,
    generatedAt: now.toISOString(),
    google: {
      status: "ok",
      data: {
        period: sc.current,
        previousPeriod: sc.previous,
        current: summariseQueries(nowQ),
        previous: summariseQueries(beforeQ),
        truncated: false,
        queries: compareQueries(nowQ, beforeQ),
      },
    },
    aiVisits: {
      status: "ok",
      data: {
        period: ga.current,
        previousPeriod: ga.previous,
        current: summariseAiVisits(nowV, ga.current),
        previousTotal: beforeV.total,
        byAssistantPrevious: Object.fromEntries(beforeV.byAssistant.map((a) => [a.id, a.sessions])),
        pages: pages.map((path, i) => ({ path, sessions: Math.max(1, Math.round(total * [0.34, 0.22, 0.16, 0.12, 0.1, 0.06][i])) })),
      },
    },
    setup: {
      searchConsoleSite: "sc-domain:gitwork.co.uk",
      ga4PropertyId: "412345678",
      serviceAccountEmail: "foundry-reader@gitwork-foundry.iam.gserviceaccount.com",
    },
  };
}
