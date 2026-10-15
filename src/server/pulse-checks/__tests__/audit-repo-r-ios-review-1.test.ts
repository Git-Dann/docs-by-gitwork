import { describe, it, expect } from "vitest";
import { evaluateIosChecks } from "../ios-app";
import { evaluateIosExtendedChecks } from "../ios-app-extended";
import { evaluateReactNativeChecks } from "../react-native-app";
import { evaluateCrossPlatformExtendedChecks } from "../cross-platform-extended";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

// Adversarial review of the r-ios fix group: each case is two-sided — the input the
// review found mishandled, and a representative correct input that must not move.

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const at = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

describe("xp_image_caching — SKIPPED stays SKIPPED on a thin sample", () => {
  const unsampled = Array.from({ length: 20 }, (_, i) => `app/screens/unsampled_${i}.tsx`);

  it("does not rewrite 'no remote images' into INCONCLUSIVE", () => {
    const s = snap({ "app/home.tsx": "export const Home = () => <View><Text>Hi</Text></View>;" }, unsampled);
    expect(at(evaluateCrossPlatformExtendedChecks(s, "react-native"), "xp_image_caching").status).toBe("SKIPPED");
  });

  it("still reports an uncached remote image as INCONCLUSIVE on the same thin sample", () => {
    const s = snap(
      { "app/home.tsx": "export const Home = () => <Image source={{ uri: avatarUrl }} />;" },
      unsampled,
    );
    expect(at(evaluateCrossPlatformExtendedChecks(s, "react-native"), "xp_image_caching").status).toBe("INCONCLUSIVE");
  });
});

describe("rn accessibility — a nested element inside a prop does not end the tag", () => {
  const buttons = (attrs: string) =>
    Array.from({ length: 6 }, (_, i) => `<Button icon={<PlusIcon size={16} />} onPress={() => go(${i})} ${attrs} />`).join("\n");
  const pkg = JSON.stringify({ dependencies: { "react-native": "0.86.3" } });
  const run = (attrs: string) =>
    evaluateReactNativeChecks(snap({ "package.json": pkg, "src/screens/Home.tsx": buttons(attrs) }));
  const a11y = (checks: PulseScanCheckInput[]) => at(checks, "rn_accessibility_labels");

  it("credits a label that follows an icon={<X />} prop", () => {
    expect(a11y(run('label="Add item"')).status).toBe("PASS");
  });

  it("still flags the same buttons with no label", () => {
    expect(a11y(run("")).status).not.toBe("PASS");
  });
});

describe("rn_metered_network — switch on the connection type", () => {
  const pkg = JSON.stringify({ dependencies: { "react-native": "0.86.3" } });
  const run = (src: string) =>
    at(evaluateReactNativeChecks(snap({ "package.json": pkg, "src/sync.ts": src })), "rn_metered_network");

  it("passes a switch with case 'cellular'", () => {
    expect(run("switch (state.type) {\n  case 'cellular':\n    return skipPrefetch();\n}\n").status).toBe("PASS");
  });

  it("still warns when NetInfo is only used for online/offline", () => {
    expect(run("const { isConnected } = useNetInfo();\nif (isConnected) sync();\n").status).toBe("WARN");
  });
});

describe("rn_new_architecture — wording says why it passes", () => {
  const run = (rn: string) =>
    at(
      evaluateReactNativeChecks(snap({ "package.json": JSON.stringify({ dependencies: { "react-native": rn } }) })),
      "rn_new_architecture",
    );
  it("explains that 0.82+ is New-Architecture-only", () => {
    expect(run("0.86.3").detail).toMatch(/only on the New Architecture/);
  });
  it("still warns below 0.82 with no flag", () => {
    expect(run("0.79.2").status).toBe("WARN");
  });
});

describe("ios_release_logging — print() does not reach the device log", () => {
  const prints = (n: number, fn: string) => Array.from({ length: n }, (_, i) => `    ${fn}("step ${i}")`).join("\n");

  it("is WARN, not FAIL, for unguarded print() only, and does not claim Console.app access", () => {
    const c = at(
      evaluateIosChecks(snap({ "App/Sync.swift": `import Foundation\nfunc sync() {\n${prints(12, "print")}\n}\n` })),
      "ios_release_logging",
    );
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/Console\.app/);
  });

  it("still FAILs unguarded NSLog", () => {
    const c = at(
      evaluateIosChecks(snap({ "App/Sync.swift": `import Foundation\nfunc sync() {\n${prints(12, "NSLog")}\n}\n` })),
      "ios_release_logging",
    );
    expect(c.status).toBe("FAIL");
  });
});

describe("ios_http_status_discarded — a cast expression is propagation", () => {
  const run = (src: string) => at(evaluateIosChecks(snap({ "App/Net/Client.swift": src })), "ios_http_status_discarded");

  it("does not flag a file that passes (response as? HTTPURLResponse)?.statusCode", () => {
    const src =
      "func send() throws {\n  guard let url = URL(string: path) else { throw APIError(statusCode: nil) }\n" +
      "  throw APIError(statusCode: (response as? HTTPURLResponse)?.statusCode)\n}\n";
    expect(run(src).status).toBe("PASS");
  });

  it("still flags a file that only ever passes nil", () => {
    const src = "func send() throws {\n  if httpResponse.statusCode >= 400 { throw APIError(statusCode: nil) }\n}\n";
    expect(run(src).status).not.toBe("PASS");
  });
});

describe("ios_url_cache — the reloadIgnoringCacheData alias is a disabled cache", () => {
  const run = (src: string) => at(evaluateIosChecks(snap({ "App/Net/Session.swift": src })), "ios_url_cache");

  it("describes the alias as explicitly disabled", () => {
    const c = run("let config = URLSessionConfiguration.default\nconfig.requestCachePolicy = .reloadIgnoringCacheData\n");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/explicitly disabled/);
  });

  it("still passes a sized URLCache", () => {
    expect(run("config.urlCache = URLCache(memoryCapacity: 10_000_000, diskCapacity: 100_000_000)\n").status).toBe("PASS");
  });
});

describe("ios_x_url_scheme_validation — an uppercase URL variable", () => {
  it("credits incomingURL.host == comparison", () => {
    const s = snap({
      "App.swift":
        ".onOpenURL { incomingURL in\n  guard incomingURL.host == \"example.com\" else { return }\n  router.open(incomingURL)\n}\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_url_scheme_validation").status).toBe("PASS");
  });

  it("still warns when the uppercase variable's host is only logged", () => {
    const s = snap({
      "App.swift": ".onOpenURL { incomingURL in\n  print(incomingURL.host ?? \"\")\n  router.open(incomingURL)\n}\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_url_scheme_validation").status).toBe("WARN");
  });
});
