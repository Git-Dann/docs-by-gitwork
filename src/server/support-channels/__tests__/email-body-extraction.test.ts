/**
 * Both mail connectors must read the SAME body out of an email.
 *
 * ⚠️ This is the defect that cost Big Wedge eight weeks of course requests. Their
 * feedback notifications put the message in the HTML part and a seven-word stub in
 * the plain part ("Please view this email in HTML format."). Gmail's extractor was
 * fixed to fall through to the HTML; the IMAP adapter was left doing
 * `parsed.text ?? parsed.html`, so it stored the stub. The conversation existed, the
 * classifier had nothing to read, and the failure looked exactly like "no golfer
 * asked for a course" — §35's rule, in a mail parser.
 *
 * The rule lives in `shared.ts` and both call it. These tests hold BOTH to it,
 * because a rule with two implementations is a rule one of them will get wrong.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emailHtmlToText, extractGmailBodyText, isPlaintextStub } from "../shared";

/** The real shape of a Big Wedge feedback notification. */
const STUB_PLAIN = "Please view this email in HTML format.";
const REAL_HTML = `<html><body><h2>🏌️ New Feedback Received</h2>
<p>From: Luke McFarland</p><p>Email: luke@bigwedgegolf.com</p>
<p>Message:</p><p>Please add Orton Meadows Golf Course, Peterborough.</p></body></html>`;

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

describe("a plaintext stub is recognised", () => {
  it("catches the exact wording Big Wedge's mailer uses", () => {
    expect(isPlaintextStub(STUB_PLAIN)).toBe(true);
  });

  it("catches the common variants", () => {
    expect(isPlaintextStub("View this email in HTML")).toBe(true);
    expect(isPlaintextStub("This is an HTML email")).toBe(true);
  });

  it("does NOT swallow a real message that happens to mention HTML", () => {
    // ⚠️ The dangerous direction: discarding a genuine plaintext body would lose the
    // customer's actual words in favour of a marketing-heavy HTML part.
    expect(isPlaintextStub("The app renders my scorecard as raw HTML, please fix")).toBe(false);
    expect(isPlaintextStub("Please add Orton Meadows Golf Course")).toBe(false);
  });
});

describe("Gmail reads the message, not the stub", () => {
  it("falls through to the HTML part", () => {
    const body = extractGmailBodyText({
      payload: {
        parts: [
          { mimeType: "text/plain", body: { data: b64(STUB_PLAIN) } },
          { mimeType: "text/html", body: { data: b64(REAL_HTML) } },
        ],
      },
    });
    expect(body).toContain("Orton Meadows Golf Course");
    expect(body).not.toBe(STUB_PLAIN);
  });

  it("keeps a real plaintext body in preference to the HTML", () => {
    const body = extractGmailBodyText({
      payload: {
        parts: [
          { mimeType: "text/plain", body: { data: b64("Add Naunton Downs please") } },
          { mimeType: "text/html", body: { data: b64(REAL_HTML) } },
        ],
      },
    });
    expect(body).toBe("Add Naunton Downs please");
  });
});

describe("IMAP applies the same rule", () => {
  /**
   * The IMAP path runs inside an `imapflow` fetch loop that cannot be driven without a
   * server, so this asserts the source calls the shared rule rather than re-deriving
   * one. The behaviour itself is covered by the `shared.ts` tests above — what can go
   * wrong here is the adapter going its own way again, which is exactly what happened.
   */
  const RAW = readFileSync(join(process.cwd(), "src/server/support-channels/imap.ts"), "utf8");
  /**
   * ⚠️ Comments stripped. The comment explaining why the old expression is wrong
   * QUOTES the old expression, so matching the raw file fails on the fix's own
   * documentation — which is precisely how the first version of this test behaved.
   */
  const IMAP = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("does not take the plain part unconditionally", () => {
    expect(IMAP).not.toMatch(/parsed\.text\s*\?\?\s*parsed\.html/);
  });

  it("uses the shared stub rule and the shared HTML converter", () => {
    expect(IMAP).toContain("isPlaintextStub");
    expect(IMAP).toContain("emailHtmlToText");
  });

  it("prefers real plaintext, and only falls through on a stub", () => {
    expect(IMAP).toMatch(/plain && !isPlaintextStub\(plain\)\s*\?\s*plain\s*:/);
  });
});

describe("the HTML converter keeps what a classifier needs", () => {
  it("recovers the course name and drops the markup", () => {
    const text = emailHtmlToText(REAL_HTML);
    expect(text).toContain("Orton Meadows Golf Course");
    expect(text).not.toContain("<p>");
  });

  it("puts each block on its own line, so fields do not merge into one", () => {
    const lines = emailHtmlToText(REAL_HTML)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines).toContain("From: Luke McFarland");
    expect(lines.some((l) => l.includes("Orton Meadows Golf Course"))).toBe(true);
    // The course name must not be on the same line as the label above it.
    const course = lines.find((l) => l.includes("Orton Meadows"))!;
    expect(course).not.toContain("Message:");
  });
});
