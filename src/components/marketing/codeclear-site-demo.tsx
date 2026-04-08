"use client";

import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";

type DemoTier = {
  name: string;
  price: string;
  priceUnit: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  ctaExternal: boolean;
  featured: boolean;
  badgeText?: string;
  accentBadge: string;
  accentBorder: string;
  accentBg: string;
  accentCheck: string;
};

const demoTiers: DemoTier[] = [
  {
    name: "Starter",
    price: "Free",
    priceUnit: "",
    description: "Full platform access. Analyse briefs, write proposals, verify candidates — no card required.",
    features: [
      "Docs — unlimited proposals",
      "Proof — brief analysis",
      "CodeClear — up to 10 scans",
      "3 Tier 3 developer matches per brief",
      "Community support",
    ],
    cta: "Open platform",
    ctaHref: "/app/proposals",
    ctaExternal: false,
    featured: false,
    accentBadge: "",
    accentBorder: "border-white/8",
    accentBg: "bg-[#101522]",
    accentCheck: "text-[#f4b942]",
  },
  {
    name: "Pro",
    price: "£399",
    priceUnit: "/mth",
    description: "Full Gitwork agency engagement. A dedicated team behind every brief, proposal, and hire.",
    features: [
      "Everything in Intermediate",
      "CodeClear — unlimited scans",
      "3 Tier 1 + unlimited Tier 2 & Tier 3 matches",
      "Dedicated account lead",
      "Embedded delivery support",
      "White-label exports",
    ],
    cta: "Talk to us",
    ctaHref: "https://calendly.com/gitworkgroup/30min",
    ctaExternal: true,
    featured: true,
    badgeText: "Best fit",
    accentBadge: "bg-[linear-gradient(90deg,#059669,#10b981)]",
    accentBorder: "border-emerald-800/60",
    accentBg: "bg-[#0a1f15]",
    accentCheck: "text-[#45d483]",
  },
  {
    name: "Intermediate",
    price: "£149",
    priceUnit: "/mth",
    description: "Platform access plus agency input — proposal reviews, strategy sessions, and priority support.",
    features: [
      "Everything in Starter",
      "CodeClear — up to 50 scans",
      "3 Tier 2 + 3 Tier 3 developer matches per brief",
      "Monthly strategy session",
      "Proposal review & feedback",
      "Priority email support",
    ],
    cta: "Get started",
    ctaHref: "https://calendly.com/gitworkgroup/30min",
    ctaExternal: true,
    featured: false,
    accentBadge: "",
    accentBorder: "border-white/8",
    accentBg: "bg-[#101522]",
    accentCheck: "text-[#7c8cff]",
  },
];

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

      <div className="mt-5 grid items-end gap-4 xl:grid-cols-3">
        {demoTiers.map((tier) => (
          <div key={tier.name} className="relative flex flex-col">
            {tier.featured ? (
              <div className={`flex items-center justify-center rounded-t-[20px] px-6 py-3 ${tier.accentBadge}`}>
                <span className="text-[13px] font-semibold text-white">{tier.badgeText}</span>
              </div>
            ) : null}
            <article
              className={`flex flex-1 flex-col border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${tier.accentBg} ${tier.accentBorder} ${
                tier.featured ? "rounded-b-[26px] rounded-t-none" : "rounded-[26px]"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">{tier.name}</p>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-[40px] font-semibold leading-none tracking-[-0.05em] text-white">
                  {tier.price}
                </span>
                {tier.priceUnit ? (
                  <span className="mb-0.5 text-[16px] text-white/40">{tier.priceUnit}</span>
                ) : null}
              </div>

              <p className="mt-3 text-[13px] leading-5 text-white/54">{tier.description}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckCircleIcon className={`mt-0.5 h-4 w-4 shrink-0 ${tier.accentCheck}`} />
                    <span className="text-[13px] leading-5 text-white/78">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                {tier.ctaExternal ? (
                  <a
                    href={tier.ctaHref}
                    target="_blank"
                    rel="noreferrer"
                    className="app-button app-button-primary app-button-md w-full justify-center"
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    href={tier.ctaHref}
                    className="app-button app-button-primary app-button-md w-full justify-center"
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
