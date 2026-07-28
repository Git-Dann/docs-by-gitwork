import { describe, it, expect } from "vitest";
import { evaluateAndroidChecks } from "../android-app";
import type { RepoSnapshot } from "../native-mobile";

// Same discipline as the iOS and Flutter families (§34): presence findings are sound
// on a sample, absence findings must self-downgrade when coverage is thin, and a
// COMMENTED-OUT guard is not a live guard — that bug shipped twice before.

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

const keys = (checks: { checkKey: string }[]) => checks.map((c) => c.checkKey);
const find = (checks: { checkKey: string; status: string; confidence?: string; detail?: string }[], k: string) =>
  checks.find((c) => c.checkKey === k);

describe("evaluateAndroidChecks — gating", () => {
  it("returns nothing when the repo could not be read", () => {
    // The §35 rule: "we could not look" must never become a set of findings.
    const snap = { ...snapshot({}), accessible: false };
    expect(evaluateAndroidChecks(snap)).toEqual([]);
  });
});

describe("manifest security", () => {
  it("fails cleartext HTTP and a debuggable release", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/AndroidManifest.xml":
        `<application android:usesCleartextTraffic="true" android:debuggable="true"></application>`,
    }));
    expect(find(out, "android_cleartext_traffic")?.status).toBe("FAIL");
    expect(find(out, "android_debuggable_release")?.status).toBe("FAIL");
  });

  it("passes a manifest that does neither", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/AndroidManifest.xml": `<application android:allowBackup="false"></application>`,
    }));
    expect(find(out, "android_cleartext_traffic")?.status).toBe("PASS");
    expect(find(out, "android_debuggable_release")?.status).toBe("PASS");
    expect(find(out, "android_backup_rules")?.status).toBe("PASS");
  });

  it("warns when backup is left at its default rather than decided", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/AndroidManifest.xml": `<application></application>`,
    }));
    // Backup defaults to ON, so silence is the risky state, not the safe one.
    expect(find(out, "android_backup_rules")?.status).toBe("WARN");
  });

  it("accepts declared backup rules as a decision", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/AndroidManifest.xml": `<application android:dataExtractionRules="@xml/rules"></application>`,
    }));
    expect(find(out, "android_backup_rules")?.status).toBe("PASS");
  });
});

describe("release logging", () => {
  it("warns when logging ships with no BuildConfig.DEBUG guard", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Logger.kt": `fun log(m: String) { Log.d("TAG", m) }`,
    }));
    expect(find(out, "android_release_logging")?.status).toBe("WARN");
  });

  it("passes when a build guard is present", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Logger.kt": `fun log(m: String) { if (BuildConfig.DEBUG) Log.d("TAG", m) }`,
    }));
    expect(find(out, "android_release_logging")?.status).toBe("PASS");
  });

  it("does not fire at all when there is no logging", () => {
    const out = evaluateAndroidChecks(snapshot({ "app/src/main/java/A.kt": `fun a() = 1` }));
    expect(keys(out)).not.toContain("android_release_logging");
  });
});

describe("token and credential storage", () => {
  it("fails tokens in SharedPreferences with no secure store", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Session.kt":
        `val prefs = context.getSharedPreferences("app", 0)\nprefs.edit().putString("access_token", t).apply()`,
    }));
    const c = find(out, "android_token_storage");
    expect(c?.status).toBe("FAIL");
    expect(c?.confidence).toBe("HIGH");
  });

  it("downgrades to a warning when EncryptedSharedPreferences is also present", () => {
    // A half-finished migration is the common case — say that, don't cry wolf.
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Session.kt":
        `val prefs = context.getSharedPreferences("app", 0)\nputString("access_token", t)\nEncryptedSharedPreferences.create(...)`,
    }));
    const c = find(out, "android_token_storage");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/half-finished migration/);
  });

  it("does not fire when preferences hold no token-shaped key", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Theme.kt": `context.getSharedPreferences("ui", 0).edit().putString("theme", "dark").apply()`,
    }));
    expect(keys(out)).not.toContain("android_token_storage");
  });

  it("fails committed signing credentials", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/build.gradle": `signingConfigs { release { storePassword "hunter2" } }`,
    }));
    expect(find(out, "android_signing_credentials_committed")?.status).toBe("FAIL");
  });

  it("does not flag a signing config that reads from properties", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/build.gradle": `signingConfigs { release { storePassword project.property("STORE_PW") } }`,
    }));
    expect(keys(out)).not.toContain("android_signing_credentials_committed");
  });
});

describe("Play Store readiness", () => {
  it("fails a targetSdk below the Play floor and passes one at it", () => {
    const old = evaluateAndroidChecks(snapshot({ "app/build.gradle": `android { targetSdkVersion 33 }` }));
    expect(find(old, "android_target_sdk_current")?.status).toBe("FAIL");
    expect(find(old, "android_target_sdk_current")?.detail).toMatch(/REJECT/);

    const current = evaluateAndroidChecks(snapshot({ "app/build.gradle": `android { targetSdk = 35 }` }));
    expect(find(current, "android_target_sdk_current")?.status).toBe("PASS");
  });

  it("flags sensitive permissions that need a Play declaration", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/AndroidManifest.xml":
        `<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>`,
    }));
    const c = find(out, "android_sensitive_permissions");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/background location/);
  });

  it("stays quiet when only ordinary permissions are requested", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/AndroidManifest.xml": `<uses-permission android:name="android.permission.INTERNET"/>`,
    }));
    expect(keys(out)).not.toContain("android_sensitive_permissions");
  });
});

describe("environment selected by editing source", () => {
  it("fails when the live base URL is a non-production host", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Constants.kt":
        `const val BASE_URL = "https://api.staging.acme.com/"\n// const val BASE_URL = "https://api.acme.com/"`,
    }));
    const c = find(out, "android_env_baseurl");
    expect(c?.status).toBe("FAIL");
    expect(c?.detail).toMatch(/NON-PRODUCTION/);
  });

  it("warns when production is live but alternatives are commented beside it", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Constants.kt":
        `const val BASE_URL = "https://api.acme.com/"\n// const val BASE_URL = "https://api.staging.acme.com/"`,
    }));
    expect(find(out, "android_env_baseurl")?.status).toBe("WARN");
  });

  it("does not fire on a single production URL with no alternatives", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Constants.kt": `const val BASE_URL = "https://api.acme.com/"`,
    }));
    expect(keys(out)).not.toContain("android_env_baseurl");
  });
});

describe("absence findings self-downgrade on a thin sample", () => {
  it("marks absence LOW confidence when few files were read", () => {
    // 1 file read out of 100 in the tree — far below the soundness threshold.
    const manyPaths = Array.from({ length: 99 }, (_, i) => `app/src/main/java/F${i}.kt`);
    const out = evaluateAndroidChecks(snapshot({ "app/src/main/java/A.kt": `fun a() = 1` }, manyPaths));

    for (const key of ["android_content_descriptions", "android_http_cache", "android_metered_network"]) {
      const c = find(out, key);
      expect(c?.confidence, key).toBe("LOW");
      expect(c?.detail, key).toMatch(/inconclusive rather than a failure/);
    }
  });

  it("reports absence at HIGH confidence when the sample is broad", () => {
    const out = evaluateAndroidChecks(snapshot({ "app/src/main/java/A.kt": `fun a() = 1` }));
    expect(find(out, "android_http_cache")?.confidence).toBe("HIGH");
  });
});

describe("comment stripping", () => {
  it("does not accept a commented-out metered-network guard as a live one", () => {
    // The §34.3 / §34.6 bug, in its Kotlin form.
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Download.kt": `fun go() {\n  // if (cm.isActiveNetworkMetered) return\n  start()\n}`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("WARN");
  });

  it("accepts a real guard", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Download.kt": `fun go() {\n  if (cm.isActiveNetworkMetered) return\n  start()\n}`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("PASS");
  });
});

describe("density needs a denominator", () => {
  it("skips the !! density check on a tiny sample", () => {
    const out = evaluateAndroidChecks(snapshot({ "app/src/main/java/A.kt": `val x = y!!` }));
    // A raw count would fire here; per-1,000-lines with a minimum will not.
    expect(keys(out)).not.toContain("android_force_unwrap_density");
  });

  it("warns on a genuinely high density over enough lines", () => {
    const body = Array.from({ length: 300 }, (_, i) => (i % 10 === 0 ? `val a$i = b!!` : `val a$i = $i`)).join("\n");
    const out = evaluateAndroidChecks(snapshot({ "app/src/main/java/Big.kt": body }));
    expect(find(out, "android_force_unwrap_density")?.status).toBe("WARN");
  });
});

describe("tests", () => {
  it("fails when there is no test source at all", () => {
    const out = evaluateAndroidChecks(snapshot(
      { "app/src/main/java/A.kt": `fun a() = 1` },
      Array.from({ length: 40 }, (_, i) => `app/src/main/java/F${i}.kt`),
    ));
    expect(find(out, "android_test_coverage")?.status).toBe("FAIL");
  });

  it("passes when a proportionate test suite exists", () => {
    const out = evaluateAndroidChecks(snapshot(
      { "app/src/main/java/A.kt": `fun a() = 1` },
      ["app/src/test/java/ATest.kt", "app/src/test/java/BTest.kt", "app/src/androidTest/java/CTest.kt"],
    ));
    expect(find(out, "android_test_coverage")?.status).toBe("PASS");
  });
});
