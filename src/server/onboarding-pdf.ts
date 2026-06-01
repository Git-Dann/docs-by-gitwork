import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OnboardingPublicPayload } from "@/server/onboarding";

// Mirrors the Docs `DocumentCover` look (blue gradient hero, faded rings, mono
// eyebrow, editorial serif title, white body) using pdf-lib's built-in fonts —
// Times (serif) / Courier (mono) / Helvetica are exactly DocumentCover's
// documented fallbacks, so the two stay visually aligned without bundling fonts.
// Bank details are never included (the public payload doesn't carry them).

const BRAND = rgb(0.114, 0.306, 0.847); // #1D4ED8
const BRAND_DARK = rgb(0.118, 0.227, 0.541); // #1E3A8A
const INK = rgb(0.059, 0.09, 0.165); // #0F172A
const BODY = rgb(0.216, 0.255, 0.318); // #374151
const MUTED = rgb(0.58, 0.639, 0.722); // #94A3B8
const HAIRLINE = rgb(0.886, 0.898, 0.918); // ~rgba(0,0,0,0.08)
const WHITE = rgb(1, 1, 1);

const A4: [number, number] = [595.28, 841.89];
const M = 56; // page margin
const HERO_H = 212;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Greedy word-wrap to fit `maxWidth` at the given font/size. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

export async function buildOnboardingPdf(
  session: OnboardingPublicPayload,
  opts: { generatedOn: string },
): Promise<Uint8Array> {
  const f = session.fields;
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const [W, H] = A4;
  const contentW = W - M * 2;

  let page: PDFPage = doc.addPage(A4);

  // ── Hero band (faux left→right gradient to echo DocumentCover's 140deg) ──
  const strips = 72;
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    page.drawRectangle({
      x: (W / strips) * i,
      y: H - HERO_H,
      width: W / strips + 1,
      height: HERO_H,
      color: rgb(
        lerp(0.114, 0.118, t),
        lerp(0.306, 0.227, t),
        lerp(0.847, 0.541, t),
      ),
    });
  }
  // Faded concentric rings, top-right
  page.drawEllipse({ x: W - 26, y: H - 16, xScale: 150, yScale: 150, borderColor: WHITE, borderWidth: 1, borderOpacity: 0.12 });
  page.drawEllipse({ x: W - 26, y: H - 16, xScale: 92, yScale: 92, borderColor: WHITE, borderWidth: 1, borderOpacity: 0.1 });

  // Eyebrow
  page.drawText("GITWORK // ONBOARDING", {
    x: M,
    y: H - 52,
    size: 10,
    font: mono,
    color: WHITE,
    opacity: 0.6,
  });
  // Editorial title (company name, or a generic fallback)
  const title = f.companyName?.trim() || "Onboarding summary";
  const titleLines = wrap(title, serif, 30, contentW - 40).slice(0, 2);
  titleLines.forEach((ln, i) => {
    page.drawText(ln, { x: M, y: H - 112 - i * 34, size: 30, font: serif, color: WHITE });
  });
  // Subtitle
  page.drawText("Project onboarding summary", {
    x: M,
    y: H - HERO_H + 34,
    size: 11,
    font: helv,
    color: WHITE,
    opacity: 0.6,
  });

  // ── White body ──
  let top = HERO_H + 40; // distance from page top
  const yOf = () => H - top;

  const ensure = (need: number) => {
    if (top + need > H - M) {
      page = doc.addPage(A4);
      top = M;
    }
  };
  const heading = (label: string) => {
    ensure(34);
    page.drawText(label.toUpperCase(), { x: M, y: yOf(), size: 9, font: mono, color: BRAND });
    top += 8;
    page.drawLine({ start: { x: M, y: H - top }, end: { x: W - M, y: H - top }, thickness: 0.6, color: HAIRLINE });
    top += 18;
  };
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    const lines = wrap(value, helv, 11, contentW - 150);
    const h = Math.max(15, lines.length * 14);
    ensure(h);
    page.drawText(label, { x: M, y: yOf(), size: 9, font: mono, color: MUTED });
    lines.forEach((ln, i) => {
      page.drawText(ln, { x: M + 150, y: yOf() - i * 14, size: 11, font: helv, color: INK });
    });
    top += h + 8;
  };
  const para = (value: string | null | undefined) => {
    if (!value) return;
    for (const ln of wrap(value, helv, 11, contentW)) {
      ensure(15);
      page.drawText(ln, { x: M, y: yOf(), size: 11, font: helv, color: BODY });
      top += 15;
    }
    top += 8;
  };

  const fullName = [f.contactFirstName, f.contactLastName].filter(Boolean).join(" ");

  heading("Contact");
  row("Name", fullName);
  row("Email", f.contactEmail);
  row("Role", f.contactRole);
  row("Phone", f.contactPhone);

  top += 8;
  heading("Company");
  row("Company name", f.companyName);
  row("Registered name", f.legalCompanyName);
  row("Company number", f.companyNumber);
  row("VAT number", f.vatNumber);
  row("Invoice email", f.invoiceEmail);

  const hq = [f.addressLine1, f.addressLine2, f.city, f.county, f.postcode, f.country].filter(Boolean).join(", ");
  if (hq) {
    top += 8;
    heading("Registered address");
    para(hq);
  }

  if (f.billingDiffers) {
    const billing = [f.billingAddressLine1, f.billingAddressLine2, f.billingCity, f.billingCounty, f.billingPostcode, f.billingCountry]
      .filter(Boolean)
      .join(", ");
    if (billing) {
      top += 8;
      heading("Billing address");
      para(billing);
    }
  }

  if (f.productName || f.productUrl || f.productDescription) {
    top += 8;
    heading("Product");
    row("Name", f.productName);
    row("URL", f.productUrl);
    if (f.productDescription) para(f.productDescription);
  }

  if (f.projectGoals) {
    top += 8;
    heading("What you're hoping for");
    para(f.projectGoals);
  }

  top += 8;
  heading("Bank details");
  para("Provided securely and stored encrypted by Gitwork. Omitted from this copy for your security.");

  // ── Footer (date, right-aligned, above a hairline) ──
  const footY = M - 6;
  page.drawLine({ start: { x: M, y: footY + 16 }, end: { x: W - M, y: footY + 16 }, thickness: 0.6, color: HAIRLINE });
  const stamp = `Generated ${opts.generatedOn}`;
  page.drawText(stamp, { x: W - M - mono.widthOfTextAtSize(stamp, 9), y: footY, size: 9, font: mono, color: MUTED });
  page.drawText("gitwork.co.uk", { x: M, y: footY, size: 9, font: mono, color: MUTED });

  return doc.save();
}
