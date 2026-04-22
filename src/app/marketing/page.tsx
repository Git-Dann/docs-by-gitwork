import Image from "next/image";
import Link from "next/link";

const stats = [
  { value: "50+", label: "Software Engineers" },
  { value: "80+", label: "Projects Delivered" },
  { value: "92%", label: "CSAT Score" },
  { value: "14", label: "Days to Onboard" },
];

const clients = [
  "ANS", "Uber", "Venturi", "Same Day Smile",
  "GigPig", "LGB Medical", "Campfire", "Activate",
];

const services = [
  {
    eyebrow: "Remote Developers",
    title: "Your developers, your workflow.",
    description:
      "Hire or build a team of developers you manage directly. They integrate with your team, your tools, and your timezone — working UK hours from day one.",
    features: [
      "Managed entirely by you",
      "UK working hours",
      "Dedicated project manager",
      "Zero term commitment",
    ],
    accent: "from-blue-500/10 to-transparent",
  },
  {
    eyebrow: "Custom Development",
    title: "From idea to shipped product.",
    description:
      "Developing a bespoke project from scratch? Gitwork takes ownership from ideation through to delivery — design, engineering, and launch.",
    features: [
      "Full project ownership",
      "Design + engineering",
      "Wireframe to launch",
      "Transparent milestone pricing",
    ],
    accent: "from-violet-500/10 to-transparent",
  },
  {
    eyebrow: "Dedicated Teams",
    title: "Scale your team in 14 days.",
    description:
      "Fully embedded remote developers who work as an extension of your team. Up and running fast, with none of the long hiring cycles.",
    features: [
      "Onboard in 14 days",
      "Scales up or down",
      "Full-time PM included on enterprise",
      "Flexible contracting",
    ],
    accent: "from-emerald-500/10 to-transparent",
  },
  {
    eyebrow: "Project Delivery",
    title: "End-to-end project ownership.",
    description:
      "Our UK delivery team provide full project consultation and ownership — from wireframe to launch, with clear milestones and no surprises.",
    features: [
      "UK-based delivery team",
      "Consultation included",
      "Milestone-driven delivery",
      "End-to-end support",
    ],
    accent: "from-orange-500/10 to-transparent",
  },
];

const plans = [
  {
    name: "Daily Rate",
    price: "£350",
    period: "/day",
    description: "Flexible developer hire, on your terms.",
    features: [
      "1 Full Stack Developer",
      "Zero term commitment",
      "UK working hours",
      "Dedicated project manager",
    ],
    cta: "Get started",
    highlight: false,
  },
  {
    name: "Monthly Retainer",
    price: "£4,000",
    period: "/month",
    description: "Consistent capacity for ongoing work.",
    features: [
      "1 Full Stack Developer",
      "3-month commitment",
      "UK working hours",
      "Dedicated project manager",
    ],
    cta: "Get started",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Scaled teams for complex, long-running projects.",
    features: [
      "3+ Full Stack Developers",
      "Custom working hours",
      "Full-time product manager",
      "Tailored contracting",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

const testimonials = [
  {
    quote:
      "We had an expertise gap after an acquisition and needed developers fast. The embedded team integrated seamlessly — communication was clear, delivery was consistent.",
    author: "Managing Director",
    company: "GD Online",
  },
  {
    quote:
      "The speed of impact was impressive. For a major UK brand project, Gitwork delivered quality we couldn't find domestically, at a fraction of the cost.",
    author: "Founder & CEO",
    company: "Freeway",
  },
  {
    quote:
      "Gitwork transformed our platform capabilities. Their responsiveness and technical depth made a real difference to what we could offer our learners.",
    author: "Director",
    company: "Gaia Learning",
  },
  {
    quote:
      "The quality of developers and the reliability of delivery reduced our hiring burden significantly. We stopped worrying about recruitment and focused on the product.",
    author: "CEO",
    company: "InHaus",
  },
];

const faqs = [
  {
    q: "How quickly can developers start?",
    a: "Most engagements begin within 14 days. After an initial call we match you with developers from our vetted pool and handle onboarding so your team can move fast.",
  },
  {
    q: "Do you work with in-house teams as well as startups?",
    a: "Yes. We embed into existing engineering teams as well as taking on projects end-to-end for early-stage companies. The shape of the engagement is always led by what your team needs.",
  },
  {
    q: "What tech stacks do your developers use?",
    a: "Our developers cover the full range: React, Next.js, Node.js, Python, TypeScript, PostgreSQL, AWS, and more. We match stack experience to your specific project.",
  },
  {
    q: "Is there a minimum commitment?",
    a: "The daily rate has no minimum commitment at all. The monthly retainer is a 3-month arrangement. Enterprise engagements are scoped individually.",
  },
  {
    q: "Can Gitwork take a project from brief to delivery?",
    a: "Absolutely. Our UK delivery team own projects end-to-end — from discovery and wireframes through to engineering and launch. You get one point of contact throughout.",
  },
];

const footerLinks = [
  {
    title: "Services",
    links: ["Remote Devs", "Custom Development", "Dedicated Teams", "Project Delivery"],
  },
  {
    title: "Company",
    links: ["About", "Case Studies", "Blog", "Contact"],
  },
  {
    title: "Resources",
    links: ["Pricing", "Process", "FAQ", "Privacy Policy"],
  },
  {
    title: "Platform",
    links: ["Docs", "Proof", "CodeClear", "Open Platform"],
  },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[64px] max-w-[1280px] items-center justify-between px-8">
          <div className="flex items-center gap-10">
            <Link href="/" aria-label="Gitwork home">
              <Image
                src="/gitwork-logo-white.svg"
                alt="Gitwork"
                width={120}
                height={22}
                className="h-[22px] w-auto"
              />
            </Link>
            <div className="hidden items-center gap-7 md:flex">
              {["Services", "About", "Pricing", "Case Studies"].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(" ", "-")}`}
                  className="text-[14px] text-white/56 transition-colors hover:text-white"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://www.gitwork.co.uk"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-dark app-button-md"
            >
              Hire us
            </a>
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-primary app-button-md"
            >
              Book a call
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-white/[0.06]">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-8 py-24 lg:py-32">
          <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,560px)_1fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Gitwork
              </p>
              <h1 className="mt-5 text-[64px] font-semibold leading-[0.96] tracking-[-0.065em] text-white lg:text-[72px]">
                Your project,<br />developer ready.
              </h1>
              <p className="mt-6 max-w-[460px] text-[20px] leading-[1.6] text-white/60">
                Hire quality remote developers or deliver your next project
                end-to-end. Teams that integrate in 14 days, not 14 weeks.
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
                <a
                  href="#pricing"
                  className="app-button app-button-dark app-button-lg"
                >
                  View pricing
                </a>
              </div>
            </div>

            {/* Hero decorative card */}
            <div className="relative hidden lg:block">
              <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_50%_0%,rgba(84,130,255,0.22),transparent_60%)] blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#111111] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/36">
                  Your engagement
                </p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: "Remote Developers", status: "Active", color: "text-emerald-400" },
                    { label: "Dedicated Teams", status: "Active", color: "text-emerald-400" },
                    { label: "Custom Development", status: "Enabled", color: "text-blue-400" },
                    { label: "Project Delivery", status: "Enabled", color: "text-blue-400" },
                    { label: "UK Delivery Team", status: "Included", color: "text-violet-400" },
                    { label: "Dedicated PM", status: "Included", color: "text-violet-400" },
                  ].map(({ label, status, color }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-white/20" />
                        <span className="text-[14px] text-white/80">{label}</span>
                      </div>
                      <span className={`text-[12px] font-semibold ${color}`}>{status}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-[12px] border border-white/[0.08] bg-[#0f1629] px-4 py-3">
                  <p className="text-[12px] text-white/40">Onboarding timeline</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[78%] rounded-full bg-blue-500" />
                    </div>
                    <span className="text-[12px] font-semibold text-blue-400">14 days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-b border-white/[0.06] bg-[#0d0d0d]">
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="grid grid-cols-2 divide-x divide-white/[0.06] lg:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label} className="px-8 py-8 text-center first:pl-0 last:pr-0">
                <p className="text-[36px] font-semibold tracking-[-0.04em] text-white">{value}</p>
                <p className="mt-1 text-[13px] text-white/48">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trusted by ── */}
      <section id="about" className="border-b border-white/[0.06] bg-[#0a0a0a] py-16">
        <div className="mx-auto max-w-[1280px] px-8">
          <p className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-white/36">
            Trusted by teams at
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {clients.map((name) => (
              <div
                key={name}
                className="rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-5 py-2.5"
              >
                <span className="text-[13px] font-semibold text-white/48">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services (feature sections) ── */}
      <section id="services" className="bg-[#0a0a0a]">
        {services.map((svc, i) => (
          <div
            key={svc.eyebrow}
            className="border-b border-white/[0.06] py-24"
          >
            <div className="mx-auto max-w-[1280px] px-8">
              <div
                className={`grid items-center gap-16 lg:grid-cols-2 ${
                  i % 2 === 1 ? "lg:[direction:rtl]" : ""
                }`}
              >
                {/* Text */}
                <div className={i % 2 === 1 ? "lg:[direction:ltr]" : ""}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    {svc.eyebrow}
                  </p>
                  <h2 className="mt-4 text-[44px] font-semibold leading-[1.06] tracking-[-0.055em] text-white">
                    {svc.title}
                  </h2>
                  <p className="mt-5 max-w-[440px] text-[18px] leading-[1.7] text-white/58">
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

                {/* Feature card */}
                <div className={i % 2 === 1 ? "lg:[direction:ltr]" : ""}>
                  <div
                    className={`relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-gradient-to-br ${svc.accent} bg-[#111111] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.36)]`}
                  >
                    <div className="absolute inset-0 bg-[#111111]/80" />
                    <div className="relative">
                      <div className="inline-flex items-center rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">
                        <span className="text-[12px] font-semibold text-white/50">
                          {svc.eyebrow}
                        </span>
                      </div>
                      <div className="mt-6 space-y-4">
                        {svc.features.map((f, fi) => (
                          <div
                            key={f}
                            className="flex items-center gap-4 rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-5 py-4"
                            style={{ opacity: 1 - fi * 0.12 }}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06]">
                              <CheckIcon className="text-white/60" />
                            </div>
                            <span className="text-[14px] text-white/72">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="border-b border-white/[0.06] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="mx-auto max-w-[680px] text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Pricing
            </p>
            <h2 className="mt-4 text-[48px] font-semibold leading-[1.05] tracking-[-0.055em] text-white">
              Simple, honest pricing.
            </h2>
            <p className="mt-4 text-[18px] leading-[1.7] text-white/56">
              We believe good software shouldn&apos;t cost the world. Pick the shape that fits.
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative overflow-hidden rounded-[20px] border p-8 ${
                  plan.highlight
                    ? "border-blue-500/40 bg-[linear-gradient(180deg,rgba(59,130,246,0.08),transparent)] shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_24px_60px_rgba(0,0,0,0.4)]"
                    : "border-white/[0.08] bg-[#111111] shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute right-5 top-5 rounded-full bg-blue-500/20 px-3 py-1 text-[11px] font-semibold text-blue-400">
                    Most popular
                  </div>
                )}
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/40">
                  {plan.name}
                </p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-[48px] font-semibold leading-none tracking-[-0.04em] text-white">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="mb-1 text-[16px] text-white/40">{plan.period}</span>
                  )}
                </div>
                <p className="mt-3 text-[14px] text-white/50">{plan.description}</p>
                <div className="my-7 border-t border-white/[0.06]" />
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <CheckIcon />
                      <span className="text-[14px] text-white/68">{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className={`app-button app-button-md mt-8 w-full ${
                    plan.highlight ? "app-button-primary" : "app-button-dark"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="border-b border-white/[0.06] bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="mx-auto max-w-[600px] text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Customer stories
            </p>
            <h2 className="mt-4 text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
              Teams that shipped faster.
            </h2>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {testimonials.map((t) => (
              <div
                key={t.company}
                className="rounded-[20px] border border-white/[0.08] bg-[#111111] p-8"
              >
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon key={i} />
                  ))}
                </div>
                <blockquote className="mt-5 text-[17px] leading-[1.75] text-white/72">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-6 flex items-center gap-3 border-t border-white/[0.06] pt-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-[13px] font-semibold text-white/60">
                    {t.company[0]}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white">{t.company}</p>
                    <p className="text-[12px] text-white/40">{t.author}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Gitwork CTA ── */}
      <section className="border-b border-white/[0.06] bg-[#0d0d0d] py-24">
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0f1629] px-12 py-16 text-center shadow-[0_0_0_1px_rgba(59,130,246,0.1)]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.14),transparent_60%)]" />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400/70">
                Why Gitwork
              </p>
              <h2 className="mx-auto mt-4 max-w-[560px] text-[44px] font-semibold leading-[1.08] tracking-[-0.055em] text-white">
                Stop waiting on hiring. Start building.
              </h2>
              <p className="mx-auto mt-5 max-w-[500px] text-[18px] leading-[1.7] text-white/58">
                The UK development market is expensive and slow. We believe good software
                shouldn&apos;t cost the world. Get quality developers working on your project in 14 days.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="https://calendly.com/gitworkgroup/30min"
                  target="_blank"
                  rel="noreferrer"
                  className="app-button app-button-primary app-button-lg"
                >
                  Book a call
                </a>
                <a
                  href="#pricing"
                  className="app-button app-button-dark app-button-lg"
                >
                  View pricing
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-b border-white/[0.06] bg-[#0a0a0a] py-24">
        <div className="mx-auto max-w-[760px] px-8">
          <div className="text-center">
            <h2 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.05em] text-white">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-[18px] leading-[1.7] text-white/52">
              Everything you need to know about working with Gitwork.
            </p>
          </div>
          <div className="mt-12">
            {faqs.map((item, i) => (
              <details
                key={item.q}
                className="group border-b border-white/[0.08] py-6 first:border-t"
                open={i === 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="text-[17px] font-medium text-white">{item.q}</span>
                  <PlusIcon />
                </summary>
                <p className="mt-4 pr-8 text-[15px] leading-[1.75] text-white/54">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 rounded-[20px] border border-white/[0.08] bg-[#111111] px-8 py-10 text-center">
            <h3 className="text-[20px] font-semibold text-white">Still have questions?</h3>
            <p className="mt-2 text-[15px] text-white/50">
              Talk to us about what you&apos;re building and we&apos;ll find the right shape together.
            </p>
            <a
              href="https://calendly.com/gitworkgroup/30min"
              target="_blank"
              rel="noreferrer"
              className="app-button app-button-primary app-button-md mt-6"
            >
              Book a call
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#0a0a0a] py-16">
        <div className="mx-auto max-w-[1280px] px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
            <div>
              <Image
                src="/gitwork-logo-white.svg"
                alt="Gitwork"
                width={120}
                height={22}
                className="h-[22px] w-auto"
              />
              <p className="mt-5 max-w-[280px] text-[14px] leading-6 text-white/44">
                Quality remote developers and project delivery for companies that want to build well.
              </p>
              <div className="mt-5 space-y-1.5 text-[13px] text-white/36">
                <p>3rd Floor, Anchorage One,</p>
                <p>Anchorage Quay, Salford, M50 3YJ</p>
                <p className="mt-3">hello@gitwork.co.uk</p>
                <p>+44 (0) 7903 076159</p>
              </div>
            </div>
            {footerLinks.map((col) => (
              <div key={col.title}>
                <h3 className="text-[13px] font-semibold text-white">{col.title}</h3>
                <div className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <p key={link} className="text-[13px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">
                      {link}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-8 text-[13px] text-white/32 sm:flex-row sm:items-center">
            <p>© 2026 Gitwork Group Ltd. All rights reserved.</p>
            <p>Company No. 15756347 · VAT 468314867 · Registered in England and Wales</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroGrid() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px]" />
    </div>
  );
}

function CheckIcon({ className = "text-blue-400" }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-4 w-4 text-yellow-400" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5l1.545 3.13 3.455.503-2.5 2.436.59 3.44L8 9.385l-3.09 1.624.59-3.44L3 5.133l3.455-.503L8 1.5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-white/36 transition-transform group-open:rotate-45"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
