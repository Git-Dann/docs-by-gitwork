import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { CodeClearSiteDemo } from "@/components/marketing/codeclear-site-demo";
import {
  companyValues,
  customerStories,
  deliveryStats,
  deliveryTimeline,
  faqs,
  footerColumns,
  getProduct,
  headerActions,
  partnerLogos,
  pricingPlans,
  products,
  serviceOffers,
  siteNavigation,
  type ProductPage,
  type SiteLink,
} from "@/components/marketing/site-content";

type MarketingChromeProps = {
  children: React.ReactNode;
  currentPath: string;
};

function isActivePath(currentPath: string, href: string) {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function renderLink(
  link: SiteLink,
  className: string,
  children?: React.ReactNode,
  keyValue?: string,
) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={className} key={keyValue}>
        {children ?? link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className} key={keyValue}>
      {children ?? link.label}
    </Link>
  );
}

function MarketingChrome({ children, currentPath }: MarketingChromeProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05090d] text-white [color-scheme:dark]">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-[100] -translate-y-20 rounded-full border border-white/14 bg-[#0f0f0f] px-4 py-2 text-sm text-white transition focus:translate-y-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/20"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#050505]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-6">
            <Link href="/" aria-label="Gitwork home" className="inline-flex items-center">
              <Image
                src="/gitwork-logo-white.svg"
                alt="Gitwork"
                width={134}
                height={25}
                className="h-[24px] w-auto"
                priority
              />
            </Link>

            <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
              {siteNavigation.map((item) => {
                const active = isActivePath(currentPath, item.href);
                return renderLink(
                  item,
                  `text-sm transition-colors hover:text-white focus:outline-none focus-visible:text-white ${
                    active ? "text-white" : "text-white/56"
                  }`,
                  undefined,
                  item.href,
                );
              })}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Primary mobile" className="flex w-full gap-4 overflow-x-auto pb-1 md:hidden">
              {siteNavigation.map((item) => {
                const active = isActivePath(currentPath, item.href);
                return renderLink(
                  item,
                  `shrink-0 text-sm transition-colors hover:text-white focus:outline-none focus-visible:text-white ${
                    active ? "text-white" : "text-white/56"
                  }`,
                  undefined,
                  item.href,
                );
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-3">
              {headerActions.map((action, index) =>
                renderLink(
                  action,
                  `app-button ${index === 0 ? "app-button-dark" : "app-button-primary"} app-button-md`,
                  undefined,
                  action.href,
                ),
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <div className="signal-stripe" aria-hidden="true" />

      <footer className="border-t border-white/8 bg-[#070707] py-16">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_repeat(4,1fr)]">
            <div>
              <Image
                src="/gitwork-logo-white.svg"
                alt="Gitwork"
                width={134}
                height={25}
                className="h-[24px] w-auto"
              />
              <p className="mt-6 max-w-[320px] text-[16px] leading-7 text-white/58">
                Gitwork is a creative design and developer agency with a sharper operating system behind the work.
              </p>
            </div>

            {footerColumns.map((column) => (
              <div key={column.title}>
                <h2 className="text-sm font-semibold text-white">{column.title}</h2>
                <div className="mt-4 space-y-3">
                  {column.links.map((link) =>
                    renderLink(
                      link,
                      "block text-sm text-white/56 transition-colors hover:text-white",
                      undefined,
                      `${column.title}-${link.href}`,
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 border-t border-white/8 pt-8 text-sm text-white/42">
            © 2026 Gitwork. Docs, Proof, and Code are part of the Gitwork platform.
          </div>
        </div>
      </footer>
    </div>
  );
}

function HeroGrid() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(9,112,200,0.24),transparent_34%),radial-gradient(circle_at_80%_100%,rgba(66,199,255,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:80px_80px]" />
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  copy,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-[760px] text-center" : "max-w-[720px]"}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">{eyebrow}</p>
      <h2 className="mt-4 text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.055em] text-white sm:text-[48px]">
        {title}
      </h2>
      <p className="mt-5 text-pretty text-[18px] leading-8 text-white/60">{copy}</p>
    </div>
  );
}

function PartnerStrip() {
  return (
    <section className="border-y border-white/8 bg-[#080808] py-10">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
          Trusted by teams at
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {partnerLogos.map((partner) => (
            <div
              key={partner}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/54"
            >
              {partner}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsBand() {
  return (
    <section className="border-b border-white/8 bg-[#090909]">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
        <div className="grid gap-px bg-white/8 md:grid-cols-2 xl:grid-cols-4">
          {deliveryStats.map((item) => (
            <div key={item.label} className="bg-[#090909] px-6 py-8 text-left md:px-8">
              <p className="text-[34px] font-semibold tracking-[-0.05em] text-white">{item.value}</p>
              <p className="mt-2 text-sm text-white/48">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductFeatureGrid({ product }: { product: ProductPage }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {product.featureCards.map((card, index) => (
        <article
          key={card.title}
          className={`rounded-[10px] border border-white/10 bg-white/[0.03] p-6 ${
            index === 0 ? "md:col-span-3 lg:col-span-1" : ""
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">
            {product.name}
          </p>
          <h3 className="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-white">{card.title}</h3>
          <p className="mt-3 text-[16px] leading-7 text-white/58">{card.copy}</p>
        </article>
      ))}
    </div>
  );
}

function WorkflowSteps({ product }: { product: ProductPage }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {product.workflow.map((step, index) => (
        <article key={step.title} className="border-t border-white/10 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/36">Step {index + 1}</p>
          <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-white">{step.title}</h3>
          <p className="mt-3 text-[16px] leading-7 text-white/58">{step.copy}</p>
        </article>
      ))}
    </div>
  );
}

function PricingGrid() {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {pricingPlans.map((plan) => (
        <article
          key={plan.name}
          className={`rounded-[28px] border p-8 ${
            plan.highlight
              ? "border-[rgba(9,112,200,0.38)] bg-[linear-gradient(180deg,rgba(9,112,200,0.16),rgba(255,255,255,0.03))] shadow-[0_0_0_1px_rgba(9,112,200,0.16)]"
              : "border-white/10 bg-white/[0.03]"
          }`}
        >
          {plan.highlight ? (
            <div className="mb-5 inline-flex rounded-full border border-[rgba(9,112,200,0.30)] bg-[rgba(9,112,200,0.10)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-300)]">
              Most Popular
            </div>
          ) : null}

          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">{plan.name}</p>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-[48px] font-semibold leading-none tracking-[-0.05em] text-white">{plan.price}</span>
            {plan.period ? <span className="mb-1 text-[16px] text-white/42">{plan.period}</span> : null}
          </div>
          <p className="mt-4 text-[15px] leading-7 text-white/56">{plan.description}</p>

          <div className="my-7 border-t border-white/10" />

          <ul className="space-y-3">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                <span className="text-[15px] leading-6 text-white/76">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            {renderLink(
              plan.cta,
              `app-button ${plan.highlight ? "app-button-primary" : "app-button-dark"} app-button-md w-full`,
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function StoryGrid() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {customerStories.map((story) => (
        <article key={story.company} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{story.company}</p>
          <blockquote className="mt-4 text-[20px] leading-8 text-white/82">
            &ldquo;{story.quote}&rdquo;
          </blockquote>
          <p className="mt-5 text-[14px] font-medium text-white/48">{story.author}</p>
          <p className="mt-4 border-t border-white/10 pt-4 text-[15px] leading-6 text-white/58">{story.impact}</p>
        </article>
      ))}
    </div>
  );
}

function FaqList() {
  return (
    <div className="mx-auto max-w-[840px]">
      {faqs.map((item) => (
        <details
          key={item.question}
          className="group border-b border-white/10 py-6 open:border-white/16"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[18px] leading-7 text-white focus:outline-none">
            <span className="text-balance">{item.question}</span>
            <ChevronDownIcon
              className="h-5 w-5 shrink-0 text-white/46 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="mt-4 max-w-[680px] text-[16px] leading-7 text-white/56">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

function FinalCta({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <section className="bg-[#080808] py-24">
      <div className="mx-auto max-w-[920px] px-6 text-center sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{eyebrow}</p>
        <h2 className="mt-4 text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.055em] text-white sm:text-[48px]">
          {title}
        </h2>
        <p className="mt-5 text-pretty text-[18px] leading-8 text-white/58">{copy}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {renderLink({ label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true }, "app-button app-button-primary app-button-md")}
          {renderLink({ label: "Open Platform", href: "/app/proposals" }, "app-button app-button-dark app-button-md")}
        </div>
      </div>
    </section>
  );
}

function HomeHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-white/8">
      <HeroGrid />

      <div className="relative z-10 mx-auto grid max-w-[1280px] gap-14 px-6 py-18 sm:px-8 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-center lg:py-24">
        <div className="max-w-[560px]">
          {renderLink(
            { label: "Explore Gitwork Products", href: "/products" },
            "inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white",
            <>
              Gitwork Platform
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </>,
          )}

          <h1 className="mt-6 text-balance text-[54px] font-semibold leading-[0.96] tracking-[-0.07em] text-white sm:text-[68px] lg:text-[78px]">
            Your project,
            <br />
            delivery ready.
          </h1>

          <p className="mt-6 max-w-[520px] text-pretty text-[20px] leading-8 text-white/60">
            Gitwork combines embedded developers, UK-led delivery, and a sharper platform for scoping, proposals, and
            hiring signal. The result is calmer product work from first brief to launch.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {renderLink({ label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true }, "app-button app-button-primary app-button-lg")}
            {renderLink({ label: "Open Platform", href: "/app/proposals" }, "app-button app-button-dark app-button-lg")}
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {products.map((product) => (
              <Link
                key={product.slug}
                href={`/products/${product.slug}`}
                className="rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-white/18 hover:bg-white/[0.05]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{product.name}</p>
                <p className="mt-2 text-sm leading-6 text-white/72">{product.eyebrow}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_50%_18%,rgba(9,112,200,0.34),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(66,199,255,0.14),transparent_40%)] blur-3xl" />
          <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4 shadow-[0_32px_120px_rgba(0,0,0,0.42)]">
            <Image
              src="/gitwork-header.png"
              alt="Gitwork platform overview"
              width={592}
              height={599}
              className="h-auto w-full rounded-[28px] object-cover"
              priority
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border border-white/10 bg-[#0d1119] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Delivery Layers</p>
              <div className="mt-4 space-y-3">
                {["Embedded Developers", "Project Delivery", "Docs + Proof", "Code"].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-[10px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <span className="text-sm text-white/80">{item}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-300)]">Ready</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[10px] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Typical Outcomes</p>
              <div className="mt-5 space-y-4">
                {["Clearer intake", "Stronger proposals", "Better-fit teams"].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                    <span className="text-sm leading-6 text-white/74">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[10px] border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Onboarding</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[78%] rounded-full bg-[var(--brand-700)]" />
                  </div>
                  <span className="text-sm font-semibold text-[var(--brand-300)]">14 Days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeProductsSection() {
  return (
    <section id="products" className="bg-[#050505] py-24 scroll-mt-28">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
        <SectionIntro
          eyebrow="Products"
          title="Three Gitwork products, one calmer operating system."
          copy="The public site now mirrors the structure of the work itself: better intake, better proposal shaping, and better hiring signal."
        />

        <div className="mt-16 space-y-20">
          {products.map((product) => (
            <article
              key={product.slug}
              className="grid gap-10 border-t border-white/10 pt-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start"
            >
              <div className="max-w-[420px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{product.eyebrow}</p>
                <h3 className="mt-4 text-balance text-[38px] font-semibold leading-[1.04] tracking-[-0.05em] text-white">
                  {product.name}
                </h3>
                <p className="mt-4 text-[18px] leading-8 text-white/58">{product.summary}</p>
                <div className="mt-7 space-y-3">
                  {product.quickHits.map((hit) => (
                    <div key={hit} className="flex items-start gap-3">
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                      <span className="text-[15px] leading-6 text-white/76">{hit}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  {renderLink(product.primaryCta, "app-button app-button-primary app-button-md")}
                  {renderLink({ label: "Learn More", href: `/products/${product.slug}` }, "app-button app-button-dark app-button-md")}
                </div>
              </div>

              <div>
                {product.slug === "codeclear" ? <CodeClearSiteDemo /> : <ProductFeatureGrid product={product} />}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingHomePage() {
  return (
    <MarketingChrome currentPath="/">
      <HomeHero />
      <PartnerStrip />
      <StatsBand />
      <HomeProductsSection />

      <section id="services" className="border-y border-white/8 bg-[#090909] py-24 scroll-mt-28">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Services"
            title="The delivery shape changes. The operating standard does not."
            copy="Gitwork can drop in as embedded capacity, own the work end-to-end, or help hiring teams sharpen the front door. Each motion uses the same system underneath."
          />

          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {serviceOffers.map((offer) => (
              <article key={offer.title} className="border-t border-white/10 pt-5">
                <h3 className="text-[26px] font-semibold tracking-[-0.04em] text-white">{offer.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/58">{offer.copy}</p>
                <div className="mt-6 space-y-3">
                  {offer.points.map((point) => (
                    <div key={point} className="flex items-start gap-3">
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                      <span className="text-[15px] leading-6 text-white/74">{point}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-[#050505] py-24 scroll-mt-28">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Pricing"
            title="Simple, honest pricing that maps to how teams actually buy."
            copy="Start with a flexible day rate, move into steady monthly capacity, or design a larger engagement around the build."
            centered
          />
          <div className="mt-14">
            <PricingGrid />
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#090909] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Customers"
            title="Teams that needed sharper execution."
            copy="Gitwork’s customer stories are less about glossy logos and more about getting difficult product work moving again."
            centered
          />
          <div className="mt-14">
            <StoryGrid />
          </div>
        </div>
      </section>

      <section id="faq" className="bg-[#050505] py-24 scroll-mt-28">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="FAQ"
            title="Questions teams usually ask before we start."
            copy="A quick overview of how Gitwork works as an agency and how Docs, Proof, and Code fit into that picture."
            centered
          />
          <div className="mt-14">
            <FaqList />
          </div>
        </div>
      </section>

      <FinalCta
        eyebrow="Start the Conversation"
        title="Tell Gitwork what you need to ship."
        copy="We’ll help work out the right product, team shape, and delivery model for the next stage of the build."
      />
    </MarketingChrome>
  );
}

export function MarketingProductsPage() {
  return (
    <MarketingChrome currentPath="/products">
      <section className="relative isolate overflow-hidden border-b border-white/8 py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Products"
            title="Gitwork products are built around real delivery friction."
            copy="Docs structures the brief, Proof sharpens the proposal, and Code improves hiring signal. They work independently, but they are stronger together."
          />
        </div>
      </section>

      <section className="bg-[#050505] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {products.map((product) => (
              <article key={product.slug} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{product.eyebrow}</p>
                <h2 className="mt-4 text-[34px] font-semibold tracking-[-0.05em] text-white">{product.name}</h2>
                <p className="mt-4 text-[17px] leading-7 text-white/58">{product.summary}</p>
                <div className="mt-7 space-y-3">
                  {product.outcomes.map((outcome) => (
                    <div key={outcome} className="flex items-start gap-3">
                      <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                      <span className="text-[15px] leading-6 text-white/76">{outcome}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  {renderLink({ label: "Learn More", href: `/products/${product.slug}` }, "app-button app-button-primary app-button-md")}
                  {renderLink(product.primaryCta, "app-button app-button-dark app-button-md")}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#090909] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="How They Fit"
            title="One product stack, mapped to three recurring jobs."
            copy="The Gitwork site now has the same kind of layered information architecture that WorkOS uses, but around Gitwork’s actual workflow instead of enterprise auth."
          />

          <div className="mt-14 grid gap-px bg-white/10 lg:grid-cols-3">
            {[
              {
                title: "Clarify demand",
                copy: "Use Docs when the problem is fuzzy and the brief is still forming.",
              },
              {
                title: "Shape the plan",
                copy: "Use Proof when the team needs stronger rationale around scope and delivery.",
              },
              {
                title: "Improve match quality",
                copy: "Use Code when hiring teams need signal before the shortlist call.",
              },
            ].map((item) => (
              <article key={item.title} className="bg-[#090909] px-6 py-8">
                <h3 className="text-[24px] font-semibold tracking-[-0.04em] text-white">{item.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/58">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FinalCta
        eyebrow="Need a Walkthrough?"
        title="We can help map the right Gitwork product to the next engagement."
        copy="If you already know the delivery problem, we can point you at the right tool quickly. If not, we can work it out together."
      />
    </MarketingChrome>
  );
}

export function MarketingProductDetailPage({ slug }: { slug: string }) {
  const product = getProduct(slug);

  if (!product) {
    return null;
  }

  const featuredStory =
    product.slug === "docs"
      ? customerStories[0]
      : product.slug === "proof"
        ? customerStories[2]
        : customerStories[3];

  return (
    <MarketingChrome currentPath="/products">
      <section className="relative isolate overflow-hidden border-b border-white/8 py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto grid max-w-[1280px] gap-10 px-6 sm:px-8 lg:grid-cols-[minmax(0,640px)_360px] lg:items-start">
          <div className="max-w-[640px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">{product.eyebrow}</p>
            <h1 className="mt-5 text-balance text-[52px] font-semibold leading-[0.98] tracking-[-0.065em] text-white sm:text-[68px]">
              {product.heroTitle}
            </h1>
            <p className="mt-6 text-pretty text-[20px] leading-8 text-white/60">{product.heroCopy}</p>
            <p className="mt-5 text-[15px] leading-7 text-white/44">{product.audience}</p>

            <div className="mt-9 flex flex-wrap gap-3">
              {renderLink(product.primaryCta, "app-button app-button-primary app-button-lg")}
              {renderLink(product.secondaryCta, "app-button app-button-dark app-button-lg")}
            </div>
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">At a glance</p>
            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/20 p-5">
              <p className="text-[34px] font-semibold tracking-[-0.05em] text-white">{product.metric.value}</p>
              <p className="mt-2 text-[15px] leading-6 text-white/56">{product.metric.label}</p>
            </div>
            <div className="mt-6 space-y-3">
              {product.quickHits.map((hit) => (
                <div key={hit} className="flex items-start gap-3 rounded-[10px] border border-white/8 bg-white/[0.03] px-4 py-4">
                  <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-cyan)]" aria-hidden="true" />
                  <span className="text-[15px] leading-6 text-white/74">{hit}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-[#050505] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow={product.name}
            title={`What ${product.name} is designed to improve.`}
            copy={product.summary}
          />
          <div className="mt-14">
            {product.slug === "codeclear" ? <CodeClearSiteDemo /> : <ProductFeatureGrid product={product} />}
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#090909] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Workflow"
            title="A simple operating rhythm."
            copy={`${product.name} exists to remove friction at a specific point in the Gitwork delivery process.`}
          />
          <div className="mt-14">
            <WorkflowSteps product={product} />
          </div>
        </div>
      </section>

      <section className="bg-[#050505] py-24">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Expected outcomes</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {product.outcomes.map((outcome) => (
                <div key={outcome} className="rounded-[22px] border border-white/10 bg-black/20 p-5">
                  <p className="text-[18px] font-semibold text-white">{outcome}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Customer perspective</p>
            <blockquote className="mt-4 text-[18px] leading-8 text-white/82">
              &ldquo;{featuredStory.quote}&rdquo;
            </blockquote>
            <p className="mt-5 text-[14px] font-medium text-white/48">
              {featuredStory.company} · {featuredStory.author}
            </p>
          </article>
        </div>
      </section>

      <FinalCta
        eyebrow={`${product.name} + Gitwork`}
        title={`See how ${product.name} fits into the next engagement.`}
        copy="The product is useful on its own, but it becomes more valuable when it sits inside the wider Gitwork delivery model."
      />
    </MarketingChrome>
  );
}

export function MarketingPricingPage() {
  return (
    <MarketingChrome currentPath="/pricing">
      <section className="relative isolate overflow-hidden border-b border-white/8 py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Pricing"
            title="Transparent pricing that maps to real delivery choices."
            copy="Gitwork pricing is designed around the three most common buying motions: flexible daily support, steady retained capacity, and larger custom delivery."
            centered
          />
        </div>
      </section>

      <section className="bg-[#050505] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <PricingGrid />
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#090909] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Included"
            title="Every pricing shape still sits on the same operating standard."
            copy="No matter which commercial model you choose, the Gitwork expectation is structured communication, clearer scope, and a better path into execution."
          />

          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {serviceOffers.map((offer) => (
              <article key={offer.title} className="rounded-[10px] border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-[24px] font-semibold tracking-[-0.04em] text-white">{offer.title}</h3>
                <p className="mt-4 text-[16px] leading-7 text-white/58">{offer.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#050505] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="FAQ"
            title="A few practical pricing questions."
            copy="If you are not sure which route fits, the quickest answer is usually to start with the outcome you need rather than the number of people."
            centered
          />
          <div className="mt-14">
            <FaqList />
          </div>
        </div>
      </section>

      <FinalCta
        eyebrow="Need a Quote?"
        title="We can recommend the right delivery and pricing shape together."
        copy="A short call is usually enough to work out whether the fit is a day rate, a monthly retainer, or a custom team."
      />
    </MarketingChrome>
  );
}

export function MarketingCustomersPage() {
  return (
    <MarketingChrome currentPath="/customers">
      <section className="relative isolate overflow-hidden border-b border-white/8 py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Customers"
            title="Gitwork helps teams move product work forward when the path is messy."
            copy="The common thread across customer stories is not industry. It is the need for sharper delivery structure, better technical capacity, and less friction between brief and build."
          />
        </div>
      </section>

      <StatsBand />

      <section className="bg-[#050505] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <StoryGrid />
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#090909] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Why it worked"
            title="The same delivery strengths show up again and again."
            copy="Clients come to Gitwork for different reasons, but the wins usually come from the same combination of technical depth, calmer process, and better framing upfront."
          />

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {[
              "Technical confidence when a product team needs stronger hands quickly.",
              "A UK-facing operating rhythm that keeps communication and decision-making clear.",
              "Structured brief and proposal work that reduces churn before engineering starts.",
            ].map((item) => (
              <article key={item} className="rounded-[10px] border border-white/10 bg-white/[0.03] p-6">
                <p className="text-[18px] leading-8 text-white/78">{item}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FinalCta
        eyebrow="Your Story Next"
        title="If the build is stuck, under-scoped, or hard to staff, Gitwork can help."
        copy="We work best when there is a real delivery problem to solve, not just a surface-level resource gap."
      />
    </MarketingChrome>
  );
}

export function MarketingCompanyPage() {
  return (
    <MarketingChrome currentPath="/company">
      <section className="relative isolate overflow-hidden border-b border-white/8 py-20">
        <HeroGrid />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Company"
            title="Gitwork is an agency with a product-minded operating system."
            copy="The goal is not to add more process. It is to make product work clearer at the moments where teams usually lose momentum: brief capture, proposal framing, staffing, and launch."
          />
        </div>
      </section>

      <section className="bg-[#050505] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {companyValues.map((value) => (
              <article key={value.title} className="border-t border-white/10 pt-5">
                <h2 className="text-[26px] font-semibold tracking-[-0.04em] text-white">{value.title}</h2>
                <p className="mt-4 text-[16px] leading-7 text-white/58">{value.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#090909] py-24">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <SectionIntro
            eyebrow="Delivery Rhythm"
            title="How Gitwork likes to run a project."
            copy="The structure is deliberately simple: frame the work properly, recommend the right shape, and then ship with a visible cadence."
          />
          <div className="mt-14">
            <div className="grid gap-5 lg:grid-cols-3">
              {deliveryTimeline.map((step, index) => (
                <article key={step.title} className="rounded-[26px] border border-white/10 bg-white/[0.03] p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/38">Phase {index + 1}</p>
                  <h3 className="mt-4 text-[26px] font-semibold tracking-[-0.04em] text-white">{step.title}</h3>
                  <p className="mt-4 text-[16px] leading-7 text-white/58">{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <StatsBand />

      <FinalCta
        eyebrow="Work with Gitwork"
        title="Bring us in when the next build needs a clearer system underneath it."
        copy="We are most useful when you need stronger delivery structure as much as stronger engineering capacity."
      />
    </MarketingChrome>
  );
}

export const productSlugs = products.map((product) => product.slug);
