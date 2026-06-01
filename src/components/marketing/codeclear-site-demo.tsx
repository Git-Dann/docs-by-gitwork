"use client";

import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";

type DemoState = "idle" | "loading" | "ready";

type DemoScenario = {
  id: string;
  label: string;
  brief: string;
  timeline: string;
  workType: string;
  nextStep: string;
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
  },
  {
    id: "ai-dashboard",
    label: "AI platform, 6 months",
    brief:
      "We need an AI-enabled web platform over 6 months. Next.js frontend, Python services, structured data workflows, and delivery support for a product team moving from prototype to real client rollout.",
    timeline: "6-month build and launch",
    workType: "AI-enabled product",
    nextStep: "Gitwork would turn the shortlist into a staffed recommendation with delivery ownership, not just names on a page.",
  },
  {
    id: "design-system",
    label: "Design system, 4 months",
    brief:
      "We want to rebuild our design system and web platform over 4 months. Strong React delivery, component systems, frontend architecture, and enough product sense to work cleanly with design and engineering leads.",
    timeline: "4-month systems engagement",
    workType: "Design systems + frontend",
    nextStep: "The public integration creates trust early; Gitwork takes it through capability review, delivery planning, and staffing.",
  },
];

// Feature lists change per scenario; card structure and pricing stays fixed
const scenarioFeatures: Record<string, { starter: string[]; pro: string[]; intermediate: string[] }> = {
  "ios-retainer": {
    starter: [
      "1 × iOS developer, daily rate",
      "Working UK hours",
      "Zero term commitment",
      "3 Tier 3 developer matches",
      "Code verified profiles",
    ],
    pro: [
      "Dedicated iOS + backend squad",
      "Full-time product manager included",
      "End-to-end delivery ownership",
      "Unlimited Code scans",
      "Embedded delivery support",
      "White-label exports",
    ],
    intermediate: [
      "1 × senior iOS developer",
      "3-month minimum commitment",
      "Monthly delivery reviews",
      "Up to 50 Code scans",
      "Proposal review & feedback",
      "Priority email support",
    ],
  },
  "ai-dashboard": {
    starter: [
      "1 × platform engineer, daily rate",
      "Working UK hours",
      "Zero term commitment",
      "3 Tier 3 developer matches",
      "Code verified profiles",
    ],
    pro: [
      "AI + backend + frontend squad",
      "Full-time product manager included",
      "Prototype to production ownership",
      "Unlimited Code scans",
      "Embedded delivery support",
      "White-label exports",
    ],
    intermediate: [
      "1 × senior platform engineer",
      "3-month minimum commitment",
      "Monthly delivery reviews",
      "Up to 50 Code scans",
      "Proposal review & feedback",
      "Priority email support",
    ],
  },
  "design-system": {
    starter: [
      "1 × frontend developer, daily rate",
      "Working UK hours",
      "Zero term commitment",
      "3 Tier 3 developer matches",
      "Code verified profiles",
    ],
    pro: [
      "Design system + frontend squad",
      "Full-time product manager included",
      "Component library to production",
      "Unlimited Code scans",
      "Embedded delivery support",
      "White-label exports",
    ],
    intermediate: [
      "1 × senior frontend engineer",
      "3-month minimum commitment",
      "Monthly delivery reviews",
      "Up to 50 Code scans",
      "Proposal review & feedback",
      "Priority email support",
    ],
  },
};

function resolveScenario(value: string) {
  const query = value.toLowerCase();
  if (query.includes("ios") || query.includes("swift") || query.includes("mobile")) return scenarios[0];
  if (query.includes("ai") || query.includes("python") || query.includes("platform")) return scenarios[1];
  if (query.includes("design system") || query.includes("frontend") || query.includes("component")) return scenarios[2];
  return scenarios[0];
}

export function CodeClearSiteDemo() {
  const [value, setValue] = useState(scenarios[0].brief);
  const [state, setState] = useState<DemoState>("idle");
  const [result, setResult] = useState<DemoScenario>(scenarios[0]);

  function handleSelectScenario(scenario: DemoScenario) {
    setValue(scenario.brief);
    setResult(scenario);
    setState("idle");
  }

  function handleRun() {
    const source = value.trim();
    if (!source) return;
    setState("loading");
    window.setTimeout(() => {
      setResult(resolveScenario(source));
      setState("ready");
    }, 700);
  }

  const features = scenarioFeatures[result.id] ?? scenarioFeatures["ios-retainer"];

  return (
    <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#0b0f18_0%,#0e1320_100%)] p-5 text-white shadow-[0_32px_120px_rgba(4,8,18,0.34)] md:p-8">
      <div className="mx-auto max-w-[820px] text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Code integration</p>
        <h3 className="mt-4 text-[40px] font-semibold leading-[1.05] tracking-[-0.05em] text-white">
          What do you want to build?
        </h3>
        <p className="mx-auto mt-4 max-w-[720px] text-[18px] leading-8 text-white/60">
          A hiring company can describe the work, timeframe, and delivery shape, then see high-signal Gitwork matches
          before the first shortlist call.
        </p>
      </div>

      {/* Scenario pills — pre-fill only, no auto-run */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => handleSelectScenario(scenario)}
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
                name="buildRequest"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={5}
                className="mt-3 min-h-[168px] w-full resize-none rounded-[22px] border border-white/10 bg-[#101522] px-5 py-4 text-[16px] leading-7 text-white outline-none placeholder:text-white/28 focus:border-[#7c8cff]/54 focus-visible:ring-4 focus-visible:ring-[#7c8cff]/18"
                placeholder="Describe the team you need, the work to be done, and how long the engagement should run…"
              />
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[10px] border border-white/8 bg-[#101522] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Work type</p>
                <p className="mt-2 text-sm text-white/82">{result.workType}</p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[#101522] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Timeline</p>
                <p className="mt-2 text-sm text-white/82">{result.timeline}</p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-[#101522] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Output</p>
                <p className="mt-2 text-sm text-white/82">3 top matches with delivery fit</p>
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-white/8 bg-[#101522] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Live matching</p>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/66">
                Public preview
              </span>
            </div>

            <div className="mt-6 space-y-3">
              <div className="rounded-[10px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Signal</p>
                <p className="mt-2 text-sm leading-6 text-white/82">
                  Role framing, stack fit, availability, and delivery signal are combined into one shortlist.
                </p>
              </div>
              <div className="rounded-[10px] border border-white/8 bg-white/[0.04] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Next</p>
                <p className="mt-2 text-sm leading-6 text-white/82">{result.nextStep}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={!value.trim() || state === "loading"}
              className="app-button app-button-primary app-button-md mt-5 w-full justify-center"
            >
              <SparklesIcon className="h-4 w-4" />
              {state === "loading" ? "Matching Team…" : "Show Top Matches"}
            </button>
          </div>
        </div>
      </div>

      {/* Cards — only visible after Show top matches is clicked */}
      {state === "ready" && (
        <>
          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Matched packages</p>
              <h4 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-white">
                Choose the right delivery shape
              </h4>
            </div>
            <p className="max-w-[420px] text-sm leading-6 text-white/56 md:text-right">
              Each package unlocks a different tier of developer matches. Gitwork takes the shortlist through capability
              review, delivery planning, and staffing.
            </p>
          </div>

          <div className="mt-5 grid items-end gap-4 xl:grid-cols-3" aria-live="polite">
            {/* Starter */}
            <article className="flex flex-col rounded-[26px] border border-white/8 bg-[#101522] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Starter</p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-[40px] font-semibold leading-none tracking-[-0.05em] text-white">£350</span>
                <span className="mb-0.5 text-[16px] text-white/40">/ Day</span>
              </div>
              <p className="mt-3 text-[13px] leading-5 text-white/54">
                Flexible daily rate with zero term commitment. Ideal for focused delivery sprints.
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {features.starter.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-cyan)]" />
                    <span className="text-[13px] leading-5 text-white/78">{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-primary app-button-md mt-7 w-full justify-center"
              >
                Discuss Plan
              </a>
            </article>

            {/* Pro — always Recommended, slightly more padding */}
            <div className="flex flex-col">
              <div className="flex items-center justify-center rounded-t-[20px] bg-[var(--brand-gradient)] px-6 py-3">
                <span className="text-[13px] font-semibold text-white">Recommended</span>
              </div>
              <article className="flex flex-1 flex-col rounded-b-[26px] rounded-t-none border border-[rgba(9,112,200,0.5)] bg-[#071828] px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Pro</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-[40px] font-semibold leading-none tracking-[-0.05em] text-white">Custom</span>
                </div>
                <p className="mt-3 text-[13px] leading-5 text-white/54">
                  Full Gitwork agency engagement. A dedicated team behind every brief, proposal, and hire.
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {features.pro.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#45d483]" />
                      <span className="text-[13px] leading-5 text-white/78">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-primary app-button-md mt-7 w-full justify-center"
                >
                  Talk to us
                </a>
              </article>
            </div>

            {/* Intermediate */}
            <article className="flex flex-col rounded-[26px] border border-white/8 bg-[#101522] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Intermediate</p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-[40px] font-semibold leading-none tracking-[-0.05em] text-white">£4,000</span>
                <span className="mb-0.5 text-[16px] text-white/40">/ Month</span>
              </div>
              <p className="mt-3 text-[13px] leading-5 text-white/54">
                Committed monthly engagement with agency input — reviews, strategy, and priority support.
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {features.intermediate.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#7c8cff]" />
                    <span className="text-[13px] leading-5 text-white/78">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/app/proof?brief=${encodeURIComponent(result.brief)}&scenario=${result.id}`}
                className="app-button app-button-primary app-button-md mt-7 w-full justify-center"
              >
                Create Brief
              </Link>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
