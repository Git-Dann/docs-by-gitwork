"use client";

import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";

type DemoState = "idle" | "loading" | "ready";

type DemoResult = {
  handle: string;
  score: number;
  confidence: string;
  stack: string[];
  summary: string;
};

function buildDemoResult(value: string): DemoResult {
  const clean = value.trim().replace(/^@/, "") || "candidate";
  const score = 82 + (clean.length % 9);
  const stacks = ["React", "TypeScript", "Node", "Product delivery", "AI fluency"];

  return {
    handle: clean,
    score,
    confidence: score > 87 ? "High confidence" : "Strong signal",
    stack: stacks.slice(0, 3 + (clean.length % 2)),
    summary:
      "Clean public footprint, credible technical range, and a delivery profile that looks worth a deeper Gitwork review.",
  };
}

export function CodeClearSiteDemo({ compact = false }: { compact?: boolean } = {}) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<DemoState>("idle");
  const [result, setResult] = useState<DemoResult | null>(null);

  const helper = useMemo(() => {
    if (state === "loading") {
      return "Running a lightweight validation snapshot…";
    }
    if (result) {
      return "Demo result generated. A production version would include deeper verification and Gitwork follow-up.";
    }
    return "Try a GitHub handle, CV URL, or candidate name to preview the front-facing CodeClear experience.";
  }, [result, state]);

  function handleRun() {
    if (!value.trim()) {
      return;
    }

    setState("loading");

    window.setTimeout(() => {
      setResult(buildDemoResult(value));
      setState("ready");
    }, 900);
  }

  return (
    <aside
      className={
        compact
          ? "rounded-[28px] border border-white/10 bg-[#0b0f18] p-4 text-white shadow-[0_24px_90px_rgba(10,13,18,0.26)]"
          : "rounded-[32px] border border-white/10 bg-[#0b0f18] p-5 text-white shadow-[0_24px_90px_rgba(10,13,18,0.3)]"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">CodeClear demo</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Validate a profile</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-white/68">
          Front-facing
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-white/62">{helper}</p>

      <div className="mt-5 space-y-3">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="@github-handle or CV link"
          className="h-12 w-full rounded-[14px] border border-white/10 bg-white/6 px-4 text-sm text-white outline-none placeholder:text-white/35 focus:border-[rgba(91,124,255,0.6)]"
        />

        <button
          type="button"
          onClick={handleRun}
          disabled={!value.trim() || state === "loading"}
          className="app-button app-button-primary app-button-md w-full"
        >
          <SparklesIcon className="h-4 w-4" />
          {state === "loading" ? "Running demo" : "Run CodeClear demo"}
        </button>
      </div>

      <div className="mt-6 rounded-[22px] border border-white/8 bg-white/[0.045] p-4">
        {result ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">@{result.handle}</p>
                <p className="mt-1 text-xs text-white/48">{result.confidence}</p>
              </div>
              <div className="rounded-[16px] border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-200/68">Score</p>
                <p className="mt-1 text-lg font-semibold text-emerald-200">{result.score}/100</p>
              </div>
            </div>

            <p className="text-sm leading-6 text-white/68">{result.summary}</p>

            <div className="flex flex-wrap gap-2">
              {result.stack.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-white/76"
                >
                  {item}
                </span>
              ))}
            </div>

            <div className="rounded-[18px] border border-white/8 bg-[#121826] p-4">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-emerald-300" />
                <p className="text-sm font-medium text-white">Ready for deeper Gitwork review</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/50">
                In the full version, this would expand into identity checks, GitHub analysis, delivery notes, and a
                staffed follow-up path.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-[#121826] p-4">
              <div>
                <p className="text-sm font-medium text-white">Developer fit snapshot</p>
                <p className="mt-1 text-xs text-white/44">Identity, stack, and delivery confidence</p>
              </div>
              <div className="h-10 w-10 rounded-[14px] border border-white/8 bg-white/5" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Identity</p>
                <p className="mt-2 text-sm text-white/72">Cross-check public profile signals</p>
              </div>
              <div className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">Delivery fit</p>
                <p className="mt-2 text-sm text-white/72">Highlight likely strengths and risk areas</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
