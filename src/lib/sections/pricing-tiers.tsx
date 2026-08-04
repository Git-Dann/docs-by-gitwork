/**
 * Section type: `pricing_tiers` — 3-column comparison of pricing tiers (e.g. Bronze / Silver /
 * Gold), each with a name, price, feature bullets, and an optional CTA.
 *
 * Common pattern in proposals: a recurring-engagement option set or an upsell ladder. One tier
 * can be highlighted ("most popular"). Renders as cards on screen and as columns in PDF.
 *
 * Two render styles, chosen in Options: `cards` (the original) and `recommended` — the MD's live
 * proposal, where the highlighted tier takes a dark face + an accent badge, a `FROM` label, a big
 * serif price, a muted sub-line and an accent-tick feature list.
 */

import { PlusIcon, TrashIcon, ChartBarIcon, CheckIcon, StarIcon } from "@heroicons/react/24/outline";
import { SimpleForm, FormInput } from "@/lib/sections/_shared";
import { ItemCard, EditorSectionHeader, makeMover } from "@/components/proposals/editor-primitives";
import { MarkdownField } from "@/components/proposals/markdown-field";
import { defineSection } from "@/lib/sections/types";
import { pickRecommendedIndex } from "@/lib/sections/variant-helpers";
import type { PricingTierItem, PricingTiersSectionData } from "@/types/proposal";
import { Markdown, safeUrl } from "@/lib/markdown";

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
  hasOptions: true,
  Editor: ({ data, onChange }) => {
    const tiers = data.tiers ?? [];
    const style = data.style ?? "cards";
    const moveTier = makeMover(tiers, (next) => onChange({ ...data, tiers: next }));

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
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--text-2)]">Style</span>
          <select
            value={style}
            onChange={(e) => onChange({ ...data, style: e.target.value as PricingTiersSectionData["style"] })}
            className="app-select w-full"
          >
            <option value="cards">Comparison cards</option>
            <option value="recommended">Recommended tier (dark face)</option>
          </select>
        </label>

        <MarkdownField
          label="Intro (optional)"
          value={data.intro ?? ""}
          onChange={(intro) => onChange({ ...data, intro })}
          rows={3}
        />

        {tiers.map((tier, i) => (
          <ItemCard
            key={i}
            label={`Tier ${i + 1}${tier.name ? ` — ${tier.name}` : ""}`}
            ariaLabel={`tier ${i + 1}`}
            onMoveUp={() => moveTier(i, -1)}
            onMoveDown={() => moveTier(i, 1)}
            onDelete={() => removeTier(i)}
          >
            <button
              type="button"
              onClick={() => setHighlighted(i)}
              className={
                tier.highlighted
                  ? "mb-2 inline-flex w-full items-center justify-center gap-1 rounded-[6px] bg-[var(--brand-200)] px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-700)]"
                  : "mb-2 inline-flex w-full items-center justify-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] transition hover:border-[var(--brand-600)]"
              }
            >
              <StarIcon className="h-3 w-3" />
              {tier.highlighted
                ? style === "recommended"
                  ? "RECOMMENDED"
                  : "HIGHLIGHTED"
                : style === "recommended"
                  ? "MARK RECOMMENDED"
                  : "HIGHLIGHT"}
            </button>

            <div className="grid gap-2 @[26rem]:grid-cols-2">
              <FormInput label="Name" value={tier.name} onChange={(name) => updateTier(i, { name })} />
              <FormInput label="Tagline (optional)" value={tier.tagline ?? ""} onChange={(tagline) => updateTier(i, { tagline })} />
              <FormInput label="Price" value={tier.price} onChange={(price) => updateTier(i, { price })} placeholder="£1,500" />
              <FormInput label="Cadence" value={tier.cadence ?? ""} onChange={(cadence) => updateTier(i, { cadence })} placeholder="/ month" />
              {style === "recommended" ? (
                <>
                  <FormInput
                    label="Price label"
                    value={tier.priceLabel ?? ""}
                    onChange={(priceLabel) => updateTier(i, { priceLabel })}
                    placeholder="FROM"
                  />
                  <FormInput
                    label="Sub-line"
                    value={tier.subline ?? ""}
                    onChange={(subline) => updateTier(i, { subline })}
                    placeholder="5 days, fixed price"
                  />
                  {tier.highlighted ? (
                    <FormInput
                      label="Badge"
                      value={tier.badgeLabel ?? ""}
                      onChange={(badgeLabel) => updateTier(i, { badgeLabel })}
                      placeholder="RECOMMENDED"
                    />
                  ) : null}
                </>
              ) : null}
              <FormInput label="CTA label (optional)" value={tier.ctaLabel ?? ""} onChange={(ctaLabel) => updateTier(i, { ctaLabel })} />
              <FormInput label="CTA URL (optional)" value={tier.ctaUrl ?? ""} onChange={(ctaUrl) => updateTier(i, { ctaUrl })} />
            </div>

            <div className="mt-3">
              <EditorSectionHeader
                label="Features"
                action={
                  <button
                    type="button"
                    onClick={() => addFeature(i)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> Add feature
                  </button>
                }
              />
              <div className="mt-1.5 space-y-1.5">
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
                      className="shrink-0 text-rose-600 hover:text-rose-700"
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
          </ItemCard>
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
    const style = data.style ?? "cards";
    const recommendedIndex = pickRecommendedIndex(tiers);

    const intro = data.intro ? (
      <Markdown className="space-y-3 text-sm leading-7 text-[var(--text-2)]">{data.intro}</Markdown>
    ) : null;

    // ── Recommended treatment — the highlighted tier on a dark face, the rest light. ──
    if (style === "recommended") {
      return (
        <div className="proposal-block-avoid space-y-4">
          {intro}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}>
            {tiers.map((tier, i) => {
              const featured = i === recommendedIndex;
              const ink = featured ? "#f7f5ef" : "var(--doc-ink, #1a1a17)";
              const soft = featured ? "rgba(247,245,239,0.62)" : "var(--doc-muted, #8a867c)";
              return (
                <article
                  key={i}
                  className="flex flex-col rounded-[12px] border p-5"
                  style={
                    featured
                      ? { background: "var(--doc-panel-dark, #191817)", borderColor: "transparent" }
                      : {
                          background: "var(--doc-panel, #f7f5ef)",
                          borderColor: "var(--doc-line, rgba(0,0,0,0.14))",
                        }
                  }
                >
                  {featured ? (
                    <span
                      className="mb-3 inline-flex w-fit items-center rounded-full px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]"
                      style={{ background: "var(--doc-accent, #4f5bd5)", color: "#fff" }}
                    >
                      {(tier.badgeLabel || "Recommended").toUpperCase()}
                    </span>
                  ) : null}
                  <p
                    className="doc-display-face text-[19px] leading-tight"
                    style={{ color: ink }}
                  >
                    {tier.name}
                  </p>
                  {tier.tagline ? (
                    <p className="mt-1 text-[12px] leading-5" style={{ color: soft }}>
                      {tier.tagline}
                    </p>
                  ) : null}
                  <p
                    className="mt-4 font-mono text-[9px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: soft }}
                  >
                    {(tier.priceLabel || "From").toUpperCase()}
                  </p>
                  <p
                    className="doc-display-face mt-1 text-[34px] leading-none"
                    style={{ color: ink }}
                  >
                    {tier.price || "—"}
                  </p>
                  {tier.subline || tier.cadence ? (
                    <p className="mt-2 text-[12px] leading-5" style={{ color: soft }}>
                      {tier.subline || tier.cadence}
                    </p>
                  ) : null}
                  {tier.features.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {tier.features.map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-2.5 text-[13px] leading-6" style={{ color: ink }}>
                          <CheckIcon
                            className="mt-1 h-3.5 w-3.5 shrink-0"
                            style={{
                              // The raw accent is too dark on the dark face in both themes, so it is
                              // lightened rather than replaced by a literal — a fixed periwinkle read
                              // as blue under the Gitwork (purple) palette. If `color-mix` is ever
                              // unsupported the declaration drops and the tick inherits the light ink.
                              color: featured
                                ? "color-mix(in srgb, var(--doc-accent, #4f5bd5) 45%, #ffffff)"
                                : "var(--doc-accent, #4f5bd5)",
                            }}
                          />
                          <span>{feature || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {tier.ctaLabel ? (
                    <a
                      href={safeUrl(tier.ctaUrl ?? "") ?? "#"}
                      rel="noopener noreferrer nofollow"
                      className="mt-5 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-medium"
                      style={
                        featured
                          ? { background: "var(--doc-accent, #4f5bd5)", color: "#fff" }
                          : {
                              border: "1px solid var(--doc-line, rgba(0,0,0,0.14))",
                              color: "var(--doc-ink, #1a1a17)",
                            }
                      }
                    >
                      {tier.ctaLabel}
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="proposal-block-avoid space-y-4">
        {intro}
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
                <span className="doc-display-face text-[36px] leading-none text-[var(--text-1)]">
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
