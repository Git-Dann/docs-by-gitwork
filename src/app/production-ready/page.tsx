import type { Metadata } from "next";
import { ADVERTISED_CHECK_COUNT_LABEL } from "@/server/checks-registry";
import { BookingLink } from "./booking-link";
import { PublicScanner } from "@/components/pulse/public-scanner";

/**
 * PUBLIC sales page — the second entry point to the free scanner, alongside the
 * embeddable widget. gitwork.co.uk links here; the widget is for dropping the tool
 * *into* a page. Same tool, two doors.
 *
 * Deliberately a SALES page, not a description. The structure is the conventional
 * one because it works: outcome-led hero with the tool immediately usable, the
 * stakes, the offer, the differentiator, how it works, objections, close.
 *
 * ⚠️ NOTHING ON THIS PAGE IS INVENTED. No testimonials, no customer logos, no
 * "trusted by" counts, no made-up metrics — every number is either derived from the
 * registry (ADVERTISED_CHECK_COUNT_LABEL) or measured, and the measured ones are
 * stated as measurements. A sales page for a product whose entire pitch is "we tell
 * you the truth, including what we could not establish" cannot itself embellish.
 *
 * Brand: the counted Gitwork palette from DESIGN.md — and only its TWO text
 * colours. A third would be inventing.
 */

const PAPER = "#F2EDE4";
const PANEL = "#FFFFFF";
const INK = "#1A1A1E";
const MUTED = "#6B6B6B";
const LINE = "#EAE5DC";
const ACCENT = "#6B52FF";
const DISPLAY = "var(--font-fraunces), 'Fraunces', Georgia, serif";
const SANS = "var(--font-sans), Inter, -apple-system, system-ui, sans-serif";
const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

export const metadata: Metadata = {
  title: "Is your app actually production-ready? · Gitwork",
  description:
    "Run a free check across security, performance, SEO, accessibility and infrastructure. "
    + "Every finding comes with its evidence — and we tell you what we could not establish. "
    + "No signup, no email.",
  alternates: { canonical: "/production-ready" },
  openGraph: {
    title: "Is your app actually production-ready?",
    description: "A free scan of your live site. Every finding with its evidence. No signup.",
    type: "website",
  },
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: ACCENT, margin: "0 0 14px" }}>
      {children}
    </p>
  );
}

function Section({
  children,
  ground = PAPER,
  bordered = false,
}: { children: React.ReactNode; ground?: string; bordered?: boolean }) {
  return (
    <section style={{ background: ground, borderTop: bordered ? `1px solid ${LINE}` : undefined, padding: "clamp(56px, 9vw, 96px) 24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(26px, 4.2vw, 40px)", fontWeight: 700, color: INK, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 16px", textWrap: "balance" }}>
      {children}
    </h2>
  );
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: "0 0 32px", maxWidth: 620 }}>{children}</p>;
}

/**
 * The one place this page needs real CSS: inline styles cannot express a media
 * query, and the hero genuinely wants two columns on a wide screen — copy and the
 * working tool side by side, which is both the stronger layout and the
 * conventional one for a lead-gen page.
 *
 * Single column below 900px so the scanner is never squeezed: it is responsive, but a
 * ~380px column crowds its URL field and its finding rows.
 */
const HERO_CSS = `
  .pr-hero { display: grid; gap: clamp(32px, 5vw, 56px); grid-template-columns: minmax(0, 1fr); align-items: start; }
  @media (min-width: 900px) {
    .pr-hero { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 48px; align-items: center; }
  }
`;

export default function ProductionReadyPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: SANS, minHeight: "100vh" }}>
      <style>{HERO_CSS}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky", top: 0, zIndex: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          padding: "16px clamp(16px, 4vw, 32px)",
          background: "rgba(242,237,228,0.88)", backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <a
          href="https://gitwork.co.uk"
          style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 23, letterSpacing: "-0.02em", color: INK, textDecoration: "none", display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
        >
          Gitwork<span style={{ color: ACCENT }}>.</span>
        </a>
        <a
          href="#scan"
          style={{ fontSize: 14, fontWeight: 700, padding: "10px 20px", borderRadius: 999, background: INK, color: PAPER, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          Run a free check
        </a>
      </header>

      {/* ── Hero: the promise, then the tool. No scrolling to reach the value. ── */}
      <Section>
        <div className="pr-hero">
          <div>
            <Eyebrow>Free · no signup</Eyebrow>
            {/* 60px was sized for a full-width hero; in the two-column layout the
                left track is ~490px at 1280, which broke "production-ready?" across
                the hyphen. Smaller max, and the phrase itself never splits. */}
            <h1 style={{ fontFamily: DISPLAY, fontSize: "clamp(32px, 3.6vw, 46px)", fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.03em", margin: "0 0 20px", textWrap: "balance" }}>
              Your app works on your machine.<br />
              Is it{" "}
              <span style={{ color: ACCENT, whiteSpace: "nowrap" }}>production&#8209;ready?</span>
            </h1>
            <p style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, margin: "0 0 12px", maxWidth: 640 }}>
              Paste a URL. In seconds you get the security headers you are missing, the legal pages
              you have not published, the performance and accessibility problems your users are
              already hitting — each one with the evidence we found it by.
            </p>
            <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.6, margin: "0 0 8px", maxWidth: 640 }}>
              And the part nobody else shows you: <strong style={{ color: INK, fontWeight: 600 }}>what we
              could not establish</strong>, and why.
            </p>
          </div>

          {/* The tool itself, rendered inline — not iframed.
              This page is on the same origin as the widget, so framing it bought
              nothing and cost a visible seam: a second "Pulse / Free site health
              check" header above the page's own headline, a second "Powered by
              Gitwork Foundry" credit above the page's own footer, and postMessage
              resizing that snapped as results arrived. /embed/pulse still exists and
              is unchanged — it is for THIRD-PARTY sites, where all three of those are
              exactly what you want. Same component, `variant="page"`. */}
          <div
            id="scan"
            style={{
              scrollMarginTop: 88,
              background: PANEL,
              border: `1px solid ${LINE}`,
              borderRadius: 18,
              padding: "clamp(18px, 3.5vw, 28px)",
              boxShadow: "0 24px 48px -28px rgba(26,26,30,0.18)",
            }}
          >
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: ACCENT, margin: "0 0 14px" }}>
              Free check
            </p>
            <PublicScanner
              variant="page"
              defaultSource="production-ready"
              checkCountLabel={ADVERTISED_CHECK_COUNT_LABEL}
            />
          </div>
        </div>
      </Section>

      {/* ── Stakes ──────────────────────────────────────────────────────────── */}
      <Section ground={PANEL} bordered>
        <Eyebrow>Why it matters</Eyebrow>
        <H2>Nothing about &ldquo;it works&rdquo; tells you it is ready.</H2>
        <Lead>
          Shipped software fails in ways local development never shows you. These are the categories
          that catch teams out — and every one of them is checkable from the outside, before a user
          finds it for you.
        </Lead>
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
          {[
            ["Security you cannot see", "Missing headers, cookies without protection, a policy that permits what it should forbid. Invisible until it is exploited."],
            ["Compliance you forgot", "No privacy policy, no terms. A blocker for app stores, enterprise buyers and, in the UK and EU, the law."],
            ["Performance on real devices", "It is fast on your laptop on fibre. Your users are on a phone on mobile data."],
            ["Accessibility as a legal risk", "Not a nice-to-have. In several of your markets it is a requirement with teeth."],
            ["Infrastructure gaps", "No monitoring, no error tracking, nothing to tell you it broke except a customer email."],
            ["The AI-built long tail", "Code assembled fast carries patterns that work in a demo and fall over in production."],
          ].map(([title, body]) => (
            <div key={title} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "20px 22px", background: PAPER }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: INK }}>{title}</h3>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The offer ───────────────────────────────────────────────────────── */}
      <Section>
        <Eyebrow>What you get</Eyebrow>
        <H2>Every measurement, free. The interpretation is the conversation.</H2>
        <Lead>
          Running the checks costs us compute and nothing else, so we do not hold them back. What we
          charge for is the part that takes judgement — what your results mean for your launch, and
          the order to fix them in.
        </Lead>
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: "26px 26px 28px", background: PANEL }}>
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: ACCENT, margin: "0 0 4px" }}>Free, right now</p>
            <p style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, margin: "0 0 18px", color: INK }}>The full read</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 11 }}>
              {[
                `A score, from ${ADVERTISED_CHECK_COUNT_LABEL} automated checks`,
                "Every finding that matters, ranked worst-first",
                "The evidence behind each one — what we actually observed",
                "What we could not establish, and why",
                "A link you can send to your team",
              ].map((t) => (
                <li key={t} style={{ display: "flex", gap: 10, fontSize: 15, color: MUTED, lineHeight: 1.55 }}>
                  <span aria-hidden="true" style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 13.5, color: MUTED, margin: "20px 0 0", paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
              No account. No email. Nothing to cancel.
            </p>
          </div>

          <div style={{ border: `1px solid ${INK}`, borderRadius: 14, padding: "26px 26px 28px", background: INK, color: PAPER }}>
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "#B9AFFF", margin: "0 0 4px" }}>On request</p>
            <p style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, margin: "0 0 18px", color: PAPER }}>The in-depth review</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 11 }}>
              {[
                "What these findings actually mean for your launch",
                "The order to fix them in, and why that order",
                "An implementation brief your developers — or your AI — can work straight from",
                "The full advisory tail, not just the priorities",
                "A human from Gitwork who has shipped this before",
              ].map((t) => (
                <li key={t} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.55, color: "rgba(242,237,228,0.82)" }}>
                  <span aria-hidden="true" style={{ color: "#B9AFFF", fontWeight: 700, flexShrink: 0 }}>→</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <a
              href="#scan"
              style={{ display: "inline-block", marginTop: 22, background: PAPER, color: INK, fontSize: 14.5, fontWeight: 700, padding: "12px 22px", borderRadius: 10, textDecoration: "none" }}
            >
              Start with the free check
            </a>
          </div>
        </div>
      </Section>

      {/* ── The differentiator. This is the whole pitch. ─────────────────────── */}
      <Section ground={PANEL} bordered>
        <div style={{ display: "grid", gap: "clamp(28px, 4vw, 56px)", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", alignItems: "start" }}>
          <div>
            <Eyebrow>What makes this different</Eyebrow>
            <H2>A scanner that admits what it does not know.</H2>
            <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: "0 0 16px" }}>
              Most tools go quiet about the checks they could not run. Silence reads as a pass, so you
              come away believing you were measured on everything.
            </p>
            <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              We list them instead. If your content is rendered by JavaScript, or a check needs your
              repository, or your site sets no cookies for us to inspect — we say so, and we leave it
              out of your score rather than counting it either way.
            </p>
          </div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, background: PAPER, padding: "22px 24px" }}>
            <p style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.3, textTransform: "uppercase", color: MUTED, margin: "0 0 14px" }}>
              From a real report
            </p>
            {[
              ["Multi-factor authentication", "Not assessed — no authentication system was detected on this site."],
              ["iOS build configuration", "Needs a connected repository; this was a URL-only scan."],
              ["Secure cookie attributes", "Not assessed — this response set no cookies, so there are no attributes to check."],
            ].map(([label, reason]) => (
              <div key={label} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${LINE}` }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 3px", color: INK }}>{label}</p>
                <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: 0 }}>{reason}</p>
              </div>
            ))}
            <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.5 }}>
              An unanswered question is not a clean bill of health.
            </p>
          </div>
        </div>
      </Section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <Section>
        <Eyebrow>How it works</Eyebrow>
        <H2>Three steps. The first one is the only one you have to do.</H2>
        <div style={{ display: "grid", gap: 22, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", marginTop: 8 }}>
          {[
            ["01", "Paste your URL", "No account, no email, no card. We read your site the way a browser and a crawler would."],
            ["02", "Read your report", "A score, the findings that matter with their evidence, and an honest list of what we could not reach."],
            ["03", "Decide what it is worth", "Fix it yourself from the evidence — genuinely fine by us. Or ask us what it means and we will tell you."],
          ].map(([n, title, body]) => (
            <div key={n}>
              <p style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ACCENT, letterSpacing: 1.4, margin: "0 0 10px" }}>{n}</p>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px", color: INK }}>{title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Objections ──────────────────────────────────────────────────────── */}
      <Section ground={PANEL} bordered>
        <Eyebrow>Before you ask</Eyebrow>
        <H2>The questions everyone has.</H2>
        <div style={{ display: "grid", gap: 22, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
          {[
            ["What is the catch?", "There isn't one, and it is worth explaining why. Running these checks is compute we have already paid for — no AI, no per-scan cost. Giving the results away costs us almost nothing and occasionally starts a conversation. That is the whole model."],
            ["Do you need access to my code?", "No. This reads only what is already public: your responses, headers, HTML and DNS. We do not sign in, touch payments, or run your JavaScript. Connect a repository and we can check considerably more — but that is your choice, not a condition."],
            ["Is it safe to run on production?", "Yes. It is read-only and behaves like an ordinary visitor. It never submits a form, never writes anything, and never attempts to authenticate."],
            ["Will you spam me?", "You do not give us an address to spam. The free report needs no email at all. If you ask for the in-depth review, that is you starting a conversation on purpose."],
            ["What if I disagree with a finding?", "Tell us. Every finding ships with the evidence we based it on precisely so you can check our working, and we would rather fix a wrong check than defend it."],
            ["Who is behind it?", "Gitwork, a UK design-and-build studio. This is the same check we run on a codebase before we agree to take it on, which is why it is blunt rather than flattering."],
          ].map(([q, a]) => (
            <div key={q}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: INK }}>{q}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Close ───────────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ background: INK, borderRadius: 18, padding: "clamp(34px, 6vw, 60px) clamp(24px, 5vw, 56px)", textAlign: "center" }}>
          <h2 style={{ fontFamily: DISPLAY, fontSize: "clamp(26px, 4.4vw, 40px)", fontWeight: 700, color: PAPER, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 14px", textWrap: "balance" }}>
            Find out before your users do.
          </h2>
          <p style={{ fontSize: 17, color: "rgba(242,237,228,0.72)", lineHeight: 1.6, margin: "0 auto 28px", maxWidth: 520 }}>
            One URL. A few seconds. The honest version of where your app stands.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#scan" style={{ background: PAPER, color: INK, fontSize: 15.5, fontWeight: 700, padding: "15px 32px", borderRadius: 12, textDecoration: "none" }}>
              Run the free check
            </a>
            <BookingLink style={{ border: "1px solid rgba(242,237,228,0.28)", color: PAPER, fontSize: 15.5, fontWeight: 600, padding: "15px 28px", borderRadius: 12, textDecoration: "none" }}>
              Talk to us first
            </BookingLink>
          </div>
        </div>
      </Section>

      {/* ── Footer: Gitwork owns it, Foundry powers it. ──────────────────────── */}
      <footer style={{ borderTop: `1px solid ${LINE}`, padding: "36px 24px 56px", background: PAPER }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
            © {new Date().getUTCFullYear()}{" "}
            <a href="https://gitwork.co.uk" style={{ color: INK, fontWeight: 600, textDecoration: "none" }}>Gitwork</a>
            {" "}· A UK design-and-build studio.
          </p>
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED, margin: 0 }}>
            Powered by Foundry
          </p>
        </div>
        <div style={{ maxWidth: 1080, margin: "22px auto 0", display: "flex", gap: 18, flexWrap: "wrap" }}>
          <a href="/privacy" style={{ fontSize: 13.5, color: MUTED, textDecoration: "none" }}>Privacy</a>
          <a href="/terms" style={{ fontSize: 13.5, color: MUTED, textDecoration: "none" }}>Terms</a>
          <a href="https://gitwork.co.uk" style={{ fontSize: 13.5, color: MUTED, textDecoration: "none" }}>gitwork.co.uk</a>
        </div>
      </footer>
    </div>
  );
}
