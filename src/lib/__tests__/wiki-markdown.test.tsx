// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WikiMarkdown } from "@/lib/wiki-markdown";

/**
 * The client wiki's renderer. Wiki pages are shown on the client's public share page and the client
 * intake API writes into the same wiki, so hostile Markdown has to come out as inert text — and the
 * constructs real wiki pages use (headings, tables, fenced code, nested lists) still have to draw.
 */

function render(md: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(WikiMarkdown, { content: md }));
  return host;
}

const PAGE = `# Developer guide

## Setup

Run **npm ci** then \`npm run dev\`. See [the docs](https://example.com/docs) or [home](/app).

### Steps

1. Clone the repo
2. Install
   - Node 22
   - Postgres
3. Run

- Bullet one
- Bullet two
  - Nested *italic*

> **Note:** keep MY_VAR_NAME secret.

---

| Variable | Description | Required |
|----------|-------------|----------|
| \`DATABASE_URL\` | Postgres | ✓ |
| \`API_KEY\` | Auth | — |

\`\`\`bash
npm ci
npm run dev
\`\`\`

Closing paragraph.`;

describe("wiki markdown — structure", () => {
  const el = render(PAGE);

  it("draws all three heading levels", () => {
    expect(el.querySelector("h1")?.textContent).toBe("Developer guide");
    expect(el.querySelector("h2")?.textContent).toBe("Setup");
    expect(el.querySelector("h3")?.textContent).toBe("Steps");
  });

  it("draws inline marks and safe links", () => {
    expect(el.querySelector("strong")?.textContent).toBe("npm ci");
    expect([...el.querySelectorAll("p code")].map((c) => c.textContent)).toContain("npm run dev");
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://example.com/docs", "/app"]);
    expect(el.querySelector("a")?.getAttribute("rel")).toContain("noopener");
  });

  it("draws an ordered list with a nested bullet list, then a separate bullet list", () => {
    const ol = el.querySelector("ol")!;
    expect(ol.parentElement).toBe(el.firstElementChild);
    expect(ol.children).toHaveLength(3);
    expect(ol.querySelector("li > ul")?.children).toHaveLength(2);
    const topUls = [...el.firstElementChild!.children].filter((c) => c.tagName === "UL");
    expect(topUls).toHaveLength(1);
    expect(topUls[0].querySelector("ul em")?.textContent).toBe("italic");
  });

  it("keeps a numbered list's start number", () => {
    expect(render("100. Item\n101. Next").querySelector("ol")?.getAttribute("start")).toBe("100");
  });

  it("draws callouts, rules, tables and fenced code", () => {
    expect(el.querySelector("blockquote strong")?.textContent).toBe("Note:");
    // `_` is not italic in the wiki — identifiers stay intact.
    expect(el.querySelector("blockquote")?.textContent).toContain("MY_VAR_NAME");
    expect(el.querySelector("blockquote em")).toBeNull();
    expect(el.querySelector("hr")).not.toBeNull();
    expect([...el.querySelectorAll("th")].map((t) => t.textContent)).toEqual([
      "Variable",
      "Description",
      "Required",
    ]);
    expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(el.querySelector("tbody td code")?.textContent).toBe("DATABASE_URL");
    expect(el.querySelector("pre code")?.textContent).toBe("npm ci\nnpm run dev");
  });

  it("shows the empty state for blank content", () => {
    expect(render("  \n ").textContent).toBe("Nothing to preview yet.");
  });
});

describe("wiki markdown — hostile input is inert", () => {
  const HOSTILE = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    "<a href=\"javascript:alert(1)\">click</a>",
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "[click](vbscript:msgbox(1))",
    '[click](https://x.com/"onmouseover="alert(1))',
    '<iframe src="https://evil.example"></iframe>',
    '| <img src=x onerror=alert(1)> | [x](javascript:alert(1)) |\n|---|---|\n| a | b |',
    "> <script>alert(1)</script>",
    "# <svg onload=alert(1)>",
    "- <b onclick=alert(1)>x</b>",
    "```\n<script>alert(1)</script>\n```",
    "<sm><img src=x onerror=alert(1)></sm>",
  ];

  it.each(HOSTILE)("%s", (md) => {
    const el = render(md);
    expect(el.querySelector("script, img, iframe, svg, b")).toBeNull();
    for (const node of el.querySelectorAll("*")) {
      for (const attr of node.attributes) {
        expect(attr.name.startsWith("on")).toBe(false);
      }
    }
    for (const a of el.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").toMatch(/^(https?:|mailto:|\/|#)/i);
    }
  });

  it("keeps hostile markup visible as text rather than dropping it", () => {
    expect(render("<script>alert(1)</script>").textContent).toContain("<script>alert(1)</script>");
    expect(render("[click](javascript:alert(1))").textContent).toContain("click");
  });
});

describe("wiki markdown — no HTML-string path", () => {
  it("no client-wiki component injects an HTML string", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "src/components/clients/wiki");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /dangerouslySetInnerHTML\s*=/.test(readFileSync(join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
