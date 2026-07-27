import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Legal — Foundry by Gitwork",
  description:
    "Privacy policy, terms of service, cookie policy and security practices for the Foundry platform, operated by Gitwork Group Ltd.",
  robots: { index: true, follow: true },
};

const DOCS = [
  {
    href: "/privacy",
    title: "Privacy policy",
    blurb:
      "What personal data Foundry holds, why, where it is stored, who processes it on our behalf, and how long we keep it.",
  },
  {
    href: "/terms",
    title: "Terms of service",
    blurb:
      "The terms on which the platform and its shared client links may be used. Commercial terms for a specific engagement sit in that engagement's own contract.",
  },
  {
    href: "/cookies",
    title: "Cookie policy",
    blurb:
      "Every cookie Foundry sets, what it does, and why there is no consent banner.",
  },
  {
    href: "/security",
    title: "Security",
    blurb:
      "How the platform is protected, how client documents are shared, and how to report a vulnerability.",
  },
];

export default function LegalHubPage() {
  return (
    <LegalPage
      title="Legal"
      summary="Foundry is operated by Gitwork Group Ltd, a company registered in England and Wales. These four documents cover the platform. Commercial terms for a specific piece of work live in that engagement's own signed contract, which takes precedence over anything here."
      updated="27 July 2026"
    >
      <LegalSection heading="Documents">
        <div className="not-prose grid gap-3 sm:grid-cols-2">
          {DOCS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="app-card block p-4 transition-colors hover:border-[var(--border-1)]"
            >
              <h3 className="text-[15px] font-semibold text-[var(--text-1)]">{d.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-3)]">{d.blurb}</p>
            </Link>
          ))}
        </div>
      </LegalSection>

      <LegalSection heading="Who we are">
        <p>
          Gitwork Group Ltd is a design and development agency based in the United Kingdom.
          Foundry is our own platform, used to run client delivery — it is not sold as a
          product. Our main site is{" "}
          <a href="https://gitwork.co.uk">gitwork.co.uk</a>.
        </p>
        <p>
          For data protection purposes, Gitwork Group Ltd is the controller of the personal
          data described in the <Link href="/privacy">privacy policy</Link>. Where we process
          data on a client&apos;s behalf as part of delivering their project, we do so as a
          processor under that project&apos;s contract.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <ul>
          <li>
            General and data protection enquiries: <a href="mailto:hello@gitwork.co.uk">hello@gitwork.co.uk</a>
          </li>
          <li>
            Security and vulnerability reports: <a href="mailto:security@gitwork.co.uk">security@gitwork.co.uk</a>{" "}
            (see also <a href="/.well-known/security.txt">security.txt</a>)
          </li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
