"use client";

import { CheckCircleIcon, ShieldCheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";

type DemoState = "idle" | "loading" | "ready";

type DemoProfile = {
  key: string;
  input: string;
  name: string;
  role: string;
  score: number;
  confidence: string;
  availability: string;
  location: string;
  fit: string;
  summary: string;
  stack: string[];
  checks: { label: string; value: string }[];
  strengths: string[];
  nextStep: string;
};

const demoProfiles: DemoProfile[] = [
  {
    key: "sarah",
    input: "@sarahk-dev",
    name: "Sarah Khan",
    role: "Senior Full Stack Engineer",
    score: 91,
    confidence: "High confidence",
    availability: "Available in 2 weeks",
    location: "London + remote",
    fit: "Strong fit for fast-moving product work",
    summary:
      "Balanced frontend and backend profile with strong delivery cadence, mature communication signals, and a public footprint that supports deeper review.",
    stack: ["TypeScript", "React", "Node.js", "Next.js", "Product delivery"],
    checks: [
      { label: "Identity", value: "Matched" },
      { label: "GitHub", value: "Active" },
      { label: "Delivery signal", value: "Strong" },
    ],
    strengths: ["Owns product-facing builds", "Strong async collaboration", "Good agency/client communication"],
    nextStep: "Move into a full Gitwork review and staffing conversation.",
  },
  {
    key: "shahab",
    input: "Shahab",
    name: "Shahab",
    role: "Senior Developer",
    score: 88,
    confidence: "Strong signal",
    availability: "Available this month",
    location: "Pakistan + remote",
    fit: "Strong fit for delivery-led platform work",
    summary:
      "Credible senior profile with broad engineering coverage and enough visible signal to support a proper team review rather than a cold guess.",
    stack: ["React", "Node.js", "AI", "DevOps", "Leadership"],
    checks: [
      { label: "Identity", value: "Matched" },
      { label: "Stack depth", value: "Broad" },
      { label: "Risk level", value: "Low" },
    ],
    strengths: ["Cross-functional delivery", "Technical breadth", "Commercially useful seniority"],
    nextStep: "Suitable for a structured agency-led validation and client shortlist.",
  },
  {
    key: "martin",
    input: "@martin-ui",
    name: "Martin Hale",
    role: "Frontend Product Engineer",
    score: 84,
    confidence: "Promising signal",
    availability: "Open to freelance",
    location: "Manchester",
    fit: "Best for product UI and experience-led work",
    summary:
      "Good public design-engineering blend, useful frontend depth, and enough signal to justify a proper capability interview through Gitwork.",
    stack: ["React", "Design systems", "Motion", "Accessibility"],
    checks: [
      { label: "Identity", value: "Matched" },
      { label: "Portfolio", value: "Strong" },
      { label: "Team fit", value: "Review" },
    ],
    strengths: ["Design-sensitive frontend", "Component systems", "High polish output"],
    nextStep: "Use as a front-door trust signal before a deeper Gitwork capability review.",
  },
];

function getDemoProfile(value: string): DemoProfile {
  const clean = value.trim().replace(/^@/, "").toLowerCase();

  const matched =
    demoProfiles.find((profile) => profile.input.replace(/^@/, "").toLowerCase() === clean) ??
    demoProfiles.find((profile) => profile.name.toLowerCase() === clean);

  if (matched) {
    return matched;
  }

  const fallback = demoProfiles[0];
  return {
    ...fallback,
    input: value,
    key: clean || fallback.key,
    name: value.trim().replace(/^@/, "") || fallback.name,
    score: 83 + ((clean.length * 3) % 11),
    confidence: clean.length % 2 === 0 ? "Strong signal" : "Promising signal",
    summary:
      "Useful public footprint and enough technical signal for a proper Gitwork review. The full product would deepen identity, delivery, and repo-level analysis.",
  };
}

function stackTone(item: string) {
  if (item.toLowerCase().includes("react") || item.toLowerCase().includes("next")) {
    return "border-sky-400/24 bg-sky-400/12 text-sky-100";
  }
  if (item.toLowerCase().includes("node") || item.toLowerCase().includes("devops")) {
    return "border-emerald-400/24 bg-emerald-400/12 text-emerald-100";
  }
  if (item.toLowerCase().includes("ai")) {
    return "border-violet-400/24 bg-violet-400/12 text-violet-100";
  }
  return "border-white/10 bg-white/[0.06] text-white/78";
}

export function CodeClearSiteDemo({ compact = false }: { compact?: boolean } = {}) {
  const [value, setValue] = useState(demoProfiles[0].input);
  const [state, setState] = useState<DemoState>("idle");
  const [result, setResult] = useState<DemoProfile | null>(demoProfiles[0]);

  const helper = useMemo(() => {
    if (state === "loading") {
      return "Running public-profile checks, stack mapping, and delivery fit scoring…";
    }
    return "A public-facing CodeClear experience can generate early trust, then pass high-signal candidates into a deeper Gitwork review.";
  }, [state]);

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
      setResult(getDemoProfile(source));
      setState("ready");
    }, 700);
  }

  return (
    <aside
      className={
        compact
          ? "rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,#0b0f18_0%,#0f1522_100%)] p-4 text-white shadow-[0_24px_90px_rgba(10,13,18,0.26)]"
          : "rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#0b0f18_0%,#0f1522_100%)] p-5 text-white shadow-[0_28px_110px_rgba(10,13,18,0.32)]"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">CodeClear demo</p>
          <h3 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-white">Validate a developer</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/66">
          Public preview
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">{helper}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {demoProfiles.map((profile) => (
          <button
            key={profile.key}
            type="button"
            onClick={() => handleRun(profile.input)}
            className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/72 transition hover:bg-white/[0.09]"
          >
            {profile.name}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_154px]">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="@github-handle or CV link"
          className="h-12 w-full rounded-[14px] border border-white/10 bg-white/[0.06] px-4 text-sm text-white outline-none placeholder:text-white/34 focus:border-[rgba(91,124,255,0.64)]"
        />

        <button
          type="button"
          onClick={() => handleRun()}
          disabled={!value.trim() || state === "loading"}
          className="app-button app-button-primary app-button-md w-full"
        >
          <SparklesIcon className="h-4 w-4" />
          {state === "loading" ? "Analysing" : "Run demo"}
        </button>
      </div>

      <div className="mt-6 rounded-[26px] border border-white/8 bg-white/[0.045] p-4">
        {result ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div className="rounded-[22px] border border-white/8 bg-[#111827] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold tracking-[-0.03em] text-white">{result.name}</p>
                    <p className="mt-1 text-sm text-white/56">{result.role}</p>
                  </div>
                  <div className="rounded-[16px] border border-emerald-400/24 bg-emerald-400/12 px-3 py-2 text-right">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/70">Score</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-100">{result.score}/100</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Confidence", result.confidence],
                    ["Availability", result.availability],
                    ["Location", result.location],
                  ].map(([label, val]) => (
                    <div key={label} className="rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">{label}</p>
                      <p className="mt-2 text-sm text-white/78">{val}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(91,124,255,0.18),rgba(91,124,255,0.05))] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Fit</p>
                <p className="mt-3 text-base font-semibold tracking-[-0.03em] text-white">{result.fit}</p>
                <p className="mt-4 text-sm leading-6 text-white/62">{result.nextStep}</p>
              </div>
            </div>

            <p className="text-sm leading-7 text-white/70">{result.summary}</p>

            <div className="flex flex-wrap gap-2">
              {result.stack.map((item) => (
                <span
                  key={item}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${stackTone(item)}`}
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[20px] border border-white/8 bg-[#111827] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Checks</p>
                <div className="mt-3 space-y-2">
                  {result.checks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center justify-between rounded-[14px] border border-white/8 bg-white/[0.04] px-3 py-2.5"
                    >
                      <span className="text-sm text-white/62">{check.label}</span>
                      <span className="text-sm font-medium text-white">{check.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/8 bg-[#111827] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Strengths</p>
                <div className="mt-3 space-y-2.5">
                  {result.strengths.map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm text-white/72">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/8 bg-[#121826] p-4">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="h-4 w-4 text-sky-300" />
                <p className="text-sm font-medium text-white">What this becomes inside Gitwork</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/56">
                The public demo creates initial trust. The agency workflow goes further with identity review, GitHub
                analysis, delivery notes, staffing context, and a real human-led recommendation.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Identity", "Cross-check public profile signals"],
              ["Technical depth", "Map stack, seniority, and delivery fit"],
              ["Agency review", "Route promising profiles into Gitwork follow-up"],
            ].map(([title, copy]) => (
              <div key={title} className="rounded-[18px] border border-white/8 bg-[#111827] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">{title}</p>
                <p className="mt-3 text-sm leading-6 text-white/72">{copy}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
