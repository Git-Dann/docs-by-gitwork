import Link from "next/link";
import Image from "next/image";

/**
 * Chrome for the handful of genuinely public, indexable pages on this host — the
 * landing page and the legal set. Deliberately small: gitwork.co.uk is the marketing
 * site, so this is a front door and a legal footer, not a marketing template.
 *
 * The structure is load-bearing rather than decorative. A skip link as the first
 * focusable element, real <header>/<nav>/<main>/<footer> landmarks and
 * `<main id="main-content">` are what let a screen-reader user skip the nav and jump
 * straight to content — and they are also what several Pulse accessibility and
 * semantic-HTML checks look for. Keep them if you restyle this.
 */
export function PublicShell({
  children,
  activePath,
}: {
  children: React.ReactNode;
  activePath?: string;
}) {
  const nav = [
    { href: "/pulse-overview", label: "Pulse" },
    { href: "/api-docs", label: "API" },
    { href: "/legal", label: "Legal" },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--surface-canvas)] text-[var(--text-1)]">
      {/*
        First focusable element on the page. Visually hidden until focused, then it
        parks itself top-left — the standard pattern, and the only way a keyboard user
        gets past the nav without tabbing through every link.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[6px] focus:border focus:border-[var(--border-1)] focus:bg-[var(--surface-0)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--text-1)]"
      >
        Skip to content
      </a>

      <header className="border-b border-[var(--border-2)] bg-[var(--surface-0)]">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Foundry by Gitwork — home">
            {/* dark:brightness-0 dark:invert flips the dark wordmark to white on the
                dark canvas — same treatment app-shell.tsx gives it. */}
            <Image
              src="/foundry-logo.svg"
              alt="Foundry by Gitwork"
              width={245}
              height={64}
              priority
              className="h-[26px] w-auto dark:brightness-0 dark:invert"
            />
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activePath === item.href ? "page" : undefined}
                className={`rounded-[6px] px-2.5 py-1.5 text-[13.5px] transition-colors sm:px-3 ${
                  activePath === item.href
                    ? "bg-[var(--surface-1)] text-[var(--text-1)]"
                    : "text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/portal/login"
              className="app-button app-button-primary app-button-sm ml-1 whitespace-nowrap"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="mt-auto border-t border-[var(--border-2)] bg-[var(--surface-0)]">
        <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8">
          <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
                Foundry by Gitwork
              </p>
              <p className="mt-2.5 max-w-[38ch] text-[13.5px] leading-relaxed text-[var(--text-3)]">
                The delivery platform Gitwork runs its client work on. Operated by Gitwork,
                a UK design and development agency.
              </p>
              <a
                href="https://gitwork.co.uk"
                className="mt-3 inline-block text-[13.5px] font-medium text-[var(--brand-600)] hover:underline"
              >
                gitwork.co.uk ↗
              </a>
            </div>

            <div>
              <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
                Platform
              </h2>
              <ul className="mt-2.5 space-y-1.5 text-[13.5px]">
                <li>
                  <Link href="/pulse-overview" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Pulse scanner
                  </Link>
                </li>
                <li>
                  <Link href="/api-docs" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    API reference
                  </Link>
                </li>
                <li>
                  <Link href="/portal/login" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Client portal
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Team sign in
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
                Legal
              </h2>
              <ul className="mt-2.5 space-y-1.5 text-[13.5px]">
                <li>
                  <Link href="/privacy" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Privacy policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Terms of service
                  </Link>
                </li>
                <li>
                  <Link href="/cookies" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Cookies
                  </Link>
                </li>
                <li>
                  <Link href="/security" className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                    Security
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/*
            The company and VAT numbers are not decoration: a UK limited company must
            disclose its registered number on its websites (Companies Act 2006 /
            SI 2008/495), and the VAT number belongs anywhere prices could appear. They
            previously lived in the marketing footer that was removed with the agency
            pages — this is now the only place they are stated, so don't drop them.
          */}
          <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-3)] pt-5">
            <p className="font-mono text-[11px] leading-relaxed text-[var(--text-4)]">
              © {new Date().getFullYear()} Gitwork Group Ltd · Company No. 15756347 · VAT
              468314867 · Registered in England and Wales
            </p>
            <a
              href="mailto:security@gitwork.co.uk"
              className="font-mono text-[11px] text-[var(--text-4)] hover:text-[var(--text-3)]"
            >
              security@gitwork.co.uk
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
