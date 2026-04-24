import Image from "next/image";
import Link from "next/link";

const navLinks = [
  { label: "Products", href: "/products" },
  { label: "Pricing", href: "/pricing" },
  { label: "Case Studies", href: "/customers" },
  { label: "About", href: "/company" },
];

const footerColumns = [
  {
    title: "Services",
    links: [
      { label: "Remote Developers", href: "/products", external: false },
      { label: "Custom Development", href: "/products", external: false },
      { label: "Dedicated Teams", href: "/products", external: false },
      { label: "Project Delivery", href: "/products", external: false },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/company", external: false },
      { label: "Case Studies", href: "/customers", external: false },
      { label: "Pricing", href: "/pricing", external: false },
      { label: "Book a Call", href: "https://calendly.com/gitworkgroup/30min", external: true },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Docs", href: "/products/docs", external: false },
      { label: "Proof", href: "/products/proof", external: false },
      { label: "CodeClear", href: "/products/codeclear", external: false },
      { label: "Open Platform", href: "/app/proposals", external: false },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "hello@gitwork.co.uk", href: "mailto:hello@gitwork.co.uk", external: true },
      { label: "+44 (0) 7903 076159", href: "tel:+447903076159", external: true },
      { label: "gitwork.co.uk", href: "https://www.gitwork.co.uk", external: true },
    ],
  },
];

export function MarketingLayout({
  children,
  currentPath = "/",
}: {
  children: React.ReactNode;
  currentPath?: string;
}) {
  function isActive(href: string) {
    if (href === "/") return currentPath === "/";
    return currentPath === href || currentPath.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0a0a0a] text-white [color-scheme:dark]">
      <a
        href="#main-content"
        className="absolute left-4 top-4 z-[100] -translate-y-20 rounded-full border border-white/14 bg-[#111] px-4 py-2 text-sm text-white transition focus:translate-y-0 focus:outline-none"
      >
        Skip to content
      </a>

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#0a0a0a]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-6">
            <Link href="/" aria-label="Gitwork home" className="inline-flex shrink-0 items-center">
              <Image
                src="/gitwork-logo-white.svg"
                alt="Gitwork"
                width={120}
                height={22}
                className="h-[22px] w-auto"
                priority
              />
            </Link>
            <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-[14px] transition-colors hover:text-white focus:outline-none ${
                    isActive(link.href) ? "text-white" : "text-white/54"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Primary mobile" className="flex w-full gap-5 overflow-x-auto pb-0.5 md:hidden">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shrink-0 text-sm transition-colors hover:text-white ${
                    isActive(link.href) ? "text-white" : "text-white/54"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex shrink-0 items-center gap-3">
              <Link href="/app/proposals" className="app-button app-button-dark app-button-md">
                Open Platform
              </Link>
              <a
                href="https://calendly.com/gitworkgroup/30min"
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-primary app-button-md"
              >
                Book a Call
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main id="main-content">{children}</main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.07] bg-[#0a0a0a] py-16">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
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
              </div>
            </div>
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="text-[13px] font-semibold text-white">{col.title}</h3>
                <div className="mt-4 space-y-3">
                  {col.links.map((link) =>
                    link.external ? (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[13px] text-white/44 transition-colors hover:text-white/72"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="block text-[13px] text-white/44 transition-colors hover:text-white/72"
                      >
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-white/[0.07] pt-8 text-[13px] text-white/32 sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Gitwork Group Ltd. All rights reserved.</p>
            <p>Company No. 15756347 · VAT 468314867 · Registered in England and Wales</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function HeroGrid() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.13),transparent_55%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px]" />
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{children}</p>
  );
}

export function CheckIcon({ className = "text-blue-400" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
