import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy — Foundry by Gitwork",
  description:
    "What personal data the Foundry platform holds, why we hold it, where it is stored, who processes it on our behalf, how long we keep it, and your rights under UK GDPR.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="This explains what personal data Foundry holds, why, where it lives, and what you can ask us to do with it. It is written to be read rather than to cover us, so if something here is unclear please ask."
      updated="27 July 2026"
    >
      <LegalSection heading="Who is responsible">
        <p>
          Gitwork Group Ltd (&ldquo;Gitwork&rdquo;, &ldquo;we&rdquo;), a company registered in
          England and Wales, is the data controller for the personal data described below.
          We are responsible for it under the UK General Data Protection Regulation and the
          Data Protection Act 2018.
        </p>
        <p>
          Where we handle data inside a client&apos;s own systems as part of delivering their
          project, we act as a processor on their instructions, and that project&apos;s
          contract and any data processing agreement govern it rather than this policy.
        </p>
      </LegalSection>

      <LegalSection heading="What we hold, and why">
        <p>
          Foundry is an internal delivery platform. It holds only what is needed to run
          client work:
        </p>
        <ul>
          <li>
            <strong>Client contacts</strong> — name, work email, phone, company, and the
            billing and address details supplied during onboarding. Needed to deliver the
            engagement and to invoice for it.
          </li>
          <li>
            <strong>Bank details</strong> — where a client provides them during onboarding,
            for paying invoices. These are encrypted at rest with AES-256-GCM under a key
            held outside the database, and are only decrypted when an authorised member of
            our team views them.
          </li>
          <li>
            <strong>Project and task records</strong> — the work itself: tasks, owners, due
            dates, timelines, notes and comments written by our team.
          </li>
          <li>
            <strong>Documents</strong> — proposals, contracts and reports, plus, for shared
            links, a record of when a document was opened, which sections were viewed and for
            how long, the approximate location and the browser and device used. This tells us
            whether a proposal has actually been read; it is not used to profile anyone.
          </li>
          <li>
            <strong>Support conversations</strong> — messages reaching a client&apos;s support
            channels that we operate on their behalf, including the sender&apos;s name, email
            and message content.
          </li>
          <li>
            <strong>Meeting notes</strong> — where a call generated notes in the organiser&apos;s
            Google Drive, we read those notes and store a summary, decisions and actions
            against the client record. We do not record calls and no bot joins them.
          </li>
          <li>
            <strong>Candidate and team data</strong> — for developers applying to or working
            with us: name, email, public GitHub activity, assessment results, placements and
            rates. For our own staff: leave, expenses and receipts.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Our lawful bases">
        <ul>
          <li>
            <strong>Contract</strong> — for almost everything above: we cannot deliver an
            engagement, invoice for it, or support it without this data.
          </li>
          <li>
            <strong>Legitimate interests</strong> — for document-engagement records, and for
            assessing a developer&apos;s public GitHub activity when they have applied to work
            with us. We have considered the privacy impact of both and limited what is kept.
          </li>
          <li>
            <strong>Legal obligation</strong> — for records we must retain for tax,
            accounting and employment purposes.
          </li>
          <li>
            <strong>Consent</strong> — where you have given it, for example by submitting an
            email address to unlock a Pulse scan report. You can withdraw it at any time.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Where it is stored">
        <p>
          Foundry runs on a virtual private server in the United Kingdom, provided by
          Fasthosts, with its database on the same machine. Backups are held in the UK.
        </p>
        <p>
          Some of the processors below are outside the UK, principally in the United States.
          Where that is the case, transfers rely on the UK International Data Transfer
          Addendum or the UK extension to the EU-US Data Privacy Framework.
        </p>
      </LegalSection>

      <LegalSection heading="Who processes it for us">
        <p>
          We keep this list short on purpose. We do not sell personal data, and we do not
          share it for advertising.
        </p>
        <ul>
          <li>
            <strong>Fasthosts</strong> (UK) — hosting for the application and database.
          </li>
          <li>
            <strong>Google</strong> — Workspace, and, for team members who connect their
            account, Calendar, Gmail and Drive so that meetings, email and meeting notes
            appear against the right client.
          </li>
          <li>
            <strong>Anthropic</strong> — the AI model used for drafting, summarising and
            analysis. Where a workspace is configured to use them instead, OpenAI or Google
            may be used for the same purpose.
          </li>
          <li>
            <strong>Slack</strong> — where a client has a shared channel with us.
          </li>
          <li>
            <strong>Resend</strong> — transactional email, such as a notification that a
            document has been signed.
          </li>
          <li>
            <strong>Cloudflare</strong> — bot protection on the public Pulse scanner.
          </li>
        </ul>
        <p>
          On AI specifically: content is sent to the model to produce a draft or a summary
          and the result is stored against the relevant record. We use these services under
          their commercial terms, which do not permit our data to be used to train their
          models.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Client and project records are kept for the life of the engagement and then for as
          long as we may need them for legal, tax or contractual reasons — generally six
          years for anything with a financial dimension. Support conversations and
          document-engagement records are kept while the client relationship continues.
          Expense receipts are reduced to a small thumbnail once reviewed. Candidate
          assessment data is deleted on request, and otherwise once it is no longer relevant
          to a live opportunity.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can ask us to give you a copy of your data, correct it, delete it, restrict
          what we do with it, or object to it being processed. You can also ask for it in a
          portable form. To do any of that, email{" "}
          <a href="mailto:hello@gitwork.co.uk">hello@gitwork.co.uk</a> — we will respond
          within one month.
        </p>
        <p>
          If you are unhappy with how we have handled your data, you can complain to the
          Information Commissioner&apos;s Office at{" "}
          <a href="https://ico.org.uk">ico.org.uk</a>. We would rather you told us first so
          we can put it right.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and security">
        <p>
          Foundry sets only strictly-necessary cookies — see the{" "}
          <Link href="/cookies">cookie policy</Link>. For how the platform is protected and
          how to report a vulnerability, see our{" "}
          <Link href="/security">security page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
