import Link from "next/link";
import { CodeClearSiteDemo } from "@/components/marketing/codeclear-site-demo";

const customerLogos = [
  "Uber",
  "ANS",
  "Venturi Group",
  "Same Day Smile",
  "GigPig",
  "Gaia Learning",
];

const offers = [
  {
    title: "Project delivery",
    body:
      "From product thinking to launch, Gitwork leads digital projects with UK-based delivery ownership and the engineering depth to keep pace.",
  },
  {
    title: "Embedded developers",
    body:
      "Hire top-tier remote software developers without losing visibility, communication, or product context along the way.",
  },
  {
    title: "Platform systems",
    body:
      "Docs, Proof, and CodeClear are the internal systems we use to reduce delivery friction and tighten quality across every engagement.",
  },
];

const workflow = [
  {
    step: "01",
    label: "Proof",
    body:
      "Capture raw client context, analyse the brief, and turn it into something your team can actually use.",
  },
  {
    step: "02",
    label: "Docs",
    body:
      "Build proposals with clean commercials, structured sections, sign-off, and proper client-facing output.",
  },
  {
    step: "03",
    label: "CodeClear",
    body:
      "Validate developers before they enter delivery, with candidate review, scoring, and verification signals.",
  },
];

const proofPoints = [
  "UK-based product and delivery oversight",
  "Remote developers without the usual hiring friction",
  "Agency delivery backed by internal operating systems",
  "One workflow from brief to verified execution",
];

const testimonials = [
  {
    quote:
      "Gitwork quickly understood the product, managed the platform well, and felt like part of the team rather than an external supplier.",
    author: "Steve",
    role: "Managing Director, GD Online",
  },
  {
    quote:
      "They made an immediate impact, communicated clearly, and delivered high-quality work without slowing the project down.",
    author: "Tom",
    role: "Founder & CEO, Freeway",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#090b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(36,71,213,0.28),transparent_26%),radial-gradient(circle_at_top_right,rgba(79,70,229,0.16),transparent_22%),linear-gradient(180deg,#090b10_0%,#0d1017_32%,#ffffff_100%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:72px_72px]" />

      <main className="relative">
        <section className="mx-auto w-full max-w-7xl px-6 pb-16 pt-6 sm:px-8 lg:px-10 lg:pb-24">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/10 bg-white/5 text-sm font-semibold tracking-[-0.04em] text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
                G
              </span>
              <span className="text-[22px] font-semibold tracking-[-0.06em] text-white">Gitwork</span>
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/app/proposals" className="app-button app-button-secondary app-button-md border-white/12 bg-white/6 text-white hover:bg-white/10">
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

          <div className="grid gap-10 pt-16 lg:grid-cols-[minmax(0,1.05fr)_460px] lg:items-end lg:pt-24">
            <div>
              <span className="inline-flex rounded-full border border-[rgba(255,255,255,0.12)] bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/72 backdrop-blur">
                Creative design and developer agency
              </span>

              <h1 className="mt-7 max-w-5xl text-5xl font-semibold tracking-[-0.07em] text-white sm:text-6xl lg:text-7xl">
                Delivery systems for ambitious digital products.
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-white/68 sm:text-xl">
                Gitwork is an agency first. We help teams ship with stronger delivery, better developers, and a calmer
                operating rhythm. The platform is one part of that offer, not the whole story.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app/proposals" className="app-button app-button-primary app-button-lg">
                  Open platform
                </Link>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-secondary app-button-lg border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  Book a call
                </a>
              </div>

              <div className="mt-10 flex flex-wrap gap-2">
                {proofPoints.map((point) => (
                  <span
                    key={point}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/72 backdrop-blur"
                  >
                    {point}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(91,124,255,0.35),transparent_48%)] blur-3xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_24px_120px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                <div className="flex items-center gap-2 border-b border-white/8 px-2 pb-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>

                <div className="grid gap-4 pt-4">
                  <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#10141c] p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://cdn.prod.website-files.com/66d72427cf5673ec547894ad/69170ee302479d6b2e7350be_gitwork-stack%20(1).avif"
                      alt="Gitwork platform"
                      className="h-[250px] w-full rounded-[18px] object-cover"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {workflow.map((item) => (
                      <article
                        key={item.step}
                        className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                      >
                        <p className="text-xs font-semibold tracking-[0.16em] text-white/45">{item.step}</p>
                        <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
                          {item.label}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-white/60">{item.body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap gap-3 border-t border-white/10 pt-8">
            {customerLogos.map((logo) => (
              <span
                key={logo}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/62"
              >
                {logo}
              </span>
            ))}
          </div>
        </section>

        <section className="relative z-10 bg-white text-[var(--text-1)]">
          <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
            <div className="grid gap-5 lg:grid-cols-3">
              {offers.map((item) => (
                <article key={item.title} className="app-card rounded-[28px] p-7 shadow-[0_20px_60px_rgba(10,13,18,0.06)]">
                  <p className="app-eyebrow">{item.title}</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--text-1)]">
                    {item.title}
                  </h2>
                  <p className="mt-4 text-base leading-7 text-[var(--text-2)]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-7xl px-6 pb-20 sm:px-8 lg:px-10">
            <div className="grid gap-8 rounded-[36px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,#f7f9ff_100%)] p-6 shadow-[0_24px_70px_rgba(10,13,18,0.08)] lg:grid-cols-[minmax(0,0.92fr)_420px] lg:p-8">
              <div>
                <p className="app-eyebrow">CodeClear</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[var(--text-1)] sm:text-5xl">
                  Give visitors a taste of developer validation.
                </h2>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--text-2)]">
                  We can turn `CodeClear` into a front-facing conversion tool. Let prospects run a lightweight
                  validation check, then move them into a fuller Gitwork review if they want staffing support or
                  delivery help.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <article className="rounded-[24px] border border-[var(--border-2)] bg-white p-5">
                    <p className="app-eyebrow">Front-facing use</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                      Instant visitor validation
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                      A visitor enters a GitHub handle or CV link, gets a clean verification snapshot, and can then
                      request a deeper Gitwork review.
                    </p>
                  </article>
                  <article className="rounded-[24px] border border-[var(--border-2)] bg-white p-5">
                    <p className="app-eyebrow">Agency angle</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                      Productised trust signal
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                      It shows how Gitwork thinks: strong delivery, sharper filtering, and less guesswork before people
                      hit real project work.
                    </p>
                  </article>
                </div>
              </div>

              <CodeClearSiteDemo />
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 pb-20 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10">
            <div>
              <p className="app-eyebrow">Operating system</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-[var(--text-1)] sm:text-5xl">
                The workflow behind the agency.
              </h2>
            </div>
            <div className="space-y-4">
              {workflow.map((item) => (
                <article
                  key={item.step}
                  className="rounded-[28px] border border-[var(--border-2)] bg-white p-6 shadow-[0_16px_40px_rgba(10,13,18,0.05)]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex rounded-full border border-[rgba(36,71,213,0.12)] bg-[var(--surface-brand)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--brand-700)]">
                      {item.step}
                    </span>
                    <h3 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-1)]">
                      {item.label}
                    </h3>
                  </div>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--text-2)]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-7xl px-6 pb-20 sm:px-8 lg:px-10">
            <div className="grid gap-5 lg:grid-cols-2">
              {testimonials.map((item) => (
                <article
                  key={item.author}
                  className="rounded-[28px] border border-[var(--border-2)] bg-[#0f1320] p-7 text-white shadow-[0_24px_80px_rgba(10,13,18,0.22)]"
                >
                  <p className="text-xl leading-8 text-white/84">“{item.quote}”</p>
                  <div className="mt-6 border-t border-white/10 pt-4">
                    <p className="font-semibold tracking-[-0.02em]">{item.author}</p>
                    <p className="text-sm text-white/58">{item.role}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--border-2)] bg-[#0a0d14] text-white">
            <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:px-8 lg:px-10">
              <div className="rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.32)]">
                <p className="app-eyebrow text-white/50">Gitwork</p>
                <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
                  Modern delivery, stronger developer verification, and a cleaner path from idea to launch.
                </h2>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-white/66">
                  If you need delivery support, embedded developers, or want to see how the platform can fit your
                  workflow, the next step is simple.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/app/proposals" className="app-button app-button-primary app-button-lg">
                    Open platform
                  </Link>
                  <a
                    href="https://calendly.com/gitworkgroup/30min"
                    target="_blank"
                    rel="noreferrer"
                    className="app-button app-button-secondary app-button-lg border-white/12 bg-white/6 text-white hover:bg-white/10"
                  >
                    Book a call
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
