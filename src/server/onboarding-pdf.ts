import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { OnboardingPublicPayload } from "@/server/onboarding";

// Gitwork brand palette (mirrors globals.css --brand-700 / --text-1).
const BRAND = rgb(0.114, 0.306, 0.847); // #1D4ED8
const INK = rgb(0.059, 0.09, 0.165); // #0F172A
const MUTED = rgb(0.4, 0.45, 0.52);
const HAIRLINE = rgb(0.85, 0.87, 0.9);

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const HEADER_H = 92;

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

/**
 * Build a branded "Onboarding summary" PDF from the public onboarding payload.
 * Bank details are intentionally omitted — the public payload never carries
 * them, so there's nothing sensitive to leak here.
 */
export async function buildOnboardingPdf(
  session: OnboardingPublicPayload,
  opts: { generatedOn: string },
): Promise<Uint8Array> {
  const f = session.fields;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [pw, ph] = A4;
  const contentWidth = pw - MARGIN * 2;
  let page = doc.addPage(A4);
  let y = ph - HEADER_H - 28;

  const drawHeader = (p: typeof page) => {
    p.drawRectangle({ x: 0, y: ph - HEADER_H, width: pw, height: HEADER_H, color: BRAND });
    p.drawText("Gitwork", { x: MARGIN, y: ph - 50, size: 24, font: bold, color: rgb(1, 1, 1) });
    p.drawText("Onboarding summary", { x: MARGIN, y: ph - 72, size: 11, font, color: rgb(1, 1, 1) });
  };
  drawHeader(page);

  const newPage = () => {
    page = doc.addPage(A4);
    y = ph - MARGIN;
  };
  const ensure = (need: number) => {
    if (y - need < MARGIN + 16) newPage();
  };
  const heading = (label: string) => {
    ensure(34);
    page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 9, font: bold, color: BRAND });
    y -= 7;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: pw - MARGIN, y },
      thickness: 0.5,
      color: HAIRLINE,
    });
    y -= 17;
  };
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    const lines = wrap(value, font, 11, contentWidth - 150);
    const h = Math.max(15, lines.length * 14);
    ensure(h);
    page.drawText(label, { x: MARGIN, y, size: 9, font, color: MUTED });
    lines.forEach((ln, i) => {
      page.drawText(ln, { x: MARGIN + 150, y: y - i * 14, size: 11, font, color: INK });
    });
    y -= h + 7;
  };
  const para = (value: string | null | undefined) => {
    if (!value) return;
    const lines = wrap(value, font, 11, contentWidth);
    for (const ln of lines) {
      ensure(14);
      page.drawText(ln, { x: MARGIN, y, size: 11, font, color: INK });
      y -= 14;
    }
    y -= 8;
  };

  const fullName = [f.contactFirstName, f.contactLastName].filter(Boolean).join(" ");

  page.drawText(f.companyName || "Onboarding", { x: MARGIN, y, size: 17, font: bold, color: INK });
  y -= 17;
  page.drawText(`Generated ${opts.generatedOn}`, { x: MARGIN, y, size: 9, font, color: MUTED });
  y -= 24;

  heading("Contact");
  row("Name", fullName);
  row("Email", f.contactEmail);
  row("Role", f.contactRole);
  row("Phone", f.contactPhone);

  heading("Company");
  row("Company name", f.companyName);
  row("Registered name", f.legalCompanyName);
  row("Company number", f.companyNumber);
  row("VAT number", f.vatNumber);
  row("Invoice email", f.invoiceEmail);

  const hq = [f.addressLine1, f.addressLine2, f.city, f.county, f.postcode, f.country]
    .filter(Boolean)
    .join(", ");
  if (hq) {
    heading("Registered address");
    para(hq);
  }

  if (f.billingDiffers) {
    const billing = [
      f.billingAddressLine1,
      f.billingAddressLine2,
      f.billingCity,
      f.billingCounty,
      f.billingPostcode,
      f.billingCountry,
    ]
      .filter(Boolean)
      .join(", ");
    if (billing) {
      heading("Billing address");
      para(billing);
    }
  }

  if (f.productName || f.productUrl || f.productDescription) {
    heading("Product");
    row("Name", f.productName);
    row("URL", f.productUrl);
    if (f.productDescription) para(f.productDescription);
  }

  if (f.projectGoals) {
    heading("What you're hoping for");
    para(f.projectGoals);
  }

  heading("Bank details");
  para(
    "Provided securely and stored encrypted by Gitwork. Omitted from this copy for your security.",
  );

  page.drawText("Gitwork · gitwork.co.uk", {
    x: MARGIN,
    y: MARGIN - 18,
    size: 8,
    font,
    color: MUTED,
  });

  return doc.save();
}
