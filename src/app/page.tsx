import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { CodeClearSiteDemo } from "@/components/marketing/codeclear-site-demo";

const agencyOffers = [
  {
    label: "Delivery partnerships",
    body: "Gitwork leads design, product, and engineering work with a calmer operating rhythm from discovery through launch.",
  },
  {
    label: "Embedded developers",
    body: "Bring in remote developers with agency oversight, stronger vetting, and clearer delivery expectations around the work.",
  },
  {
    label: "Platform systems",
    body: "Docs, Proof, and CodeClear are the internal layers that make the agency output feel more precise and scalable.",
  },
];

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
  "Creative, product, and engineering thinking under one agency roof",
  "Internal platform systems that sharpen the delivery work",
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
                <GitworkLogo className="h-6 w-auto text-white" />
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
                  Gitwork is a creative design and developer agency. The platform sharpens how briefs, proposals,
                  developer validation, and delivery decisions move through the work.
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
            <div className="grid gap-5 border-b border-[var(--border-2)] pb-10 lg:grid-cols-3">
              {agencyOffers.map((item) => (
                <article
                  key={item.label}
                  className="rounded-[28px] border border-[var(--border-2)] bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] p-6 shadow-[0_20px_70px_rgba(10,13,18,0.05)]"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]">
                    {item.label}
                  </p>
                  <p className="mt-4 text-lg leading-8 text-[var(--text-2)]">{item.body}</p>
                </article>
              ))}
            </div>

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
                This is not the whole offer. It is the operating layer underneath the offer: better briefs, tighter
                proposals, cleaner validation, and stronger confidence around the agency delivery itself.
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
                <div className="text-white/88">
                  <GitworkLogo className="h-6 w-auto" />
                </div>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-white sm:text-5xl lg:text-6xl">
                  Stronger systems. Better delivery. Less noise.
                </h2>
                <p className="mt-5 text-lg leading-8 text-white/62">
                  Work with Gitwork as an agency, or open the platform if you are already inside the system. The same
                  thinking sits behind both.
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

function GitworkLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 134 25"
      className={className}
      fill="none"
      aria-label="Gitwork"
      role="img"
    >
      <g clipPath="url(#gitwork-logo-clip)">
        <path
          d="M132.906 22.5753C132.906 23.4462 132.19 24.1522 131.307 24.1522C130.424 24.1522 129.709 23.4462 129.709 22.5753C129.709 21.7045 130.424 20.9985 131.307 20.9985C132.19 20.9985 132.906 21.7045 132.906 22.5753Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.0476619"
        />
        <path
          d="M115.442 22.5931C115.442 23.454 114.735 24.152 113.862 24.152C112.99 24.152 112.282 23.454 112.282 22.5931V2.38596C112.282 1.52498 112.99 0.827026 113.862 0.827026C114.735 0.827026 115.442 1.52498 115.442 2.38596V14.1734V17.5413V22.5931Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.0476619"
        />
        <path
          d="M115.697 15.0157C115.697 14.6197 116.022 14.2987 116.423 14.2987C116.965 14.2987 117.403 13.8658 117.403 13.3317C117.403 12.9358 117.729 12.6148 118.131 12.6148C118.672 12.6148 119.111 12.1819 119.111 11.6478C119.111 11.2519 119.436 10.9309 119.837 10.9309C120.379 10.9309 120.817 10.4979 120.817 9.96388C120.817 9.56794 121.142 9.24695 121.543 9.24695C122.085 9.24695 122.524 8.81403 122.524 8.27997C122.524 7.88398 122.849 7.56299 123.251 7.56299H124.104C124.977 7.56299 125.684 8.26096 125.684 9.12195V9.96388C125.684 10.3599 125.359 10.6809 124.957 10.6809C124.416 10.6809 123.977 11.1138 123.977 11.6478C123.977 12.0438 123.652 12.3648 123.251 12.3648C122.709 12.3648 122.27 12.7977 122.27 13.3317C122.27 13.7277 121.945 14.0487 121.543 14.0487C121.002 14.0487 120.563 14.4816 120.563 15.0157V16.6996C120.563 17.2336 121.002 17.6666 121.543 17.6666C121.945 17.6666 122.27 17.9876 122.27 18.3835C122.27 18.9176 122.709 19.3505 123.251 19.3505C123.652 19.3505 123.977 19.6715 123.977 20.0675C123.977 20.6015 124.416 21.0344 124.957 21.0344C125.359 21.0344 125.684 21.3554 125.684 21.7514V22.5933C125.684 23.4543 124.977 24.1523 124.104 24.1523H123.251C122.849 24.1523 122.524 23.8313 122.524 23.4353C122.524 22.9013 122.085 22.4683 121.543 22.4683C121.142 22.4683 120.817 22.1473 120.817 21.7514C120.817 21.2173 120.379 20.7844 119.837 20.7844C119.436 20.7844 119.111 20.4634 119.111 20.0675C119.111 19.5334 118.672 19.1005 118.131 19.1005C117.729 19.1005 117.403 18.7795 117.403 18.3835C117.403 17.8495 116.965 17.4166 116.423 17.4166C116.022 17.4166 115.697 17.0956 115.697 16.6996V15.0157Z"
          fill="#0795FF"
          stroke="currentColor"
          strokeWidth="0.0476619"
        />
        <path d="M101.825 22.5753C101.825 23.4461 101.11 24.1521 100.227 24.1521C99.3439 24.1521 98.6283 23.4461 98.6283 22.5753V11.6297C98.6283 11.2239 98.9619 10.8949 99.3734 10.8949H99.3914C99.9326 10.8949 100.372 10.4619 100.372 9.92787C100.372 9.53193 100.697 9.21089 101.098 9.21089C101.639 9.21089 102.079 8.77802 102.079 8.24396C102.079 7.84797 102.404 7.52698 102.805 7.52698H107.037C107.909 7.52698 108.617 8.22495 108.617 9.08589C108.617 9.94688 107.909 10.6449 107.037 10.6449H104.476C103.935 10.6449 103.496 11.0778 103.496 11.6118V11.6297C103.496 12.0158 103.178 12.3288 102.787 12.3288C102.256 12.3288 101.825 12.7537 101.825 13.2778V22.5753Z" fill="currentColor" stroke="currentColor" strokeWidth="0.0476619" />
        <path d="M80.3107 12.3288C79.769 12.3288 79.3304 12.7617 79.3304 13.2958V18.3834C79.3304 18.9174 79.769 19.3503 80.3107 19.3503C80.7117 19.3503 81.0372 19.6713 81.0372 20.0673C81.0372 20.6013 81.4763 21.0343 82.0175 21.0343H87.1019C87.6431 21.0343 88.0822 20.6013 88.0822 20.0673C88.0822 19.6713 88.4072 19.3503 88.8087 19.3503C89.35 19.3503 89.789 18.9174 89.789 18.3834V13.2958C89.789 12.7617 89.35 12.3288 88.8087 12.3288C88.4072 12.3288 88.0822 12.0078 88.0822 11.6118C88.0822 11.0778 87.6431 10.6449 87.1019 10.6449H82.0175C81.4763 10.6449 81.0372 11.0778 81.0372 11.6118C81.0372 12.0078 80.7117 12.3288 80.3107 12.3288ZM79.5836 23.4351C79.5836 22.9011 79.1451 22.4682 78.6038 22.4682C78.2023 22.4682 77.8768 22.1472 77.8768 21.7512C77.8768 21.2172 77.4382 20.7843 76.8965 20.7843C76.4955 20.7843 76.17 20.4633 76.17 20.0673V11.6118C76.17 11.2159 76.4955 10.8949 76.8965 10.8949C77.4382 10.8949 77.8768 10.4619 77.8768 9.92787C77.8768 9.53193 78.2023 9.21089 78.6038 9.21089C79.1451 9.21089 79.5836 8.77802 79.5836 8.24396C79.5836 7.84797 79.9091 7.52698 80.3107 7.52698H88.8087C89.2103 7.52698 89.5358 7.84797 89.5358 8.24396C89.5358 8.77802 89.9744 9.21089 90.5156 9.21089C90.9171 9.21089 91.2426 9.53193 91.2426 9.92787C91.2426 10.4619 91.6812 10.8949 92.2229 10.8949C92.6239 10.8949 92.9494 11.2159 92.9494 11.6118V20.0673C92.9494 20.4633 92.6239 20.7843 92.2229 20.7843C91.6812 20.7843 91.2426 21.2172 91.2426 21.7512C91.2426 22.1472 90.9171 22.4682 90.5156 22.4682C89.9744 22.4682 89.5358 22.9011 89.5358 23.4351C89.5358 23.8311 89.2103 24.1521 88.8087 24.1521H80.3107C79.9091 24.1521 79.5836 23.8311 79.5836 23.4351Z" fill="currentColor" stroke="currentColor" strokeWidth="0.0476619" />
        <path d="M57.1634 23.4351C57.1634 23.8311 56.8379 24.1521 56.4368 24.1521H55.5834C54.7105 24.1521 54.003 23.4541 54.003 22.5932V9.08589C54.003 8.22495 54.7105 7.52698 55.5834 7.52698C56.4558 7.52698 57.1634 8.22495 57.1634 9.08589V16.6815C57.1634 17.2255 57.6105 17.6664 58.1617 17.6664H58.1798C58.721 17.6664 59.16 17.2335 59.16 16.6994V16.6815C59.16 16.2955 59.4775 15.9824 59.8685 15.9824C60.3998 15.9824 60.8308 15.5576 60.8308 15.0334V14.2094C60.8308 13.3682 61.5222 12.6863 62.3746 12.6863H62.4473C63.2998 12.6863 63.9912 13.3682 63.9912 14.2094V15.0155C63.9912 15.5496 64.4298 15.9824 64.9715 15.9824C65.3725 15.9824 65.698 16.3035 65.698 16.6994C65.698 17.2335 66.1371 17.6664 66.6783 17.6664C67.2195 17.6664 67.6586 17.2335 67.6586 16.6994V9.08594C67.6586 8.22495 68.3661 7.52698 69.2386 7.52698C70.1115 7.52698 70.819 8.22495 70.819 9.08589V22.5932C70.819 23.4541 70.1115 24.1521 69.2386 24.1521H68.3851C67.9841 24.1521 67.6586 23.8311 67.6586 23.4351C67.6586 22.9011 67.2195 22.4682 66.6783 22.4682C66.2768 22.4682 65.9513 22.1472 65.9513 21.7512C65.9513 21.2172 65.5127 20.7843 64.9715 20.7843C64.5699 20.7843 64.2444 20.4633 64.2444 20.0673C64.2444 19.5333 63.8059 19.1003 63.2642 19.1003H61.5573C61.0161 19.1003 60.5775 19.5333 60.5775 20.0673C60.5775 20.4633 60.252 20.7843 59.8505 20.7843C59.3093 20.7843 58.8702 21.2172 58.8702 21.7512C58.8702 22.1472 58.5452 22.4682 58.1436 22.4682C57.6024 22.4682 57.1634 22.9011 57.1634 23.4351Z" fill="currentColor" stroke="currentColor" strokeWidth="0.0476619" />
        <path d="M45.7034 22.4682C45.302 22.4682 44.9766 22.1472 44.9766 21.7512C44.9766 21.2172 44.5378 20.7842 43.9965 20.7842C43.5951 20.7842 43.2697 20.4633 43.2697 20.0673V12.3642C43.2697 11.3949 42.4732 10.6091 41.4905 10.6091C40.6479 10.6091 39.9648 9.93514 39.9648 9.10382V9.03217C39.9648 8.2009 40.6479 7.52698 41.4905 7.52698C42.4732 7.52698 43.2697 6.74118 43.2697 5.77179V4.1058C43.2697 3.24484 43.9773 2.54688 44.8499 2.54688C45.7227 2.54688 46.4301 3.24484 46.4301 4.1058V5.73599C46.4301 6.72514 47.243 7.52698 48.2457 7.52698C49.1081 7.52698 49.8076 8.21694 49.8076 9.06802C49.8076 9.91911 49.1081 10.6091 48.2457 10.6091C47.243 10.6091 46.4301 11.4109 46.4301 12.4V18.3834C46.4301 18.9174 46.869 19.3504 47.4103 19.3504C47.8119 19.3504 48.1374 19.6713 48.1374 20.0673V20.0851C48.1374 20.6094 48.5679 21.0342 49.0991 21.0342C49.4907 21.0342 49.8076 21.3472 49.8076 21.7333V22.6111C49.8076 23.4622 49.1081 24.1521 48.2457 24.1521H47.4103C47.0089 24.1521 46.6836 23.8311 46.6836 23.4351C46.6836 22.9011 46.2447 22.4682 45.7034 22.4682Z" fill="currentColor" stroke="currentColor" strokeWidth="0.0476619" />
        <path d="M27.119 22.602C27.119 21.7599 27.8111 21.07 28.6629 21.07C29.6556 21.07 30.4602 20.2761 30.4602 19.2969V12.382C30.4602 11.4028 29.6556 10.6089 28.6629 10.6089C27.8111 10.6089 27.119 9.91899 27.119 9.07692C27.119 8.22494 27.8192 7.52692 28.681 7.52692H31.6837C32.7334 7.52692 33.5843 8.36635 33.5843 9.40192V19.279C33.5843 20.2681 34.3972 21.07 35.3998 21.07C36.2625 21.07 36.9619 21.7599 36.9619 22.611C36.9619 23.4621 36.2625 24.152 35.3998 24.152H28.681C27.8192 24.152 27.119 23.4539 27.119 22.602ZM30.4602 2.35012C30.4602 1.50894 31.1514 0.827026 32.0041 0.827026H32.0404C32.8931 0.827026 33.5843 1.50894 33.5843 2.35012C33.5843 3.19131 32.8931 3.87322 32.0404 3.87322H32.0041C31.1514 3.87322 30.4602 3.19131 30.4602 2.35012Z" fill="currentColor" stroke="currentColor" strokeWidth="0.0476619" />
        <path d="M16.0731 21.0341C17.2628 21.0341 18.2271 20.0827 18.2271 18.9091V17.595C18.2271 16.5861 17.398 15.7682 16.3754 15.7682H16.3391C15.4763 15.7682 14.777 15.0783 14.777 14.2272C14.777 13.3761 15.4763 12.6862 16.3391 12.6862H19.487C20.5366 12.6862 21.3876 13.5256 21.3876 14.5612V22.277C21.3876 23.3125 20.5366 24.152 19.487 24.152H13.2229C12.3502 24.152 11.6428 23.454 11.6428 22.5931C11.6428 21.7321 12.3502 21.0341 13.2229 21.0341H16.0731ZM17.247 0.827026C17.6484 0.827026 17.9737 1.14802 17.9737 1.54399C17.9737 2.07803 18.4126 2.51095 18.9539 2.51095C19.3553 2.51095 19.6807 2.83195 19.6807 3.22792C19.6807 3.76195 20.1195 4.19488 20.6608 4.19488C21.0622 4.19488 21.3876 4.51588 21.3876 4.91182V5.73588C21.3876 6.58697 20.6883 7.27692 19.8256 7.27692H18.9358C18.5444 7.27692 18.2271 6.96395 18.2271 6.57786C18.2271 6.05371 17.7964 5.62881 17.2651 5.62881H17.247C16.8456 5.62881 16.5202 5.30781 16.5202 4.91182C16.5202 4.3778 16.0814 3.94488 15.5401 3.94488H13.2229C12.3502 3.94488 11.6428 3.24692 11.6428 2.38595C11.6428 1.52498 12.3502 0.827026 13.2229 0.827026H17.247Z" fill="currentColor" stroke="currentColor" strokeWidth="0.0476619" />
        <path d="M4.09676 23.0182C3.84347 23.0182 3.63814 22.8156 3.63814 22.5657C3.63814 22.1778 3.31936 21.8633 2.92612 21.8633C2.67283 21.8633 2.46751 21.6607 2.46751 21.4109V15.784C2.46751 15.396 2.14872 15.0815 1.75548 15.0815C1.50218 15.0815 1.29686 14.879 1.29686 14.6291C1.29686 14.2412 0.978076 13.9267 0.584834 13.9267C0.331547 13.9267 0.126219 13.7241 0.126219 13.4742V11.364C0.126219 11.1141 0.331547 10.9115 0.584834 10.9115H0.597283C0.98365 10.9115 1.29686 10.6025 1.29686 10.2214C1.29686 9.97833 1.49661 9.78125 1.74302 9.78125H1.75548C2.14872 9.78125 2.46751 9.46677 2.46751 9.07885V3.64851C2.46751 3.39864 2.67283 3.19608 2.92612 3.19608C3.31936 3.19608 3.63814 2.88159 3.63814 2.49365C3.63814 2.24378 3.84347 2.04122 4.09676 2.04122C4.49001 2.04122 4.80879 1.72673 4.80879 1.33878C4.80879 1.08891 5.01412 0.886353 5.26739 0.886353H8.30463C9.14864 0.886353 9.8328 1.56132 9.8328 2.39393V2.47849C9.8328 3.2644 9.18698 3.9015 8.39035 3.9015H7.40649C7.01328 3.9015 6.69449 4.21599 6.69449 4.60393C6.69449 4.8538 6.48916 5.05635 6.23589 5.05635C5.84264 5.05635 5.52384 5.37083 5.52384 5.7588V11.1645C5.52384 11.4144 5.31852 11.6169 5.06525 11.6169C4.67199 11.6169 4.3532 11.9314 4.3532 12.3194V12.5188C4.3532 12.9068 4.67199 13.2213 5.06525 13.2213C5.31852 13.2213 5.52384 13.4238 5.52384 13.6737V19.3006C5.52384 19.6885 5.84264 20.003 6.23589 20.003H6.24834C6.49472 20.003 6.69449 20.2001 6.69449 20.4432C6.69449 20.8243 7.00768 21.1333 7.39404 21.1333H8.39035C9.18698 21.1333 9.8328 21.7705 9.8328 22.5563V22.6532C9.8328 23.4926 9.14303 24.173 8.29218 24.173H5.26739C5.01412 24.173 4.80879 23.9705 4.80879 23.7206C4.80879 23.3326 4.49001 23.0182 4.09676 23.0182Z" fill="#0795FF" stroke="currentColor" strokeWidth="0.0476619" />
      </g>
      <defs>
        <clipPath id="gitwork-logo-clip">
          <rect width="134" height="25" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
