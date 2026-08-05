/**
 * The credential-classification branch of the intake-key resolver.
 *
 * Why this file exists: named keys were layered ON TOP of the shared
 * `courseIngestToken` rather than replacing it, precisely because that token is
 * live — Wedge's golf-course request feed authenticates with it. So the branch
 * that matters is not "does a named key work", it is "does a legacy token still
 * pass through completely untouched". Routing a legacy token into the key lookup
 * would 404 a working client integration, and nothing in the type system would
 * complain.
 *
 * Everything else in wiki-intake-keys.ts talks to Prisma, and the house rule is
 * to test pure functions rather than mock the client — so this covers the pure
 * decision and leaves minting/revoking to the post-deploy check.
 */

import { describe, expect, it } from "vitest";
import { classifyPresentedCredential } from "../wiki-intake-keys";

describe("classifyPresentedCredential", () => {
  describe("legacy tokens pass through untouched", () => {
    it("returns a hex-ish shared token verbatim", () => {
      const token = "c1f3a90b77de4c2f8a15e6b0";
      expect(classifyPresentedCredential(token)).toEqual({ kind: "legacy", token });
    });

    it("does not alter case, which would break the downstream lookup", () => {
      const token = "AbCdEf0123456789";
      const result = classifyPresentedCredential(token);
      expect(result).toEqual({ kind: "legacy", token: "AbCdEf0123456789" });
    });

    it("trims surrounding whitespace but nothing else", () => {
      expect(classifyPresentedCredential("  abc123  ")).toEqual({
        kind: "legacy",
        token: "abc123",
      });
    });

    it("treats a token that merely CONTAINS the prefix as legacy", () => {
      // Only a leading prefix marks a named key. A shared token that happens to
      // embed the string must not be sent to the hash lookup.
      const token = "xxfdy_ik_notaprefix";
      expect(classifyPresentedCredential(token)).toEqual({ kind: "legacy", token });
    });

    it("is case-sensitive on the prefix, so an upper-case lookalike stays legacy", () => {
      const token = "FDY_IK_abcdefgh";
      expect(classifyPresentedCredential(token)).toEqual({ kind: "legacy", token });
    });
  });

  describe("named keys", () => {
    it("recognises a minted key by its prefix", () => {
      const key = "fdy_ik_Zm9vYmFyYmF6cXV1eA";
      expect(classifyPresentedCredential(key)).toEqual({ kind: "named", key });
    });

    it("keeps the key byte-identical — it is hashed, so any edit breaks it", () => {
      const key = "fdy_ik_A-b_C0123456789xyz";
      const result = classifyPresentedCredential(key);
      expect(result.kind).toBe("named");
      expect(result.kind === "named" && result.key).toBe(key);
    });

    it("trims whitespace from a pasted key", () => {
      expect(classifyPresentedCredential("\n fdy_ik_abcdefgh \t")).toEqual({
        kind: "named",
        key: "fdy_ik_abcdefgh",
      });
    });
  });

  describe("nothing usable", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["empty string", ""],
      ["whitespace only", "   \n\t "],
    ])("reports %s as empty", (_label, input) => {
      expect(classifyPresentedCredential(input)).toEqual({ kind: "empty" });
    });

    it("reports a bare prefix with no key body as empty, not as a named key", () => {
      // Otherwise this would reach the DB and hash the prefix itself.
      expect(classifyPresentedCredential("fdy_ik_")).toEqual({ kind: "empty" });
    });
  });
});
