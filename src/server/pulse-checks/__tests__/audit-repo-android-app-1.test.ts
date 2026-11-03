import { describe, it, expect } from "vitest";
import { evaluateAndroidChecks } from "../android-app";
import type { RepoSnapshot } from "../native-mobile";

// Audit packet repo-android-app-1. Manifests, Gradle and source reproduced from
// TeamNewPipe/NewPipe, android/nowinandroid and kickstarter/android-oss.

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
type C = { checkKey: string; status: string; confidence?: string; detail?: string };
const find = (checks: C[], k: string) => checks.find((c) => c.checkKey === k);
const M = "app/src/main/AndroidManifest.xml";

const NIA_MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:name=".NiaApplication" android:allowBackup="true">
    <activity android:name=".MainActivity" android:configChanges="uiMode" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
      <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
        <data android:host="www.nowinandroid.apps.samples.google.com" />
      </intent-filter>
    </activity>
  </application>
</manifest>`;

const NIA_CATALOG_MANIFEST = `<manifest>
  <application android:allowBackup="true">
    <activity android:name="com.google.samples.apps.niacatalog.NiaCatalogActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>`;

const NEWPIPE_MANIFEST = `<manifest>
  <application android:allowBackup="true">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <receiver android:name="androidx.media.session.MediaButtonReceiver" android:exported="true">
      <intent-filter><action android:name="android.intent.action.MEDIA_BUTTON" /></intent-filter>
    </receiver>
    <provider
        android:name="androidx.core.content.FileProvider"
        android:authorities="\${applicationId}.provider"
        android:exported="false"
        android:grantUriPermissions="true">
        <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/nnf_provider_paths" />
    </provider>
    <activity
        android:name=".RouterActivity"
        android:excludeFromRecents="true"
        android:exported="true"
        android:taskAffinity="">
      <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <data android:scheme="https" />
        <data android:host="www.youtube.com" />
      </intent-filter>
    </activity>
  </application>
</manifest>`;

const KS_PROVIDERS = `<manifest>
  <application android:allowBackup="false">
    <provider
        android:name="com.facebook.FacebookContentProvider"
        android:authorities="com.facebook.app.FacebookContentProvider\${applicationId}"
        android:exported="true"
        tools:ignore="ExportedContentProvider" />
    <provider
        android:name="androidx.core.content.FileProvider"
        android:authorities="\${applicationId}.fileprovider"
        android:exported="false"
        android:grantUriPermissions="true">
    </provider>
  </application>
</manifest>`;

describe("android_content_provider_exposure — judged per provider tag", () => {
  it("does not borrow a later activity's exported=true for a non-exported FileProvider (NewPipe)", () => {
    const out = evaluateAndroidChecks(snapshot({ [M]: NEWPIPE_MANIFEST }));
    expect(find(out, "android_content_provider_exposure")?.status).toBe("PASS");
  });

  it("still warns on a genuinely exported, unguarded provider (kickstarter FacebookContentProvider)", () => {
    const out = evaluateAndroidChecks(snapshot({ [M]: KS_PROVIDERS }));
    expect(find(out, "android_content_provider_exposure")?.status).toBe("WARN");
  });

  it("passes an exported provider guarded by its own readPermission", () => {
    const out = evaluateAndroidChecks(snapshot({
      [M]: `<application><provider android:name=".Data" android:exported="true" android:readPermission="com.acme.READ" /></application>`,
    }));
    expect(find(out, "android_content_provider_exposure")?.status).toBe("PASS");
  });
});

describe("android_exported_components — launchers are not the finding", () => {
  it("passes when the only exported components are launcher activities (nowinandroid)", () => {
    const out = evaluateAndroidChecks(snapshot({
      [M]: NIA_MANIFEST,
      "app-nia-catalog/src/main/AndroidManifest.xml": NIA_CATALOG_MANIFEST,
    }));
    const c = find(out, "android_exported_components");
    expect(c?.status).toBe("PASS");
    expect(c?.detail).toMatch(/launcher/);
  });

  it("still warns on a launcher plus an exported, unguarded service", () => {
    const out = evaluateAndroidChecks(snapshot({
      [M]: `<manifest><application>
    <activity android:name=".Main" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <service android:name=".SyncService" android:exported="true" />
  </application></manifest>`,
    }));
    const c = find(out, "android_exported_components");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).not.toMatch(/all launcher activities/);
  });

  it("passes when the only exported component is an <activity-alias> launcher", () => {
    const out = evaluateAndroidChecks(snapshot({
      [M]: `<manifest><application>
    <activity android:name=".Main" android:exported="false" />
    <activity-alias android:name=".Launcher" android:targetActivity=".Main" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity-alias>
  </application></manifest>`,
    }));
    expect(find(out, "android_exported_components")?.status).toBe("PASS");
  });

  // Updated Oct 2026 (audit A4): this fixture's exported components are the launcher, a
  // MEDIA_BUTTON receiver and an https VIEW handler — all public by contract — so the old WARN
  // was the false positive. The custom-action case that SHOULD warn is in audit-2026-10-android.
  it("passes NewPipe's exported components, which are all public by contract", () => {
    const out = evaluateAndroidChecks(snapshot({ [M]: NEWPIPE_MANIFEST }));
    expect(find(out, "android_exported_components")?.status).toBe("PASS");
  });
});

describe("android_minify_enabled — computed assignment is not 'not configured'", () => {
  // Updated Oct 2026 (audit A2): a property toggle that DEFAULTS to true is on unless someone passes
  // the property — the extended family already passed it, and the two families must agree.
  it("treats nowinandroid's gradleProperty(...).getOrElse(true) as enabled (its default), not missing", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/build.gradle.kts": `android {
    buildTypes {
        release {
            isMinifyEnabled = providers.gradleProperty("minifyWithR8")
                .map(String::toBooleanStrict).getOrElse(true)
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}`,
    }));
    const c = find(out, "android_minify_enabled");
    expect(c?.detail).not.toMatch(/not configured/);
    expect(c?.status).toBe("PASS");
  });

  it("still reports literal minifyEnabled false as explicitly disabled at HIGH (kickstarter)", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/build.gradle": `android {
    buildTypes {
        release {
            minifyEnabled false
        }
        debug {
            minifyEnabled false
            debuggable true
        }
    }
}`,
    }));
    const c = find(out, "android_minify_enabled");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("HIGH");
    expect(c?.detail).toMatch(/explicitly disabled/);
  });

  it("keeps a debug literal false plus a computed release value inconclusive (LOW), not 'explicitly disabled'", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/build.gradle.kts": `android {
    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = !isCI.get()
        }
    }
}`,
    }));
    const c = find(out, "android_minify_enabled");
    // Updated Oct 2026 (audit A2): a value that cannot be evaluated is INCONCLUSIVE, not a WARN.
    expect(c?.status).toBe("INCONCLUSIVE");
    expect(c?.confidence).toBe("LOW");
    expect(c?.detail).not.toMatch(/explicitly disabled/);
  });

  it("passes isMinifyEnabled = true and still warns when nothing is configured", () => {
    const on = evaluateAndroidChecks(snapshot({ "app/build.gradle.kts": `release {\n    isMinifyEnabled = true\n}` }));
    expect(find(on, "android_minify_enabled")?.status).toBe("PASS");
    const none = evaluateAndroidChecks(snapshot({ "app/build.gradle.kts": `android { namespace = "com.acme" }` }));
    const c = find(none, "android_minify_enabled");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/not configured/);
  });
});

describe("android_backup_rules — wording matches modern targets", () => {
  it("warns on allowBackup=true without claiming adb extraction as current fact", () => {
    const out = evaluateAndroidChecks(snapshot({ [M]: NEWPIPE_MANIFEST }));
    const c = find(out, "android_backup_rules");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("MEDIUM");
    expect(c?.detail).not.toMatch(/pulled off the device/);
    expect(c?.detail).toMatch(/explicitly on/);
  });

  it("still passes allowBackup=false at HIGH (kickstarter)", () => {
    const out = evaluateAndroidChecks(snapshot({ [M]: KS_PROVIDERS }));
    const c = find(out, "android_backup_rules");
    expect(c?.status).toBe("PASS");
    expect(c?.confidence).toBe("HIGH");
  });
});

describe("android_http_cache — a local store makes absence inconclusive, never a PASS", () => {
  it("reports nowinandroid (Room DAOs, no HTTP cache) as an inconclusive LOW warning", () => {
    const out = evaluateAndroidChecks(snapshot(
      {
        "core/data/src/main/kotlin/com/google/samples/apps/nowinandroid/core/data/repository/OfflineFirstTopicsRepository.kt":
          `internal class OfflineFirstTopicsRepository(private val topicDao: TopicDao) {\n  fun getTopics(): Flow<List<Topic>> = topicDao.getTopicEntities().map { it.map(TopicEntity::asExternalModel) }\n}`,
      },
      ["core/database/src/main/kotlin/com/google/samples/apps/nowinandroid/core/database/dao/TopicDao.kt"],
    ));
    const c = find(out, "android_http_cache");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("LOW");
    expect(c?.detail).toMatch(/Room/);
    expect(c?.detail).not.toMatch(/every screen re-fetches/);
  });

  it("does not PASS an app that keeps only a favourites table in Room (@Dao in sampled source)", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/org/acme/FavDao.kt": `@Dao\ninterface FavDao {\n  @Query("SELECT * FROM favs") fun all(): List<Fav>\n}`,
    }));
    const c = find(out, "android_http_cache");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("LOW");
  });

  it("still passes when an OkHttp cache is configured", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Net.kt": `val client = OkHttpClient.Builder()\n    .cache(Cache(dir, 10L * 1024 * 1024))\n    .build()`,
    }));
    const c = find(out, "android_http_cache");
    expect(c?.status).toBe("PASS");
    expect(c?.confidence).toBe("HIGH");
  });

  it("still warns on an OkHttp client with no cache and no local store (kickstarter)", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/com/kickstarter/services/ApiClient.kt":
        `val client = OkHttpClient.Builder()\n    .addInterceptor(apiRequestInterceptor)\n    .build()`,
    }));
    const c = find(out, "android_http_cache");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("HIGH");
    expect(c?.detail).toMatch(/every screen re-fetches/);
  });
});

describe("android_metered_network — CONNECTED is not a metered gate; PASS is not inconclusive", () => {
  it("does not accept setRequiredNetworkType(NetworkType.CONNECTED) (kickstarter WorkUtils.kt)", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/com/kickstarter/libs/utils/WorkUtils.kt":
        `val baseConstraints = Constraints.Builder()\n        .setRequiredNetworkType(NetworkType.CONNECTED)\n        .build()`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("WARN");
  });

  it("accepts a WorkManager UNMETERED constraint", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Sync.kt": `val c = Constraints.Builder()\n        .setRequiredNetworkType(NetworkType.UNMETERED)\n        .build()`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("PASS");
  });

  it("accepts a statically imported UNMETERED constraint", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Sync.kt": `import androidx.work.NetworkType.UNMETERED\nval c = Constraints.Builder().setRequiredNetworkType(UNMETERED).build()`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("PASS");
  });

  it("accepts DownloadManager setAllowedOverMetered(false)", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Dl.kt": `val request = DownloadManager.Request(uri)\nrequest.setAllowedOverMetered(false)`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("PASS");
  });

  it("does not accept NetworkType.NOT_ROAMING (still allows cellular)", () => {
    const out = evaluateAndroidChecks(snapshot({
      "app/src/main/java/Sync.kt": `val c = Constraints.Builder()\n        .setRequiredNetworkType(NetworkType.NOT_ROAMING)\n        .build()`,
    }));
    expect(find(out, "android_metered_network")?.status).toBe("WARN");
  });

  const thinPaths = Array.from({ length: 9 }, (_, i) => `app/src/main/java/org/schabi/newpipe/F${i}.java`);

  it("a PASS on a thin sample is not labelled inconclusive (NewPipe ListHelper)", () => {
    const out = evaluateAndroidChecks(snapshot(
      {
        "app/src/main/java/org/schabi/newpipe/util/ListHelper.java":
          `static boolean isMeteredNetwork(Context context) {\n    final ConnectivityManager manager = ContextCompat.getSystemService(context, ConnectivityManager.class);\n    return manager.isActiveNetworkMetered();\n}`,
      },
      thinPaths,
    ));
    const c = find(out, "android_metered_network");
    expect(c?.status).toBe("PASS");
    expect(c?.confidence).toBe("HIGH");
    expect(c?.detail).not.toMatch(/inconclusive/);
  });

  it("a WARN on the same thin sample stays LOW and inconclusive", () => {
    const out = evaluateAndroidChecks(snapshot(
      { "app/src/main/java/org/schabi/newpipe/util/Other.java": `class Other { void go() { start(); } }` },
      thinPaths,
    ));
    const c = find(out, "android_metered_network");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("LOW");
    expect(c?.detail).toMatch(/inconclusive rather than a failure/);
  });

  it("android_content_descriptions PASS on the same thin sample is HIGH with no caveat (shared absence())", () => {
    const out = evaluateAndroidChecks(snapshot(
      { "app/src/main/java/org/schabi/newpipe/Btn.java": `class Btn { void bind() { view.setContentDescription("Play"); } }` },
      thinPaths,
    ));
    const c = find(out, "android_content_descriptions");
    expect(c?.status).toBe("PASS");
    expect(c?.confidence).toBe("HIGH");
    expect(c?.detail).not.toMatch(/inconclusive/);
  });
});
