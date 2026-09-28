/**
 * The dev CV, rendered in the **Gitwork Document System** (the print brand, not
 * the app's UI system): one `section.page` at 1000 x 1414, paper ground, Fraunces
 * display, Inter body, JetBrains Mono labels, flat surfaces, hairline rules.
 * Token values are copied exactly from that system's `tokens.json` — its own
 * checklist says values are exact and never invented, so do not "tidy" a hex here.
 *
 * ⚠️ **Self-contained by design, and that is what makes the PDF work.** Every other
 * PDF route in this repo points Chromium at a public token page, because Chromium
 * cannot carry a NextAuth session — which would mean publicly sharing a person's CV
 * before you could export it. This document instead ships its own `<style>` and its
 * own base64 fonts and mark, so the route hands it to Chromium with `setContent`
 * and there is no page to reach, no token to mint and no public surface at all.
 *
 * It also means the on-screen preview and the PDF are the SAME artefact: the
 * preview is this string in an iframe `srcDoc`, so what the operator approves is
 * byte-identical to what prints.
 *
 * Brand rules encoded here, each with a test in `cv-brand.test.ts`:
 *  - **No em dashes, anywhere.** A hard copy rule of the system.
 *  - **The delivery line, word for word**, because a CV handed to a client is
 *    client-facing material and the system requires it there.
 *  - **The wordmark is never set in a font.** The head carries the placed mark;
 *    the foot carries "GITWORK.CO.UK", which is the system's own `label` sample,
 *    a URL in mono, not the wordmark.
 *  - **One purple thing.** Signal is used for the eyebrow and the arrow bullets
 *    (the system defines `ul.arrow` that way) and nothing else.
 */

import type { CvData } from "./types";

/** Paper-page palette, verbatim from the Document System's tokens. */
const T = {
  paper: "#F2EDE4",
  white: "#FFFFFF",
  text: "#1A1A1E",
  muted: "#6B6B6B",
  signal: "#6B52FF",
  rule: "rgba(12, 12, 24, 0.12)",
} as const;

/** The line the system requires on anything a client will see. Word for word. */
export const DELIVERY_LINE =
  "Global build capacity, UK quality control. Every release is reviewed and deployed by a UK based senior engineer.";

export interface CvAssets {
  /** `@font-face` rules with the faces inlined as data URIs. */
  fontCss: string;
  /** The Gitwork mark as a data URI, or null to omit it rather than draw a gap. */
  markDataUri: string | null;
}

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A section renders only when it has content — an empty heading on a sparse
 *  profile reads as a broken document rather than a short one. */
function section(label: string, body: string): string {
  if (!body.trim()) return "";
  return `<section class="sec"><h2 class="label">${esc(label)}</h2>${body}</section>`;
}

export function renderCvHtml(data: CvData, assets: CvAssets): string {
  const head = assets.markDataUri
    ? `<img class="mark" src="${assets.markDataUri}" alt="" width="24" height="24" />`
    : "";

  const meta = data.meta.length
    ? `<p class="meta">${data.meta.map(esc).join(" · ")}</p>`
    : "";

  const profile = section(
    "Profile",
    data.summary ? `<p class="body">${esc(data.summary)}</p>` : "",
  );

  const stack = section(
    "Stack",
    data.stack.length
      ? `<ul class="chips">${data.stack.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
      : "",
  );

  const work = section(
    "Selected work",
    data.engagements.length
      ? `<ul class="work">${data.engagements
          .map(
            (e) => `<li>
        <span class="arrow" aria-hidden="true">&#8594;</span>
        <span class="work-main"><span class="work-client">${esc(e.client)}</span>${
          e.project ? `<span class="work-project">${esc(e.project)}</span>` : ""
        }</span>
        <span class="work-period">${esc(e.period)}</span>
      </li>`,
          )
          .join("")}</ul>`
      : "",
  );

  const links = section(
    "Links",
    data.links.length
      ? `<ul class="links">${data.links
          .map(
            (l) =>
              `<li><span class="link-label">${esc(l.label)}</span><span class="link-text">${esc(l.text)}</span></li>`,
          )
          .join("")}</ul>`
      : "",
  );

  return `<!DOCTYPE html>
<html lang="en-GB"><head>
<meta charset="utf-8" />
<title>${esc(data.name)} · CV</title>
<style>
${assets.fontCss}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${T.paper}; }
body {
  font-family: "Inter", -apple-system, Helvetica, Arial, sans-serif;
  color: ${T.text};
  -webkit-font-smoothing: antialiased;
}
/* One section.page is one printed page. It does not reflow: at A4 the PDF is
   exactly this box, so content is fitted upstream by fitToOnePage rather than
   being allowed to spill. */
.page {
  position: relative;
  width: 1000px;
  height: 1414px;
  padding: 76px 84px 68px;
  background: ${T.paper};
  overflow: hidden;
}
.page-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 22px; border-bottom: 1px solid ${T.rule};
}
.mark { display: block; width: 24px; height: 24px; }
.label {
  margin: 0;
  font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
  font-size: 10px; font-weight: 500; line-height: 1.2;
  letter-spacing: 0.14em; text-transform: uppercase; color: ${T.muted};
}
.eyebrow {
  margin: 0 0 14px;
  font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
  font-size: 11px; font-weight: 600; line-height: 1.2;
  letter-spacing: 0.2em; text-transform: uppercase; color: ${T.signal};
}
.name {
  margin: 0;
  font-family: "Fraunces", Georgia, serif;
  font-size: 44px; font-weight: 700; line-height: 1.08; letter-spacing: -0.018em;
}
.role {
  margin: 10px 0 0;
  font-size: 20px; font-weight: 300; line-height: 1.5; color: ${T.muted};
  max-width: 42ch;
}
.meta { margin: 14px 0 0; font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
  font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: ${T.muted}; }
.identity { padding-top: 44px; }
.sec { margin-top: 34px; padding-top: 34px; border-top: 1px solid ${T.rule}; }
.body { margin: 12px 0 0; font-size: 15.5px; line-height: 1.62; max-width: 68ch; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; padding: 0; list-style: none; }
.chips li {
  padding: 5px 13px; border: 1px solid ${T.rule}; border-radius: 999px;
  background: ${T.white}; font-size: 13px; line-height: 1.55;
}
.work { margin: 14px 0 0; padding: 0; list-style: none; }
.work li {
  display: flex; align-items: baseline; gap: 12px;
  padding: 11px 0; border-bottom: 1px solid ${T.rule};
}
.work li:last-child { border-bottom: 0; padding-bottom: 0; }
.arrow { color: ${T.signal}; font-size: 15.5px; line-height: 1.62; }
.work-main { flex: 1 1 auto; min-width: 0; }
.work-client { font-size: 15px; font-weight: 600; line-height: 1.35; }
.work-project { display: block; font-size: 13px; line-height: 1.55; color: ${T.muted}; }
.work-period {
  flex: 0 0 auto;
  font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
  font-size: 10px; font-weight: 500; letter-spacing: 0.14em;
  text-transform: uppercase; color: ${T.muted}; font-variant-numeric: tabular-nums;
}
.links { display: flex; flex-wrap: wrap; gap: 10px 40px; margin: 14px 0 0; padding: 0; list-style: none; }
.link-label {
  display: block;
  font-family: "JetBrains Mono", "SF Mono", Menlo, monospace;
  font-size: 10px; font-weight: 500; letter-spacing: 0.14em;
  text-transform: uppercase; color: ${T.muted};
}
.link-text { font-size: 13px; line-height: 1.55; }
.delivery {
  position: absolute; left: 84px; right: 84px; bottom: 76px;
  padding-top: 18px; border-top: 1px solid ${T.rule};
  font-size: 13px; line-height: 1.55; color: ${T.muted}; max-width: 68ch;
}
.page-foot {
  position: absolute; left: 84px; right: 84px; bottom: 40px;
  display: flex; align-items: center; justify-content: space-between;
}
@page { size: 1000px 1414px; margin: 0; }
</style>
</head>
<body>
<section class="page">
  <header class="page-head">
    ${head}
    <span class="label">Curriculum vitae</span>
  </header>

  <div class="identity">
    <p class="eyebrow">${esc(data.eyebrow)}</p>
    <h1 class="name">${esc(data.name)}</h1>
    <p class="role">${esc(data.role)}</p>
    ${meta}
  </div>

  ${profile}
  ${stack}
  ${work}
  ${links}

  <p class="delivery">${esc(DELIVERY_LINE)}</p>
  <footer class="page-foot">
    <span class="label">gitwork.co.uk</span>
    <span class="label">1</span>
  </footer>
</section>
</body></html>`;
}
