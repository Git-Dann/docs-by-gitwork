import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const story = [
  {
    title: "Why Foundry exists",
    copy: "Agency work needed a platform purpose-built for it — not adapted from generic SaaS tools that assume you're managing software, not clients. Foundry was built by Gitwork to run better engagements and give the whole team a single place to operate from.",
  },
  {
    title: "Foundry and Gitwork",
    copy: "Foundry is Gitwork's operating platform and sub-brand. The tools we built to run our own agency — proposals, client portal, project validation, hiring, support, research — are Foundry. Everything that makes Gitwork's delivery sharper is Foundry.",
  },
  {
    title: "Where it's going",
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
  { name: "Code", desc: "Developer hiring signal and candidate management.", href: "/app/codeclear" },
  { name: "Docs", desc: "Proposal builder with costing, timeline, and sign-off.", href: "/app/proposals" },
  { name: "Portal", desc: "Client hub linking engagements, platforms, and activity.", href: "/app/clients" },
  { name: "Care", desc: "Client support with AI-assisted triage and workflow rules.", href: "/app/support" },
  { name: "Study", desc: "Multi-agent user research, persona interviews, and synthesis.", href: "/app/study" },
];

const contacts = [
  { label: "hello@gitwork.co.uk", href: "mailto:hello@gitwork.co.uk" },
  { label: "+44 (0) 7903 076159", href: "tel:+447903076159" },
  { label: "gitwork.co.uk", href: "https://www.gitwork.co.uk" },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--brand-500)]">
      {children}
    </p>
  );
}

export default function FoundryPortalPage() {
  return (
    <AppShell title="Gitwork" subtitle="Foundry by Gitwork — the design-and-build platform">
      <div className="-mx-4 -mt-2 sm:-mx-6">
        {/* ── Overview header ── */}
        <div className="border-b border-[var(--border-3)] bg-white px-6 py-10 sm:px-8">
          <SectionEyebrow>About</SectionEyebrow>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--text-1)]">
            Foundry by Gitwork
          </h1>
          <p className="mt-3 max-w-[560px] text-[16px] leading-[1.7] text-[var(--text-3)]">
            Foundry is Gitwork&apos;s operating platform and design-and-build sub-brand. Six modules covering
            the full agency cycle — project validation, proposals, client portal, support, hiring, and research.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-primary app-button-md"
            >
              Book a Call
            </a>
            <a
              href="https://www.gitwork.co.uk"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-secondary app-button-md"
            >
              Visit gitwork.co.uk
            </a>
          </div>
        </div>

        {/* ── Story ── */}
        <div className="bg-[var(--surface-canvas)] px-6 py-12 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {story.map((item) => (
              <article key={item.title} className="border-t-2 border-[var(--brand-500)] pt-5">
                <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  {item.title}
                </h2>
                <p className="mt-3 text-[14px] leading-6 text-[var(--text-3)]">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>

        {/* ── Values ── */}
        <div className="border-y border-[var(--border-3)] bg-white px-6 py-12 sm:px-8">
          <div className="max-w-[560px]">
            <SectionEyebrow>Principles</SectionEyebrow>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--text-1)]">
              The standard that runs through every module.
            </h2>
            <p className="mt-3 text-[15px] leading-[1.7] text-[var(--text-3)]">
              Foundry is not a collection of features. It is a set of delivery principles made concrete —
              each module exists because something in the agency cycle was harder than it needed to be.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {foundryValues.map((value) => (
              <article
                key={value.title}
                className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-1)] p-6"
              >
                <h3 className="text-[16px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  {value.title}
                </h3>
                <p className="mt-3 text-[14px] leading-6 text-[var(--text-3)]">{value.copy}</p>
              </article>
            ))}
          </div>
        </div>

        {/* ── How Foundry works ── */}
        <div className="bg-[var(--surface-canvas)] px-6 py-12 sm:px-8">
          <div className="max-w-[560px]">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--text-1)]">
              A connected rhythm from brief to aftercare.
            </h2>
            <p className="mt-3 text-[15px] leading-[1.7] text-[var(--text-3)]">
              Foundry is deliberately end-to-end. Each phase hands off cleanly to the next so nothing
              gets lost between validation, proposal, delivery, and support.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {foundryPhases.map((step, index) => (
              <article
                key={step.title}
                className="rounded-[14px] border border-[var(--border-2)] bg-white p-6 shadow-[var(--shadow-xs)]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-4)]">
                  Phase {index + 1}
                </p>
                <h3 className="mt-3 text-[18px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[14px] leading-6 text-[var(--text-3)]">{step.copy}</p>
              </article>
            ))}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="border-y border-[var(--border-3)] bg-white">
          <div className="px-6 sm:px-8">
            <div className="grid grid-cols-2 divide-x divide-[var(--border-3)] lg:grid-cols-4">
              {foundryStats.map(({ value, label }) => (
                <div key={label} className="px-4 py-8 text-center sm:px-6">
                  <p className="text-[32px] font-semibold tracking-[-0.05em] text-[var(--brand-500)]">
                    {value}
                  </p>
                  <p className="mt-1.5 text-[13px] text-[var(--text-4)]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Modules ── */}
        <div className="bg-[var(--surface-canvas)] px-6 py-12 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
            <div>
              <SectionEyebrow>The platform</SectionEyebrow>
              <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--text-1)]">
                Six modules. One delivery loop.
              </h2>
              <p className="mt-3 text-[15px] leading-[1.7] text-[var(--text-3)]">
                Every Foundry module covers a real friction point in the design-and-build cycle.
                They work independently and better together.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/app" className="app-button app-button-secondary app-button-md">
                  Open Foundry HQ
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {modules.map((m) => (
                <Link
                  key={m.name}
                  href={m.href}
                  className="group rounded-[12px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)] transition hover:border-[var(--border-1)] hover:shadow-[var(--shadow-sm)]"
                >
                  <p className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
                    {m.name}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-4)]">{m.desc}</p>
                  <p className="mt-3 text-[12px] font-medium text-[var(--brand-500)]">Open →</p>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── Contact ── */}
        <div className="border-t border-[var(--border-3)] bg-white px-6 py-12 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
            <div>
              <SectionEyebrow>Gitwork Group Ltd</SectionEyebrow>
              <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--text-1)]">
                Get in touch
              </h2>
              <p className="mt-3 text-[15px] leading-[1.7] text-[var(--text-3)]">
                We&apos;re most useful when you need stronger delivery structure alongside engineering capacity.
                Reach out to talk through your project.
              </p>
              <div className="mt-4 space-y-1 text-[13px] text-[var(--text-4)]">
                <p>3rd Floor, Anchorage One,</p>
                <p>Anchorage Quay, Salford, M50 3YJ</p>
                <p className="mt-2">Company No. 15756347 · VAT 468314867</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {contacts.map((c) => (
                <a
                  key={c.href}
                  href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel={c.href.startsWith("http") ? "noreferrer" : undefined}
                  className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3 text-[14px] text-[var(--text-2)] transition hover:border-[var(--border-1)] hover:bg-white"
                >
                  {c.label}
                </a>
              ))}
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-primary app-button-md mt-2 w-fit"
              >
                Book a Call
              </a>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
