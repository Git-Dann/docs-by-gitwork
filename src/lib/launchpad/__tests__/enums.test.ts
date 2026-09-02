import { describe, it, expect } from "vitest";
import { LaunchpadDocStatus, LaunchpadItemStatus } from "@prisma/client";
import {
  LAUNCHPAD_DOC_KEYS,
  LAUNCHPAD_DOC_STATUSES,
  LAUNCHPAD_ITEM_STATUSES,
} from "@/types/launchpad";
import { LEGAL_GENERATORS } from "../legal/render";

/**
 * `src/types/launchpad.ts` declares its status unions as string literals rather
 * than importing the Prisma enums, so the client-facing wiki bundle never pulls the
 * Prisma client in. That is a real win and a real drift risk — adding a status to
 * the schema and forgetting the union would typecheck fine and then fail at
 * runtime on a value the UI has no branch for. This is the tripwire.
 */
describe("the hand-written unions match Prisma", () => {
  it("covers every LaunchpadItemStatus", () => {
    expect([...LAUNCHPAD_ITEM_STATUSES].sort()).toEqual(Object.values(LaunchpadItemStatus).sort());
  });

  it("covers every LaunchpadDocStatus", () => {
    expect([...LAUNCHPAD_DOC_STATUSES].sort()).toEqual(Object.values(LaunchpadDocStatus).sort());
  });
});

describe("every doc key has a generator", () => {
  // `LaunchpadDoc.docKey` is a plain string column rather than an enum, so nothing
  // in the database stops a typo — this is the only thing that does.
  it("and every generator has a doc key", () => {
    expect(Object.keys(LEGAL_GENERATORS).sort()).toEqual([...LAUNCHPAD_DOC_KEYS].sort());
  });
});
