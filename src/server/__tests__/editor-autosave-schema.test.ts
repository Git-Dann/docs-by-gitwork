/**
 * Tests for Proposal / Document Auto-Save Schema Validation.
 *
 * Verifies that auto-save payloads containing empty string titles, empty cost items,
 * empty timeline fields, or unlinked clientId ("" or null) pass validation without throwing Zod errors.
 */

import { describe, expect, it } from "vitest";
import { proposalUpdateSchema } from "@/server/validators";

describe("Proposal Auto-Save Schema Validation", () => {
  it("validates draft payloads with empty section titles", () => {
    const payload = {
      title: "Test Proposal",
      sections: [
        {
          id: "sec-1",
          key: "prose",
          title: "", // Empty string section title during typing
          sortOrder: 0,
          isVisible: true,
          data: { content: "Sample text..." },
        },
      ],
    };

    const parsed = proposalUpdateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("validates draft payloads with unlinked or empty string clientId", () => {
    const payload = {
      title: "Test Proposal",
      clientId: "", // Empty string from dropdown selection
    };

    const parsed = proposalUpdateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.clientId).toBeNull();
    }
  });

  it("validates draft payloads with empty cost categories or item names", () => {
    const payload = {
      costLineItems: [
        {
          id: "item-1",
          category: "",
          itemName: "",
          quantity: 1,
          unitCost: 100,
          costKind: "ONE_OFF" as const,
          sortOrder: 0,
        },
      ],
    };

    const parsed = proposalUpdateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("validates draft payloads with empty timeline phase names or durations", () => {
    const payload = {
      timelinePhases: [
        {
          id: "phase-1",
          name: "",
          duration: "",
          summary: "",
          deliverables: [],
          sortOrder: 0,
          viewMode: "LIST" as const,
        },
      ],
    };

    const parsed = proposalUpdateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});
