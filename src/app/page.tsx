import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout, HeroGrid, SectionLabel, CheckIcon } from "@/components/marketing/marketing-layout";
import { pricingPlans, customerStories, deliveryStats, faqs, partnerLogos } from "@/components/marketing/site-content";

export const metadata: Metadata = {
  title: "Gitwork | Your project, developer ready",
  description:
    "Hire quality remote developers or deliver your next project end-to-end. Teams that integrate in 14 days, not 14 weeks.",
};

const services = [
  {
    eyebrow: "Remote Developers",
    title: "Your developers, your workflow.",
    description:
      "Hire or build a team of developers you manage directly. They integrate with your team, your tools, and your timezone — working UK hours from day one.",
    features: ["Managed entirely by you", "UK working hours", "Dedicated project manager", "Zero term commitment"],
  },
  {
    eyebrow: "Custom Development",
    title: "From idea to shipped product.",
    description:
      "Developing a bespoke project from scratch? Gitwork takes ownership from ideation through to delivery — design, engineering, and launch.",
    features: ["Full project ownership", "Design + engineering", "Wireframe to launch", "Transparent milestone pricing"],
  },
  {
    eyebrow: "Dedicated Teams",
    title: "Scale your team in 14 days.",
    description:
      "Fully embedded remote developers who work as an extension of your team. Up and running fast, with none of the long hiring cycles.",
    features: ["Onboard in 14 days", "Scales up or down", "Full-time PM on enterprise", "Flexible contracting"],
  },
  {
    eyebrow: "Project Delivery",
    title: "End-to-end project ownership.",
    description:
      "Our UK delivery team provide full project consultation and ownership — from wireframe to launch, with clear milestones and no surprises.",
    features: ["UK-based delivery team", "Consultation included", "Milestone-driven delivery", "End-to-end support"],
  },
];

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <MarketingLayout currentPath="/">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.07]">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 py-24 sm:px-8 lg:py-32">
          <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,560px)_1fr]">
            <div>
              <SectionLabel>Gitwork</SectionLabel>
              <h1 className="mt-5 text-balance text-[60px] font-semibold leading-[0.96] tracking-[-0.07em] text-white sm:text-[72px]">
                Your project,
                <br />
                developer ready.
              </h1>
              <p className="mt-6 max-w-[460px] text-pretty text-[20px] leading-[1.65] text-white/60">
                Hire quality remote developers or deliver your next project end-to-end.
                Teams that integrate in 14 days, not 14 weeks.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-primary app-button-lg"
                >
                  Hire developers
                </a>
                <Link href="/pricing" className="app-button app-button-dark app-button-lg">
                  View pricing
                </Link>
              </div>
            </div>

            {/* Hero decorative card */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_50%_0%,rgba(9,112,200,0.24),transparent_60%)] blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#111] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">Your engagement</p>
                <div className="mt-4 space-y-2.5">
                  {[
                    { label: "Remote Developers", status: "Active", color: "text-[var(--brand-cyan)]" },
                    { label: "Dedicated Teams", status: "Active", color: "text-[var(--brand-cyan)]" },
                    { label: "Custom Development", status: "Enabled", color: "text-[var(--brand-cyan)]" },
                    { label: "Project Delivery", status: "Enabled", color: "text-[var(--brand-cyan)]" },
                    { label: "UK Delivery Team", status: "Included", color: "text-[var(--brand-300)]" },
                    { label: "Dedicated PM", status: "Included", color: "text-[var(--brand-300)]" },
                  ].map(({ label, status, color }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                        <span className="text-[13px] text-white/78">{label}</span>
                      </div>
                      <span className={`text-[11px] font-semibold ${color}`}>{status}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-[10px] border border-white/[0.07] bg-[#0d1425] px-4 py-3">
                  <p className="text-[11px] text-white/38">Onboarding timeline</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[78%] rounded-full bg-[var(--brand-700)]" />
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--brand-cyan)]">14 days</span>
                  </div>
                </div>
              </div>
            </div>
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

      {/* ── Services ── */}
      <section id="services">
        {services.map((svc, i) => (
          <div key={svc.eyebrow} className="border-b border-white/[0.07] py-24">
            <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
              <div className={`grid items-center gap-14 lg:grid-cols-2 ${i % 2 === 1 ? "lg:[direction:rtl]" : ""}`}>
                <div className={i % 2 === 1 ? "lg:[direction:ltr]" : ""}>
                  <SectionLabel>{svc.eyebrow}</SectionLabel>
                  <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
                    {svc.title}
                  </h2>
                  <p className="mt-5 max-w-[440px] text-pretty text-[18px] leading-[1.75] text-white/58">
                    {svc.description}
                  </p>
                  <ul className="mt-8 space-y-3">
                    {svc.features.map((f) => (
                      <li key={f} className="flex items-center gap-3">
                        <CheckIcon />
                        <span className="text-[15px] text-white/70">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8">
                    <a
                      href="https://calendly.com/gitworkgroup/30min"
                      target="_blank"
                      rel="noreferrer"
                      className="app-button app-button-primary app-button-md"
                    >
                      Get started
                    </a>
                  </div>
                </div>
                <div className={i % 2 === 1 ? "lg:[direction:ltr]" : ""}>
                  <div className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#111] p-7">
                    <div className="inline-flex items-center rounded-[7px] border border-white/[0.07] bg-white/[0.04] px-3 py-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/48">{svc.eyebrow}</span>
                    </div>
                    <div className="mt-5 space-y-3">
                      {svc.features.map((f, fi) => (
                        <div
                          key={f}
                          className="flex items-center gap-4 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-5 py-3.5"
                          style={{ opacity: 1 - fi * 0.12 }}
                        >
                          <CheckIcon className="text-[var(--brand-cyan)]" />
                          <span className="text-[14px] text-white/70">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="border-b border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>Pricing</SectionLabel>
            <h2 className="mt-4 text-balance text-[48px] font-semibold leading-[1.05] tracking-[-0.055em] text-white">
              Simple, honest pricing.
            </h2>
            <p className="mt-4 text-pretty text-[18px] leading-[1.7] text-white/56">
              We believe good software shouldn&apos;t cost the world. Pick the shape that fits.
            </p>
          </div>
          <div className="mt-14 grid gap-5 xl:grid-cols-3">
            {pricingPlans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-[20px] border p-8 ${
                  plan.highlight
                    ? "border-[rgba(9,112,200,0.36)] bg-[linear-gradient(180deg,rgba(9,112,200,0.14),rgba(255,255,255,0.02))] shadow-[0_0_0_1px_rgba(9,112,200,0.18),0_24px_60px_rgba(0,0,0,0.4)]"
                    : "border-white/[0.08] bg-[#111] shadow-[0_20px_50px_rgba(0,0,0,0.28)]"
                }`}
              >
                {plan.highlight && (
                  <div className="mb-5 inline-flex rounded-full border border-[rgba(9,112,200,0.28)] bg-[rgba(9,112,200,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-300)]">
                    Most popular
                  </div>
                )}
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40">{plan.name}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-[48px] font-semibold leading-none tracking-[-0.05em] text-white">{plan.price}</span>
                  {plan.period && <span className="mb-1 text-[16px] text-white/40">{plan.period}</span>}
                </div>
                <p className="mt-3 text-[14px] leading-6 text-white/50">{plan.description}</p>
                <div className="my-6 border-t border-white/[0.07]" />
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <CheckIcon className="mt-0.5 text-[var(--brand-cyan)]" />
                      <span className="text-[14px] leading-6 text-white/68">{f}</span>
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
            Not sure which fits?{" "}
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="text-white/56 underline underline-offset-2 transition-colors hover:text-white"
            >
              Book a call
            </a>{" "}
            and we&apos;ll work it out together.
          </p>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-b border-white/[0.07] bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[600px] text-center">
            <SectionLabel>Customer stories</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
              Teams that shipped faster.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            {customerStories.map((s) => (
              <article key={s.company} className="rounded-[20px] border border-white/[0.08] bg-[#111] p-8">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="h-4 w-4 text-[var(--brand-cyan)]" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 1.5l1.545 3.13 3.455.503-2.5 2.436.59 3.44L8 9.385l-3.09 1.624.59-3.44L3 5.133l3.455-.503L8 1.5z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="mt-5 text-[17px] leading-[1.75] text-white/74">
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
                <div className="mt-6 flex items-center gap-3 border-t border-white/[0.07] pt-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[13px] font-semibold text-white/56">
                    {s.company[0]}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{s.company}</p>
                    <p className="text-[12px] text-white/40">{s.author}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/customers" className="app-button app-button-dark app-button-md">
              Read all stories
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why Gitwork CTA ── */}
      <section className="border-b border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#071828] px-10 py-16 text-center shadow-[0_0_0_1px_rgba(9,112,200,0.18)] sm:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(9,112,200,0.2),transparent_62%)]" />
            <div className="relative">
              <SectionLabel>Why Gitwork</SectionLabel>
              <h2 className="mx-auto mt-4 max-w-[560px] text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
                Stop waiting on hiring. Start building.
              </h2>
              <p className="mx-auto mt-5 max-w-[500px] text-pretty text-[18px] leading-[1.7] text-white/56">
                The UK development market is expensive and slow. We believe good software shouldn&apos;t cost the world.
                Get quality developers working on your project in 14 days.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-primary app-button-lg"
                >
                  Book a Call
                </a>
                <Link href="/pricing" className="app-button app-button-dark app-button-lg">
                  View pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[760px] px-6 sm:px-8">
          <div className="text-center">
            <h2 className="text-balance text-[40px] font-semibold leading-[1.1] tracking-[-0.05em] text-white">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-[18px] leading-[1.7] text-white/50">
              Everything you need to know about working with Gitwork.
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
          <div className="mt-10 rounded-[20px] border border-white/[0.08] bg-[#111] px-8 py-10 text-center">
            <h3 className="text-[20px] font-semibold text-white">Still have questions?</h3>
            <p className="mt-2 text-[15px] text-white/48">
              Talk to us about what you&apos;re building and we&apos;ll find the right shape together.
            </p>
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-primary app-button-md mt-6"
            >
              Book a Call
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
