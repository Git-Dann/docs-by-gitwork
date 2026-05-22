import type { Metadata } from "next";
import { MarketingLayout, HeroGrid, SectionLabel } from "@/components/marketing/marketing-layout";
import { customerStories, deliveryStats, partnerLogos } from "@/components/marketing/site-content";

export const metadata: Metadata = {
  title: "Case Studies | Gitwork",
  description:
    "Read how Gitwork has helped teams across embedded delivery, platform builds, and technical capacity — and shipped faster.",
};

const whyItWorked = [
  {
    title: "Technical confidence",
    copy: "Clients come to Gitwork when they need stronger technical hands quickly. The developers are experienced, vetted, and ready to contribute from week one.",
  },
  {
    title: "UK-facing rhythm",
    copy: "A UK-facing operating rhythm keeps communication and decision-making clear. Clients get a single point of contact, not a ticket queue.",
  },
  {
    title: "Structured from the start",
    copy: "Better brief and proposal work reduces churn before engineering starts. Gitwork uses its own tools to make sure everyone is solving the same problem.",
  },
];

export default function CustomersPage() {
  return (
    <MarketingLayout currentPath="/customers">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[680px]">
            <SectionLabel>Case Studies</SectionLabel>
            <h1 className="mt-4 text-balance text-[56px] font-semibold leading-[1.02] tracking-[-0.065em] text-white sm:text-[64px]">
              Teams that shipped faster.
            </h1>
            <p className="mt-5 max-w-[540px] text-pretty text-[20px] leading-[1.7] text-white/56">
              The common thread across Gitwork customer stories is not industry — it is the need for sharper delivery
              structure, better technical capacity, and less friction between brief and build.
            </p>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-b border-white/[0.07] bg-[#0d0d0d]">
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

      {/* ── Trusted by ── */}
      <section className="border-b border-white/[0.07] bg-[#0a0a0a] py-14">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/34">
            Trusted by teams at
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {partnerLogos.map((name) => (
              <div key={name} className="rounded-[8px] border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
                <span className="text-[13px] font-medium text-white/46">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Customer stories ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {customerStories.map((s) => (
              <article key={s.company} className="rounded-[22px] border border-white/[0.08] bg-[#111] p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">{s.company}</p>
                <blockquote className="mt-5 text-[20px] leading-8 text-white/82">
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
                <p className="mt-5 text-[14px] font-medium text-white/46">{s.author}</p>
                <p className="mt-5 border-t border-white/[0.07] pt-5 text-[15px] leading-6 text-white/56">
                  {s.impact}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why it worked ── */}
      <section className="border-y border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>Why it worked</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              The same delivery strengths, again and again.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              Clients come to Gitwork for different reasons. The wins usually come from the same combination
              of technical depth, a calmer process, and better framing upfront.
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {whyItWorked.map((item) => (
              <article key={item.title} className="rounded-[22px] border border-white/[0.08] bg-[#111] p-7">
                <h3 className="text-[22px] font-semibold tracking-[-0.04em] text-white">{item.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[760px] px-6 text-center sm:px-8">
          <SectionLabel>Your story next</SectionLabel>
          <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
            If the build is stuck, Gitwork can help.
          </h2>
          <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
            We work best when there is a real delivery problem to solve, not just a surface-level resource gap.
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
            <a href="/pricing" className="app-button app-button-dark app-button-lg">
              View pricing
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
