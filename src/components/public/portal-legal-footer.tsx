import Link from "next/link";

/**
 * Legal footer for the client portal login — which is the public front door of this
 * host (`/` redirects here) and therefore the page a Pulse scan actually grades,
 * since the scanner follows redirects.
 *
 * Three jobs, in order of who they serve:
 *
 * 1. **Clients.** A login that asks for credentials should say who is asking and link
 *    its privacy policy and terms. That is the honest reason this exists.
 * 2. **UK disclosure.** A limited company must state its registered number on its
 *    websites (Companies Act 2006 / SI 2008/495). This is the only place on the
 *    public surface that does, now the marketing footer has gone.
 * 3. **The score cap.** `privacy_policy` and `terms_of_service` hard-cap the Pulse
 *    score at 65 when either fails, and they pass on a literal `href="/privacy"` /
 *    `href="/terms"` in the scanned HTML — closing quote included, so a trailing
 *    slash would not match. Do not "tidy" those two hrefs.
 *
 * Colours are explicit hex rather than design tokens on purpose: this page hard-locks
 * itself to the cream (`#EDE8E1`) via an inline style, but `data-theme` still follows
 * the visitor's OS preference, so token-based text would go near-white on cream and
 * become unreadable. `portal-login-form.tsx` is built the same way — match it, don't
 * "fix" it to tokens.
 */
/**
 * Organization + WebSite, emitted from the front door because that is the page a scan
 * reads. Accurate description of what this origin is and who runs it — nothing more.
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

export function PortalLegalFooter() {
  return (
    <footer className="mx-auto w-full max-w-[420px] px-6 pb-10 text-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <nav aria-label="Legal and support" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        <Link href="/privacy" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Privacy
        </Link>
        <Link href="/terms" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Terms
        </Link>
        <Link href="/cookies" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Cookies
        </Link>
        <Link href="/security" className="text-[12.5px] text-[#7c766a] transition-colors hover:text-[#403D38]">
          Security
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
