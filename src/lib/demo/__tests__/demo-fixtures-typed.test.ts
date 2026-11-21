/**
 * The demo's fixtures are checked by the compiler, and this is what keeps them that way.
 *
 * Two defects have shipped from an untyped fixture and both were invisible until someone
 * looked at the rendered page:
 *
 *   - `status:` where the DTO says `health:` — so no demo connector had ever rendered a
 *     health state at all, and "a channel has stopped delivering" was unverifiable on the one
 *     surface where an auth-gated module CAN be verified (§42.16).
 *   - `as unknown as WikiDTO` on the demo wiki, which hid a crash on first paint (§49.2).
 *
 * Neither was a runtime bug in the product. Both were a fixture quietly disagreeing with the
 * shape the component reads — which is exactly what TypeScript checks for free, as soon as the
 * fixture has a type. This file has two jobs:
 *
 *   1. PROVE the mechanism still bites. The `@ts-expect-error` lines below are checked by
 *      `tsc --noEmit`, which `npm run verify` runs: if a key the DTO does not have stops being
 *      an error, tsc reports an UNUSED directive and the gate fails. That is the two-sided
 *      test — it fails when the bug comes back AND when the guard stops guarding.
 *   2. RATCHET the count of untyped fixtures down. A new bare literal in `dev-demo-data.ts` is
 *      a new place the compiler cannot help, so the number may fall and never rise.
 */

import { describe, expect, it } from "vitest";
import { readSource } from "@/testing/source";
import type { Connection, SupportMemberLite } from "@/types/support";
import type { ClientListItem } from "@/types/client";
import type { PulseScanListItem } from "@/types/pulse";

const CONNECTION: Connection = {
  id: "c1",
  clientId: "client-1",
  source: "imap",
  label: "support@example.com",
  authMode: "manual",
  health: "connected",
};

describe("a fixture's type rejects the keys that have really shipped wrong", () => {
  it("rejects `status` on a Connection — the §42.16 defect", () => {
    // @ts-expect-error `status` is not a key of Connection; the field is `health`.
    const wrong: Connection[] = [{ ...CONNECTION, status: "connected" }];
    expect(wrong).toHaveLength(1);
  });

  it("rejects a key the DTO does not have even on a Partial fixture", () => {
    // `Partial<T>` is how a deliberately-incomplete fixture is typed (the demo client picker
    // reads three fields of thirty). The excess-property check still fires, which is the whole
    // reason `Partial` is safe to reach for here rather than `as unknown as`.
    // @ts-expect-error `nmae` is not a key of ClientListItem.
    const wrong: Partial<ClientListItem>[] = [{ id: "c1", nmae: "Northwind" }];
    expect(wrong).toHaveLength(1);
  });

  it("rejects a member with no role — the shape `listSupportMembers` really returns", () => {
    // @ts-expect-error `role` is required; the demo sent none for a year.
    const wrong: SupportMemberLite[] = [{ id: "m1", name: "Harry", email: "harry@example.com" }];
    expect(wrong).toHaveLength(1);
  });

  it("rejects a scan row with no share state — §39.1's fields, which no fixture carried", () => {
    // @ts-expect-error `isShared` and `shareToken` are required on PulseScanListItem.
    const wrong: PulseScanListItem[] = [{
      id: "s1", workspaceId: "w", clientId: null, clientName: null, projectName: "x",
      inputType: "URL", inputUrl: "https://x.test", inputGithubRepo: null,
      status: "COMPLETED", healthScore: 80, generatedProposalId: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }];
    expect(wrong).toHaveLength(1);
  });
});

/**
 * A top-level `const demoX = {` or `= [` with no type annotation: a literal whose shape nothing
 * checks. Initialisers that carry their own type (`new Map<…>()`, a call to a typed function,
 * `.map()` over a typed array) are not counted — the compiler already has those.
 */
function untypedFixtures(): string[] {
  const src = readSource("src/lib/demo/dev-demo-data.ts").split("\n");
  const found: string[] = [];
  src.forEach((line, i) => {
    const m = /^(?:export )?const (demo[A-Za-z0-9_]+)\s*=\s*[[{]/.exec(line);
    if (m) found.push(`${m[1]} (line ${i + 1})`);
  });
  return found;
}

describe("the demo's fixtures stay typed", () => {
  // ⚠️ This number may fall and never rise. If a change needs a new bare literal, give it a
  // type instead — `Partial<T>` where the fixture is deliberately a subset, which still
  // rejects a key the DTO does not have (the test above proves that).
  const CEILING = 0;

  it(`has at most ${CEILING} untyped fixtures`, () => {
    const found = untypedFixtures();
    expect(found, `untyped fixtures:\n  ${found.join("\n  ")}`).toHaveLength(CEILING);
  });

  it("counts a bare literal, so the ratchet cannot be satisfied by an empty sweep", () => {
    // The matcher itself, proved against the shape it exists to catch.
    const line = "const demoThing = {";
    expect(/^(?:export )?const (demo[A-Za-z0-9_]+)\s*=\s*[[{]/.test(line)).toBe(true);
    expect(/^(?:export )?const (demo[A-Za-z0-9_]+)\s*=\s*[[{]/.test("const demoThing: Thing = {")).toBe(false);
  });
});
