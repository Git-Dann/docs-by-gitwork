"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const CALENDLY = "https://calendly.com/gitworkgroup/30min";

const services = [
  {
    name: "Launch Pad",
    price: "£4,995",
    period: "one-off",
    tag: "Get live in days",
    description:
      "Validate your idea and get a working product in front of users fast. Landing page, waitlist, and working prototype.",
    features: ["Landing page + waitlist", "Working prototype", "AI-ready stack", "Delivered in 7 days"],
    featured: false,
  },
  {
    name: "MVP Sprint",
    price: "£25,000",
    period: "fixed scope",
    tag: "Most popular",
    description:
      "Full product delivered in 14 days. Design, build, deploy, and handover — with a team that ships as fast as you think.",
    features: [
      "End-to-end design + build",
      "Auth, payments, dashboard",
      "Claude + OpenAI integrations",
      "14-day delivery guarantee",
      "Vercel / Supabase / GitHub",
    ],
    featured: true,
  },
  {
    name: "Greenfield",
    price: "£15,000",
    period: "per month",
    tag: "Scale with us",
    description:
      "Embedded team for ongoing product work. Senior engineers and designers working as your in-house build partner.",
    features: [
      "Dedicated senior team",
      "Weekly sprint reviews",
      "Unlimited scope changes",
      "Slack + daily standups",
    ],
    featured: false,
  },
];

const stats = [
  { value: "10×", suffix: "", label: "faster than traditional agencies" },
  { value: "14", suffix: "d", label: "average MVP delivery" },
  { value: "100", suffix: "%", label: "shipped on schedule" },
  { value: "£0", suffix: "", label: "wasted on failed projects" },
];

const steps = [
  {
    num: "i.",
    title: "Brief",
    description:
      "You tell us what you're building. We dig into the product, the users, and the commercial logic before touching any code.",
  },
  {
    num: "ii.",
    title: "Design & scope",
    description:
      "We produce a precise scope document with Figma designs, technical decisions, and a fixed price — no surprises.",
  },
  {
    num: "iii.",
    title: "Build",
    description:
      "An embedded team ships your product sprint by sprint. You see working software every 48 hours, not at the end.",
  },
  {
    num: "iv.",
    title: "Handover",
    description:
      "Full repo access, documentation, and a Loom walkthrough. You own everything and can continue independently.",
  },
];

const features = [
  {
    title: "AI-native from day one",
    description:
      "Every build is designed around LLMs. Not bolted on after — structured from the data model up for agents and automation.",
  },
  {
    title: "Pulse project validation",
    description:
      "Every project gets a live health score. Infrastructure, security, performance — tracked across every sprint.",
  },
  {
    title: "Proof of work built in",
    description:
      "Automated delivery reports, Git-linked evidence, and client-ready documentation at the end of every sprint.",
  },
  {
    title: "No vendor lock-in",
    description:
      "You own the codebase, the Vercel project, the Supabase org. We hand over keys at the end, not invoices.",
  },
];

const testimonials = [
  {
    quote:
      "They shipped our MVP in 11 days. The code quality was exceptional — we've been building on it for 8 months without touching the foundations.",
    name: "James R.",
    role: "Co-founder, Series A SaaS",
  },
  {
    quote:
      "Most agencies give you estimates. Gitwork gave us a working product. The 14-day guarantee felt like a bold claim until it happened.",
    name: "Sarah M.",
    role: "CPO, FinTech startup",
  },
  {
    quote:
      "The Proof documents alone saved us in our Series A due diligence. Investors could see exactly what was built and when.",
    name: "Tom H.",
    role: "CTO, B2B platform",
  },
];

const faqs = [
  {
    q: "How does the 14-day guarantee work?",
    a: "We scope exactly what we'll build before we start. If we miss the delivery date by more than 2 days for reasons within our control, we give you a full refund. We've never triggered it.",
  },
  {
    q: "What stack do you build on?",
    a: "Next.js 15, Supabase, Vercel, and TypeScript as the default. We integrate Claude, OpenAI, or any LLM your product needs. The stack is chosen for AI-readiness, not habit.",
  },
  {
    q: "Do I own the code?",
    a: "Completely. You get the GitHub repo, Vercel project, Supabase org — everything transferred to your accounts on delivery. No ongoing dependency on us.",
  },
  {
    q: "Can we continue after the initial build?",
    a: "Yes. Most clients move to Greenfield (our ongoing build partner model) after Launch Pad or MVP Sprint. Some take the code and run — that's fine too.",
  },
  {
    q: "What if we need changes mid-sprint?",
    a: "Greenfield has unlimited scope changes. For fixed-price engagements, we handle small pivots in scope — anything major gets a transparent change order.",
  },
  {
    q: "Do you work with non-technical founders?",
    a: "Primarily, yes. Our process is designed for founders who think in product, not in code. We translate intent into architecture, and architecture into shipping software.",
  },
];

const tools = ["Cursor", "v0", "Lovable", "Replit", "Bolt", "Claude Code"];

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0ece3", color: "#1a1a18", fontFamily: "var(--font-sans, Inter, sans-serif)" }}>

      {/* Nav */}
      <nav style={{ backgroundColor: "#f0ece3" }} className="sticky top-0 z-50 border-b border-black/8">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Image src="/gitwork-logo-home-page.png" alt="Gitwork" width={134} height={25} className="h-[25px] w-auto" />
          <div className="hidden items-center gap-8 md:flex">
            {["Services", "How we work", "Work", "FAQ"].map((item) => (
              <a key={item} href={`#${item.toLowerCase().replace(/ /g, "-")}`} className="text-[15px] text-black/60 transition-colors hover:text-black">
                {item}
              </a>
            ))}
          </div>
          <a
            href={CALENDLY}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-black px-5 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-80"
          >
            Book a call <span aria-hidden>→</span>
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-1.5 text-[13px] text-black/60">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#5b52f0" }} />
          AI-native delivery · 14-day MVP guarantee
        </div>
        <h1 className="max-w-3xl text-[72px] font-normal leading-[0.96] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
          From prompt to{" "}
          <span style={{ color: "#5b52f0", fontStyle: "italic" }}>production.</span>
        </h1>
        <p className="mt-7 max-w-xl text-[19px] leading-[1.65] text-black/56">
          Gitwork is a design and build agency for AI-native products. We take your idea from brief to deployed
          in 14 days — design, code, and delivery included.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={CALENDLY}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#5b52f0" }}
          >
            Book a free call
          </a>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white/70 px-6 py-3 text-[15px] font-medium text-black/80 transition-colors hover:bg-white"
          >
            Open platform
          </Link>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y border-black/6 py-5" style={{ backgroundColor: "#ece8df" }}>
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-black/36">Built with the best AI tooling</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {tools.map((tool) => (
              <span key={tool} className="text-[15px] font-medium text-black/40">
                {tool}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Statement card */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-[10px] p-10 md:p-14" style={{ backgroundColor: "#1a1a18" }}>
          <span className="block text-[80px] leading-none" style={{ color: "#5b52f0", fontFamily: "var(--font-display, serif)" }}>&ldquo;</span>
          <p className="mt-2 max-w-2xl text-[28px] font-normal leading-[1.4] tracking-[-0.02em] text-white" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
            Most agencies spend 3 months scoping what we ship in 2 weeks. We build for the speed your market demands.
          </p>
          <p className="mt-8 text-[14px] font-medium text-white/40">— Gitwork</p>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl px-6 pb-20">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-black/36">Services</p>
        <h2 className="mb-12 text-[44px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
          Choose your build.
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="flex flex-col rounded-[10px] p-8"
              style={{
                backgroundColor: svc.featured ? "#1a1a18" : "white",
                color: svc.featured ? "white" : "#1a1a18",
              }}
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <span
                    className="mb-2 inline-block rounded-full px-3 py-1 text-[12px] font-medium"
                    style={{
                      backgroundColor: svc.featured ? "rgba(91,82,240,0.25)" : "rgba(91,82,240,0.08)",
                      color: svc.featured ? "#b8b3ff" : "#5b52f0",
                    }}
                  >
                    {svc.tag}
                  </span>
                  <h3 className="text-[22px] font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-display, serif)" }}>
                    {svc.name}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="block text-[26px] font-semibold tracking-[-0.03em]">{svc.price}</span>
                  <span className="text-[12px]" style={{ color: svc.featured ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)" }}>
                    {svc.period}
                  </span>
                </div>
              </div>

              <p className="mb-6 text-[15px] leading-[1.6]" style={{ color: svc.featured ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)" }}>
                {svc.description}
              </p>

              <ul className="mb-8 flex-1 space-y-2.5">
                {svc.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[14px]" style={{ color: svc.featured ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)" }}>
                    <span style={{ color: "#5b52f0" }}>✓</span> {f}
                  </li>
                ))}
              </ul>

              <a
                href={CALENDLY}
                target="_blank"
                rel="noreferrer"
                className="mt-auto block rounded-full py-3 text-center text-[14px] font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: svc.featured ? "#5b52f0" : "transparent",
                  color: svc.featured ? "white" : "#5b52f0",
                  border: svc.featured ? "none" : "1.5px solid #5b52f0",
                }}
              >
                Get started →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-black/6 py-16" style={{ backgroundColor: "#ece8df" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[52px] font-semibold leading-none tracking-[-0.04em]">
                  {s.value}
                  {s.suffix && <span style={{ color: "#5b52f0" }}>{s.suffix}</span>}
                </p>
                <p className="mt-2 text-[14px] text-black/50">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we work */}
      <section id="how-we-work" className="mx-auto max-w-6xl px-6 py-20">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-black/36">Process</p>
        <h2 className="mb-14 text-[44px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
          How we work.
        </h2>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.num}>
              <span className="block text-[22px] font-normal italic" style={{ color: "#5b52f0", fontFamily: "var(--font-display, serif)" }}>
                {step.num}
              </span>
              <h3 className="mt-3 text-[20px] font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-display, serif)" }}>
                {step.title}
              </h3>
              <p className="mt-3 text-[14px] leading-[1.7] text-black/55">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="py-20" style={{ backgroundColor: "#ebe7de" }}>
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-black/36">Why Gitwork</p>
          <h2 className="mb-12 text-[44px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
            Built different.
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="rounded-[10px] bg-white/70 p-8">
                <h3 className="mb-3 text-[20px] font-normal tracking-[-0.02em]" style={{ fontFamily: "var(--font-display, serif)" }}>
                  {f.title}
                </h3>
                <p className="text-[15px] leading-[1.65] text-black/55">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="work" className="mx-auto max-w-6xl px-6 py-20">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-black/36">Client results</p>
        <h2 className="mb-12 text-[44px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
          What clients say.
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.name} className="rounded-[10px] bg-white/70 p-8">
              <p className="mb-6 text-[16px] leading-[1.65] text-black/70">&ldquo;{t.quote}&rdquo;</p>
              <div>
                <p className="text-[14px] font-semibold">{t.name}</p>
                <p className="text-[13px] text-black/45">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20" style={{ backgroundColor: "#ece8df" }}>
        <div className="mx-auto max-w-3xl px-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-black/36">FAQ</p>
          <h2 className="mb-12 text-[44px] font-normal tracking-[-0.03em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
            Honest answers.
          </h2>
          <div className="divide-y divide-black/8">
            {faqs.map((faq, i) => (
              <div key={faq.q}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="pr-4 text-[17px] font-medium">{faq.q}</span>
                  <span className="shrink-0 text-[20px] text-black/40" style={{ color: "#5b52f0" }}>
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <p className="pb-5 text-[15px] leading-[1.7] text-black/55">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-[52px] font-normal leading-[1.08] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display, 'DM Serif Display', serif)" }}>
          Ready to ship?
        </h2>
        <p className="mt-5 text-[19px] leading-[1.65] text-black/55">
          Tell us what you&apos;re building. We&apos;ll scope it, price it, and ship it.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={CALENDLY}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#5b52f0" }}
          >
            Book a free call
          </a>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full border border-black/12 bg-white/70 px-8 py-3.5 text-[15px] font-medium text-black/80 transition-colors hover:bg-white"
          >
            Open platform
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/8 py-12" style={{ backgroundColor: "#ece8df" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <Image src="/gitwork-logo-home-page.png" alt="Gitwork" width={134} height={25} className="h-[25px] w-auto" />
            <div className="flex flex-wrap gap-6 text-[14px] text-black/50">
              {["Services", "Process", "FAQ", "Platform", "Privacy"].map((item) => (
                <a key={item} href="#" className="transition-colors hover:text-black">
                  {item}
                </a>
              ))}
            </div>
          </div>
          <p className="mt-8 text-[13px] text-black/35">© 2026 Gitwork. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
