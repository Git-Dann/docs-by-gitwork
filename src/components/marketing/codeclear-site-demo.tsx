"use client";

import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

type DemoState = "idle" | "loading" | "ready";

type MatchCard = {
  id: string;
  name: string;
  role: string;
  location: string;
  availability: string;
  fit: string;
  score: number;
  summary: string;
  stack: string[];
  strengths: string[];
};

type DemoScenario = {
  id: string;
  label: string;
  brief: string;
  timeline: string;
  workType: string;
  nextStep: string;
  matches: MatchCard[];
};

const scenarios: DemoScenario[] = [
  {
    id: "ios-retainer",
    label: "iOS app, 12 months",
    brief:
      "We want to build an iOS app over 12 months for a funded product team. SwiftUI, backend API integration, product design collaboration, and someone strong enough to ship with pace from discovery through launch.",
    timeline: "12-month embedded engagement",
    workType: "iOS product build",
    nextStep: "Public match first, then a Gitwork-led capability review and delivery recommendation.",
    matches: [
      {
        id: "shahab",
        name: "Shahab",
        role: "Senior Product Engineer",
        location: "Remote, UK-aligned",
        availability: "Available in 2 weeks",
        fit: "92/100",
        score: 92,
        summary: "Strong delivery lead for product builds that need hands-on engineering and calm client communication.",
        stack: ["SwiftUI", "Node.js", "Product delivery", "APIs"],
        strengths: ["Owns feature delivery", "Comfortable with agency cadence", "Strong cross-functional collaboration"],
      },
      {
        id: "usman",
        name: "Usman Ali",
        role: "Senior Full Stack Engineer",
        location: "Remote, EU hours",
        availability: "Available this month",
        fit: "89/100",
        score: 89,
        summary: "Useful when the iOS surface needs reliable backend work and broader platform support around it.",
        stack: ["Swift", "React", "Node.js", "PostgreSQL"],
        strengths: ["Good technical breadth", "Strong implementation pace", "Reliable under changing scope"],
      },
      {
        id: "nasir",
        name: "Nasir",
        role: "Senior Delivery Engineer",
        location: "Remote, UK overlap",
        availability: "Open for long-term work",
        fit: "86/100",
        score: 86,
        summary: "Best when the build needs steadier systems thinking around DevOps, releases, and platform resilience.",
        stack: ["iOS", "DevOps", "Cloud", "Delivery"],
        strengths: ["Release discipline", "Production-minded", "Strong delivery support"],
      },
    ],
  },
  {
    id: "ai-dashboard",
    label: "AI platform, 6 months",
    brief:
      "We need an AI-enabled web platform over 6 months. Next.js frontend, Python services, structured data workflows, and delivery support for a product team moving from prototype to real client rollout.",
    timeline: "6-month build and launch",
    workType: "AI-enabled product",
    nextStep: "Gitwork would turn the shortlist into a staffed recommendation with delivery ownership, not just names on a page.",
    matches: [
      {
        id: "fahad",
        name: "Fahad",
        role: "Senior Platform Engineer",
        location: "Remote, UK-aligned",
        availability: "Available next month",
        fit: "91/100",
        score: 91,
        summary: "Strong fit for product teams that need clean architecture, platform depth, and sensible delivery structure.",
        stack: ["Next.js", "Python", "AI", "Cloud"],
        strengths: ["Platform architecture", "Excellent systems judgment", "Strong implementation quality"],
      },
      {
        id: "waqar",
        name: "Waqar",
        role: "Mid-Level Full Stack Engineer",
        location: "Remote, EU hours",
        availability: "Available now",
        fit: "85/100",
        score: 85,
        summary: "Useful for sustained delivery across frontend and backend where pace matters more than layered process.",
        stack: ["React", "Python", "PostgreSQL", "APIs"],
        strengths: ["Good execution speed", "Solid across the stack", "Strong feature ownership"],
      },
      {
        id: "jamal",
        name: "Jamal",
        role: "Mid-Level Product Engineer",
        location: "Remote, UK overlap",
        availability: "Available in 1 week",
        fit: "82/100",
        score: 82,
        summary: "Best for product-focused delivery where interface quality and dependable implementation need to stay balanced.",
        stack: ["Next.js", "TypeScript", "UI systems", "APIs"],
        strengths: ["Interface quality", "Clear communication", "Steady delivery pace"],
      },
    ],
  },
  {
    id: "design-system",
    label: "Design system, 4 months",
    brief:
      "We want to rebuild our design system and web platform over 4 months. Strong React delivery, component systems, frontend architecture, and enough product sense to work cleanly with design and engineering leads.",
    timeline: "4-month systems engagement",
    workType: "Design systems + frontend",
    nextStep: "The public integration creates trust early; Gitwork takes it through capability review, delivery planning, and staffing.",
    matches: [
      {
        id: "hamza",
        name: "Hamza Ahmed",
        role: "Junior Frontend Engineer",
        location: "Remote, UK-aligned",
        availability: "Available now",
        fit: "79/100",
        score: 79,
        summary: "Good support profile for a larger squad where consistency and component implementation matter most.",
        stack: ["React", "TypeScript", "CSS", "Components"],
        strengths: ["Strong support capacity", "Comfortable in systems work", "Good implementation discipline"],
      },
      {
        id: "sibghatullah",
        name: "Sibghatullah",
        role: "Mid-Level Frontend Engineer",
        location: "Remote, EU hours",
        availability: "Available in 2 weeks",
        fit: "84/100",
        score: 84,
        summary: "A practical match for teams tightening component consistency and shipping frontend improvements fast.",
        stack: ["React", "Design systems", "Next.js", "Frontend QA"],
        strengths: ["Strong component thinking", "Clear frontend focus", "Good day-to-day reliability"],
      },
      {
        id: "umer",
        name: "Umer Fayyaz",
        role: "Mid-Level Product Engineer",
        location: "Remote, UK overlap",
        availability: "Available this month",
        fit: "83/100",
        score: 83,
        summary: "Best when the team needs a frontend-heavy builder who still understands delivery constraints and product tradeoffs.",
        stack: ["React", "Next.js", "TypeScript", "Product UI"],
        strengths: ["Strong UI delivery", "Good product judgment", "Works well inside collaborative teams"],
      },
    ],
  },
];

function resolveScenario(value: string) {
  const query = value.toLowerCase();

  if (query.includes("ios") || query.includes("swift") || query.includes("mobile")) {
    return scenarios[0];
  }

  if (query.includes("ai") || query.includes("python") || query.includes("platform")) {
    return scenarios[1];
  }

  if (query.includes("design system") || query.includes("frontend") || query.includes("component")) {
    return scenarios[2];
  }

  return scenarios[0];
}

function stackTone(item: string) {
  const token = item.toLowerCase();

  if (token.includes("swift") || token.includes("ios")) {
    return "border-[#7c8cff]/28 bg-[#7c8cff]/12 text-[#d8ddff]";
  }

  if (token.includes("react") || token.includes("next")) {
    return "border-[#3da9fc]/24 bg-[#3da9fc]/12 text-[#d4efff]";
  }

  if (token.includes("node") || token.includes("cloud") || token.includes("apis")) {
    return "border-[#45d483]/24 bg-[#45d483]/12 text-[#d7ffe8]";
  }

  if (token.includes("python") || token.includes("ai")) {
    return "border-[#f4b942]/24 bg-[#f4b942]/12 text-[#fff1cd]";
  }

  return "border-white/10 bg-white/[0.05] text-white/78";
}

function scoreTone(score: number) {
  if (score >= 90) {
    return "border-[#45d483]/24 bg-[#45d483]/12 text-[#d7ffe8]";
  }

  if (score >= 84) {
    return "border-[#7c8cff]/24 bg-[#7c8cff]/12 text-[#e2e6ff]";
  }

  return "border-[#f4b942]/24 bg-[#f4b942]/12 text-[#fff1cd]";
}

export function CodeClearSiteDemo() {
  const [value, setValue] = useState(scenarios[0].brief);
  const [state, setState] = useState<DemoState>("idle");
  const [result, setResult] = useState<DemoScenario>(scenarios[0]);

  function handleRun(nextValue?: string) {
    const source = (nextValue ?? value).trim();
    if (!source) {
      return;
    }

    if (nextValue) {
      setValue(nextValue);
    }

    setState("loading");

    window.setTimeout(() => {
      setResult(resolveScenario(source));
      setState("ready");
    }, 700);
  }

  return (
    <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#0b0f18_0%,#0e1320_100%)] p-5 text-white shadow-[0_32px_120px_rgba(4,8,18,0.34)] md:p-8">
      <div className="mx-auto max-w-[820px] text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">CodeClear integration</p>
        <h3 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.05em] text-white">
          What do you want to build?
        </h3>
        <p className="mx-auto mt-4 max-w-[720px] text-[18px] leading-8 text-white/60">
          A hiring company can describe the work, timeframe, and delivery shape, then see high-signal Gitwork matches
          before the first shortlist call.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => handleRun(scenario.brief)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              result.id === scenario.id
                ? "border-[#7c8cff]/30 bg-[#7c8cff]/14 text-white"
                : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.07]"
            }`}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <div className="mt-8 rounded-[28px] border border-white/8 bg-white/[0.03] p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px]">
          <div>
            <label className="block text-left">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">
                Build request
              </span>
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={5}
                className="mt-3 min-h-[168px] w-full resize-none rounded-[22px] border border-white/10 bg-[#101522] px-5 py-4 text-[16px] leading-7 text-white outline-none placeholder:text-white/28 focus:border-[#7c8cff]/54"
                placeholder="Describe the team you need, the work to be done, and how long the engagement should run."
              />
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-white/8 bg-[#101522] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Work type</p>
                <p className="mt-2 text-sm text-white/82">{result.workType}</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-[#101522] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Timeline</p>
                <p className="mt-2 text-sm text-white/82">{result.timeline}</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-[#101522] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Output</p>
                <p className="mt-2 text-sm text-white/82">3 top matches with delivery fit</p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-[#101522] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Live matching</p>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/66">
                Public preview
              </span>
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Signal</p>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  Role framing, stack fit, availability, and delivery signal are combined into one shortlist.
                </p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Next</p>
                <p className="mt-2 text-sm leading-6 text-white/82">{result.nextStep}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleRun()}
              disabled={!value.trim() || state === "loading"}
              className="app-button app-button-primary app-button-md mt-5 w-full justify-center"
            >
              <SparklesIcon className="h-4 w-4" />
              {state === "loading" ? "Matching team" : "Show top matches"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Top matches</p>
          <h4 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-white">
            3 developers surfaced for this brief
          </h4>
        </div>
        <p className="max-w-[420px] text-sm leading-6 text-white/56 md:text-right">
          The public integration gives a hiring team immediate confidence. Gitwork takes the shortlist through review,
          validation, and staffing.
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {result.matches.map((match, index) => (
          <article
            key={match.id}
            className="rounded-[26px] border border-white/8 bg-[#101522] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">
                  Match {index + 1}
                </p>
                <h5 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-white">{match.name}</h5>
                <p className="mt-1 text-sm text-white/56">{match.role}</p>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${scoreTone(match.score)}`}>
                {match.fit}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[16px] border border-white/8 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Location</p>
                <p className="mt-2 text-sm text-white/82">{match.location}</p>
              </div>
              <div className="rounded-[16px] border border-white/8 bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Availability</p>
                <p className="mt-2 text-sm text-white/82">{match.availability}</p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-7 text-white/68">{match.summary}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              {match.stack.map((item) => (
                <span key={item} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${stackTone(item)}`}>
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-5 space-y-2.5">
              {match.strengths.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-white/72">
                  <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#45d483]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
