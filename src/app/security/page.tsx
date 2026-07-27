import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Security — Foundry by Gitwork",
  description:
    "How the Foundry platform is protected, how client documents are shared securely, and how to report a vulnerability to Gitwork.",
  robots: { index: true, follow: true },
};

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      summary="Foundry holds client contracts, project records and support conversations, so it is worth being direct about how it is protected — and about how to tell us if you find something wrong."
      updated="27 July 2026"
    >
      <LegalSection heading="Reporting a vulnerability">
        <p>
          Email <a href="mailto:security@gitwork.co.uk">security@gitwork.co.uk</a>. Machine-readable
          details are at <a href="/.well-known/security.txt">/.well-known/security.txt</a>.
        </p>
        <p>
          Please include enough detail to reproduce the issue, and give us a reasonable window
          to fix it before publishing. We will acknowledge your report, keep you updated, and
          credit you if you would like us to. We will not pursue you for a good-faith report.
        </p>
        <p>
          Two requests: do not run automated scanners or load tests against the live platform,
          and do not access, modify or retain anyone else&apos;s data — if you find you can
          reach something you should not, stop and tell us.
        </p>
      </LegalSection>

      <LegalSection heading="How access works">
        <p>
          Team access is by Google sign-in, and what each person can see is scoped by role and
          by module rather than being all-or-nothing. Sensitive figures — client costs,
          developer rates — are gated separately and are withheld from the server response
          entirely for anyone without that permission, not merely hidden in the interface.
          Developers can be scoped to their own assigned clients.
        </p>
        <p>
          Client access to the portal is by email and password issued during onboarding.
          Sessions are versioned, so we can invalidate every existing session at once if we
          need to.
        </p>
      </LegalSection>

      <LegalSection heading="Shared documents">
        <p>
          Proposals, contracts, reports, timelines and wikis are shared as links containing a
          long random token, rather than by giving people accounts. That means no shared
          password, and a link can be revoked individually without affecting anything else.
          The trade-off is that the link is the credential: anyone holding it can open the
          document, so it should be treated as the document itself. Shared pages are excluded
          from search engine indexing.
        </p>
      </LegalSection>

      <LegalSection heading="Data protection">
        <p>
          The platform runs on a UK server with its database on the same private network, not
          exposed to the internet. Traffic is HTTPS-only and HSTS is set, including for
          subdomains. Client bank details supplied at onboarding are encrypted at rest with
          AES-256-GCM under a key held outside the database. Backups are taken on a schedule
          and kept in the UK.
        </p>
        <p>
          The application sets a baseline of security response headers — content type
          sniffing off, framing restricted to our own origin, a strict referrer policy,
          unused browser features denied, and cross-origin isolation on the opener and
          resource policies. The one deliberate exception is the embeddable Pulse widget,
          which is allow-listed to be framed by gitwork.co.uk so the scanner can run on our
          own marketing site.
        </p>
      </LegalSection>

      <LegalSection heading="The public scanner">
        <p>
          Anyone can run <Link href="/pulse-overview">Pulse</Link> against a URL, so it is
          hardened accordingly: requests are validated to reject private, loopback,
          link-local and cloud metadata addresses before any fetch is made, and scans are
          rate-limited per address and per target host. Anonymous scan results are stored
          separately from client data and expire automatically.
        </p>
        <p>
          Only scan sites you own or have permission to test — see the{" "}
          <Link href="/terms">terms of service</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="What we do not claim">
        <p>
          We are not certified to ISO 27001 or SOC 2, and we would rather say so than imply
          otherwise. If your procurement process needs a security questionnaire completed or a
          data processing agreement in place, email{" "}
          <a href="mailto:security@gitwork.co.uk">security@gitwork.co.uk</a> and we will work
          through it with you.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
