import { launchHeadlessBrowser } from "@/server/headless-browser";

/**
 * Renders a shared Pulse report page (/report/[token]?print=1) to an A4 PDF.
 *
 * One function for both "Export PDF" in the app and the PDF a visitor is emailed, so they
 * can't drift. The page's own print CSS (`.pulse-report` / `@page pulsepage` in
 * globals.css) owns the layout: full width, no side margins, a top and bottom margin on
 * every page but the cover, and rows that never split. So the margins here are zero and
 * `preferCSSPageSize` hands control to that CSS; margins set here would stack on top of it,
 * which is what put a white frame round every page.
 */
export async function renderPulseReportPdf(url: string): Promise<Buffer> {
  const browser = await launchHeadlessBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
