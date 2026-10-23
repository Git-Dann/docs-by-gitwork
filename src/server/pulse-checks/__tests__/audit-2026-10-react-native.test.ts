// Audit, October 2026: the React Native family run against three real apps —
// bluesky-social/social-app (Expo, no committed native shell), mattermost-mobile and
// rainbow (both with android/ + ios/ shells, extensions and library modules). Each
// fixture below is modelled on what those repos actually contain; each test is
// two-sided — the input that must change AND the correct input that must not.
import { describe, expect, it } from "vitest";
import {
  RN_NON_APP_SOURCE,
  evaluateReactNativeChecks,
  parseExpoNativeConfig,
  rnAppShell,
} from "../react-native-app";
import { evaluateCrossPlatformExtendedChecks, manifestPermissions } from "../cross-platform-extended";
import { selectFilesToRead } from "../native-repo";
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
const pkg = (deps: Record<string, string> = {}, rn = "0.86.3") =>
  JSON.stringify({ dependencies: { "react-native": rn, ...deps } });
const rn = (s: RepoSnapshot, key: string) => evaluateReactNativeChecks(s).find((c) => c.checkKey === key);
const xp = (s: RepoSnapshot, key: string) =>
  evaluateCrossPlatformExtendedChecks(s, "react-native").find((c) => c.checkKey === key);

// social-app's real app.config.js shape: unquoted keys, native config via Expo.
const BLUESKY_APP_CONFIG = `module.exports = function () {
  return {
    expo: {
      scheme: 'bluesky',
      ios: {
        infoPlist: {
          NSCameraUsageDescription: 'Used for profile pictures, posts, and other kinds of content.',
          NSMicrophoneUsageDescription: 'Used for posts and other kinds of content.',
          NSPhotoLibraryAddUsageDescription: 'Used to save images to your library.',
          NSPhotoLibraryUsageDescription: 'Used for profile pictures, posts, and other kinds of content',
        },
        associatedDomains: ASSOCIATED_DOMAINS,
      },
      android: { intentFilters: [{ action: 'VIEW', data: [{ scheme: 'https', host: 'bsky.app' }] }] },
      updates: {
        codeSigningCertificate: UPDATES_ENABLED ? './code-signing/certificate.pem' : undefined,
        codeSigningMetadata: UPDATES_ENABLED ? { keyid: 'main', alg: 'rsa-v1_5-sha256' } : undefined,
      },
      plugins: [['expo-build-properties', { android: { enableMinifyInReleaseBuilds: true } }]],
    },
  }
}`;
// A local Expo module's library manifest and gradle — not the app.
const LIBRARY_MODULE = {
  "modules/bottom-sheet/android/build.gradle": "android { buildTypes { release { minifyEnabled false } } }",
  "modules/bottom-sheet/android/src/main/AndroidManifest.xml": `<manifest><uses-permission android:name="android.permission.INTERNET"/></manifest>`,
  "modules/Share-with-Bluesky/Info.plist": "<dict><key>NSExtension</key><dict/></dict>",
};

describe("A — JS/TS files reach the must-read tier", () => {
  // Path-keyword files ("service" +1000) outrank logger/ (+900) and state/ (+700) on
  // keywords alone, so only the must-read tier can get the small files in.
  const views = Array.from({ length: 300 }, (_, i) => ({ path: `src/lib/api/feed/service${i}.ts`, size: 50_000 - i }));

  it("samples logger, the Sentry transport and persisted/index.ts ahead of 300 big API files", () => {
    const tiny = ["src/logger/index.tsx", "src/logger/transports/sentry.ts", "src/state/persisted/index.ts", "src/state/persisted/schema.ts"];
    const { source } = selectFilesToRead([...views, ...tiny.map((path) => ({ path, size: 300 }))], "react-native");
    for (const p of tiny) expect(source).toContain(p);
  });

  it("does not make every `*Token*` / `*Store` file must-read in JS (rainbow: 223 of them)", () => {
    const crypto = Array.from({ length: 200 }, (_, i) => `src/components/token-list/TokenList${i}.tsx`);
    const { source } = selectFilesToRead(
      [...crypto.map((path) => ({ path, size: 40_000 })), { path: "src/logger/sentry.ts", size: 300 }],
      "react-native",
    );
    expect(source).toContain("src/logger/sentry.ts");
  });

  it("leaves Swift must-read behaviour as it was", () => {
    const swift = Array.from({ length: 200 }, (_, i) => `App/Views/View${i}.swift`);
    const { source } = selectFilesToRead(
      [...swift.map((path) => ({ path, size: 40_000 })), { path: "App/Logger.swift", size: 300 }],
      "ios",
    );
    expect(source).toContain("App/Logger.swift");
  });
});

describe("B — tests, mocks and Detox are not sampled or read as app code", () => {
  it("ranks detox/ and __tests__ below real app code (mattermost: 59 of 150 were detox/)", () => {
    const detox = Array.from({ length: 200 }, (_, i) => `detox/e2e/support/server_api/session${i}.ts`);
    const app = Array.from({ length: 150 }, (_, i) => `app/screens/screen${i}.tsx`);
    const { source } = selectFilesToRead(
      [...detox.map((path) => ({ path, size: 60_000 })), ...app.map((path) => ({ path, size: 1_000 }))],
      "react-native",
    );
    expect(source.filter((p) => RN_NON_APP_SOURCE.test(p))).toHaveLength(0);
  });

  it("only applies to React Native — a web repo's test files keep their old rank", () => {
    const { source } = selectFilesToRead([{ path: "src/__tests__/auth.test.ts", size: 1_000 }], "none");
    expect(source).toContain("src/__tests__/auth.test.ts");
  });

  it("does not count a Jest test's token write as app evidence", () => {
    const s = snap({
      "package.json": pkg({ "@react-native-async-storage/async-storage": "2" }),
      "src/__tests__/auth.test.ts": "await AsyncStorage.setItem('access_token', 'x')",
    });
    expect(rn(s, "rn_token_storage")).toBeUndefined();
  });
});

describe("C — the app shell, not every manifest in the repo", () => {
  it("finds no shell in an Expo CNG app whose only manifests are library modules (social-app)", () => {
    const shell = rnAppShell(snap({ "package.json": pkg(), ...LIBRARY_MODULE }));
    expect(shell.hasAndroid).toBe(false);
    expect(shell.hasIos).toBe(false);
    expect(shell.androidManifest + shell.androidGradle + shell.iosPlist).toBe("");
  });

  it("reads the app target but not extensions, test targets or the debug manifest (mattermost)", () => {
    const shell = rnAppShell(snap({
      "android/app/src/main/AndroidManifest.xml": "<main/>",
      "android/app/src/debug/AndroidManifest.xml": "<debug/>",
      "android/app/build.gradle": "app-gradle",
      "libraries/@mattermost/rnshare/android/build.gradle": "lib-gradle",
      "ios/Mattermost/Info.plist": "<key>CFBundleName</key><string>Mattermost</string>",
      "ios/MattermostShare/Info.plist": "<key>NSExtension</key><dict/>",
      "ios/MattermostTests/Info.plist": "<key>CFBundleName</key><string>Tests</string>",
    }));
    expect(shell.androidManifest).toContain("<main/>");
    expect(shell.androidManifest).not.toContain("<debug/>");
    expect(shell.androidDebugManifest).toContain("<debug/>");
    expect(shell.androidGradle).toContain("app-gradle");
    expect(shell.androidGradle).not.toContain("lib-gradle");
    expect(shell.iosPlist).toContain("Mattermost");
    expect(shell.iosPlist).not.toContain("NSExtension");
    expect(shell.iosPlist).not.toContain("Tests");
  });

  it("parses unquoted Expo keys from app.config.js", () => {
    const cfg = parseExpoNativeConfig(BLUESKY_APP_CONFIG);
    expect(cfg.minify).toBe(true);
    expect(cfg.scheme).toBe(true);
    expect(cfg.associatedDomains).toBe(true);
    expect(cfg.intentFilters).toBe(true);
    expect(cfg.iosUsageDescriptions).toHaveLength(4);
    expect(cfg.androidPermissions).toBeNull();
  });
});

describe("1 — rn_password_retention needs a storage write keyed on a password", () => {
  it("fails AsyncStorage.setItem('user_password', pw)", () => {
    const s = snap({ "package.json": pkg(), "src/auth.ts": "await AsyncStorage.setItem('user_password', pw)" });
    expect(rn(s, "rn_password_retention")?.status).toBe("FAIL");
  });
  it("is not emitted for a password form field or a metric name (social-app)", () => {
    const s = snap({
      "package.json": pkg({ "@react-native-async-storage/async-storage": "2" }),
      "src/Login.tsx": "const field = { type: 'password', }\nax.metric('signin:forgotPasswordPressed', {})",
    });
    expect(rn(s, "rn_password_retention")).toBeUndefined();
  });
});

describe("2 — rn_android_proguard reads the app's gradle and the Expo config", () => {
  it("passes social-app's enableMinifyInReleaseBuilds: true despite a library gradle", () => {
    const s = snap({ "package.json": pkg(), "app.config.js": BLUESKY_APP_CONFIG, ...LIBRARY_MODULE });
    expect(rn(s, "rn_android_proguard")?.status).toBe("PASS");
  });
  it("still warns on the template's `def enableProguardInReleaseBuilds = false` (rainbow, mattermost)", () => {
    const s = snap({ "package.json": pkg(), "android/app/build.gradle": "def enableProguardInReleaseBuilds = false" });
    const c = rn(s, "rn_android_proguard");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/explicitly disabled/);
  });
});

describe("3/4 — xp_platform_parity_permissions compares runtime-permission categories", () => {
  it("SKIPS an Expo app whose Android permissions are generated (social-app), not '0 vs 0' PASS", () => {
    const s = snap({ "package.json": pkg(), "app.config.js": BLUESKY_APP_CONFIG, "src/App.tsx": "x", ...LIBRARY_MODULE });
    const c = xp(s, "xp_platform_parity_permissions");
    expect(c?.status).toBe("SKIPPED");
    expect(c?.detail).toMatch(/Expo generates/);
  });

  const MATTERMOST_MANIFEST = [
    "INTERNET", "VIBRATE", "RECEIVE_BOOT_COMPLETED", "CAMERA", "READ_MEDIA_AUDIO", "WRITE_EXTERNAL_STORAGE",
    "ACCESS_NETWORK_STATE", "ACCESS_FINE_LOCATION", "RECORD_AUDIO", "POST_NOTIFICATIONS", "BLUETOOTH_CONNECT",
  ].map((p) => `<uses-permission android:name="android.permission.${p}" />`).join("\n") +
    `\n<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" tools:node="remove" />`;
  const MATTERMOST_PLIST = ["BluetoothAlways", "Camera", "LocationWhenInUse", "Microphone", "PhotoLibrary", "FaceID"]
    .map((k) => `<key>NS${k}UsageDescription</key><string>x</string>`).join("\n");

  it("passes mattermost: normal permissions and extension plists no longer count", () => {
    const s = snap({
      "package.json": pkg(),
      "src/App.tsx": "x",
      "android/app/src/main/AndroidManifest.xml": MATTERMOST_MANIFEST,
      "ios/Mattermost/Info.plist": MATTERMOST_PLIST,
      "ios/MattermostShare/Info.plist": "<key>NSExtension</key><dict/><key>NSContactsUsageDescription</key>",
    });
    expect(xp(s, "xp_platform_parity_permissions")?.status).toBe("PASS");
  });

  it("warns when Android requests CAMERA and iOS has no NSCameraUsageDescription", () => {
    const s = snap({
      "package.json": pkg(),
      "src/App.tsx": "x",
      "android/app/src/main/AndroidManifest.xml": `<uses-permission android:name="android.permission.CAMERA"/>`,
      "ios/App/Info.plist": "<key>CFBundleName</key><string>App</string>",
    });
    const c = xp(s, "xp_platform_parity_permissions");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/Android requests camera/);
  });

  it("drops permissions a manifest removes with tools:node=remove", () => {
    expect(manifestPermissions(MATTERMOST_MANIFEST)).not.toContain("FOREGROUND_SERVICE_SPECIAL_USE");
    expect(manifestPermissions(MATTERMOST_MANIFEST)).toContain("CAMERA");
  });
});

describe("5 — xp_deep_link_both_platforms reads the Expo config", () => {
  it("passes social-app's scheme/associatedDomains/intentFilters as configured on both", () => {
    const s = snap({ "package.json": pkg(), "app.config.js": BLUESKY_APP_CONFIG, "src/App.tsx": "x", ...LIBRARY_MODULE });
    const c = xp(s, "xp_deep_link_both_platforms");
    expect(c?.status).toBe("PASS");
    expect(c?.detail).not.toMatch(/Neither/);
  });
  it("does not count the launcher intent-filter as an Android deep link", () => {
    const s = snap({
      "package.json": pkg(),
      "src/App.tsx": "x",
      "android/app/src/main/AndroidManifest.xml":
        `<intent-filter><action android:name="android.intent.action.MAIN"/></intent-filter>`,
      "ios/App/Info.plist": "<key>CFBundleURLSchemes</key><array><string>app</string></array>",
    });
    expect(xp(s, "xp_deep_link_both_platforms")?.status).toBe("WARN");
  });
});

describe("6 — xp_ota_rollback", () => {
  const ota = { "package.json": pkg({ "expo-updates": "1" }), "src/App.tsx": "x" };
  it("SKIPS rather than passing on a rollbackConvoOptimistic helper (social-app)", () => {
    const s = snap({ ...ota, "src/state/convo.ts": "function rollbackConvoOptimistic() { revert() }" });
    const c = xp(s, "xp_ota_rollback");
    expect(c?.status).toBe("SKIPPED");
    expect(c?.detail).toMatch(/eas update:rollback/);
  });
  it("passes an explicit CodePush rollback setting", () => {
    const s = snap({ ...ota, "src/update.ts": "codePush.sync({ rollbackRetryOptions: { delayInHours: 1 } })" });
    expect(xp(s, "xp_ota_rollback")?.status).toBe("PASS");
  });
});

describe("7/8 — one support floor for both checks", () => {
  it("WARNs 0.83.9 and 0.85.x on both checks", () => {
    for (const v of ["0.83.9", "0.85.2"]) {
      const s = snap({ "package.json": pkg({}, v), "src/App.tsx": "x" });
      expect(rn(s, "rn_version_supported")?.status).toBe("WARN");
      expect(xp(s, "xp_dependency_maintenance")?.status).toBe("WARN");
    }
  });
  it("PASSes 0.86.x and 0.88.0 on both", () => {
    for (const v of ["0.86.1", "^0.88.0"]) {
      const s = snap({ "package.json": pkg({}, v), "src/App.tsx": "x" });
      expect(rn(s, "rn_version_supported")?.status).toBe("PASS");
      expect(xp(s, "xp_dependency_maintenance")?.status).toBe("PASS");
    }
  });
});

describe("9 — rn_accessibility_labels credits text= and visible text children", () => {
  it("passes mattermost-style <Button text={...}> and <Pressable><Text>…</Text></Pressable>", () => {
    const src = [
      ...Array.from({ length: 5 }, () => `<Button text={intl.formatMessage(msg)} onPress={go} />`),
      ...Array.from({ length: 4 }, () => `<Pressable onPress={go}>\n  <Text style={s}>Save</Text>\n</Pressable>`),
    ].join("\n");
    expect(rn(snap({ "package.json": pkg(), "src/Screen.tsx": src }), "rn_accessibility_labels")?.status).toBe("PASS");
  });
  it("still fails icon-only touchables", () => {
    const src = Array.from({ length: 6 }, () => `<TouchableOpacity onPress={go}>\n  <Icon name="close"/>\n</TouchableOpacity>`).join("\n");
    expect(rn(snap({ "package.json": pkg(), "src/Screen.tsx": src }), "rn_accessibility_labels")?.status).toBe("FAIL");
  });
});

describe("10 — rn_deeplink_credentials sees a token read off a received link", () => {
  it("warns on mattermost's parsedUrl.query?.MMAUTHTOKEN in a Linking handler", () => {
    const s = snap({
      "package.json": pkg(),
      "app/screens/sso/sso.tsx":
        "Linking.addEventListener('url', onURLChange)\nconst bearerToken = parsedUrl.query?.MMAUTHTOKEN;",
    });
    const c = rn(s, "rn_deeplink_credentials");
    expect(c?.status).toBe("WARN");
    expect(c?.evidence).toBe("app/screens/sso/sso.tsx");
  });
  it("passes an opaque code (query.login_code)", () => {
    const s = snap({
      "package.json": pkg(),
      "app/screens/sso/sso.tsx": "Linking.addEventListener('url', f)\nconst loginCode = parsedUrl.query?.login_code;",
    });
    expect(rn(s, "rn_deeplink_credentials")?.status).toBe("PASS");
  });
});

describe("11 — rn_certificate_pinning", () => {
  it("passes mattermost's network-client pinning", () => {
    const s = snap({
      "package.json": pkg({ "@mattermost/react-native-network-client": "1.11.5" }),
      "app/managers/network_manager.ts": "defaultMessage: 'Invalid pinned SSL certificate'",
    });
    expect(rn(s, "rn_certificate_pinning")?.status).toBe("PASS");
  });
  it("is INCONCLUSIVE, never WARN, when nothing is found", () => {
    const c = rn(snap({ "package.json": pkg(), "src/api.ts": "fetch(url)" }), "rn_certificate_pinning");
    expect(c?.status).toBe("INCONCLUSIVE");
  });
});

describe("12 — rn_token_storage needs storage evidence, not co-occurrence", () => {
  const asyncDep = { "@react-native-async-storage/async-storage": "2" };
  it("is not emitted when the token store is memory-only and only tests name tokens (rainbow)", () => {
    const s = snap({
      "package.json": pkg(asyncDep),
      "src/state/session.ts": "let accessToken; export const setToken = (t) => { accessToken = t }",
      "src/utils/abi.ts": "AsyncStorage.setItem(`abi-${address}`, abi)",
      "src/__tests__/auth.test.ts": "await AsyncStorage.setItem('access_token', 'x')",
    });
    expect(rn(s, "rn_token_storage")).toBeUndefined();
  });
  it("still FAILS social-app: whole state persisted to AsyncStorage, schema holds accessJwt", () => {
    const s = snap({
      "package.json": pkg(asyncDep),
      "src/state/persisted/index.ts":
        "const BSKY_STORAGE = 'BSKY_STORAGE'\nawait AsyncStorage.setItem(BSKY_STORAGE, rawData)",
      "src/state/persisted/schema.ts": "accessJwt: z.string().optional(), refreshJwt: z.string().optional(),",
    });
    const c = rn(s, "rn_token_storage");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toMatch(/persisted\/index\.ts.*schema\.ts/);
  });
  it("still flags a direct token write", () => {
    const s = snap({ "package.json": pkg(asyncDep), "src/auth.ts": "await AsyncStorage.setItem('refresh_token', t)" });
    expect(rn(s, "rn_token_storage")?.status).toBe("FAIL");
  });
});

describe("13 — rn_list_virtualization", () => {
  it("ignores a self-closing ScrollView followed by an unrelated .map() (rainbow)", () => {
    const s = snap({
      "package.json": pkg(),
      "src/a.tsx": "<ScrollView contentContainerStyle={s} />\nconst ids = items.map((i) => i.id)",
    });
    expect(rn(s, "rn_list_virtualization")).toBeUndefined();
  });
  it("caps a real ScrollView .map() at WARN, and counts @shopify/flash-list as a virtual list", () => {
    const body = "<ScrollView>\n{rows.map((r) => <Row key={r.id} />)}\n</ScrollView>";
    const withDep = rn(snap({ "package.json": pkg({ "@shopify/flash-list": "1" }), "src/a.tsx": body }), "rn_list_virtualization");
    expect(withDep?.status).toBe("WARN");
    expect(withDep?.detail).toMatch(/alongside virtualised lists/);
    expect(rn(snap({ "package.json": pkg(), "src/a.tsx": body }), "rn_list_virtualization")?.status).toBe("WARN");
  });
});

describe("14 — xp_locale_formatting", () => {
  it("does not WARN on `month: date.getMonth() + 1,` in an object literal (rainbow)", () => {
    const s = snap({ "src/picker.ts": "const model = { month: date.getMonth() + 1, year: date.getFullYear() }" });
    expect(xp(s, "xp_locale_formatting")?.status).not.toBe("WARN");
  });
  it("still WARNs on a date concatenated with '/' separators", () => {
    const s = snap({ "src/d.ts": "const s = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear()" });
    expect(xp(s, "xp_locale_formatting")?.status).toBe("WARN");
  });
  it("is INCONCLUSIVE on a thin sample", () => {
    const s = snap(
      { "src/d.ts": "const s = `${d.getMonth() + 1}/${d.getDate()}`" },
      Array.from({ length: 20 }, (_, i) => `src/u${i}.ts`),
    );
    expect(xp(s, "xp_locale_formatting")?.status).toBe("INCONCLUSIVE");
  });
});

describe("mechanism fixes", () => {
  it("rn_reporting_pii_scrub: a sanitiser elsewhere is not a beforeSend hook", () => {
    const base = { "package.json": pkg({ "@sentry/react-native": "6" }) };
    expect(rn(snap({ ...base, "src/form.ts": "const clean = sanitizeInput(x); redactionEpoch" }), "rn_reporting_pii_scrub")?.status)
      .toBe("WARN");
    expect(rn(snap({ ...base, "src/logger/sentry.ts": "Sentry.init({ beforeSend(event) { return scrub(event) } })" }), "rn_reporting_pii_scrub")?.status)
      .toBe("PASS");
  });

  it("rn_cleartext_traffic: a debug-only manifest passes, the main manifest fails", () => {
    const debugOnly = snap({
      "package.json": pkg(),
      "android/app/src/debug/AndroidManifest.xml": `<application android:usesCleartextTraffic="true"/>`,
      "android/app/src/main/AndroidManifest.xml": `<application android:name=".MainApplication"/>`,
    });
    const c = rn(debugOnly, "rn_cleartext_traffic");
    expect(c?.status).toBe("PASS");
    expect(c?.detail).toMatch(/debug-only/);
    const main = snap({
      "package.json": pkg(),
      "android/app/src/main/AndroidManifest.xml": `<application android:usesCleartextTraffic="true"/>`,
    });
    expect(rn(main, "rn_cleartext_traffic")?.status).toBe("FAIL");
  });

  it("OTA signing requires a signing setting, not any `publicKey`", () => {
    const base = { "package.json": pkg({ "expo-updates": "1" }), "src/App.tsx": "x" };
    const wallet = snap({ ...base, "src/wallet.ts": "const publicKey = deriveKey(seed)" });
    expect(rn(wallet, "rn_ota_update_signing")?.status).toBe("WARN");
    expect(xp(wallet, "xp_ota_updates_signed")?.status).toBe("WARN");
    const signed = snap({ ...base, "app.config.js": BLUESKY_APP_CONFIG });
    expect(rn(signed, "rn_ota_update_signing")?.status).toBe("PASS");
    expect(xp(signed, "xp_ota_updates_signed")?.status).toBe("PASS");
  });

  it("rn_hermes_enabled / rn_new_architecture read unquoted Expo keys and say 'disabled'", () => {
    expect(rn(snap({ "package.json": pkg(), "app.config.js": "export default { jsEngine: 'jsc' }" }), "rn_hermes_enabled")?.status)
      .toBe("WARN");
    expect(rn(snap({ "package.json": pkg(), "app.config.js": "export default { jsEngine: 'hermes' }" }), "rn_hermes_enabled")?.status)
      .toBe("PASS");
    const off = rn(snap({ "package.json": pkg({}, "0.76.9"), "android/gradle.properties": "newArchEnabled=false" }), "rn_new_architecture");
    expect(off?.detail).toMatch(/explicitly disabled/);
    expect(rn(snap({ "package.json": pkg({}, "0.76.9"), "app.config.js": "export default { newArchEnabled: true }" }), "rn_new_architecture")?.status)
      .toBe("PASS");
  });

  it("absence(): a thin-sample WARN becomes INCONCLUSIVE; a dependency PASS is not relabelled", () => {
    const unread = Array.from({ length: 20 }, (_, i) => `src/u${i}.ts`);
    expect(rn(snap({ "package.json": pkg(), "src/a.ts": "x" }, unread), "rn_image_caching")?.status).toBe("INCONCLUSIVE");
    const c = rn(snap({ "package.json": pkg({ "expo-image": "1" }), "src/a.ts": "x" }, unread), "rn_image_caching");
    expect(c?.status).toBe("PASS");
    expect(c?.detail).not.toMatch(/inconclusive/i);
  });

  it("xp 'none found' PASS is not HIGH on a thin sample", () => {
    const thin = snap({ "src/a.ts": "x" }, Array.from({ length: 20 }, (_, i) => `src/u${i}.ts`));
    expect(xp(thin, "xp_bridge_eval")?.confidence).toBe("MEDIUM");
    expect(xp(snap({ "src/a.ts": "x" }), "xp_bridge_eval")?.confidence).toBe("HIGH");
  });

  it("xp_bridge_eval: retrieval( is not eval(", () => {
    expect(xp(snap({ "src/a.ts": "const r = await retrieval(query)" }), "xp_bridge_eval")?.status).toBe("PASS");
    expect(xp(snap({ "src/a.ts": "eval(remote)" }), "xp_bridge_eval")?.status).toBe("FAIL");
  });

  it("rn_bundled_secret: a header name is not a secret (mattermost)", () => {
    const hdr = snap({ "package.json": pkg(), "app/client/rest/constants.ts": "export const HEADER_X_PREAUTH_SECRET = 'X-Mattermost-Preauth-Secret'" });
    expect(rn(hdr, "rn_bundled_secret")).toBeUndefined();
    // Built at runtime so no key-shaped literal is committed (GitHub push protection).
    const key = snap({ "package.json": pkg(), "src/c.ts": `const apiKey = '${"sk_" + "live_" + "9xT4kQ2mL7vR8pW3nZ5bY1cH"}'` });
    expect(rn(key, "rn_bundled_secret")?.status).toBe("FAIL");
  });

  it("xp_release_assertions: `if (IS_TEST || __DEV__)` is a guard (rainbow)", () => {
    expect(xp(snap({ "src/a.ts": "if (IS_TEST || __DEV__) { return }" }), "xp_release_assertions")?.status).toBe("PASS");
  });
});
