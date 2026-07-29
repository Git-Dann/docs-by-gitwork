import Link from "next/link";

/**
 * The internal product case for Provenance — the page you send to someone who has to decide
 * whether Gitwork invests in this.
 *
 * Written as a working document, not marketing collateral: numbered sections, real dated
 * regulation, a specimen of the actual artifact, an explicit competitive-gap table, the
 * business model, and — the part that makes the rest credible — what is NOT built and what
 * is still unresolved. That register is deliberate. This product's entire pitch is that it
 * refuses to claim what it did not check, so a pitch page that overstated its own maturity
 * would contradict the thing being sold.
 *
 * noindex (see layout) — it carries pricing and staging. Shareable by link.
 *
 * ⚠️ Every figure here is either sourced (footnoted below the claim) or labelled as a
 * specimen. Do not add an unsourced number to this page.
 */

// ── tokens (inline, matching the /pulse-overview precedent for standalone pages) ──
const INK = "#0F172A";
const SLATE = "#475569";
const STEEL = "#64748B";
const STONE = "#94A3B8";
const HAIR = "rgba(0,0,0,0.08)";
const HAIR_STRONG = "rgba(0,0,0,0.14)";
const CANVAS = "#FAFAF9";
const BRAND = "#1D4ED8";
const BRAND_DEEP = "#1E3A8A";
const SUCCESS = "#16A34A";
const WARNING = "#D97706";
const DANGER = "#DC2626";

const MAX = 940;

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "0 24px", marginBottom: 64 }}>
      <div style={{ maxWidth: MAX, margin: "0 auto" }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: STONE,
            paddingBottom: 10,
            borderBottom: `1px solid ${HAIR}`,
            marginBottom: 24,
          }}
        >
          {/* Template literal, not `{n} // {title}` — a bare `//` between two expressions in
              JSX children trips react/jsx-no-comment-textnodes. */}
          {`${n} // ${title}`}
        </div>
        {children}
      </div>
    </section>
  );
}

function P({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <p
      style={{
        fontSize: lead ? 17 : 15,
        lineHeight: 1.7,
        color: lead ? INK : SLATE,
        margin: "0 0 16px",
        maxWidth: "68ch",
      }}
    >
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mono" style={{ fontSize: 11.5, lineHeight: 1.7, color: STONE, margin: "0 0 18px", maxWidth: "78ch" }}>
      {children}
    </p>
  );
}

function Card({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${tone ?? HAIR}`,
        borderRadius: 10,
        background: "#fff",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

export default function ProvenanceOverviewPage() {
  return (
    <div
      className="provenance-overview"
      style={{ minHeight: "100vh", background: CANVAS, color: INK, fontFamily: "var(--font-inter, ui-sans-serif, system-ui, sans-serif)" }}
    >
      {/* ─── Masthead ─── */}
      <header style={{ borderBottom: `1px solid ${HAIR}`, background: "#fff", position: "sticky", top: 0, zIndex: 50 }}>
        <div
          style={{
            maxWidth: MAX,
            margin: "0 auto",
            padding: "0 24px",
            minHeight: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Gitwork</span>
            <span style={{ color: "#d1d5db" }}>/</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: BRAND }}>Provenance</span>
            <span
              className="mono"
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 4,
                background: "#FEF3C7",
                color: "#92400E",
                border: "1px solid #FDE68A",
                letterSpacing: "0.06em",
              }}
            >
              INTERNAL · PROPOSAL
            </span>
          </div>
          <Link
            href="/app/provenance"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: BRAND,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 16px",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Open the register →
          </Link>
        </div>
      </header>

      {/* ─── Definition + position ─── */}
      <section style={{ padding: "64px 24px 48px" }}>
        <div style={{ maxWidth: MAX, margin: "0 auto" }}>
          <p className="mono" style={{ fontSize: 11, letterSpacing: "1.2px", textTransform: "uppercase", color: STONE, margin: "0 0 18px" }}>
            provenance <span style={{ color: STEEL, textTransform: "none", letterSpacing: 0 }}>/ˈprɒvɪnəns/ — the documented history of an object: where it came from, who has vouched for it, and what remains unproven.</span>
          </p>
          <h1 style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 24px" }}>
            Everyone sells scans.
            <br />
            Nobody will put their name on the answer.
          </h1>
          <P lead>
            Pulse produces a report for the person who owns the software. Provenance produces a{" "}
            <strong>signed, expiring attestation for the person on the other side of the table</strong> — the
            client accepting handover, the insurer writing the policy, the acquirer, the procurement officer.
            Someone who did not build it, cannot read code, and is about to rely on it anyway.
          </P>
          <P>
            The artifact is called a <strong>Countermark</strong>: in numismatics, a stamp punched into a coin
            after minting to revalidate it under a new authority — used when coins travelled far from the mint
            and a merchant needed a quick way to approve money already in circulation. Software travels away
            from whoever made it in exactly the same way.
          </P>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
            <Link
              href="/app/provenance"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: INK,
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                padding: "12px 22px",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              See a specimen certificate →
            </Link>
            <span className="mono" style={{ fontSize: 11, color: STONE, alignSelf: "center", maxWidth: "42ch", lineHeight: 1.6 }}>
              Built and deployed. Six specimen marks are seeded in the register, every verdict produced by
              the real engine.
            </span>
          </div>
        </div>
      </section>

      {/* ─── 01 Why now ─── */}
      <Section n="01" title="WHY NOW — THREE DATES THAT ARE NOT OURS TO INVENT">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {[
            {
              date: "11 Sep 2026",
              law: "EU Cyber Resilience Act",
              what: "Manufacturers of any product with digital elements must report actively exploited vulnerabilities to ENISA within 24 hours. Full technical requirements follow on 11 Dec 2027.",
            },
            {
              date: "9 Dec 2026",
              law: "EU Product Liability Directive 2024/2853",
              what: "Software becomes a “product” under strict liability, and failing to ship security updates can itself be the defect. Member states must have transposed it by this date.",
            },
            {
              date: "Now",
              law: "Cyber insurance underwriting",
              what: "Carriers run external scans and automated control attestation through partner platforms. Documented controls earn 10–25% credits; missing ones add 25–50% or disqualify.",
            },
          ].map((d) => (
            <Card key={d.date}>
              <div className="mono" style={{ fontSize: 11, color: BRAND, letterSpacing: "0.06em", marginBottom: 6 }}>
                {d.date}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{d.law}</div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: SLATE }}>{d.what}</div>
            </Card>
          ))}
        </div>
        <Note>
          Sources: European Commission CRA summary · Directive (EU) 2024/2853 (transposition deadline 9 Dec
          2026) · Consilien, “Cyber insurance requirements 2026”. The five-year support expectation often
          attributed to 2024/2853 is in fact the CRA’s — the two are separate instruments and are kept
          separate here on purpose.
        </Note>
      </Section>

      {/* ─── 02 The gap ─── */}
      <Section n="02" title="THE GAP — WHAT THE BUYER CANNOT FIND OUT">
        <P>
          Software is now largely written by machines, and the trust rituals that used to stand behind it — a
          developer you know, a portfolio, a reference — have broken with nothing machine-native replacing
          them. The published numbers are not marginal:
        </P>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 20 }}>
          {[
            { fig: "98%", of: "of 1,072 vibe-coded production apps had security flaws; 16% critical", src: "Symbiotic Security" },
            { fig: "88%", of: "of 50 hand-audited apps had row-level security entirely disabled", src: "SecurityWeek" },
            { fig: "170+", of: "of 1,645 Lovable databases fully exposed; 18,697 records in one app", src: "VibeEval" },
            { fig: "+81%", of: "code duplication vs pre-AI, across 623M real code changes", src: "GitClear" },
          ].map((s) => (
            <Card key={s.fig}>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 40, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {s.fig}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: SLATE, marginTop: 8 }}>{s.of}</div>
              <div className="mono" style={{ fontSize: 10, color: STONE, marginTop: 8, letterSpacing: "0.05em" }}>
                {s.src}
              </div>
            </Card>
          ))}
        </div>
        <P>
          Meanwhile the person paying has no instrument. The best advice publicly on offer to a non-technical
          buyer is to ask the developer what edge cases the code does not handle. The professional
          alternative — technical due diligence — is a <strong>$8k–45k/year</strong> enterprise product sold
          to acquirers, not to the plumber who paid £8k for an app.
        </P>
      </Section>

      {/* ─── 03 The specimen ─── */}
      <Section n="03" title="THE ARTIFACT — AND THE SECTION THAT IS THE WHOLE ARGUMENT">
        <P>
          A Countermark names its standard and version, its issuer, the exact software, an expiry date, and a
          verdict per clause. It is frozen at issue and sealed, so re-running the scan cannot change a
          certificate already handed over. Below is a real specimen shape.
        </P>

        <div style={{ border: `1px solid ${HAIR_STRONG}`, borderRadius: 10, overflow: "hidden", background: "#fff", marginBottom: 24 }}>
          <div
            className="mono"
            style={{
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
              borderBottom: `1px solid ${HAIR}`,
              fontSize: 10,
              letterSpacing: "1.2px",
              color: STEEL,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>SPECIMEN // CERTIFICATE OF ATTESTATION</span>
            <span>SAS-1 v1.1.0</span>
          </div>
          <div style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.6px", textTransform: "uppercase", color: STONE }}>
              Subject of attestation
            </div>
            <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, letterSpacing: "-0.02em", margin: "4px 0 12px" }}>
              Fernway Bookings
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: DANGER }}>Not certified</span>
              <span
                className="mono"
                style={{ fontSize: 10, letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
              >
                VALID · 27d
              </span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: SLATE, marginBottom: 18 }}>
              3 critical clauses failed on confirmed evidence: C1, C2, C7.
            </div>

            {[
              { id: "C1", t: "No credentials shipped to the browser", v: "Failed", tone: DANGER, r: "A Stripe publishable key and an OpenAI key were found in the shipped JavaScript bundle." },
              { id: "C2", t: "Database authorisation is enforced", v: "Failed", tone: DANGER, r: "Row-level security disabled on 4 of 6 tables — an unauthenticated read returned 1,182 rows including customer email and phone." },
              { id: "C4", t: "Traffic is encrypted and the certificate is current", v: "Met", tone: SUCCESS, r: "Valid HTTPS, HTTP redirected, certificate not near expiry." },
              { id: "C5", t: "Baseline browser protections are set", v: "Partly met", tone: WARNING, r: "No Strict-Transport-Security header on the primary response." },
            ].map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: `1px solid ${HAIR}` }}>
                <span className="mono" style={{ fontSize: 10, color: c.tone, minWidth: 74, paddingTop: 3, letterSpacing: "0.05em" }}>
                  {c.id} · {c.v.toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{c.t}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: STEEL, marginTop: 2 }}>{c.r}</div>
                </div>
              </div>
            ))}
          </div>

          {/* The blind-spot band — rendered above the clause list on the real certificate. */}
          <div style={{ borderTop: `1px solid ${HAIR_STRONG}`, background: "#F8FAFC", padding: 20 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "1.2px", color: STEEL, marginBottom: 10 }}>
              02 // WHAT THIS MARK DOES NOT ESTABLISH
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: SLATE }}>
              “This examination inspects code, configuration and public responses. It does not sign in as a user,
              exercise payment flows, or attempt to breach authorisation between two accounts — so it cannot
              rule out a logic flaw that only appears once signed in.”
            </div>
          </div>
        </div>

        <P>
          <strong>That last band is the product.</strong> On the real certificate it sits{" "}
          <em>above</em> the clause list, not in fine print, and it is derived rather than written — unmeasured
          clauses, weak-evidence-only clauses, and the runtime boundary are computed from the evidence and
          sealed into the digest, so they cannot be quietly removed after issue.
        </P>
        <P>
          It is also why there are <strong>four</strong> grades and not three. A critical clause that could not
          be established returns <strong>INCOMPLETE</strong>, never a pass and never a fail. “We could not
          check this” and “this is broken” are different facts with different fixes, and every free scanner on
          the market conflates them.
        </P>
        <Note>
          This is the bug Foundry already found and fixed in itself: a Pulse scan once reported ~28 confident
          “missing X” findings having read nothing at all, because an unauthenticated repository listing came
          back empty and every check read that emptiness as absence (CLAUDE.md §35). Provenance is that lesson
          pointed at a third-party reader.
        </Note>
      </Section>

      {/* ─── 04 Why nobody else ─── */}
      <Section n="04" title="WHY NOBODY ELSE DOES THIS">
        <div style={{ overflowX: "auto", marginBottom: 18 }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                {["What exists", "What it proves", "What it does not"].map((h) => (
                  <th
                    key={h}
                    className="mono"
                    style={{
                      textAlign: "left",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: STONE,
                      padding: "0 12px 8px 0",
                      borderBottom: `1px solid ${HAIR_STRONG}`,
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["SOC 2 / ISO 27001", "Your organisation follows a process", "Nothing about the artifact you shipped"],
                ["Cyber Essentials", "Five baseline controls, self-assessed", "Nothing about the software itself"],
                ["Software escrow", "Someone holds a copy of the code", "Nothing about whether it is any good"],
                ["Security scanners", "A list of findings, for you", "Nothing a counterparty can rely on or verify"],
                ["Technical due diligence", "A deep human read, once", "£8k–45k, and stale the week after"],
              ].map(([a, b, c]) => (
                <tr key={a}>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${HAIR}`, fontWeight: 500, verticalAlign: "top" }}>{a}</td>
                  <td style={{ padding: "12px 12px 12px 0", borderBottom: `1px solid ${HAIR}`, color: SLATE, verticalAlign: "top" }}>{b}</td>
                  <td style={{ padding: "12px 0", borderBottom: `1px solid ${HAIR}`, color: SLATE, verticalAlign: "top" }}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>
          There is nothing on the market that says: <em>this software, at this version, was examined against
          a published standard by someone accountable — and here is precisely what could not be established.</em>{" "}
          That is the gap.
        </P>
      </Section>

      {/* ─── 05 Why ours ─── */}
      <Section n="05" title="WHY THIS ONE IS OURS">
        <P>
          Not a moonshot. Every expensive part already exists and is already paid for:
        </P>
        <ul style={{ margin: "0 0 18px", padding: 0, listStyle: "none", maxWidth: "72ch" }}>
          {[
            ["Pulse", "819 deterministic checks with confidence, applicability and skip semantics. The measurement engine is done."],
            ["The epistemics", "Three separate incidents taught this codebase not to convert “we couldn’t look” into “it isn’t there”. That discipline is the hard part of certification and it is already load-bearing."],
            ["Docs", "Tokenised public share, e-sign, view tracking. The handover ceremony is built."],
            ["Foreman / Curator", "Scheduled agents with frozen run reports and reversible actions. Continuous re-examination is the same spine."],
            ["The agency itself", "Gitwork hands over client software constantly, so it dogfoods on day one — and every handover becomes better evidenced than a competing agency’s."],
          ].map(([k, v]) => (
            <li key={k} style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: `1px solid ${HAIR}` }}>
              <span className="mono" style={{ fontSize: 11, color: BRAND, minWidth: 130, paddingTop: 2 }}>
                {k}
              </span>
              <span style={{ fontSize: 13.5, lineHeight: 1.7, color: SLATE }}>{v}</span>
            </li>
          ))}
        </ul>
        <P>
          The commercial precedent is domestic and proven: <strong>Cyber Essentials</strong> passed its
          200,000th certificate with <strong>69% going to micro and small organisations</strong>, growth driven
          almost entirely by being mandated in contracts, delivered through{" "}
          <strong>~290 licensed assessment bodies</strong>. That licensed-issuer network is the white-label
          channel, already proven at national scale. The market it disrupts — software escrow — is{" "}
          <strong>$8.5B in 2026</strong>, sold enterprise-only and statically.
        </P>
      </Section>

      {/* ─── 06 Model ─── */}
      <Section n="06" title="HOW IT MAKES MONEY">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {[
            { h: "Issue", s: "Per attestation", b: "At the moment of consequence: handover, final invoice, insurance renewal, acquisition, procurement." },
            { h: "Maintain", s: "Subscription", b: "Marks expire on purpose — 90 days certified, 30 conditional. Continuous re-examination keeps them alive. This works because the mark lapses, not despite it." },
            { h: "Issue rights", s: "White label", b: "Agencies, MSPs and AI-builder platforms strike marks under their own brand. The Cyber Essentials model." },
          ].map((c) => (
            <Card key={c.h}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{c.h}</div>
              <div className="mono" style={{ fontSize: 10, color: BRAND, letterSpacing: "0.06em", margin: "4px 0 10px" }}>
                {c.s.toUpperCase()}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: SLATE }}>{c.b}</div>
            </Card>
          ))}
        </div>
        <Note>
          Price points are deliberately not stated on this page. They need the five customer conversations in
          §07 first — anchoring against Cyber Essentials (~£300–500/yr self-assessed) and technical due
          diligence ($8k–45k/yr) brackets it, but a number invented before those calls is a number nobody
          should plan against.
        </Note>
      </Section>

      {/* ─── 07 State + ask ─── */}
      <Section n="07" title="WHERE IT ACTUALLY IS, AND WHAT IT NEEDS">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 22 }}>
          <Card tone="#BBF7D0">
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: SUCCESS, marginBottom: 10 }}>
              BUILT AND DEPLOYED
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: SLATE }}>
              <li>SAS-1, a versioned 14-clause standard</li>
              <li>The grading engine, with 79 tests</li>
              <li>Digest + HMAC seal, and honest UNSEALED degrade</li>
              <li>Expiry, revocation, supersession</li>
              <li>The public certificate page</li>
              <li>The internal register, in Settings → Labs</li>
              <li>Six specimen marks, every verdict from the real engine</li>
            </ul>
          </Card>
          <Card tone="#FDE68A">
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: WARNING, marginBottom: 10 }}>
              NOT BUILT — AND HONESTLY, NEEDED
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: SLATE }}>
              <li>
                <strong>Commit pinning.</strong> A mark currently names a repository, not a version, because
                Pulse does not record the SHA it read. Written as null rather than guessed.
              </li>
              <li>
                <strong>Continuous re-examination.</strong> The subscription. Needs a job on the existing cron spine.
              </li>
              <li>
                <strong>Licensed issuers.</strong> The white-label tier: issuer records, per-issuer branding, a
                public issuer directory.
              </li>
              <li>
                <strong>A citable standard page.</strong> SAS-1 needs a stable public URL before a contract can
                reference it.
              </li>
              <li>
                <strong>Remediation.</strong> Provenance reports; it does not fix. Whether Gitwork sells the fix as a
                tier is the biggest open commercial question.
              </li>
            </ul>
          </Card>
        </div>

        <div style={{ border: `1px solid ${HAIR_STRONG}`, borderRadius: 10, padding: 20, background: "#fff" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "1.2px", color: STEEL, marginBottom: 12 }}>
            UNRESOLVED — QUESTIONS I CANNOT ANSWER ALONE
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.9, color: SLATE }}>
            <li>
              <strong>Who signs it, and what does signing expose Gitwork to?</strong> The certificate says it
              is not a warranty and transfers no liability — that wording needs a legal opinion, not my
              assurance.
            </li>
            <li>
              <strong>Does a buyer pay for this, or only a seller?</strong> The pitch assumes the counterparty
              values it; the money may only ever come from the supplier wanting to look credible.
            </li>
            <li>
              <strong>Is “not certified” sellable?</strong> An agency that hands clients a failing mark on its
              own work has a conversation to have. That may be a feature or a blocker.
            </li>
          </ul>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: INK, margin: "16px 0 0", fontWeight: 500 }}>
            The ask is small and testable: five customer conversations and one legal opinion. If fewer than
            three produce “yes, and here is what I would pay”, this stays an upsell on the existing handover
            rather than a product.
          </p>
        </div>
      </Section>

      {/* ─── CTA — every marketing page closes on this band (DESIGN.md) ─── */}
      <section style={{ padding: "72px 24px", background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DEEP} 100%)` }}>
        <div style={{ maxWidth: 660, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(30px, 5vw, 46px)", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 16px" }}>
            Read a real one.
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.78)", lineHeight: 1.65, margin: "0 0 32px" }}>
            Six specimen marks are in the register — certified, conditional, not certified, incomplete, one
            revoked and one superseded. Every verdict was produced by the engine, not written by hand.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <Link
              href="/app/provenance"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#fff",
                color: BRAND_DEEP,
                fontWeight: 700,
                fontSize: 15,
                padding: "14px 30px",
                borderRadius: 6,
                textDecoration: "none",
              }}
            >
              Open the register →
            </Link>
            <Link
              href="/app/settings"
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: "rgba(255,255,255,0.75)",
                fontWeight: 600,
                fontSize: 14,
                padding: "14px 20px",
                textDecoration: "none",
              }}
            >
              Settings → Labs
            </Link>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${HAIR}`, padding: "26px 24px", background: "#fff" }}>
        <div
          style={{
            maxWidth: MAX,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span className="mono" style={{ fontSize: 11, color: STONE }}>
            © {new Date().getFullYear()} GITWORK GROUP LTD · INTERNAL PROPOSAL · NOT FOR CIRCULATION
          </span>
          <span className="mono" style={{ fontSize: 11, color: STONE }}>
            PROVENANCE · SAS-1 v1.1.0
          </span>
        </div>
      </footer>
    </div>
  );
}
