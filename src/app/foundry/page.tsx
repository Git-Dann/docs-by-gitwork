import type { Metadata } from "next";
import Link from "next/link";
import { MarketingLayout, HeroGrid, SectionLabel, CheckIcon } from "@/components/marketing/marketing-layout";

export const metadata: Metadata = {
  title: "Foundry | Gitwork",
  description:
    "Foundry is Gitwork's design-and-build platform — six connected modules covering project validation, proposal docs, client portal, support, developer hiring, and user research.",
};

const story = [
  {
    title: "Why Foundry exists",
    copy: "Agency work needed a platform purpose-built for it. Not adapted from generic SaaS tools that assume you're managing software, not clients. Foundry was built by Gitwork to run better engagements — and to give the whole team a single place to operate from.",
  },
  {
    title: "What Foundry does",
    copy: "Six connected modules — Pulse, Code, Docs, Portal, Care, Study — covering the full design-and-build cycle. Project validation, proposal structure, client relationships, developer hiring, ongoing support, and user research. One delivery loop, not six separate tools.",
  },
  {
    title: "Where Foundry is going",
    copy: "The platform runs Gitwork's agency work today. As the rebrand takes shape, Foundry becomes the public face of everything we build — a design-and-build operating system that agencies and product teams can use to run work properly from first brief to launch.",
  },
];

const foundryValues = [
  {
    title: "Built for agencies",
    copy: "Every decision in Foundry assumes you're managing clients, not just software. Delivery context, commercial clarity, and support rhythm are first-class concerns — not afterthoughts.",
  },
  {
    title: "Signal over noise",
    copy: "Pulse runs 150+ automated checks. Code gives hiring signal. Study drives structured user research. The goal is better decisions at the moments that matter, not more dashboards to monitor.",
  },
  {
    title: "One delivery loop",
    copy: "Brief to launch, proposal to invoice, research to release — Foundry keeps the whole cycle visible and traceable in one place instead of spreading it across disconnected tools and inboxes.",
  },
];

const foundryPhases = [
  {
    title: "Validate what's built",
    copy: "Pulse runs automated checks across code quality, infrastructure, performance, and delivery signals. Surface production blockers and gaps before they become client problems.",
  },
  {
    title: "Structure the relationship",
    copy: "Docs, Portal, and Care keep proposals, client contact, and support in a shared workspace. Every engagement has a clear record from first proposal to ongoing aftercare.",
  },
  {
    title: "Research and extend",
    copy: "Study brings structured user research back into the build loop. Code gives hiring signal when the team needs extending. Close the gap between what ships and what users actually need.",
  },
];

const foundryStats = [
  { value: "150+", label: "Automated project checks" },
  { value: "6", label: "Platform modules" },
  { value: "8", label: "Built-in research personas" },
  { value: "1", label: "Delivery loop, end to end" },
];

const modules = [
  { name: "Pulse", desc: "Automated project validation across 150+ health checks.", href: "/app/pulse" },
  { name: "Code", desc: "Developer hiring signal and candidate management.", href: "/app/code" },
  { name: "Docs", desc: "Proposal builder with costing, timeline, and sign-off.", href: "/app/docs" },
  { name: "Portal", desc: "Client hub linking engagements, platforms, and activity.", href: "/app/portal" },
  { name: "Care", desc: "Client support with AI-assisted triage and workflow rules.", href: "/app/care" },
  { name: "Study", desc: "Multi-agent user research, persona interviews, and synthesis.", href: "/app/study" },
];

export default function FoundryPage() {
  return (
    <MarketingLayout currentPath="/foundry">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.07] py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[680px]">
            <SectionLabel>About Foundry</SectionLabel>
            <h1 className="mt-4 text-balance text-[56px] font-semibold leading-[1.02] tracking-[-0.065em] text-white sm:text-[64px]">
              The design-and-build platform.
            </h1>
            <p className="mt-5 max-w-[540px] text-pretty text-[20px] leading-[1.7] text-white/56">
              Foundry is Gitwork&apos;s operating system for design-and-build agencies. Six modules. One
              delivery loop. From first project validation to ongoing client support.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app" className="app-button app-button-primary app-button-lg">
                Open Foundry
              </Link>
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-dark app-button-lg"
              >
                Talk to Gitwork
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
            <SectionLabel>Principles</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              The standard that runs through every module.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              Foundry is not a collection of features. It is a set of delivery principles made concrete —
              each module exists because something in the agency cycle was harder than it needed to be.
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {foundryValues.map((value) => (
              <article key={value.title} className="rounded-[22px] border border-white/[0.08] bg-[#111] p-7">
                <h3 className="text-[22px] font-semibold tracking-[-0.04em] text-white">{value.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/56">{value.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How Foundry works (phases) ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="mx-auto max-w-[640px] text-center">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
              A connected rhythm from brief to aftercare.
            </h2>
            <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
              Foundry is deliberately end-to-end. Each phase hands off cleanly to the next so nothing
              gets lost between validation, proposal, delivery, and support.
            </p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {foundryPhases.map((step, index) => (
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
            {foundryStats.map(({ value, label }) => (
              <div key={label} className="px-6 py-9 text-center sm:px-8">
                <p className="text-[36px] font-semibold tracking-[-0.05em] text-white">{value}</p>
                <p className="mt-1.5 text-[13px] text-white/46">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modules ── */}
      <section className="bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,520px)_1fr] lg:items-start">
            <div>
              <SectionLabel>The platform</SectionLabel>
              <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
                Six modules. One delivery loop.
              </h2>
              <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
                Every Foundry module covers a real friction point in the design-and-build cycle. They
                work independently and better together.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app" className="app-button app-button-dark app-button-md">
                  Open Foundry
                </Link>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {modules.map((m) => (
                <Link
                  key={m.name}
                  href={m.href}
                  className="group rounded-[18px] border border-white/[0.08] bg-[#111] p-5 transition hover:border-white/16 hover:bg-white/[0.05]"
                >
                  <p className="text-[16px] font-semibold tracking-[-0.03em] text-white">{m.name}</p>
                  <p className="mt-2 text-[14px] leading-6 text-white/50">{m.desc}</p>
                  <div className="mt-4 flex items-center gap-1">
                    <CheckIcon className="text-[var(--brand-cyan)]" />
                    <span className="text-[12px] text-[var(--brand-300)]">Open</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-white/[0.07] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[760px] px-6 text-center sm:px-8">
          <SectionLabel>Get started with Foundry</SectionLabel>
          <h2 className="mt-4 text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
            The platform is open. Come and use it.
          </h2>
          <p className="mt-5 text-pretty text-[18px] leading-[1.7] text-white/56">
            Foundry runs Gitwork&apos;s agency work today. If you want to see how it handles your
            delivery cycle, open the platform or talk to the team.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="app-button app-button-primary app-button-lg">
              Open Foundry
            </Link>
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-dark app-button-lg"
            >
              Talk to Gitwork
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
