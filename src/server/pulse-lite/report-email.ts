/**
 * The Pulse report a visitor receives by email after unlocking it on the public scanner.
 *
 * Styled to the Gitwork design system (paper ground, white cards with a hairline,
 * Fraunces headings, Inter body, JetBrains Mono labels, one purple thing per section)
 * and its copy rules: UK spelling, no em dashes, "at no charge" rather than "free", the
 * delivery line word for word, and no invented numbers. Every figure here comes from
 * the scan.
 *
 * Email clients ignore most CSS, so this is table layout with inline styles and web-safe
 * font fallbacks (Georgia, Helvetica, Menlo). Pure: no database, no I/O, so it can be
 * tested and previewed without sending anything.
 */

export interface ReportEmailFinding {
  label: string;
  category: string;
  status: string;
  detail: string;
  tier: "P1" | "P2";
}

export interface ReportEmailInput {
  /** The visitor's name as they typed it. Null on leads from before the form asked. */
  name: string | null;
  targetUrl: string;
  score: number | null;
  pass: number;
  warn: number;
  fail: number;
  findings: ReportEmailFinding[];
  advisoryCount: number;
  notEstablishedCount: number;
  /** The full report as a PDF (public, token-gated). The one link in the email. */
  reportPdfUrl: string;
  bookingUrl: string;
  /** Absolute URL of the ink wordmark (public/email/gitwork-wordmark-ink.png). */
  logoUrl: string;
}

// Gitwork tokens (design system: Gitwork, tokens.json).
const INK = "#0C0C18";
const PAPER = "#F2EDE4";
const SIGNAL = "#6B52FF";
const TEXT = "#1A1A1E";
const MUTED = "#6B6B6B";
const WHITE = "#FFFFFF";
const RULE = "#DCD8D1"; // paper-rule (12% ink) flattened onto paper: email clients drop rgba borders
const SIGNAL_TINT = "#E8E3FF"; // signal-tint (12% signal) flattened onto white

const DISPLAY = "Fraunces, Georgia, 'Times New Roman', serif";
const BODY = "Inter, -apple-system, Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

// The delivery line, word for word, as the brand book requires in anything public.
const DELIVERY_LINE =
  "Global build capacity, UK quality control. Every release is reviewed and deployed by a UK based senior engineer.";

/** Check evidence is written by many hands; Gitwork's copy never carries an em dash. */
function houseStyle(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function label(text: string, color = MUTED): string {
  return `<span style="font-family:${MONO};font-size:10px;line-height:1.2;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${color};">${text}</span>`;
}

function pill(text: string, strong: boolean): string {
  const bg = strong ? INK : SIGNAL_TINT;
  const fg = strong ? WHITE : SIGNAL;
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background-color:${bg};color:${fg};font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.1em;">${text}</span>`;
}

function findingCard(f: ReportEmailFinding, index: number): string {
  const result = f.status === "FAIL" ? "FAILING" : "WARNING";
  return `
  <tr><td style="padding:0 0 12px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="background-color:${WHITE};border:1px solid ${RULE};border-radius:14px;">
      <tr><td style="padding:20px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;width:34px;font-family:${DISPLAY};font-style:italic;font-size:22px;line-height:1.2;color:${SIGNAL};">${index + 1}.</td>
          <td style="vertical-align:top;">
            <div style="font-family:${BODY};font-size:15px;line-height:1.35;font-weight:600;color:${TEXT};">${esc(f.label)}</div>
            <div style="padding-top:6px;">${pill(f.tier, f.tier === "P1")}&nbsp;${label(`${result} &middot; ${esc(f.category)}`)}</div>
            ${f.detail ? `<div style="padding-top:10px;font-family:${BODY};font-size:13px;line-height:1.55;color:${MUTED};">${esc(houseStyle(f.detail))}</div>` : ""}
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`;
}

function stat(figure: string, caption: string, color: string): string {
  return `<td style="vertical-align:top;padding:0 8px 0 0;">
    <div style="font-family:${DISPLAY};font-size:30px;line-height:1;font-weight:700;letter-spacing:-0.02em;color:${color};">${figure}</div>
    <div style="padding-top:6px;">${label(caption)}</div>
  </td>`;
}

export function renderReportEmail(input: ReportEmailInput): { subject: string; html: string } {
  const site = host(input.targetUrl);
  const first = input.name?.trim().split(/\s+/)[0] ?? null;
  const greeting = first ? `Hi ${esc(first)},` : "Hello,";
  const count = input.findings.length;

  const findingsBlock = count > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${input.findings.map(findingCard).join("")}</table>`
    : `<p style="margin:0;font-family:${BODY};font-size:15.5px;line-height:1.62;color:${TEXT};">Nothing reached the actionable threshold on this scan.</p>`;

  const extras: string[] = [];
  if (input.advisoryCount > 0) {
    extras.push(`${input.advisoryCount} lower-priority check${input.advisoryCount === 1 ? "" : "s"} also did not pass. Every one is in your full report.`);
  }
  if (input.notEstablishedCount > 0) {
    extras.push(`${input.notEstablishedCount} check${input.notEstablishedCount === 1 ? "" : "s"} could not be established from outside your site. They are listed in your full report and are not counted in the score either way.`);
  }

  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>Your Pulse report for ${esc(site)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,700;1,700&family=Inter:wght@300;400;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
</head>
<body bgcolor="${PAPER}" style="margin:0;padding:0;background-color:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAPER}" style="background-color:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

    <tr><td style="padding:0 0 22px 0;border-bottom:1px solid ${RULE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="${esc(input.logoUrl)}" width="120" height="25" alt="Gitwork" style="display:block;border:0;width:120px;height:auto;"></td>
        <td align="right" style="vertical-align:middle;">${label("Pulse report")}</td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:34px 0 0 0;">
      <div>${label("Site health check", SIGNAL)}</div>
      <h1 style="margin:12px 0 0 0;font-family:${DISPLAY};font-size:34px;line-height:1.08;font-weight:700;letter-spacing:-0.018em;color:${TEXT};">Your report for <span style="font-style:italic;color:${SIGNAL};">${esc(site)}</span>.</h1>
      <p style="margin:16px 0 0 0;font-family:${BODY};font-size:17px;line-height:1.5;font-weight:300;color:${MUTED};">${greeting} here is everything the scan found, worst first, with the evidence for each finding.</p>
    </td></tr>

    <tr><td style="padding:28px 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="background-color:${WHITE};border:1px solid ${RULE};border-radius:14px;">
        <tr><td style="padding:24px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:top;padding:0 16px 0 0;">
              <div style="font-family:${DISPLAY};font-size:54px;line-height:1;font-weight:700;letter-spacing:-0.03em;color:${SIGNAL};">${input.score ?? "&ndash;"}</div>
              <div style="padding-top:8px;">${label("Health score / 100")}</div>
            </td>
            ${stat(String(input.fail), "Failing", TEXT)}
            ${stat(String(input.warn), "Warnings", TEXT)}
            ${stat(String(input.pass), "Passed", TEXT)}
          </tr></table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:34px 0 14px 0;">
      <h2 style="margin:0;font-family:${DISPLAY};font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-0.012em;color:${TEXT};">What to fix (${count})</h2>
      <p style="margin:6px 0 0 0;font-family:${BODY};font-size:13px;line-height:1.55;color:${MUTED};">Ranked by severity and certainty. P1 first.</p>
    </td></tr>
    <tr><td>${findingsBlock}</td></tr>

    ${extras.length > 0 ? `<tr><td style="padding:10px 0 0 0;">${extras.map((e) => `<p style="margin:0 0 8px 0;font-family:${BODY};font-size:13px;line-height:1.55;color:${MUTED};">${esc(e)}</p>`).join("")}</td></tr>` : ""}

    <tr><td style="padding:22px 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${WHITE}" style="background-color:${WHITE};border:1px solid ${RULE};border-radius:14px;">
        <tr><td style="padding:18px 22px;">
          <div>${label("Your full report", SIGNAL)}</div>
          <p style="margin:8px 0 16px 0;font-family:${BODY};font-size:14px;line-height:1.55;color:${TEXT};">Every check we ran on your site, with what we observed and what to do about it, as a PDF.</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${INK}" style="background-color:${INK};border-radius:999px;"><a href="${esc(input.reportPdfUrl)}" style="display:inline-block;padding:12px 22px;border-radius:999px;color:${PAPER};font-family:${BODY};font-size:14px;font-weight:600;text-decoration:none;">Open your report (PDF) &rarr;</a></td></tr></table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:26px 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${INK}" style="background-color:${INK};border-radius:14px;">
        <tr><td style="padding:28px 26px;">
          <div>${label("Next step", PAPER)}</div>
          <div style="margin-top:10px;font-family:${DISPLAY};font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-0.012em;color:${PAPER};">AI got you to a prototype. We get you to production.</div>
          <p style="margin:12px 0 22px 0;font-family:${BODY};font-size:14px;line-height:1.6;color:#B9B5AF;">Book a 30 minute audit, at no charge. We will walk through these findings with you and tell you what it takes to fix them.</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${SIGNAL}" style="background-color:${SIGNAL};border-radius:999px;"><a href="${esc(input.bookingUrl)}" style="display:inline-block;padding:13px 24px;border-radius:999px;color:${WHITE};font-family:${BODY};font-size:14px;font-weight:600;text-decoration:none;">Book your audit &rarr;</a></td></tr></table>
        </td></tr>
      </table>
    </td></tr>



    <tr><td style="padding:34px 0 0 0;border-top:1px solid ${RULE};">
      <p style="margin:18px 0 0 0;font-family:${BODY};font-size:12px;line-height:1.55;color:${MUTED};">${esc(DELIVERY_LINE)}</p>
      <p style="margin:10px 0 0 0;font-family:${BODY};font-size:12px;line-height:1.55;color:${MUTED};">This is an automated check of one public URL at one point in time. It reads responses, headers, HTML and DNS. It does not sign in, test payments or run your app, so it is not a full security audit.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
        <td><a href="https://gitwork.co.uk" style="color:${MUTED};text-decoration:none;">${label("gitwork.co.uk")}</a></td>
        <td align="right">${label("Gitwork Pulse")}</td>
      </tr></table>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;

  return { subject: `Your Pulse report for ${site}`, html };
}
