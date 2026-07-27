import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Cookie policy — Foundry by Gitwork",
  description:
    "Every cookie the Foundry platform sets, what it is for, and why there is no cookie consent banner: we set only strictly-necessary cookies and no analytics or advertising cookies.",
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie policy"
      summary="Short version: Foundry sets only the cookies it needs to keep you signed in. There is no analytics, advertising or tracking cookie anywhere on this host, which is why you have not been asked to accept anything."
      updated="27 July 2026"
    >
      <LegalSection heading="Why there is no consent banner">
        <p>
          Under the UK GDPR and the Privacy and Electronic Communications Regulations,
          consent is required for cookies that are not strictly necessary to provide a
          service you have asked for. Every cookie we set is strictly necessary — they exist
          to authenticate you and to protect the sign-in form — so no consent is required and
          a banner would be theatre rather than compliance.
        </p>
        <p>
          If that ever changes, this page will change with it and we will ask properly, with a
          genuine option to refuse.
        </p>
      </LegalSection>

      <LegalSection heading="What we set">
        <ul>
          <li>
            <strong>Session cookies</strong> (names beginning <code>__Secure-authjs</code> or{" "}
            <code>authjs</code>) — keep you signed in after authenticating, and hold the
            page you were heading to. Removed when you sign out or when the session expires.
          </li>
          <li>
            <strong>Cross-site request forgery token</strong> (a name beginning{" "}
            <code>__Host-authjs</code>) — ensures a sign-in request came from our own form
            and not from another site acting as you.
          </li>
          <li>
            <strong><code>gitwork_api_session</code></strong> — set once you are signed in so
            the browser can call our own API. It is HttpOnly, so page scripts cannot read it.
          </li>
          <li>
            <strong><code>devsignal_access</code></strong> — set only if you enter the shared
            password on our developer application page, so you are not asked again on every
            step.
          </li>
        </ul>
        <p>
          All of them are restricted to this site, and in production all are sent only over
          HTTPS. None is used to build a profile of you, and none is shared with a third party
          for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="Preferences stored on your device">
        <p>
          A few settings are kept in your browser&apos;s local storage rather than in a
          cookie — your light or dark theme choice, whether a panel is expanded, and which
          client you last had open. These never leave your device and are not sent to us. You
          can clear them at any time by clearing site data for this host.
        </p>
      </LegalSection>

      <LegalSection heading="Third parties">
        <p>
          The public Pulse scanner uses Cloudflare Turnstile to tell a person from a bot.
          Turnstile is designed not to require cookies for its core operation and we do not
          use it to track visitors. We run no analytics, advertising, heat-mapping or
          session-recording scripts on this host.
        </p>
        <p>
          Where a client document is shared as a link, we do record that it was opened and
          which sections were read — but that is stored against the document on our own
          server, not in a cookie on your device. It is described in the{" "}
          <Link href="/privacy">privacy policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Controlling cookies">
        <p>
          You can block or delete cookies in your browser settings. Because ours are the
          cookies that keep you signed in, blocking them means you will not be able to use
          the platform or open a shared document — nothing else will break.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
