import { describe, it, expect } from "vitest";
import { evaluateFlutterChecks } from "../flutter-app";
import type { RepoSnapshot } from "../native-mobile";

// Audit fixes for flutter-app.ts, each tested on both sides: the input the fix
// was for must change, and a representative input it must not touch keeps its
// old verdict. Fixtures modelled on immich-app/immich and the Fellas review.

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

const at = (files: Record<string, string>, key: string, extraPaths: string[] = []) => {
  const c = evaluateFlutterChecks(snapshot(files, extraPaths)).find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

const PUBSPEC = "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n";
const MAIN = { "pubspec.yaml": PUBSPEC, "lib/main.dart": "void main() => runApp(const App());\n" };

describe("flutter_analyzer_lints", () => {
  it("is INCONCLUSIVE, not FAIL, when analysis_options.yaml is in the tree but was not read", () => {
    const c = at(MAIN, "flutter_analyzer_lints", ["analysis_options.yaml"]);
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).not.toMatch(/^No analysis_options\.yaml/);
  });

  it("still FAILs when there is no analysis_options.yaml at all", () => {
    expect(at(MAIN, "flutter_analyzer_lints").status).toBe("FAIL");
  });

  it("still FAILs when the only analysis_options.yaml is vendored", () => {
    expect(at(MAIN, "flutter_analyzer_lints", ["vendor/pkg/analysis_options.yaml"]).status).toBe("FAIL");
  });

  it("still PASSes a read file that includes flutter_lints", () => {
    const c = at({ ...MAIN, "analysis_options.yaml": "include: package:flutter_lints/flutter.yaml\n" }, "flutter_analyzer_lints");
    expect(c.status).toBe("PASS");
  });
});

describe("flutter_token_storage", () => {
  it("does not claim there is no secure storage package when pubspec.yaml was not read", () => {
    const c = at({ "lib/main.dart": "void main() => runApp(const App());\n" }, "flutter_token_storage", ["pubspec.yaml"]);
    expect(c.detail).toMatch(/pubspec\.yaml could not be read/);
    expect(c.detail).not.toMatch(/^No secure storage package/);
  });

  it("keeps the original wording when pubspec.yaml was read", () => {
    expect(at(MAIN, "flutter_token_storage").detail).toMatch(/^No secure storage package/);
  });
});

describe("flutter_release_shrinking", () => {
  const PLUGIN_GRADLE = `plugins {
    id "com.android.application"
    id "dev.flutter.flutter-gradle-plugin"
}
android { buildTypes { release { signingConfig signingConfigs.release } } }
`;

  it("PASSes a module that applies the Flutter Gradle plugin (it shrinks release by default)", () => {
    expect(at({ ...MAIN, "android/app/build.gradle": PLUGIN_GRADLE }, "flutter_release_shrinking").status).toBe("PASS");
  });

  it("still WARNs when the module explicitly sets minifyEnabled false", () => {
    const gradle = PLUGIN_GRADLE.replace("signingConfig signingConfigs.release", "minifyEnabled false");
    expect(at({ ...MAIN, "android/app/build.gradle": gradle }, "flutter_release_shrinking").status).toBe("WARN");
  });

  it("still WARNs with no Flutter plugin and no shrink setting", () => {
    const gradle = `android { buildTypes { release { signingConfig signingConfigs.release } } }\n`;
    expect(at({ ...MAIN, "android/app/build.gradle": gradle }, "flutter_release_shrinking").status).toBe("WARN");
  });
});

describe("flutter_metered_network", () => {
  it("PASSes immich-style backup gating on useCellularForPhotos / NetworkCapability.unmetered", () => {
    const c = at(
      {
        ...MAIN,
        "lib/services/backup.dart": `import 'package:connectivity_plus/connectivity_plus.dart';
Future<bool> canBackup(Settings s, Set<NetworkCapability> caps) async {
  if (!s.useCellularForPhotos && !caps.contains(NetworkCapability.unmetered)) return false;
  return true;
}
`,
      },
      "flutter_metered_network",
    );
    expect(c.status).toBe("PASS");
  });

  it("still WARNs an online/offline-only connectivity check", () => {
    const c = at(
      {
        ...MAIN,
        "lib/services/net.dart": `final r = await Connectivity().checkConnectivity();
if (r == ConnectivityResult.none) showOffline();
`,
      },
      "flutter_metered_network",
    );
    expect(c.status).toBe("WARN");
  });

  it("does not let a commented-out useCellular line count as a guard", () => {
    const c = at(
      {
        ...MAIN,
        "lib/services/net.dart": `final r = await Connectivity().checkConnectivity();
// if (!settings.useCellularForVideos) return;
startDownload();
`,
      },
      "flutter_metered_network",
    );
    expect(c.status).not.toBe("PASS");
  });
});

describe("flutter_semantics wording", () => {
  it("says 'in the sampled source', not 'anywhere'", () => {
    const c = at(
      { ...MAIN, "lib/ui/bar.dart": "IconButton(icon: Icon(Icons.add), onPressed: add);\nIconButton(icon: Icon(Icons.close), onPressed: close);\n" },
      "flutter_semantics",
    );
    expect(c.detail).toMatch(/in the sampled source/);
    expect(c.detail).not.toMatch(/anywhere/);
  });
});

describe("flutter_commented_features", () => {
  const key = "flutter_commented_features";

  it("does not count a TODO that sits above live code (immich typedef)", () => {
    const c = at(
      {
        ...MAIN,
        "lib/services/store.dart": `class StoreService {
  // TODO: Temporary typedef to make minimal changes. Remove this and make the presentation layer access store through a provider
  static StoreService? _instance;
}
`,
      },
      key,
    );
    expect(c.status).toBe("PASS");
  });

  it("does not count a TODO followed by prose and then live code", () => {
    const c = at(
      {
        ...MAIN,
        "lib/a.dart": `// TODO: temporarily simplified until the new API lands.
// This keeps the old shape for now.
final x = compute();
`,
      },
      key,
    );
    expect(c.status).toBe("PASS");
  });

  it("still WARNs a TODO above commented-out code (Fellas)", () => {
    const c = at(
      {
        ...MAIN,
        "lib/download.dart": `// TODO: re-enable once data usage settings ship
// if (result == ConnectivityResult.mobile && !allowMobileData) return;
startDownload();
`,
      },
      key,
    );
    expect(c.status).toBe("WARN");
  });

  it("still WARNs a TODO above a commented-out `const String` declaration", () => {
    const c = at(
      { ...MAIN, "lib/env.dart": "// TODO: restore production\n// const String baseUrl = 'https://api.acme.com/';\nconst String baseUrl = 'https://staging';\n" },
      key,
    );
    expect(c.status).toBe("WARN");
  });

  it("still WARNs a two-line TODO above commented-out code", () => {
    const c = at(
      {
        ...MAIN,
        "lib/sync.dart": `// TODO: temporarily disabled, re-enable
// once backend ships v2.
// await sync.start();
`,
      },
      key,
    );
    expect(c.status).toBe("WARN");
  });
});
