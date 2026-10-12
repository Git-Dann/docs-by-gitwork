import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEAD_STAGES, STAGE_LABEL, STAGE_TRIGGER } from "@/lib/crm/lead-stage-engine";
import { leadStageSchema } from "@/server/validators";

/**
 * The pipeline stages exist in four places that must agree: the Prisma enum, the TS union, the
 * Zod schema and MCP's tool schema. The last two read LEAD_STAGES; this pins LEAD_STAGES to the
 * database enum, so a stage added to one and not the other fails CI instead of 400ing in prod.
 */
describe("LEAD_STAGES is the single list of pipeline stages", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const block = schema.match(/enum LeadStage \{([\s\S]*?)\}/)?.[1] ?? "";
  const dbValues = block
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => /^[A-Z_]+$/.test(l));

  it("matches the Prisma enum exactly", () => {
    expect(dbValues.length).toBeGreaterThan(0);
    expect([...LEAD_STAGES].sort()).toEqual([...dbValues].sort());
  });

  it("is what the API validates against", () => {
    expect([...leadStageSchema.options]).toEqual([...LEAD_STAGES]);
  });

  it("gives every stage a label and a stated trigger", () => {
    for (const s of LEAD_STAGES) {
      expect(STAGE_LABEL[s]).toBeTruthy();
      expect(STAGE_TRIGGER[s].when).toBeTruthy();
    }
  });

  it("is what MCP advertises (no stale hand-typed list)", () => {
    const handler = readFileSync(join(process.cwd(), "src/server/mcp/handler.ts"), "utf8");
    expect(handler).not.toMatch(/\["NEW",\s*"CONTACTED"/);
    expect(handler).toMatch(/const LEAD_STAGE_VALUES = LEAD_STAGES;/);
  });
});
