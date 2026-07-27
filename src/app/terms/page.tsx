import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Terms of service — Foundry by Gitwork",
  description:
    "The terms on which the Foundry platform and its shared client links may be used, operated by Gitwork Group Ltd.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      summary="These terms cover use of the Foundry platform and the links we share from it. They are not the commercial terms of an engagement — those live in the contract you signed with us, which takes precedence over anything on this page."
      updated="27 July 2026"
    >
      <LegalSection heading="What this covers">
        <p>
          Foundry is operated by Gitwork Group Ltd for its own delivery work. It is not sold
          or licensed as a product. These terms apply to three groups of people: our own
          team, clients using the portal or a link we have shared, and anyone using the
          public Pulse scanner.
        </p>
        <p>
          If you have a signed proposal, statement of work, master services agreement or
          service level agreement with us, that document governs the work and prevails over
          these terms wherever the two differ.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts and access">
        <p>
          Access to the platform requires an account we have issued. Accounts are personal —
          please do not share credentials or let someone else use yours. Tell us promptly if
          you think an account or a shared link has been compromised, and we will revoke it.
        </p>
        <p>
          We may suspend access where we reasonably believe it is being misused, where we are
          required to, or where an engagement has ended.
        </p>
      </LegalSection>

      <LegalSection heading="Shared links">
        <p>
          Proposals, contracts, reports, project timelines and wikis are shared as links
          containing a token. Anyone holding the link can open the document, so please treat
          one like the document itself and only forward it to people who should see it. We
          can revoke a link at any time, and will if you ask.
        </p>
        <p>
          Where a document can be accepted, declined or signed in the page, doing so is
          intended to be binding on the party named in it. If you receive a document you were
          not expecting, do not sign it — tell us.
        </p>
      </LegalSection>

      <LegalSection heading="The Pulse scanner">
        <p>
          The public scanner at <Link href="/pulse-overview">/pulse-overview</Link> runs
          automated checks against a URL you provide and returns a report. Two conditions
          apply. Only scan a site you own or have permission to test — by submitting a URL
          you confirm that you do. And the report is automated analysis offered as-is: it is
          a useful signal, not an audit, not a guarantee that a site is secure or compliant,
          and not a substitute for professional advice. Use is rate-limited and we may
          decline any scan.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>Please do not:</p>
        <ul>
          <li>
            attempt to access data, accounts or documents that are not yours, or probe the
            platform&apos;s security other than as described on our{" "}
            <Link href="/security">security page</Link>;
          </li>
          <li>
            scan a third party&apos;s site without their permission, or use the scanner to
            place load on infrastructure you do not control;
          </li>
          <li>scrape, resell or redistribute the platform or its content;</li>
          <li>upload malware, or anything unlawful or infringing.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          The platform, its design and its underlying code belong to Gitwork. Content you
          provide to us remains yours. Ownership of work we produce for you is dealt with in
          your engagement contract — as a rule, deliverables transfer to you on payment.
        </p>
      </LegalSection>

      <LegalSection heading="Availability and liability">
        <p>
          We aim to keep Foundry available and back it up, but it is provided without any
          warranty of uninterrupted or error-free operation unless a service level agreement
          says otherwise. Where an SLA is in place, its commitments and remedies apply.
        </p>
        <p>
          Nothing here limits liability for death or personal injury caused by negligence,
          for fraud, or for anything else that cannot be limited under English law. Subject
          to that, our liability arising from use of the platform itself is limited to the
          amount you have paid us under the relevant engagement in the preceding twelve
          months, and we are not liable for indirect or consequential loss, or for lost
          profits or data.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and governing law">
        <p>
          We may update these terms; the date at the top shows when they were last reviewed,
          and material changes will be communicated to affected clients directly. These
          terms are governed by the law of England and Wales, and the courts of England and
          Wales have exclusive jurisdiction.
        </p>
        <p>
          Questions about these terms: <a href="mailto:hello@gitwork.co.uk">hello@gitwork.co.uk</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
