import { describe, it, expect } from "vitest";
import { evaluateAndroidChecks, gradleToggleState, pendingIntentSites, resolveSdkLevels, riskyExportedComponents } from "../android-app";
import { evaluateAndroidExtendedChecks } from "../android-app-extended";
import { stripCStyleComments, type RepoSnapshot } from "../native-mobile";
import { selectFilesToRead } from "../native-repo";

// October 2026 audit of the native Android families against NewPipe, nowinandroid and
// thunderbird-android. Every case is two-sided: the input that was wrong, and a
// representative correct input that must not change. Fixtures are modelled on the
// real repos' files.

type C = { checkKey: string; status: string; confidence?: string; detail?: string; evidence?: string };
const find = (checks: C[], k: string) => checks.find((c) => c.checkKey === k);

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const both = (s: RepoSnapshot) => [...evaluateAndroidChecks(s), ...evaluateAndroidExtendedChecks(s)];
const M = "app/src/main/AndroidManifest.xml";
const manifest = (inner: string, attrs = "") =>
  `<manifest xmlns:android="http://schemas.android.com/apk/res/android"${attrs}>\n<application android:allowBackup="false">\n${inner}\n</application>\n</manifest>`;

// ── S1: comment stripping per file, per language ─────────────────────────────
describe("S1 — a Java banner comment must not delete the files after it", () => {
  // NewPipe's Java files open with a banner like this one: a second opener before the
  // closer. Under Kotlin/Swift nesting rules it never closes.
  const BANNER = "/*//////////////////////////////////////////////////////////////////////////*/\n" +
    "package org.schabi.newpipe.streams;\nclass Banner {}\n";
  const STORAGE = "fun export() { val dir = Environment.getExternalStorageDirectory() }\n";

  it("finds external storage in a file sampled after a Java banner", () => {
    const out = evaluateAndroidChecks(snap({
      "app/src/main/java/a/Banner.java": BANNER,
      "app/src/main/java/a/Export.kt": STORAGE,
    }));
    expect(find(out, "android_external_storage")?.status).toBe("WARN");
  });

  it("stays quiet when the only mention is commented out (stripping still works)", () => {
    const out = evaluateAndroidChecks(snap({
      "app/src/main/java/a/Banner.java": BANNER,
      "app/src/main/java/a/Export.kt": `// ${STORAGE}`,
    }));
    expect(find(out, "android_external_storage")).toBeUndefined();
  });

  it("Kotlin/Swift nested comments: code after the outer closer survives, the inner text does not", () => {
    const out = stripCStyleComments("/* a /* b */ c */ realCode()", { nestedBlocks: true });
    expect(out).toContain("realCode()");
    expect(out).not.toContain(" c ");
  });

  it("Java does not nest: the banner closes at its first closer", () => {
    expect(stripCStyleComments(BANNER, { nestedBlocks: false })).toContain("class Banner");
    // Default behaviour (nesting) is kept for every existing caller.
    expect(stripCStyleComments(BANNER)).not.toContain("class Banner");
  });
});

// ── S2: Android build inputs get their own read budget ───────────────────────
describe("S2 — manifests and build files are not crowded out by the general config cap", () => {
  const entries = [
    ...Array.from({ length: 27 }, (_, i) => ({ path: `feature/f${i}/src/main/AndroidManifest.xml`, size: 500 })),
    ...Array.from({ length: 27 }, (_, i) => ({ path: `feature/f${i}/build.gradle.kts`, size: 500 })),
    ...Array.from({ length: 120 }, (_, i) => ({ path: `lib/l${i}/build.gradle.kts`, size: 500 })),
    ...Array.from({ length: 100 }, (_, i) => ({ path: `i18n/x${i}.json`, size: 200 })),
    { path: ".github/workflows/ci.yml", size: 300 },
    { path: "build-plugin/src/main/kotlin/thunderbird.app.android.gradle.kts", size: 300 },
    { path: "gradle/libs.versions.toml", size: 300 },
    { path: "app-common/src/main/res/xml/network_security_config.xml", size: 300 },
  ];

  it("reads every manifest, the convention script, the catalog and the NSC, and still the CI workflow", () => {
    const { config } = selectFilesToRead(entries, "android");
    expect(config.filter((p) => p.endsWith("AndroidManifest.xml"))).toHaveLength(27);
    expect(config).toContain(".github/workflows/ci.yml");
    expect(config).toContain("build-plugin/src/main/kotlin/thunderbird.app.android.gradle.kts");
    expect(config).toContain("gradle/libs.versions.toml");
    expect(config).toContain("app-common/src/main/res/xml/network_security_config.xml");
    // Module build files (dirs with a main manifest) are read before unrelated ones.
    expect(config).toContain("feature/f26/build.gradle.kts");
  });

  it("other shapes keep the single 60-file cap", () => {
    const { config } = selectFilesToRead(entries, "flutter");
    expect(config.length).toBeLessThanOrEqual(60);
    expect(config).toContain(".github/workflows/ci.yml");
  });
});

describe("S2/A6 — a 'not declared' manifest verdict needs every manifest read", () => {
  const NOTIFY = { "app/src/main/java/a/Notify.kt": "val b = NotificationCompat.Builder(ctx, \"c\")" };

  it("POST_NOTIFICATIONS: INCONCLUSIVE when a manifest was not read (thunderbird)", () => {
    const out = evaluateAndroidChecks(snap({ [M]: manifest(""), ...NOTIFY }, ["legacy/core/src/main/AndroidManifest.xml"]));
    const c = find(out, "android_notification_permission");
    expect(c?.status).toBe("INCONCLUSIVE");
    expect(c?.confidence).toBe("LOW");
  });

  it("POST_NOTIFICATIONS: still FAILs when every manifest was read and none declares it", () => {
    const out = evaluateAndroidChecks(snap({ [M]: manifest(""), ...NOTIFY }));
    expect(find(out, "android_notification_permission")?.status).toBe("FAIL");
  });
});

describe("A7 — provider PASS with an unread manifest is not established", () => {
  const PROVIDER = `<provider android:name="androidx.core.content.FileProvider" android:exported="false" />`;
  it("INCONCLUSIVE when a manifest is unread", () => {
    const out = evaluateAndroidChecks(snap({ [M]: manifest(PROVIDER) }, ["feature/migration/provider/src/main/AndroidManifest.xml"]));
    expect(find(out, "android_content_provider_exposure")?.status).toBe("INCONCLUSIVE");
  });
  it("PASS when every manifest was read", () => {
    const out = evaluateAndroidChecks(snap({ [M]: manifest(PROVIDER) }));
    expect(find(out, "android_content_provider_exposure")?.status).toBe("PASS");
  });
});

// ── S3/A5: SKIPPED means "does not apply", never "we did not see it" ──────────
describe("S3/A5 — WebView and StrictMode absence is gated", () => {
  const thin = (extra: Record<string, string> = {}) =>
    snap({ [M]: manifest(""), "app/src/main/java/a/Main.kt": "class Main", ...extra },
      Array.from({ length: 20 }, (_, i) => `app/src/main/java/a/Other${i}.kt`));

  it("no WebView in a thin sample: INCONCLUSIVE, LOW — not SKIPPED", () => {
    const c = find(evaluateAndroidExtendedChecks(thin()), "android_x_webview_js_enabled");
    expect(c?.status).toBe("INCONCLUSIVE");
    expect(c?.confidence).toBe("LOW");
  });

  it("no WebView with every file read: SKIPPED at HIGH", () => {
    const c = find(evaluateAndroidExtendedChecks(snap({ [M]: manifest(""), "app/src/main/java/a/Main.kt": "class Main" })), "android_x_webview_js_enabled");
    expect(c?.status).toBe("SKIPPED");
    expect(c?.confidence).toBe("HIGH");
  });

  it("an unread file named for a WebView keeps it INCONCLUSIVE even at sound coverage (thunderbird MessageWebView.kt)", () => {
    const s = snap({ [M]: manifest(""), "app/src/main/java/a/Main.kt": "class Main", "app/src/main/java/a/B.kt": "class B" },
      ["legacy/ui/src/main/java/com/fsck/k9/view/MessageWebView.kt"]);
    expect(find(evaluateAndroidExtendedChecks(s), "android_x_webview_file_access")?.status).toBe("INCONCLUSIVE");
  });

  it("StrictMode: unread Application class named in the manifest → INCONCLUSIVE (nowinandroid NiaApplication.kt)", () => {
    const s = snap({ [M]: manifest("").replace("<application", '<application android:name=".NiaApplication"'), "app/src/main/java/a/Main.kt": "class Main", "app/src/main/java/a/B.kt": "class B" },
      ["app/src/main/kotlin/com/google/samples/apps/nowinandroid/NiaApplication.kt"]);
    expect(find(evaluateAndroidExtendedChecks(s), "android_x_strict_mode")?.status).toBe("INCONCLUSIVE");
  });

  it("StrictMode guarded by isDebuggable() in the same file passes; a guard in ANOTHER file does not", () => {
    const strict = "StrictMode.setThreadPolicy(Builder().detectAll().penaltyLog().build())";
    const guarded = snap({ [M]: manifest(""), "app/src/main/java/a/App.kt": `fun setup() {\n if (isDebuggable()) {\n ${strict}\n }\n}` });
    expect(find(evaluateAndroidExtendedChecks(guarded), "android_x_strict_mode")?.status).toBe("PASS");
    const split = snap({
      [M]: manifest(""),
      "app/src/main/java/a/A.kt": "fun a() { if (BuildConfig.DEBUG) { log() } }",
      "app/src/main/java/a/B.kt": `fun b() { ${strict} }`,
    });
    expect(find(evaluateAndroidExtendedChecks(split), "android_x_strict_mode")?.status).toBe("WARN");
  });
});

// ── A1: release logging ─────────────────────────────────────────────────────
describe("A1 — release logging is an absence finding", () => {
  const LOG = { "app/src/main/java/a/Net.kt": 'fun f() { Log.d("net", "x") }' };
  it("thin sample: WARN at LOW (thunderbird, 4%)", () => {
    const out = evaluateAndroidChecks(snap(LOG, Array.from({ length: 20 }, (_, i) => `app/src/main/java/a/O${i}.kt`)));
    expect(find(out, "android_release_logging")?.confidence).toBe("LOW");
  });
  it("full sample: WARN at HIGH; a PASS no longer carries 'no BuildConfig.DEBUG' as evidence", () => {
    expect(find(evaluateAndroidChecks(snap(LOG)), "android_release_logging")?.confidence).toBe("HIGH");
    const pass = find(evaluateAndroidChecks(snap({ "app/src/main/java/a/Net.kt": 'fun f() { if (BuildConfig.DEBUG) Log.d("n", "x") }' })), "android_release_logging");
    expect(pass?.status).toBe("PASS");
    expect(pass?.evidence).not.toMatch(/no BuildConfig/);
  });
});

// ── A2: one minify predicate for both families ───────────────────────────────
describe("A2 — computed minify is INCONCLUSIVE in both families", () => {
  const TB = `android {\n  buildTypes {\n    val isCI = providers.gradleProperty("ci").map(String::toBoolean).orElse(false)\n    release {\n      isMinifyEnabled = !isCI.get()\n      isShrinkResources = !isCI.get()\n    }\n  }\n}`;
  const NIA = `release {\n  isMinifyEnabled = providers.gradleProperty("minifyWithR8")\n      .map(String::toBooleanStrict).getOrElse(true)\n}`;

  it("thunderbird's `!isCI.get()` → INCONCLUSIVE/LOW in both, and resource shrinking is not SKIPPED", () => {
    const out = both(snap({ [M]: manifest(""), "app-thunderbird/build.gradle.kts": TB }));
    expect(find(out, "android_minify_enabled")?.status).toBe("INCONCLUSIVE");
    expect(find(out, "android_x_code_shrinking")?.status).toBe("INCONCLUSIVE");
    expect(find(out, "android_x_code_shrinking")?.confidence).toBe("LOW");
    expect(find(out, "android_x_resource_shrinking")?.status).toBe("INCONCLUSIVE");
  });

  it("nowinandroid's getOrElse(true) → PASS in both; a literal false → WARN in both", () => {
    const on = both(snap({ [M]: manifest(""), "app/build.gradle.kts": NIA }));
    expect(find(on, "android_minify_enabled")?.status).toBe("PASS");
    expect(find(on, "android_x_code_shrinking")?.status).toBe("PASS");
    const off = both(snap({ [M]: manifest(""), "app/build.gradle": "release {\n minifyEnabled false\n}" }));
    expect(find(off, "android_minify_enabled")?.status).toBe("WARN");
    expect(find(off, "android_x_code_shrinking")?.status).toBe("WARN");
  });

  it("gradleToggleState reads defaults, not just literals", () => {
    expect(gradleToggleState(TB, "minify")).toBe("computed");
    expect(gradleToggleState(NIA, "minify")).toBe("on");
    expect(gradleToggleState('x = p.map(f).getOrElse(false)\nminifyEnabled = flag ?: false', "minify")).toBe("off");
  });
});

// ── A3: App Links to domains the app cannot own ──────────────────────────────
describe("A3 — app links", () => {
  const filter = (host: string) =>
    `<activity android:name=".R" android:exported="true"><intent-filter><action android:name="android.intent.action.VIEW" />` +
    `<category android:name="android.intent.category.BROWSABLE" /><data android:scheme="https" android:host="${host}" /></intent-filter></activity>`;
  it("NewPipe: youtube.com / youtu.be links under org.schabi.newpipe → INCONCLUSIVE", () => {
    const out = evaluateAndroidChecks(snap({ [M]: manifest(filter("www.youtube.com") + filter("youtu.be"), ' package="org.schabi.newpipe"') }));
    expect(find(out, "android_app_links_verified")?.status).toBe("INCONCLUSIVE");
  });
  it("nowinandroid: a host on the app's own domain without autoVerify still WARNs", () => {
    const out = evaluateAndroidChecks(snap({
      [M]: manifest(filter("www.nowinandroid.apps.samples.google.com")),
      "app/build.gradle.kts": 'android { defaultConfig { applicationId = "com.google.samples.apps.nowinandroid" } }',
    }));
    expect(find(out, "android_app_links_verified")?.status).toBe("WARN");
  });
});

// ── A4: exported components judged per element ───────────────────────────────
describe("A4 — exported components", () => {
  it("a receiver with only APPWIDGET_UPDATE is public by contract", () => {
    const m = manifest(`<receiver android:name=".Widget" android:exported="true"><intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter></receiver>`);
    expect(riskyExportedComponents(m)).toEqual([]);
    expect(find(evaluateAndroidChecks(snap({ [M]: m })), "android_exported_components")?.status).toBe("PASS");
  });
  it("a service exported with a custom action and no permission is named", () => {
    const m = manifest(
      `<receiver android:name=".Widget" android:exported="true"><intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter></receiver>` +
      `<service android:name=".SyncService" android:exported="true"><intent-filter><action android:name="com.app.DO_SYNC" /></intent-filter></service>`,
    );
    const c = find(evaluateAndroidChecks(snap({ [M]: m })), "android_exported_components");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toContain(".SyncService");
    expect(c?.detail).not.toContain(".Widget");
  });
  it("a VIEW on the app's own scheme without BROWSABLE is still a finding; mailto VIEW is not", () => {
    expect(riskyExportedComponents(manifest(`<activity android:name=".Home" android:exported="true"><intent-filter><action android:name="android.intent.action.VIEW" /><data android:scheme="k9mail" android:host="messages" /></intent-filter></activity>`))).toEqual([".Home"]);
    expect(riskyExportedComponents(manifest(`<activity android:name=".Compose" android:exported="true"><intent-filter><action android:name="android.intent.action.SENDTO" /><data android:scheme="mailto" /></intent-filter><intent-filter><action android:name="android.intent.action.VIEW" /><data android:scheme="mailto" /></intent-filter></activity>`))).toEqual([]);
  });
});

// ── A8: SDK levels from the app, convention plugins and constants ────────────
describe("A8 — min/target SDK resolution", () => {
  it("app 21 + benchmarks 28 → WARN at 21 (not the benchmark's 28)", () => {
    const out = evaluateAndroidChecks(snap({
      "app/build.gradle.kts": 'plugins { id("com.android.application") }\nandroid { defaultConfig { minSdk = 21 } }',
      "benchmarks/build.gradle.kts": 'plugins { id("com.android.test") }\nandroid { defaultConfig { minSdk = 28 } }',
    }));
    expect(find(out, "android_min_sdk_floor")?.status).toBe("WARN");
    expect(find(out, "android_min_sdk_floor")?.evidence).toBe("minSdk 21");
  });
  it("app 24 only → PASS; a convention plugin + constant resolves (thunderbird / NewPipe)", () => {
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": "android { defaultConfig { minSdk = 24 } }" })), "android_min_sdk_floor")?.status).toBe("PASS");
    const levels = resolveSdkLevels([
      { path: "build-plugin/src/main/kotlin/thunderbird.app.android.gradle.kts", text: 'plugins { id("com.android.application") }\nandroid { defaultConfig { minSdk = ProjectConfig.Android.sdkMin\n targetSdk = ProjectConfig.Android.sdkTarget } }' },
      { path: "build-plugin/plugin/src/main/kotlin/ProjectConfig.kt", text: "object ProjectConfig { object Android { const val sdkMin = 24\n const val sdkTarget = 36 } }" },
      { path: "app/build.gradle.kts", text: 'android { defaultConfig { minSdk {\n version = release(NEWPIPE_MIN)\n } } }\nconst val NEWPIPE_MIN = 23' },
    ], "minSdk");
    expect(levels.app).toEqual([24]);
    expect(levels.other).toEqual([23]);
  });
  it("targetSdk set nowhere readable is INCONCLUSIVE, not omitted; one that is set is graded", () => {
    const none = evaluateAndroidChecks(snap({ "app/build.gradle.kts": "android { defaultConfig { targetSdk = libs.versions.unknown.get().toInt() } }" }));
    expect(find(none, "android_target_sdk_current")?.status).toBe("INCONCLUSIVE");
    expect(find(none, "android_min_sdk_floor")?.status).toBe("INCONCLUSIVE");
    const set = evaluateAndroidChecks(snap({ "app/build.gradle.kts": "android { defaultConfig { targetSdk = 36 } }" }));
    expect(find(set, "android_target_sdk_current")?.status).toBe("PASS");
  });
});

// ── A9: latent false positives once the source is actually read ──────────────
describe("A9 — SQL concatenation of constants, Google API keys", () => {
  it("DDL built from a constant is not injection; a variable is", () => {
    const k = "android_sql_injection";
    expect(find(evaluateAndroidChecks(snap({ "a/S.kt": 'db.execSQL("DROP TABLE " + MISSIONS_TABLE_NAME_v2)' })), k)?.status).toBe("PASS");
    expect(find(evaluateAndroidChecks(snap({ "a/S.kt": 'db.rawQuery("SELECT * FROM t WHERE id = " + userId, null)' })), k)?.status).toBe("FAIL");
    expect(find(evaluateAndroidChecks(snap({ "a/S.kt": "db.rawQuery(sql + userId, null)" })), k)?.status).toBe("FAIL");
  });
  it("a Google AIza key WARNs (restrict, not secret); a Stripe live key still FAILs", () => {
    const k = "android_hardcoded_api_key";
    // Key-shaped values are built at runtime: a literal trips GitHub push protection, and
    // a real key (this test once copied NewPipe's public one) does not belong in the repo.
    const googleKey = "AI" + "za" + "Sy" + "x7Q2pL9vK4mN8rT3wY6zB1cD5fG0hJk2M";
    const stripeKey = "sk_" + "live_" + "9xT4kQ2mL7vR8pW3nZ5bY1cH";
    const g = find(evaluateAndroidChecks(snap({ "a/P.kt": `private const val GOOGLE_API_KEY = "${googleKey}"` })), k);
    expect(g?.status).toBe("WARN");
    expect(g?.detail).toMatch(/restrict/i);
    expect(find(evaluateAndroidChecks(snap({ "a/P.kt": `val apiKey = "${stripeKey}"` })), k)?.status).toBe("FAIL");
  });
});

// ── A11: the network security config decides cleartext ──────────────────────
describe("A11 — network security config", () => {
  const ref = '<application android:networkSecurityConfig="@xml/network_security_config"';
  const m = manifest("").replace("<application", ref);
  const NSC = "app/src/main/res/xml/network_security_config.xml";
  it("no manifest flag + base-config cleartextTrafficPermitted=true → FAIL", () => {
    const out = evaluateAndroidChecks(snap({ [M]: m, [NSC]: '<network-security-config><base-config cleartextTrafficPermitted="true" /></network-security-config>' }));
    expect(find(out, "android_cleartext_traffic")?.status).toBe("FAIL");
  });
  it("cleartext scoped to one domain-config → PASS", () => {
    const out = evaluateAndroidChecks(snap({ [M]: m, [NSC]: '<network-security-config><domain-config cleartextTrafficPermitted="true"><domain>10.0.2.2</domain></domain-config></network-security-config>' }));
    expect(find(out, "android_cleartext_traffic")?.status).toBe("PASS");
  });
  it("a referenced config that was not read → INCONCLUSIVE", () => {
    const out = evaluateAndroidChecks(snap({ [M]: m }, [NSC]));
    expect(find(out, "android_cleartext_traffic")?.status).toBe("INCONCLUSIVE");
  });
});

// ── False-negative classes ────────────────────────────────────────────────────
describe("False negatives closed", () => {
  it("PendingIntentCompat: isMutable=false is immutable; isMutable=true is mutable", () => {
    expect(pendingIntentSites("PendingIntentCompat.getActivity(ctx, 0, intent, 0, false)")).toEqual({ count: 1, immutable: true, mutable: false });
    const out = evaluateAndroidChecks(snap({ "a/N.kt": "PendingIntentCompat.getBroadcast(ctx, 0, i, FLAG_UPDATE_CURRENT, true)" }));
    expect(find(out, "android_pending_intent_mutability")?.status).toBe("WARN");
    expect(find(evaluateAndroidExtendedChecks(snap({ [M]: manifest(""), "a/N.kt": "PendingIntentCompat.getActivity(ctx, 0, i, 0, false)" })), "android_x_pending_intent_mutable")?.status).toBe("PASS");
  });
  it("Gradle `release { isDebuggable = true }` FAILs; debuggable in the debug block does not", () => {
    const k = "android_debuggable_release";
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": "buildTypes {\n release {\n  isDebuggable = true\n }\n}" })), k)?.status).toBe("FAIL");
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": "buildTypes {\n debug {\n  isDebuggable = true\n }\n release {\n  isDebuggable = false\n }\n}" })), k)?.status).toBe("PASS");
  });
  it("dependency pinning: an unread version catalog is INCONCLUSIVE; a dynamic catalog version WARNs", () => {
    const k = "android_dependency_pinning";
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": "dependencies { implementation(libs.okhttp) }" }, ["gradle/libs.versions.toml"])), k)?.status).toBe("INCONCLUSIVE");
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": "x", "gradle/libs.versions.toml": '[versions]\nokhttp = "4.+"\n' })), k)?.status).toBe("WARN");
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": "x", "gradle/libs.versions.toml": '[versions]\nokhttp = "4.12.0"\n' })), k)?.status).toBe("PASS");
  });
});
