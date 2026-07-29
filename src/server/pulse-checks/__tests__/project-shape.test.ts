import { describe, it, expect } from "vitest";
import {
  detectProjectShape,
  parsePackageManifest,
  applyShapeApplicability,
  shapeTechStack,
} from "../project-shape";
import { resolveSnapshotShape, selectShapeProbes } from "../native-repo";

// ─────────────────────────────────────────────────────────────────────────────
// Shape detection is where every new family either fires or silently does not,
// so the cases below are the ones that would misfile a real repo. Each is a
// LOOKALIKE: two shapes that share the artefact a naive detector would key on.
//
// The precedent is §34.2 — React Native and Flutter projects CONTAIN ios/ and
// android/ directories with real Info.plist files, so matching those naively made
// every RN app read as native iOS. The same trap exists three more times now:
// Electron, Tauri, CLI and plain web projects ALL look like "a directory with a
// package.json".
// ─────────────────────────────────────────────────────────────────────────────

const pkg = (o: Record<string, unknown>) => JSON.stringify(o);

describe("detectProjectShape — lookalikes", () => {
  it("identifies an Electron app by its dependency", () => {
    expect(detectProjectShape(["package.json", "src/main.ts"],
      pkg({ devDependencies: { electron: "^41.0.0" } }))).toBe("electron");
  });

  it("identifies an Electron app by its packager config alone", () => {
    // A monorepo can keep `electron` in a workspace package rather than the root.
    expect(detectProjectShape(["package.json", "electron-builder.yml"], pkg({}))).toBe("electron");
  });

  it("identifies a Tauri app even when its frontend looks like a plain Vite project", () => {
    // THE case this ordering exists for: a Tauri app's package.json usually
    // declares React/Vite and nothing that says "desktop".
    const paths = ["package.json", "vite.config.ts", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"];
    expect(detectProjectShape(paths, pkg({ dependencies: { react: "^19.0.0", vite: "^6.0.0" } }))).toBe("tauri");
  });

  it("does not misfile an Electron app as a CLI because its packager installs a bin", () => {
    // electron-builder and electron-forge both ship bins. Testing CLI-ness first
    // would grade a desktop app on npm publishing hygiene it has no use for.
    const shape = detectProjectShape(
      ["package.json", "src/main.ts"],
      pkg({ bin: { "my-app": "./cli.js" }, devDependencies: { electron: "^41.0.0" } }),
    );
    expect(shape).toBe("electron");
  });

  it("identifies a CLI by its bin entry", () => {
    expect(detectProjectShape(["package.json", "bin/cli.js"],
      pkg({ name: "my-tool", bin: { "my-tool": "bin/cli.js" } }))).toBe("cli");
  });

  it("does not treat a Next.js app as a CLI just because a framework ships a bin", () => {
    expect(detectProjectShape(["package.json", "next.config.js"],
      pkg({ bin: "./server.js", dependencies: { next: "^15.0.0" } }))).toBeNull();
  });

  it("does not treat a private package as a publishable CLI", () => {
    // A private package is never published, so publishing hygiene cannot apply.
    expect(detectProjectShape(["package.json"],
      pkg({ private: true, bin: { tool: "./cli.js" } }))).toBeNull();
  });

  it("returns null for a plain web service", () => {
    expect(detectProjectShape(["package.json", "src/index.ts"],
      pkg({ dependencies: { express: "^4.0.0" } }))).toBeNull();
  });

  it("survives a malformed package.json rather than throwing", () => {
    expect(parsePackageManifest("{ not json")).toBeNull();
    expect(detectProjectShape(["package.json"], "{ not json")).toBeNull();
  });
});

describe("resolveSnapshotShape — mobile wins, extensions are last", () => {
  const files = (o: Record<string, string>) => new Map(Object.entries(o));

  it("prefers Flutter over anything package.json says", () => {
    expect(resolveSnapshotShape(["pubspec.yaml", "package.json"],
      files({ "package.json": pkg({ devDependencies: { electron: "^41.0.0" } }) }))).toBe("flutter");
  });

  it("identifies a browser extension by manifest_version, not by filename", () => {
    // A PWA web app manifest shares this filename. Only the manifest_version key
    // makes it an extension — this is the guard from #469, now actually reachable.
    expect(resolveSnapshotShape(["manifest.json", "background.js"],
      files({ "manifest.json": '{"manifest_version":3,"name":"x"}' }))).toBe("chrome-extension");

    expect(resolveSnapshotShape(["manifest.json", "index.html"],
      files({ "manifest.json": '{"name":"My PWA","start_url":"/","icons":[]}' }))).toBe("none");
  });

  it("classifies an Electron app that also ships app.json as desktop, not React Native", () => {
    // detectNativePlatform reads app.json as an RN signal, so desktop must be
    // resolved first or an Electron app gets the mobile family.
    const paths = ["package.json", "app.json", "src/main.ts"];
    expect(resolveSnapshotShape(paths,
      files({ "package.json": pkg({ devDependencies: { electron: "^41.0.0" } }) }))).toBe("electron");
  });

  it("still identifies a genuine React Native app", () => {
    const paths = ["package.json", "metro.config.js", "ios/App/Info.plist", "android/build.gradle"];
    expect(resolveSnapshotShape(paths,
      files({ "package.json": pkg({ dependencies: { "react-native": "0.86.0" } }) }))).toBe("react-native");
  });

  it("costs nothing for a plain web repo", () => {
    expect(resolveSnapshotShape(["package.json", "src/app.ts"],
      files({ "package.json": pkg({ dependencies: { express: "^4.0.0" } }) }))).toBe("none");
  });
});

describe("selectShapeProbes — bounded and correctly ranked", () => {
  it("puts the root package.json first", () => {
    const probes = selectShapeProbes(["packages/a/package.json", "package.json", "packages/b/package.json"]);
    expect(probes[0]).toBe("package.json");
  });

  it("never probes a vendored manifest", () => {
    expect(selectShapeProbes(["node_modules/left-pad/package.json", "Pods/Lib/manifest.json"])).toEqual([]);
  });

  it("caps the probe count so a big monorepo cannot stampede the API", () => {
    const many = Array.from({ length: 200 }, (_, i) => `packages/p${i}/package.json`);
    expect(selectShapeProbes(many).length).toBeLessThanOrEqual(8);
  });
});

describe("shape applicability", () => {
  const generic = [
    { checkKey: "dockerfile_present", status: "FAIL", detail: "No Dockerfile." },
    { checkKey: "has_readme", status: "FAIL", detail: "No README." },
    { checkKey: "has_tests", status: "FAIL", detail: "No tests." },
    { checkKey: "has_linter", status: "FAIL", detail: "No linter." },
  ];

  it("skips server-shaped checks for a CLI but keeps tests and linting", () => {
    const byKey = new Map(applyShapeApplicability(generic, "cli").map((c) => [c.checkKey, c]));
    expect(byKey.get("dockerfile_present")!.status).toBe("SKIPPED");
    // A Node CLI keeps its tests and its linter in exactly the places the generic
    // checks look, so skipping those would hide real findings.
    expect(byKey.get("has_tests")!.status).toBe("FAIL");
    expect(byKey.get("has_linter")!.status).toBe("FAIL");
    expect(byKey.get("has_readme")!.status).toBe("FAIL");
  });

  it("is a no-op for a shape with no skip list", () => {
    expect(applyShapeApplicability(generic, null)).toEqual(generic);
  });

  it("labels the stack for each desktop framework", () => {
    expect(shapeTechStack("tauri", null, ["src-tauri/capabilities/main.json"])).toContain("Tauri v2");
    expect(shapeTechStack("electron", parsePackageManifest(pkg({ devDependencies: { "electron-builder": "^26" } })), []))
      .toContain("electron-builder");
  });
});
