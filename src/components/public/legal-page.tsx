import Link from "next/link";
import { PublicShell } from "./public-shell";

/**
 * Shared shell for the legal / policy set (/legal, /privacy, /terms, /cookies,
 * /security). One wrapper so the five pages can't drift in typography or in the
 * "last reviewed" treatment.
 *
 * Prose is capped near 70 characters for readability rather than filling the
 * container — these are documents, not dashboards.
 */
export function LegalPage({
  title,
  summary,
  updated,
  children,
}: {
  title: string;
  summary: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell activePath="/legal">
      <article className="mx-auto max-w-[760px] px-5 py-14 sm:px-8 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-7">
          <ol className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]">
            <li>
              <Link href="/" className="hover:text-[var(--text-2)]">
                Foundry
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/legal" className="hover:text-[var(--text-2)]">
                Legal
              </Link>
            </li>
          </ol>
        </nav>

        <h1
          className="text-[32px] leading-[1.14] tracking-[-0.025em] text-[var(--text-1)] sm:text-[40px]"
          style={{ fontFamily: 'var(--font-display), "Times New Roman", Georgia, serif' }}
        >
          {title}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-[var(--text-3)]">{summary}</p>
        <p className="mt-5 border-t border-[var(--border-3)] pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-4)]">
          Last reviewed {updated} · Gitwork Group Ltd
        </p>

        {/* List styling lives here rather than on every <ul> in the five pages. */}
        <div className="mt-9 [&_a]:font-medium [&_a]:text-[var(--brand-600)] [&_a:hover]:underline [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>

        <p className="mt-12 border-t border-[var(--border-2)] pt-5 text-[14px] text-[var(--text-3)]">
          Questions about any of this? Email{" "}
          <a
            href="mailto:hello@gitwork.co.uk"
            className="font-medium text-[var(--brand-600)] hover:underline"
          >
            hello@gitwork.co.uk
          </a>
          , or{" "}
          <a
            href="mailto:security@gitwork.co.uk"
            className="font-medium text-[var(--brand-600)] hover:underline"
          >
            security@gitwork.co.uk
          </a>{" "}
          for anything security-related.
        </p>
      </article>
    </PublicShell>
  );
}

/** Section heading + body, so every policy page has the same rhythm. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.015em] text-[var(--text-1)]">
        {heading}
      </h2>
      <div className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-[var(--text-3)]">
        {children}
      </div>
    </section>
  );
}
