import { describe, it, expect } from "vitest";
import { evaluateCleanlinessChecks, commentedOutCodeLines, maxNestingDepth } from "../code-cleanliness";
import type { RepoSnapshot } from "../native-mobile";

// Audit packet repo-code-cleanliness-1. Every case is shaped on a real repository
// Pulse scanned; each fix has a must-change side and a must-NOT-change side.

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const find = <T extends { checkKey: string }>(checks: T[], key: string) =>
  checks.find((c) => c.checkKey === key);

describe("clean_commented_out_code", () => {
  it("does not read Swift macros and directives as commented-out code (NetNewsWire)", () => {
    const swift = [
      "\t\t#expect(id2 == id1 + 1)",
      "\t\t#expect(activityLog.pendingActivities.count == 2)",
      "\t\t#expect(activityLog.runningActivities[0].startDate != nil)",
      "#if DEBUG",
      "#endif",
    ].join("\n");
    expect(commentedOutCodeLines(swift, "Modules/ActivityLog/Tests/ActivityLogTests/ActivityLogTests.swift")).toBe(0);
  });

  it("still counts # comments in Python and // comments in Swift", () => {
    expect(commentedOutCodeLines("#html_theme = 'alabaster'\n#extensions = []", "docs/conf.py")).toBe(2);
    expect(commentedOutCodeLines("\t\t// let feed = account.existingFeed(withURL: url)", "Mac/AppDelegate.swift")).toBe(1);
  });

  it("does not count atomdoc parameter lists, but still counts real dead statements (atom/atom)", () => {
    const docs = [
      "// * `callback` {Function}",
      "//   * `event` {Object}",
      "//     * `oldBufferPosition` {Point}",
    ].join("\n");
    expect(commentedOutCodeLines(docs, "src/text-editor.js")).toBe(0);
    expect(
      commentedOutCodeLines("// this.emitter.emit('did-change', event);\n// cursor.destroy();", "src/text-editor.js"),
    ).toBe(2);
  });
});

describe("clean_commented_out_code through evaluateCleanlinessChecks", () => {
  it("passes the file path through, so a Swift Testing suite is not dead code", () => {
    const swift = Array.from({ length: 220 }, (_, i) => `\t\t#expect(values[${i}] == ${i})`).join("\n");
    const checks = evaluateCleanlinessChecks(snapshot({ "Tests/ValuesTests.swift": swift }));
    expect(find(checks, "clean_commented_out_code")?.status).toBe("PASS");
  });
});

describe("clean_nesting_depth", () => {
  it("sees Go conditions, which take no parentheses (cli/cli)", () => {
    const go = [
      "func run(exts []Ext) error {",
      "\tfor _, e := range exts {",
      "\t\tif u, err := parse(e); err == nil {",
      "\t\t\tif r, err := from(u); err == nil {",
      "\t\t\t\tif same(searchRepo, r) {",
      "\t\t\t\t\tswitch kind {",
      "\t\t\t\t\tcase 1:",
      "\t\t\t\t\t\treturn nil",
      "\t\t\t\t\t}",
      "\t\t\t\t}",
      "\t\t\t}",
      "\t\t}",
      "\t}",
      "\treturn nil",
      "}",
    ].join("\n");
    expect(maxNestingDepth(go, "pkg/cmd/extension/command.go")).toBe(6);
  });

  it("counts C-style Go loops and composite-literal ranges as blocks", () => {
    const go = [
      "func walk(n int) {",
      "\tif n > 0 {",
      "\t\tfor i := 0; i < n; i++ {",
      "\t\t\tfor _, x := range []int{1, 2} {",
      "\t\t\t\tif x > i {",
      "\t\t\t\t\tuse(x)",
      "\t\t\t\t}",
      "\t\t\t}",
      "\t\t}",
      "\t}",
      "}",
    ].join("\n");
    expect(maxNestingDepth(go, "pkg/walk.go")).toBe(5);
  });

  it("does not count a ?? {} object literal on an if line", () => {
    const js = ["if (a) opts = opts ?? {", "  a: { b: { c: { d: { e: { f: 1 } } } } } };"].join("\n");
    expect(maxNestingDepth(js, "src/app.ts")).toBe(0);
  });

  it("still does not count object literals opened on a condition line", () => {
    const call = ["if (ready) send({", "  a: { b: { c: { d: { e: { f: 1 } } } } },", "});"].join("\n");
    expect(maxNestingDepth(call, "src/app.ts")).toBe(0);
    const ret = ["function f(x) {", "  if (x) return {", "    a: { b: 1 },", "  };", "}"].join("\n");
    expect(maxNestingDepth(ret, "src/app.ts")).toBe(1);
  });
});

describe("clean_debug_statements", () => {
  it("does not count test, benchmark and build-script output as shipped debug output", () => {
    const checks = evaluateCleanlinessChecks(snapshot({
      "packages/app-store/googlecalendar/lib/__tests__/CalendarService.auth.test.ts":
        "it(\"refreshes\", async () => {\n  console.log(\"TESTS: First instance of CalendarService\");\n});",
      "test_benchmarks/benchmarks/gallery_automator.dart": "void warmUp() {\n  print('Warming up.');\n}",
      "script/lib/clean-caches.js": "module.exports = function () {\n  console.log('Cleaning ' + path);\n};",
      "src/app.ts": "export const x = 1;",
    }));
    expect(find(checks, "clean_debug_statements")?.status).toBe("PASS");
  });

  it("still flags console output in application code", () => {
    const checks = evaluateCleanlinessChecks(snapshot({
      "src/main-process/file-recovery-service.js": "function recover(detail) {\n  console.log(detail);\n}",
      "src/app.ts": "export const x = 1;",
    }));
    const c = find(checks, "clean_debug_statements");
    expect(c?.status).toBe("WARN");
    expect(c?.evidence).toContain("src/main-process/file-recovery-service.js");
  });
});

describe("clean_committed_artifacts", () => {
  it("ignores fixture node_modules, a coverage source module, a build config folder and a vendor type shim", () => {
    const checks = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": "export const x = 1;" },
      [
        "spec/fixtures/packages/package-with-incompatible-native-module/node_modules/native-module/package.json",
        "spec/fixtures/packages/package-with-incompatible-native-module/node_modules/native-module/build/Release/native.node",
        "migrations/tooling/lib/migrations/tooling/coverage/schema_columns.rb",
        "build/notice-file/config.yaml",
        "build/notice-file/Readme.md",
        "types/vendor/js-sha256.d.ts",
      ],
    ));
    expect(find(checks, "clean_committed_artifacts")).toBeUndefined();
  });

  it("still flags real committed dependencies and coverage output", () => {
    const deps = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": "export const x = 1;" },
      ["plugins/discourse-events/vendor/holidays/lib/holidays.rb", "node_modules/left-pad/index.js"],
    ));
    expect(find(deps, "clean_committed_artifacts")?.status).toBe("FAIL");
    const cov = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": "export const x = 1;" },
      ["coverage/lcov.info", "coverage/lcov-report/index.html"],
    ));
    expect(find(cov, "clean_committed_artifacts")?.status).toBe("WARN");
  });

  it("does not exempt node_modules committed under examples/ and still flags bundles and HTML coverage", () => {
    const ex = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": "export const x = 1;" },
      ["examples/web/node_modules/react/index.js"],
    ));
    expect(find(ex, "clean_committed_artifacts")?.status).toBe("FAIL");
    const bundles = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": "export const x = 1;" },
      ["build/static/js/main.1a2b3c4d.chunk.js", "build/bundle.js"],
    ));
    expect(find(bundles, "clean_committed_artifacts")?.status).toBe("WARN");
    const html = evaluateCleanlinessChecks(snapshot(
      { "src/app.ts": "export const x = 1;" },
      ["coverage/index.html", "coverage/prettify.js"],
    ));
    expect(find(html, "clean_committed_artifacts")?.status).toBe("WARN");
  });
});

describe("clean_indentation_consistency", () => {
  it("ignores space-indented text inside a Go raw string (cli/cli login_test.go)", () => {
    const goFile = [
      "package login",
      "",
      "func TestLogin(t *testing.T) {",
      ...Array.from({ length: 25 }, (_, i) => `\tgot${i} := run(t, "case-${i}")`),
      "\twant := heredoc.Doc(`",
      "        github.com:",
      "            users:",
      "                monalisa:",
      "                    oauth_token: abc123",
      "            user: monalisa",
      "    `)",
      "\tassert.Equal(t, want, got0)",
      "}",
    ].join("\n");
    const checks = evaluateCleanlinessChecks(snapshot({ "pkg/cmd/auth/login/login_test.go": goFile }));
    expect(find(checks, "clean_indentation_consistency")).toBeUndefined();
  });

  it("still flags a tab-indented Swift file with space-indented code (NetNewsWire)", () => {
    const swift = [
      "import UIKit",
      "",
      "final class AppDelegate: UIResponder {",
      ...Array.from({ length: 25 }, (_, i) => `\tvar setting${i} = false`),
      "    func application(_ application: UIApplication) {",
      "        completionHandler(.newData)",
      "        refresh()",
      "        save()",
      "    }",
      "}",
    ].join("\n");
    const checks = evaluateCleanlinessChecks(snapshot({ "iOS/AppDelegate.swift": swift }));
    expect(find(checks, "clean_indentation_consistency")?.status).toBe("WARN");
  });
});

describe("clean_filename_consistency", () => {
  const files = (names: string[]) => Object.fromEntries(names.map((n, i) => [n, `export const v${i} = ${i};`]));

  it("keeps the WARN but no longer claims mixed conventions cause a deploy bug", () => {
    const checks = evaluateCleanlinessChecks(snapshot(files([
      "src/components/BookingList.tsx", "src/components/EventCard.tsx", "src/components/AppShell.tsx",
      "src/hooks/useBooking.ts", "src/hooks/useEvent.ts", "src/hooks/useLocale.ts",
      "src/lib/date-utils.ts", "src/lib/booking-utils.ts", "src/lib/slug-helpers.ts", "src/lib/api-client.ts",
    ])));
    const c = find(checks, "clean_filename_consistency");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).not.toMatch(/causes a specific bug/);
    expect(c?.detail).toMatch(/case-sensitive/);
  });

  it("still says nothing for a repo with one convention", () => {
    const checks = evaluateCleanlinessChecks(snapshot(files(
      Array.from({ length: 10 }, (_, i) => `src/lib/module-${i}-utils.ts`),
    )));
    expect(find(checks, "clean_filename_consistency")).toBeUndefined();
  });
});

describe("duplication wording", () => {
  const copied = [
    "const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);",
    "const tax = Math.round(total * TAX_RATE);",
    "const shipping = total > FREE_SHIPPING ? 0 : SHIPPING_FEE;",
    "const discount = coupon ? applyCoupon(coupon, total) : 0;",
    "const grandTotal = total + tax + shipping - discount;",
    "if (grandTotal < 0) throw new Error(\"negative total\");",
    "order.total = grandTotal;",
    "order.tax = tax;",
    "order.shipping = shipping;",
    "await saveOrder(order);",
  ];
  const wrap = (name: string) =>
    [`export async function ${name}(order, items, coupon) {`, ...copied.map((l) => "  " + l), "}"].join("\n");

  it("cross-file: reports overlapping windows as windows, with the status unchanged", () => {
    const checks = evaluateCleanlinessChecks(snapshot({ "src/checkout.ts": wrap("checkout"), "src/reprice.ts": wrap("reprice") }));
    const c = find(checks, "clean_duplication_cross_file");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/window/);
    expect(c?.detail).not.toMatch(/block\(s\) of 6\+ lines/);
  });

  it("in-file: same wording correction, status unchanged", () => {
    const checks = evaluateCleanlinessChecks(snapshot({ "src/orders.ts": [wrap("checkout"), wrap("reprice")].join("\n") }));
    const c = find(checks, "clean_duplication_in_file");
    expect(c?.status).toBe("PASS");
    expect(c?.detail).toMatch(/window/);
    expect(c?.detail).not.toMatch(/block\(s\) of 6\+ lines/);
  });

  it("no duplication still reports no cross-file duplication", () => {
    const checks = evaluateCleanlinessChecks(snapshot({ "src/checkout.ts": wrap("checkout") }));
    expect(find(checks, "clean_duplication_cross_file")?.status).toBe("PASS");
  });
});
