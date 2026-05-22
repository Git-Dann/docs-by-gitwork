import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout, HeroGrid, SectionLabel, CheckIcon } from "@/components/marketing/marketing-layout";
import { products, serviceOffers } from "@/components/marketing/site-content";

export const metadata: Metadata = {
  title: "Products | Gitwork",
  description:
    "Remote developers, custom development, dedicated teams, and project delivery — plus Docs, Proof, and CodeClear to run it all more cleanly.",
};

export default function ProductsPage() {
  return (
    <MarketingLayout currentPath="/products">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[680px]">
            <SectionLabel>Products &amp; Services</SectionLabel>
            <h1 className="mt-4 text-balance text-[56px] font-semibold leading-[1.02] tracking-[-0.065em] text-white sm:text-[64px]">
              Remote developers and delivery, done properly.
            </h1>
            <p className="mt-5 max-w-[540px] text-pretty text-[20px] leading-[1.7] text-white/56">
              Gitwork provides embedded developers and end-to-end project delivery backed by platform tools
              that reduce friction from first brief to launch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-primary app-button-lg"
              >
                Get started
              </a>
              <Link href="/pricing" className="app-button app-button-dark app-button-lg">
                View pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[640px]">
            <SectionLabel>Services</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              The delivery shape changes. The standard does not.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              Gitwork can drop in as embedded capacity, own the work end-to-end, or help hiring teams
              sharpen their front door. Each motion uses the same operating system underneath.
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
                      <CheckIcon className="mt-0.5 text-[var(--brand-cyan)]" />
                      <span className="text-[14px] leading-6 text-white/66">{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  <a
                    href="https://calendly.com/gitworkgroup/30min"
                    target="_blank"
                    rel="noreferrer"
                    className="app-button app-button-dark app-button-md"
                  >
                    Learn more
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform products ── */}
      <section className="border-y border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>Platform</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              Three tools. One calmer operating system.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              Docs, Proof, and CodeClear are built around real delivery friction. They work independently —
              but they&apos;re stronger together.
            </p>
          </div>

          <div className="mt-14 space-y-5">
            {products.map((product, i) => (
              <article
                key={product.slug}
                className="grid gap-8 rounded-[22px] border border-white/[0.08] bg-[#111] p-8 lg:grid-cols-[minmax(0,400px)_1fr] lg:items-center"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06] text-[12px] font-semibold text-white/60">
                      {i + 1}
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">{product.eyebrow}</p>
                  </div>
                  <h3 className="mt-4 text-[32px] font-semibold tracking-[-0.05em] text-white">{product.name}</h3>
                  <p className="mt-4 text-[16px] leading-7 text-white/56">{product.summary}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href={`/products/${product.slug}`} className="app-button app-button-primary app-button-md">
                      Learn more
                    </Link>
                    <a href={product.primaryCta.href} className="app-button app-button-dark app-button-md">
                      {product.primaryCta.label}
                    </a>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {product.featureCards.map((card) => (
                    <div key={card.title} className="rounded-[14px] border border-white/[0.07] bg-white/[0.03] p-5">
                      <p className="text-[15px] font-semibold tracking-[-0.03em] text-white">{card.title}</p>
                      <p className="mt-2 text-[13px] leading-6 text-white/48">{card.copy}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How they fit ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>How they fit</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              One stack, mapped to three recurring delivery jobs.
            </h2>
          </div>
          <div className="mt-14 grid gap-px bg-white/[0.07] lg:grid-cols-3">
            {[
              { title: "Clarify demand", copy: "Use Docs when the problem is fuzzy and the brief is still forming. Better structure before a single line is written." },
              { title: "Shape the plan", copy: "Use Proof when the team needs stronger rationale around scope, risk, and delivery. Less guessing, more evidence." },
              { title: "Improve match quality", copy: "Use CodeClear when hiring teams need real signal before the shortlist call. Frame demand first, then find the fit." },
            ].map((item) => (
              <article key={item.title} className="bg-[#0a0a0a] px-8 py-10">
                <h3 className="text-[24px] font-semibold tracking-[-0.04em] text-white">{item.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[760px] px-6 text-center sm:px-8">
          <SectionLabel>Need a Walkthrough?</SectionLabel>
          <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
            We can map the right product to your next engagement.
          </h2>
          <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
            If you already know the delivery problem, we can point you at the right tool quickly.
            If not, we can work it out together.
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
            <Link href="/app/proposals" className="app-button app-button-dark app-button-lg">
              Open Platform
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
