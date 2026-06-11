/**
 * Section type: `pricing_tiers` — 3-column comparison of pricing tiers (e.g. Bronze / Silver /
 * Gold), each with a name, price, feature bullets, and an optional CTA.
 *
 * Common pattern in proposals: a recurring-engagement option set or an upsell ladder. One tier
 * can be highlighted ("most popular"). Renders as cards on screen and as columns in PDF.
 */

import { PlusIcon, TrashIcon, ChartBarIcon, CheckIcon, StarIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput, FormTextArea } from "@/lib/sections/_shared";
import { defineSection } from "@/lib/sections/types";
import type { PricingTierItem, PricingTiersSectionData } from "@/types/proposal";
import { safeUrl } from "@/lib/markdown";

function newTier(name: string): PricingTierItem {
  return { name, price: "", cadence: "/ month", tagline: "", features: [] };
}

export const pricingTiersSection = defineSection<PricingTiersSectionData>({
  key: "pricing_tiers",
  displayName: "Pricing Tiers",
  description: "Side-by-side comparison of 2–4 pricing tiers with features and CTAs.",
  category: "commercials",
  icon: ChartBarIcon,
  defaultData: {
    intro: "",
    tiers: [newTier("Starter"), { ...newTier("Growth"), highlighted: true }, newTier("Scale")],
  },
  defaultTitle: "Pricing tiers",
  defaultDescription: "Compare what's included at each tier.",
  recommendedFor: ["PROPOSAL", "SOW"],
  aiExpandable: true,
  Editor: ({ data, onChange }) => {
    const tiers = data.tiers ?? [];

    function updateTier(index: number, patch: Partial<PricingTierItem>) {
      onChange({
        ...data,
        tiers: tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
      });
    }

    function setHighlighted(index: number) {
      onChange({
        ...data,
        tiers: tiers.map((tier, i) => ({ ...tier, highlighted: i === index })),
      });
    }

    function addTier() {
      if (tiers.length >= 4) return;
      onChange({ ...data, tiers: [...tiers, newTier(`Tier ${tiers.length + 1}`)] });
    }

    function removeTier(index: number) {
      if (tiers.length <= 1) return;
      onChange({ ...data, tiers: tiers.filter((_, i) => i !== index) });
    }

    function updateFeature(tierIndex: number, featureIndex: number, value: string) {
      const tier = tiers[tierIndex];
      const features = [...tier.features];
      features[featureIndex] = value;
      updateTier(tierIndex, { features });
    }

    function addFeature(tierIndex: number) {
      const tier = tiers[tierIndex];
      updateTier(tierIndex, { features: [...tier.features, ""] });
    }

    function removeFeature(tierIndex: number, featureIndex: number) {
      const tier = tiers[tierIndex];
      updateTier(tierIndex, { features: tier.features.filter((_, i) => i !== featureIndex) });
    }

    return (
      <SimpleForm>
        <FormTextArea
          label="Intro (optional)"
          value={data.intro ?? ""}
          onChange={(intro) => onChange({ ...data, intro })}
          rows={2}
        />

        {tiers.map((tier, i) => (
          <div key={i} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                Tier {i + 1}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHighlighted(i)}
                  className={
                    tier.highlighted
                      ? "inline-flex items-center gap-1 rounded-[4px] bg-[var(--brand-200)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]"
                      : "inline-flex items-center gap-1 rounded-[4px] border border-[var(--border-2)] bg-white px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] hover:border-[var(--brand-600)]"
                  }
                >
                  <StarIcon className="h-3 w-3" />
                  {tier.highlighted ? "HIGHLIGHTED" : "HIGHLIGHT"}
                </button>
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  disabled={tiers.length <= 1}
                  aria-label="Remove tier"
                  className="text-rose-600 hover:text-rose-700 disabled:opacity-30"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <FormInput label="Name" value={tier.name} onChange={(name) => updateTier(i, { name })} />
              <FormInput label="Tagline (optional)" value={tier.tagline ?? ""} onChange={(tagline) => updateTier(i, { tagline })} />
              <FormInput label="Price" value={tier.price} onChange={(price) => updateTier(i, { price })} placeholder="£1,500" />
              <FormInput label="Cadence" value={tier.cadence ?? ""} onChange={(cadence) => updateTier(i, { cadence })} placeholder="/ month" />
              <FormInput label="CTA label (optional)" value={tier.ctaLabel ?? ""} onChange={(ctaLabel) => updateTier(i, { ctaLabel })} />
              <FormInput label="CTA URL (optional)" value={tier.ctaUrl ?? ""} onChange={(ctaUrl) => updateTier(i, { ctaUrl })} />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text-2)]">Features</span>
                <button
                  type="button"
                  onClick={() => addFeature(i)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add feature
                </button>
              </div>
              <div className="space-y-1.5">
                {tier.features.map((feature, fi) => (
                  <div key={fi} className="flex items-center gap-2">
                    <input
                      value={feature}
                      onChange={(e) => updateFeature(i, fi, e.target.value)}
                      placeholder="What's included"
                      className="app-input text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeFeature(i, fi)}
                      aria-label="Remove feature"
                      className="text-rose-600 hover:text-rose-700"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {tier.features.length === 0 ? (
                  <p className="text-xs italic text-[var(--text-4)]">No features yet — add one above.</p>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {tiers.length < 4 ? (
          <button
            type="button"
            onClick={addTier}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
          >
            <PlusIcon className="h-4 w-4" /> Add tier (max 4)
          </button>
        ) : null}
      </SimpleForm>
    );
  },
  Preview: ({ data }) => {
    const tiers = data.tiers ?? [];
    if (tiers.length === 0) {
      return <p className="text-sm italic text-[var(--text-4)]">No tiers yet — add one in the editor.</p>;
    }
    return (
      <div className="proposal-block-avoid space-y-4">
        {data.intro ? <p className="text-sm leading-7 text-[var(--text-2)]">{data.intro}</p> : null}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}
        >
          {tiers.map((tier, i) => (
            <article
              key={i}
              className={
                tier.highlighted
                  ? "rounded-[12px] border-2 border-[var(--brand-600)] bg-white p-5 shadow-[var(--shadow-sm)]"
                  : "rounded-[12px] border border-[var(--border-2)] bg-white p-5"
              }
            >
              {tier.highlighted ? (
                <p className="mb-2 inline-flex items-center gap-1 rounded-[4px] bg-[var(--brand-200)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]">
                  <StarIcon className="h-3 w-3" /> MOST POPULAR
                </p>
              ) : null}
              <p className="text-lg font-semibold text-[var(--text-1)]">{tier.name}</p>
              {tier.tagline ? (
                <p className="mt-0.5 text-[12px] text-[var(--text-3)]">{tier.tagline}</p>
              ) : null}
              <p className="mt-3">
                <span className="font-[family-name:var(--font-display)] text-[36px] font-normal leading-none text-[var(--text-1)]">
                  {tier.price || "—"}
                </span>
                {tier.cadence ? (
                  <span className="ml-1 text-sm text-[var(--text-3)]">{tier.cadence}</span>
                ) : null}
              </p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--text-2)]">
                {tier.features.map((feature, fi) => (
                  <li key={fi} className="flex items-start gap-2">
                    <CheckIcon className="mt-1 h-3.5 w-3.5 text-[var(--success-500)] shrink-0" />
                    <span>{feature || "—"}</span>
                  </li>
                ))}
              </ul>
              {tier.ctaLabel ? (
                <a
                  href={safeUrl(tier.ctaUrl ?? "") ?? "#"}
                  rel="noopener noreferrer nofollow"
                  className={
                    tier.highlighted
                      ? "mt-5 inline-flex w-full items-center justify-center rounded-[8px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-800)]"
                      : "mt-5 inline-flex w-full items-center justify-center rounded-[8px] border border-[var(--border-1)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-1)] transition hover:border-[var(--brand-600)]"
                  }
                >
                  {tier.ctaLabel}
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    );
  },
});
