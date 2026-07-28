import { describe, it, expect } from "vitest";
import { evaluateFlutterChecks } from "../flutter-app";
import type { RepoSnapshot } from "../native-mobile";

// Same self-test discipline as ios-app.test.ts: every rule must FIRE on a
// deliberately-defective app and stay QUIET on the fixed one.
//
// The defective fixture is modelled on the real findings from the Fellas Android
// review (July 2026): the live branch had production commented out and staging
// active, cleartext HTTP enabled, tokens in SharedPreferences while
// flutter_secure_storage held the password, and the cellular-data guard commented
// out with a "re-enable later" TODO.

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

const statusOf = (checks: ReturnType<typeof evaluateFlutterChecks>, key: string) =>
  checks.find((c) => c.checkKey === key)?.status;

// ── Defective ────────────────────────────────────────────────────────────────

const BAD_CONSTANTS = `
const String title = 'Fellas Loaded';
// const String baseUrl = 'https://api.test.acme.pixelfield.dev/api';
// const String baseUrl = 'https://api.acme.com/api/';
const String baseUrl = 'https://api.staging.acme.gitwork.tech/api/';
// const String baseUrl = 'https://fleet-ray-stunning.ngrok-free.app/api/';
`;

const BAD_MANIFEST = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="Acme" android:usesCleartextTraffic="true" />
</manifest>`;

const BAD_GRADLE = `
android {
    compileSdk 33
    defaultConfig { minSdk 21 targetSdk 33 }
    buildTypes { release { signingConfig signingConfigs.release } }
}
`;

const BAD_PUBSPEC = `
name: acme_flutter
version: 1.0.15+140
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.3.3
  shared_preferences: ^2.2.1
  flutter_secure_storage: ^9.0.0
  video_player: ^2.7.2
  faker: ^2.1.0
  acme_cast:
    git:
      url: https://github.com/someone/acme_cast.git
      ref: main
dev_dependencies:
  build_runner: ^2.4.6
`;

const BAD_DART = `
import 'package:shared_preferences/shared_preferences.dart';

class DioClient {
  Future<void> setup() async {
    final prefs = await SharedPreferences.getInstance();
    final accessToken = prefs.getString('accessToken') ?? '';
    print('token loaded: \$accessToken');
    print('a'); print('b'); print('c'); print('d'); print('e');
    print('f'); print('g'); print('h'); print('i'); print('j');
  }
}

class PredownloaderCubit {
  Future<void> request() async {
    // TODO: Re-enable when mobile data setting is user-configurable again.
    // final isMobileData = await _getMobileDataUseCase();
    // if (!isMobileData && connectivityResult == ConnectivityResult.mobile) {
    //   return;
    // }
    await download();
  }
}

class Player {
  void play() {
    final c = VideoPlayerController.networkUrl(Uri.parse('https://cdn.acme.com/play_720p.mp4'));
  }
}

class Ui extends StatelessWidget {
  Widget build(BuildContext context) {
    return Column(children: [
      ElevatedButton(onPressed: play, child: Icon(Icons.play_arrow)),
      IconButton(onPressed: share, icon: Icon(Icons.share)),
    ]);
  }
}
`;

const BAD_SECURE = `
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageDataSource {
  static const String _kSavedPasswordKey = 'secure_remember_password';
  Future<void> saveCredentials(String email, String password) async {
    await _secureStorage.write(key: _kSavedPasswordKey, value: password);
  }
}
`;

const badApp = () =>
  snapshot(
    {
      "pubspec.yaml": BAD_PUBSPEC,
      "android/app/src/main/AndroidManifest.xml": BAD_MANIFEST,
      "android/app/build.gradle": BAD_GRADLE,
      "android/app/google-services.json": '{"api_key":[{"current_key":"AIzaFAKE"}]}',
      ".fvm/fvm_config.json": '{"flutterSdkVersion": "3.16.4"}',
      "lib/core/constants/constants.dart": BAD_CONSTANTS,
      "lib/core/client/dio_client.dart": BAD_DART,
      "lib/features/shared/data/datasources/secure_storage_data_source.dart": BAD_SECURE,
    },
    ["test/widget_test.dart"],
  );

// ── Fixed ────────────────────────────────────────────────────────────────────

const GOOD_PUBSPEC = `
name: acme_flutter
version: 2.0.0+300
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.3.3
  dio_cache_interceptor: ^3.5.0
  cached_network_image: ^3.3.0
  flutter_secure_storage: ^9.0.0
  connectivity_plus: ^5.0.2
  video_player: ^2.7.2
dev_dependencies:
  faker: ^2.1.0
  flutter_test:
    sdk: flutter
`;

const GOOD_DART = `
import 'package:flutter/foundation.dart';

const String baseUrl = 'https://api.acme.com/api/';

class DioClient {
  Dio build() {
    final dio = Dio();
    dio.interceptors.add(DioCacheInterceptor(options: CacheOptions(store: HiveCacheStore(dir))));
    if (kDebugMode) {
      dio.interceptors.add(PrettyDioLogger(requestBody: true));
    }
    return dio;
  }
  Future<String?> token() => const FlutterSecureStorage().read(key: 'access_token');
}

class Downloader {
  Future<void> request() async {
    final result = await Connectivity().checkConnectivity();
    if (!allowMobileData && result == ConnectivityResult.mobile) return;
    await download();
  }
}

class Player {
  void play() {
    final c = VideoPlayerController.networkUrl(Uri.parse('https://cdn.acme.com/master.m3u8'));
  }
}

class Ui extends StatelessWidget {
  Widget build(BuildContext context) {
    return Column(children: [
      Semantics(label: 'Play episode', child: ElevatedButton(onPressed: play, child: Icon(Icons.play_arrow))),
      IconButton(onPressed: share, icon: Icon(Icons.share), tooltip: 'Share', semanticLabel: 'Share episode'),
      CachedNetworkImage(imageUrl: thumb),
    ]);
  }
}
`;

const goodApp = () =>
  snapshot(
    {
      "pubspec.yaml": GOOD_PUBSPEC,
      "pubspec.lock": "packages:\n  dio:\n    version: \"5.3.3\"",
      "analysis_options.yaml": "include: package:flutter_lints/flutter.yaml",
      "android/app/src/main/AndroidManifest.xml":
        '<manifest><application android:label="Acme" /></manifest>',
      "android/app/build.gradle":
        "android { compileSdk 36\n defaultConfig { minSdk 25 targetSdk 35 }\n buildTypes { release { minifyEnabled true\n shrinkResources true } } }",
      ".fvm/fvm_config.json": '{"flutterSdkVersion": "3.32.8"}',
      "lib/core/client/dio_client.dart": GOOD_DART,
    },
    ["test/auth_test.dart", "test/feed_test.dart", "test/player_test.dart"],
  );

// ─────────────────────────────────────────────────────────────────────────────

describe("Flutter checks — fire on the defect", () => {
  const checks = evaluateFlutterChecks(badApp());

  it("catches a non-production API host selected by commenting out source", () => {
    // The headline finding: the branch that ships had staging active and production
    // commented out, across all generated services.
    expect(statusOf(checks, "flutter_env_baseurl")).toBe("FAIL");
    const detail = checks.find((c) => c.checkKey === "flutter_env_baseurl")?.detail ?? "";
    expect(detail).toMatch(/staging/i);
    expect(detail).toMatch(/dart-define|flavor/i);
  });

  it("catches cleartext HTTP and unguarded logging", () => {
    expect(statusOf(checks, "flutter_cleartext_traffic")).toBe("FAIL");
    expect(statusOf(checks, "flutter_release_logging")).toBe("FAIL");
    expect(statusOf(checks, "flutter_dev_endpoints")).toBe("WARN");
  });

  it("catches tokens in SharedPreferences while secure storage holds the password", () => {
    expect(statusOf(checks, "flutter_token_storage")).toBe("FAIL");
    expect(statusOf(checks, "flutter_password_retention")).toBe("FAIL");
    // The detail must name the inversion — that's the actionable part.
    const detail = checks.find((c) => c.checkKey === "flutter_token_storage")?.detail ?? "";
    expect(detail).toMatch(/ALREADY a dependency|already/i);
  });

  it("catches the Play-store shipping gates", () => {
    // targetSdk 33 is below Play's floor — an upload is rejected outright.
    expect(statusOf(checks, "flutter_target_sdk")).toBe("FAIL");
    expect(statusOf(checks, "flutter_sdk_currency")).toBe("WARN");
    expect(statusOf(checks, "flutter_release_shrinking")).toBe("WARN");
    expect(statusOf(checks, "flutter_firebase_config_committed")).toBe("WARN");
  });

  it("catches the low-data causes, including a commented-out cellular guard", () => {
    // The distinctive one: the guard exists in source but is commented out, so the
    // shipped app ignores the user's mobile-data setting.
    expect(statusOf(checks, "flutter_metered_network")).toBe("FAIL");
    const metered = checks.find((c) => c.checkKey === "flutter_metered_network")?.detail ?? "";
    expect(metered).toMatch(/COMMENTED OUT/i);

    expect(statusOf(checks, "flutter_adaptive_streaming")).toBe("FAIL");
    expect(statusOf(checks, "flutter_response_cache")).toBe("WARN");
    expect(statusOf(checks, "flutter_image_cache")).toBe("WARN");
  });

  it("catches the quality gaps", () => {
    // One generated widget_test.dart is not a test suite, and it makes the repo
    // look like it has one.
    expect(statusOf(checks, "flutter_test_coverage")).toBe("FAIL");
    expect(statusOf(checks, "flutter_dependency_pinning")).toBe("FAIL");
    expect(statusOf(checks, "flutter_unpinned_git_dep")).toBe("WARN");
    expect(statusOf(checks, "flutter_dev_deps_in_prod")).toBe("WARN");
    expect(statusOf(checks, "flutter_analyzer_lints")).toBe("FAIL");
    expect(statusOf(checks, "flutter_semantics")).toBe("FAIL");
    expect(statusOf(checks, "flutter_commented_features")).toBe("WARN");
  });
});

describe("Flutter checks — stay quiet on the fix", () => {
  const checks = evaluateFlutterChecks(goodApp());

  it("reports no failures at all for a correctly-built app", () => {
    expect(checks.filter((c) => c.status === "FAIL").map((c) => c.checkKey)).toEqual([]);
  });

  it("credits what is done right", () => {
    for (const key of [
      "flutter_env_baseurl",
      "flutter_cleartext_traffic",
      "flutter_release_logging",
      "flutter_token_storage",
      "flutter_password_retention",
      "flutter_target_sdk",
      "flutter_sdk_currency",
      "flutter_release_shrinking",
      "flutter_response_cache",
      "flutter_image_cache",
      "flutter_adaptive_streaming",
      "flutter_metered_network",
      "flutter_dependency_pinning",
      "flutter_dev_deps_in_prod",
      "flutter_analyzer_lints",
      "flutter_semantics",
      "flutter_commented_features",
    ]) {
      expect(statusOf(checks, key), `${key} should PASS on the fixed app`).toBe("PASS");
    }
  });
});

describe("metered-network check distinguishes partial from total disablement", () => {
  const withDart = (dart: string) =>
    evaluateFlutterChecks(snapshot({ "pubspec.yaml": "name: a\ndependencies:\n  video_player: ^2.7.2", "lib/downloader.dart": dart }));

  it("warns when guards exist in some paths but are commented out in others", () => {
    // The real case: the download path's guard was disabled while another screen
    // kept one, so a "commented AND no live guard" rule reported PASS and the
    // actual cause of the data complaint stayed hidden.
    const checks = withDart(`
      class A { void x() { if (!allow && r == ConnectivityResult.mobile) return; } }
      class B { void y() {
        // if (!isMobileData && r == ConnectivityResult.mobile) return;
      } }
    `);
    expect(statusOf(checks, "flutter_metered_network")).toBe("WARN");
    expect(checks.find((c) => c.checkKey === "flutter_metered_network")?.detail).toMatch(/partial/i);
  });

  it("fails when every guard is commented out", () => {
    const checks = withDart(`
      class B { void y() {
        // if (!isMobileData && r == ConnectivityResult.mobile) return;
      } }
    `);
    expect(statusOf(checks, "flutter_metered_network")).toBe("FAIL");
  });
});

describe("Flutter env check nuance", () => {
  const withConstants = (dart: string) =>
    evaluateFlutterChecks(snapshot({ "pubspec.yaml": "name: a", "lib/constants.dart": dart }));

  it("warns — not fails — when production is active but alternatives are commented beside it", () => {
    // Still a real finding: the environment is chosen by editing source, which is how
    // a staging URL ships. But it isn't currently pointed at the wrong host.
    const checks = withConstants(
      "const String baseUrl = 'https://api.acme.com/api/';\n// const String baseUrl = 'https://staging.acme.com/api/';",
    );
    expect(statusOf(checks, "flutter_env_baseurl")).toBe("WARN");
  });

  it("passes a single production constant with no commented alternatives", () => {
    expect(statusOf(withConstants("const String baseUrl = 'https://api.acme.com/api/';"), "flutter_env_baseurl")).toBe("PASS");
  });

  it("skips rather than guessing when no baseUrl constant exists", () => {
    expect(statusOf(withConstants("const String title = 'Acme';"), "flutter_env_baseurl")).toBe("SKIPPED");
  });

  it("does not mistake a commented-out URL for the active one", () => {
    // stripCStyleComments must remove the commented lines before the active
    // declaration is matched, or the first (commented) host wins.
    const checks = withConstants(
      "// const String baseUrl = 'https://staging.acme.com/api/';\nconst String baseUrl = 'https://api.acme.com/api/';",
    );
    const detail = checks.find((c) => c.checkKey === "flutter_env_baseurl")?.detail ?? "";
    expect(detail).toContain("https://api.acme.com/api/");
    expect(statusOf(checks, "flutter_env_baseurl")).toBe("WARN");
  });
});
