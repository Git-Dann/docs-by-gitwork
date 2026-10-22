/**
 * The full Pulse report as a PDF: every check that applied to the site, with what was
 * observed. Attached to the summary email a visitor receives after unlocking.
 *
 * Gitwork design system (paper page, ink text, signal purple used once per section,
 * hairline rules, a page head and foot on every page, the placed wordmark) drawn with
 * pdf-lib's built-in faces: Times Bold stands in for Fraunces, Helvetica for Inter and
 * Courier for JetBrains Mono, which are the brand's own documented fallbacks. Copy
 * follows the brand rules: UK spelling, no em dashes, the delivery line word for word.
 *
 * Pure apart from the logo bytes, which the caller passes in, so it can be tested.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export interface ReportPdfCheck {
  category: string;
  label: string;
  status: string;
  detail: string | null;
}

export interface ReportPdfFinding {
  label: string;
  category: string;
  status: string;
  detail: string;
  tier: "P1" | "P2";
}

export interface ReportPdfInput {
  targetUrl: string;
  /** Who it was prepared for, e.g. "Sam Buyer, Acme". */
  preparedFor: string | null;
  scannedAt: Date;
  score: number | null;
  pass: number;
  warn: number;
  fail: number;
  findings: ReportPdfFinding[];
  checks: ReportPdfCheck[];
  /** The ink wordmark PNG. Null draws no logo rather than setting the name in a font. */
  logoPng: Uint8Array | null;
}

// Gitwork tokens.
const PAPER = rgb(242 / 255, 237 / 255, 228 / 255);
const SIGNAL = rgb(107 / 255, 82 / 255, 255 / 255);
const TEXT = rgb(26 / 255, 26 / 255, 30 / 255);
const MUTED = rgb(107 / 255, 107 / 255, 107 / 255);
const WHITE = rgb(1, 1, 1);
const RULE = rgb(220 / 255, 216 / 255, 209 / 255);
const FAIL_C = rgb(180 / 255, 35 / 255, 24 / 255);
const WARN_C = rgb(181 / 255, 71 / 255, 8 / 255);
const PASS_C = rgb(6 / 255, 118 / 255, 71 / 255);

const DELIVERY_LINE =
  "Global build capacity, UK quality control. Every release is reviewed and deployed by a UK based senior engineer.";

const A4: [number, number] = [595.28, 841.89];
const MX = 50; // side margin
const TOP = 70; // content starts below the page head
const BOTTOM = 60; // content stops above the page foot
const HIDDEN = new Set(["SKIPPED", "NOT_APPLICABLE"]);

/**
 * The built-in PDF faces only cover WinAnsi. Scan evidence is free text from someone
 * else's website, so anything outside that set is mapped or dropped rather than
 * allowed to throw halfway through a report. Em dashes are rewritten per the brand.
 */
export function toWinAnsi(s: string): string {
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[→➔➡]/g, "->")
    .replace(/•/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    // A single token wider than the line (a long URL or hash) is hard-broken.
    let w = word;
    while (font.widthOfTextAtSize(w, size) > maxWidth) {
      let cut = w.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
      if (line) { out.push(line); line = ""; }
      out.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function statusInfo(status: string): { word: string; color: ReturnType<typeof rgb>; order: number } {
  if (status === "FAIL") return { word: "FAILING", color: FAIL_C, order: 0 };
  if (status === "WARN") return { word: "WARNING", color: WARN_C, order: 1 };
  if (status === "PASS") return { word: "PASSED", color: PASS_C, order: 3 };
  return { word: "NOT ESTABLISHED", color: MUTED, order: 2 };
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function buildReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const site = host(input.targetUrl);
  doc.setTitle(`Pulse report for ${site}`);
  doc.setAuthor("Gitwork");
  doc.setCreator("Gitwork Pulse");

  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const display = await doc.embedFont(StandardFonts.TimesRomanBold);
  const displayItalic = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const mono = await doc.embedFont(StandardFonts.Courier);
  let logo: PDFImage | null = null;
  if (input.logoPng) {
    try { logo = await doc.embedPng(input.logoPng); } catch { logo = null; }
  }

  const [W, H] = A4;
  const CW = W - MX * 2;
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    // Page head: wordmark left, mono doc ref right, hairline under.
    if (logo) {
      const lw = 78;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: MX, y: H - 44 - lh / 2, width: lw, height: lh });
    }
    const ref = toWinAnsi(`PULSE REPORT  ${site.toUpperCase()}`);
    page.drawText(ref, { x: W - MX - mono.widthOfTextAtSize(ref, 7.5), y: H - 47, size: 7.5, font: mono, color: MUTED });
    page.drawLine({ start: { x: MX, y: H - 60 }, end: { x: W - MX, y: H - 60 }, thickness: 0.5, color: RULE });
    y = H - TOP - 10;
  };
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
  };
  const text = (s: string, x: number, size: number, font: PDFFont, color = TEXT) => {
    page.drawText(toWinAnsi(s), { x, y, size, font, color });
  };
  const para = (s: string, x: number, width: number, size: number, font: PDFFont, color = TEXT, lead = 1.45) => {
    for (const line of wrap(toWinAnsi(s), font, size, width)) {
      ensure(size * lead);
      page.drawText(line, { x, y, size, font, color });
      y -= size * lead;
    }
  };

  // ── Page 1: title and summary ──────────────────────────────────────────────
  newPage();
  y -= 6;
  text("SITE HEALTH CHECK", MX, 8, mono, SIGNAL);
  y -= 34;
  text("Full report for", MX, 28, display);
  y -= 32;
  for (const line of wrap(toWinAnsi(`${site}.`), displayItalic, 28, CW)) {
    page.drawText(line, { x: MX, y, size: 28, font: displayItalic, color: SIGNAL });
    y -= 32;
  }
  y -= 4;
  const meta = [
    input.preparedFor ? `Prepared for ${input.preparedFor}` : null,
    `Scanned ${input.scannedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    input.targetUrl,
  ].filter(Boolean).join("  |  ");
  para(meta, MX, CW, 9.5, body, MUTED);

  // Summary card.
  y -= 14;
  const cardH = 84;
  ensure(cardH);
  page.drawRectangle({ x: MX, y: y - cardH, width: CW, height: cardH, color: WHITE, borderColor: RULE, borderWidth: 0.5 });
  const scoreText = input.score == null ? "-" : String(input.score);
  page.drawText(scoreText, { x: MX + 20, y: y - 50, size: 40, font: display, color: SIGNAL });
  page.drawText("HEALTH SCORE / 100", { x: MX + 20, y: y - 68, size: 7, font: mono, color: MUTED });
  const stats: [string, number][] = [["FAILING", input.fail], ["WARNINGS", input.warn], ["PASSED", input.pass]];
  stats.forEach(([lbl, n], i) => {
    const x = MX + 200 + i * 105;
    page.drawText(String(n), { x, y: y - 44, size: 22, font: display, color: TEXT });
    page.drawText(lbl, { x, y: y - 62, size: 7, font: mono, color: MUTED });
  });
  y -= cardH + 30;

  // ── What to fix ────────────────────────────────────────────────────────────
  ensure(60);
  text(`What to fix (${input.findings.length})`, MX, 18, display);
  y -= 16;
  para("Ranked by severity and certainty, P1 first, with what we observed.", MX, CW, 9, body, MUTED);
  y -= 8;
  if (input.findings.length === 0) {
    para("Nothing reached the actionable threshold on this scan.", MX, CW, 10, body);
  }
  input.findings.forEach((f, i) => {
    const st = statusInfo(f.status);
    const detailLines = f.detail ? wrap(toWinAnsi(f.detail), body, 9, CW - 46) : [];
    const h = 34 + detailLines.length * 13;
    ensure(h + 8);
    page.drawRectangle({ x: MX, y: y - h, width: CW, height: h, color: WHITE, borderColor: RULE, borderWidth: 0.5 });
    page.drawText(`${i + 1}.`, { x: MX + 12, y: y - 20, size: 13, font: displayItalic, color: SIGNAL });
    page.drawText(toWinAnsi(f.label), { x: MX + 36, y: y - 19, size: 10.5, font: bold, color: TEXT });
    const tag = toWinAnsi(`${f.tier}  ${st.word}  ${f.category.toUpperCase()}`);
    page.drawText(tag, { x: MX + 36, y: y - 31, size: 7, font: mono, color: st.color });
    let ly = y - 45;
    for (const l of detailLines) {
      page.drawText(l, { x: MX + 36, y: ly, size: 9, font: body, color: MUTED });
      ly -= 13;
    }
    y -= h + 8;
  });

  // ── Every check ────────────────────────────────────────────────────────────
  const shown = input.checks.filter((c) => !HIDDEN.has(c.status));
  const byCat = new Map<string, ReportPdfCheck[]>();
  for (const c of shown) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
  const bad = (l: ReportPdfCheck[]) => l.filter((c) => c.status === "FAIL" || c.status === "WARN").length;
  const cats = [...byCat.entries()].sort((a, b) => bad(b[1]) - bad(a[1]) || a[0].localeCompare(b[0]));

  newPage();
  y -= 6;
  text("APPENDIX", MX, 8, mono, SIGNAL);
  y -= 30;
  text(`Every check (${shown.length})`, MX, 24, display);
  y -= 18;
  para(
    "Every check that applied to your site, grouped by area, problems first. Checks that did not apply (for example payment checks on a site that takes no payments) are left out. A check marked not established could not be answered from outside the site and is not counted in the score either way.",
    MX, CW, 9, body, MUTED,
  );
  y -= 10;

  for (const [cat, list] of cats) {
    const sorted = [...list].sort((a, b) => statusInfo(a.status).order - statusInfo(b.status).order || a.label.localeCompare(b.label));
    ensure(46);
    page.drawLine({ start: { x: MX, y: y + 4 }, end: { x: W - MX, y: y + 4 }, thickness: 0.5, color: RULE });
    y -= 12;
    const counts = `${list.length} CHECK${list.length === 1 ? "" : "S"}  |  ${bad(list)} TO LOOK AT`;
    text(cat.toUpperCase(), MX, 8.5, mono, TEXT);
    page.drawText(counts, { x: W - MX - mono.widthOfTextAtSize(counts, 7.5), y, size: 7.5, font: mono, color: MUTED });
    y -= 16;
    for (const c of sorted) {
      const st = statusInfo(c.status);
      const labelLines = wrap(toWinAnsi(c.label), bold, 9, CW - 100);
      const detailLines = c.detail && c.status !== "PASS" ? wrap(toWinAnsi(c.detail), body, 8.5, CW - 100) : [];
      const h = labelLines.length * 12 + detailLines.length * 11.5 + 6;
      ensure(h);
      page.drawText(st.word, { x: MX, y, size: 7, font: mono, color: st.color });
      let ly = y;
      for (const l of labelLines) {
        page.drawText(l, { x: MX + 100, y: ly, size: 9, font: bold, color: TEXT });
        ly -= 12;
      }
      for (const l of detailLines) {
        page.drawText(l, { x: MX + 100, y: ly, size: 8.5, font: body, color: MUTED });
        ly -= 11.5;
      }
      y -= h;
    }
    y -= 10;
  }

  // ── Scope and sign-off ─────────────────────────────────────────────────────
  ensure(110);
  y -= 6;
  page.drawLine({ start: { x: MX, y: y + 4 }, end: { x: W - MX, y: y + 4 }, thickness: 0.5, color: RULE });
  y -= 14;
  text("SCOPE", MX, 8, mono, SIGNAL);
  y -= 14;
  para(
    "This is an automated check of one public URL at one point in time. It reads responses, headers, HTML and DNS. It does not sign in, test payments, attempt authorisation or run your app, so it is not a full security audit.",
    MX, CW, 9, body, MUTED,
  );
  y -= 6;
  para(DELIVERY_LINE, MX, CW, 9, body, TEXT);
  y -= 4;
  para("Book a 30 minute audit at gitwork.co.uk/audit, at no charge.", MX, CW, 9, bold, TEXT);

  // Page foot on every page: site left, page number right. The total is only known now.
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: MX, y: 42 }, end: { x: W - MX, y: 42 }, thickness: 0.5, color: RULE });
    p.drawText("GITWORK.CO.UK", { x: MX, y: 30, size: 7, font: mono, color: MUTED });
    const n = `${i + 1} / ${total}`;
    p.drawText(n, { x: W - MX - mono.widthOfTextAtSize(n, 7), y: 30, size: 7, font: mono, color: MUTED });
  });

  return doc.save();
}
