// @vitest-environment node
/**
 * The platform-family checks that were WITHHELD (check-relevance-data.ts), made valid.
 *
 * Every case is two-sided: the input the withheld reason names, which must no longer
 * produce the wrong verdict, and a realistic correct input whose verdict must not move.
 * Fixtures are slices of the real projects each reason names (NewPipe, nowinandroid,
 * kickstarter/ios-oss, darkreader, vercel/commerce, vercel/next.js), not invented code.
 *
 * Key-shaped strings are assembled at runtime so no literal key appears in this file.
 */
import { describe, expect, it, vi } from "vitest";

// The prompt-injection check reads files over the GitHub API; serve them from a map.
let repoFiles: Record<string, string> = {};
vi.mock("@/lib/github", async (orig) => ({
  ...(await orig<typeof import("@/lib/github")>()),
  safeGithubRequest: vi.fn(async (path: string) => {
    if (path.includes("/git/trees/")) {
      return { tree: Object.keys(repoFiles).map((p) => ({ path: p, type: "blob", size: repoFiles[p].length })) };
    }
    const p = decodeURIComponent(path.match(/\/contents\/(.+)$/)?.[1] ?? "");
    const body = repoFiles[p];
    return typeof body === "string" ? { content: Buffer.from(body, "utf-8").toString("base64"), encoding: "base64" } : {};
  }),
}));

import {
  committedSigningPasswords,
  evaluateAndroidChecks,
  isNonProductionUrl,
  tokenKeyInPrefsApi,
  webViewFileAccess,
  writesPasswordToPrefs,
} from "../android-app";
import { evaluateAndroidExtendedChecks, implicitIntentSites } from "../android-app-extended";
import type { RepoSnapshot } from "../native-mobile";
import { evaluateDesktopChecks } from "../desktop-app";
import { evaluateDesktopExtendedChecks } from "../desktop-app-extended";
import { evaluateIosChecks } from "../ios-app";
import { evaluateIosExtendedChecks } from "../ios-app-extended";
import { evaluateReactNativeChecks } from "../react-native-app";
import { evaluateChromeExtensionChecks } from "../chrome-extension";
import { evaluateExtensionExtendedChecks } from "../chrome-extension-extended";
import { evaluateCliChecks, shellCallSites } from "../cli-tool";
import { evaluateCrossPlatformExtendedChecks } from "../cross-platform-extended";
import { evaluateWebSourceChecks } from "../web-repo-source";
import { findClientBundleSecrets } from "../vibe-security";
import { assessBranchProtection } from "@/server/pulse-agents/code-agent";
import { scanRepoSecrets } from "@/server/pulse-agents/secret-scanner";

const promptCheck = async () =>
  (await scanRepoSecrets("o", "r")).checks.find((c) => c.checkKey === "repo_prompt_injection_risk")!;

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

const M = "app/src/main/AndroidManifest.xml";
const manifest = (inner: string, appAttrs = "") =>
  `<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n<application android:allowBackup="false"${appAttrs}>\n${inner}\n</application>\n</manifest>`;
const gradle = (target: number, extra = "") => ({
  "app/build.gradle.kts":
    `plugins { id("com.android.application") }\nandroid {\n  defaultConfig { targetSdk = ${target} }\n${extra}\n}\n`,
});
const android = (s: RepoSnapshot) => [...evaluateAndroidChecks(s), ...evaluateAndroidExtendedChecks(s)];

// ── Android ─────────────────────────────────────────────────────────────────
describe("android_cleartext_traffic — only the manifests that ship", () => {
  it("passes when cleartext is allowed only in src/debug (the local dev-server overlay)", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest(""),
      "app/src/debug/AndroidManifest.xml": manifest("", ' android:usesCleartextTraffic="true"'),
    })), "android_cleartext_traffic")!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/debug-only/);
  });

  it("still FAILs when the main manifest allows it", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest("", ' android:usesCleartextTraffic="true"'),
      "app/src/debug/AndroidManifest.xml": manifest(""),
    })), "android_cleartext_traffic")!;
    expect(c.status).toBe("FAIL");
  });

  it("still FAILs when a library module's manifest (which merges into the app) allows it", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest(""),
      "core/network/src/main/AndroidManifest.xml": manifest("", ' android:usesCleartextTraffic="true"'),
    })), "android_cleartext_traffic")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("android_content_descriptions — `contentDescription = null` is not a description", () => {
  it("WARNs a Compose app whose every icon passes null", () => {
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Toolbar.kt":
        `@Composable fun Bar() {\n  IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = null) }\n` +
        `  Image(painter = logo, contentDescription = null)\n}\n`,
    })), "android_content_descriptions")!;
    expect(c.status).toBe("WARN");
  });

  it("does not count a parameter declaration, and passes a real description (nowinandroid)", () => {
    const declOnly = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/NiaIcon.kt":
        `@Composable fun NiaIcon(icon: ImageVector, contentDescription: String?) { Icon(icon, contentDescription = null) }\n`,
    })), "android_content_descriptions")!;
    expect(declOnly.status).toBe("WARN");
    const described = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Toolbar.kt":
        `IconButton(onClick = onBack) { Icon(NiaIcons.ArrowBack, contentDescription = stringResource(R.string.back)) }\n`,
    })), "android_content_descriptions")!;
    expect(described.status).toBe("PASS");
  });

  it("says there is nothing to check, rather than passing, when no icons or images exist", () => {
    const c = find(evaluateAndroidChecks(snap({ "app/src/main/java/a/Repo.kt": "class Repo { fun load() = 1 }\n" })), "android_content_descriptions")!;
    expect(c.status).toBe("SKIPPED");
  });
});

describe("android_env_baseurl — environment words are judged on whole host labels", () => {
  it("does not read latest.* or *.evaluate.io as a test host", () => {
    expect(isNonProductionUrl("https://latest.api.example.com/")).toBe(false);
    expect(isNonProductionUrl("https://api.evaluate.io/")).toBe(false);
    expect(isNonProductionUrl("https://contest.example.org/v1")).toBe(false);
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Api.kt": `const val BASE_URL = "https://latest.api.example.com/"\n`,
    })), "android_env_baseurl");
    expect(c).toBeUndefined();
  });

  it("still FAILs a staging or emulator host", () => {
    for (const url of ["https://staging.api.example.com/", "https://api-dev.example.com/", "http://10.0.2.2:8080/", "https://uat.example.co.uk"]) {
      expect(isNonProductionUrl(url), url).toBe(true);
    }
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Api.kt": `const val BASE_URL = "https://staging.api.example.com/"\n`,
    })), "android_env_baseurl")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("android_notification_permission — the merged manifest and the target SDK", () => {
  const PUSH = { "app/src/main/java/a/Push.kt": "class Push : FirebaseMessagingService() { val b = NotificationCompat.Builder(this, \"c\") }\n" };

  it("passes an FCM app on firebase-messaging 23.0.6+, whose library manifest declares the permission", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest(""), ...PUSH,
      ...gradle(34, `dependencies { implementation("com.google.firebase:firebase-messaging:23.4.1") }`),
    })), "android_notification_permission")!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/merged manifest/);
  });

  it("is INCONCLUSIVE when firebase-messaging's version comes from a BOM", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest(""), ...PUSH,
      ...gradle(34, `dependencies { implementation(platform("com.google.firebase:firebase-bom:33.1.0")); implementation("com.google.firebase:firebase-messaging") }`),
    })), "android_notification_permission")!;
    expect(c.status).toBe("INCONCLUSIVE");
  });

  it("still FAILs an app targeting 34 that posts notifications with no FCM and no declaration", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest(""),
      "app/src/main/java/a/Notify.kt": "val b = NotificationCompat.Builder(ctx, \"c\")\n",
      ...gradle(34),
    })), "android_notification_permission")!;
    expect(c.status).toBe("FAIL");
  });

  it("FAILs an old firebase-messaging (below 23.0.6) that does not carry the permission", () => {
    const c = find(evaluateAndroidChecks(snap({
      [M]: manifest(""), ...PUSH,
      ...gradle(34, `dependencies { implementation("com.google.firebase:firebase-messaging:22.0.0") }`),
    })), "android_notification_permission")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("android_password_retention — a password is a string write", () => {
  it("does not match boolean flags named after passwords", () => {
    expect(writesPasswordToPrefs('prefs.edit().putBoolean("remember_password", true).apply()')).toBe(false);
    expect(writesPasswordToPrefs("editor.putBoolean(KEY_SHOW_PASSWORD, visible)")).toBe(false);
    expect(writesPasswordToPrefs('editor.putString("show_password_hint", "x")')).toBe(false);
  });

  it("still matches a password stored as a string", () => {
    expect(writesPasswordToPrefs('prefs.edit().putString("user_password", pw).apply()')).toBe(true);
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Login.kt":
        "val prefs = getSharedPreferences(\"auth\", MODE_PRIVATE)\nprefs.edit().putString(\"saved_password\", pw).apply()\n",
    })), "android_password_retention")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("android_signing_credentials_committed — the debug keystore is public", () => {
  it("ignores the default debug keystore password and a templated value", () => {
    const debug = `android {\n  signingConfigs {\n    getByName("debug") {\n      storeFile = file("debug.keystore")\n      storePassword = "android"\n      keyAlias = "androiddebugkey"\n      keyPassword = "android"\n    }\n    create("release") {\n      storePassword = "$releaseStorePassword"\n    }\n  }\n}\n`;
    expect(committedSigningPasswords([{ path: "app/build.gradle.kts", text: debug }])).toEqual([]);
    expect(find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": debug })), "android_signing_credentials_committed")).toBeUndefined();
  });

  it("ignores a debug block's own password even when it is not 'android'", () => {
    const g = `signingConfigs {\n  debug {\n    storePassword "debugpass1"\n  }\n}\n`;
    expect(committedSigningPasswords([{ path: "app/build.gradle", text: g }])).toEqual([]);
  });

  it("still FAILs a literal release password and names the block", () => {
    const g = `signingConfigs {\n  create("release") {\n    storePassword = "Sup3rS3cretStore"\n  }\n}\n`;
    const c = find(evaluateAndroidChecks(snap({ "app/build.gradle.kts": g })), "android_signing_credentials_committed")!;
    expect(c.status).toBe("FAIL");
    expect(c.detail).toMatch(/create\("release"\)/);
  });
});

describe("android_sql_injection — Kotlin templates, and statements built elsewhere", () => {
  it("FAILs a Kotlin $template inside the rawQuery string", () => {
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Db.kt": `fun find(name: String) = db.rawQuery("SELECT * FROM users WHERE name = '$name'", null)\n`,
    })), "android_sql_injection")!;
    expect(c.status).toBe("FAIL");
  });

  it("does not call a statement built elsewhere safe", () => {
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Db.kt": `fun find(query: String) = db.rawQuery(query, null)\n`,
    })), "android_sql_injection")!;
    expect(c.status).toBe("INCONCLUSIVE");
  });

  it("still passes placeholders and SCREAMING_CASE constants (NewPipe)", () => {
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Db.java":
        `db.rawQuery("SELECT * FROM users WHERE id = ?", new String[]{id});\ndb.execSQL("DROP TABLE " + MISSIONS_TABLE_NAME_v2);\n`,
    })), "android_sql_injection")!;
    expect(c.status).toBe("PASS");
  });
});

describe("android_token_storage — the receiver decides, not the method name", () => {
  it("does not match an OAuth response parsed with JSONObject, or a Bundle", () => {
    expect(tokenKeyInPrefsApi('val token = json.getString("access_token")')).toBe(false);
    expect(tokenKeyInPrefsApi('val t = JSONObject(body).getString("refresh_token")')).toBe(false);
    expect(tokenKeyInPrefsApi('outState.putString("access_token", token)')).toBe(false);
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Auth.kt":
        "val prefs = getSharedPreferences(\"settings\", MODE_PRIVATE)\nval theme = prefs.getString(\"theme\", \"dark\")\n" +
        "fun parse(json: JSONObject) { val token = json.getString(\"access_token\") }\n",
    })), "android_token_storage");
    expect(c).toBeUndefined();
  });

  it("still FAILs a token written to SharedPreferences", () => {
    const c = find(evaluateAndroidChecks(snap({
      "app/src/main/java/a/Auth.kt":
        "val prefs = getSharedPreferences(\"auth\", MODE_PRIVATE)\nprefs.edit().putString(\"access_token\", token).apply()\n",
    })), "android_token_storage")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("android_webview_file_access / android_x_webview_file_access — Kotlin properties and the API 30 default", () => {
  it("reads the Kotlin property form", () => {
    expect(webViewFileAccess("webView.settings.allowUniversalAccessFromFileURLs = true").universal).toBe(true);
    expect(webViewFileAccess("settings.apply { allowFileAccess = true }").file).toBe(true);
    expect(webViewFileAccess("settings.allowFileAccess = false").fileOff).toBe(true);
    // allowFileAccessFromFileURLs is a different setting from allowFileAccess.
    expect(webViewFileAccess("settings.allowFileAccessFromFileURLs = true").file).toBe(false);
    const out = android(snap({
      "app/src/main/java/a/Web.kt": "val wv = WebView(ctx)\nwv.settings.allowUniversalAccessFromFileURLs = true\n",
      ...gradle(34),
    }));
    expect(find(out, "android_webview_file_access")!.status).toBe("FAIL");
    expect(find(out, "android_x_webview_file_access")!.status).toBe("FAIL");
  });

  it("does not call file access disabled below API 30, where it defaults on", () => {
    const out = android(snap({ "app/src/main/java/a/Web.kt": "val wv = WebView(ctx)\nwv.loadUrl(url)\n", ...gradle(29) }));
    expect(find(out, "android_webview_file_access")!.status).toBe("WARN");
    expect(find(out, "android_x_webview_file_access")!.status).toBe("WARN");
  });

  it("passes at API 30+ or when switched off explicitly", () => {
    const modern = android(snap({ "app/src/main/java/a/Web.kt": "val wv = WebView(ctx)\nwv.loadUrl(url)\n", ...gradle(34) }));
    expect(find(modern, "android_webview_file_access")!.status).toBe("PASS");
    expect(find(modern, "android_x_webview_file_access")!.status).toBe("PASS");
    const off = android(snap({
      "app/src/main/java/a/Web.kt": "val wv = WebView(ctx)\nwv.settings.allowFileAccess = false\n",
      ...gradle(28),
    }));
    expect(find(off, "android_webview_file_access")!.status).toBe("PASS");
  });
});

describe("android_x_implicit_intent_sensitive — per intent, not two whole-codebase words", () => {
  it("passes a share button in an app that mentions 'author' and FileProvider authorities", () => {
    const files = [{
      path: "app/src/main/java/a/Share.kt",
      text: "val i = Intent(Intent.ACTION_SEND).apply { type = \"text/plain\"; putExtra(Intent.EXTRA_TEXT, article.url) }\n" +
        "startActivity(Intent.createChooser(i, null))\nval author = article.author\nval authority = \"${BuildConfig.APPLICATION_ID}.fileprovider\"\n",
    }];
    expect(implicitIntentSites(files).some((s) => s.sensitive)).toBe(false);
    const c = find(evaluateAndroidExtendedChecks(snap({ [M]: manifest(""), [files[0].path]: files[0].text })), "android_x_implicit_intent_sensitive")!;
    expect(c.status).toBe("PASS");
  });

  it("WARNs an implicit intent that carries a token", () => {
    const text = "val i = Intent(Intent.ACTION_SEND)\ni.putExtra(\"auth_token\", session.accessToken)\nstartActivity(i)\n";
    const c = find(evaluateAndroidExtendedChecks(snap({ [M]: manifest(""), "app/src/main/java/a/Leak.kt": text })), "android_x_implicit_intent_sensitive")!;
    expect(c.status).toBe("WARN");
  });

  it("does not WARN when the intent names its target package", () => {
    const text = "val i = Intent(Intent.ACTION_VIEW)\ni.setPackage(\"com.acme.companion\")\ni.putExtra(\"auth_token\", t)\nstartActivity(i)\n";
    expect(implicitIntentSites([{ path: "a.kt", text }])).toEqual([]);
  });
});

// ── Desktop ─────────────────────────────────────────────────────────────────
const ELECTRON_PKG = (major: number) =>
  JSON.stringify({ name: "app", version: "1.0.0", devDependencies: { electron: `^${major}.0.0` } });
const desktop = (files: Record<string, string>, shape: "electron" | "tauri" = "electron") =>
  [...evaluateDesktopChecks(snap(files), shape), ...evaluateDesktopExtendedChecks(snap(files), shape)];

describe("desktop_crash_reporting — a wrapper outside the sample is not absence", () => {
  it("passes a startCrashReporter wrapper and a crash-reporter module by name", () => {
    expect(find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "startCrashReporter()" }), "desktop_crash_reporting")!.status).toBe("PASS");
    expect(find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "app.whenReady()" }, ), "desktop_crash_reporting")!.status).toBe("WARN");
  });

  it("does not report absence confidently on a thin sample", () => {
    const thin = evaluateDesktopChecks(snap({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "app.whenReady()" },
      Array.from({ length: 40 }, (_, i) => `src/renderer/F${i}.ts`)), "electron");
    expect(find(thin, "desktop_crash_reporting")!.confidence).toBe("LOW");
  });
});

describe("electron_code_signing — signing tooling declared as a dependency", () => {
  it("passes @electron/notarize in package.json", () => {
    const pkg = JSON.stringify({ name: "app", version: "1.0.0", devDependencies: { electron: "^42.0.0", "@electron/notarize": "^2.0.0" } });
    expect(find(desktop({ "package.json": pkg, "src/main/index.ts": "app.whenReady()" }), "electron_code_signing")!.status).toBe("PASS");
  });
  it("still says unconfirmed (LOW) when nothing is visible", () => {
    const c = find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "app.whenReady()" }), "electron_code_signing")!;
    expect([c.status, c.confidence]).toEqual(["WARN", "LOW"]);
  });
});

describe("electron_navigation_guard — handlers outside main-named files (atom-window.js)", () => {
  it("passes a will-navigate handler in src/main-process/atom-window.js", () => {
    const c = find(desktop({
      "package.json": ELECTRON_PKG(42),
      // atom's layout: the entry is main-process/main.js, the handler is in atom-window.js.
      "src/main-process/main.js": "app.on('ready', () => new AtomWindow())",
      "src/main-process/atom-window.js": "this.browserWindow.webContents.on('will-navigate', (e, url) => { if (!ok(url)) e.preventDefault() })",
    }), "electron_navigation_guard")!;
    expect(c.status).toBe("PASS");
  });
  it("WARNs when no file has one", () => {
    expect(find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "new BrowserWindow({})" }), "electron_navigation_guard")!.status).toBe("WARN");
  });
});

describe("electron_context_isolation — one insecure window is the finding", () => {
  it("FAILs when one window sets it true and another false", () => {
    const c = find(desktop({
      "package.json": ELECTRON_PKG(42),
      "src/main/index.ts": "new BrowserWindow({ webPreferences: { contextIsolation: true } })\nnew BrowserWindow({ webPreferences: { contextIsolation: false } })",
    }), "electron_context_isolation")!;
    expect(c.status).toBe("FAIL");
  });
  it("passes when every window keeps it on", () => {
    expect(find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "new BrowserWindow({ webPreferences: { contextIsolation: true } })" }), "electron_context_isolation")!.status).toBe("PASS");
  });
});

describe("electron_csp — the renderer HTML is read", () => {
  it("passes a <meta http-equiv> CSP in index.html (electron-vite / Forge templates)", () => {
    const c = find(desktop({
      "package.json": ELECTRON_PKG(42),
      "src/main/index.ts": "app.whenReady()",
      "src/renderer/index.html": `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">`,
    }), "electron_csp")!;
    expect(c.status).toBe("PASS");
  });
  it("WARNs when neither the HTML nor the main process sets one", () => {
    expect(find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "app.whenReady()", "src/renderer/index.html": "<html></html>" }), "electron_csp")!.status).toBe("WARN");
  });
});

describe("electron_sandbox — absent is only on where Electron's default makes it so", () => {
  const MAIN = "new BrowserWindow({ webPreferences: { preload } })";
  it("passes absent on Electron 20+", () => {
    expect(find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": MAIN }), "electron_sandbox")!.status).toBe("PASS");
  });
  it("WARNs absent on Electron below 20, and when nodeIntegration is on", () => {
    expect(find(desktop({ "package.json": ELECTRON_PKG(19), "src/main/index.ts": MAIN }), "electron_sandbox")!.status).toBe("WARN");
    const node = find(desktop({ "package.json": ELECTRON_PKG(42), "src/main/index.ts": "new BrowserWindow({ webPreferences: { nodeIntegration: true } })" }), "electron_sandbox")!;
    expect(node.status).toBe("WARN");
    expect(node.detail).toMatch(/nodeIntegration/);
  });
  it("is INCONCLUSIVE when the Electron version cannot be read", () => {
    const pkg = JSON.stringify({ name: "app", version: "1.0.0", devDependencies: { electron: "workspace:*" } });
    expect(find(desktop({ "package.json": pkg, "src/main/index.ts": MAIN }), "electron_sandbox")!.status).toBe("INCONCLUSIVE");
  });
});

describe("desk_x_update_signature — the updater's own verification", () => {
  const UPDATER = JSON.stringify({ name: "app", version: "1.0.0", dependencies: { "electron-updater": "^6.0.0" }, devDependencies: { electron: "^42.0.0" } });
  it("does not FAIL an Electron updater with no explicit signature config (verification is on by default)", () => {
    expect(find(desktop({ "package.json": UPDATER, "src/main/index.ts": "autoUpdater.checkForUpdatesAndNotify()" }), "desk_x_update_signature")!.status).toBe("INCONCLUSIVE");
  });
  it("FAILs an explicit opt-out", () => {
    expect(find(desktop({
      "package.json": UPDATER, "src/main/index.ts": "autoUpdater.checkForUpdatesAndNotify()",
      "electron-builder.yml": "win:\n  verifyUpdateCodeSignature: false\n",
    }), "desk_x_update_signature")!.status).toBe("FAIL");
  });
  it("skips a Tauri updater that is switched off", () => {
    const conf = JSON.stringify({ tauri: { updater: { active: false } } });
    const c = find(desktop({ "package.json": JSON.stringify({ dependencies: { "@tauri-apps/api": "^1.5.0" } }), "src-tauri/tauri.conf.json": conf }, "tauri"), "desk_x_update_signature")!;
    expect(c.status).toBe("SKIPPED");
  });
});

// ── iOS ─────────────────────────────────────────────────────────────────────
const PLIST = (keys = "") => `<?xml version="1.0"?><plist><dict><key>CFBundleName</key><string>App</string>${keys}</dict></plist>`;
const ios = (files: Record<string, string>) => [...evaluateIosChecks(snap(files)), ...evaluateIosExtendedChecks(snap(files))];

describe("ios_accessibility_labels — a text title is a label", () => {
  it("passes SwiftUI controls with text titles and no accessibilityLabel", () => {
    // An image right after a titled control is a sibling view, not the control's content.
    const c = find(ios({ "App/Settings.swift": `var body: some View { Form { Button("Save") { save() }\n Image("logo")\n Toggle("Notifications", isOn: $on)\n NavigationLink("Settings") { SettingsView() }\n Image(systemName: "gear") } }` }), "ios_accessibility_labels")!;
    expect(c.status).toBe("PASS");
  });
  it("WARNs icon-only buttons with no label", () => {
    const c = find(ios({ "App/Player.swift": `Button { play() } label: { Image(systemName: "play") }\nButton { share() } label: { Image(systemName: "square.and.arrow.up") }` }), "ios_accessibility_labels")!;
    expect(c.status).toBe("WARN");
  });
});

describe("ios_password_retention — a write, in shipped code (kickstarter/ios-oss)", () => {
  it("passes when the only match is a test function name", () => {
    const c = find(ios({
      "Library-Keychain-iOSTests/KeychainTests.swift": "func testFetchPassword_hasStoredPassword_returnsPassword() { XCTAssertEqual(storedPassword, \"x\") }",
      "Library/Keychain.swift": "func fetchToken() -> String? { nil }",
    }), "ios_password_retention")!;
    expect(c.status).toBe("PASS");
  });
  it("still FAILs a password saved to the Keychain or UserDefaults", () => {
    expect(find(ios({ "App/Login.swift": "keychain.set(password, forKey: \"password\")" }), "ios_password_retention")!.status).toBe("FAIL");
    expect(find(ios({ "App/Login.swift": "UserDefaults.standard.set(password, forKey: \"savedPassword\")" }), "ios_password_retention")!.status).toBe("FAIL");
  });
});

describe("ios_sensitive_payload_logging — os.Logger and SwiftUI's body are not payload logs", () => {
  it("passes os.Logger in a SwiftUI file", () => {
    const c = find(ios({ "App/Home.swift": `let logger = Logger(subsystem: "app", category: "ui")\nstruct Home: View {\n  var body: some View { Text("Hi").onAppear { logger.log("appeared") } }\n}` }), "ios_sensitive_payload_logging")!;
    expect(c.status).toBe("PASS");
  });
  it("still flags a body handed to a logging call", () => {
    const c = find(ios({ "App/Net.swift": "print(\"Request\", String(data: request.httpBody!, encoding: .utf8)!)" }), "ios_sensitive_payload_logging")!;
    expect(c.status).not.toBe("PASS");
  });
});

describe("ios_token_storage — CodingKeys are JSON decoding, not storage", () => {
  it("does not FAIL a CodingKeys entry (kickstarter/ios-oss AccessTokenEnvelope)", () => {
    const c = find(ios({
      "KsApi/models/AccessTokenEnvelope.swift": `struct AccessTokenEnvelope: Decodable {\n  let accessToken: String\n  enum CodingKeys: String, CodingKey { case accessToken = "access_token" }\n}`,
      "App/Prefs.swift": "UserDefaults.standard.set(true, forKey: \"onboarded\")",
      "App/Keychain.swift": "SecItemAdd(query as CFDictionary, nil)",
    }), "ios_token_storage")!;
    expect(c.status).toBe("PASS");
  });
  it("reads a CodingKeys enum in a file that also uses UserDefaults as decoding, not storage", () => {
    const c = find(ios({
      "App/SessionStore.swift": `struct Session: Codable {\n  let accessToken: String\n  enum CodingKeys: String, CodingKey { case accessToken = "access_token" }\n}\nfunc markOnboarded() { UserDefaults.standard.set(true, forKey: "onboarded") }`,
      "App/Keychain.swift": "SecItemAdd(query as CFDictionary, nil)",
    }), "ios_token_storage")!;
    expect(c.status).toBe("PASS");
  });

  it("FAILs a keys enum for UserDefaults that names a token", () => {
    const c = find(ios({
      "App/Defaults.swift": `enum DefaultsKey: String { case accessToken = "access_token" }\nfunc save(_ t: String) { UserDefaults.standard.set(t, forKey: DefaultsKey.accessToken.rawValue) }`,
    }), "ios_token_storage")!;
    expect(c.status).toBe("FAIL");
  });

  it("still FAILs a token written to UserDefaults", () => {
    const c = find(ios({ "App/Session.swift": "UserDefaults.standard.set(token, forKey: \"accessToken\")" }), "ios_token_storage")!;
    expect(c.status).toBe("FAIL");
  });
  it("does not pass or fail when there is no evidence either way", () => {
    expect(find(ios({ "App/A.swift": "let x = 1" }), "ios_token_storage")!.status).toBe("INCONCLUSIVE");
  });
});

describe("ios_usage_descriptions — APIs that actually need a permission", () => {
  it("passes PHPicker, the library image picker and raw motion data with no keys", () => {
    const c = find(ios({
      "App/Info.plist": PLIST(),
      "App/Pick.swift": "let picker = PHPickerViewController(configuration: config)\nlet lib = UIImagePickerController(); lib.sourceType = .photoLibrary\nlet motion = CMMotionManager(); motion.startAccelerometerUpdates()",
    }), "ios_usage_descriptions")!;
    expect(c.status).toBe("PASS");
  });
  it("reads keys from the build settings of a generated Info.plist", () => {
    const c = find(ios({
      "App.xcodeproj/project.pbxproj": "GENERATE_INFOPLIST_FILE = YES;\nINFOPLIST_KEY_NSCameraUsageDescription = \"Scan receipts\";",
      "App/Scan.swift": "let session = AVCaptureSession()",
    }), "ios_usage_descriptions")!;
    expect(c.status).toBe("PASS");
  });
  it("still FAILs the camera opened with no description", () => {
    const c = find(ios({ "App/Info.plist": PLIST(), "App/Scan.swift": "picker.sourceType = .camera" }), "ios_usage_descriptions")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("ios_x_pasteboard_sensitive — judged on the value copied", () => {
  it("passes an app that copies a share link, though it handles accounts and cards", () => {
    const c = find(ios({ "App/Share.swift": "UIPasteboard.general.string = post.shareURL.absoluteString\nlet account = user.account\nstruct Card {}" }), "ios_x_pasteboard_sensitive")!;
    expect(c.status).toBe("PASS");
  });
  it("WARNs copying a one-time code or password", () => {
    expect(find(ios({ "App/Otp.swift": "UIPasteboard.general.string = otpCode" }), "ios_x_pasteboard_sensitive")!.status).toBe("WARN");
  });
});

describe("ios_x_screenshot_redaction — an empty template stub is not a redaction", () => {
  const LOGIN = "App/Login.swift";
  const LOGIN_SRC = "SecureField(\"Password\", text: $password)";
  it("WARNs a sensitive app whose sceneWillResignActive is Xcode's empty stub", () => {
    const c = find(ios({ [LOGIN]: LOGIN_SRC, "App/SceneDelegate.swift": "func sceneWillResignActive(_ scene: UIScene) {\n  // Called when the scene will move from an active state to an inactive state.\n}" }), "ios_x_screenshot_redaction")!;
    expect(c.status).toBe("WARN");
  });
  it("passes a handler that installs an overlay", () => {
    const c = find(ios({ [LOGIN]: LOGIN_SRC, "App/SceneDelegate.swift": "func sceneWillResignActive(_ scene: UIScene) {\n  window?.addSubview(privacyView)\n}" }), "ios_x_screenshot_redaction")!;
    expect(c.status).toBe("PASS");
  });
});

// ── React Native ────────────────────────────────────────────────────────────
describe("rn_cleartext_traffic — the debug-only manifest does not ship", () => {
  const RN_PKG = JSON.stringify({ name: "app", dependencies: { "react-native": "0.88.0", react: "19.0.0" } });
  it("passes when only android/app/src/debug allows cleartext (the RN template)", () => {
    const c = find(evaluateReactNativeChecks(snap({
      "package.json": RN_PKG,
      "android/app/src/main/AndroidManifest.xml": manifest(""),
      "android/app/src/debug/AndroidManifest.xml": manifest("", ' android:usesCleartextTraffic="true"'),
      "ios/App/Info.plist": PLIST(),
    })), "rn_cleartext_traffic")!;
    expect(c.status).toBe("PASS");
  });
  it("FAILs the release manifest allowing it", () => {
    const c = find(evaluateReactNativeChecks(snap({
      "package.json": RN_PKG,
      "android/app/src/main/AndroidManifest.xml": manifest("", ' android:usesCleartextTraffic="true"'),
      "ios/App/Info.plist": PLIST(),
    })), "rn_cleartext_traffic")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("rn_password_retention — a storage write of the password, not a route or a flag", () => {
  const RN_PKG = JSON.stringify({ name: "app", dependencies: { "react-native": "0.88.0", "@react-native-async-storage/async-storage": "2.0.0" } });
  it("does not FAIL a ForgotPassword route or a remember-password flag", () => {
    const c = find(evaluateReactNativeChecks(snap({
      "package.json": RN_PKG,
      "src/Login.tsx": "navigation.navigate('ForgotPassword', {})\nawait AsyncStorage.setItem('rememberPassword', 'true')\nawait AsyncStorage.setItem('showPassword', String(visible))",
    })), "rn_password_retention");
    expect(c).toBeUndefined();
  });
  it("still FAILs the password itself written to storage", () => {
    const c = find(evaluateReactNativeChecks(snap({ "package.json": RN_PKG, "src/Login.tsx": "await AsyncStorage.setItem('userPassword', password)" })), "rn_password_retention")!;
    expect(c.status).toBe("FAIL");
  });
});

// ── Browser extension ───────────────────────────────────────────────────────
const mv3 = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ manifest_version: 3, name: "X", version: "1.0.0", description: "d", ...extra });
const ext = (files: Record<string, string>) => [...evaluateChromeExtensionChecks(snap(files)), ...evaluateExtensionExtendedChecks(snap(files))];

describe("ext_no_eval — build output and minified copies are not the project's code", () => {
  it("passes a committed dist bundle carrying a runtime's new Function", () => {
    const c = find(ext({ "manifest.json": mv3(), "src/background.ts": "chrome.runtime.onInstalled.addListener(() => {})", "dist/background.js": "Function(\"r\", \"regeneratorRuntime = r\")(runtime); new Function(s)" }), "ext_no_eval")!;
    expect(c.status).toBe("PASS");
  });
  it("still FAILs eval in the extension's own source", () => {
    expect(find(ext({ "manifest.json": mv3(), "src/background.ts": "eval(remote)" }), "ext_no_eval")!.status).toBe("FAIL");
  });
});

describe("ext_no_remote_code — a later directive is not script-src (darkreader)", () => {
  // Verbatim from darkreader/darkreader src/manifest-chrome-mv3.json.
  const DARKREADER_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src * data:; connect-src *; navigate-to 'self' https://darkreader.org/* https://github.com/darkreader/darkreader/blob/main/CONTRIBUTING.md https://github.com/darkreader/darkreader https://twitter.com/darkreaderapp; media-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'";
  it("passes darkreader's CSP", () => {
    expect(find(ext({ "manifest.json": mv3({ content_security_policy: { extension_pages: DARKREADER_CSP } }) }), "ext_no_remote_code")!.status).toBe("PASS");
  });
  it("FAILs a remote origin in script-src", () => {
    expect(find(ext({ "manifest.json": mv3({ content_security_policy: { extension_pages: "script-src 'self' https://cdn.example.com; object-src 'self'" } }) }), "ext_no_remote_code")!.status).toBe("FAIL");
  });
});

describe("ext_x_no_eval_in_content — content scripts only", () => {
  const CS = { content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"] }] };
  it("does not blame a content script for eval in a webpack config, a test or the background script", () => {
    const c = find(ext({
      "manifest.json": mv3(CS),
      "src/content.ts": "document.body.dataset.x = '1'",
      "src/background.ts": "new Function(code)",
      "webpack.config.js": "eval(x)",
      "src/content.test.ts": "eval(fixture)",
    }), "ext_x_no_eval_in_content")!;
    expect(c.status).toBe("PASS");
  });
  it("FAILs eval in the content script, matched from content.js to src/content/index.ts", () => {
    const c = find(ext({ "manifest.json": mv3(CS), "src/content/index.ts": "eval(page.dataset.code)" }), "ext_x_no_eval_in_content")!;
    expect([c.status, c.evidence]).toEqual(["FAIL", "src/content/index.ts"]);
  });
  it("is INCONCLUSIVE when no source can be matched to the declared content script", () => {
    expect(find(ext({ "manifest.json": mv3({ content_scripts: [{ matches: ["<all_urls>"], js: ["inject-7f3a.js"] }] }), "src/popup.ts": "x()" }), "ext_x_no_eval_in_content")!.status).toBe("INCONCLUSIVE");
  });
});

// ── CLI ─────────────────────────────────────────────────────────────────────
const cliPkg = JSON.stringify({ name: "tool", license: "MIT", description: "d", bin: { t: "./cli.js" } });
const cli = (src: string) => find(evaluateCliChecks(snap({ "package.json": cliPkg, "cli.js": src })), "cli_shell_injection")!;

describe("cli_shell_injection — variables and shell: true, per call", () => {
  it("WARNs exec(cmd) with a variable, and spawn with shell: true and a variable argument", () => {
    expect(cli("const { exec, execSync } = require('child_process')\nexecSync(userCommand)").status).toBe("WARN");
    expect(cli("import { spawn } from 'node:child_process'\nspawn('git', ['checkout', branch], { shell: true })").status).toBe("WARN");
  });
  it("passes a constant command, RegExp.exec and spawn with an argument array and no shell", () => {
    const c = cli("const cp = require('child_process')\nconst sha = cp.execSync('git rev-parse HEAD')\nconst m = /v(\\d+)/.exec(tag)\ncp.spawn('git', ['checkout', branch])");
    expect(c.status).toBe("PASS");
    expect(shellCallSites("/v(\\d+)/.exec('x')")).toEqual([]);
  });
});

// ── Cross-platform (Flutter) ────────────────────────────────────────────────
describe("xp_deep_link_both_platforms — the launcher is not a deep link", () => {
  const LAUNCHER = manifest(`<activity android:name=".MainActivity"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity>`);
  const flutter = (files: Record<string, string>) =>
    find(evaluateCrossPlatformExtendedChecks(snap({ "pubspec.yaml": "name: app\nversion: 1.0.0\n", "lib/main.dart": "void main() {}", ...files }), "flutter"), "xp_deep_link_both_platforms")!;
  it("passes an app with no deep links on either platform", () => {
    expect(flutter({ "android/app/src/main/AndroidManifest.xml": LAUNCHER, "ios/Runner/Info.plist": PLIST() }).status).toBe("PASS");
  });
  it("reads iOS universal links from the entitlements file", () => {
    const appLink = manifest(`<activity android:name=".MainActivity"><intent-filter android:autoVerify="true"><action android:name="android.intent.action.VIEW"/><data android:scheme="https" android:host="example.com"/></intent-filter></activity>`);
    const ent = `<plist><dict><key>com.apple.developer.associated-domains</key><array><string>applinks:example.com</string></array></dict></plist>`;
    expect(flutter({ "android/app/src/main/AndroidManifest.xml": appLink, "ios/Runner/Info.plist": PLIST(), "ios/Runner/Runner.entitlements": ent }).status).toBe("PASS");
    expect(flutter({ "android/app/src/main/AndroidManifest.xml": appLink, "ios/Runner/Info.plist": PLIST() }).status).toBe("WARN");
  });
});

// ── Repository intelligence (code-agent) ────────────────────────────────────
describe("branch_protection — rulesets, and what a non-admin can see", () => {
  // Verbatim shape of vercel/next.js read with a READ token (Oct 2026): no classic rules
  // listed, rulesets protecting the default branch and requiring pull requests.
  const NEXTJS = {
    viewerPermission: "READ",
    defaultBranchRef: { name: "canary" },
    branchProtectionRules: { nodes: [] },
    rulesets: { nodes: [
      { enforcement: "ACTIVE", target: "BRANCH", conditions: { refName: { include: ["~ALL"] } }, rules: { nodes: [{ type: "REQUIRED_SIGNATURES" }] } },
      { enforcement: "ACTIVE", target: "TAG", conditions: { refName: { include: [] } }, rules: { nodes: [{ type: "REQUIRED_SIGNATURES" }] } },
      { enforcement: "ACTIVE", target: "BRANCH", conditions: { refName: { include: ["~DEFAULT_BRANCH"] } }, rules: { nodes: [{ type: "DELETION" }, { type: "NON_FAST_FORWARD" }] } },
      { enforcement: "ACTIVE", target: "BRANCH", conditions: { refName: { include: ["~DEFAULT_BRANCH"] } }, rules: { nodes: [{ type: "PULL_REQUEST" }] } },
    ] },
  };
  it("passes next.js, protected by rulesets the classic list does not show", () => {
    expect(assessBranchProtection(NEXTJS).status).toBe("PASS");
  });
  it("is INCONCLUSIVE, not FAIL, when a non-admin sees no rules", () => {
    expect(assessBranchProtection({ ...NEXTJS, rulesets: { nodes: [] } }).status).toBe("INCONCLUSIVE");
  });
  it("FAILs only when an admin could see everything and nothing protects the branch", () => {
    // Our own repository read as ADMIN, Oct 2026: no classic rules, no rulesets.
    expect(assessBranchProtection({ viewerPermission: "ADMIN", defaultBranchRef: { name: "main" }, branchProtectionRules: { nodes: [] }, rulesets: { nodes: [] } }).status).toBe("FAIL");
  });
});

// ── Client bundle secrets (vibe-security) ───────────────────────────────────
describe("no_service_role_key_exposed — vendor formats, PEM bodies, minified bundles", () => {
  const tail = (n: number) => "aB3dE5fG7hJ9kL2mN4pQ6rS8tV1wX3yZ5cD7eF9gH2jK4mP6qR8sT1uW3xY5zA7".repeat(3).slice(0, n);
  const openai = ["sk", "-proj-", tail(48)].join("");
  const pemBody = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7" + tail(60);
  it("finds a sk-proj- key and a PEM inside a JS string in a one-line minified bundle that also says 'example'", () => {
    const bundle = `var e="example";const k="${openai}";const p="-----BEGIN PRIVATE KEY-----\\n${pemBody}\\n-----END PRIVATE KEY-----";`;
    expect(findClientBundleSecrets(bundle)).toEqual(expect.arrayContaining(["OpenAI API key", "Private key block"]));
  });
  it("ignores a crypto library's bare PEM header constant and a public publishable key", () => {
    const pub = ["pk", "_live_", tail(32)].join("");
    const bundle = `const H="-----BEGIN PRIVATE KEY-----",F="-----END PRIVATE KEY-----";stripe("${pub}")`;
    expect(findClientBundleSecrets(bundle)).toEqual([]);
  });
});

// ── Prompt injection (secret-scanner) ───────────────────────────────────────
describe("repo_prompt_injection_risk — prompt code is read, and only model-calling files count", () => {
  it("WARNs a route that interpolates the request body into a prompt", async () => {
    repoFiles = {
      "package.json": JSON.stringify({ dependencies: { openai: "^4.0.0" } }),
      "app/api/chat/route.ts": "import OpenAI from \"openai\"\nconst body = await req.json()\nawait client.chat.completions.create({ messages: [{ role: \"user\", content: `Summarise: ${req.body.text}` }] })",
    };
    expect((await promptCheck()).status).toBe("WARN");
  });
  it("does not warn an error message template in a non-AI file, and says what it read", async () => {
    repoFiles = {
      "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }),
      "src/config.ts": "throw new Error(`Bad config: ${message}`)",
    };
    expect((await promptCheck()).status).toBe("NOT_APPLICABLE");
  });
  it("covers Python f-strings", async () => {
    repoFiles = { "app/llm.py": "from openai import OpenAI\nprompt = f\"Answer this: {request.json['q']}\"\nclient.chat.completions.create(messages=[{'role': 'user', 'content': prompt}])" };
    expect((await promptCheck()).status).toBe("WARN");
  });
  it("is INCONCLUSIVE when an AI SDK is declared but no model-calling file was read", async () => {
    repoFiles = { "package.json": JSON.stringify({ dependencies: { openai: "^4.0.0" } }), "src/index.ts": "export {}" };
    expect((await promptCheck()).status).toBe("INCONCLUSIVE");
  });
});

// ── Web source (web-repo-source) ────────────────────────────────────────────
describe("web_raw_html_injection — JSON-LD and constants cannot carry user HTML (vercel/commerce)", () => {
  // Verbatim from vercel/commerce app/product/[handle]/page.tsx.
  const JSONLD = `<script\n        type="application/ld+json"\n        dangerouslySetInnerHTML={{\n          __html: JSON.stringify(productJsonLd),\n        }}\n      />`;
  it("passes the JSON-LD pattern on its own", () => {
    expect(find(evaluateWebSourceChecks(snap({ "app/product/[handle]/page.tsx": JSONLD })), "web_raw_html_injection")!.status).toBe("PASS");
  });
  it("still FAILs commerce's Prose component, which renders Shopify's descriptionHtml raw", () => {
    const prose = `const Prose = ({ html, className }: { html: string; className?: string }) => {\n  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;\n};`;
    const c = find(evaluateWebSourceChecks(snap({ "app/product/[handle]/page.tsx": JSONLD, "components/prose.tsx": prose })), "web_raw_html_injection")!;
    expect([c.status, c.evidence]).toEqual(["FAIL", "components/prose.tsx"]);
  });
});

describe("web_sql_string_building — tagged templates parameterise", () => {
  it("passes Prisma $queryRaw and a postgres.js sql tag", () => {
    const c = find(evaluateWebSourceChecks(snap({
      "lib/db.ts": "const rows = await prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`\nconst r = await sql`SELECT name FROM orgs WHERE slug = ${slug}`",
    })), "web_sql_string_building");
    expect(c).toBeUndefined();
  });
  it("still FAILs an untagged template and $queryRawUnsafe", () => {
    expect(find(evaluateWebSourceChecks(snap({ "lib/db.ts": "await db.query(`SELECT * FROM users WHERE id = ${id}`)" })), "web_sql_string_building")!.status).toBe("FAIL");
    expect(find(evaluateWebSourceChecks(snap({ "lib/db.ts": "await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${id}`)" })), "web_sql_string_building")!.status).toBe("FAIL");
  });
});
