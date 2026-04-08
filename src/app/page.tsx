import Link from "next/link";

const clientLogos = [
  "Uber",
  "ANS",
  "Venturi Group",
  "Same Day Smile",
  "GigPig",
  "Gaia Learning",
];

const productCards = [
  {
    name: "Docs",
    eyebrow: "Proposals",
    href: "/app/proposals",
    description:
      "Build structured proposals with live preview, costing, timeline planning, sign-off, and client-ready exports.",
    bullets: [
      "Builder and overview in one workflow",
      "Commercials, timeline, assets, and sign-off",
      "Client-facing preview and print views",
    ],
  },
  {
    name: "Proof",
    eyebrow: "Brief intake",
    href: "/app/proof",
    description:
      "Turn messy briefs into a clean working draft your team can actually use, then save it back into Docs.",
    bullets: [
      "Paste or upload a brief",
      "Extract goals, deliverables, budget, and risks",
      "Save working drafts back into the platform",
    ],
  },
  {
    name: "CodeClear",
    eyebrow: "Developer verification",
    href: "/app/codeclear",
    description:
      "Verify developers before they land on delivery, with pipeline stages, scoring, notes, and GitHub analysis.",
    bullets: [
      "Candidate list and pipeline board",
      "Manual review plus GitHub-backed analysis",
      "Clearer hiring and safer staffing decisions",
    ],
  },
];

const pillars = [
  {
    title: "UK-led delivery",
    body:
      "Gitwork keeps delivery close with UK-based product leadership, so the platform speaks to commercial and operational reality rather than generic tooling.",
  },
  {
    title: "One workflow, not five tools",
    body:
      "Briefs, proposals, client context, and developer verification now sit in one system, so handover friction drops and visibility improves.",
  },
  {
    title: "Built for real project pressure",
    body:
      "This is for teams shipping against budgets, deadlines, approvals, and changing requirements, not just showcasing pretty documents.",
  },
];

const testimonials = [
  {
    quote:
      "Gitwork quickly understood the product, managed the ageing platform, and felt like part of the team.",
    author: "Steve",
    role: "Managing Director, GD Online",
  },
  {
    quote:
      "They were cost-effective, made an immediate impact, and delivered high-quality work with strong communication.",
    author: "Tom",
    role: "Founder & CEO, Freeway",
  },
  {
    quote:
      "Reliable, efficient, and enjoyable to work with. Gitwork takes care of delivery detail without adding management overhead.",
    author: "Isabella",
    role: "CEO, INHAUS",
  },
];

const workflow = [
  {
    step: "01",
    title: "Capture the brief in Proof",
    body:
      "Paste the source material, pull out the delivery signals, and turn raw client context into a usable working draft.",
  },
  {
    step: "02",
    title: "Shape the proposal in Docs",
    body:
      "Move into a structured proposal builder with commercial logic, timeline planning, sign-off, and presentation-ready output.",
  },
  {
    step: "03",
    title: "Verify delivery in CodeClear",
    body:
      "Check the people side with a proper candidate and verification workflow before developers are moved into live delivery.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-1)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(36,71,213,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(23,178,106,0.08),transparent_22%),linear-gradient(180deg,#ffffff_0%,#f8faff_42%,#ffffff_100%)]" />

      <main className="relative">
        <section className="border-b border-[var(--border-2)]">
          <div className="mx-auto flex w-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/" className="inline-flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://cdn.prod.website-files.com/66d72427cf5673ec547894ad/66d985a339bb123306db7a00_Gitwork%20Favicon.png"
                  alt="Gitwork"
                  className="h-10 w-10 rounded-[12px] border border-[var(--border-2)] bg-white p-1 shadow-[var(--shadow-xs)]"
                />
                <div>
                  <p className="text-lg font-semibold tracking-[-0.03em]">Gitwork</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-4)]">
                    Docs • Proof • CodeClear
                  </p>
                </div>
              </Link>

              <nav className="hidden items-center gap-6 text-sm text-[var(--text-3)] md:flex">
                <a href="#platform" className="transition hover:text-[var(--text-1)]">
                  Platform
                </a>
                <a href="#workflow" className="transition hover:text-[var(--text-1)]">
                  Workflow
                </a>
                <a href="#proof" className="transition hover:text-[var(--text-1)]">
                  Proof
                </a>
                <a href="#codeclear" className="transition hover:text-[var(--text-1)]">
                  CodeClear
                </a>
              </nav>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/app/proposals" className="app-button app-button-secondary app-button-md">
                  Open platform
                </Link>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-primary app-button-md"
                >
                  Book a call
                </a>
              </div>
            </header>

            <div className="grid gap-10 py-16 lg:grid-cols-[minmax(0,1.05fr)_420px] lg:py-24">
              <div>
                <span className="inline-flex rounded-full border border-[rgba(36,71,213,0.14)] bg-[var(--surface-brand)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-700)]">
                  Gitwork delivery platform
                </span>

                <h1 className="mt-6 max-w-5xl text-5xl font-semibold tracking-[-0.06em] text-[var(--text-1)] sm:text-6xl lg:text-7xl">
                  Proposal delivery, client context, and developer verification in one system.
                </h1>

                <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--text-2)] sm:text-xl">
                  Inspired by the pace and confidence of a modern agency front door, but written in Gitwork’s own
                  voice: top-tier remote developers, UK-based product oversight, and a calmer path from brief to
                  sign-off. `CodeClear` replaces generic developer checking with an actual verification workflow your
                  delivery team can use.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/app/proposals" className="app-button app-button-primary app-button-lg">
                    Open Docs
                  </Link>
                  <Link href="/app/codeclear" className="app-button app-button-secondary app-button-lg">
                    Open CodeClear
                  </Link>
                </div>

                <div className="mt-10 flex flex-wrap gap-2">
                  {clientLogos.map((client) => (
                    <span key={client} className="app-chip min-h-[30px] px-3 text-[12px]">
                      {client}
                    </span>
                  ))}
                </div>
              </div>

              <div className="app-card relative overflow-hidden p-6">
                <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(36,71,213,0.12),transparent)]" />
                <div className="relative">
                  <p className="app-eyebrow">Live workflow</p>
                  <div className="mt-4 rounded-[24px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
                    <div className="grid gap-3">
                      <div className="rounded-[18px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                          Proof
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                          Turn a raw client brief into a usable working draft
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                          Goals, deliverables, timeline, budget, and risks pulled into one clean summary.
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-[var(--border-2)] bg-white p-4 shadow-[var(--shadow-xs)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-4)]">
                          Docs
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                          Move into a builder with costing, scope, timeline, and sign-off
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                          Structured proposals with live preview, exports, and client-ready formatting.
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-[rgba(36,71,213,0.18)] bg-[var(--surface-brand-soft)] p-4 shadow-[var(--shadow-xs)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-700)]">
                          CodeClear
                        </p>
                        <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">
                          Verify the developers before they hit delivery
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                          Candidate pipeline, GitHub analysis, scorecards, and final review in the same platform.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="app-eyebrow">Platform</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              Built for the way Gitwork actually delivers work.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[var(--text-2)]">
              The copy, structure, and positioning here follow Gitwork’s tone: commercially aware, delivery-led, and
              direct. This is not another generic ops stack. It is Gitwork’s internal system for moving from brief to
              proposal to verified delivery.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {productCards.map((card) => (
              <article key={card.name} className="app-card flex h-full flex-col p-6">
                <p className="app-eyebrow">{card.eyebrow}</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{card.name}</h3>
                <p className="mt-4 text-base leading-7 text-[var(--text-2)]">{card.description}</p>
                <ul className="mt-6 space-y-3">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-3)]">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-600)]" />
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link href={card.href} className="app-button app-button-secondary app-button-md">
                    Open {card.name}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-[var(--border-2)] bg-[var(--surface-1)]">
          <div className="mx-auto grid w-full max-w-7xl gap-5 px-6 py-16 sm:px-8 lg:grid-cols-3 lg:px-10">
            {pillars.map((item) => (
              <article key={item.title} className="rounded-[22px] border border-[var(--border-2)] bg-white p-6 shadow-[var(--shadow-xs)]">
                <h3 className="text-2xl font-semibold tracking-[-0.03em]">{item.title}</h3>
                <p className="mt-4 text-base leading-7 text-[var(--text-2)]">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <p className="app-eyebrow">Workflow</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                One workflow from client brief to verified delivery.
              </h2>
            </div>
            <div className="space-y-4">
              {workflow.map((item) => (
                <article
                  key={item.step}
                  className="grid gap-5 rounded-[24px] border border-[var(--border-2)] bg-white p-6 shadow-[var(--shadow-xs)] md:grid-cols-[88px_minmax(0,1fr)]"
                >
                  <div className="text-sm font-semibold tracking-[0.16em] text-[var(--brand-700)]">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold tracking-[-0.03em]">{item.title}</h3>
                    <p className="mt-3 text-base leading-7 text-[var(--text-2)]">{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="proof" className="border-t border-[var(--border-2)]">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:px-10">
            <div className="app-card overflow-hidden p-6">
              <div className="rounded-[22px] border border-[var(--border-2)] bg-[var(--surface-1)] p-6">
                <p className="app-eyebrow">Proof to proposal</p>
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  Save working drafts back into Docs.
                </h3>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-2)]">
                  Proof is no longer a dead-end analysis tool. It is part of the Gitwork platform, so brief analysis
                  can be saved into Docs and attached to active proposal work.
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[var(--border-2)] bg-white p-4">
                    <p className="app-eyebrow">Input</p>
                    <p className="mt-2 text-lg font-semibold">Paste the brief</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                      RFPs, copied emails, notes, or uploaded documents.
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[var(--border-2)] bg-white p-4">
                    <p className="app-eyebrow">Output</p>
                    <p className="mt-2 text-lg font-semibold">Save to Docs</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
                      Create a working draft record that can be linked to proposal delivery.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="app-card p-6">
              <p className="app-eyebrow">Why it matters</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                Less manual rewrite, better delivery context.
              </h3>
              <p className="mt-4 text-base leading-7 text-[var(--text-2)]">
                The same team that builds the proposal can see the source brief, the structured extraction, and the
                linked working draft without bouncing across disconnected tools.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <Link href="/app/proof" className="app-button app-button-primary app-button-md">
                  Open Proof
                </Link>
                <Link href="/app/proposals" className="app-button app-button-secondary app-button-md">
                  Open Docs
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="codeclear" className="border-t border-[var(--border-2)] bg-[var(--surface-1)]">
          <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <p className="app-eyebrow">CodeClear</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                Clearer developer verification with CodeClear.
              </h2>
              <p className="mt-4 text-lg leading-8 text-[var(--text-2)]">
                The language here now matches the platform. `CodeClear` is Gitwork’s developer verification surface:
                candidate intake, scoring, GitHub analysis, notes, pipeline movement, and scorecard export in one
                place.
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              <article className="app-card p-6">
                <p className="app-eyebrow">Candidates</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Table-first review</h3>
                <p className="mt-4 text-base leading-7 text-[var(--text-2)]">
                  Search, filter, and move profiles with enough context to make a fast but informed call.
                </p>
              </article>
              <article className="app-card p-6">
                <p className="app-eyebrow">Pipeline</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Stage-based verification</h3>
                <p className="mt-4 text-base leading-7 text-[var(--text-2)]">
                  Move candidates from sourced to placed with clear visibility into re-checks, scores, and recent work.
                </p>
              </article>
              <article className="app-card p-6">
                <p className="app-eyebrow">Scoring</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Manual and GitHub-backed signals</h3>
                <p className="mt-4 text-base leading-7 text-[var(--text-2)]">
                  Combine reviewer judgment with GitHub analysis so staffing decisions are more consistent and easier to
                  defend.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-5 lg:grid-cols-3">
            {testimonials.map((item) => (
              <article key={item.author} className="app-card p-6">
                <p className="text-lg leading-8 text-[var(--text-2)]">“{item.quote}”</p>
                <div className="mt-6 border-t border-[var(--border-2)] pt-4">
                  <p className="font-semibold text-[var(--text-1)]">{item.author}</p>
                  <p className="text-sm text-[var(--text-3)]">{item.role}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--border-2)]">
          <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="rounded-[32px] border border-[var(--border-2)] bg-[linear-gradient(135deg,#ffffff_0%,#f5f8ff_100%)] p-8 shadow-[var(--shadow-lg)] sm:p-10">
              <p className="app-eyebrow">Gitwork</p>
              <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                Good software shouldn’t cost the world, and your internal workflow shouldn’t either.
              </h2>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--text-2)]">
                Start inside Docs by Gitwork, open the delivery platform, or book a conversation with the team behind
                it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app/proposals" className="app-button app-button-primary app-button-lg">
                  Open platform
                </Link>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-secondary app-button-lg"
                >
                  Talk to Gitwork
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
