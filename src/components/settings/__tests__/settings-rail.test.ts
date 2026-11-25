import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  "agents", "checks", "curator", "foreman", "dispatch",
  "labs",
  "developer",
  "audit", "privacy",
] as const;

describe("settings rail", () => {
  it("reaches every section that renders a panel", () => {
    for (const id of RENDERED_SECTIONS) expect(RAIL_SECTION_IDS, id).toContain(id);
  });

  it("every section in the rail is one the settings page will open", () => {
    // The page keeps its own VALID_SECTIONS list (a Next page can't export it) and 404s on
    // anything else: Settings → Dispatch shipped in the rail but missing here (Nov 2026).
    const page = readFileSync(join(process.cwd(), "src/app/(app)/app/settings/[section]/page.tsx"), "utf8");
    const list = page.slice(page.indexOf("const VALID_SECTIONS"), page.indexOf("];", page.indexOf("const VALID_SECTIONS")));
    for (const id of RAIL_SECTION_IDS) expect(list, `${id} is in the rail but the page 404s on it`).toContain(`"${id}"`);
  });

  it("lists each section once", () => {
    expect(new Set(RAIL_SECTION_IDS).size).toBe(RAIL_SECTION_IDS.length);
  });

  it("stays at roughly half the old 19 rows", () => {
    expect(RAIL_ENTRY_COUNT).toBeLessThanOrEqual(10);
  });
});
