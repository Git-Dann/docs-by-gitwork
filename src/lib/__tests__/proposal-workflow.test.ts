import { describe, expect, it } from "vitest";
import { deriveProposalStatus, resolveProposalStatus } from "@/lib/proposal-workflow";

/**
 * `resolveProposalStatus` exists specifically so a manual status change (the editor's Status
 * dropdown, or the share/accept/decline/archive routes) survives the NEXT edit — an unrelated
 * keystroke, a sign-off checkbox toggle — without being silently recomputed back to whatever
 * `deriveProposalStatus` derives from the sign-off metadata.
 *
 * It was written but never wired into the editor's `updateDraft`, which called
 * `deriveProposalStatus` directly on every single update — so picking "Sent" from the Status
 * dropdown set it for one render and then the very next draft update (any edit at all) reverted it
 * to DRAFT, since no sign-off checkbox was ticked. Reported as "I can't easily change the status."
 */
describe("deriveProposalStatus", () => {
  it("defaults to DRAFT with no sign-off metadata", () => {
    expect(deriveProposalStatus({})).toBe("DRAFT");
  });

  it("is DRAFT outright when the approval track is disabled, regardless of metadata", () => {
    expect(deriveProposalStatus({ approvalChecked: true }, false)).toBe("DRAFT");
  });

  it("reflects each sign-off combination", () => {
    expect(deriveProposalStatus({ productSignOff: true })).toBe("PRODUCT_SIGN_OFF");
    expect(deriveProposalStatus({ techSignOff: true })).toBe("TECH_SIGN_OFF");
    expect(deriveProposalStatus({ productSignOff: true, techSignOff: true })).toBe("IN_REVIEW");
    expect(deriveProposalStatus({ approvalChecked: true })).toBe("APPROVED");
  });
});

describe("resolveProposalStatus", () => {
  it("lets an explicit status win over what the metadata would derive", () => {
    // No sign-off ticked — deriveProposalStatus alone would say DRAFT. The whole point of this
    // function is that a deliberate pick beats that.
    expect(resolveProposalStatus("DRAFT", "SENT", {})).toBe("SENT");
    expect(resolveProposalStatus("DRAFT", "APPROVED", {})).toBe("APPROVED");
  });

  it("lets an explicit status win even over metadata that WOULD derive something else", () => {
    // Picking DRAFT back out of the dropdown while a sign-off box is still ticked must not be
    // immediately overridden by the derivation on the same update.
    expect(resolveProposalStatus("APPROVED", "DRAFT", { approvalChecked: true })).toBe("DRAFT");
  });

  for (const external of ["SENT", "ACCEPTED", "DECLINED", "ARCHIVED"] as const) {
    it(`preserves ${external} across an unrelated edit (no explicit status this update)`, () => {
      // This is the metadata-toggle path: `nextDraft.status` carries the CURRENT status through
      // unchanged, so `explicitStatus` is undefined — the derivation must not clobber it back to
      // DRAFT just because no sign-off box is ticked.
      expect(resolveProposalStatus(external, undefined, {})).toBe(external);
      expect(resolveProposalStatus(external, undefined, { productSignOff: true })).toBe(external);
    });
  }

  it("still derives from metadata when nothing external is in play", () => {
    expect(resolveProposalStatus("DRAFT", undefined, { productSignOff: true })).toBe(
      "PRODUCT_SIGN_OFF",
    );
    expect(resolveProposalStatus("PRODUCT_SIGN_OFF", undefined, {})).toBe("DRAFT");
  });
});
