import { describe, expect, it } from "vitest";
import { evaluateCrossPlatformExtendedChecks } from "../cross-platform-extended";
import type { RepoSnapshot } from "../native-mobile";

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

const at = (s: RepoSnapshot, key: string) => {
  const c = evaluateCrossPlatformExtendedChecks(s, "react-native").find((x) => x.checkKey === key);
  if (!c) throw new Error(`missing ${key}`);
  return c;
};

const unsampled = (n: number) => Array.from({ length: n }, (_, i) => `app/screens/unsampled_${i}.tsx`);

describe("xp_error_boundary", () => {
  const noHandler = { "app/screens/home.tsx": "export function Home() { return <View><Text>Hi</Text></View> }" };

  it("is INCONCLUSIVE, not WARN, when the absence rests on a minority sample", () => {
    const c = at(snap(noHandler, unsampled(20)), "xp_error_boundary");
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toMatch(/^Not established/);
  });

  it("still WARNs when the whole source was read and no handler exists", () => {
    expect(at(snap(noHandler), "xp_error_boundary").status).toBe("WARN");
  });

  it("does not accept Sentry.wrap alone — it installs no error boundary", () => {
    const s = snap({ "App.tsx": "function App() { return <Root /> }\nexport default Sentry.wrap(App);" });
    expect(at(s, "xp_error_boundary").status).toBe("WARN");
  });

  // Regression guard only: this passed before the fix too.
  it("passes the mattermost-style ErrorUtils global handler", () => {
    const s = snap({
      "app/utils/error_handling.ts":
        "class H { initializeErrorHandling = () => { initializeSentry(); ErrorUtils.setGlobalHandler(this.errorHandler); }; }",
    });
    expect(at(s, "xp_error_boundary").status).toBe("PASS");
  });

  it("passes react-native-exception-handler's setJSExceptionHandler", () => {
    const s = snap({ "index.js": "setJSExceptionHandler((e, isFatal) => report(e, isFatal), true);" });
    expect(at(s, "xp_error_boundary").status).toBe("PASS");
  });
});

describe("absence checks on a minority sample (xp_safe_area)", () => {
  const noSafeArea = { "app/screens/home.tsx": "export function Home() { return <View><Text>Hi</Text></View> }" };

  it("is INCONCLUSIVE when most of the source was not read", () => {
    const c = at(snap(noSafeArea, unsampled(20)), "xp_safe_area");
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.confidence).toBe("LOW");
  });

  it("still WARNs when the whole source was read", () => {
    expect(at(snap(noSafeArea), "xp_safe_area").status).toBe("WARN");
  });
});

describe("xp_locale_formatting", () => {
  it("still WARNs on a hand-built 24h clock from local getHours()", () => {
    const s = snap({
      "src/lib/clock.ts":
        "export const t = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')",
    });
    expect(at(s, "xp_locale_formatting").status).toBe("WARN");
  });

  it("does not WARN on a UTC-minutes duration padding", () => {
    const s = snap({ "src/lib/duration.ts": "const mm = new Date(ms).getUTCMinutes().toString().padStart(2, '0')" });
    expect(at(s, "xp_locale_formatting").status).not.toBe("WARN");
  });

  it("does not treat AT-URI splitting or a mm:ss duration as hand-built dates (bluesky)", () => {
    const s = snap({
      "src/features/liveEvents/context.tsx": "const [_0, did, _1, rkey] = uri.split('/').filter(Boolean)",
      "src/components/TimeIndicator.tsx":
        "const minutes = Math.floor(time / 60)\nconst seconds = String(time % 60).padStart(2, '0')",
    });
    expect(at(s, "xp_locale_formatting").status).not.toBe("WARN");
  });

  it("recognises Lingui i18n.date as locale-aware", () => {
    const s = snap({ "src/view/Post.tsx": "const label = i18n.date(new Date(post.indexedAt), {dateStyle: 'medium'})" });
    expect(at(s, "xp_locale_formatting").status).toBe("PASS");
  });

  it("still WARNs on a date built from getMonth() + 1", () => {
    const s = snap({
      "src/lib/date.ts": "export const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`",
    });
    const c = at(s, "xp_locale_formatting");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/decimal separator/);
  });

  it("still WARNs on a zero-padded day component", () => {
    const s = snap({ "src/lib/date.ts": "const dd = String(d.getDate()).padStart(2, '0')" });
    expect(at(s, "xp_locale_formatting").status).toBe("WARN");
  });
});

describe("xp_native_module_count", () => {
  const native = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      i % 2 ? `modules/m${i}/ios/View${i}.swift` : `modules/m${i}/android/src/main/java/x/Mod${i}.kt`,
    );
  const shared = (n: number) => Array.from({ length: n }, (_, i) => `src/view/c${i}.tsx`);

  it("passes 42 native files against ~2000 shared files (bluesky)", () => {
    const s = snap({ "src/App.tsx": "export default App" }, [...native(42), ...shared(2072)]);
    expect(at(s, "xp_native_module_count").status).toBe("PASS");
  });

  it("WARNs just past both limits (30 native vs 250 shared)", () => {
    const s = snap({}, [...native(30), ...shared(250)]);
    expect(at(s, "xp_native_module_count").status).toBe("WARN");
  });

  it("PASSes 30 native files when they are under 10% of 400 shared files", () => {
    const s = snap({}, [...native(30), ...shared(400)]);
    expect(at(s, "xp_native_module_count").status).toBe("PASS");
  });

  it("still WARNs when native code is a large share of the project", () => {
    const s = snap({ "src/App.tsx": "export default App" }, [...native(60), ...shared(99)]);
    expect(at(s, "xp_native_module_count").status).toBe("WARN");
  });
});
