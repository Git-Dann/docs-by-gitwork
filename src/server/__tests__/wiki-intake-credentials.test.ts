import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Which credential each intake path authenticates against.
 *
 * ── The bug this pins (August 2026) ───────────────────────────────────────────
 * A client filling in the Requests form on their own wiki got "Invalid wiki
 * token" every time, and had done since the feature shipped. Two secrets exist
 * on `ClientWiki` and they are not interchangeable:
 *
 *   shareToken / pageShareTokens  the client's public wiki link  →  /wiki/[slug]/[token]
 *   courseIngestToken             the inbound API secret        →  /api/public/wiki-items/[token]
 *
 * The client-facing form posts the token out of the wiki URL, but every intake
 * helper resolved the wiki by `courseIngestToken` — usually null, and never
 * equal to a share token. So the lookup could not match, and the failure was
 * reported as a bad credential when the credential was fine.
 *
 * A behavioural test would need a database; the house rule is to test pure
 * functions rather than mock Prisma. So this asserts the property that was
 * wrong: which resolver each function reaches for. It is deliberately narrow —
 * it does not care how the lookup is written, only that a PUBLIC-URL path never
 * resolves the API secret directly, and that the API path still does.
 */

const WIKI = join(__dirname, "..", "wiki.ts");
const source = readFileSync(WIKI, "utf8");

/**
 * Strip comments before matching. These functions EXPLAIN the credential mix-up in
 * prose, so a bare word search hits the explanation and reports the very bug the
 * comment says was fixed — which is exactly what happened while writing this.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Crude but sufficient: the text from a function's signature to the next top-level `\n}`. */
function bodyOf(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found in wiki.ts`);
  const end = source.indexOf("\n}", start);
  if (end === -1) throw new Error(`Could not find the end of ${name}`);
  return stripComments(source.slice(start, end));
}

/** Reached from a public WIKI URL — the token is the client's share link. */
const PUBLIC_URL_PATHS = [
  "addWikiIntakeItemByToken",
  "attachWikiIntakeItemImageByToken",
  "getWikiIntakeItemImageBytesByToken",
  "publicWikiIntakeState",
];

describe("intake credential resolution", () => {
  it.each(PUBLIC_URL_PATHS)("%s resolves the public share token", (name) => {
    const body = bodyOf(name);
    expect(
      body,
      `${name} serves /api/wiki/[token]/… where the token comes off the client's own wiki ` +
        `URL. It must resolve via resolveWikiIdByPublicToken.`,
    ).toContain("resolveWikiIdByPublicToken");
  });

  it.each(PUBLIC_URL_PATHS)("%s does not resolve courseIngestToken directly", (name) => {
    // This is the actual defect: a share-token path querying the API secret.
    expect(
      /where:\s*\{\s*courseIngestToken/.test(bodyOf(name)),
      `${name} must not look up courseIngestToken — that is the inbound API secret, not the ` +
        `client's wiki link, and querying it here is why every client submission 404'd.`,
    ).toBe(false);
  });

  it("the inbound API path still authenticates with courseIngestToken only", () => {
    // The two credentials must not become interchangeable: a shared wiki URL
    // should never also authorise the full API (list, patch, delete).
    const body = bodyOf("ingestWikiItemsByToken");
    expect(body).toMatch(/where:\s*\{\s*courseIngestToken/);
    expect(body).not.toContain("resolveWikiIdByPublicToken");
  });

  it("the shared resolver tries share tokens before the ingest token", () => {
    const body = bodyOf("resolveWikiIdByPublicToken");
    const share = body.indexOf("shareToken");
    const section = body.indexOf("pageShareTokens");
    const ingest = body.indexOf("courseIngestToken");
    expect(share).toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(-1);
    // Order matters: it mirrors resolvePublicWiki, and the ingest token is only a
    // compatibility fallback for anything that worked against this route before.
    expect(share).toBeLessThan(section);
    expect(section).toBeLessThan(ingest);
  });

  it("only accepts a whole-wiki share that is actually enabled", () => {
    // Otherwise a revoked wiki link would still accept submissions.
    expect(bodyOf("resolveWikiIdByPublicToken")).toContain("shareEnabled: true");
  });
});
