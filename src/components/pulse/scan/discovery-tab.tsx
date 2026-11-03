"use client";

import type { DiscoveryKit } from "@/types/pulse";
import { CurrencyDollarIcon, LightBulbIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

export function DiscoveryTab({ kit }: { kit: DiscoveryKit }) {
  return (
    <div className="space-y-6">
      {/* Opening statement */}
      <div className="rounded-[10px] border border-[var(--brand-500)] bg-[var(--surface-brand-soft)] p-5">
        <p className="app-eyebrow mb-2">Opening statement</p>
        <p className="text-sm italic leading-7 text-[var(--text-1)]">&ldquo;{kit.openingStatement}&rdquo;</p>
      </div>

      {/* Wow finding */}
      <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-5">
        <div className="mb-1 flex items-center gap-2">
          <LightBulbIcon className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">Wow finding</p>
        </div>
        <p className="text-sm font-medium text-amber-900">{kit.wowFinding.finding}</p>
        <p className="mt-1.5 text-sm text-amber-700">{kit.wowFinding.impact}</p>
      </div>

      {/* Talking points */}
      {kit.talkingPoints.length > 0 && (
        <div className="rounded-[10px] border border-[var(--border-2)] p-5">
          <p className="app-eyebrow mb-3">Call talking points</p>
          <ul className="space-y-2">
            {kit.talkingPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-2)]">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tailored questions */}
      {kit.questions.length > 0 && (
        <div>
          <p className="app-eyebrow mb-3">Discovery questions</p>
          <div className="space-y-3">
            {kit.questions.map((q, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                <div className="mb-2 flex items-start gap-2">
                  <QuestionMarkCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-500)]" />
                  <p className="text-sm font-semibold text-[var(--text-1)]">{q.question}</p>
                </div>
                <p className="mb-2 pl-6 text-xs text-[var(--text-3)]">{q.context}</p>
                <div className="ml-6 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Follow-up: </span>
                  <span className="text-xs italic text-[var(--text-3)]">{q.followUp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anticipated objections */}
      {kit.anticipatedObjections.length > 0 && (
        <div>
          <p className="app-eyebrow mb-3">Anticipated objections</p>
          <div className="space-y-3">
            {kit.anticipatedObjections.map((obj, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--border-2)] p-4">
                <p className="mb-2 text-sm font-medium text-red-700">&ldquo;{obj.objection}&rdquo;</p>
                <p className="text-sm text-[var(--text-2)]">{obj.response}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing anchor */}
      <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-5">
        <div className="mb-2 flex items-center gap-2">
          <CurrencyDollarIcon className="h-4 w-4 text-emerald-700" />
          <p className="text-sm font-semibold text-emerald-800">Pricing anchor</p>
        </div>
        <p className="text-xl font-bold tabular-nums text-emerald-900">
          ${kit.pricingAnchor.low.toLocaleString()} – ${kit.pricingAnchor.high.toLocaleString()}
        </p>
        <p className="mt-1.5 text-sm text-emerald-700">{kit.pricingAnchor.rationale}</p>
      </div>
    </div>
  );
}
