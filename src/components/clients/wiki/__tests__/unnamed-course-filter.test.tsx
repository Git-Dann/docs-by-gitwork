/**
 * The Course Requests board must be able to isolate unnamed rows.
 *
 * ## Why
 *
 * A course request with no name cannot be actioned — it renders to the client as
 * "Untitled Course" and there is nothing to send a provider. 389 were created in a single
 * run when the import classifier failed (§53).
 *
 * ⚠️ **The board had no way to select them.** They all sit in NEW alongside genuine
 * requests, so "select all" would have swept real work in with them, and the fuzzy search
 * cannot match an empty string. That is the reason clearing them required database access
 * instead of two clicks — the bulk-delete had existed all along.
 *
 * Source-text assertions on purpose: this is a `"use client"` component whose imports drag
 * a React tree into a node test for no benefit, and what is being pinned is that the
 * filter exists, is derived from an empty name, and is hidden on a healthy board.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(
  path.join(process.cwd(), "src/components/clients/wiki/course-requests-section.tsx"),
  "utf8",
);

describe("unnamed course-request filter", () => {
  it("derives the set from an empty course name, not from a status", () => {
    // ⚠️ Not a status: these rows ARE `NEW`. Keying off status would select genuine
    // requests too, which is the whole failure this exists to prevent.
    expect(SOURCE).toMatch(
      /unnamedRequests\s*=\s*nonAddedRequests\.filter\(\(r\) => !r\.courseName\.trim\(\)\)/,
    );
  });

  it("feeds the filtered list, so select-all and bulk delete act on exactly that set", () => {
    // The bulk bar already existed; it operates on `filtered`. If UNNAMED did not reach
    // `filtered`, the chip would highlight rows it could not act on.
    expect(SOURCE).toMatch(/filter === "UNNAMED"\s*\?\s*unnamedRequests/);
  });

  it("is hidden when there are none, and hidden in the client's read-only view", () => {
    // An affordance for a state that should not exist does not belong on a healthy
    // board — and never in front of the client, who cannot act on it.
    expect(SOURCE).toMatch(/!readOnly && unnamedRequests\.length > 0 &&/);
  });
});
