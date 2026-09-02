import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Which requests a client may edit or withdraw themselves.
 *
 * The rule lives in two places by necessity — the server enforces it, and the
 * component needs it to decide whether to render the buttons — so the risk is
 * that they drift. If the UI's list grows first, a client is offered an Edit
 * button that answers 409; if the server's grows first, a client can change
 * something the UI never intended to expose. Both are silent.
 *
 * PROMOTED and CLOSED must stay out of both lists. A promoted request has become
 * a task a dev owns, and letting the client rewrite or delete it underneath them
 * is exactly the "crap going into their timeline" this was meant to avoid.
 */

const ROOT = join(__dirname, "..", "..", "..");
const server = readFileSync(join(ROOT, "src/server/wiki.ts"), "utf8");
const ui = readFileSync(
  join(ROOT, "src/components/clients/wiki/wiki-intake-section.tsx"),
  "utf8",
);

function listFrom(source: string, declaration: RegExp): string[] {
  const m = source.match(declaration);
  if (!m) throw new Error(`Could not find the status list: ${declaration}`);
  return [...m[1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
}

const serverList = listFrom(
  server,
  /const CLIENT_MUTABLE_STATUSES: WikiIntakeItemStatus\[\] = \[([^\]]+)\]/,
);
const uiList = listFrom(ui, /const CLIENT_EDITABLE = \[([^\]]+)\]/);

describe("client-mutable intake statuses", () => {
  it("server and UI agree exactly", () => {
    expect(uiList, "The UI's CLIENT_EDITABLE must match the server's CLIENT_MUTABLE_STATUSES.").toEqual(
      serverList,
    );
  });

  it("allows the states where nothing downstream exists yet", () => {
    expect(serverList).toContain("NEW");
    expect(serverList).toContain("TRIAGED");
  });

  it.each(["PROMOTED", "CLOSED"])("never allows %s", (status) => {
    expect(serverList, `${status} must not be client-mutable.`).not.toContain(status);
    expect(uiList, `${status} must not be offered in the UI.`).not.toContain(status);
  });

  it("the client route refuses a locked item with 409, not a bare 404", () => {
    // "Not found" for something visible on their screen is what turns into a
    // Slack message; the reason has to be legible.
    const route = readFileSync(
      join(ROOT, "src/app/api/wiki/[token]/intake-items/[id]/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/reason === "locked"/);
    expect(route).toContain("409");
  });
});
