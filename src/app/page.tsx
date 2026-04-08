import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { CodeClearSiteDemo } from "@/components/marketing/codeclear-site-demo";

const chapters = [
  {
    id: "01",
    label: "Capture",
    title: "Start with the brief, not the chaos around it.",
    body:
      "Proof turns raw client input into something a delivery team can actually act on. Pull out budget, scope, timeline, risk, and working assumptions before momentum disappears.",
    bullets: ["Upload or paste source material", "Structure goals, deliverables, and risks", "Save directly into the platform"],
  },
  {
    id: "02",
    label: "Propose",
    title: "Move into documents that feel precise from the first draft.",
    body:
      "Docs gives Gitwork a cleaner proposal workflow with builder, costing, preview, linked drafts, and sign-off. Less admin, stronger commercial control, and much better client-facing output.",
    bullets: ["Builder, overview, preview, and approvals", "Commercial logic and A4-aligned output", "Shared client context across the platform"],
  },
  {
    id: "03",
    label: "Validate",
    title: "Let people experience CodeClear before they ever buy delivery.",
    body:
      "CodeClear can act as a front-facing trust layer on the Gitwork site. Visitors validate a developer profile, see signal quickly, and then move naturally into a deeper agency conversation.",
    bullets: ["Front-facing validation flow", "Scoring, confidence, and stack signals", "Natural path into staffed delivery support"],
  },
];

const proofPoints = [
  "UK-led delivery with remote developer scale",
  "Creative, product, and engineering thinking in one system",
  "Docs, Proof, and CodeClear working as one operating layer",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#05070c] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(92,124,255,0.22),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_20%),linear-gradient(180deg,#05070c_0%,#0a0d14_36%,#0f1320_58%,#ffffff_100%)]" />
        <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <main className="relative">
        <section className="overflow-hidden">
          <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-18 pt-6 sm:px-8 lg:px-10">
            <header className="flex items-center justify-between gap-4">
              <Link href="/" className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/5 text-sm font-semibold tracking-[-0.08em] text-white">
                  G
                </span>
                <span className="text-[22px] font-semibold tracking-[-0.07em] text-white">Gitwork</span>
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/app/proposals"
                  className="app-button app-button-secondary app-button-md border-white/10 bg-white/[0.06] text-white shadow-none hover:bg-white/[0.1]"
                >
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

            <div className="grid flex-1 gap-12 pt-16 lg:grid-cols-[minmax(0,1fr)_560px] lg:items-center lg:pt-24">
              <div className="max-w-3xl">
                <p className="text-sm font-medium tracking-[0.18em] text-white/42 uppercase">
                  Creative design + developer agency
                </p>

                <h1 className="mt-6 text-5xl font-semibold tracking-[-0.09em] text-white sm:text-6xl lg:text-[88px] lg:leading-[0.92]">
                  The operating system behind better client delivery.
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-8 text-white/62 sm:text-xl">
                  Gitwork combines creative thinking, proposal systems, and developer validation into one calmer
                  delivery layer. The agency stays visible. The operations get sharper.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/app/proposals" className="app-button app-button-primary app-button-lg">
                    Open platform
                  </Link>
                  <a
                    href="https://calendly.com/gitworkgroup/30min"
                    target="_blank"
                    rel="noreferrer"
                    className="app-button app-button-secondary app-button-lg border-white/10 bg-white/[0.06] text-white shadow-none hover:bg-white/[0.1]"
                  >
                    Book a call
                  </a>
                </div>

                <div className="mt-12 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-3">
                  {proofPoints.map((item) => (
                    <p key={item} className="text-sm leading-6 text-white/44">
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_20%_0%,rgba(92,124,255,0.28),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.12),transparent_24%)] blur-3xl" />
                <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[#0a0f18]/95 shadow-[0_30px_140px_rgba(0,0,0,0.46)]">
                  <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Gitwork OS</p>
                      <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
                        Brief to delivery in one view
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/56">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      Live flow
                    </span>
                  </div>

                  <div className="grid gap-4 p-4">
                    <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
                      <div className="rounded-[26px] border border-white/8 bg-white/[0.04] p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">Proof</p>
                        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
                          Turn a brief into something a team can use.
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-white/58">
                          Extract goals, scope, timing, budgets, and risk before the project gets noisy.
                        </p>

                        <div className="mt-5 rounded-[22px] border border-white/8 bg-[#0f1522] p-3">
                          <div className="h-2 w-24 rounded-full bg-white/12" />
                          <div className="mt-3 space-y-2">
                            <div className="h-9 rounded-[14px] border border-white/6 bg-white/[0.04]" />
                            <div className="h-18 rounded-[18px] border border-white/6 bg-white/[0.04]" />
                          </div>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-[26px] border border-white/8 bg-[#0d131f]">
                        <Image
                          src="https://cdn.prod.website-files.com/66d72427cf5673ec547894ad/69170ee302479d6b2e7350be_gitwork-stack%20(1).avif"
                          alt="Gitwork delivery stack"
                          width={1200}
                          height={1400}
                          className="h-full w-full object-cover opacity-90"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">Docs</p>
                            <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
                              Builder, commercials, preview, sign-off
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/54">
                            Synced
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          {["Overview", "Builder", "Preview"].map((item) => (
                            <div key={item} className="rounded-[18px] border border-white/8 bg-[#101726] px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/32">
                                {item}
                              </p>
                              <div className="mt-3 h-2 w-full rounded-full bg-white/10" />
                              <div className="mt-2 h-2 w-3/4 rounded-full bg-white/10" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-white/8 bg-white/[0.04] p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
                          CodeClear
                        </p>
                        <h2 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-white">
                          Show candidate signal before delivery risk appears.
                        </h2>
                        <div className="mt-4 space-y-3">
                          {[
                            ["Identity confidence", "High"],
                            ["GitHub analysis", "Ready"],
                            ["Delivery fit", "Strong"],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="flex items-center justify-between rounded-[16px] border border-white/8 bg-[#101726] px-4 py-3"
                            >
                              <span className="text-sm text-white/64">{label}</span>
                              <span className="text-sm font-medium text-white">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 bg-white text-[var(--text-1)]">
          <div className="mx-auto w-full max-w-7xl px-6 py-18 sm:px-8 lg:px-10 lg:py-24">
            <div className="grid gap-8 border-b border-[var(--border-2)] pb-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]">
                  Agency systems
                </p>
                <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.07em] text-[var(--text-1)] sm:text-5xl lg:text-6xl">
                  Gitwork stays agency-first. The platform makes the work feel sharper.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-[var(--text-2)] sm:text-lg">
                This is not a generic SaaS wrapper around delivery. It is Gitwork&apos;s internal system made visible:
                better briefs, tighter proposals, cleaner validation, and stronger confidence before projects move.
              </p>
            </div>

            <div className="divide-y divide-[var(--border-2)]">
              {chapters.map((chapter, index) => (
                <article
                  key={chapter.id}
                  className="grid gap-8 py-10 transition-transform duration-200 hover:-translate-y-0.5 lg:grid-cols-[150px_minmax(0,1fr)_420px] lg:items-start lg:py-14"
                >
                  <div className="pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]">
                      {chapter.id}
                    </p>
                    <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-[var(--text-1)]">{chapter.label}</p>
                  </div>

                  <div className="max-w-3xl">
                    <h3 className="text-3xl font-semibold tracking-[-0.06em] text-[var(--text-1)] sm:text-[40px] sm:leading-[1.02]">
                      {chapter.title}
                    </h3>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-2)]">{chapter.body}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {chapter.bullets.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--text-3)]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {index === 2 ? (
                    <CodeClearSiteDemo compact />
                  ) : (
                    <div className="overflow-hidden rounded-[28px] border border-[var(--border-2)] bg-[#0b0f18] p-4 text-white shadow-[0_24px_80px_rgba(10,13,18,0.08)]">
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/34">
                            {chapter.label} surface
                          </p>
                          <span className="text-xs text-white/42">{chapter.id}</span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {[0, 1, 2].map((item) => (
                            <div key={item} className="rounded-[18px] border border-white/8 bg-[#101726] p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="h-2 w-20 rounded-full bg-white/12" />
                                <div className="h-6 w-16 rounded-full border border-white/8 bg-white/[0.04]" />
                              </div>
                              <div className="mt-3 h-2 w-full rounded-full bg-white/10" />
                              <div className="mt-2 h-2 w-4/5 rounded-full bg-white/10" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border-2)] bg-[#070a12] text-white">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-18 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-22">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Gitwork</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-white sm:text-5xl lg:text-6xl">
                  Stronger systems. Better delivery. Less noise.
                </h2>
                <p className="mt-5 text-lg leading-8 text-white/62">
                  Open the platform if you already know us. Book a call if you want Gitwork to help structure the next
                  project properly.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/app/proposals" className="app-button app-button-primary app-button-lg">
                  Open platform
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-secondary app-button-lg border-white/10 bg-white/[0.06] text-white shadow-none hover:bg-white/[0.1]"
                >
                  Book a call
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
