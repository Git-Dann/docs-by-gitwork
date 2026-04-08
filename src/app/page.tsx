import Image from "next/image";
import Link from "next/link";
import { CheckCircleIcon, MinusSmallIcon, PlusSmallIcon } from "@heroicons/react/24/outline";
import { CodeClearSiteDemo } from "@/components/marketing/codeclear-site-demo";

const tiers = [
  {
    name: "Starter",
    price: "Free",
    priceUnit: "",
    description: "Full access to Docs, Proof, and CodeClear. Build, analyse, and verify — no card required.",
    features: [
      "Docs — unlimited proposals",
      "Proof — brief analysis",
      "CodeClear — up to 10 candidates",
      "Standard templates",
      "Community support",
    ],
    cta: "Open platform",
    ctaHref: "/app/proposals",
    ctaExternal: false,
    secondary: "Book a call",
    secondaryHref: "https://calendly.com/gitworkgroup/30min",
    featured: false,
  },
  {
    name: "Intermediate",
    price: "£149",
    priceUnit: "/mth",
    description: "Platform access plus agency input — proposal reviews, strategic sessions, and priority support.",
    features: [
      "Everything in Starter",
      "CodeClear — up to 50 candidates",
      "Monthly strategy session",
      "Proposal review & feedback",
      "Priority email support",
      "Custom template set-up",
    ],
    cta: "Get started",
    ctaHref: "https://calendly.com/gitworkgroup/30min",
    ctaExternal: true,
    secondary: "Chat to us",
    secondaryHref: "https://calendly.com/gitworkgroup/30min",
    featured: true,
  },
  {
    name: "Pro",
    price: "£399",
    priceUnit: "/mth",
    description: "Full Gitwork agency engagement with a dedicated team behind the work.",
    features: [
      "Everything in Intermediate",
      "CodeClear — unlimited candidates",
      "Dedicated account lead",
      "Embedded delivery support",
      "White-label exports",
      "Bespoke automation & workflows",
    ],
    cta: "Talk to us",
    ctaHref: "https://calendly.com/gitworkgroup/30min",
    ctaExternal: true,
    secondary: "Chat to sales",
    secondaryHref: "https://calendly.com/gitworkgroup/30min",
    featured: false,
  },
] as const;

const faqs = [
  "What does Gitwork actually do?",
  "Is CodeClear part of the agency or a standalone product?",
  "Can hiring teams use the CodeClear integration first?",
  "Do you work with in-house teams as well as startups?",
  "Can Gitwork take a project from brief to delivery?",
  "How quickly can we get started?",
];

const footerColumns = [
  {
    title: "Products",
    links: ["Docs", "Proof", "CodeClear", "Clients", "Platform"],
  },
  {
    title: "Services",
    links: ["Product design", "Web delivery", "Embedded developers", "Technical leadership", "Proposals"],
  },
  {
    title: "Resources",
    links: ["Pricing", "Process", "FAQ", "Book a call", "Contact"],
  },
  {
    title: "Company",
    links: ["About", "Blog", "LinkedIn", "GitHub", "Privacy"],
  },
];

const proofPoints = [
  {
    title: "Agency delivery",
    copy: "Design, proposals, staffing, and shipping support under one calmer operating rhythm.",
  },
  {
    title: "Platform systems",
    copy: "Docs and Proof keep briefs, commercials, sign-off, and working drafts properly structured.",
  },
  {
    title: "Hiring signal",
    copy: "CodeClear gives hiring companies a faster way to frame demand and surface stronger-fit developers.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <main className="bg-[#0a0a0a] text-white">
        <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#0a0a0a]">
          <HeroGrid />

          <div className="relative z-10 mx-auto max-w-[1280px] px-8">
            <header className="flex h-[84px] items-center justify-between">
              <Link href="/" aria-label="Gitwork home" className="inline-flex items-center">
                <Image src="/gitwork-logo-white.svg" alt="Gitwork" width={134} height={25} className="h-[25px] w-auto" />
              </Link>

              <div className="flex items-center gap-3">
                <Link
                  href="/app/proposals"
                  className="app-button app-button-dark app-button-md"
                >
                  Open platform
                </Link>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-primary app-button-md"
                >
                  Book call
                </a>
              </div>
            </header>

            <div className="grid items-center gap-12 pb-24 pt-14 lg:grid-cols-[minmax(0,520px)_1fr] lg:gap-16 lg:pb-28">
              <div className="max-w-[520px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Gitwork</p>
                <h1 className="mt-5 text-[64px] font-semibold leading-[0.98] tracking-[-0.065em] text-white">
                  Agency delivery with better systems built in.
                </h1>
                <p className="mt-6 text-[20px] leading-[1.6] text-white/62">
                  Gitwork is a design and developer agency. We use Docs, Proof, and CodeClear to turn messy briefs
                  into cleaner proposals, clearer delivery, and stronger hiring decisions.
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <Link href="/app/proposals" className="app-button app-button-dark app-button-md">
                    Open platform
                  </Link>
                  <a
                    href="https://calendly.com/gitworkgroup/30min"
                    target="_blank"
                    rel="noreferrer"
                    className="app-button app-button-primary app-button-md"
                  >
                    Book call
                  </a>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 rounded-[42px] bg-[radial-gradient(circle_at_50%_18%,rgba(84,130,255,0.28),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.12),transparent_45%)] blur-3xl" />
                <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 shadow-[0_28px_120px_rgba(0,0,0,0.42)]">
                  <Image
                    src="/gitwork-header.png"
                    alt="Gitwork platform layers"
                    width={592}
                    height={599}
                    className="h-auto w-full rounded-[28px] object-cover"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#0a0a0a] py-24">
          <div className="mx-auto max-w-[1280px] px-8">
            <div className="mx-auto max-w-[760px] text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Public integration</p>
              <h2 className="mt-4 text-[44px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                A better front door for hiring companies.
              </h2>
              <p className="mt-4 text-[19px] leading-8 text-white/60">
                This is the public-facing CodeClear experience. A company frames the work, Gitwork surfaces the best
                matches, and the shortlist can move into a proper agency-led review.
              </p>
            </div>

            <div className="mt-14">
              <CodeClearSiteDemo />
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-[#0a0a0a] py-20">
          <div className="mx-auto max-w-[1280px] px-8">
            <div className="grid gap-8 lg:grid-cols-3">
              {proofPoints.map((item) => (
                <div key={item.title} className="border-t border-white/10 pt-5">
                  <h3 className="text-[22px] font-semibold tracking-[-0.04em] text-white">{item.title}</h3>
                  <p className="mt-3 max-w-[320px] text-[16px] leading-7 text-white/56">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0a0a0a] py-24">
          <div className="mx-auto max-w-[1280px] px-8">
            <div className="text-center">
              <h2 className="text-[44px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                Simple packages, open platform.
              </h2>
              <p className="mt-4 text-[19px] leading-8 text-white/60">
                Use Docs, Proof, and CodeClear free — or bring Gitwork closer to the work.
              </p>
            </div>

            <div className="mt-16 grid items-end gap-6 lg:grid-cols-3">
              {tiers.map((tier) => (
                <div key={tier.name} className="relative flex flex-col">
                  {/* Most popular badge */}
                  {tier.featured ? (
                    <div className="flex items-center justify-center rounded-t-[20px] bg-[linear-gradient(90deg,#6d28d9,#7c3aed)] px-6 py-3">
                      <span className="text-[13px] font-semibold text-white">Most popular</span>
                    </div>
                  ) : null}

                  <div
                    className={`flex flex-1 flex-col rounded-b-[20px] border p-8 ${
                      tier.featured
                        ? "rounded-t-none border-violet-700/50 bg-[#1a1625]"
                        : "rounded-t-[20px] border-[#262626] bg-[#171717]"
                    }`}
                  >
                    {/* Tier name */}
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                      {tier.name}
                    </p>

                    {/* Price */}
                    <div className="mt-5 flex items-end gap-1">
                      <span className="text-[52px] font-semibold leading-none tracking-[-0.05em] text-white">
                        {tier.price}
                      </span>
                      {tier.priceUnit ? (
                        <span className="mb-1 text-[18px] text-white/40">{tier.priceUnit}</span>
                      ) : null}
                    </div>

                    {/* Description */}
                    <p className="mt-4 text-[15px] leading-6 text-white/56">{tier.description}</p>

                    {/* Features */}
                    <ul className="mt-8 flex-1 space-y-3">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                          <span className="text-[15px] leading-6 text-white/80">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTAs */}
                    <div className="mt-10 space-y-3">
                      {tier.ctaExternal ? (
                        <a
                          href={tier.ctaHref}
                          target="_blank"
                          rel="noreferrer"
                          className="app-button app-button-primary app-button-md w-full justify-center"
                        >
                          {tier.cta}
                        </a>
                      ) : (
                        <Link
                          href={tier.ctaHref}
                          className="app-button app-button-primary app-button-md w-full justify-center"
                        >
                          {tier.cta}
                        </Link>
                      )}
                      <a
                        href={tier.secondaryHref}
                        target="_blank"
                        rel="noreferrer"
                        className="app-button app-button-dark app-button-md w-full justify-center"
                      >
                        {tier.secondary}
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0a0a0a] py-24">
          <div className="mx-auto max-w-[768px] px-8 text-center">
            <h2 className="text-[36px] font-semibold leading-[1.22] tracking-[-0.04em] text-white">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-[18px] leading-7 text-white/56">
              A quick overview of how Gitwork works as an agency and where the platform fits in.
            </p>
          </div>

          <div className="mx-auto mt-16 max-w-[768px] px-8">
            {faqs.map((item, index) => (
              <div key={item} className="flex items-center justify-between border-b border-[#262626] py-6">
                <span className="text-[18px] leading-7 text-white">{item}</span>
                {index === 0 ? (
                  <MinusSmallIcon className="h-5 w-5 text-white/56" />
                ) : (
                  <PlusSmallIcon className="h-5 w-5 text-white/56" />
                )}
              </div>
            ))}

            <div className="mt-10 rounded-[24px] border border-[#262626] bg-[#171717] px-8 py-10 text-center">
              <h3 className="text-[20px] font-semibold text-white">Still have questions?</h3>
              <p className="mt-2 text-[16px] text-white/56">
                Talk to Gitwork about the platform, the agency model, or the right delivery shape for the next build.
              </p>
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-primary app-button-md mt-6"
              >
                Book call
              </a>
            </div>
          </div>
        </section>

        <section className="bg-[#171717] py-24">
          <div className="mx-auto max-w-[768px] px-8 text-center">
            <h2 className="text-[30px] font-semibold leading-[1.2] tracking-[-0.04em] text-white">
              Sign up for our newsletter
            </h2>
            <p className="mt-4 text-[16px] leading-6 text-white/56">
              Be the first to know about platform updates, agency thinking, and release notes.
            </p>
            <div className="mx-auto mt-8 flex max-w-[440px] gap-4">
              <div className="flex-1 rounded-[8px] border border-[#404040] bg-[#0f0f0f] px-[14px] py-[10px] text-left text-[16px] text-[#737373]">
                Enter your email
              </div>
              <button type="button" className="app-button app-button-primary app-button-md">
                Subscribe
              </button>
            </div>
            <p className="mt-3 text-[14px] text-[#737373]">We care about your data in our privacy policy.</p>
          </div>
        </section>

        <footer className="border-t border-[#262626] bg-[#0a0a0a] py-16 text-white">
          <div className="mx-auto max-w-[1280px] px-8">
            <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
              <div>
                <Image src="/gitwork-logo-white.svg" alt="Gitwork" width={134} height={25} className="h-[25px] w-auto" />
                <p className="mt-6 max-w-[320px] text-[16px] leading-6 text-white/56">
                  Gitwork is a creative design and developer agency with a sharper operating system behind the work.
                </p>
              </div>

              {footerColumns.map((column) => (
                <div key={column.title}>
                  <h3 className="text-[14px] font-semibold text-white">{column.title}</h3>
                  <div className="mt-4 space-y-3">
                    {column.links.map((item) => (
                      <p key={item} className="text-[14px] text-[#bfbfbf]">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 border-t border-[#262626] pt-8 text-[14px] text-white/56">
              © 2026 Gitwork. All rights reserved.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function HeroGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:76px_76px]" />
    </div>
  );
}
