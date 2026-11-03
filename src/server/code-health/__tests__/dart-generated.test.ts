import { describe, expect, it } from "vitest";
import { classifyPath, looksGenerated } from "../analyse";
import { functionFindings } from "../rules";
import type { FunctionMeasure } from "@/types/code-health";

// Both found by scanning a real Flutter client app: they added ~90 days to its estimate.
describe("generated Dart code and copyWith", () => {
  it("skips build_runner output by name and by banner", () => {
    for (const p of ["lib/a.freezed.dart", "lib/a.g.dart", "lib/router.gr.dart", "lib/di.config.dart", "test/a.mocks.dart"]) {
      expect("skip" in classifyPath(p) ? classifyPath(p) : null, p).toMatchObject({ skip: "generated" });
    }
    expect(looksGenerated("// coverage:ignore-file\n// GENERATED CODE - DO NOT MODIFY BY HAND\nclass X {}")).toBe("generated");
    expect("skip" in classifyPath("lib/features/freezer.dart")).toBe(false);
  });

  it("never registers copyWith as debt: its size tracks the type's field count by design", () => {
    const fn = (name: string): FunctionMeasure => ({ name, owner: "State", startLine: 1, endLine: 80, loc: 70, complexity: 27, params: 27, maxNesting: 0 });
    expect(functionFindings("lib/state.dart", fn("copyWith"))).toEqual([]);
    expect(functionFindings("lib/state.dart", fn("copyWithClean"))).toEqual([]);
    expect(functionFindings("lib/state.dart", fn("buildInvoice")).length).toBeGreaterThan(0);
  });
});
