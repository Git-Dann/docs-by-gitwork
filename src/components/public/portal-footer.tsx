import Link from "next/link";

/**
 * Footer for the client portal login — which is the public front door of this host
 * (`/` redirects here) and, because a scan follows redirects, the page a Pulse scan
 * actually grades.
 *
 * What it is for: telling a client who is asking for their credentials, giving them a
 * way to get help, and carrying the UK registered-number disclosure a limited company
 * owes on its websites (Companies Act 2006 / SI 2008/495). Since the marketing footer
 * was removed this is the only public page stating the company and VAT numbers — don't
 * drop them.
 *
 * The legal links are RELATIVE (`/privacy`, `/terms`, …) but the pages do not live here
 * — `next.config.ts` 308s each one to its gitwork.co.uk equivalent. One set of policies
 * for the company, owned where the rest of the company's public content is owned. Foundry
 * hosted its own copies briefly; they were removed pending legal review, and deferring
 * beat both alternatives (publishing unreviewed text, or having none at all).
 *
 * ⚠️ Keep them relative. `privacy_policy` and `terms_of_service` hard-cap the Pulse score
 * at 65 (`score-breakdown.ts`) and they pass on a LITERAL `href="/privacy"` /
 * `href="/terms"` in THIS page's HTML — closing quote included, so a trailing slash does
 * not count, and an absolute `https://gitwork.co.uk/privacy` does not count either. The
 * relative href is what satisfies the check; the redirect is what serves the content.
 * Changing these to absolute URLs would silently re-cap the score at 65.
 *
 * Colours are explicit hex rather than design tokens on purpose: the login hard-locks
 * itself to the cream (`#EDE8E1`) via an inline style, but `data-theme` still follows
 * the visitor's OS, so token-based text would render near-white on cream and be
 * unreadable. `portal-login-form.tsx` is built the same way — match it, don't "fix" it.
 */

/**
 * Organization + WebSite, emitted from the front door because that is the page a scan
 * reads. An accurate description of what this origin is and who runs it, nothing more.
 *
 * Deliberately no Article/BlogPosting (this is not an article, and claiming so invites a
 * news-sitemap expectation) and no Review/AggregateRating/Product — there are no ratings
 * here and inventing them would be fabricated markup.
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
      email: "hello@gitwork.co.uk",
      address: { "@type": "PostalAddress", addressCountry: "GB" },
    },
    {
      "@type": "WebSite",
      "@id": "https://foundry.gitwork.co.uk/#website",
      url: "https://foundry.gitwork.co.uk",
      name: "Foundry by Gitwork",
      description:
        "The delivery platform Gitwork runs client work on — projects, documents, support and production-readiness scanning.",
      inLanguage: "en-GB",
      publisher: { "@id": "https://gitwork.co.uk/#organization" },
    },
  ],
};

export function PortalFooter() {
  return (
    <footer className="mx-auto w-full max-w-[440px] px-6 pb-10 text-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      <nav aria-label="Legal and support" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {/* Relative on purpose — see the note at the top of this file. These 308 out to
            gitwork.co.uk via next.config.ts; do not turn them into absolute URLs. */}
        <Link href="/privacy" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Privacy
        </Link>
        <Link href="/terms" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Terms
        </Link>
        <Link href="/cookies" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Cookies
        </Link>
        {/* Staff sign-in. The client portal and the team sign-in are separate front
            doors, and someone from Gitwork landing here needs the other one. */}
        <Link href="/login" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Team sign in
        </Link>
        <a
          href="https://gitwork.co.uk"
          className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]"
        >
          gitwork.co.uk
        </a>
      </nav>

      <p className="mt-3.5 text-[11px] leading-relaxed text-[#9b958a]">
        Foundry is the delivery platform operated by Gitwork Group Ltd. If you are a client, sign in
        with the email and password from your onboarding link. Trouble getting in?{" "}
        <a href="mailto:hello@gitwork.co.uk" className="underline hover:text-[#7c766a]">
          hello@gitwork.co.uk
        </a>
        .
      </p>

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-[#9b958a]">
        © {new Date().getFullYear()} Gitwork Group Ltd · Company No. 15756347 · VAT 468314867 ·
        Registered in England and Wales
      </p>
    </footer>
  );
}
