import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout, HeroGrid, SectionLabel, CheckIcon } from "@/components/marketing/marketing-layout";
import { companyValues, deliveryStats, deliveryTimeline } from "@/components/marketing/site-content";

export const metadata: Metadata = {
  title: "About | Gitwork",
  description:
    "Gitwork is a design and developer agency with a sharper operating system. We combine embedded developers, UK-led delivery, and better tools for briefs, proposals, and hiring.",
};

const story = [
  {
    title: "Why we exist",
    copy: "The UK software development market is expensive, opaque, and often slow. Good product work gets lost in bad handoffs, vague briefs, and hiring friction. Gitwork was built to fix that.",
  },
  {
    title: "How we work",
    copy: "We embed quality developers into your team, take end-to-end delivery ownership, or help hiring teams frame demand better. Every engagement is backed by structured tools and UK-facing communication.",
  },
  {
    title: "What we're building",
    copy: "Alongside the agency, we're building Docs, Proof, and Code — platform tools that reduce delivery friction for the clients we work with and eventually for teams beyond Gitwork.",
  },
];

export default function CompanyPage() {
  return (
    <MarketingLayout currentPath="/company">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[680px]">
            <SectionLabel>About Gitwork</SectionLabel>
            <h1 className="mt-4 text-balance text-[56px] font-semibold leading-[1.02] tracking-[-0.065em] text-white sm:text-[64px]">
              An agency with a better system.
            </h1>
            <p className="mt-5 max-w-[540px] text-pretty text-[20px] leading-[1.7] text-white/56">
              Gitwork combines embedded developers, UK-led delivery, and a sharper operating system
              for briefs, proposals, and hiring. The goal is calmer product work from first brief to launch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-primary app-button-lg"
              >
                Work with us
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
        </div>
      </section>

      {/* ── Story ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {story.map((item) => (
              <article key={item.title} className="border-t border-white/[0.09] pt-6">
                <h2 className="text-[24px] font-semibold tracking-[-0.04em] text-white">{item.title}</h2>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Values ── */}
      <section className="border-y border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[640px]">
            <SectionLabel>Values</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              The delivery standard that runs through everything.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              Gitwork&apos;s goal is not to add more process. It is to make product work clearer at the
              moments where teams usually lose momentum.
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {companyValues.map((value) => (
              <article key={value.title} className="rounded-[22px] border border-white/[0.08] bg-[#111] p-7">
                <h3 className="text-[22px] font-semibold tracking-[-0.04em] text-white">{value.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{value.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How we work (delivery timeline) ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>How we work</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              A simple, visible delivery rhythm.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              The structure is deliberately simple: frame the work properly, recommend the right shape,
              and ship with a visible cadence from kickoff to launch.
            </p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {deliveryTimeline.map((step, index) => (
              <article key={step.title} className="rounded-[22px] border border-white/[0.08] bg-[#111] p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Phase {index + 1}</p>
                <h3 className="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-white">{step.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-white/[0.07] bg-[#0d0d0d]">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid grid-cols-2 divide-x divide-white/[0.07] lg:grid-cols-4">
            {deliveryStats.map(({ value, label }) => (
              <div key={label} className="px-6 py-9 text-center sm:px-8">
                <p className="text-[36px] font-semibold tracking-[-0.05em] text-white">{value}</p>
                <p className="mt-1.5 text-[13px] text-white/46">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform section ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,520px)_1fr] lg:items-center">
            <div>
              <SectionLabel>Gitwork Platform</SectionLabel>
              <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
                We use our own tools to run better engagements.
              </h2>
              <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
                Docs, Proof, and Code are Gitwork products built around real delivery friction.
                They work for our clients and eventually for teams beyond Gitwork.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app/proposals" className="app-button app-button-dark app-button-md">
                  Open Platform
                </Link>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { name: "Docs", desc: "Structured briefs and proposal generation.", href: "/products/docs" },
                { name: "Proof", desc: "Source analysis and delivery framing.", href: "/products/proof" },
                { name: "Code", desc: "Hiring signal and developer matching.", href: "/products/codeclear" },
              ].map((p) => (
                <a
                  key={p.name}
                  href={p.href}
                  className="group rounded-[18px] border border-white/[0.08] bg-[#111] p-5 transition hover:border-white/16 hover:bg-white/[0.05]"
                >
                  <p className="text-[16px] font-semibold tracking-[-0.03em] text-white">{p.name}</p>
                  <p className="mt-2 text-[14px] leading-6 text-white/50">{p.desc}</p>
                  <div className="mt-4 flex items-center gap-1">
                    <CheckIcon className="text-[var(--brand-cyan)]" />
                    <span className="text-[12px] text-[var(--brand-300)]">Explore</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[760px] px-6 text-center sm:px-8">
          <SectionLabel>Work with Gitwork</SectionLabel>
          <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
            Bring us in when the build needs a clearer system.
          </h2>
          <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
            We are most useful when you need stronger delivery structure as much as stronger engineering capacity.
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
            <Link href="/products" className="app-button app-button-dark app-button-lg">
              Explore products
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
