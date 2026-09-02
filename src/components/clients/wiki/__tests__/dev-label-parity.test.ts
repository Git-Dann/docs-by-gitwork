import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TASK_LABELS, TASK_LABEL_LABELS } from "@/types/tasks";

/**
 * The wiki Requests form offers the SAME dev labels the task board uses, so a
 * promoted request lands already categorised. That list is written out literally
 * in `wiki-intake-section.tsx` (a client component on the public wiki bundle)
 * rather than imported, so nothing but this test stops the two drifting — and a
 * drifted list means a client picks a label the board can't represent, which the
 * Zod enum then rejects at submit time with no clue why.
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/components/clients/wiki/wiki-intake-section.tsx"),
  "utf8",
);

function parseArray(name: string): string[] {
  const match = SOURCE.match(new RegExp(`const ${name}: DevLabel\\[\\] = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`Could not find ${name} in wiki-intake-section.tsx`);
  return [...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

function parseLabelMap(): Record<string, string> {
  const match = SOURCE.match(/const DEV_LABEL_LABEL: Record<DevLabel, string> = \{([\s\S]*?)\};/);
  if (!match) throw new Error("Could not find DEV_LABEL_LABEL in wiki-intake-section.tsx");
  return Object.fromEntries(
    [...match[1].matchAll(/([A-Z_]+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
}

describe("wiki Requests dev labels stay in step with the task board", () => {
  it("offers exactly the canonical TASK_LABELS, in the same order", () => {
    expect(parseArray("DEV_LABELS")).toEqual(TASK_LABELS);
  });

  it("uses the same human-readable label text as the board", () => {
    const wikiMap = parseLabelMap();
    for (const label of TASK_LABELS) {
      expect(wikiMap[label], `label text for ${label}`).toBe(TASK_LABEL_LABELS[label]);
    }
  });

  it("declares the DevLabel union over the same members", () => {
    const match = SOURCE.match(/type DevLabel = ([^;]+);/);
    expect(match, "DevLabel union should exist").toBeTruthy();
    const members = [...match![1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
    expect(members).toEqual([...TASK_LABELS].sort());
  });
});
