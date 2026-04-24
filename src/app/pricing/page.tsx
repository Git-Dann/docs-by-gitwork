import type { Metadata } from "next";
import { MarketingLayout, HeroGrid, SectionLabel, CheckIcon } from "@/components/marketing/marketing-layout";
import { pricingPlans, faqs, serviceOffers } from "@/components/marketing/site-content";

export const metadata: Metadata = {
  title: "Pricing | Gitwork",
  description:
    "Simple, honest pricing for remote developers and project delivery. Daily rate, monthly retainer, or custom enterprise.",
};

export default function PricingPage() {
  return (
    <MarketingLayout currentPath="/pricing">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[680px] text-center">
            <SectionLabel>Pricing</SectionLabel>
            <h1 className="mt-4 text-balance text-[56px] font-semibold leading-[1.02] tracking-[-0.065em] text-white sm:text-[64px]">
              Simple, honest pricing.
            </h1>
            <p className="mt-5 text-pretty text-[20px] leading-[1.7] text-white/56">
              Gitwork pricing is designed around the three most common buying shapes: flexible daily support,
              steady retained capacity, and larger custom delivery.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing cards ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-5 xl:grid-cols-3">
            {pricingPlans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-[20px] border p-8 ${
                  plan.highlight
                    ? "border-blue-400/36 bg-[linear-gradient(180deg,rgba(59,130,246,0.1),rgba(255,255,255,0.02))] shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_24px_60px_rgba(0,0,0,0.4)]"
                    : "border-white/[0.08] bg-[#111] shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
                }`}
              >
                {plan.highlight && (
                  <div className="mb-5 inline-flex rounded-full border border-blue-400/28 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                    Most popular
                  </div>
                )}
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40">{plan.name}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-[52px] font-semibold leading-none tracking-[-0.05em] text-white">{plan.price}</span>
                  {plan.period && <span className="mb-1 text-[16px] text-white/40">{plan.period}</span>}
                </div>
                <p className="mt-3 text-[15px] leading-7 text-white/52">{plan.description}</p>
                <div className="my-7 border-t border-white/[0.07]" />
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <CheckIcon className="mt-0.5 text-blue-400" />
                      <span className="text-[15px] leading-6 text-white/70">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className={`app-button app-button-md mt-8 w-full ${plan.highlight ? "app-button-primary" : "app-button-dark"}`}
                >
                  {plan.cta.label}
                </a>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center text-[14px] text-white/36">
            Not sure which shape fits?{" "}
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="text-white/56 underline underline-offset-2 transition-colors hover:text-white"
            >
              Book a 30-minute call
            </a>{" "}
            and we&apos;ll work it out together.
          </p>
        </div>
      </section>

      {/* ── What's included ── */}
      <section className="border-y border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>Included</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              Every engagement, the same standard.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              No matter which commercial shape you choose, the Gitwork expectation is structured communication,
              clear scope, and a better path into execution.
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {serviceOffers.map((offer) => (
              <article key={offer.title} className="rounded-[22px] border border-white/[0.08] bg-[#111] p-7">
                <h3 className="text-[24px] font-semibold tracking-[-0.04em] text-white">{offer.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{offer.copy}</p>
                <ul className="mt-6 space-y-2.5">
                  {offer.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <CheckIcon className="mt-0.5 text-blue-400" />
                      <span className="text-[14px] leading-6 text-white/66">{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[760px] px-6 sm:px-8">
          <div className="text-center">
            <SectionLabel>FAQ</SectionLabel>
            <h2 className="mt-4 text-balance text-[40px] font-semibold leading-[1.1] tracking-[-0.05em] text-white">
              A few practical pricing questions.
            </h2>
            <p className="mt-4 text-[18px] leading-[1.7] text-white/50">
              If you&apos;re not sure which route fits, start with the outcome you need rather than the headcount.
            </p>
          </div>
          <div className="mt-12">
            {faqs.map((item, i) => (
              <details
                key={item.question}
                className="group border-b border-white/[0.08] py-6 first:border-t"
                open={i === 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="text-balance text-[17px] font-medium text-white">{item.question}</span>
                  <svg
                    className="h-5 w-5 shrink-0 text-white/34 transition-transform group-open:rotate-45"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="mt-4 pr-8 text-[15px] leading-[1.75] text-white/52">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[760px] px-6 text-center sm:px-8">
          <SectionLabel>Need a Quote?</SectionLabel>
          <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
            We can recommend the right shape together.
          </h2>
          <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
            A short call is usually enough to work out whether the fit is a day rate, a monthly retainer,
            or a custom team for a larger build.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-primary app-button-lg"
            >
              Book a Call
            </a>
            <a
              href="https://www.gitwork.co.uk"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-dark app-button-lg"
            >
              Visit gitwork.co.uk
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
