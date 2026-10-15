import { describe, expect, it } from "vitest";
import { RAIL_ENTRY_COUNT, RAIL_SECTION_IDS } from "@/components/settings/settings-shell";

/**
 * The rail groups related sections into one row with tabs (Oct 2026: 19 rows became
 * 9). Grouping is presentation only, so the risk is a section that silently stops
 * being reachable from the rail. Every section that renders a panel must sit in
 * exactly one row.
 */
const RENDERED_SECTIONS = [
  "account", "notifications",
  "general", "templates",
  "onboarding", "launchpad",
  "people",
  "integrations", "mcp",
  "agents", "checks", "curator", "foreman",
  "labs",
  "developer",
  "audit", "privacy",
] as const;

describe("settings rail", () => {
  it("reaches every section that renders a panel", () => {
    for (const id of RENDERED_SECTIONS) expect(RAIL_SECTION_IDS, id).toContain(id);
  });

  it("lists each section once", () => {
    expect(new Set(RAIL_SECTION_IDS).size).toBe(RAIL_SECTION_IDS.length);
  });

  it("stays at roughly half the old 19 rows", () => {
    expect(RAIL_ENTRY_COUNT).toBeLessThanOrEqual(10);
  });
});
