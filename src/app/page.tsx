import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/public-shell";

/**
 * Public landing page for the Foundry platform.
 *
 * This route used to `redirect("/portal/login")`, which meant the host's only
 * indexable surface was a noindex login screen with 72 words on it. Clients still
 * reach the portal in one click — "Client sign in" is the primary action — but the
 * origin now describes itself.
 *
 * Deliberately NOT agency marketing. Services, pricing and case studies belong to
 * gitwork.co.uk, which links here; this page covers the platform only.
 */

const TITLE = "Foundry by Gitwork — the delivery platform behind Gitwork's client work";
const DESCRIPTION =
  "Foundry is the platform Gitwork runs client delivery on: production-readiness scanning, proposals and contracts, project timelines, developer assessment and client support in one place.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Foundry by Gitwork",
    locale: "en_GB",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * One JSON-LD @graph rather than several blocks. Organization + WebSite + a
 * BreadcrumbList is an accurate description of what this page is.
 *
 * Deliberately absent: Article/BlogPosting (this is not an article, and claiming so
 * invites a news-sitemap expectation), and Review/AggregateRating/Product — there are
 * no ratings here and inventing them would be fabricated markup.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://gitwork.co.uk/#organization",
      name: "Gitwork",
      legalName: "Gitwork Group Ltd",
      url: "https://gitwork.co.uk",
      logo: "https://foundry.gitwork.co.uk/foundry-icon.png",
      description:
        "Gitwork is a UK design and development agency. Foundry is the platform it runs client delivery on.",
      email: "security@gitwork.co.uk",
      address: { "@type": "PostalAddress", addressCountry: "GB" },
    },
    {
      "@type": "WebSite",
      "@id": "https://foundry.gitwork.co.uk/#website",
      url: "https://foundry.gitwork.co.uk",
      name: "Foundry by Gitwork",
      description: DESCRIPTION,
      inLanguage: "en-GB",
      publisher: { "@id": "https://gitwork.co.uk/#organization" },
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://foundry.gitwork.co.uk/#breadcrumbs",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Foundry", item: "https://foundry.gitwork.co.uk" },
        { "@type": "ListItem", position: 2, name: "Pulse", item: "https://foundry.gitwork.co.uk/pulse-overview" },
        { "@type": "ListItem", position: 3, name: "API reference", item: "https://foundry.gitwork.co.uk/api-docs" },
      ],
    },
  ],
};

const MODULES = [
  {
    name: "Pulse",
    blurb:
      "Runs around 600 automated checks against a live web app — security headers, SEO and answer-engine readiness, infrastructure, accessibility, performance, legal pages — and returns a scored, shareable report. It also opens fix pull requests and keeps monitoring after launch.",
    href: "/pulse-overview",
    linkLabel: "Try the free scanner",
  },
  {
    name: "Docs",
    blurb:
      "Proposals, SLAs, SOWs, MSAs and change orders, built from a section registry with live costing and timelines. Every document gets a tokenised link, so we can see when a client opened it, which sections they read and how long for, and they can accept or decline in the page.",
  },
  {
    name: "Portal",
    blurb:
      "The record for each client: contacts, platform credentials, design system, wiki, and a task board with feature blocks on a Gantt timeline. Clients can be given a read-only timeline link so they can see progress without asking for an update.",
  },
  {
    name: "Care",
    blurb:
      "Support triage across every channel a client actually uses — email, Slack, webhooks — with tickets, workflow rules, an audit trail and monthly reports that pull real usage figures from the client's own analytics API.",
  },
  {
    name: "Code",
    blurb:
      "Developer assessment and placement. Analyses real GitHub history rather than a CV, scores it against a published model, and tracks placements and rates through to who is on which client this month.",
  },
  {
    name: "Backstage",
    blurb:
      "The internal side: leave and allowances, expenses with receipt capture, team availability and staffing conflict alerts across the next month.",
  },
];

export default function LandingPage() {
  return (
    <PublicShell activePath="/">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      {/* ── Hero ── */}
      <section className="border-b border-[var(--border-2)] bg-[var(--surface-0)]">
        <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
            01 // The platform
          </p>
          <h1
            className="mt-4 max-w-[24ch] text-[38px] leading-[1.08] tracking-[-0.03em] text-[var(--text-1)] sm:text-[52px]"
            style={{ fontFamily: 'var(--font-display), "Times New Roman", Georgia, serif' }}
          >
            The platform behind Gitwork&apos;s client work.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[16.5px] leading-relaxed text-[var(--text-3)]">
            Foundry is where Gitwork runs delivery. It holds the client record, the proposal
            and the contract, the project timeline, the support inbox and the
            production-readiness checks — in one place, so nothing depends on someone
            remembering to copy it across. This host is the platform itself; if you are
            looking for the agency, its services or its pricing, that is{" "}
            <a
              href="https://gitwork.co.uk"
              className="font-medium text-[var(--brand-600)] hover:underline"
            >
              gitwork.co.uk
            </a>
            .
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/portal/login" className="app-button app-button-primary app-button-md">
              Client sign in
            </Link>
            <Link href="/login" className="app-button app-button-secondary app-button-md">
              Gitwork team sign in
            </Link>
          </div>
          <p className="mt-4 font-mono text-[11px] text-[var(--text-4)]">
            Clients: use the email and password from your onboarding link.
          </p>
        </div>
      </section>

      {/* ── Modules ── */}
      <section className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
          02 // What it covers
        </p>
        <h2
          className="mt-3 text-[28px] leading-[1.15] tracking-[-0.02em] text-[var(--text-1)] sm:text-[34px]"
          style={{ fontFamily: 'var(--font-display), "Times New Roman", Georgia, serif' }}
        >
          Six modules, one record of the work.
        </h2>

        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {MODULES.map((m) => (
            <article key={m.name} className="app-card p-5">
              <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--text-1)]">
                {m.name}
              </h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-3)]">{m.blurb}</p>
              {m.href ? (
                <Link
                  href={m.href}
                  className="mt-3 inline-block text-[13.5px] font-medium text-[var(--brand-600)] hover:underline"
                >
                  {m.linkLabel} →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* ── Access ── */}
      <section className="border-t border-[var(--border-2)] bg-[var(--surface-0)]">
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-4)]">
            03 // Access
          </p>
          <h2
            className="mt-3 text-[24px] leading-[1.2] tracking-[-0.02em] text-[var(--text-1)] sm:text-[28px]"
            style={{ fontFamily: 'var(--font-display), "Times New Roman", Georgia, serif' }}
          >
            Most of Foundry is not public.
          </h2>
          <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-3)]">
            The platform is for the Gitwork team and requires a session. Client
            deliverables — proposals, contracts, project timelines, wikis — are shared as
            per-recipient links where the token in the URL is the credential, so there is
            no shared password and a link can be revoked without affecting anyone else.
            Two things here are genuinely open: the{" "}
            <Link href="/pulse-overview" className="font-medium text-[var(--brand-600)] hover:underline">
              Pulse scanner
            </Link>
            , which you can run against any URL, and the{" "}
            <Link href="/api-docs" className="font-medium text-[var(--brand-600)] hover:underline">
              API reference
            </Link>
            .
          </p>
          <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-3)]">
            If you are a security researcher, our disclosure policy and contact address are
            in{" "}
            <a
              href="/.well-known/security.txt"
              className="font-medium text-[var(--brand-600)] hover:underline"
            >
              security.txt
            </a>
            , and there is more detail on our{" "}
            <Link href="/security" className="font-medium text-[var(--brand-600)] hover:underline">
              security page
            </Link>
            . How we handle data is set out in our{" "}
            <Link href="/privacy" className="font-medium text-[var(--brand-600)] hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
