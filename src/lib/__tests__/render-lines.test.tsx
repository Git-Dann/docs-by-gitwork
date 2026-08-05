import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderLines } from "@/lib/markdown";

/**
 * Block text fields are plain strings with newlines, rendered straight into a `<p>` — and HTML
 * collapses newlines to spaces, so a seven-line ingest description came out as one run-on
 * paragraph. Authors were already typing `- ` to fake a list, so that is the syntax honoured here.
 */

function html(text: string): string {
  return renderToStaticMarkup(<>{renderLines(text, "t")}</>);
}

describe("renderLines", () => {
  it("keeps separate lines separate", () => {
    // The regression that started this: newlines silently became spaces.
    const out = html("First line\nSecond line");

    expect(out).toContain("First line");
    expect(out).toContain("Second line");
    expect(out).not.toContain("First line Second line");
  });

  it("turns a run of `- ` lines into ONE list", () => {
    const out = html("- Paginate DMS\n- Fetch vehicle list\n- Skip zero-vehicle customers");

    expect(out.match(/<ul/g) ?? []).toHaveLength(1);
    expect(out.match(/<li/g) ?? []).toHaveLength(3);
    expect(out).toContain("Paginate DMS");
    // The marker itself must not survive into the text — the <li> supplies it.
    expect(out).not.toContain("- Paginate");
  });

  it("accepts `* ` and leading indentation as bullets too", () => {
    expect(html("* One\n* Two").match(/<li/g) ?? []).toHaveLength(2);
    expect(html("  - One\n  - Two").match(/<li/g) ?? []).toHaveLength(2);
  });

  it("starts a NEW list after intervening prose", () => {
    const out = html("- A\n- B\nThen this\n- C");

    expect(out.match(/<ul/g) ?? []).toHaveLength(2);
    expect(out).toContain("Then this");
  });

  it("does not treat a bare hyphen as a bullet", () => {
    // A negative number or an en-dashed aside starts with a hyphen but is not a list item; the
    // trailing space is what makes it a bullet.
    const out = html("-5 degrees\n-not a bullet");

    expect(out).not.toContain("<ul");
    expect(out).toContain("-5 degrees");
  });

  it("still applies inline formatting inside a bullet", () => {
    // Bullets must compose with the existing bold/italic/link/code, not replace them.
    const out = html("- Upsert by **refid** and `refsource`");

    expect(out).toMatch(/<strong[^>]*>refid<\/strong>/);
    expect(out).toContain("<code");
  });

  it("still applies inline formatting on a plain line", () => {
    expect(html("Plain **bold** here")).toMatch(/<strong[^>]*>bold<\/strong>/);
  });

  it("preserves a blank line as deliberate spacing", () => {
    const out = html("One\n\nTwo");

    expect(out).toContain("One");
    expect(out).toContain("Two");
    expect(out).toContain("aria-hidden");
  });

  it("handles CRLF, which is what a paste from Windows or a doc carries", () => {
    expect(html("- A\r\n- B").match(/<li/g) ?? []).toHaveLength(2);
  });

  it("renders empty input as nothing", () => {
    expect(html("")).toBe("");
  });

  it("reproduces the real ingest description that triggered this", () => {
    const out = html(
      [
        "- Paginate DMS /customer/retrieveCustomerArray (cursor-based)",
        "- For each customer → fetch vehicle list",
        "- Skip customers with zero vehicles",
        "- Upsert customer by refid + refsource",
        "- Create customerdealermappings if missing",
        "- Log results in integrationlogs (records processed, records_failed)",
      ].join("\n"),
    );

    expect(out.match(/<li/g) ?? []).toHaveLength(6);
    expect(out.match(/<ul/g) ?? []).toHaveLength(1);
  });
});
