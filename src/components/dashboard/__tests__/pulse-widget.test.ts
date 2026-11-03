import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The HQ Pulse tile.
 *
 * ── What it got wrong, live ──────────────────────────────────────────────────
 * It read the WORKSPACE roll-up, which an external viewer cannot see — so a guest's
 * first screen showed a bare em-dash beside the words "avg health" and three grey bars.
 * A statistic about nothing. Observed on a real guest account, not inferred.
 *
 * Zero scans rendered the same dash for ANYONE, including a fresh workspace.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const src = readFileSync(join(ROOT, "src/components/dashboard/pulse-widget.tsx"), "utf8");

/**
 * Source with comments stripped.
 *
 * ⚠️ Assert about CODE against this, never against `src`. An assertion that a phrase is
 * absent will otherwise match the comment explaining why it is absent — which happened
 * here, and four other times in the same session. If a rule is worth a comment, the
 * comment will contain the words the rule forbids.
 */
const code = src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const hooks = readFileSync(join(ROOT, "src/hooks/use-pulse.ts"), "utf8");

describe("empty state", () => {
  it("offers the action instead of printing a dash", () => {
    expect(src).toMatch(/No scans yet/);
    expect(src).toMatch(/href="\/app\/pulse\/new"/);
    expect(src).toMatch(/Run your first scan/);
  });

  it("is reached on zero scans for an INTERNAL viewer too", () => {
    // A fresh workspace had the same dash. The empty state is not a guest feature.
    expect(src).toMatch(/if \(stats\.totalScans === 0\) \{/);
  });

  it("is reached on zero scans for a guest", () => {
    expect(src).toMatch(/if \(mine\.length === 0\) \{/);
  });
});

describe("a guest is shown their own work, not the portfolio", () => {
  it("reads the per-viewer scan list, not the workspace roll-up", () => {
    expect(src).toMatch(/usePulseScans\(undefined, isExternal\)/);
    expect(src).toMatch(/usePulseStats\(!isExternal\)/);
  });

  it("labels it 'your average', never 'avg health'", () => {
    // The internal tile averages every client. A guest's number is only their own
    // scans, and calling it the same thing would be a quiet lie about scope.
    const guestBlock = code.slice(code.indexOf("if (isExternal) {"), code.indexOf("const stats ="));
    expect(guestBlock).toMatch(/your average/);
    expect(guestBlock).not.toMatch(/avg health/);
  });

  it("does not fire the request that can only 403", () => {
    expect(hooks).toMatch(/export function usePulseStats\(enabled = true\)/);
    expect(hooks).toMatch(/export function usePulseScans\(params\?: \{ clientId\?: string \}, enabled = true\)/);
  });
});

describe("it renders in dark mode", () => {
  it("uses tokens, not the hardcoded literals that broke the Care tile", () => {
    // §42.13: #0F172A / #94A3B8 / #475569 / rgba(0,0,0,0.08) are exactly the literals
    // that made a sibling widget unreadable on the navy shell. A guest's HQ is dark.
    for (const literal of ["#0F172A", "#94A3B8", "#475569", "rgba(0,0,0,0.08)", "#22c55e", "#f59e0b", "#ef4444"]) {
      expect(src.includes(literal), `${literal} is a hardcoded colour — use a token`).toBe(false);
    }
  });

  it("uses semantic tokens for the score colours", () => {
    expect(src).toMatch(/var\(--success-500\)/);
    expect(src).toMatch(/var\(--warning-500\)/);
    expect(src).toMatch(/var\(--danger-500\)/);
  });
});
