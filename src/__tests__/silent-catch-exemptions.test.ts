import { describe, expect, it } from "vitest";

import { readSource } from "@/testing/source";

/**
 * The SILENT-CATCH rule in `scripts/audit-ui-standards.mjs` carries an exemption list, for
 * the catches that return an ordinary answer because the thing really did succeed.
 *
 * ⚠️ The list is the dangerous part. CLAUDE.md §42.16: an exemption that says what the route
 * DOES rather than why it is safe is how `/api/support/discord/channels` stayed ungated for
 * months. So the reason is checked here the way `crontab.test.ts` checks UNSCHEDULED_CRONS —
 * it must exist, name a real file, and be long enough to be an argument rather than a shrug.
 */
const SCRIPT = readSource("scripts/audit-ui-standards.mjs");

type Exemption = { file: string; returns: string; why: string };

function exemptions(): Exemption[] {
  const block = /const SILENT_CATCH_EXEMPT = \[([\s\S]*?)\n\];/.exec(SCRIPT);
  expect(block, "SILENT_CATCH_EXEMPT is gone — did the rule lose its allow-list?").not.toBeNull();
  const out: Exemption[] = [];
  const entry = /\{\s*file:\s*"([^"]+)",\s*returns:\s*"([^"]*)",\s*why:\s*"([^"]*)",?\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(block![1]))) out.push({ file: m[1], returns: m[2], why: m[3] });
  return out;
}

describe("SILENT-CATCH exemptions", () => {
  const list = exemptions();

  it("parses the list (a broken matcher would vouch for an empty one for ever)", () => {
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThan(15);
  });

  it("names a file that exists", () => {
    for (const e of list) {
      expect(() => readSource(e.file), `${e.file} is exempted but not in the tree`).not.toThrow();
    }
  });

  it("still names a catch that really returns that object", () => {
    for (const e of list) {
      const src = readSource(e.file).replace(/\s+/g, " ");
      expect(src, `${e.file} no longer returns ${e.returns} — drop the exemption`).toContain(
        e.returns.replace(/\s+/g, " "),
      );
    }
  });

  it("gives a reason, not a shrug", () => {
    for (const e of list) {
      expect(e.why.length, `${e.file}: "${e.why}" is too short to be an argument`).toBeGreaterThan(60);
    }
  });

  it("says why the return is HONEST, not what the function does", () => {
    // The words an argument uses. A description of the job uses none of them.
    const argues = /\bnot a failure\b|\breally\b|\bhonest\b|\bbecause\b|\bso\b|\bloudly\b|\brather than\b/i;
    for (const e of list) {
      expect(e.why, `${e.file}: the reason describes the route rather than arguing it is safe`).toMatch(argues);
    }
  });
});
