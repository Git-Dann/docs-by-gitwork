import { describe, it, expect } from "vitest";
import { evaluateReactNativeChecks } from "../react-native-app";
import type { RepoSnapshot } from "../native-mobile";

function snapshot(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const find = (checks: { checkKey: string }[], key: string) =>
  checks.find((c) => c.checkKey === key) as { status: string; detail?: string; evidence?: string } | undefined;
const pkg = (rn: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ dependencies: { "react-native": rn }, ...extra });

describe("audit repo-react-native-app-1 — rn_version_supported window", () => {
  // Floor moved to 0.86 when 0.88 shipped (2026-10-15); see audit-2026-10-react-native.test.ts.
  it("warns on 0.84 now that 0.88 is current, and states the 0.86 floor", () => {
    const c = find(evaluateReactNativeChecks(snapshot({ "package.json": pkg("0.84.2") })), "rn_version_supported");
    expect(c?.status).toBe("WARN");
    const mm = find(evaluateReactNativeChecks(snapshot({ "package.json": pkg("0.83.9") })), "rn_version_supported");
    expect(mm?.detail).toMatch(/0\.86 and above/);
  });
  it("still passes a current version (bluesky 0.86.3)", () => {
    const c = find(evaluateReactNativeChecks(snapshot({ "package.json": pkg("0.86.3") })), "rn_version_supported");
    expect(c?.status).toBe("PASS");
  });
});

describe("audit repo-react-native-app-1 — rn_new_architecture", () => {
  it("passes RN >= 0.82 with no newArchEnabled flag (it is the only architecture)", () => {
    const c = find(evaluateReactNativeChecks(snapshot({ "package.json": pkg("0.86.3") })), "rn_new_architecture");
    expect(c?.status).toBe("PASS");
  });
  it("still warns on an older RN without the flag, and passes it with the flag", () => {
    const old = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.76.9"),
      "android/gradle.properties": "hermesEnabled=true\nnewArchEnabled=false\n",
    })), "rn_new_architecture");
    expect(old?.status).toBe("WARN");
    const on = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.76.9"),
      "android/gradle.properties": "newArchEnabled=true\nhermesEnabled=true\n",
    })), "rn_new_architecture");
    expect(on?.status).toBe("PASS");
  });
});

describe("audit repo-react-native-app-1 — rn_source_maps", () => {
  it("passes an Expo app that uploads maps from package.json scripts (bluesky)", () => {
    const c = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.86.3", { scripts: {
        export: "expo export --platform ios --platform android --dump-sourcemap && pnpm upload-native-sourcemaps",
        "upload-native-sourcemaps": "pnpm exec sentry-expo-upload-sourcemaps dist",
      } }),
    })), "rn_source_maps");
    expect(c?.status).toBe("PASS");
  });
  it("does not pass on the template's commented-out hermesFlags line, but passes sentry.gradle (mattermost)", () => {
    const commented = `android {\n    /* Hermes Commands */\n    // hermesFlags = ["-O", "-output-source-map"]\n}\n`;
    const onlyComment = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.83.9", { scripts: { start: "react-native start" } }),
      "android/app/build.gradle": commented,
    })), "rn_source_maps");
    expect(onlyComment?.status).toBe("WARN");
    const withSentry = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.83.9"),
      "android/app/build.gradle": commented +
        `if (System.getenv("SENTRY_ENABLED") == "true") {\n    apply from: "../../node_modules/@sentry/react-native/sentry.gradle"\n}\n`,
    })), "rn_source_maps");
    expect(withSentry?.status).toBe("PASS");
  });
  it("still warns when scripts carry no source-map step", () => {
    const c = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.86.3", { scripts: { start: "expo start", ios: "expo run:ios" } }),
    })), "rn_source_maps");
    expect(c?.status).toBe("WARN");
  });
});

describe("audit repo-react-native-app-1 — rn_metered_network", () => {
  it("does not pass a bare connectivity listener (mattermost websocket manager)", () => {
    const c = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.83.9"),
      "app/managers/websocket_manager.ts":
        `import NetInfo, {NetInfoStateType} from '@react-native-community/netinfo';\n` +
        `private netType: NetInfoStateType = NetInfoStateType.none;\n` +
        `const netInfo = await NetInfo.fetch();\nthis.netStateSubscription = NetInfo.addEventListener(this.onNetStateChange);\n` +
        `if (netInfo.isConnected) { this.reconnect(); }\n`,
    })), "rn_metered_network");
    expect(c?.status).toBe("WARN");
  });
  it("passes a real connection-type gate", () => {
    const a = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.86.3"),
      "src/media/prefetch.ts": `const state = await NetInfo.fetch();\nif (state.type === 'cellular' && wifiOnly) return;\n`,
    })), "rn_metered_network");
    expect(a?.status).toBe("PASS");
    const b = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.86.3"),
      "src/sync.ts": `if (state.details?.isConnectionExpensive) { deferSync(); }\n`,
    })), "rn_metered_network");
    expect(b?.status).toBe("PASS");
  });
});

describe("audit repo-react-native-app-1 — rn_accessibility_labels", () => {
  it("credits a design-system Button label prop (bluesky)", () => {
    const buttons = Array.from({ length: 6 }, (_, i) =>
      `<Button onPress={() => like(${i})} label={_(msg\`Like post\`)} size="small" color="secondary">\n  <ButtonIcon icon={Heart} />\n</Button>`,
    ).join("\n");
    const c = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.86.3"),
      "src/view/com/post/PostControls.tsx": buttons,
    })), "rn_accessibility_labels");
    expect(c?.status).toBe("PASS");
    expect(c?.evidence).toBe("6/6 labelled");
  });
  it("still fails unlabelled Pressables, and does not credit a label on a non-touchable View", () => {
    const pressables = Array.from({ length: 6 }, () =>
      `<Pressable onPress={() => navigation.goBack()} style={styles.icon}>\n  <CompassIcon name="arrow-left" />\n</Pressable>`,
    ).join("\n");
    const c = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.83.9"),
      "app/screens/header.tsx": `<View accessibilityLabel="Header">\n${pressables}\n</View>`,
    })), "rn_accessibility_labels");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toBe("0/6 labelled");
  });
  it("does not credit label= on a core Pressable (only <Button> takes a label prop)", () => {
    const pressables = Array.from({ length: 6 }, () => `<Pressable onPress={x} label="Back">\n  <Icon />\n</Pressable>`).join("\n");
    const c = find(evaluateReactNativeChecks(snapshot({
      "package.json": pkg("0.83.9"),
      "app/screens/header.tsx": `<View>\n${pressables}\n</View>`,
    })), "rn_accessibility_labels");
    expect(c?.status).not.toBe("PASS");
  });
});
